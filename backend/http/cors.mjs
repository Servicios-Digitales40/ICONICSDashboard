/**
 * CORS: quién puede llamar a esta API desde otro origen.
 *
 * Antes había un `Access-Control-Allow-Origin: *` constante en
 * `responses.mjs`, y viajaba en TODAS las respuestas, no sólo en el preflight.
 * Eso hacía falta en desarrollo —el dev server de Vite es otro puerto, luego
 * otro origen— pero en producción el backend sirve el bundle desde su mismo
 * origen y no necesita CORS en absoluto. El comodín sólo servía para que
 * cualquier página abierta en un navegador de la planta pudiera llamar a la
 * API por la espalda del usuario, con la sesión privilegiada del puente.
 *
 * Ahora la lista es explícita (`CORS_ORIGINS`) y está **vacía por defecto**.
 *
 * Las cabeceras se aplican con `setHeader()` una sola vez por petición, antes
 * del despacho, en vez de repetirse en cada función de respuesta. Node las
 * fusiona con las de `writeHead()`, así que las heredan por igual el JSON, el
 * texto, los estáticos y el 405 del router — y no pueden volver a divergir.
 */

const ALLOWED_METHODS = 'GET, POST, PUT, OPTIONS'
const ALLOWED_HEADERS = 'Content-Type, Authorization'

/**
 * @param {readonly string[]} allowedOrigins Lista de `CORS_ORIGINS`.
 */
export function createCors(allowedOrigins) {
  const allowed = new Set(allowedOrigins)

  /** El origen de la petición si está autorizado; cadena vacía si no. */
  function resolveOrigin(request) {
    const origin = request.headers.origin
    if (!origin) return ''
    return allowed.has(origin.replace(/\/+$/, '')) ? origin : ''
  }

  /**
   * Se devuelve el origen concreto y nunca `*`, para que la respuesta siga
   * siendo válida si algún día se envían credenciales. `Vary: Origin` va
   * siempre que haya lista: sin él, una caché intermedia puede servirle a un
   * origen la respuesta que se autorizó para otro.
   */
  function apply(request, response) {
    if (allowed.size === 0) return

    response.setHeader('Vary', 'Origin')

    const origin = resolveOrigin(request)
    if (!origin) return

    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS)
    response.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS)
  }

  /**
   * Respuesta al preflight. Se contesta 204 aun cuando el origen no esté
   * autorizado: sin las cabeceras de permiso, el navegador bloquea la
   * petición real por sí mismo, y devolver un error aquí sólo enmascararía
   * el motivo con un fallo de red genérico en la consola.
   */
  function preflight(request, response) {
    apply(request, response)
    response.writeHead(204)
    response.end()
  }

  return { apply, preflight }
}
