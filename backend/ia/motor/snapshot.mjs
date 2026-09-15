/**
 * El snapshot de evidencia de un diagnóstico — Plan 28 F1.
 *
 * ── QUÉ PROBLEMA RESUELVE, Y POR QUÉ NO LO RESOLVÍA YA EL MOTOR ─────
 *
 * `diagnosticar()` es determinista en su ARITMÉTICA: mismas entradas, mismo
 * resultado, y así lo defiende la cabecera de `diagnostico.mjs` desde el Plan
 * 16. Pero no es reproducible en sus ENTRADAS: el mismo `{sistema, riesgoId}`
 * da otro resultado mañana si alguien sube un manual, cierra un caso o el
 * historiador gana una muestra. Las cuatro fuentes se consultan en vivo.
 *
 * Eso deja una pregunta sin responder: «¿por qué el sistema concluyó esto el
 * martes?». Hoy sólo se puede contestar volviendo a calcular, que es
 * exactamente lo que no vale — el corpus ya no es el de entonces.
 *
 * `diagnosticEventId` (Plan 17 F5) identifica el MOMENTO de pedir el
 * diagnóstico, pero no archiva nada: es un id sin cuerpo. Esto es el cuerpo.
 *
 * ── LO QUE ESTE MÓDULO NO HACE, Y ES LA MITAD DE SU DISEÑO ──────────
 *
 * **No cambia una sola cifra del cálculo.** Es observación de lo que YA
 * ocurría: las mismas búsquedas, los mismos fragmentos, las mismas series.
 * `diagnosticar()` devuelve exactamente las mismas `causas` con snapshot y sin
 * él, y hay una prueba que lo exige. Si alguna vez el snapshot empieza a
 * influir en el resultado, deja de ser un registro y pasa a ser una entrada —
 * y entonces habría que calibrarlo, que es justo lo que no queremos.
 *
 * **No escribe en disco.** Eso es la F2 (`lib/diarioDiagnosticos.mjs`). Aquí
 * sólo se construye la forma; quién la guarda y dónde es otra decisión, y
 * mezclarlas ataría el motor a un sistema de archivos que hoy no necesita
 * —`diagnosticar()` se prueba en Node sin tocar nada—.
 *
 * ── POR QUÉ REFERENCIAS Y NO CONTENIDO ──────────────────────────────
 *
 * De un fragmento de manual se guardan `archivo`, `pagina` y `hash`, no el
 * texto. De un caso, su `id` y su fecha, no lo que escribió el técnico. Dos
 * motivos:
 *
 *  1. El disco de la planta. Un diagnóstico cita hasta dos fragmentos por
 *     causa y puede haber cinco causas: guardar el texto multiplica por diez
 *     el tamaño de cada línea del diario, y por nada — el texto no cambia.
 *  2. El `hash` YA resuelve lo que importa. Es del CONTENIDO del fragmento
 *     (Plan 17 F5), así que si el PDF cambió desde que se citó, se nota al
 *     comparar. Guardar el texto sería tener dos copias de la misma verdad y
 *     un sitio más donde puedan discrepar.
 *
 * La excepción es `valoresSensores`: ahí SÍ se guarda el valor, porque una
 * lectura de un instante no está archivada en ningún otro sitio — el
 * historiador guarda su serie agregada, no el número exacto que vio esta
 * regla al dispararse.
 */
import { motivoDeCalidad } from '../../../shared/quality.js'

/**
 * La calidad de cada señal, por su clave, o `null` si no llegó ninguna.
 *
 * ── POR QUÉ ENTRA LA CALIDAD EN UN REGISTRO DE EVIDENCIA ────────────
 *
 * Porque «el nivel marcaba 12 %» y «el nivel marcaba 12 % y el sensor estaba
 * en mala calidad» son dos diagnósticos distintos, y hoy el segundo no se
 * puede distinguir del primero seis meses después. `motivoDeCalidad` ya
 * distingue cuatro situaciones (mala, incierta, sin entrega, desconocida) y
 * las tiene medidas contra el servidor real; aquí sólo se archivan.
 *
 * Es además el insumo de la F4: cuando la calidad pase a vetar el término
 * `datos`, el motivo del veto tiene que quedar escrito, no sólo aplicado.
 *
 * @param {object} [valoresSensores] `{clave: valor}` o `{clave: {valor, quality}}`
 */
export function calidadesDe(valoresSensores) {
  if (!valoresSensores) return null

  const salida = {}
  for (const [clave, bruto] of Object.entries(valoresSensores)) {
    /*
     * Se aceptan las dos formas porque hoy conviven: `regla.cuando(v)` recibe
     * un objeto plano de números —es lo que `evaluarRiesgos` le pasa— pero
     * quien lea de la frontera puede traer el `{valor, quality}` completo. Sin
     * `quality` no se inventa una: se dice que no consta, que es distinto de
     * decir que es buena.
     */
    const objeto = bruto && typeof bruto === 'object' ? bruto : null

    /*
     * La calidad llega de DOS formas y las dos se archivan igual (Plan 28 F4):
     * `quality` es el código crudo de OPC —lo que trae quien lee de la
     * frontera del backend— y `motivo` es esa misma calidad YA interpretada,
     * que es como viaja dentro de `createSenal` desde el Plan 21 F3. El
     * frontend no reenvía el código porque ya lo resolvió al recibirlo.
     */
    if (objeto && objeto.motivo != null) {
      const m = objeto.motivo
      salida[clave] = typeof m === 'object'
        ? { motivo: m.codigo, texto: m.texto, consta: true }
        : { motivo: m, consta: true }
      continue
    }
    // `motivo: null` explícito es calidad BUENA, no ausencia de dato: el
    // catálogo lo usa así, y confundirlo archivaría como «no consta» algo que
    // sí se midió.
    if (objeto && 'motivo' in objeto) {
      salida[clave] = { motivo: null, consta: true }
      continue
    }

    const quality = objeto ? objeto.quality : undefined
    if (quality === undefined) {
      salida[clave] = { motivo: null, consta: false }
      continue
    }
    const motivo = motivoDeCalidad(quality)
    salida[clave] = motivo
      ? { motivo: motivo.codigo, texto: motivo.texto, consta: true }
      : { motivo: null, consta: true }
  }
  return salida
}

/** El valor desnudo de una señal, venga como número o como `{valor}`. */
function valorDe(bruto) {
  return bruto && typeof bruto === 'object' ? bruto.valor ?? null : bruto ?? null
}

/**
 * Construye el snapshot de un diagnóstico ya resuelto.
 *
 * Recibe lo que el motor YA tiene en la mano al terminar —no vuelve a
 * consultar nada—, que es lo que garantiza que no puede alterar el resultado
 * ni añadir latencia.
 *
 * @param {object} args
 * @param {string} args.diagnosticEventId
 * @param {string} args.sistema
 * @param {string} args.riesgoId
 * @param {object} [args.valoresSensores]
 * @param {object[]} args.causas        las ya calculadas, con `manualCitado`/`casosCitados`
 * @param {string[]} [args.fuentesCaidas] nombres de las fuentes que fallaron (F3)
 * @param {Date}   [args.momento]
 */
export function construirSnapshot({
  diagnosticEventId,
  sistema,
  riesgoId,
  valoresSensores,
  causas = [],
  fuentesCaidas = [],
  momento = new Date(),
}) {
  /*
   * Los fragmentos y los casos se recogen de TODAS las causas y se
   * deduplican: dos causas del mismo riesgo citan a menudo el mismo trozo de
   * manual, y archivarlo dos veces no añade nada que auditar.
   *
   * La clave de deduplicación lleva el `hash` además de archivo y página
   * porque es lo que distingue dos trozos de la MISMA página — que es
   * precisamente para lo que existe ese hash (ver `manualCitado` en
   * `diagnostico.mjs`).
   */
  const fragmentos = new Map()
  const casos = new Map()

  for (const causa of causas) {
    for (const f of causa.manualCitado ?? []) {
      fragmentos.set(`${f.archivo}|${f.pagina}|${f.hash ?? ''}`, {
        archivo: f.archivo, pagina: f.pagina, hash: f.hash ?? null,
      })
    }
    for (const c of causa.casosCitados ?? []) {
      casos.set(c.id, { id: c.id, fecha: c.fecha ?? null, resuelto: c.resuelto ?? null })
    }
  }

  const valores = valoresSensores
    ? Object.fromEntries(Object.entries(valoresSensores).map(([k, v]) => [k, valorDe(v)]))
    : null

  return {
    diagnosticEventId,
    momento: momento.toISOString(),
    sistema,
    riesgoId,
    valoresSensores: valores,
    calidades: calidadesDe(valoresSensores),
    fragmentosManual: [...fragmentos.values()],
    casosConsultados: [...casos.values()],
    fuentesCaidas,
  }
}
