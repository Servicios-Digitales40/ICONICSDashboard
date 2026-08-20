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

/**
 * El cuerpo en crudo, sin interpretarlo.
 *
 * Existe para el audio del asistente. `readJsonBody` no sirve: convierte a
 * UTF-8 antes de parsear, y eso destroza un WAV — los bytes que no son
 * secuencias UTF-8 válidas se sustituyen por el carácter de reemplazo, así que
 * el audio llegaría corrupto **sin dar ningún error**, y el síntoma sería una
 * transcripción vacía o de ruido.
 *
 * El límite se pasa aparte y es mucho mayor que el de JSON: un minuto de voz en
 * WAV de 16 kHz son casi 2 MB, y el tope de JSON (1 MB) rechazaría media frase.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {number} maxBytes
 * @returns {Promise<Buffer>}
 * @throws {RequestBodyError} 413 si excede el límite
 */
export async function readRawBody(request, maxBytes) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) {
      /*
       * Se PAUSA la lectura; no se destruye la conexión.
       *
       * `readJsonBody` sí la destruye, y ahí funciona porque con 1 MB el
       * cliente ya ha terminado de enviar cuando saltamos. Con audio no: 6 MB
       * siguen subiendo, y destruir el socket en ese momento mata también la
       * respuesta — el cliente ve la conexión cortada y NUNCA lee el 413, así
       * que quien graba un audio demasiado largo recibe un error de red en vez
       * del motivo. Medido: `UND_ERR_SOCKET` en lugar del 413.
       *
       * Pausar detiene el consumo igual (que es lo que protege la memoria) y
       * deja el canal de respuesta vivo. Cerrar del todo es cosa de quien
       * responde, y sólo DESPUÉS de haber escrito el 413.
       */
      request.pause()
      throw new RequestBodyError(
        413,
        `El audio supera el límite de ${Math.round(maxBytes / 1024 / 1024)} MB.`
      )
    }
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}
