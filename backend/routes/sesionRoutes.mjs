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
import {
  construirUrlSsoSilencioso,
  intercambiarCodigoSilencioso,
  obtenerUsuarioDelToken,
  probarCredenciales,
} from '../iconics/authenticator.mjs'
import { COOKIE_SESION } from '../http/plugins/autenticacion.mjs'

const CredencialesSchema = z.object({
  usuario: z.string().min(1, 'Falta el usuario de ICONICS.'),
  contrasena: z.string().min(1, 'Falta la contraseña.'),
})

const CodigoSsoSchema = z.object({
  code: z.string().min(1, 'Falta el código de autorización.'),
  verificador: z.string().min(1, 'Falta el verificador PKCE.'),
})

/*
 * `/auth/silencioso`: la página a la que ICONICS redirige el iframe OCULTO
 * del SSO silencioso. Nadie la ve nunca — ni cuenta como una segunda vista a
 * efectos de §2.12: no es un destino al que alguien navegue, es el buzón
 * técnico donde aterriza un `code` de un solo uso. Dos archivos porque la CSP
 * de este mismo backend (`scriptSrc: ["'self'"]`, sin `unsafe-inline`)
 * prohíbe un `<script>` en línea — la misma regla que protege al asistente
 * protege también a su propio buzón de SSO.
 *
 * `src="silencioso.js"` es RELATIVA a propósito, no `/auth/silencioso.js`.
 * Este backend puede vivir detrás de un proxy inverso bajo una subruta —
 * `/asistente/` cuando el Asistente se empotra en el HMI de ICONICS, para
 * que la cookie de sesión sea del mismo sitio (ver
 * docs/PLAN-20-ASISTENTE.md)—, y una ruta absoluta ignoraría esa subruta:
 * el navegador pediría `/auth/silencioso.js` en la RAÍZ del dominio, fuera
 * del proxy, y ese 404 rompía el SSO silencioso en silencio. Confirmado a
 * mano el 04-09-2026.
 */
const PAGINA_SSO_SILENCIOSO_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>Iniciando sesión…</title></head>' +
  '<body><script src="silencioso.js"></script></body></html>'

const PAGINA_SSO_SILENCIOSO_JS = `
  var params = new URLSearchParams(window.location.search);
  var mensaje = {
    tipo: 'sso-silencioso',
    code: params.get('code'),
    error: params.get('error'),
  };
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(mensaje, window.location.origin);
  }
`

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

  /*
   * ── SSO SILENCIOSO (HMI EMBEBIDO) ──────────────────────────────────
   *
   * Cuando el asistente vive dentro de un `<iframe>` en el HMI nativo de
   * ICONICS, el navegador ya trae la cookie de sesión de ICONICS puesta —el
   * técnico entró una vez, por la pantalla de ICONICS. Estas tres rutas son
   * la vía para no volver a pedírsela. Ver la cabecera de
   * `iconics/authenticator.mjs`.
   */

  // El buzón del iframe oculto. Sin sesión (`fastify.autenticar`) a
  // propósito: es anterior a que exista una.
  fastify.get('/auth/silencioso', async (request, reply) => {
    reply.type('text/html').send(PAGINA_SSO_SILENCIOSO_HTML)
  })
  fastify.get('/auth/silencioso.js', async (request, reply) => {
    reply.type('application/javascript').send(PAGINA_SSO_SILENCIOSO_JS)
  })

  /**
   * De dónde saca el frontend la URL a abrir en su iframe oculto.
   *
   * `habilitado: false` con `ICONICS_FAKE=true` o sin `SSO_REDIRECT_URI`
   * configurada: son las mismas dos condiciones que ya rigen el resto del
   * login — un servidor sin la pieza montada lo dice, no ofrece un intento
   * que va a fallar.
   */
  fastify.get('/api/sesion/silenciosa/iniciar', async (request, reply) => {
    if (config.iconics.fake) return { habilitado: false }

    const intento = construirUrlSsoSilencioso(config)
    if (!intento) return { habilitado: false }

    return { habilitado: true, url: intento.url, verificador: intento.verificador }
  })

  /**
   * Canjea el código que trajo el iframe oculto y abre sesión — el
   * equivalente de `POST /api/sesion` para este camino. Igual que aquél,
   * valida contra ICONICS ANTES de crear la sesión.
   */
  fastify.post(
    '/api/sesion/silenciosa',
    { schema: { body: CodigoSsoSchema } },
    async (request, reply) => {
      if (config.iconics.fake || !config.iconics.ssoRedirectUri) {
        return reply.code(501).send({
          ok: false,
          error: 'El SSO silencioso no está configurado en este servidor.',
        })
      }

      const { code, verificador } = request.body

      let tokens
      try {
        tokens = await intercambiarCodigoSilencioso(config, { code, codeVerifier: verificador })
      } catch (error) {
        request.log.warn({ ip: request.ip, motivo: error.message }, `SSO silencioso rechazado: ${error.message}`)
        return reply.code(401).send({ ok: false, error: 'ICONICS rechazó el inicio de sesión único.' })
      }

      let usuario
      try {
        usuario = await obtenerUsuarioDelToken(config, tokens.access_token)
      } catch (error) {
        request.log.error({ motivo: error.message }, `SSO silencioso: ${error.message}`)
        return reply.code(502).send({
          ok: false,
          error: 'No se pudo identificar al usuario autenticado en ICONICS.',
        })
      }

      /*
       * ── RECONCILIACIÓN, NO SIEMPRE UNA SESIÓN NUEVA ────────────────────
       *
       * Esta ruta no la llama sólo el login inicial: el frontend la vuelve a
       * llamar cada minuto (`SesionProvider.jsx`, sondeo de SLO por
       * sondeo) para saber si la sesión de ICONICS sigue viva — y, con
       * "In-house applications use web login" activo, un código nuevo no
       * significa necesariamente una persona nueva.
       *
       * Si la cookie que ya trae la petición resuelve a una sesión de la
       * MISMA persona, no se crea una sesión duplicada — sólo se confirma.
       * Crear una cada minuto no sería un error grosero, pero sí una fuga
       * lenta de sesiones y cookies reescritas sin motivo.
       *
       * Si resuelve a una sesión de OTRA persona —el caso que este mismo
       * cambio existe para cubrir: alguien cerró sesión en ICONICS y otro
       * técnico entró, sin que la sesión de ESTE puente llegara a caducar de
       * por medio—, esa sesión vieja se cierra antes de abrir la nueva: dos
       * identidades no pueden compartir la misma pila de ICONICS a la vez.
       */
      const sesionActual = registro.resolver(request.cookies?.[COOKIE_SESION])
      if (sesionActual && sesionActual.usuario === usuario) {
        return reply.send({ ok: true, usuario, sinCambios: true })
      }
      if (sesionActual) registro.cerrar(request.cookies[COOKIE_SESION])

      try {
        // `contrasena: null` — nadie la escribió. Ver la guarda en
        // `authenticator.mjs#authenticate` para lo que eso implica el día
        // que el refresh token falle.
        const sesion = registro.crear({ usuario, contrasena: null, tokens })
        return reply
          .setCookie(COOKIE_SESION, sesion.id, opcionesDeCookie(config))
          .send({ ok: true, usuario, expiraEn: new Date(sesion.expiraEn).toISOString() })
      } catch (error) {
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
