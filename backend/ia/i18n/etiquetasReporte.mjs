/**
 * Los rótulos fijos del PDF (`ia/reporte.mjs`), en el idioma del tablero.
 *
 * ── POR QUÉ ESTO ES DISTINTO DE `narrarRiesgo.mjs`/`narrarTendencia.mjs` ───
 *
 * Los dos anteriores traducen HECHOS que compone el dominio o el motor de
 * reglas —una evidencia con cifras, una dirección de tendencia—. Esto es la
 * plantilla del documento en sí: títulos de sección, cabeceras de columna,
 * el nombre del rol en el diálogo. No hay ningún cálculo detrás, así que no
 * hace falta interpolar ni resolver `context`: es un mapa fijo por clave.
 *
 * ── POR QUÉ EL PDF Y NO SÓLO EL PROMPT ─────────────────────────────────
 *
 * El PDF se cierra y se guarda ANTES de que el modelo escriba una palabra
 * (ver la cabecera de `generar_reporte` en `historicos/index.mjs`): es un
 * archivo, no una respuesta de chat. `idioma` no le llega al modelo para
 * que lo narre, le llega a `reporte.mjs` para que componga el documento
 * directamente en ese idioma — la misma razón por la que `describirTendencia`
 * y `sintesisAutomatica` ya redactan en código y no esperan al modelo.
 */

const ES = {
  reporteTitulo: 'REPORTE TÉCNICO',
  reporteSubtitulo: 'Monitoreo y análisis de planta',
  generadoEl: (fecha) => `Generado el ${fecha}`,
  folio: 'FOLIO',
  folioPie: 'Folio',
  paginaDe: (n, total) => `Página ${n} de ${total}`,
  seccionSintesis: 'Síntesis',
  seccionResumenAsistente: 'Resumen del asistente',
  seccionValoresActuales: 'Valores actuales (sin serie histórica)',
  colSenal: 'SEÑAL',
  colValor: 'VALOR',
  colEstado: 'ESTADO',
  sinDato: 'sin dato',
  seccionTendencias: 'Tendencias',
  resumenGrafico: (r, unidad) =>
    `Mínimo ${r.minimo}${unidad} · Máximo ${r.maximo}${unidad} · Promedio ${r.promedio}${unidad} ` +
    `· ${r.muestras} muestras`,
  coberturaParcial: (c) =>
    `Sólo ${c.diasLeidos} de los ${c.diasTotal} días del rango tienen registro en el historiador: ` +
    'estas cifras son de esos días, no del período entero.',
  seccionNotasYAvisos: 'Notas y avisos',
  conversacionTitulo: 'REPORTE DE CONVERSACIÓN',
  conversacionSubtitulo: 'Diálogo con el asistente de planta',
  rolOperador: 'Operador',
  rolAsistente: 'Asistente',
  instalacion: 'Sistema de agua industrial',
}

const EN = {
  reporteTitulo: 'TECHNICAL REPORT',
  reporteSubtitulo: 'Plant monitoring and analysis',
  generadoEl: (fecha) => `Generated on ${fecha}`,
  folio: 'FOLIO',
  folioPie: 'Folio',
  paginaDe: (n, total) => `Page ${n} of ${total}`,
  seccionSintesis: 'Summary',
  seccionResumenAsistente: 'Assistant summary',
  seccionValoresActuales: 'Current values (no history)',
  colSenal: 'SIGNAL',
  colValor: 'VALUE',
  colEstado: 'STATUS',
  sinDato: 'no data',
  seccionTendencias: 'Trends',
  resumenGrafico: (r, unidad) =>
    `Min ${r.minimo}${unidad} · Max ${r.maximo}${unidad} · Average ${r.promedio}${unidad} ` +
    `· ${r.muestras} samples`,
  coberturaParcial: (c) =>
    `Only ${c.diasLeidos} of the ${c.diasTotal} days in this range have a record in the historian: ` +
    'these figures cover only those days, not the whole period.',
  seccionNotasYAvisos: 'Notes and warnings',
  conversacionTitulo: 'CONVERSATION REPORT',
  conversacionSubtitulo: 'Dialogue with the plant assistant',
  rolOperador: 'Operator',
  rolAsistente: 'Assistant',
  instalacion: 'Industrial water system',
}

/**
 * @param {"es"|"en"} idioma
 * @returns {typeof ES} el catálogo de ese idioma; español si `idioma` no es
 *   ninguno de los dos soportados — mismo criterio "fail-safe a español"
 *   que `ChatSchema.idioma` y el resto de i18n del asistente.
 */
export function etiquetasDeReporte(idioma) {
  return idioma === 'en' ? EN : ES
}
