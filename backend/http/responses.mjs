/**
 * Escritura de respuestas HTTP.
 *
 * Aquí ya no hay cabeceras de CORS: las aplica `http/cors.mjs` una vez por
 * petición, antes del despacho, y Node las fusiona con las de `writeHead()`.
 * Estaban duplicadas entre el preflight y las respuestas reales, y habían
 * divergido —el preflight anunciaba sólo `GET, OPTIONS` mientras la API ya
 * aceptaba POST y PUT—, así que el arreglo no es sincronizar las dos copias
 * sino que no haya dos.
 */

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

export function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end(message)
}

/** Error con la forma `{ ok: false, error }` que el cliente sabe leer. */
export function sendError(response, statusCode, error, extra = {}) {
  sendJson(response, statusCode, { ok: false, error, ...extra })
}
