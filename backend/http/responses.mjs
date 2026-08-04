/**
 * Escritura de respuestas HTTP. Un solo sitio que conoce las cabeceras.
 */

/**
 * CORS en una única constante, compartida por el preflight y por las
 * respuestas reales.
 *
 * Estaban duplicadas y habían divergido: el preflight anunciaba solo
 * `GET, OPTIONS` mientras la API ya aceptaba POST y PUT, así que el navegador
 * bloqueaba toda escritura desde el dev server de Vite (otro puerto, luego
 * otro origen). En producción no se veía porque el backend sirve el bundle
 * desde el mismo origen y no hay preflight.
 */
const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
})

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

export function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    ...CORS_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
  })
  response.end(message)
}

/** Error con la forma `{ ok: false, error }` que el cliente sabe leer. */
export function sendError(response, statusCode, error, extra = {}) {
  sendJson(response, statusCode, { ok: false, error, ...extra })
}

export function sendPreflight(response) {
  response.writeHead(204, CORS_HEADERS)
  response.end()
}

