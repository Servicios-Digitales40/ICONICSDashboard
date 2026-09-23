/**
 * Plantilla «Reporte de vibraciones CMS» (Plan 44 F3), transcrita de
 * `docs/plantillas-reportes/vibraciones.docx`: estado general, puntos de
 * medición, espectro, tendencias RMS, diagnóstico y recomendaciones.
 *
 * ── LO QUE LA MAQUETA PIDE Y LA MÁQUINA NO TIENE (D3) ───────────────
 *
 * «Salud del equipo 87 %»: no existe un índice de salud en el dominio; va el
 * estado global con criterio (banda ISO). «Temperatura»: el tipo no la
 * instrumenta; se dice en una nota. «Axial / horizontal / vertical»: el
 * SM 1281 mide un eje por sensor; las columnas son las MEDIDAS del tipo.
 * «Espectro»: el módulo publica vigilancias del espectro, no el espectro; la
 * sección sale como ausencia con ese motivo.
 *
 * Pide medidas por familia de rol, así que sirve a cualquier tipo que mida
 * vibración por apoyo; a un tipo que no lo haga le dirá que no la mide.
 */
import {
  firmasDe, graficaDe, nombreDeGrupo, parrafosDeCierre, rotuloDeCanal, rotuloDeEstado, senalesDelGrupo,
} from './comun.mjs'
import { familiaDe, formatear, peorEstadoDe, recuentoDe } from '../recolectores.mjs'

/** Las claves de un rol de medida cuya clave de rol es `nombre` (vRMS, aRMS…), en el orden del estado. */
function clavesDeMedida(medidas, metaDe, nombre) {
  return medidas.filter((k) => metaDe(k)?.rol === `medida:${nombre}`)
}

export default {
  id: 'vibraciones',
  folioPrefijo: 'VIB',
  disponible: true,
  portada: { arte: 'vibraciones', disposicion: 'lateral' },

  /** Primero las velocidades eficaces (las que tienen norma), después las aceleraciones. */
  claves: ({ medidas, metaDe }) => [
    ...clavesDeMedida(medidas, metaDe, 'vRMS'),
    ...clavesDeMedida(medidas, metaDe, 'aRMS'),
    ...medidas,
  ],

  documento(d, { etq, idioma, entrada, tipo, ventana, generadoEl, explicacion }) {
    const t = etq.plantillas.vibraciones
    const c = etq.plantillas.comun
    const recuento = recuentoDe(d.senales)
    const estadoGlobal = rotuloDeEstado(d.estado.estadoGeneral, idioma)

    /* El vRMS máximo del período: la serie de velocidad eficaz con el mayor
       máximo, y el apoyo al que pertenece. Sin serie, la tarjeta lo dice. */
    const seriesV = [...d.series.values()].filter((s) => s.meta?.rol === 'medida:vRMS' && s.resumen)
    const mayor = seriesV.length ? seriesV.reduce((a, b) => (b.resumen.maximo > a.resumen.maximo ? b : a)) : null
    const senalMayor = mayor ? d.senales.find((s) => s.clave === mayor.clave) : null

    const apoyos = d.grupos.filter((g) => senalesDelGrupo(d.senales, g.id).some((s) => familiaDe(d.metaDe(s.clave)?.rol) === 'medida'))
    const medidasDelTipo = [...new Set(d.medidas.map((k) => d.metaDe(k)?.rol).filter(Boolean))]
    const rolCorto = (rol) => tipo?.roles?.[rol]?.corto ?? tipo?.roles?.[rol]?.label ?? rol.split(':')[1]

    const filasPuntos = apoyos.map((g) => {
      const propias = senalesDelGrupo(d.senales, g.id)
      const peorClave = peorEstadoDe(propias)
      const celdas = { punto: nombreDeGrupo(d.grupos, g.id, idioma), estado: peorClave ? rotuloDeEstado(peorClave, idioma) : c.sinCriterio }
      for (const rol of medidasDelTipo) {
        const s = propias.find((x) => d.metaDe(x.clave)?.rol === rol)
        celdas[rol] = s && s.valor !== null && s.valor !== undefined ? `${formatear(s.valor, s.decimales)}${s.unidad ? ` ${s.unidad}` : ''}` : null
      }
      return { color: peorClave, celdas }
    })

    const activos = d.riesgos?.activos ?? []
    const filasDiagnostico = activos.map((r) => ({
      color: r.nivel === 'critico' ? 'critico' : r.nivel === 'atencion' ? 'atencion' : null,
      celdas: {
        riesgo: r.titulo,
        apoyo: r.canalLabel ? rotuloDeCanal(r.canalLabel, idioma) : c.todaLaMaquina,
        nivel: c.nivel[r.nivel] ?? r.nivel,
        evidencia: r.evidencia,
        norma: r.norma ?? null,
      },
    }))
    const noEvaluables = d.riesgos?.noEvaluables.length ?? 0
    const notaDiagnostico = d.riesgos
      ? (noEvaluables ? c.riesgosNoEvaluables(noEvaluables, d.riesgos.evaluadas) : c.reglasEvaluadas(d.riesgos.evaluadas))
      : c.sinDominio

    const filasRecomendaciones = activos.filter((r) => r.accion).map((r) => ({
      color: r.nivel === 'critico' ? 'critico' : r.nivel === 'atencion' ? 'atencion' : null,
      celdas: { accion: r.accion, prioridad: c.prioridad[r.nivel] ?? r.nivel, responsable: null, fecha: null },
    }))

    const sintesis = c.resumen({
      nombre: entrada.nombre, periodo: ventana.etiqueta, conLectura: recuento.conLectura, total: recuento.total,
      estado: estadoGlobal, activos: d.riesgos?.activos.length ?? null, noEvaluables,
    })

    return {
      titulo: t.titulo,
      lema: t.lema,
      instalacion: entrada.nombre,
      chips: [
        { etiqueta: c.chipCondicion, valor: estadoGlobal ?? c.sinCriterio },
        { etiqueta: c.chipEquipo, valor: entrada.maquina ?? entrada.nombre },
        { etiqueta: c.chipPeriodo, valor: ventana.etiqueta },
      ],
      generadoEl,
      secciones: [
        { id: 'estado', titulo: t.secciones.estado, bloque: 'indicadores', nota: t.notaTemperatura, items: [
          { etiqueta: t.kpis.condicion, valor: estadoGlobal, unidad: null, sub: estadoGlobal ? t.kpis.condicionSub : c.sinCriterio, variacion: null },
          { etiqueta: t.kpis.rmsMax, valor: mayor ? formatear(mayor.resumen.maximo, mayor.meta.decimales) : null, unidad: mayor?.unidad ?? null,
            sub: mayor ? `${senalMayor?.grupo ? nombreDeGrupo(d.grupos, senalMayor.grupo, idioma) : ''} · ${mayor.resumen.maximoEn}` : c.sinSerieCorto, variacion: null },
          { etiqueta: t.kpis.alarmas, valor: d.estado.dominio ? String(d.banderas.activas.length) : null, unidad: null,
            sub: d.banderas.sinLectura ? c.banderasSinLectura(d.banderas.sinLectura) : t.kpis.alarmasSub, variacion: null },
          { etiqueta: t.kpis.sinLectura, valor: `${recuento.sinLectura}`, unidad: null, sub: c.deTotal(recuento.total), variacion: null },
        ] },
        { id: 'puntos', titulo: t.secciones.puntos, bloque: 'tabla',
          columnas: [
            { clave: 'punto', titulo: t.columnas.punto, ancho: 1.8 },
            ...medidasDelTipo.map((rol) => ({ clave: rol, titulo: rolCorto(rol), align: 'right', ancho: 1.1 })),
            { clave: 'estado', titulo: t.columnas.estado, ancho: 1.3, estado: true },
          ],
          filas: filasPuntos,
          pie: t.piePuntos,
          ...(filasPuntos.length ? {} : { ausente: t.sinApoyos }) },
        { id: 'espectro', titulo: t.secciones.espectro, bloque: 'graficas', ausente: t.sinEspectro },
        { id: 'tendencias', titulo: t.secciones.tendencias, bloque: 'graficas',
          ...(d.series.size ? { items: [...d.series.values()].map(graficaDe) } : { ausente: c.sinSeries(entrada.nombre) }) },
        { id: 'diagnostico', titulo: t.secciones.diagnostico, bloque: 'tabla', nota: notaDiagnostico,
          columnas: [
            { clave: 'riesgo', titulo: t.columnas.riesgo, ancho: 2 },
            { clave: 'apoyo', titulo: t.columnas.apoyo, ancho: 1.3 },
            { clave: 'nivel', titulo: t.columnas.nivel, ancho: 0.9, estado: true },
            { clave: 'evidencia', titulo: t.columnas.evidencia, ancho: 3 },
            { clave: 'norma', titulo: t.columnas.norma, ancho: 1.6 },
          ],
          filas: filasDiagnostico,
          ...(filasDiagnostico.length ? {} : { ausente: d.riesgos ? c.sinRiesgosActivos(d.riesgos.evaluadas, noEvaluables) : c.sinDominio }) },
        ...(explicacion
          ? [{ id: 'diagnostico-asistente', titulo: t.secciones.diagnosticoAsistente, bloque: 'texto', parrafos: parrafosDeCierre({ sintesis, explicacion, etq }) }]
          : []),
        { id: 'recomendaciones', titulo: t.secciones.recomendaciones, bloque: 'tabla',
          columnas: [
            { clave: 'accion', titulo: t.columnas.accion, ancho: 3.2 },
            { clave: 'prioridad', titulo: t.columnas.prioridad, ancho: 0.9, estado: true },
            { clave: 'responsable', titulo: t.columnas.responsable, ancho: 1.3 },
            { clave: 'fecha', titulo: t.columnas.fecha, ancho: 0.9 },
          ],
          filas: filasRecomendaciones,
          pie: t.pieRecomendaciones,
          ...(filasRecomendaciones.length ? {} : { ausente: d.riesgos ? c.sinRiesgosActivos(d.riesgos.evaluadas, noEvaluables) : c.sinDominio }) },
        { id: 'firmas', titulo: t.secciones.firmas, bloque: 'firmas', items: firmasDe(etq) },
      ],
    }
  },
}
