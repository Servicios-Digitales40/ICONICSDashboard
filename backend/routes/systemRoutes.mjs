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
  router.get('/api/health', async ({ response }) => {
    const connectivity = await client.ping()
    const tokenValid = authenticator.hasValidToken()

    sendJson(response, 200, {
      status: resolveStatus({ reachable: connectivity.reachable, tokenValid }),
      iconicsReachable: connectivity.reachable,
      tokenValid,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      ...(connectivity.reason ? { reason: connectivity.reason } : {}),
    })
  })

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
