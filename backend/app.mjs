/**
 * Ensamblado de la aplicación: crea las dependencias, registra las rutas y
 * devuelve el manejador de peticiones.
 *
 * Está separado de `server.mjs` para poder montar la app entera —con una
 * configuración de prueba— sin abrir un puerto.
 */
import { createCors } from './http/cors.mjs'
import { createRateLimiter } from './http/rateLimit.mjs'
import { createRouter } from './http/router.mjs'
import { sendError, sendText } from './http/responses.mjs'
import { createStaticFileServer, isAssetPath } from './http/staticFiles.mjs'
import { createChat } from './ia/chat.mjs'
import { createCola } from './ia/cola.mjs'
import { createIndiceDocumentos } from './ia/documentos.mjs'
import { createHerramientas } from './ia/herramientas.mjs'
import { createVoz } from './ia/voz.mjs'
import { createAuthenticator } from './iconics/authenticator.mjs'
import { createIconicsClient } from './iconics/client.mjs'
import { createFakeIconicsClient } from './iconics/fakeClient.mjs'
import { logger } from './logger.mjs'
import { registerChatRoutes } from './routes/chatRoutes.mjs'
import { registerControlRoutes } from './routes/controlRoutes.mjs'
import { registerIconicsRoutes } from './routes/iconicsRoutes.mjs'
import { registerReportesRoutes } from './routes/reportesRoutes.mjs'
import { registerSystemRoutes } from './routes/systemRoutes.mjs'
import { registerVozRoutes } from './routes/vozRoutes.mjs'

export function createApp(config) {
  const startedAt = Date.now()

  logger.setLevel(config.logLevel)

  const authenticator = createAuthenticator(config)
  // `ICONICS_FAKE=true` (Plan 14 §7.1): el resto del backend —rutas, chat,
  // herramientas— no se entera de cuál de los dos corre, porque los dos
  // cumplen la misma firma. Con el falso arriba se avisa alto: es el único
  // modo en el que ningún dato de este proceso viene de la planta.
  if (config.iconics.fake) {
    logger.warn('ICONICS_FAKE=true: sirviendo datos SIMULADOS, ningún dato viene de la planta')
  }
  const client = config.iconics.fake
    ? createFakeIconicsClient({ limits: config.limits })
    : createIconicsClient(config, authenticator)
  const staticFiles = createStaticFileServer(config.staticDir)
  const cors = createCors(config.corsOrigins)
  const rateLimiter = createRateLimiter({
    windowMs: config.limits.rateLimitWindowMs,
    max: config.limits.rateLimitMax,
    trustProxy: config.trustProxy,
  })

  // El asistente se monta siempre, pero sin `IA_BASE` sus rutas responden
  // 503 diciendo qué falta. Montarlo solo cuando está configurado dejaría
  // `/api/chat` cayendo al respaldo de la SPA, que devuelve el index.html con
  // un 200: el frontend creería que el asistente existe y que su respuesta es
  // una página HTML. Es el mismo motivo por el que la escritura en modo solo
  // lectura responde 403 y no 404.
  // `maquinasConHistoria` ya no se pasa: qué señal tiene historia no es
  // configurable en esta instalación, es un hecho medido del servidor y vive
  // en el catálogo (`shared/eva/senales.js`, campo `historizado`). Ver la
  // cabecera de `ia/herramientas.mjs`.
  //
  // La documentación de planta se monta sólo si hay carpeta configurada. Sin
  // `IA_DOCS_DIR` la herramienta `consultar_documentacion` existe igual pero
  // responde que no hay documentación en este servidor — que es un hecho que el
  // asistente puede contar, y no un hueco silencioso donde se pondría a
  // contestar de memoria sobre un manual que nadie le ha dado.
  //
  // La carga es PEREZOSA a propósito: leer y trocear los PDF de una carpeta
  // grande retrasaría el arranque del puente, y el puente sirve las pantallas
  // de planta, que no dependen del asistente. El primer `buscar()` la dispara.
  const indiceDocumentos = config.ia.docsDir
    ? createIndiceDocumentos({
      carpeta: config.ia.docsDir,
      embeddingBase: config.ia.embeddingBase,
      embeddingModelo: config.ia.embeddingModelo,
    })
    : null

  // `readOnly` se pasa porque el catálogo YA NO es de solo lectura entero:
  // `controlar_bomba` escribe, y necesita la misma puerta que usa
  // `/api/iconics/write` para negarse cuando el puente está en solo lectura.
  const herramientas = createHerramientas({
    client,
    turnos: config.ia.turnos,
    readOnly: config.iconics.readOnly,
    indiceDocumentos,
    reportes: config.reportes,
    historyConcurrencia: config.limits.historyConcurrencia,
  })
  const chat = createChat({ config, herramientas })

  // Las consultas se atienden de una en una, pero NINGUNA se rechaza por eso:
  // el que llega segundo espera su turno con el flujo abierto y sabiendo
  // cuántos tiene delante. Ver la cabecera de `ia/cola.mjs`.
  const cola = createCola()

  // El dictado se monta siempre, igual que el chat: sin `IA_WHISPER_BASE` sus
  // rutas responden 503 diciendo qué falta. Montarlas sólo cuando está
  // configurado las dejaría cayendo al respaldo de la SPA, que devuelve el
  // index.html con un 200 — y el frontend creería que existe el micrófono y que
  // una página HTML es una transcripción.
  const voz = createVoz({ config })

  const router = createRouter()
  registerSystemRoutes(router, { config, client, authenticator, startedAt })
  registerIconicsRoutes(router, { config, client })
  registerControlRoutes(router, { config, herramientas })
  registerChatRoutes(router, { config, chat, cola })
  registerVozRoutes(router, { config, voz })
  registerReportesRoutes(router, { config })

  async function route(request, response) {
    if (!request.url) {
      sendText(response, 400, 'Bad request')
      return
    }

    // Las cabeceras de CORS se fijan aquí, una sola vez, y Node las fusiona
    // con las de cada `writeHead()`: así las heredan por igual el JSON, los
    // estáticos y el 405 del router, sin que ninguna función de respuesta
    // tenga que acordarse de ellas.
    cors.apply(request, response)

    // El preflight se responde antes de cualquier otra cosa: no consulta nada
    // y contestarlo tarde retrasa toda petición con cuerpo JSON.
    if (request.method === 'OPTIONS') {
      cors.preflight(request, response)
      return
    }

    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)
    logger.info('Request', {
      method: request.method,
      url: url.pathname,
      ip: request.socket.remoteAddress ?? 'unknown',
    })

    // El límite cubre sólo la API. Los estáticos quedan fuera a propósito:
    // abrir el tablero son decenas de peticiones de archivos en un segundo, y
    // contarlas gastaría la cuota del cliente antes de que la primera vista
    // llegue a pedir un dato.
    if (url.pathname.startsWith('/api/')) {
      const { allowed, retryAfterSeconds } = rateLimiter.check(request)
      if (!allowed) {
        logger.warn('Rate limit exceeded', {
          url: url.pathname,
          ip: request.socket.remoteAddress ?? 'unknown',
        })
        response.setHeader('Retry-After', String(retryAfterSeconds))
        sendError(response, 429, 'Demasiadas peticiones. Inténtalo de nuevo en unos segundos.')
        return
      }
    }

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
