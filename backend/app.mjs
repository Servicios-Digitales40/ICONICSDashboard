/**
 * Ensamblado de la aplicación: crea las dependencias, registra las rutas y
 * devuelve el manejador de peticiones.
 *
 * Está separado de `server.mjs` para poder montar la app entera —con una
 * configuración de prueba— sin abrir un puerto.
 */
import { createRouter } from './http/router.mjs'
import { sendError, sendPreflight, sendText } from './http/responses.mjs'
import { createStaticFileServer, isAssetPath } from './http/staticFiles.mjs'
import { createAuthenticator } from './iconics/authenticator.mjs'
import { createIconicsClient } from './iconics/client.mjs'
import { logger } from './logger.mjs'
import { registerIconicsRoutes } from './routes/iconicsRoutes.mjs'
import { registerSystemRoutes } from './routes/systemRoutes.mjs'

export function createApp(config) {
  const startedAt = Date.now()

  logger.setLevel(config.logLevel)

  const authenticator = createAuthenticator(config)
  const client = createIconicsClient(config, authenticator)
  const staticFiles = createStaticFileServer(config.staticDir)

  const router = createRouter()
  registerSystemRoutes(router, { config, client, authenticator, startedAt })
  registerIconicsRoutes(router, { config, client })

  async function route(request, response) {
    if (!request.url) {
      sendText(response, 400, 'Bad request')
      return
    }

    // El preflight se responde antes de cualquier otra cosa: no consulta nada
    // y contestarlo tarde retrasa toda petición con cuerpo JSON.
    if (request.method === 'OPTIONS') {
      sendPreflight(response)
      return
    }

    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)
    logger.info('Request', {
      method: request.method,
      url: url.pathname,
      ip: request.socket.remoteAddress ?? 'unknown',
    })

    if (await router.handle({ request, response, url })) return

    // Sin ruta de API: es el frontend. Los archivos del build se sirven tal
    // cual; cualquier otra ruta la resuelve el enrutador del navegador sobre
    // el index.html (comportamiento estándar de una SPA).
    if (isAssetPath(url.pathname)) {
      await staticFiles.serve(response, url.pathname)
      return
    }

    await staticFiles.serveIndex(response)
  }

  /**
   * Frontera de errores. Sin ella, cualquier excepción no prevista dejaba el
   * socket abierto y el cliente esperando hasta su propio timeout, sin nada
   * en el log que lo explicara.
   */
  return async function handleRequest(request, response) {
    try {
      await route(request, response)
    } catch (error) {
      logger.error('Unhandled request error', { url: request.url, err: error })
      if (!response.headersSent) {
        sendError(response, 500, 'Internal server error.')
      } else {
        response.destroy()
      }
    }
  }
}
