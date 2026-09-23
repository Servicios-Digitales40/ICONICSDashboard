/**
 * El registro de plantillas de reporte y el normalizador del `tipo` (Plan 44,
 * D4).
 *
 * ── UN ARGUMENTO, NO OCHO HERRAMIENTAS ───────────────────────────────
 *
 * `generar_reporte` recibe `tipo`. El modelo elige del enum con la descripción
 * de cada valor; este normalizador cubre que pase texto libre («reporte de
 * sensores»), un sinónimo («CMS») o inglés («technical»). Una frase que nombra
 * DOS tipos sale `ambiguo` y la herramienta pregunta, no elige. Sin `tipo` —o
 * con `catalogo`— la herramienta hace lo de siempre.
 *
 * Los sinónimos son la tabla §1.2 del plan. Se comparan sin acentos ni
 * mayúsculas, palabra entera.
 */
import tecnico from './tecnico.mjs'
import vibraciones from './vibraciones.mjs'
import lecturaDeSensores from './lectura-de-sensores.mjs'
import { alarmas, energias, ingenieria, predicciones, riesgos } from './pendientes.mjs'

/** El tipo de siempre: todas las señales de la máquina, sin plantilla. */
export const CATALOGO = 'catalogo'

export const PLANTILLAS = Object.freeze({
  [tecnico.id]: tecnico,
  [vibraciones.id]: vibraciones,
  [lecturaDeSensores.id]: lecturaDeSensores,
  [riesgos.id]: riesgos,
  [alarmas.id]: alarmas,
  [ingenieria.id]: ingenieria,
  [energias.id]: energias,
  [predicciones.id]: predicciones,
})

/** Todos los tipos que acepta `generar_reporte`, el de siempre primero. */
export const TIPOS = Object.freeze([CATALOGO, ...Object.keys(PLANTILLAS)])

/** Los que ya se componen hoy. */
export const TIPOS_DISPONIBLES = Object.freeze(Object.values(PLANTILLAS).filter((p) => p.disponible).map((p) => p.id))

const SINONIMOS = Object.freeze({
  [CATALOGO]: ['catalogo', 'catálogo', 'todas las senales', 'todas las señales', 'completo', 'general'],
  tecnico: ['tecnico', 'técnico', 'technical', 'monitoreo', 'planta'],
  vibraciones: ['vibraciones', 'vibracion', 'vibración', 'vibration', 'vibrations', 'cms', 'condicion', 'condición', 'condition', 'apoyos', 'rodamientos'],
  'lectura-de-sensores': ['sensores', 'sensor', 'sensors', 'lecturas', 'lectura', 'readings', 'instrumentacion', 'instrumentación', 'instrumentation', 'calidad de dato'],
  riesgos: ['riesgos', 'riesgo', 'risk', 'risks', 'matriz', 'mitigacion', 'mitigación'],
  alarmas: ['alarmas', 'alarma', 'alarm', 'alarms', 'eventos', 'events', 'avisos', 'disparos'],
  ingenieria: ['ingenieria', 'ingeniería', 'engineering', 'hallazgos', 'proyecto', 'findings'],
  energias: ['energias', 'energías', 'energia', 'energía', 'energy', 'consumo', 'consumption', 'electrico', 'eléctrico', 'electricidad', 'electrical', 'kwh', 'potencia'],
  predicciones: ['predicciones', 'prediccion', 'predicción', 'prediction', 'predictions', 'pronostico', 'pronóstico', 'forecast', 'predictivo', 'predictive'],
})

const limpiar = (texto) => String(texto ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9\s-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

/**
 * @param {string|null|undefined} texto  lo que el modelo pasó como `tipo`
 * @returns {{tipo: string}|{ambiguo: string[]}|null}  `null` si no se reconoce nada
 */
export function tipoDeReporte(texto) {
  const t = limpiar(texto)
  if (!t) return null
  if (TIPOS.includes(t)) return { tipo: t }
  const conGuiones = t.replace(/\s+/g, '-')
  if (TIPOS.includes(conGuiones)) return { tipo: conGuiones }

  const palabras = ` ${t} `
  const coincidencias = []
  for (const [tipo, sinonimos] of Object.entries(SINONIMOS)) {
    if (sinonimos.some((s) => palabras.includes(` ${limpiar(s)} `))) coincidencias.push(tipo)
  }
  /* «reporte técnico de planta» nombra dos sinónimos del MISMO tipo: uno. Dos
     tipos distintos —«técnico de alarmas»— es ambiguo de verdad. */
  const distintos = [...new Set(coincidencias)]
  if (distintos.length === 1) return { tipo: distintos[0] }
  if (distintos.length > 1) return { ambiguo: distintos }
  return null
}

/** La plantilla de un tipo, o `null` (también para `catalogo`, que no tiene). */
export const plantillaDe = (tipo) => PLANTILLAS[tipo] ?? null
