/**
 * Plantilla «Reporte de lectura de sensores» (Plan 44 F3), transcrita de
 * `docs/plantillas-reportes/lectura-de-sensores.docx`: variables
 * monitoreadas, lecturas y trazabilidad, tendencia, calibración y calidad de
 * dato, acciones y cierre.
 *
 * ── CALIBRACIÓN: SIN REGISTRO, Y SE DICE (D3) ───────────────────────
 *
 * La maqueta pide «última calibración» y «próxima». ICONICS no las tiene y
 * ninguna máquina las declara todavía; las dos columnas salen «sin registro»
 * en cada fila, y la sección se apoya en lo que SÍ hay: el código de calidad
 * del módulo por medida, y si la serie de cada señal está verificada por el
 * sondeo o no. Si algún día `maquinas.json` lleva un campo de calibración por
 * variable (§6.1 del plan), es una columna que se llena, no una sección nueva.
 */
import {
  desvioTexto, firmasDe, graficaDe, nombreDeGrupo, parrafosDeCierre, rotuloDeEstado, tarjetaDe,
} from './comun.mjs'
import { familiaDe, formatear, recuentoDe } from '../recolectores.mjs'

/** El rango declarado de una señal, legible; `null` si el tipo no le da banda. */
export function rangoLegible(banda, unidad, etq) {
  if (!banda) return null
  const u = unidad ? ` ${unidad}` : ''
  if (banda.aviso !== undefined && banda.alarma !== undefined) return etq.plantillas.sensores.rangoAvisoAlarma(banda.aviso, banda.alarma, u)
  if (banda.avisoMax !== undefined || banda.max !== undefined) return etq.plantillas.sensores.rangoHasta(banda.avisoMax ?? null, banda.max ?? null, u)
  return null
}

/** El código de calidad del módulo para una medida de un apoyo, si el dominio lo trae. */
function calidadDe(dominio, canal, claveMedida) {
  const calidades = dominio?.canales?.[canal]?.calidades
  if (!calidades) return null
  const buscada = `qc${String(claveMedida).toLowerCase()}`
  const k = Object.keys(calidades).find((q) => q.toLowerCase() === buscada)
  const v = k ? calidades[k] : undefined
  return v === null || v === undefined ? null : String(v)
}

export default {
  id: 'lectura-de-sensores',
  folioPrefijo: 'SEN',
  disponible: true,
  portada: { arte: 'lectura-de-sensores', disposicion: 'lateral' },

  claves: ({ medidas }) => medidas,

  documento(d, { etq, idioma, entrada, tipo, ventana, generadoEl, explicacion }) {
    const t = etq.plantillas.sensores
    const c = etq.plantillas.comun
    const recuento = recuentoDe(d.senales)

    /* Los «sensores»: toda señal numérica que el estado compone con familia
       `medida` o `variador` (lo booleano y los contadores no son un sensor). */
    const sensores = d.senales.filter((s) => {
      const fam = familiaDe(d.metaDe(s.clave)?.rol)
      return (fam === 'medida' || fam === 'variador') && d.metaDe(s.clave)?.naturaleza !== 'alarma'
    })

    const filasLecturas = sensores.map((s) => {
      const serie = d.series.get(s.clave)
      const sinLectura = s.valor === null || s.valor === undefined
      return {
        color: s.estado ?? null,
        celdas: {
          tag: s.tag ?? s.clave,
          variable: s.label,
          rango: rangoLegible(s.banda, s.unidad, etq),
          lectura: sinLectura ? null : `${formatear(s.valor, s.decimales)}${s.unidad ? ` ${s.unidad}` : ''}`,
          desvio: sinLectura ? null : desvioTexto(s.valor, serie),
          estado: sinLectura ? c.sinLectura : (rotuloDeEstado(s.estado, idioma) ?? c.sinCriterio),
        },
      }
    })

    const filasCalidad = sensores.map((s) => {
      const rol = d.metaDe(s.clave)?.rol
      const claveMedida = rol?.split(':')[1]
      return {
        celdas: {
          tag: s.tag ?? s.clave,
          ultima: t.sinRegistro,
          proxima: t.sinRegistro,
          calidad: familiaDe(rol) === 'medida' ? calidadDe(d.estado.dominio, s.grupo, claveMedida) : null,
          serie: d.historizada(s.clave) ? t.serieVerificada : t.serieSinVerificar,
        },
      }
    })

    const sintesis = c.resumenSensores({
      nombre: entrada.nombre, periodo: ventana.etiqueta, sensores: sensores.length,
      conLectura: sensores.filter((s) => s.valor !== null && s.valor !== undefined).length,
      fuera: recuento.fuera, aviso: recuento.aviso,
      verificadas: sensores.filter((s) => d.historizada(s.clave)).length,
    })

    return {
      titulo: t.titulo,
      lema: t.lema,
      instalacion: entrada.nombre,
      chips: [
        { etiqueta: c.chipPlanta, valor: entrada.nombre },
        { etiqueta: c.chipActivos, valor: d.grupos.map((g) => nombreDeGrupo(d.grupos, g.id, idioma)).join(', ') },
        { etiqueta: c.chipPeriodo, valor: ventana.etiqueta },
      ],
      generadoEl,
      secciones: [
        { id: 'variables', titulo: t.secciones.variables, bloque: 'indicadores',
          items: d.principales.map((p) => {
            const tarjeta = tarjetaDe({ principal: p, series: d.series, anteriores: d.anteriores, grupos: d.grupos, etq, idioma })
            /* En este reporte el subtítulo es la CLAVE de la señal (única en la
               máquina y parte de su tag): la trazabilidad es el tema. El tag
               completo va en la tabla de abajo; en una tarjeta no cabe. */
            return { ...tarjeta, sub: p.clave }
          }) },
        { id: 'lecturas', titulo: t.secciones.lecturas, bloque: 'tabla',
          columnas: [
            { clave: 'tag', titulo: t.columnas.tag, ancho: 2.6 },
            { clave: 'variable', titulo: t.columnas.variable, ancho: 2.2 },
            { clave: 'rango', titulo: t.columnas.rango, ancho: 1.6 },
            { clave: 'lectura', titulo: t.columnas.lectura, ancho: 1.2, align: 'right' },
            { clave: 'desvio', titulo: t.columnas.desvio, ancho: 0.9, align: 'right' },
            { clave: 'estado', titulo: t.columnas.estado, ancho: 1.2, estado: true },
          ],
          filas: filasLecturas,
          pie: t.pieLecturas(ventana.etiqueta),
          ...(filasLecturas.length ? {} : { ausente: t.sinSensores(tipo?.nombre ?? entrada.tipo) }) },
        { id: 'tendencia', titulo: t.secciones.tendencia, bloque: 'graficas',
          ...(d.series.size ? { items: [...d.series.values()].map(graficaDe) } : { ausente: c.sinSeries(entrada.nombre) }) },
        { id: 'calidad', titulo: t.secciones.calidad, bloque: 'tabla', nota: t.notaCalibracion,
          columnas: [
            { clave: 'tag', titulo: t.columnas.tag, ancho: 2.8 },
            { clave: 'ultima', titulo: t.columnas.ultima, ancho: 1.3 },
            { clave: 'proxima', titulo: t.columnas.proxima, ancho: 1.3 },
            { clave: 'calidad', titulo: t.columnas.calidad, ancho: 1.1, align: 'right' },
            { clave: 'serie', titulo: t.columnas.serie, ancho: 1.3 },
          ],
          filas: filasCalidad,
          pie: t.pieCalidad,
          ...(filasCalidad.length ? {} : { ausente: t.sinSensores(tipo?.nombre ?? entrada.tipo) }) },
        { id: 'acciones', titulo: t.secciones.acciones, bloque: 'tabla', nota: t.notaAcciones,
          columnas: [
            { clave: 'no', titulo: t.columnas.no, ancho: 0.5 },
            { clave: 'accion', titulo: t.columnas.accion, ancho: 3 },
            { clave: 'responsable', titulo: t.columnas.responsable, ancho: 1.4 },
            { clave: 'fecha', titulo: t.columnas.fecha, ancho: 0.9 },
            { clave: 'estatus', titulo: t.columnas.estatus, ancho: 1 },
          ],
          /* Filas en blanco a propósito: las acciones las decide alguien, no el
             sistema. El número sí va, para que se pueda citar la fila. */
          filas: [1, 2, 3].map((n) => ({ celdas: { no: String(n), accion: ' ', responsable: ' ', fecha: ' ', estatus: ' ' } })) },
        { id: 'cierre', titulo: t.secciones.cierre, bloque: 'texto', parrafos: parrafosDeCierre({ sintesis, explicacion, etq }) },
        { id: 'firmas', titulo: t.secciones.firmas, bloque: 'firmas', items: firmasDe(etq) },
      ],
    }
  },
}
