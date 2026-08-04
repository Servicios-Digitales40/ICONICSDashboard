/**
 * Cliente de la API REST de FrameWorX (ICONICS).
 *
 * Todas las operaciones devuelven un mismo sobre —`{ ok, status, ... }`— y
 * ninguna lanza: el que llama decide el código HTTP mirando el sobre, sin
 * try/catch repetido en cada ruta.
 *
 * Antes, cada una de las ocho llamadas repetía el mismo bloque de veinte
 * líneas (fetch, olfatear el `content-type`, parsear, envolver el error,
 * medir el tiempo). Ese bloque vive ahora una sola vez en `request()`, y cada
 * operación se queda con lo único que la distingue: la URL, el cuerpo y cómo
 * se llama su fallo.
 */
import { logger } from '../logger.mjs'

const JSON_CONTENT_TYPE = 'application/json'
const NOT_CONFIGURED = Object.freeze({
  ok: false,
  status: 500,
  error: 'ICONICS_API_BASE is not configured.',
})

/** Cabecera propietaria que limita cuántas muestras devuelve el servidor. */
const MAX_ITEM_COUNT_HEADER = 'X-ICO-MAX-ITEM-COUNT'
/** Su presencia indica que la respuesta se truncó y queda más por leer. */
const CONTINUATION_HEADER = 'X-ICO-CONTINUATION'

/** ICONICS responde JSON casi siempre, pero devuelve texto plano en errores. */
async function parsePayload(response) {
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes(JSON_CONTENT_TYPE) ? response.json() : response.text()
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : 'Unexpected proxy error.'
}

export function createIconicsClient(config, authenticator) {
  const { endpoints, isConfigured } = config.iconics
  const { maxUpstreamItems, healthTimeoutMs } = config.limits

  /**
   * Única llamada saliente del backend. Normaliza autenticación, parseo,
   * errores y traza.
   *
   * @param {object} options
   * @param {string|URL} options.url
   * @param {string} [options.method]
   * @param {object} [options.headers]   Cabeceras extra sobre las de auth.
   * @param {object} [options.json]      Cuerpo a serializar como JSON.
   * @param {string} options.failure     Mensaje si el servidor responde !2xx.
   * @param {string} [options.event]     Etiqueta de traza.
   * @param {object} [options.meta]      Contexto adicional para la traza.
   */
  async function request({ url, method = 'GET', headers = {}, json, failure, event, meta = {} }) {
    const startedAt = Date.now()

    try {
      const authHeaders = await authenticator.authorizationHeaders()
      const response = await fetch(url, {
        method,
        headers: {
          ...authHeaders,
          ...headers,
          ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      })

      const payload = await parsePayload(response)
      const durationMs = Date.now() - startedAt

      if (event) logger.info(event, { ...meta, status: response.status, durationMs })

      if (!response.ok) {
        return { ok: false, status: response.status, error: failure, payload }
      }
      return { ok: true, status: response.status, payload, headers: response.headers }
    } catch (error) {
      logger.error(`${event ?? 'ICONICS request'} failed`, {
        ...meta,
        durationMs: Date.now() - startedAt,
        err: error,
      })
      return { ok: false, status: 502, error: toErrorMessage(error) }
    }
  }

  /** Envoltorio para operaciones cuya respuesta es `{ ok, status, payload }`. */
  async function requestPayload(options) {
    if (!isConfigured) return NOT_CONFIGURED

    const result = await request(options)
    if (!result.ok) return result
    return { ok: true, status: result.status, payload: result.payload }
  }

  function withParams(endpoint, params) {
    const url = new URL(endpoint)
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value)
    }
    return url
  }

  /* ── Lectura ──────────────────────────────────────────────────────── */

  async function readPoint(pointName) {
    if (!isConfigured) return NOT_CONFIGURED
    if (!pointName) return { ok: false, status: 400, error: 'pointName is required.' }

    const result = await request({
      url: withParams(endpoints.data, { pointName }),
      failure: 'ICONICS API request failed.',
      event: 'ICONICS data fetched',
      meta: { pointName },
    })

    if (!result.ok) return result
    return { ok: true, status: result.status, payload: result.payload, pointName }
  }

  /**
   * Lee muchos puntos en una sola llamada (`POST /Data`).
   * Devuelve un mapa indexado por `pointName`, que es la forma que espera el
   * motor de sondeo del frontend.
   */
  async function readPoints(pointNames) {
    if (!isConfigured) return NOT_CONFIGURED

    const result = await request({
      url: endpoints.data,
      method: 'POST',
      json: { pointName: pointNames },
      failure: 'ICONICS batch request failed.',
      event: 'ICONICS batch fetch',
      meta: { count: pointNames.length },
    })

    if (!result.ok) return result

    const byPointName = {}
    if (Array.isArray(result.payload)) {
      for (const item of result.payload) {
        byPointName[item.pointName] = { ok: true, status: 200, payload: item }
      }
    }
    return { ok: true, status: 200, payload: byPointName }
  }

  /**
   * Serie histórica del Hyper Historian.
   *
   * Normaliza las dos formas en que el servidor la devuelve —envuelta en
   * `historicalSamples` o como muestras sueltas— a una sola lista
   * `{ timestamp, value, quality }`, para que el frontend no tenga que
   * conocer ambas.
   */
  async function readHistory({ pointName, startDate, endDate, aggregate, interval }) {
    if (!isConfigured) return NOT_CONFIGURED

    const result = await request({
      url: withParams(endpoints.history, {
        pointName,
        startDate,
        endDate,
        aggregateName: aggregate,
        processingInterval: interval,
      }),
      headers: { [MAX_ITEM_COUNT_HEADER]: String(maxUpstreamItems) },
      failure: 'ICONICS History request failed.',
      event: 'ICONICS history fetched',
      meta: { pointName },
    })

    if (!result.ok) return result

    return {
      ok: true,
      status: 200,
      data: normalizeHistorySamples(result.payload),
      hasMore: Boolean(result.headers.get(CONTINUATION_HEADER)),
    }
  }

  function browse(path) {
    return requestPayload({
      url: withParams(endpoints.dataBrowse, { path }),
      failure: 'ICONICS browse failed.',
      event: 'ICONICS browse',
      meta: { path },
    })
  }

  function search(text) {
    return requestPayload({
      url: withParams(endpoints.dataSearch, { text }),
      failure: 'ICONICS points search failed.',
      event: 'ICONICS points search',
      meta: { text },
    })
  }

  function readUserInfo() {
    return requestPayload({
      url: endpoints.userInfo,
      failure: 'ICONICS UserInfo request failed.',
      event: 'ICONICS userinfo',
    })
  }

  /* ── Escritura ────────────────────────────────────────────────────── */

  /**
   * Envío común a `POST /Data/Write`, que atiende tanto una escritura suelta
   * como un lote: para el servidor las dos son la misma lista de `WriteItem`.
   * Lo único que cambia es cómo se traza y cómo se presenta el resultado.
   */
  async function sendWrite(items, trace) {
    if (!isConfigured) return NOT_CONFIGURED

    const result = await request({
      url: endpoints.dataWrite,
      method: 'POST',
      json: items,
      ...trace,
    })

    if (!result.ok) return result
    return {
      ok: true,
      status: 200,
      results: Array.isArray(result.payload) ? result.payload : [result.payload],
    }
  }

  /**
   * Escribe un punto. Sirve además para disparar los Data Manipulators de
   * GridWorX, escribiendo `true` en su punto `.@@Execute`.
   */
  async function writePoint(pointName, value) {
    const result = await sendWrite([{ pointName, value }], {
      failure: 'ICONICS write request failed.',
      event: 'ICONICS write',
      meta: { pointName, value },
    })

    if (!result.ok) return result
    return { ok: true, status: 200, result: result.results[0] }
  }

  function writePoints(items) {
    return sendWrite(items, {
      failure: 'ICONICS batch write request failed.',
      event: 'ICONICS batch write',
      meta: { count: items.length },
    })
  }

  /* ── Alarmas ──────────────────────────────────────────────────────── */

  async function readAlarmHistory({ pointName, startDate, endDate }) {
    if (!isConfigured) return NOT_CONFIGURED

    const result = await request({
      url: withParams(endpoints.alarmHistory, { pointName, startDate, endDate }),
      headers: { [MAX_ITEM_COUNT_HEADER]: String(maxUpstreamItems) },
      failure: 'ICONICS AlarmHistory request failed.',
      event: 'ICONICS alarms fetched',
      meta: { pointName },
    })

    if (!result.ok) return result
    return { ok: true, status: 200, alarms: Array.isArray(result.payload) ? result.payload : [] }
  }

  async function acknowledgeAlarms(eventIds, comment) {
    if (!isConfigured) return NOT_CONFIGURED

    const result = await request({
      url: endpoints.alarmState,
      method: 'PUT',
      json: { operation: 'Acknowledge', eventIds, comment },
      failure: 'ICONICS ACK request failed.',
      event: 'ICONICS alarm acknowledge',
      meta: { count: eventIds.length },
    })

    if (!result.ok) return result
    return { ok: true, status: 200, result: result.payload }
  }

  /* ── Diagnóstico ──────────────────────────────────────────────────── */

  /**
   * Ping a `/fwxapi/echo/v1`, que no exige autenticación. Comprueba solo que
   * el servidor está en pie: distinguir "no se llega" de "se llega pero no
   * autentica" es justo lo que hace útil a `/api/health`.
   */
  async function ping() {
    if (!isConfigured) return { reachable: false, reason: 'ICONICS_API_BASE not configured' }

    try {
      const response = await fetch(endpoints.echo, {
        signal: AbortSignal.timeout(healthTimeoutMs),
      })
      return { reachable: response.ok, httpStatus: response.status }
    } catch (error) {
      return {
        reachable: false,
        reason: error.name === 'TimeoutError' ? 'timeout' : toErrorMessage(error),
      }
    }
  }

  return {
    acknowledgeAlarms,
    browse,
    ping,
    readAlarmHistory,
    readHistory,
    readPoint,
    readPoints,
    readUserInfo,
    search,
    writePoint,
    writePoints,
  }
}

/**
 * Aplana la respuesta de `/History` a una lista de muestras.
 *
 * La versión anterior *asignaba* (`samples = ...`) dentro del bucle, así que
 * con más de un punto en la respuesta solo sobrevivían las muestras del
 * último. Aquí se acumulan.
 */
function normalizeHistorySamples(payload) {
  if (!Array.isArray(payload)) return []

  const samples = []
  for (const item of payload) {
    if (Array.isArray(item.historicalSamples)) {
      samples.push(
        ...item.historicalSamples.map(sample => ({
          timestamp: sample.timestamp,
          value: sample.value,
          quality: sample.quality ?? 0,
        }))
      )
    } else if (item.timestamp !== undefined && item.value !== undefined) {
      samples.push({ timestamp: item.timestamp, value: item.value, quality: item.quality ?? 0 })
    }
  }
  return samples
}
