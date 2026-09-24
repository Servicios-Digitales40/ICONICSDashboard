/**
 * Plantilla «Reporte de energías, flujo y electricidad» (Plan 44 F5),
 * transcrita de `docs/plantillas-reportes/energias.docx`.
 *
 * ── LOS kWh SON UNA ESTIMACIÓN, Y EL PDF LO DICE ────────────────────
 *
 * Esta planta no tiene medidor de energía. Lo que hay es la potencia que
 * publica el variador, y los kWh salen de integrarla (`integrarEnergia`, en
 * el dominio). El usuario aceptó ese camino el 23-09-2026 (§6.2 del plan)
 * **con la condición de declararlo**: la tarjeta dice «estimada, no medida»
 * y el pie de la sección explica con cuántos tramos se integró y cuántos
 * huecos quedaron fuera. Sin esa frase el número sería indistinguible de la
 * lectura de un contador.
 *
 * ── LO QUE LA MAQUETA PIDE Y ESTA MÁQUINA NO TIENE ──────────────────
 *
 * Flujo de agua (m³/h), consumo específico (kWh/m³), factor de potencia,
 * meta de consumo y ahorro potencial. Un motor con su variador no mide nada
 * de eso: harían falta un medidor de energía, uno de caudal o un tipo que
 * los declare. Cada sección sale con su motivo concreto —no con un genérico
 * «sin datos»— porque los motivos son distintos y se arreglan en sitios
 * distintos (D3).
 */
import { filaEstadistica, firmasDe, graficaDe, parrafosDeCierre } from './comun.mjs'
import { formatear } from '../recolectores.mjs'

export default {
  id: 'energias',
  folioPrefijo: 'ENE',
  disponible: true,
  portada: { arte: 'energias', disposicion: 'lateral' },
  /* Enciende la integración en el recolector. No cuesta ninguna lectura de
     más: la serie de potencia ya la pide `claves()`. */
  estimaEnergia: true,

  /** Las del variador con magnitud eléctrica: potencia, corriente, tensión, bus. */
  claves: ({ senales, metaDe }) =>
    senales.map((s) => s.clave).filter((k) => /^variador:(potencia|corriente|tensionSalida|busCC)$/.test(metaDe(k)?.rol ?? '')),

  /* Sin `idioma`: todo el texto de esta plantilla sale de `etq`, que ya viene
     en el idioma pedido. No hay nada que traducir aquí (ver HANDOFF §8: un
     `idioma` declarado y sin usar fue una vez una traducción a medias). */
  documento(d, { etq, entrada, ventana, generadoEl, explicacion, usuario }) {
    const t = etq.plantillas.energias
    const c = etq.plantillas.comun
    const series = [...d.series.values()]
    const energia = d.energia
    const potencia = energia?.clave ? d.series.get(energia.clave) : null

    /* El pie de la estimación sólo se escribe si hubo integración: sin ella
       la sección lleva su motivo, y explicar cómo se integró algo que no se
       integró sería ruido. */
    const horas = energia?.cubiertoMs ? (energia.cubiertoMs / 3_600_000).toFixed(1) : '0'
    const pieConsumo = energia?.kWh !== null && energia?.kWh !== undefined
      ? t.pieEstimacion({ tramos: energia.tramos, huecos: energia.huecos, horas })
      : null

    const ausenteConsumo = energia?.kWh === null || energia?.kWh === undefined
      ? (energia?.motivo === 'sinPotencia' ? t.sinPotencia : t.sinMuestrasPotencia(ventana.etiqueta))
      : null

    const tarjetas = []
    if (energia?.kWh !== null && energia?.kWh !== undefined) {
      tarjetas.push(
        { etiqueta: t.indicadores.energia, valor: formatear(energia.kWh, 1), unidad: 'kWh', sub: t.subEnergia, variacion: null },
        { etiqueta: t.indicadores.demanda, valor: formatear(potencia?.resumen?.maximo, 1), unidad: energia.unidad, sub: t.subDemanda, variacion: null },
        { etiqueta: t.indicadores.media, valor: formatear(potencia?.resumen?.promedio, 1), unidad: energia.unidad, sub: t.subMedia, variacion: null },
        { etiqueta: t.indicadores.cobertura, valor: `${horas} h`, unidad: null, sub: t.subCobertura, variacion: null },
      )
    }

    /* El balance: una fila por serie eléctrica leída, con su meta vacía —
       ninguna está declarada en esta máquina, y el pie lo dice. */
    const filasBalance = series.map((s) => {
      const fila = filaEstadistica(s, etq)
      return { ...fila, celdas: { ...fila.celdas, meta: t.sinMeta } }
    })

    return {
      titulo: t.titulo,
      lema: t.lema,
      instalacion: entrada.nombre,
      chips: [
        { etiqueta: c.chipSistema, valor: entrada.nombre },
        { etiqueta: c.chipPeriodo, valor: ventana.etiqueta },
        { etiqueta: c.chipGenerado, valor: generadoEl },
      ],
      generadoEl: null,
      secciones: [
        { id: 'consumo', titulo: t.secciones.consumo, bloque: 'indicadores',
          items: tarjetas,
          ...(tarjetas.length ? {} : { ausente: ausenteConsumo }) },

        /* El pie de la estimación va en su propio bloque de texto: el de
           `indicadores` no lleva pie, y esta frase no puede faltar. */
        ...(pieConsumo
          ? [{ id: 'consumo-nota', titulo: t.secciones.notaConsumo, bloque: 'texto', parrafos: [{ rotulo: c.metodo, texto: pieConsumo }] }]
          : []),

        { id: 'tendencia', titulo: t.secciones.tendencia, bloque: 'graficas',
          ...(series.length ? { items: series.map(graficaDe) } : { ausente: c.sinSeries(entrada.nombre) }) },

        { id: 'balance', titulo: t.secciones.balance, bloque: 'tabla',
          columnas: [
            { clave: 'variable', titulo: t.columnas.variable, ancho: 2.6 },
            { clave: 'minimo', titulo: t.columnas.minimo, align: 'right' },
            { clave: 'maximo', titulo: t.columnas.maximo, align: 'right' },
            /* «PROMEDIO» es la palabra más larga de la fila y no cabe en el
               ancho por omisión con siete columnas. */
            { clave: 'promedio', titulo: t.columnas.promedio, ancho: 1.4, align: 'right' },
            { clave: 'unidad', titulo: t.columnas.unidad },
            { clave: 'meta', titulo: t.columnas.meta, ancho: 1.6 },
            { clave: 'cobertura', titulo: t.columnas.cobertura, ancho: 1.4 },
          ],
          filas: filasBalance,
          pie: t.pieBalance,
          ...(filasBalance.length ? {} : { ausente: c.sinSeries(entrada.nombre) }) },

        /* Eficiencia: kWh/m³ necesita caudal, y PF necesita reactiva. Ni una
           ni otra existen aquí, y son dos carencias distintas. */
        { id: 'eficiencia', titulo: t.secciones.eficiencia, bloque: 'texto',
          parrafos: [
            { rotulo: c.carencia, texto: t.sinFlujo },
            { rotulo: c.carencia, texto: t.sinFactorPotencia },
          ] },

        { id: 'oportunidades', titulo: t.secciones.oportunidades, bloque: 'tabla',
          columnas: [
            { clave: 'variable', titulo: t.columnas.variable, ancho: 2 },
            { clave: 'estado', titulo: t.columnas.estado, ancho: 2 },
          ],
          filas: [],
          ausente: t.sinOportunidades },

        { id: 'conclusion', titulo: t.secciones.conclusion, bloque: 'texto',
          parrafos: parrafosDeCierre({
            sintesis: pieConsumo ?? ausenteConsumo ?? t.sinPotencia,
            explicacion,
            etq,
          }) },

        { id: 'firmas', titulo: t.secciones.firmas, bloque: 'firmas', items: firmasDe(etq, usuario) },
      ],
    }
  },
}
