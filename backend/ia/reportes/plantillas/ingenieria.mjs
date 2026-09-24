/**
 * Plantilla «Reporte de ingeniería» (Plan 44 F5), transcrita de
 * `docs/plantillas-reportes/ingenieria.docx`: resumen, indicadores, hallazgos
 * técnicos, evidencia, decisiones y plan de acción.
 *
 * ── LA PLANTILLA CON MENOS DATO PROPIO DE LAS OCHO ──────────────────
 *
 * La maqueta pide «avance por disciplina» (automatización 90 %, eléctrica
 * 78 %…), «pendientes», «objetivo del proyecto» y responsables con fecha.
 * Nada de eso sale de planta: son de gestión del proyecto, y ninguna máquina
 * configurada los declara ni los declarará. Se dibujan como campos a llenar
 * a mano y el pie de la sección lo dice (D3), en vez de inventar un 82 % de
 * avance que se leería como medido.
 *
 * Lo que SÍ hay es lo que el motor observa: cada regla del tipo que está
 * activa es un hallazgo técnico, con su consecuencia por impacto y su nivel
 * por prioridad. Ese es el mapeo honesto entre lo que la maqueta pide y lo
 * que esta instalación puede afirmar.
 */
import {
  firmasDe, graficaDe, nombreDeGrupo, parrafosDeCierre, rotuloDeEstado,
} from './comun.mjs'
import { recuentoDe } from '../recolectores.mjs'

export default {
  id: 'ingenieria',
  folioPrefijo: 'ING',
  disponible: true,
  portada: { arte: 'ingenieria', disposicion: 'lateral' },

  /** Las medidas con serie: la sección de evidencia dibuja sus tendencias. */
  claves: ({ medidas }) => medidas,

  documento(d, { etq, idioma, entrada, ventana, generadoEl, explicacion, usuario }) {
    const t = etq.plantillas.ingenieria
    const c = etq.plantillas.comun
    const activos = d.riesgos?.activos ?? []
    const series = [...d.series.values()]
    const recuento = recuentoDe(d.senales)

    const sintesis = c.resumen({
      nombre: entrada.nombre,
      periodo: ventana.etiqueta,
      conLectura: recuento.conLectura,
      total: recuento.total,
      estado: rotuloDeEstado(d.estado.estadoGeneral, idioma),
      activos: d.riesgos ? activos.length : null,
      noEvaluables: d.riesgos?.noEvaluables.length ?? 0,
    })

    /* El peor nivel activo es «el riesgo actual» de la maqueta. */
    const orden = ['critico', 'atencion', 'informativo']
    const peorNivel = orden.find((n) => activos.some((r) => r.nivel === n)) ?? null

    const tarjetas = [
      { etiqueta: t.indicadores.hallazgos, valor: String(activos.length), unidad: null, sub: t.subHallazgos, variacion: null },
      { etiqueta: t.indicadores.riesgo, valor: peorNivel ? (c.nivel[peorNivel] ?? peorNivel) : c.sinValor, unidad: null, sub: t.subRiesgo, variacion: null },
      { etiqueta: t.indicadores.sinLectura, valor: String(recuento.sinLectura), unidad: null, sub: t.subSinLectura, variacion: null },
      { etiqueta: t.indicadores.conSerie, valor: String(series.length), unidad: null, sub: t.subConSerie, variacion: null },
    ]

    /* Un hallazgo por riesgo activo: impacto = su consecuencia, prioridad =
       su nivel. Ninguno de los dos se inventa aquí. */
    const filasHallazgos = activos.map((r, i) => ({
      color: r.nivel,
      celdas: {
        numero: String(i + 1),
        hallazgo: r.titulo,
        punto: r.canal ? nombreDeGrupo(d.grupos, r.canal, idioma) : c.todaLaMaquina,
        impacto: r.consecuencia ?? null,
        prioridad: c.prioridad[r.nivel] ?? r.nivel,
      },
    }))

    const filasPlan = activos
      .filter((r) => r.accion)
      .map((r, i) => ({
        color: r.nivel,
        celdas: { numero: String(i + 1), accion: r.accion, responsable: null, fecha: null, estado: null },
      }))

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
        { id: 'resumen', titulo: t.secciones.resumen, bloque: 'texto',
          parrafos: [{ rotulo: c.sintesis, texto: sintesis }] },

        { id: 'indicadores', titulo: t.secciones.indicadores, bloque: 'indicadores', items: tarjetas },

        { id: 'hallazgos', titulo: t.secciones.hallazgos, bloque: 'tabla',
          columnas: [
            { clave: 'numero', titulo: t.columnas.numero, ancho: 0.6, align: 'right' },
            { clave: 'hallazgo', titulo: t.columnas.hallazgo, ancho: 2.4 },
            { clave: 'punto', titulo: t.columnas.punto, ancho: 1.5 },
            { clave: 'impacto', titulo: t.columnas.impacto, ancho: 3.4 },
            { clave: 'prioridad', titulo: t.columnas.prioridad, ancho: 1.2, estado: true },
          ],
          filas: filasHallazgos,
          pie: t.pieHallazgos,
          ...(filasHallazgos.length ? {} : { ausente: t.sinHallazgos }) },

        { id: 'evidencia', titulo: t.secciones.evidencia, bloque: 'graficas',
          ...(series.length ? { items: series.map(graficaDe) } : { ausente: c.sinSeries(entrada.nombre) }) },

        { id: 'decisiones', titulo: t.secciones.decisiones, bloque: 'texto',
          parrafos: parrafosDeCierre({ sintesis: t.decisionesSinCriterio, explicacion, etq }) },

        { id: 'plan', titulo: t.secciones.plan, bloque: 'tabla',
          columnas: [
            { clave: 'numero', titulo: t.columnas.numero, ancho: 0.6, align: 'right' },
            { clave: 'accion', titulo: t.columnas.accion, ancho: 3.8 },
            { clave: 'responsable', titulo: t.columnas.responsable, ancho: 1.5 },
            { clave: 'fecha', titulo: t.columnas.fecha, ancho: 1.2 },
            { clave: 'estado', titulo: t.columnas.estado, ancho: 1.2 },
          ],
          filas: filasPlan,
          pie: t.pieGestion,
          ...(filasPlan.length ? {} : { ausente: t.sinHallazgos }) },

        { id: 'firmas', titulo: t.secciones.firmas, bloque: 'firmas', items: firmasDe(etq, usuario) },
      ],
    }
  },
}
