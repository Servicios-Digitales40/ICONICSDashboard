/**
 * Lectura del cuerpo de la petición.
 *
 * La versión anterior acumulaba `body += chunk` sin techo en cada handler de
 * escritura: un cliente podía agotar la memoria del proceso con una sola
 * petición larga. Aquí el límite es parte de la lectura, no una comprobación
 * que se pueda olvidar al añadir el siguiente endpoint.
 */

export class RequestBodyError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.name = 'RequestBodyError'
    this.statusCode = statusCode
  }
}

/**
 * @param {import('node:http').IncomingMessage} request
 * @param {number} maxBytes
 * @returns {Promise<object>} cuerpo ya parseado
 * @throws {RequestBodyError} 413 si excede el límite, 400 si no es JSON válido
 */
export async function readJsonBody(request, maxBytes) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) {
      // Cortar la conexión y no solo dejar de leer: si no, el cliente sigue
      // enviando y el socket queda ocupado hasta el timeout.
      request.destroy()
      throw new RequestBodyError(413, `El cuerpo supera el límite de ${maxBytes} bytes.`)
    }
    chunks.push(chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8')

  try {
    return JSON.parse(raw)
  } catch {
    throw new RequestBodyError(400, 'Invalid JSON body.')
  }
}
