/**
 * Rutas `/api/iconics/*`.
 *
 * Cada handler hace tres cosas y sólo tres: valida la entrada, llama al
 * cliente y traduce el sobre a una respuesta HTTP. Nada de `fetch` aquí — eso
 * vive en `iconics/client.mjs`.
 *
 * La validación ya no se escribe a mano en cada handler: vive en
 * `http/esquemas.mjs` y se declara en el `schema` de la ruta, que Fastify
 * valida por su cuenta contra el esquema de Zod (ver `app.mjs`,
 * `setValidatorCompiler`) — es también de ahí de donde `@fastify/swagger`
 * saca la documentación de parámetros y cuerpo en `/docs`. Los nombres de
 * punto siguen pasando por la lista blanca de `iconics/validation.mjs`, que es
 * donde está documentada la sintaxis real del servidor.
 */
import {
  AcknowledgeAlarmsSchema,
  AlarmsQuerySchema,
  BrowseQuerySchema,
  HistoryBatchSchema,
  HistoryQuerySchema,
  PointNameQuerySchema,
  SearchQuerySchema,
  WriteBatchSchema,
  WritePointSchema,
} from '../http/esquemas.mjs'
import { isSafePointName, parsePointList } from '../iconics/validation.mjs'
import { planificar } from '../../shared/eva/comun/rango.js'
import { conConcurrenciaAcotada } from '../../shared/concurrencia.js'

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

export function registerIconicsRoutes(fastify, { config, client }) {
  const { defaultPointName, readOnly } = config.iconics
  const { maxAlarmHours, historyConcurrencia } = config.limits

  /**
   * El sobre del cliente ya trae su propio `status`; en el camino feliz se
   * responde 200 porque `status` puede ser cualquier 2xx del servidor.
   */
  function responder(reply, result) {
    return reply.code(result.ok ? 200 : result.status).send(result)
  }

  /**
   * Opciones de una ruta que modifica algo en ICONICS.
   *
   * Con `ICONICS_READ_ONLY` la ruta se registra igual y responde 403. Podría
   * no registrarse, pero entonces no habría ruta y la petición caería al
   * respaldo de la SPA: un `POST /api/iconics/write` devolvería el
   * `index.html` con un **200**, que es lo peor de los dos mundos —el cliente
   * no escribe nada y cree que sí—. Un 403 que nombra la variable dice qué
   * pasa y dónde se cambia.
   *
   * Las guardas de autenticación se declaran aquí, en un solo sitio, para que
   * ninguna ruta de escritura pueda quedarse sin ellas por olvido cuando se
   * active `AUTH_HABILITADA`.
   *
   * La guarda de solo lectura va en `onRequest` y no en `preHandler` a
   * propósito: Fastify valida el `schema` ANTES de `preHandler`, así que un
   * `preHandler` respondería 400 (cuerpo inválido) antes de que se llegara a
   * comprobar el modo solo lectura, y el 403 —que es la respuesta correcta
   * cuando el puente no escribe, tenga el cuerpo la forma que tenga— nunca se
   * vería. `onRequest` corre antes de la validación, así que conserva el
   * mismo orden que tenía cuando las dos comprobaciones eran `preHandler`.
   */
  function escritura(esquema) {
    return {
      onRequest: [
        fastify.autenticar,
        fastify.exigirRol('operador'),
        async (request, reply) => {
          if (!readOnly) return
          request.log.warn(
            { ruta: request.url, ip: request.ip },
            `Escritura rechazada en ${request.url}: el puente está en modo solo lectura ` +
              '(arranca con ICONICS_READ_ONLY=false para habilitarla).'
          )
          return reply.code(403).send({
            ok: false,
            error:
              'El puente está en modo solo lectura. Para habilitar la escritura, arranca con ICONICS_READ_ONLY=false.',
          })
        },
      ],
      schema: { body: esquema },
    }
  }

  /* ── Lectura ──────────────────────────────────────────────────────── */

  fastify.get(
    '/api/iconics/data',
    { schema: { querystring: PointNameQuerySchema } },
    async (request, reply) => {
      const pointName = request.query.pointName ?? defaultPointName
      const result = await client.readPoint(pointName)
      return reply.code(result.status).send(result)
    }
  )

  /*
   * `points` es una lista separada por comas, no un array: se mantiene así
   * porque es el contrato que ya usa el frontend. La lista se trocea y se
   * valida elemento a elemento — `parsePointList` descarta los huecos que deja
   * una coma de más.
   */
  fastify.get('/api/iconics/data/batch', async (request, reply) => {
    const points = parsePointList(request.query.points ?? '')

    if (points.length === 0) {
      return reply
        .code(400)
        .send({ ok: false, error: 'points parameter is required (comma-separated list).' })
    }
    if (!points.every(isSafePointName)) {
      return reply.code(400).send({ ok: false, error: 'One or more point names are invalid.' })
    }

    return responder(reply, await client.readPoints(points))
  })

  fastify.get(
    '/api/iconics/history',
    { schema: { querystring: HistoryQuerySchema } },
    async (request, reply) => {
      const { pointName, startDate, endDate, aggregate, interval } = request.query
      return responder(
        reply,
        await client.readHistory({ pointName, startDate, endDate, aggregate, interval })
      )
    }
  )

  /**
   * ── VARIAS SERIES DE UNA VEZ, TROCEADAS AQUÍ ───────────────────────
   *
   * `GET /api/iconics/history` sirve UN tramo de UNA señal, y el troceado
   * de una ventana larga vivía entero en el navegador: cada tramo salía como
   * una petición HTTP propia. Cinco señales por diez tramos de una ventana
   * de 30 días eran CINCUENTA peticiones para pintar una pantalla, contra
   * las cuatro que gasta «Planta» — y el limitador corta en 300 por minuto y
   * por IP, así que quien abría esa vista un par de veces se llevaba un 429
   * que luego pagaba el siguiente en preguntar.
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
   * No modifica nada: es una lectura con cuerpo, y por eso NO usa `escritura()`.
   */
  fastify.post(
    '/api/iconics/history/batch',
    { schema: { body: HistoryBatchSchema } },
    async request => {
      const { points: puntos, startDate: inicio, endDate: fin, aggregate } = request.body

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
        puntos.map(pointName => [
          pointName,
          { data: [], hasMore: false, tramos: tramos.length, tramosConDato: 0, tramosFallidos: 0 },
        ])
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

      /*
       * Una serie entera sin un solo tramo bueno es un hueco que el frontend
       * pintará como una gráfica vacía sin explicación. Se registra aquí, que
       * es donde se sabe cuántos tramos se pidieron y cuántos fallaron.
       */
      const vacias = Object.entries(series).filter(([, s]) => s.tramosConDato === 0)
      if (vacias.length) {
        request.log.warn(
          {
            senales: vacias.map(([nombre]) => nombre),
            tramosPorSenal: tramos.length,
            ventana: { desde: inicio.toISOString(), hasta: fin.toISOString() },
          },
          `El historiador no devolvió ningún dato para ${vacias.length} de ${puntos.length} señales ` +
            `en la ventana pedida. Suele significar que esas señales no están historizadas o que la ` +
            `ventana es anterior a su primer registro.`
        )
      }

      return {
        ok: true,
        status: 200,
        payload: {
          series,
          ventana: {
            startDate: inicio.toISOString(),
            endDate: fin.toISOString(),
            segundosPorPunto,
          },
        },
      }
    }
  )

  fastify.get(
    '/api/iconics/browse',
    { schema: { querystring: BrowseQuerySchema } },
    async (request, reply) => responder(reply, await client.browse(request.query.path))
  )

  fastify.get(
    '/api/iconics/points',
    { schema: { querystring: SearchQuerySchema } },
    async (request, reply) => responder(reply, await client.search(request.query.query))
  )

  fastify.get('/api/iconics/userinfo', async (request, reply) =>
    responder(reply, await client.readUserInfo())
  )

  /* ── Escritura ────────────────────────────────────────────────────── */

  fastify.post('/api/iconics/write', escritura(WritePointSchema), async (request, reply) => {
    const { pointName, value } = request.body

    request.log.info(
      { pointName, valor: value, ip: request.ip, usuario: request.usuario?.id },
      `Escritura sobre la planta: ${pointName} = ${value} (petición de ${request.ip})`
    )

    return responder(reply, await client.writePoint(pointName, value))
  })

  fastify.post('/api/iconics/write/batch', escritura(WriteBatchSchema), async (request, reply) => {
    const { items } = request.body

    request.log.info(
      {
        puntos: items.map(i => i.pointName),
        cantidad: items.length,
        ip: request.ip,
        usuario: request.usuario?.id,
      },
      `Escritura múltiple sobre la planta: ${items.length} puntos (petición de ${request.ip})`
    )

    return responder(reply, await client.writePoints(items))
  })

  /* ── Alarmas ──────────────────────────────────────────────────────── */

  fastify.get(
    '/api/iconics/alarms',
    { schema: { querystring: AlarmsQuerySchema } },
    async (request, reply) => {
      const { pointName } = request.query
      const hours = Math.min(request.query.hours, maxAlarmHours)

      const end = new Date()
      const start = new Date(end.getTime() - hours * 60 * 60 * 1000)

      return responder(
        reply,
        await client.readAlarmHistory({
          pointName,
          startDate: formatLocalTimestamp(start),
          endDate: formatLocalTimestamp(end),
        })
      )
    }
  )

  fastify.put(
    '/api/iconics/alarms/acknowledge',
    escritura(AcknowledgeAlarmsSchema),
    async (request, reply) => {
      const { eventIds, comment } = request.body

      request.log.info(
        { eventos: eventIds.length, ip: request.ip, usuario: request.usuario?.id },
        `Reconocimiento de ${eventIds.length} alarma(s) (petición de ${request.ip})`
      )

      return responder(reply, await client.acknowledgeAlarms(eventIds, comment))
    }
  )
}
