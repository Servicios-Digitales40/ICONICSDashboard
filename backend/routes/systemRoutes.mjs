/**
 * Rutas propias del puente: salud y contexto de cabecera.
 */
import { sendError, sendJson } from '../http/responses.mjs'
import { isSafePointName } from '../iconics/validation.mjs'

/**
 * Tres estados, no dos, porque son tres situaciones con tres arreglos
 * distintos: `ok` todo bien; `degraded` se llega al servidor pero no hay token
 * válido (credenciales o permisos); `error` no se llega (red, servicio caído
 * o `ICONICS_API_BASE` sin configurar).
 */
function resolveStatus({ reachable, tokenValid }) {
  if (!reachable) return 'error'
  return tokenValid ? 'ok' : 'degraded'
}

export function registerSystemRoutes(router, { config, client, authenticator, startedAt }) {
  const uptimeSeconds = () => Math.floor((Date.now() - startedAt) / 1000)

  /**
   * ¿Respira el proceso? No pregunta nada a ICONICS, y ese es todo el punto:
   * es la sonda del orquestador, que corre cada pocos segundos para siempre.
   * Con la de abajo, un contenedor sondeando cada 10 s son 8 640 pings
   * diarios contra el servidor de planta sólo para saber si Node está vivo —y
   * peor: reiniciaría el contenedor por una avería que no es suya, cuando lo
   * único que pasa es que ICONICS está caído.
   */
  router.get('/api/health/live', async ({ response }) => {
    sendJson(response, 200, {
      status: 'ok',
      version: config.version,
      uptimeSeconds: uptimeSeconds(),
      timestamp: new Date().toISOString(),
    })
  })

  /**
   * ¿Puede este puente servir datos de verdad? Sí llama a ICONICS. Es la que
   * mira el monitor y la que se abre cuando alguien dice "no carga".
   */
  async function readiness({ response }) {
    const connectivity = await client.ping()
    const tokenValid = authenticator.hasValidToken()

    sendJson(response, 200, {
      status: resolveStatus({ reachable: connectivity.reachable, tokenValid }),
      version: config.version,
      iconicsReachable: connectivity.reachable,
      tokenValid,
      readOnly: config.iconics.readOnly,
      uptimeSeconds: uptimeSeconds(),
      timestamp: new Date().toISOString(),
      ...(connectivity.reason ? { reason: connectivity.reason } : {}),
    })
  }

  // `/api/health` se mantiene como estaba —con `status`, `iconicsReachable` y
  // `tokenValid`— porque ya hay documentación y guiones que la usan; `ready`
  // es el nombre que dice lo que hace. Son la misma ruta con dos nombres, no
  // dos comportamientos.
  router.get('/api/health', readiness)
  router.get('/api/health/ready', readiness)

  router.get('/api/context', async ({ response, url }) => {
    const pointName = url.searchParams.get('pointName') ?? config.iconics.defaultPointName

    if (pointName && !isSafePointName(pointName)) {
      return sendError(response, 400, 'Invalid pointName parameter.')
    }

    sendJson(response, 200, {
      context: config.context,
      iconics: pointName ? await client.readPoint(pointName) : null,
    })
  })
}
