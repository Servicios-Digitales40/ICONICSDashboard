/**
 * Plantilla «Reporte de predicciones de energía y fallas» (Plan 44 F5),
 * transcrita de `docs/plantillas-reportes/predicciones.docx`.
 *
 * ── ESCRITA ENTERA Y DELIBERADAMENTE APAGADA ────────────────────────
 *
 * `disponible: false`, y no porque falte trabajo: porque **no hay nada que
 * pronosticar**. Un pronóstico necesita que el TIPO de la máquina declare
 * sus mecanismos de desgaste —qué se degrada, con qué señal se mide y a qué
 * ritmo—, y toda configurada nace con `desgaste: null` (`construirSistema`).
 * Sin esa declaración, las cuatro tarjetas de la maqueta —probabilidad de
 * falla, confianza del modelo, horizonte, equipos— no tienen de dónde salir.
 *
 * El usuario decidió el 23-09-2026 (§6.3 del plan) **escribir la plantilla y
 * nada más**: sin recolector de pronóstico. Así que esto es el módulo
 * completo, listo para que el día que un tipo declare `desgaste` baste con
 * poner `disponible: true` y darle un recolector.
 *
 * ── POR QUÉ NO SE EMITE UN PDF CON LAS CASILLAS VACÍAS ──────────────
 *
 * Es la D12 del plan, y aquí es donde más importa. Las otras plantillas
 * dibujan sus ausencias porque el documento sigue diciendo algo verdadero:
 * el estado de la máquina, sus riesgos, sus series. Un reporte de
 * predicciones sin predicciones no dice nada verdadero — dice, por el hecho
 * de existir con ese membrete, que alguien pronosticó. Un PDF con
 * «probabilidad de falla: —» se archiva, se reenvía y a la tercera semana
 * alguien lo cita como si el modelo hubiera corrido y hubiera salido bien.
 *
 * `documento()` está escrito para el día que haya pronóstico. Hoy no se
 * llama nunca: la herramienta se niega antes, con el motivo en el idioma del
 * usuario, y ofrece los tipos que sí salen.
 */
import { firmasDe, graficaDe, parrafosDeCierre } from './comun.mjs'

export default {
  id: 'predicciones',
  folioPrefijo: 'PRE',
  disponible: false,
  portada: { arte: 'predicciones', disposicion: 'lateral' },

  /** El motivo que ve quien lo pide, en su idioma. */
  motivo: (etq) => etq.plantillas.pendientes.predicciones.motivo,

  /**
   * El esqueleto, para las pruebas que recorren las plantillas declaradas:
   * qué secciones lleva la maqueta y con qué bloque saldrían.
   */
  secciones: [
    { id: 'fallas', bloque: 'indicadores' },
    { id: 'equipos', bloque: 'tabla' },
    { id: 'consumo', bloque: 'graficas' },
    { id: 'variables', bloque: 'tabla' },
    { id: 'recomendaciones', bloque: 'texto' },
    { id: 'seguimiento', bloque: 'tabla' },
    { id: 'firmas', bloque: 'firmas' },
  ],

  /* Las medidas con serie: un pronóstico se dibuja sobre su historia. */
  claves: ({ medidas }) => medidas,

  /**
   * El documento, para cuando haya pronóstico que poner dentro.
   *
   * Espera en `d.pronostico` lo que devolvería un recolector futuro:
   * `{ mecanismos: [{id, titulo, probabilidad, horizonte, accion, confianza}],
   * variables: [{label, peso, comportamiento, observacion}] }`. Ese recolector
   * NO se escribe en este plan (§6.3), y por eso la plantilla está apagada.
   */
  /* Sin `idioma`: todo el texto de esta plantilla sale de `etq`, que ya viene
     en el idioma pedido. No hay nada que traducir aquí (ver HANDOFF §8: un
     `idioma` declarado y sin usar fue una vez una traducción a medias). */
  documento(d, { etq, entrada, ventana, generadoEl, explicacion, usuario }) {
    const t = etq.plantillas.predicciones
    const c = etq.plantillas.comun
    const p = d.pronostico ?? null
    const mecanismos = p?.mecanismos ?? []
    const series = [...d.series.values()]

    const tarjetas = mecanismos.length
      ? [
        { etiqueta: t.indicadores.probabilidad, valor: `${Math.round((mecanismos[0].probabilidad ?? 0) * 100)} %`, unidad: null, sub: mecanismos[0].horizonte ?? null, variacion: null },
        { etiqueta: t.indicadores.confianza, valor: p.confianza ? `${Math.round(p.confianza * 100)} %` : c.sinValor, unidad: null, sub: null, variacion: null },
        { etiqueta: t.indicadores.horizonte, valor: p.horizonte ?? c.sinValor, unidad: null, sub: null, variacion: null },
        { etiqueta: t.indicadores.equipos, valor: String(mecanismos.length), unidad: null, sub: null, variacion: null },
      ]
      : []

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
        { id: 'fallas', titulo: t.secciones.fallas, bloque: 'indicadores',
          items: tarjetas,
          ...(tarjetas.length ? {} : { ausente: t.sinMecanismos(entrada.nombre) }) },

        { id: 'equipos', titulo: t.secciones.equipos, bloque: 'tabla',
          columnas: [
            { clave: 'equipo', titulo: t.columnas.equipo, ancho: 1.8 },
            { clave: 'prediccion', titulo: t.columnas.prediccion, ancho: 2.2 },
            /* «PROBABILIDAD» es la palabra más larga de la tabla, y el valor
               que lleva («68 %») es de los más cortos: se mide por el título. */
            { clave: 'probabilidad', titulo: t.columnas.probabilidad, ancho: 1.8, align: 'right' },
            { clave: 'horizonte', titulo: t.columnas.horizonte, ancho: 1.2 },
            { clave: 'accion', titulo: t.columnas.accion, ancho: 2.2 },
          ],
          filas: mecanismos.map((m) => ({
            color: m.nivel ?? null,
            celdas: {
              equipo: m.titulo,
              prediccion: m.prediccion ?? null,
              probabilidad: m.probabilidad === null || m.probabilidad === undefined ? null : `${Math.round(m.probabilidad * 100)} %`,
              horizonte: m.horizonte ?? null,
              accion: m.accion ?? null,
            },
          })),
          ...(mecanismos.length ? {} : { ausente: t.sinMecanismos(entrada.nombre) }) },

        { id: 'consumo', titulo: t.secciones.consumo, bloque: 'graficas',
          ...(series.length ? { items: series.map(graficaDe) } : { ausente: c.sinSeries(entrada.nombre) }) },

        { id: 'variables', titulo: t.secciones.variables, bloque: 'tabla',
          columnas: [
            { clave: 'variable', titulo: t.columnas.variable, ancho: 2.4 },
            { clave: 'peso', titulo: t.columnas.peso, ancho: 1.2, align: 'right' },
            { clave: 'comportamiento', titulo: t.columnas.comportamiento, ancho: 2 },
            { clave: 'observacion', titulo: t.columnas.observacion, ancho: 3 },
          ],
          filas: (p?.variables ?? []).map((v) => ({
            celdas: { variable: v.label, peso: v.peso ?? null, comportamiento: v.comportamiento ?? null, observacion: v.observacion ?? null },
          })),
          ...(p?.variables?.length ? {} : { ausente: t.sinMecanismos(entrada.nombre) }) },

        { id: 'recomendaciones', titulo: t.secciones.recomendaciones, bloque: 'texto',
          parrafos: parrafosDeCierre({
            sintesis: mecanismos.length
              ? mecanismos.map((m) => m.accion).filter(Boolean).join(' ')
              : t.sinMecanismos(entrada.nombre),
            explicacion,
            etq,
          }) },

        { id: 'seguimiento', titulo: t.secciones.seguimiento, bloque: 'tabla',
          columnas: [
            { clave: 'numero', titulo: t.columnas.numero, ancho: 0.4, align: 'right' },
            { clave: 'accion', titulo: t.columnas.accion, ancho: 4 },
            { clave: 'responsable', titulo: t.columnas.responsable, ancho: 1.5 },
            { clave: 'fecha', titulo: t.columnas.fecha, ancho: 1.2 },
            { clave: 'estado', titulo: t.columnas.estado, ancho: 1.2 },
          ],
          filas: mecanismos.filter((m) => m.accion).map((m, i) => ({
            celdas: { numero: String(i + 1), accion: m.accion, responsable: null, fecha: null, estado: null },
          })),
          ...(mecanismos.length ? {} : { ausente: t.sinMecanismos(entrada.nombre) }) },

        { id: 'firmas', titulo: t.secciones.firmas, bloque: 'firmas', items: firmasDe(etq, usuario) },
      ],
    }
  },
}
