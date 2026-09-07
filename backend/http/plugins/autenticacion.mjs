/**
 * Autenticación de usuarios: quién está mirando el tablero.
 *
 * ── QUÉ HACE HOY ───────────────────────────────────────────────────
 *
 * Con `AUTH_HABILITADA=false` —el defecto— nada visible: `fastify.autenticar`
 * deja pasar marcando al peticionario como anónimo, y `exigirRol` no niega
 * nada. Con `AUTH_HABILITADA=true` verifica un JWT de verdad, distingue un
 * token caducado de uno inválido y `exigirRol` responde 403.
 *
 * ── POR QUÉ EL INTERRUPTOR SIGUE APAGADO POR DEFECTO ───────────────
 *
 * Porque encenderlo hace que las treinta y tres rutas exijan token, y **el
 * tablero todavía no sabe pedirlo**: hace falta pantalla de acceso, guardado
 * del token, renovación, y decidir qué pasa cuando caduca a mitad de turno en
 * un wallboard sin teclado. Eso es trabajo de frontend y es el Plan 25.
 *
 * Lo que entrega esta fase (Plan 22 F6) es el backend listo y probado con el
 * interruptor a mano. Encenderlo antes de que el tablero acompañe dejaría el
 * tablero inservible, y no encender nada dejaría el trabajo sin comprobar: por
 * eso la suite lo enciende y comprueba las dos mitades.
 *
 * ── LA MITAD QUE FALTA, Y POR QUÉ NO ESTÁ AQUÍ ─────────────────────
 *
 * El emisor de estos tokens somos nosotros. La decisión de largo plazo es
 * federar contra el IdP OIDC de ICONICS, para no mantener un segundo censo de
 * personas — y eso **no se puede desarrollar sin planta**: con
 * `ICONICS_FAKE=true` el cliente real ni se construye (`app.mjs`), así que el
 * flujo OIDC no se ejercita nunca. Es el Plan 26.
 *
 * La partición no cuesta trabajo tirado: entonces cambia QUIÉN FIRMA el token
 * —esta función `verificar`— y no el modelo. Qué rutas exigen sesión y qué
 * roles hay ya está decidido, escrito y probado desde el Plan 20 F5.
 *
 * ── Y POR QUÉ LA GUARDA NO VA RUTA POR RUTA ────────────────────────
 *
 * Aquí ponía que la lista se declaraba en cada ruta «mientras el criterio está
 * fresco». Se midió el 04-09-2026: la llevaban trece de treinta y tres. No la
 * llevaban `/api/voz`, `/api/reportes`, `/api/diagnostico`,
 * `GET /api/rag/documentos` ni ninguna lectura de `/api/iconics/*`.
 *
 * El motivo es el mismo por el que hace falta `global: true` en el limitador:
 * olvidarla no rompe nada visible. La ruta funciona, sus pruebas pasan, y el
 * hueco sólo aparece el día que se active `AUTH_HABILITADA` — que es el día en
 * que menos se quiere descubrir.
 *
 * Así que `autenticar` la aplica el ÁMBITO donde se registran las rutas de
 * API, con una excepción declarada para las sondas de salud y para el propio
 * login, y hay una prueba (`test/rutas/guardas.test.mjs`) que recorre el
 * inventario real y falla si alguna queda fuera. Lo que sí sigue siendo
 * decisión por ruta es `exigirRol`, que es donde de verdad hay criterio.
 *
 * ── LO QUE NO ES ───────────────────────────────────────────────────
 *
 * Esto NO es la autenticación del puente contra ICONICS: esa vive en
 * `iconics/authenticator.mjs`, es OIDC contra el servidor de planta, y es una
 * sesión de máquina, no de persona. Son dos cosas distintas que se confunden
 * fácil por el nombre. Aquí se trata de QUIÉN está mirando el tablero.
 */
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'

/** El anónimo de siempre, cuando la autenticación está apagada. */
const ANONIMO = Object.freeze({ id: 'anonimo', roles: ['operador'], autenticado: false })

/**
 * Códigos de `fast-jwt` que significan «el token era válido y se le pasó la
 * hora», frente a todo lo demás, que significa «esto no es un token nuestro».
 *
 * La distinción no es cosmética: son dos arreglos distintos. Ante un caducado
 * el cliente vuelve a entrar y sigue; ante uno inválido hay algo mal
 * configurado —o alguien probando— y volver a entrar no lo arregla.
 */
const CADUCADO = new Set(['FAST_JWT_EXPIRED', 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED'])

async function autenticacionPlugin(fastify, { config }) {
  const habilitada = config.auth?.habilitada ?? false

  if (habilitada) {
    /*
     * `sign.expiresIn` aquí y no en cada `sign()`: el plazo de una sesión es
     * una propiedad del emisor, no de quien emite. Puesto en la llamada, la
     * siguiente ruta que firme un token podría olvidarlo y emitir uno eterno.
     */
    await fastify.register(jwt, {
      secret: config.auth.secreto,
      sign: { expiresIn: `${config.auth.minutos}m` },
    })
  }

  /**
   * Guarda de sesión. La aplica el ámbito de la API (ver `app.mjs`).
   *
   * Con la autenticación apagada rellena `request.usuario` igualmente: así el
   * código que lo lee —el diario de accionamientos, el registro— no tiene que
   * distinguir los dos mundos ni ahora ni después.
   */
  fastify.decorate('autenticar', async (request, reply) => {
    if (!habilitada) {
      request.usuario = ANONIMO
      return
    }

    try {
      const payload = await request.jwtVerify()
      request.usuario = {
        id: payload.sub,
        roles: Array.isArray(payload.roles) ? payload.roles : [],
        autenticado: true,
      }
    } catch (error) {
      const caducado = CADUCADO.has(error.code)
      request.log.warn(
        { ruta: request.url, ip: request.ip, codigo: error.code },
        caducado
          ? 'Token de sesión caducado'
          : `Token de sesión rechazado: ${error.code ?? error.message}`
      )

      return reply.code(401).send({
        ok: false,
        error: caducado
          ? 'La sesión ha caducado. Vuelve a entrar.'
          : 'Falta la sesión o el token no es válido.',
        // El cliente necesita distinguirlos SIN leer el texto: uno se arregla
        // volviendo a entrar y el otro no.
        caducado,
      })
    }
  })

  /**
   * Guarda de rol.
   *
   * Leer el tablero lo puede hacer cualquiera con sesión; accionar una bomba,
   * no. Es la misma frontera que hoy marca `ICONICS_READ_ONLY` a nivel de
   * servidor, marcada por persona.
   *
   * Responde **403 y no 404**: un 404 diría que la ruta no existe, y quien lo
   * vea buscará el fallo en el despliegue en vez de en sus permisos. Esconder
   * la existencia de la ruta no aporta nada aquí — el tablero es de la red de
   * planta, no de internet, y su API está publicada en el propio Swagger.
   */
  fastify.decorate('exigirRol', rol => async (request, reply) => {
    if (!habilitada) return

    if (!request.usuario?.roles?.includes(rol)) {
      request.log.warn(
        { ruta: request.url, usuario: request.usuario?.id, rolExigido: rol },
        `Acceso denegado a ${request.url}: el usuario no tiene el rol "${rol}".`
      )
      return reply.code(403).send({
        ok: false,
        error: `Esta acción requiere el rol "${rol}".`,
      })
    }
  })
}

export default fp(autenticacionPlugin, { name: 'autenticacion' })
