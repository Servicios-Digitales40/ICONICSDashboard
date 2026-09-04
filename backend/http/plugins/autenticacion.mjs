/**
 * Autenticación de usuarios: la guarda que decide quién puede hablar con el
 * puente.
 *
 * ── QUÉ CAMBIÓ EL 03-09-2026, Y POR QUÉ NO ES UN RENOMBRADO ────────
 *
 * Hasta el Plan 20 este archivo era un enchufe sin enchufar: registraba
 * `fastify.autenticar`, las rutas ya lo declaraban, y mientras
 * `AUTH_HABILITADA` fuera falso dejaba pasar a todo el mundo marcado como
 * "operador anónimo". Su cabecera decía cómo se activaría algún día, y
 * terminaba avisando: «esto NO es la autenticación del puente contra ICONICS
 * […] son dos cosas distintas que se confunden fácil por el nombre».
 *
 * **En esta rama son la misma.** No porque se hayan confundido, sino porque el
 * login nativo las unifica a propósito: el técnico entra con su usuario y
 * contraseña DE ICONICS, y esa misma credencial es la que abre el flujo OIDC
 * con el que se leerá la planta. No hay un segundo directorio de usuarios que
 * mantener, ni un JWT propio que firmar, ni la posibilidad de que alguien
 * exista aquí y no allí.
 *
 * De ahí sale la propiedad que hace esto más seguro que lo anterior: **cada
 * lectura y cada escritura salen con el token de quien las pidió**, así que
 * los permisos los aplica ICONICS. Antes todo el mundo escribía con la
 * identidad de máquina del `.env`.
 *
 * ── POR QUÉ YA NO HAY INTERRUPTOR ──────────────────────────────────
 *
 * `AUTH_HABILITADA` desaparece. No es que esté siempre en `true`: es que la
 * pregunta dejó de tener sentido. Sin credenciales de una persona no hay token
 * con el que leer ICONICS, así que una petición sin sesión no es "una petición
 * sin autenticar" — es una petición que no puede hacer nada. Un interruptor
 * para apagar eso sólo serviría para producir 500 en vez de 401.
 *
 * ── EL 401 LLEVA `motivo`, Y NO ES DECORACIÓN ──────────────────────
 *
 * El frontend tiene que distinguir «no has entrado / tu sesión caducó» —vuelve
 * al login, conservando el hilo de la conversación— de cualquier otro 401, que
 * es un problema de red o de permisos y NO debe tirar al usuario fuera. Un 401
 * a secas obliga a adivinar, y adivinar mal aquí significa perder una
 * conversación de minuto y medio.
 */
import fp from 'fastify-plugin'

/** Nombre de la cookie de sesión. Lo comparten el plugin y `sesionRoutes`. */
export const COOKIE_SESION = 'sesion'

async function autenticacionPlugin(fastify, { registro }) {
  if (!registro) {
    /*
     * Puerta deliberada, heredada del diseño anterior y por el mismo motivo:
     * un servidor que arranca con la guarda mal montada serviría toda la API
     * abierta sin un solo síntoma. Antes protegía contra `AUTH_HABILITADA=true`
     * sin implementación; ahora, contra montar el plugin sin registro.
     */
    throw new Error(
      'El plugin de autenticación necesita el registro de sesiones. Sin él, la guarda dejaría ' +
        'pasar todas las peticiones. Ver backend/sesiones/registro.mjs y el montaje en app.mjs.'
    )
  }

  /**
   * Guarda de ruta. Se declara como `onRequest` en toda ruta de `/api/` que no
   * sea `/api/health*` ni el propio login.
   *
   * Deja en `request.sesion` la sesión resuelta —con su `pila`, de donde salen
   * el cliente de ICONICS, las herramientas y el chat de ESA persona— y en
   * `request.usuario` quién es, para el log.
   *
   * @example
   *   fastify.post('/api/control/bomba', {
   *     onRequest: [fastify.autenticar],
   *     schema: { ... },
   *   }, handler)
   */
  fastify.decorate('autenticar', async (request, reply) => {
    const sesion = registro.resolver(request.cookies?.[COOKIE_SESION])

    if (!sesion) {
      request.log.debug(
        { ruta: request.url, ip: request.ip },
        `Petición sin sesión válida a ${request.url}`
      )
      return reply.code(401).send({
        ok: false,
        motivo: 'sesion',
        error: 'Necesitas iniciar sesión con tu usuario de ICONICS.',
      })
    }

    request.sesion = sesion
    request.usuario = { id: sesion.usuario, autenticado: true }
  })

  /**
   * Guarda de rol — se conserva SIN USO y con la cabecera corregida.
   *
   * ── POR QUÉ NO SE IMPLEMENTA, HABIENDO SITIO ───────────────────────
   *
   * Porque la autorización de escritura ya la resuelve ICONICS, y mejor: la
   * orden sale con el token de la persona, así que un técnico sin permiso
   * recibe un 403 del servidor de planta. Un rol local sería una **segunda
   * verdad** sobre quién puede accionar una bomba, mantenida a mano y
   * desincronizada de la primera el día que alguien cambie permisos en
   * ICONICS y no aquí.
   *
   * Sigue existiendo porque `ICONICS_READ_ONLY` marca la misma frontera a
   * nivel de servidor y el día que haga falta marcarla por persona **dentro**
   * del puente —por ejemplo, para negar la escritura a todo el mundo salvo un
   * turno— éste es el sitio. Hoy deja pasar, y lo dice.
   */
  fastify.decorate('exigirRol', () => async () => {})
}

export default fp(autenticacionPlugin, { name: 'autenticacion' })
