/**
 * Lo que las plantillas comparten al armar su modelo de documento: cómo se
 * rotula un estado en el idioma del PDF, cómo se convierte una serie leída en
 * un bloque de gráfica o en una fila de estadísticas, cómo se firman.
 *
 * Son ayudantes de FORMA, no de cálculo: las cifras vienen ya calculadas de
 * `recolectores.mjs`; aquí sólo se colocan en la columna que toca.
 */
import { estadoInfo } from '../../../../shared/eva/tanque/estado.js'
import { narrarEstadoPorClave } from '../../i18n/narrarEstadoTanque.mjs'
import { narrarCanalPorLabel } from '../../i18n/narrarEstadoVibraciones.mjs'
import { desvioPorciento, formatear, recuentoDe, variacionDe } from '../recolectores.mjs'

/** El rótulo de una clave de estado (`nominal` → «En banda» / «In band»). `null` sin clave. */
export function rotuloDeEstado(clave, idioma) {
  if (!clave) return null
  const label = estadoInfo(clave).label
  return idioma === 'en' ? narrarEstadoPorClave(clave, label) : label
}

/** El nombre de un apoyo/activo en el idioma del PDF. */
export function rotuloDeCanal(label, idioma) {
  if (!label) return null
  return idioma === 'en' ? narrarCanalPorLabel(label) : label
}

/** El nombre del grupo (activo) al que pertenece una señal, o su id. */
export function nombreDeGrupo(grupos, id, idioma) {
  const g = (grupos ?? []).find((x) => x.id === id)
  return rotuloDeCanal(g?.label ?? id, idioma)
}

/** Un bloque de gráfica a partir de una serie recolectada (misma forma que el catálogo). */
export function graficaDe(serie) {
  return {
    titulo: serie.titulo,
    unidad: serie.unidad,
    svg: serie.svg,
    resumen: serie.resumen,
    tendencia: serie.tendencia,
    cobertura: serie.cobertura,
    interpretacion: serie.interpretacion,
    nota: serie.nota,
  }
}

/** Una fila de estadísticas (mín · máx · promedio · unidad · cobertura) de una serie. */
export function filaEstadistica(serie, etq) {
  const r = serie.resumen
  const c = serie.cobertura
  return {
    celdas: {
      variable: serie.titulo,
      minimo: r ? formatear(r.minimo, serie.meta?.decimales) : null,
      maximo: r ? formatear(r.maximo, serie.meta?.decimales) : null,
      promedio: r ? formatear(r.promedio, serie.meta?.decimales) : null,
      unidad: serie.unidad ?? '',
      cobertura: !r ? etq.plantillas.comun.sinMuestrasCorto : c && !c.completa ? etq.plantillas.comun.cobertura(c) : etq.plantillas.comun.coberturaCompleta,
    },
  }
}

/**
 * Una tarjeta de indicador para una señal principal: su valor ahora, el
 * apoyo al que pertenece, y la variación del promedio frente al período
 * anterior si las dos series existen.
 */
export function tarjetaDe({ principal, series, anteriores, grupos, etq, idioma }) {
  const s = principal.senal
  const meta = s
  const serie = series.get(principal.clave)
  const variacion = serie?.resumen && anteriores.get(principal.clave)
    ? variacionDe(serie.resumen, anteriores.get(principal.clave), { decimales: meta.decimales, unidad: s.unidad })
    : null
  const sinLectura = s.valor === null || s.valor === undefined
  const donde = s.grupo ? nombreDeGrupo(grupos, s.grupo, idioma) : null
  return {
    etiqueta: meta.label,
    valor: sinLectura ? null : formatear(s.valor, meta.decimales),
    unidad: s.unidad || null,
    sub: sinLectura
      ? etq.plantillas.comun.sinLectura
      : variacion ? `${donde ? `${donde} · ` : ''}${etq.plantillas.comun.vsAnterior}` : (donde ?? ''),
    variacion: variacion ? { signo: variacion.signo, texto: variacion.texto } : null,
  }
}

/** El desvío de una lectura frente al promedio de su serie, como texto, o `null`. */
export function desvioTexto(valor, serie) {
  const d = desvioPorciento(valor, serie?.resumen?.promedio)
  if (d === null) return null
  return `${d > 0 ? '+' : ''}${d.toFixed(1)} %`
}

/** Las señales de un grupo (activo), en su orden. */
export function senalesDelGrupo(senales, grupoId) {
  return (senales ?? []).filter((s) => s.grupo === grupoId)
}

/** El texto de observación de un activo: cuántas leen y cuántas están fuera. */
export function observacionDe(senales, etq) {
  return etq.plantillas.comun.observacion(recuentoDe(senales))
}

/** Los riesgos activos de un canal (o de toda la máquina con `null`). */
export function riesgosDelCanal(riesgos, canalId) {
  return (riesgos?.activos ?? []).filter((r) => (r.canal ?? null) === (canalId ?? null))
}

/** El bloque de firmas: quien elabora es el asistente; revisar y aprobar se firma a mano (D10). */
export function firmasDe(etq) {
  const c = etq.plantillas.comun
  return [{ rol: c.elaboro, nombre: c.firmaAsistente }, { rol: c.reviso, nombre: null }, { rol: c.aprobo, nombre: null }]
}

/** Los párrafos de cierre: la síntesis en código y, si la hay, la redacción del modelo rotulada (D9). */
export function parrafosDeCierre({ sintesis, explicacion, etq }) {
  const parrafos = [{ rotulo: etq.plantillas.comun.sintesis, texto: sintesis }]
  if (typeof explicacion === 'string' && explicacion.trim()) {
    parrafos.push({ rotulo: etq.redaccionAsistente, texto: explicacion.trim() })
  }
  return parrafos
}
