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
import { planificar } from '../../shared/eva/rango.js'
import { conConcurrenciaAcotada } from '../../shared/concurrencia.js'

/**
 * Series que se admiten en una sola llamada a `/history/batch`.
 *
 * Cinco son las del pronóstico, que es el consumidor que motivó la ruta; ocho,
 * el catálogo entero del sistema del tanque. Diez deja margen sin dejarlo
 * abierto: cada señal multiplica los tramos, y una lista sin techo convierte
 * una petición en cientos de lecturas al historiador.
 */
const MAX_SERIES_BATCH = 10

/**
 * Puntos por tramo cuando se trocea una ventana larga.
 *
 * 96 son los cuartos de hora de un día — el MISMO valor que usa
 * `Demo-EVA/data/historia.js`. Está repetido aquí a propósito y no importado
 * de allí: `backend/` no puede depender de `react-dashboard/`. Si uno de los
 * dos cambia, las series dejan de caer sobre la misma rejilla.
 */
const PUNTOS_POR_TRAMO = 96

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
  const { defaultPointName, readOnly } = config.iconics
  const { maxRequestBodyBytes, maxAlarmHours, historyConcurrencia } = config.limits

  /**
   * Envuelve una ruta que modifica algo en ICONICS.
   *
   * Con `ICONICS_READ_ONLY` la ruta se registra igual y responde 403. Podría
   * no registrarse, pero entonces no habría ruta y la petición caería al
   * respaldo de la SPA: un `POST /api/iconics/write` devolvería el
   * `index.html` con un **200**, que es lo peor de los dos mundos —el cliente
   * no escribe nada y cree que sí—. Un 403 que nombra la variable dice qué
   * pasa y dónde se cambia.
   */
  function whenWritable(handler) {
    if (!readOnly) return handler

    return ({ response }) =>
      sendError(
        response,
        403,
        'El puente está en modo solo lectura. Para habilitar la escritura, arranca con ICONICS_READ_ONLY=false.'
      )
  }

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

  /**
   * ── VARIAS SERIES DE UNA VEZ, TROCEADAS AQUÍ ───────────────────────
   *
   * `GET /api/iconics/history` sirve UN tramo de UNA señal, y el troceado
   * de una ventana larga vivía entero en el navegador: cada tramo salía como
   * una petición HTTP propia. Cinco señales por diez tramos de una ventana
   * de 30 días eran CINCUENTA peticiones para pintar una pantalla, contra
   * las cuatro que gasta «Planta» — y el limitador de `app.mjs` corta en 300
   * por minuto y por IP, así que quien abría esa vista un par de veces se
   * llevaba un 429 que luego pagaba el siguiente en preguntar.
   *
   * Aquí el cliente pide LA VENTANA, no los tramos: el plan se calcula con
   * el mismo `planificar()` que usaban los dos lados, las lecturas salen con
   * la misma concurrencia acotada que ya usa el asistente, y vuelve una sola
   * respuesta. Cincuenta peticiones pasan a ser una.
   *
   * ── POR QUÉ POST Y NO GET ──────────────────────────────────────────
   *
   * Porque la entrada es una lista de nombres de punto, y los de este
   * servidor llevan barras invertidas y espacios (`hda:\Configuration\DEMO 3:`).
   * En una cadena de consulta eso son nombres escapados dentro de un
   * separador por comas — justo el sitio donde un nombre con una coma
   * partiría la lista en dos puntos que no existen. En un cuerpo JSON cada
   * nombre es un elemento y no hay nada que reparsear.
   *
   * No modifica nada: es una lectura con cuerpo, y por eso NO pasa por
   * `whenWritable`.
   */
  router.post('/api/iconics/history/batch', async ({ request, response }) => {
    let cuerpo
    try {
      cuerpo = await readJsonBody(request, maxRequestBodyBytes)
    } catch (error) {
      if (error instanceof RequestBodyError) return sendError(response, error.statusCode, error.message)
      throw error
    }

    const puntos = Array.isArray(cuerpo?.points) ? cuerpo.points : []
    if (puntos.length === 0) {
      return sendError(response, 400, 'points must be a non-empty array of point names.')
    }
    if (puntos.length > MAX_SERIES_BATCH) {
      return sendError(response, 400, `No more than ${MAX_SERIES_BATCH} points per request.`)
    }
    if (!puntos.every(isSafePointName)) {
      return sendError(response, 400, 'One or more point names are invalid.')
    }

    const inicio = new Date(cuerpo?.startDate)
    const fin = new Date(cuerpo?.endDate)
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      return sendError(response, 400, 'startDate and endDate must be valid dates.')
    }
    if (fin <= inicio) {
      return sendError(response, 400, 'endDate must be after startDate.')
    }

    const aggregate = String(cuerpo?.aggregate ?? '')
    if (aggregate && !isSafeHistoryArgument(aggregate)) {
      return sendError(response, 400, 'Invalid aggregate parameter.')
    }

    /*
     * El MISMO plan para todas las señales: comparten ventana, así que
     * comparten tramos. Calcularlo una vez y no por señal es lo que garantiza
     * que las series vuelvan sobre la misma rejilla — que es la premisa de
     * `unir()` en el frontend.
     */
    const { tramos, segundosPorPunto } = planificar({
      inicio, fin, puntosPorTramo: PUNTOS_POR_TRAMO,
    })

    /*
     * Las tareas son señal x tramo, todas en la MISMA cola: acotar por señal
     * dejaría la concurrencia real multiplicada por el número de señales,
     * que es justo lo que se venía a limitar.
     */
    const tareas = []
    for (const pointName of puntos) {
      for (const tramo of tramos) {
        tareas.push(async () => ({
          pointName,
          resultado: await client.readHistory({
            pointName,
            startDate: tramo.desde.toISOString(),
            endDate: tramo.hasta.toISOString(),
            aggregate,
            interval: tramo.interval,
          }),
        }))
      }
    }

    const resultados = await conConcurrenciaAcotada(tareas, historyConcurrencia)

    /*
     * Un tramo que falla NO invalida su serie: mismo criterio que ya seguían
     * el frontend y el asistente —perder un día de diez no cambia la forma de
     * la curva, y abortar dejaría la gráfica vacía por un hueco del
     * historiador—. Lo que sí viaja es CUÁNTOS tramos respondieron, para que
     * quien lo pinte pueda declarar la cobertura en vez de suponerla.
     */
    const series = Object.fromEntries(
      puntos.map(pointName => [pointName, { data: [], hasMore: false, tramos: tramos.length, tramosConDato: 0, tramosFallidos: 0 }])
    )

    for (const { pointName, resultado } of resultados) {
      const serie = series[pointName]
      if (!resultado?.ok) { serie.tramosFallidos += 1; continue }
      const trozo = resultado.data ?? []
      if (trozo.length) serie.tramosConDato += 1
      if (resultado.hasMore) serie.hasMore = true
      serie.data.push(...trozo)
    }

    /*
     * El orden importa: la gráfica y el CSV recorren la serie tal cual llega,
     * y la cola acotada no garantiza que los tramos terminen en orden.
     * Ordenar aquí evita que cada consumidor tenga que acordarse.
     */
    for (const serie of Object.values(series)) {
      serie.data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    }

    sendJson(response, 200, {
      ok: true,
      status: 200,
      payload: {
        series,
        ventana: { startDate: inicio.toISOString(), endDate: fin.toISOString(), segundosPorPunto },
      },
    })
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

  router.post('/api/iconics/write', whenWritable(async ({ request, response }) => {
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
  }))

  router.post('/api/iconics/write/batch', whenWritable(async ({ request, response }) => {
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
  }))

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

  router.put('/api/iconics/alarms/acknowledge', whenWritable(async ({ request, response }) => {
    const body = await parseBody(request, response)
    if (!body) return

    const { eventIds, comment } = body
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      return sendError(response, 400, 'eventIds array is required.')
    }

    sendResult(response, await client.acknowledgeAlarms(eventIds, comment ?? ''))
  }))
}
