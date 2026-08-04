/**
 * Rutas `/api/iconics/*`.
 *
 * Cada handler hace tres cosas y sólo tres: valida la entrada, llama al
 * cliente y traduce el sobre a una respuesta HTTP. Nada de `fetch` aquí — eso
 * vive en `iconics/client.mjs`.
 */
import { readJsonBody, RequestBodyError } from '../http/requestBody.mjs'
import { sendError, sendJson } from '../http/responses.mjs'
import { isSafeHistoryArgument, isSafePointName, parsePointList } from '../iconics/validation.mjs'

/** Formato de fecha local `YYYY-MM-DD HH:mm:ss` que espera `/AlarmHistory`. */
function formatLocalTimestamp(date) {
  const pad = value => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return `${day} ${time}`
}

/**
 * El sobre del cliente ya trae su propio `status`; en el camino feliz se
 * responde 200 porque `status` puede ser cualquier 2xx del servidor.
 */
function sendResult(response, result) {
  sendJson(response, result.ok ? 200 : result.status, result)
}

export function registerIconicsRoutes(router, { config, client }) {
  const { defaultPointName } = config.iconics
  const { maxRequestBodyBytes, maxAlarmHours } = config.limits

  /**
   * Lee el cuerpo JSON. Si es inválido responde el error y devuelve `null`,
   * para que el handler corte con un `if (!body) return`.
   *
   * Cualquier otro fallo se deja propagar hasta la frontera de errores de
   * `app.mjs`: aquí sólo se traducen los que tienen una respuesta pensada.
   */
  async function parseBody(request, response) {
    try {
      return await readJsonBody(request, maxRequestBodyBytes)
    } catch (error) {
      if (!(error instanceof RequestBodyError)) throw error
      sendError(response, error.statusCode, error.message)
      return null
    }
  }

  /* ── Lectura ──────────────────────────────────────────────────────── */

  router.get('/api/iconics/data', async ({ response, url }) => {
    const pointName = url.searchParams.get('pointName') ?? defaultPointName

    if (pointName && !isSafePointName(pointName)) {
      return sendError(response, 400, 'Invalid pointName parameter.')
    }

    const result = await client.readPoint(pointName)
    sendJson(response, result.status, result)
  })

  router.get('/api/iconics/data/batch', async ({ response, url }) => {
    const points = parsePointList(url.searchParams.get('points') ?? '')

    if (points.length === 0) {
      return sendError(response, 400, 'points parameter is required (comma-separated list).')
    }
    if (!points.every(isSafePointName)) {
      return sendError(response, 400, 'One or more point names are invalid.')
    }

    sendResult(response, await client.readPoints(points))
  })

  router.get('/api/iconics/history', async ({ response, url }) => {
    const pointName = url.searchParams.get('pointName') ?? ''
    const range = {
      startDate: url.searchParams.get('startDate') ?? '',
      endDate: url.searchParams.get('endDate') ?? '',
      aggregate: url.searchParams.get('aggregate') ?? '',
      interval: url.searchParams.get('interval') ?? '',
    }

    if (!isSafePointName(pointName)) {
      return sendError(response, 400, 'pointName is required and must be valid.')
    }

    const invalid = Object.entries(range).find(
      ([, value]) => value && !isSafeHistoryArgument(value)
    )
    if (invalid) {
      return sendError(response, 400, `Invalid ${invalid[0]} parameter.`)
    }

    sendResult(response, await client.readHistory({ pointName, ...range }))
  })

  router.get('/api/iconics/browse', async ({ response, url }) => {
    const path = url.searchParams.get('path') ?? ''

    if (path && !isSafePointName(path)) {
      return sendError(response, 400, 'Invalid path parameter.')
    }

    sendResult(response, await client.browse(path))
  })

  router.get('/api/iconics/points', async ({ response, url }) => {
    const query = url.searchParams.get('query') ?? ''

    if (query && !isSafePointName(query)) {
      return sendError(response, 400, 'Invalid query parameter.')
    }

    sendResult(response, await client.search(query))
  })

  router.get('/api/iconics/userinfo', async ({ response }) => {
    sendResult(response, await client.readUserInfo())
  })

  /* ── Escritura ────────────────────────────────────────────────────── */

  router.post('/api/iconics/write', async ({ request, response }) => {
    const body = await parseBody(request, response)
    if (!body) return

    const { pointName, value } = body
    if (!pointName || !isSafePointName(String(pointName))) {
      return sendError(response, 400, 'pointName is required and must be valid.')
    }
    if (value === undefined || value === null) {
      return sendError(response, 400, 'value is required.')
    }

    sendResult(response, await client.writePoint(pointName, value))
  })

  router.post('/api/iconics/write/batch', async ({ request, response }) => {
    const body = await parseBody(request, response)
    if (!body) return

    const { items } = body
    if (!Array.isArray(items) || items.length === 0) {
      return sendError(response, 400, 'items array is required ([{ pointName, value }]).')
    }

    for (const item of items) {
      if (!item?.pointName || !isSafePointName(String(item.pointName))) {
        return sendError(response, 400, `Invalid pointName: ${item?.pointName}`)
      }
      if (item.value === undefined || item.value === null) {
        return sendError(response, 400, `value is required for ${item.pointName}`)
      }
    }

    sendResult(response, await client.writePoints(items))
  })

  /* ── Alarmas ──────────────────────────────────────────────────────── */

  router.get('/api/iconics/alarms', async ({ response, url }) => {
    const pointName = url.searchParams.get('pointName') ?? ''
    const hours = Math.min(Number(url.searchParams.get('hours') ?? '1') || 1, maxAlarmHours)

    if (pointName && !isSafePointName(pointName)) {
      return sendError(response, 400, 'Invalid pointName parameter.')
    }

    const end = new Date()
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000)

    sendResult(
      response,
      await client.readAlarmHistory({
        pointName,
        startDate: formatLocalTimestamp(start),
        endDate: formatLocalTimestamp(end),
      })
    )
  })

  router.put('/api/iconics/alarms/acknowledge', async ({ request, response }) => {
    const body = await parseBody(request, response)
    if (!body) return

    const { eventIds, comment } = body
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      return sendError(response, 400, 'eventIds array is required.')
    }

    sendResult(response, await client.acknowledgeAlarms(eventIds, comment ?? ''))
  })
}
