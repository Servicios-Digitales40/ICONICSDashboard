/**
 * Resuelve la cookie de sesión y adjunta el cliente ICONICS de esa persona.
 * Un 401 con motivo=sesion permite al frontend volver al login conservando
 * el hilo. No existe un directorio de usuarios ni una guarda de roles local.
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

  // ICONICS autoriza las escrituras con el token de la sesión; no hay roles locales.

}

export default fp(autenticacionPlugin, { name: 'autenticacion' })
