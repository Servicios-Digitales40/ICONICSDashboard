/**
 * backend/ia/herramientas/lib/limites.mjs
 * ------------------------------------------------------------------
 * Cruzar lo MEDIDO con lo DOCUMENTADO: qué lecturas de ICONICS se pasan de un
 * límite que dice un manual, y por cuánto.
 *
 * ── POR QUÉ LA RESTA LA HACE ESTE ARCHIVO ──────────────────────────
 *
 * Porque el modelo tiene prohibido hacer aritmética en todo lo demás de esta
 * capa, y aquí no iba a ser la excepción. Si el manual dice «máximo 150 V» y
 * la tensión marcó 203 V a las 14:32, los 53 V de exceso los calcula el
 * código y viajan ya hechos en la respuesta.
 *
 * ── LO QUE NUNCA SE DA POR BUENO ───────────────────────────────────
 *
 * Que las unidades coincidan. `unidadesCoinciden` viaja en cada exceso y puede
 * ser `false`: un límite documentado en bar contra una lectura en kPa no es
 * una comparación, es una coincidencia numérica. Se informa en vez de
 * descartarlo o de fingir que cuadra, porque quien lee la respuesta —una
 * persona— sí sabe si el manual y el sensor hablan de lo mismo.
 *
 * Es una función pura: recibe el estado ya leído, las historias y los
 * fragmentos de documentación, y no habla con nadie. Por eso vive en `lib/` y
 * no dentro de la familia de documentación, aunque hoy sólo la use
 * `diagnostico`.
 */
/**
 * El exceso medido sobre un límite documentado, con fecha — la pieza que
 * `diagnostico` calcula para no dejarle esa resta al modelo. Ver su cabecera.
 *
 * Cruza los CANDIDATOS de `limites_del_manual` con dos fuentes de medida
 * distintas, según la señal tenga historia o no:
 *
 *  - **Con historia** (`historiasOk`): el extremo con su hora, de
 *    `resumirSerie`. Es la fuente preferida, porque data el momento exacto.
 *  - **Sin historia** (tres de las ocho, `estado.leidoA`): el valor de la
 *    lectura en vivo. Es el único dato que existe para ellas —«el pico de
 *    200 V» de la tensión de línea no se puede leer del historiador porque
 *    no tiene serie propia (Plan 14 §0.4)—, así que sin esto `diagnostico`
 *    no podría decir nada del escenario que motivó esta fase.
 *
 * No exige que la unidad coincida —el manual y el catálogo de ICONICS a
 * veces no usan la misma— pero lo dice en el resultado (`unidadesCoinciden`)
 * en vez de fingir que casan, para que el modelo lo cite con la cautela
 * debida.
 *
 * SÓLO se calcula el exceso para las palabras SIN AMBIGÜEDAD de dirección:
 * «máximo» y «no debe exceder» son candidato a MÁXIMO, «mínimo» a MÍNIMO.
 * Las demás —«límite», «rango admisible», «admisible», «hasta»— quedan
 * FUERA del cálculo a propósito: «rango admisible de 100 V a 132 V» captura
 * el 100, que es el SUELO del rango, y tratarlo como techo diría que 121 V
 * excede un «máximo» de 100 que en realidad es el mínimo del mismo rango.
 * Esas palabras siguen viajando en `documentacion.candidatos` para que el
 * modelo las lea, sólo no alimentan la resta automática.
 */
export function compararConLimites(estado, historiasOk, documentacionOk) {
  const candidatosPorClave = new Map(documentacionOk.map(d => [d.clave, d.resultado.candidatos ?? []]))
  const historiaPorClave = new Map(historiasOk.map(h => [h.clave, h.resultado]))
  const senalesActuales = estado?.ok
    ? new Map(estado.activos.flatMap(a => a.senales).map(s => [s.clave, s]))
    : new Map()

  const registrar = (excesos, { senal, valor, unidad, cuando, fuente, c }) => {
    const esMinimo = /^m[íi]nim/.test(c.palabraLimite)
    const esMaximo = /^m[áa]xim/.test(c.palabraLimite) || c.palabraLimite === 'no debe exceder'
    if (!esMinimo && !esMaximo) return
    const unidadesCoinciden = Boolean(c.unidad && unidad && c.unidad === String(unidad).toLowerCase())
    if (typeof valor !== 'number') return

    if (esMaximo && valor > c.valor) {
      excesos.push({
        senal, tipo: 'por encima del máximo documentado', fuente,
        medido: valor, cuando, limiteDocumentado: c.valor,
        exceso: +(valor - c.valor).toFixed(2),
        unidadMedida: unidad, unidadDocumento: c.unidad, unidadesCoinciden,
        documento: c.documento, pagina: c.pagina,
      })
    }
    if (esMinimo && valor < c.valor) {
      excesos.push({
        senal, tipo: 'por debajo del mínimo documentado', fuente,
        medido: valor, cuando, limiteDocumentado: c.valor,
        exceso: +(c.valor - valor).toFixed(2),
        unidadMedida: unidad, unidadDocumento: c.unidad, unidadesCoinciden,
        documento: c.documento, pagina: c.pagina,
      })
    }
  }

  const excesos = []
  for (const [clave, candidatos] of candidatosPorClave) {
    if (!candidatos.length) continue

    const historia = historiaPorClave.get(clave)
    for (const c of candidatos) {
      if (historia) {
        registrar(excesos, { senal: historia.senal, valor: historia.maximo, unidad: historia.unidad, cuando: historia.maximoEn, fuente: 'historiador', c })
        registrar(excesos, { senal: historia.senal, valor: historia.minimo, unidad: historia.unidad, cuando: historia.minimoEn, fuente: 'historiador', c })
        continue
      }

      // Sin historia: se compara el valor ACTUAL, con la hora de la lectura
      // en vivo en vez de una fecha del historiador.
      const actual = senalesActuales.get(clave)
      if (!actual) continue
      registrar(excesos, { senal: actual.senal, valor: actual.valor, unidad: actual.unidad, cuando: estado.leidoA, fuente: 'lectura en vivo', c })
    }
  }

  // Mismo tope que las coincidencias de correlacionar_senales: seis bastan
  // para ver que hay un patrón sin llenar el contexto de repeticiones.
  return excesos.slice(0, 6)
}
