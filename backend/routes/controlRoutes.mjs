/**
 * Ruta de accionamiento directo sobre la planta: encender/apagar la bomba
 * desde un botón del tablero, sin pasar por el asistente de IA.
 *
 * Pasa por `herramientas.ejecutar('controlar_bomba', …)`, la MISMA función
 * que usa el chat, para no duplicar ninguna de sus dos guardas (solo
 * lectura, nivel de tanque) ni su relectura de confirmación tras escribir.
 */
import { ControlBombaSchema } from '../http/esquemas.mjs'

export function registerControlRoutes(fastify, { herramientas }) {
  fastify.post(
    '/api/control/bomba',
    {
      /*
       * Accionar una bomba es la operación de más consecuencia de toda la API.
       * Declara ya las dos guardas que hará falta el día que haya usuarios:
       * estar autenticado y tener el rol que puede escribir sobre la planta.
       * Mientras `AUTH_HABILITADA` sea falso las dos dejan pasar. Ver
       * `http/plugins/autenticacion.mjs`.
       */
      onRequest: [fastify.autenticar, fastify.exigirRol('operador')],
      schema: { body: ControlBombaSchema },
    },
    async (request, reply) => {
      const { encender } = request.body
      const accionPedida = encender ? 'encender' : 'apagar'

      const resultado = await herramientas.ejecutar('controlar_bomba', { encender })

      if (!resultado.ok) {
        const esSoloLectura = /ICONICS_READ_ONLY/.test(resultado.error ?? '')
        const status = esSoloLectura ? 403 : 409

        request.log.warn(
          {
            accion: accionPedida,
            estado: status,
            motivo: resultado.error,
            ip: request.ip,
            usuario: request.usuario?.id,
          },
          esSoloLectura
            ? `Intento de ${accionPedida} la bomba rechazado: el puente está en modo solo lectura. ` +
              'Arranca con ICONICS_READ_ONLY=false para habilitar la escritura.'
            : `Intento de ${accionPedida} la bomba rechazado por una guarda de seguridad: ${resultado.error}`
        )

        return reply.code(status).send({
          ok: false,
          error: resultado.error ?? 'No se pudo accionar la bomba.',
        })
      }

      /*
       * Una escritura sobre la planta se registra SIEMPRE y con quién la pidió.
       * Es la línea que se busca cuando alguien pregunta por qué arrancó la
       * bomba a las tres de la mañana, y el único registro que queda de ello
       * fuera del historiador de ICONICS.
       */
      request.log.info(
        {
          accion: resultado.accion,
          tag: resultado.tag,
          ip: request.ip,
          usuario: request.usuario?.id,
        },
        `Bomba accionada desde el tablero: ${resultado.accion} sobre ${resultado.tag} (petición de ${request.ip})`
      )

      return { ok: true, accion: resultado.accion, tag: resultado.tag }
    }
  )
}
