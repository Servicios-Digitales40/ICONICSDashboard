/**
 * Frontera de errores y forma de las respuestas de error.
 *
 * ── POR QUÉ UN PLUGIN Y NO UN TRY/CATCH ────────────────────────────
 *
 * En el servidor anterior esto era un `try/catch` alrededor del despacho, y
 * cumplía: sin él, una excepción no prevista dejaba el socket abierto y el
 * cliente esperando hasta su propio timeout, sin nada en el log. Fastify trae
 * el mismo cierre garantizado, pero además pasa por aquí los errores que él
 * mismo genera —cuerpo mal formado, 404, límite de peticiones— que antes
 * salían con una forma distinta a la de la API.
 *
 * Toda respuesta de error de esta API tiene la MISMA forma, `{ ok: false,
 * error }`, porque es la que el frontend sabe leer. Un 500 de Fastify con su
 * `{ statusCode, error, message }` nativo obligaría al cliente a distinguir
 * dos formas según quién falló.
 */
import fp from 'fastify-plugin'
import { ZodError } from 'zod'
import { primerMensaje } from '../esquemas.mjs'

async function erroresPlugin(fastify) {
  /*
   * El 404 NO se define aquí: lo registra `app.mjs`, porque tiene que decidir
   * entre responder un error de API y servir el `index.html` de la SPA, y esa
   * decisión necesita saber dónde está el build. Fastify sólo admite un
   * `setNotFoundHandler` por ámbito.
   */

  fastify.setErrorHandler((error, request, reply) => {
    /*
     * Validación: es culpa del cliente, y el mensaje ya está escrito para que
     * lo pueda leer un operador. No se registra como error del servidor porque
     * no lo es —llenaría el log de ruido en cuanto alguien pruebe la API a
     * mano— pero sí como aviso con el detalle, que es lo que hace falta cuando
     * un cliente legítimo empieza a mandar algo mal.
     */
    if (error instanceof ZodError || error?.validation) {
      const mensaje = error instanceof ZodError
        ? primerMensaje(error)
        : (error.message ?? 'Petición inválida.')

      request.log.warn(
        {
          metodo: request.method,
          ruta: request.url,
          detalle: error instanceof ZodError ? error.issues : error.validation,
        },
        `Petición rechazada por validación en ${request.url}: ${mensaje}`
      )

      return reply.code(400).send({ ok: false, error: mensaje })
    }

    /*
     * El límite de peticiones. `@fastify/rate-limit` lanza un error con su
     * `statusCode` ya puesto y con el cuerpo de `errorResponseBuilder`; sin
     * este caso caería en el genérico de abajo y saldría como un 500 —el
     * cliente vería una avería del servidor en lugar de "espera un momento",
     * y el `Retry-After` no le serviría de nada.
     */
    if (error?.statusCode === 429) {
      /*
       * No se registra: `onExceeded` ya lo hizo con la IP y el límite, y
       * repetirlo aquí duplicaría cada corte en el log.
       */
      return reply.code(429).send({
        ok: false,
        error: error.message,
        ...(error.reintentarEnSegundos
          ? { reintentarEnSegundos: error.reintentarEnSegundos }
          : {}),
      })
    }

    /*
     * Cuerpo que no es JSON válido, o que supera el tope. Fastify los marca
     * con su propio código; se traducen a la forma de la API conservando el
     * status, que ya era el correcto (400 y 413).
     */
    if (error?.statusCode === 400 || error?.statusCode === 413) {
      request.log.warn(
        { metodo: request.method, ruta: request.url, codigo: error.code },
        `Cuerpo de la petición rechazado en ${request.url}: ${error.message}`
      )

      /*
       * El mensaje de un JSON mal formado se normaliza al que ya devolvía el
       * lector anterior. Fastify dice «Unexpected token ... in JSON», que
       * expone el parser y varía entre versiones de Node; el de siempre es
       * estable y es el que comparan los guiones de `scripts/`.
       */
      const esJsonMalFormado =
        error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' ||
        error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' ||
        /JSON/i.test(error.message ?? '')

      return reply.code(error.statusCode).send({
        ok: false,
        error: esJsonMalFormado && error.statusCode === 400
          ? 'Invalid JSON body.'
          : error.message,
      })
    }

    /*
     * El cliente se fue a mitad. No es una avería: pasa cada vez que alguien
     * cierra la pestaña con una consulta en curso, y registrarlo como error
     * enseñaría a ignorar los errores de verdad.
     */
    if (error?.name === 'AbortError' || error?.code === 'ECONNRESET') {
      request.log.debug(
        { ruta: request.url },
        `El cliente cerró la conexión antes de recibir la respuesta de ${request.url}`
      )
      return
    }

    /*
     * Cualquier otra cosa es un fallo no previsto. Va al log con la traza
     * entera y con lo que hacía falta para reproducirlo; al cliente sólo le
     * llega que falló, porque el mensaje interno puede contener rutas o
     * nombres de host del servidor de planta.
     */
    request.log.error(
      {
        metodo: request.method,
        ruta: request.url,
        ip: request.ip,
        err: error,
      },
      `Fallo no controlado atendiendo ${request.method} ${request.url}: ${error?.message ?? error}`
    )

    if (reply.sent || reply.raw.headersSent) {
      /*
       * Ya se empezó a escribir la respuesta —típicamente un flujo SSE—, así
       * que no se puede cambiar el código de estado. Cortar es lo único
       * honesto: dejarla abierta colgaría al cliente hasta su timeout.
       */
      reply.raw.destroy()
      return
    }

    reply.code(500).send({ ok: false, error: 'Internal server error.' })
  })
}

export default fp(erroresPlugin, { name: 'errores' })
