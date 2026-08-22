/**
 * El markdown que escribe el asistente, convertido a HTML seguro.
 *
 * ── POR QUÉ SANEAR NO ES OPCIONAL ───────────────────────────────────
 *
 * El texto sale de un modelo de lenguaje y acaba en `innerHTML`. Nada impide
 * que el modelo escriba `<img src=x onerror=...>` — no hace falta que sea
 * malicioso: basta con que reciba, vía RAG (`consultar_documentacion`) o vía
 * el adjunto de texto del usuario, un fragmento que contenga HTML y lo repita
 * tal cual. `marked` convierte estructura (títulos, negrita, viñetas); no
 * decide qué es seguro pintar. Eso lo hace DOMPurify, siempre, sin excepción.
 *
 * ── QUÉ SE PERMITE ───────────────────────────────────────────────────
 *
 * Sólo lo que la regla 12 del prompt pide: negrita, títulos, viñetas, párrafos,
 * saltos de línea, código en línea. Nada de imágenes, enlaces ni tablas: el
 * asistente no tiene motivo para generarlos, y cada etiqueta permitida de más
 * es superficie de ataque de más.
 */
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: true })

const ETIQUETAS_PERMITIDAS = [
  'p', 'br', 'strong', 'em', 'code', 'pre',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote',
]

/**
 * @param {string} texto markdown crudo del asistente
 * @returns {string} HTML saneado, listo para `dangerouslySetInnerHTML`
 */
export function markdownSeguro(texto) {
  const html = marked.parse(String(texto ?? ''), { async: false })
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ETIQUETAS_PERMITIDAS,
    ALLOWED_ATTR: [],
  })
}
