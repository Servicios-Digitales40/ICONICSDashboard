/**
 * Autenticación de usuarios: el punto donde se enchufará, sin enchufar nada.
 *
 * ── QUÉ HACE HOY ───────────────────────────────────────────────────
 *
 * Nada visible. Registra un decorador `fastify.autenticar` que las rutas ya
 * pueden declarar en su `onRequest`, y que mientras `AUTH_HABILITADA` sea
 * falso deja pasar todas las peticiones marcando al usuario como anónimo.
 *
 * ── POR QUÉ EXISTE AHORA SI NO SE USA ──────────────────────────────
 *
 * Porque el trabajo caro de añadir autenticación no es validar un token: es
 * decidir QUÉ RUTAS la exigen, y esa decisión se toma peor a posteriori. Al
 * declararla ruta por ruta desde ya, la lista queda escrita mientras el
 * criterio está fresco, se revisa en una sola lectura de `app.mjs`, y el día
 * que se active no hay que auditar treinta y tres rutas de golpe para
 * descubrir cuáles quedaron abiertas por olvido.
 *
 * El precio de tenerlo hoy es una función que devuelve `next()`. El precio de
 * no tenerlo es una migración con prisa el día que haga falta.
 *
 * ── CÓMO SE ACTIVARÁ ───────────────────────────────────────────────
 *
 * 1. `npm i @fastify/jwt` (o `@fastify/session` si se prefiere cookie).
 * 2. Registrar el plugin aquí y sustituir el cuerpo de `verificar()` por la
 *    verificación real: `await request.jwtVerify()`.
 * 3. Poner `AUTH_HABILITADA=true` en el entorno.
 *
 * Las rutas no cambian: ya declaran cuál necesita sesión. Ver `app.mjs`.
 *
 * ── LO QUE NO ES ───────────────────────────────────────────────────
 *
 * Esto NO es la autenticación del puente contra ICONICS: esa vive en
 * `iconics/authenticator.mjs`, es OIDC contra el servidor de planta, y es una
 * sesión de máquina, no de persona. Son dos cosas distintas que se confunden
 * fácil por el nombre. Aquí se trata de QUIÉN está mirando el tablero.
 */
import fp from 'fastify-plugin'

async function autenticacionPlugin(fastify, { config }) {
  const habilitada = config.auth?.habilitada ?? false

  if (habilitada) {
    /*
     * Puerta deliberada: con `AUTH_HABILITADA=true` pero sin implementación,
     * el servidor NO arranca. La alternativa —dejarlo pasar con un aviso—
     * significaría que alguien pide autenticación, ve el servidor levantar y
     * cree que está protegido.
     */
    throw new Error(
      'AUTH_HABILITADA=true pero la autenticación de usuarios todavía no está implementada. ' +
        'Ver las instrucciones en backend/http/plugins/autenticacion.mjs antes de activarla.'
    )
  }

  /**
   * Guarda de ruta. Se declara como `onRequest` en las rutas que lo necesiten.
   *
   * @example
   *   fastify.post('/api/iconics/write', {
   *     onRequest: [fastify.autenticar],
   *     schema: { ... },
   *   }, handler)
   */
  fastify.decorate('autenticar', async request => {
    if (!habilitada) {
      /*
       * Sin autenticación, todo el mundo es el mismo operador anónimo. Se
       * rellena igualmente para que el código que lea `request.usuario` no
       * tenga que distinguir los dos mundos, ni ahora ni después.
       */
      request.usuario = { id: 'anonimo', roles: ['operador'], autenticado: false }
      return
    }

    // Aquí irá `await request.jwtVerify()` y el volcado del payload a
    // `request.usuario`. Ver la cabecera.
  })

  /**
   * Guarda de rol, para cuando haya roles de verdad.
   *
   * Se deja escrita porque la distinción que va a hacer falta ya se conoce:
   * leer el tablero lo puede hacer cualquiera en la red de planta; accionar
   * una bomba, no. Es la misma frontera que hoy marca `ICONICS_READ_ONLY`
   * a nivel de servidor y que entonces se marcará por persona.
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
