/**
 * Entrar, salir y saber quién soy.
 *
 * Tres rutas y una decisión de fondo: **las credenciales se validan contra
 * ICONICS ANTES de crear la sesión**. `probarCredenciales` recorre el flujo
 * OIDC completo y devuelve los tokens; si ICONICS las rechaza, aquí no se
 * guarda nada.
 *
 * La alternativa —crear la sesión y descubrir el rechazo en la primera
 * lectura— convertiría «me equivoqué de contraseña» en un 401 suelto en mitad
 * de la primera pregunta al asistente, que quien lo ve interpreta como «el
 * servidor de planta está caído». El error tiene que salir donde se cometió.
 *
 * ── LOS TOKENS DEL LOGIN SE REAPROVECHAN ───────────────────────────
 *
 * `probarCredenciales` ya recorrió los cinco saltos, así que sus tokens viajan
 * al registro y de ahí al autenticador de la sesión. Sin eso, entrar costaría
 * DOS flujos completos contra el servidor de seguridad de ICONICS: uno para
 * comprobar y otro para la primera lectura.
 *
 * ── POR QUÉ COOKIE Y NO UN TOKEN EN EL CUERPO ──────────────────────
 *
 * Porque `httpOnly` es lo único que impide que un XSS en la página del
 * asistente se lleve la sesión. Un token que el frontend guarda en
 * `localStorage` para mandarlo en una cabecera es legible por cualquier script
 * que llegue a ejecutarse, y esta aplicación **renderiza markdown que viene de
 * un modelo de lenguaje**: es exactamente el sitio donde no se quiere apostar
 * a que nunca habrá una inyección.
 *
 * `SameSite=Strict` cubre el CSRF que la cookie introduce: el navegador no la
 * manda en peticiones iniciadas por otro sitio, así que no hace falta un token
 * antifalsificación aparte.
 */
import { z } from 'zod'
import { probarCredenciales } from '../iconics/authenticator.mjs'
import { COOKIE_SESION } from '../http/plugins/autenticacion.mjs'

const CredencialesSchema = z.object({
  usuario: z.string().min(1, 'Falta el usuario de ICONICS.'),
  contrasena: z.string().min(1, 'Falta la contraseña.'),
})

/**
 * Opciones de la cookie de sesión.
 *
 * `secure` sólo en producción, y es un requisito de despliegue, no un detalle:
 * con `secure` el navegador no manda la cookie por HTTP, así que **una
 * instalación de producción servida por HTTP no podrá iniciar sesión**. Está
 * anotado en `README.md` y en `docs/PLAN-20-ASISTENTE.md` §8.4. En desarrollo
 * queda `false` porque el dev server de Vite es HTTP.
 */
function opcionesDeCookie(config) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProduction,
    path: '/',
  }
}

export function registerSesionRoutes(fastify, { config, registro }) {
  /**
   * Quién soy. Es lo primero que consulta el frontend al cargar, para decidir
   * entre enseñar el login o el asistente.
   *
   * NO lleva `fastify.autenticar`: la guarda respondería 401 con un log de
   * petición rechazada, y aquí "no hay sesión" es una respuesta legítima y
   * esperada —la de alguien que acaba de abrir la página—, no un intento
   * fallido de entrar.
   */
  fastify.get('/api/sesion', async (request, reply) => {
    const sesion = registro.resolver(request.cookies?.[COOKIE_SESION])

    if (!sesion) {
      return reply.code(401).send({ ok: false, motivo: 'sesion', error: 'No hay sesión abierta.' })
    }
    return { ok: true, usuario: sesion.usuario }
  })

  fastify.post(
    '/api/sesion',
    {
      schema: { body: CredencialesSchema },
      /*
       * Límite propio y mucho más estrecho que el general de `/api/`: esta es
       * la única ruta donde adivinar sirve de algo. Cinco intentos por minuto
       * y por IP no estorban a quien se equivoca al teclear, y hacen inviable
       * probar contraseñas a ritmo de red.
       */
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { usuario, contrasena } = request.body

      let tokens = null
      try {
        /*
         * ── CON EL TRANSPORTE FALSO NO HAY A QUIÉN PREGUNTAR ───────────
         *
         * `ICONICS_FAKE=true` sirve las señales que generan los simuladores
         * de `shared/eva/` sin salir a la red: no hay servidor de seguridad contra el que
         * validar, y `probarCredenciales` fallaría en el primer salto.
         *
         * Se acepta cualquier credencial NO VACÍA. No es un agujero: es el
         * mismo trato que el resto del backend le da a ese modo —ningún dato
         * es real y el arranque lo grita— y sin esto no se podría desarrollar
         * ni probar el login sin red a planta, que es la mitad del valor del
         * transporte falso. `ICONICS_FAKE=true` nunca va a producción
         * (CLAUDE.md §2.8).
         *
         * El `usuario` sí se conserva y viaja a la sesión: las pruebas de que
         * dos sesiones no se pisan necesitan poder distinguirlas.
         */
        tokens = config.iconics.fake
          ? null
          : await probarCredenciales(config, { usuario, contrasena })
      } catch (error) {
        /*
         * `warn` y con la IP: una ráfaga de estas líneas es la señal de un
         * intento de fuerza bruta, y es la única forma de verlo desde el log.
         * El motivo va SIN la contraseña — `logger.mjs` la redacta de todos
         * modos, pero no se le pasa siquiera.
         */
        request.log.warn(
          { usuario, ip: request.ip, motivo: error.message },
          `Login rechazado para "${usuario}": ${error.message}`
        )
        return reply.code(401).send({
          ok: false,
          error: 'Usuario o contraseña incorrectos para el servidor de ICONICS.',
        })
      }

      try {
        const sesion = registro.crear({ usuario, contrasena, tokens })
        return reply
          .setCookie(COOKIE_SESION, sesion.id, opcionesDeCookie(config))
          .send({ ok: true, usuario, expiraEn: new Date(sesion.expiraEn).toISOString() })
      } catch (error) {
        /*
         * Capacidad, no credenciales. El 503 lo dice: las credenciales eran
         * buenas y volver a intentarlo más tarde puede funcionar. Un 401 aquí
         * mandaría al técnico a revisar una contraseña que está bien.
         */
        if (error instanceof RangeError) {
          request.log.error({ usuario, motivo: error.message }, error.message)
          return reply.code(503).send({ ok: false, error: error.message })
        }
        throw error
      }
    }
  )

  /**
   * Salir. Idempotente a propósito: cerrar una sesión que ya no existe
   * responde 200 y borra la cookie igual. Un 404 aquí sólo serviría para que
   * el frontend tuviera que distinguir dos casos que acaban en lo mismo —el
   * usuario fuera— y para dejar una cookie muerta en el navegador.
   */
  fastify.delete('/api/sesion', async (request, reply) => {
    const id = request.cookies?.[COOKIE_SESION]
    if (id) registro.cerrar(id)

    return reply
      .clearCookie(COOKIE_SESION, opcionesDeCookie(config))
      .send({ ok: true })
  })
}
