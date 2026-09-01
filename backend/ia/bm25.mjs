/**
 * Búsqueda léxica BM25, compartida entre `documentos.mjs` (fragmentos de
 * manual) y `casos.mjs` (texto de recuperación de una intervención, Fase 2).
 *
 * Extraído en cuanto apareció el segundo consumidor real — mismo criterio
 * que `embeddings.mjs`, ver su cabecera. Nada aquí sabe qué es un
 * «fragmento» ni una «intervención»: sólo sabe puntuar objetos que traigan
 * `.terminos` (los tokens de su texto) y `.frecuencias` (cuántas veces sale
 * cada uno) contra una consulta.
 */

/**
 * Palabras que aparecen en casi toda frase en español y no discriminan nada.
 *
 * BM25 ya las penaliza por frecuencia, pero quitarlas de la CONSULTA además
 * evita que «¿cómo se calibra el sensor de presión?» gaste su peso en «cómo» y
 * «se» cuando lo que importa es «calibra», «sensor» y «presión».
 */
const VACIAS = new Set([
  'a', 'al', 'algo', 'ante', 'como', 'con', 'cual', 'cuando', 'cuanto', 'de', 'del', 'desde',
  'donde', 'dos', 'el', 'ella', 'ellos', 'en', 'entre', 'era', 'es', 'esa', 'ese', 'eso', 'esta',
  'este', 'esto', 'ha', 'hace', 'hasta', 'hay', 'la', 'las', 'le', 'lo', 'los', 'mas', 'me', 'mi',
  'muy', 'no', 'nos', 'o', 'para', 'pero', 'por', 'que', 'se', 'ser', 'si', 'sin', 'sobre', 'son',
  'su', 'sus', 'te', 'tiene', 'todo', 'un', 'una', 'uno', 'y', 'ya',
])

/** Texto → lista de términos comparables: sin acentos, sin signos, sin vacías. */
export function terminos(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    // Escrito con escapes y no con acentos literales: son caracteres
    // combinantes, invisibles al abrir el archivo. Mismo motivo y misma forma
    // que en `shared/periodo.js` y en `herramientas.mjs`.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !VACIAS.has(t))
}

/** `.terminos` + `.frecuencias` a partir de `.texto` — el precálculo que
 *  tanto `documentos.mjs` como `casos.mjs` necesitan hacer una vez por
 *  elemento nuevo, nunca en cada búsqueda. */
export function indexarTerminos(texto) {
  const t = terminos(texto)
  const frecuencias = new Map()
  for (const term of t) frecuencias.set(term, (frecuencias.get(term) ?? 0) + 1)
  return { terminos: t, frecuencias }
}

/** Constantes clásicas de BM25. No hay motivo para tocarlas. */
const BM25_K1 = 1.5
const BM25_B = 0.75

/**
 * Puntúa cada elemento de `items` contra `consulta`.
 *
 * BM25 y no un simple recuento de coincidencias porque las dos correcciones
 * que aporta importan aquí: una palabra que sale en TODOS los elementos no
 * debe puntuar, y uno más largo no debe ganar sólo por ser largo.
 */
export function puntuarBm25(items, consulta) {
  const q = terminos(consulta)
  if (!q.length) return []

  const N = items.length
  const largoMedio = items.reduce((s, item) => s + item.terminos.length, 0) / N || 1

  // En cuántos elementos aparece cada término de la consulta.
  const df = new Map()
  for (const t of new Set(q)) {
    df.set(t, items.filter(item => item.frecuencias.has(t)).length)
  }

  return items.map(item => {
    let score = 0
    for (const t of q) {
      const tf = item.frecuencias.get(t) ?? 0
      if (!tf) continue
      const n = df.get(t) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      const norma = 1 - BM25_B + BM25_B * (item.terminos.length / largoMedio)
      score += idf * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norma))
    }
    return { ...item, score }
  })
}
