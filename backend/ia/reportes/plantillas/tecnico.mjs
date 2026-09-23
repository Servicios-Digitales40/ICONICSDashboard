/**
 * Plantilla «Reporte técnico» (Plan 44 F3), transcrita de
 * `docs/plantillas-reportes/tecnico.docx`: resumen operativo, indicadores
 * principales, tendencias, estadísticas del período, análisis técnico,
 * conclusiones y firmas.
 *
 * Nada aquí nombra una máquina ni una clave: pide familias de rol y lo que el
 * tipo declara como principal (§1.1 del plan). Con el tanque como
 * configurada saldrá con nivel, caudal y presión sin tocar este archivo.
 */
import {
  filaEstadistica, firmasDe, graficaDe, nombreDeGrupo, observacionDe, parrafosDeCierre,
  riesgosDelCanal, rotuloDeEstado, senalesDelGrupo, tarjetaDe,
} from './comun.mjs'
import { peorEstadoDe, recuentoDe } from '../recolectores.mjs'

export default {
  id: 'tecnico',
  folioPrefijo: 'TEC',
  disponible: true,
  portada: { arte: 'tecnico', disposicion: 'banner' },

  /** Las medidas con serie, en el orden del tipo; el recolector corta al tope. */
  claves: ({ medidas }) => medidas,

  documento(d, { etq, idioma, entrada, ventana, generadoEl, explicacion }) {
    const t = etq.plantillas.tecnico
    const c = etq.plantillas.comun
    const series = [...d.series.values()]
    const recuento = recuentoDe(d.senales)
    const estadoGlobal = rotuloDeEstado(d.estado.estadoGeneral, idioma)

    const sintesis = c.resumen({
      nombre: entrada.nombre,
      periodo: ventana.etiqueta,
      conLectura: recuento.conLectura,
      total: recuento.total,
      estado: estadoGlobal,
      activos: d.riesgos?.activos.length ?? null,
      noEvaluables: d.riesgos?.noEvaluables.length ?? 0,
    })

    /* Una fila por activo (grupo del estado), más una para los riesgos de
       toda la máquina si los hay. Condición = el peor estado con criterio. */
    const filasAnalisis = d.grupos.map((g) => {
      const propias = senalesDelGrupo(d.senales, g.id)
      const peorClave = peorEstadoDe(propias)
      const riesgos = riesgosDelCanal(d.riesgos, g.id)
      return {
        color: peorClave,
        celdas: {
          activo: nombreDeGrupo(d.grupos, g.id, idioma),
          condicion: peorClave ? rotuloDeEstado(peorClave, idioma) : c.sinCriterio,
          observacion: [observacionDe(propias, etq), ...riesgos.map((r) => r.evidencia)].filter(Boolean).join(' '),
          recomendacion: riesgos.map((r) => r.accion).filter(Boolean).join(' ') || null,
        },
      }
    }).filter((f) => f.celdas.activo)
    const deTodaLaMaquina = riesgosDelCanal(d.riesgos, null)
    if (deTodaLaMaquina.length) {
      filasAnalisis.push({
        color: peorEstadoDe(d.senales),
        celdas: {
          activo: c.todaLaMaquina,
          condicion: deTodaLaMaquina.map((r) => c.nivel[r.nivel] ?? r.nivel).join(', '),
          observacion: deTodaLaMaquina.map((r) => r.evidencia).join(' '),
          recomendacion: deTodaLaMaquina.map((r) => r.accion).filter(Boolean).join(' ') || null,
        },
      })
    }

    const conclusion = c.conclusion({
      estado: estadoGlobal,
      fuera: recuento.fuera,
      aviso: recuento.aviso,
      sinLectura: recuento.sinLectura,
      activos: d.riesgos?.activos.length ?? null,
      subiendo: series.filter((s) => s.tendencia?.direccion === 'subiendo').map((s) => s.titulo),
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
      /* «Generado» ya va en un chip (la maqueta lo pide ahí): no se repite debajo. */
      generadoEl: null,
      secciones: [
        { id: 'resumen', titulo: t.secciones.resumen, bloque: 'texto', parrafos: [{ rotulo: c.sintesis, texto: sintesis }] },
        { id: 'indicadores', titulo: t.secciones.indicadores, bloque: 'indicadores',
          items: d.principales.map((p) => tarjetaDe({ principal: p, series: d.series, anteriores: d.anteriores, grupos: d.grupos, etq, idioma })) },
        { id: 'tendencias', titulo: t.secciones.tendencias, bloque: 'graficas',
          ...(series.length ? { items: series.map(graficaDe) } : { ausente: c.sinSeries(entrada.nombre) }) },
        { id: 'estadisticas', titulo: t.secciones.estadisticas, bloque: 'tabla',
          columnas: [
            { clave: 'variable', titulo: t.columnas.variable, ancho: 3 },
            { clave: 'minimo', titulo: t.columnas.minimo, align: 'right' },
            { clave: 'maximo', titulo: t.columnas.maximo, align: 'right' },
            { clave: 'promedio', titulo: t.columnas.promedio, align: 'right' },
            { clave: 'unidad', titulo: t.columnas.unidad },
            { clave: 'cobertura', titulo: t.columnas.cobertura, ancho: 1.4 },
          ],
          filas: series.map((s) => filaEstadistica(s, etq)),
          ...(series.length ? {} : { ausente: c.sinSeries(entrada.nombre) }) },
        { id: 'analisis', titulo: t.secciones.analisis, bloque: 'tabla',
          columnas: [
            { clave: 'activo', titulo: t.columnas.activo, ancho: 1.6 },
            { clave: 'condicion', titulo: t.columnas.condicion, ancho: 1.2, estado: true },
            { clave: 'observacion', titulo: t.columnas.observacion, ancho: 3 },
            { clave: 'recomendacion', titulo: t.columnas.recomendacion, ancho: 2.4 },
          ],
          filas: filasAnalisis,
          pie: t.pieAnalisis },
        { id: 'conclusiones', titulo: t.secciones.conclusiones, bloque: 'texto', parrafos: parrafosDeCierre({ sintesis: conclusion, explicacion, etq }) },
        { id: 'firmas', titulo: t.secciones.firmas, bloque: 'firmas', items: firmasDe(etq) },
      ],
    }
  },
}
