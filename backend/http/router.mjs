/**
 * Router mínimo por método y ruta exacta.
 *
 * Sustituye a la cadena de quince `if (pathname === ...)` que era el
 * despachador anterior: allí el orden de los `if` era significativo aunque
 * nada lo dijera, olvidar un `return` hacía caer la petición en el siguiente
 * bloque, y la tabla de rutas solo existía leyendo el archivo entero.
 *
 * No hay parámetros de ruta a propósito: la API no los usa (todo va en query
 * string), y un emparejador de patrones sin caso de uso es código muerto.
 */

export function createRouter() {
  /** @type {Map<string, Map<string, Function>>} ruta → método → handler */
  const routes = new Map()

  function register(method, path, handler) {
    if (!routes.has(path)) routes.set(path, new Map())
    routes.get(path).set(method, handler)
    return api
  }

  const api = {
    get: (path, handler) => register('GET', path, handler),
    post: (path, handler) => register('POST', path, handler),
    put: (path, handler) => register('PUT', path, handler),

    /**
     * @returns {Promise<boolean>} `true` si la ruta existía y se atendió;
     *   `false` si no hay ruta y la petición debe seguir al servidor estático.
     */
    async handle(context) {
      const { request, response, url } = context
      const byMethod = routes.get(url.pathname)
      if (!byMethod) return false

      const handler = byMethod.get(request.method)
      if (!handler) {
        // La ruta existe pero no con este método: 405 con `Allow` es la
        // respuesta correcta, y distingue "no implementado" de "no existe".
        response.writeHead(405, { Allow: [...byMethod.keys()].join(', ') })
        response.end()
        return true
      }

      await handler(context)
      return true
    },
  }

  return api
}
