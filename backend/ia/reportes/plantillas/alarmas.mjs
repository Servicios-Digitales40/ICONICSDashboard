/**
 * Plantilla «Reporte de alarmas» (Plan 44 F4), transcrita de
 * `docs/plantillas-reportes/alarmas.docx`: resumen por severidad, eventos
 * recientes, distribución por intervalo, análisis de causa y plan de acción.
 *
 * ── LA SEVERIDAD NO LA PUBLICA EL SERVIDOR ──────────────────────────
 *
 * ICONICS entrega un booleano por señal, no una prioridad. La maqueta pide
 * cuatro niveles (crítica, alta, media, baja) y aquí se derivan TRES del rol
 * de cada señal en el tipo (`severidadDeRol`, en los recolectores). No hay
 * «baja»: inventar un cuarto nivel para que la fila de tarjetas cuadre con
 * el ejemplo sería exactamente lo que D3 prohíbe. El pie de la sección
 * declara de dónde sale cada severidad.
 *
 * ── SIN EVENTOS NO ES LO MISMO QUE SIN DATO ─────────────────────────
 *
 * Si ninguna señal cambió de estado en el período, la sección lo dice con
 * esas palabras: es una medida, no un hueco. Distinto de que ninguna tenga
 * serie verificada, que es una limitación del historiador y se dice aparte.
 * Hoy en la máquina de vibraciones pasa lo segundo para casi todas.
 */
import { firmasDe, nombreDeGrupo, parrafosDeCierre } from './comun.mjs'
import { distribuirEventos, severidadDeRol } from '../recolectores.mjs'

/** La hora de un instante, corta, en el idioma del reporte. */
const hora = (d, idioma) =>
  d.toLocaleString(idioma === 'en' ? 'en-US' : 'es-MX', { dateStyle: 'short', timeStyle: 'short' })

export default {
  id: 'alarmas',
  folioPrefijo: 'AL',
  disponible: true,
  portada: { arte: 'alarmas', disposicion: 'lateral' },
  /* Enciende la lectura de flancos: una serie por señal de alarma. */
  observaEventos: true,

  /** Sin gráficas de tendencia: la distribución es una tabla de recuentos. */
  claves: () => [],

  documento(d, { etq, idioma, entrada, ventana, generadoEl, explicacion, usuario }) {
    const t = etq.plantillas.alarmas
    const c = etq.plantillas.comun
    const activas = d.banderas?.activas ?? []
    const eventos = d.eventos?.eventos ?? []

    /* El recuento de ahora, por severidad derivada del rol. */
    const porSeveridad = { critica: 0, alta: 0, media: 0 }
    for (const a of activas) porSeveridad[severidadDeRol(a.rol)] += 1
    const total = activas.length

    const resumen = total
      ? t.recuento({ criticas: porSeveridad.critica, altas: porSeveridad.alta, medias: porSeveridad.media, total })
      : t.sinActivas

    const tarjetas = [
      { etiqueta: t.severidad.critica, valor: String(porSeveridad.critica), unidad: null, sub: t.activa, variacion: null },
      { etiqueta: t.severidad.alta, valor: String(porSeveridad.alta), unidad: null, sub: t.activa, variacion: null },
      { etiqueta: t.severidad.media, valor: String(porSeveridad.media), unidad: null, sub: t.activa, variacion: null },
    ]

    const filasEventos = eventos.map((e) => ({
      color: e.severidad === 'critica' ? 'critico' : e.severidad === 'alta' ? 'atencion' : null,
      celdas: {
        cuando: hora(e.inicio, idioma),
        senal: e.label,
        punto: e.grupo ? nombreDeGrupo(d.grupos, e.grupo, idioma) : c.todaLaMaquina,
        severidad: t.severidad[e.severidad] ?? e.severidad,
        evento: e.activa ? t.subida : t.bajada,
        estado: e.activa ? t.activa : (e.fin ? hora(e.fin, idioma) : null),
      },
    }))

    /* Por qué no hay eventos: sin serie es una limitación; sin flancos, una
       medida. Son dos frases distintas a propósito. */
    const ausenteEventos = d.eventos?.conSerie
      ? t.sinEventos(ventana.etiqueta)
      : t.sinSerieEventos

    const tramos = distribuirEventos(eventos, ventana)
    const filasDistribucion = tramos.map((tr) => ({
      celdas: {
        intervalo: `${hora(tr.desde, idioma)} — ${hora(tr.hasta, idioma)}`,
        ocurrencias: String(tr.ocurrencias),
      },
    }))

    /* Causa: por cada señal de alarma activa, los riesgos del motor de su
       mismo punto. Es el motor quien explica, no el modelo. */
    const filasCausa = activas.map((a) => {
      const delPunto = (d.riesgos?.activos ?? []).filter((r) => (r.canal ?? null) === (a.canal ?? null))
      return {
        color: delPunto[0]?.nivel ?? null,
        celdas: {
          senal: a.label,
          punto: a.canal ? nombreDeGrupo(d.grupos, a.canal, idioma) : c.todaLaMaquina,
          causa: delPunto.map((r) => r.titulo).join('; ') || null,
          evidencia: delPunto.map((r) => r.evidencia).join(' ') || null,
          accion: delPunto.map((r) => r.accion).filter(Boolean).join(' ') || null,
        },
      }
    })

    const filasAcciones = (d.riesgos?.activos ?? [])
      .filter((r) => r.accion)
      .map((r, i) => ({
        color: r.nivel,
        celdas: { numero: String(i + 1), accion: r.accion, responsable: null, fecha: null },
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
        { id: 'resumen', titulo: t.secciones.resumen, bloque: 'indicadores', items: tarjetas },
        /* La síntesis la escribe el código; la interpretación que pide la
           maqueta es la `explicacion` del modelo, rotulada como suya. */
        { id: 'resumen-texto', titulo: t.secciones.interpretacion, bloque: 'texto',
          parrafos: parrafosDeCierre({ sintesis: `${resumen} ${t.pieSeveridad}`, explicacion, etq }) },

        { id: 'eventos', titulo: t.secciones.eventos, bloque: 'tabla',
          columnas: [
            { clave: 'cuando', titulo: t.columnas.cuando, ancho: 1.4 },
            { clave: 'senal', titulo: t.columnas.senal, ancho: 2 },
            { clave: 'punto', titulo: t.columnas.punto, ancho: 1.4 },
            /* «SEVERIDAD» es el título más largo de la tabla y se medía por
               su contenido («Crítica»), que es más corto: se corta el título. */
            { clave: 'severidad', titulo: t.columnas.severidad, ancho: 1.5, estado: true },
            { clave: 'evento', titulo: t.columnas.evento, ancho: 1.1 },
            { clave: 'estado', titulo: t.columnas.estado, ancho: 1.4 },
          ],
          filas: filasEventos,
          ...(filasEventos.length ? {} : { ausente: ausenteEventos }) },

        { id: 'distribucion', titulo: t.secciones.distribucion, bloque: 'tabla',
          columnas: [
            { clave: 'intervalo', titulo: t.columnas.intervalo, ancho: 3 },
            { clave: 'ocurrencias', titulo: t.columnas.ocurrencias, ancho: 1, align: 'right' },
          ],
          filas: filasDistribucion,
          ...(filasDistribucion.length ? {} : { ausente: ausenteEventos }) },

        { id: 'causa', titulo: t.secciones.causa, bloque: 'tabla',
          columnas: [
            { clave: 'senal', titulo: t.columnas.senal, ancho: 1.8 },
            { clave: 'punto', titulo: t.columnas.punto, ancho: 1.5 },
            { clave: 'causa', titulo: t.columnas.causa, ancho: 2.2 },
            { clave: 'evidencia', titulo: t.columnas.evidencia, ancho: 3 },
            { clave: 'accion', titulo: t.columnas.accion, ancho: 2.2 },
          ],
          filas: filasCausa,
          ...(filasCausa.length ? {} : { ausente: t.sinActivas }) },

        { id: 'acciones', titulo: t.secciones.acciones, bloque: 'tabla',
          columnas: [
            { clave: 'numero', titulo: t.columnas.numero, ancho: 0.4, align: 'right' },
            { clave: 'accion', titulo: t.columnas.accion, ancho: 4 },
            { clave: 'responsable', titulo: t.columnas.responsable, ancho: 1.4 },
            { clave: 'fecha', titulo: t.columnas.fecha, ancho: 1.2 },
          ],
          filas: filasAcciones,
          pie: t.pieAcciones,
          ...(filasAcciones.length ? {} : { ausente: t.sinCausa }) },

        { id: 'firmas', titulo: t.secciones.firmas, bloque: 'firmas', items: firmasDe(etq, usuario) },
      ],
    }
  },
}
