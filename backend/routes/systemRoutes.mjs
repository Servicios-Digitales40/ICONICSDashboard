/**
 * Rutas propias del puente: salud y contexto de cabecera.
 */
import { PointNameQuerySchema } from '../http/esquemas.mjs'

/**
 * Dos estados, no tres — y `tokenValid` desapareció de la respuesta.
 *
 * ── QUÉ CAMBIÓ Y POR QUÉ (PLAN 20 FASE 1) ──────────────────────────
 *
 * Antes había un `degraded`: «se llega al servidor pero no hay token válido».
 * Eso tenía sentido cuando el puente mantenía UNA sesión de máquina cuyas
 * credenciales estaban en el `.env`, porque entonces «no hay token» era un
 * defecto de configuración del servidor y la salud podía informarlo.
 *
 * Con el login nativo no hay *un* token: hay uno por persona conectada, y
 * puede haber cero legítimamente —nadie ha entrado todavía, a las 6 de la
 * mañana— sin que el puente tenga nada malo. Publicar `degraded` en ese caso
 * haría que el orquestador marcara como enfermo un servidor sano, que es peor
 * que no informar.
 *
 * Lo que la salud sí puede decir, y sigue diciendo, es si **se alcanza** el
 * servidor de planta. Para eso `app.mjs` le pasa un cliente sin credenciales.
 * `sesionesActivas` ocupa el hueco informativo que deja `tokenValid`: dice si
 * hay alguien trabajando, que es lo que de verdad se quiere saber al mirar.
 *
 * **Aviso para quien lea guiones antiguos:** `tokenValid` ya no viaja en la
 * respuesta de `/api/health`.
 */
function resolveStatus({ reachable }) {
  return reachable ? 'ok' : 'error'
}

export function registerSystemRoutes(fastify, { config, client, registro, startedAt }) {
  const uptimeSeconds = () => Math.floor((Date.now() - startedAt) / 1000)

  /**
   * ¿Respira el proceso? No pregunta nada a ICONICS, y ese es todo el punto:
   * es la sonda del orquestador, que corre cada pocos segundos para siempre.
   * Con la de abajo, un contenedor sondeando cada 10 s son 8 640 pings
   * diarios contra el servidor de planta sólo para saber si Node está vivo —y
   * peor: reiniciaría el contenedor por una avería que no es suya, cuando lo
   * único que pasa es que ICONICS está caído.
   *
   * Queda FUERA del límite de peticiones (`config: { rateLimit: false }`): la
   * sonda del orquestador llega desde una sola IP y a ritmo fijo, y gastarle
   * cuota significaría que un reinicio del contenedor empieza con la sonda ya
   * limitada.
   */
  fastify.get('/api/health/live', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    version: config.version,
    uptimeSeconds: uptimeSeconds(),
    timestamp: new Date().toISOString(),
  }))

  /**
   * ¿Puede este puente servir datos de verdad? Sí llama a ICONICS. Es la que
   * mira el monitor y la que se abre cuando alguien dice "no carga".
   */
  async function readiness(request) {
    const connectivity = await client.ping()
    const status = resolveStatus({ reachable: connectivity.reachable })

    /*
     * Un estado que no es `ok` se registra con el motivo y con el arreglo. Es
     * la línea que se busca cuando alguien dice "no carga": sin ella hay que
     * abrir la ruta a mano para enterarse de lo mismo.
     */
    if (status === 'error') {
      request.log.warn(
        { estado: status, iconicsBase: config.iconics.apiBase || null, motivo: connectivity.reason },
        `El puente NO alcanza a ICONICS (${config.iconics.apiBase || 'ICONICS_API_BASE sin configurar'}): ` +
          `${connectivity.reason ?? 'sin detalle'}. Revisa que el servidor de planta responda y que la ruta sea la correcta.`
      )
    }

    return {
      status,
      version: config.version,
      iconicsReachable: connectivity.reachable,
      sesionesActivas: registro.activas(),
      readOnly: config.iconics.readOnly,
      uptimeSeconds: uptimeSeconds(),
      timestamp: new Date().toISOString(),
      ...(connectivity.reason ? { reason: connectivity.reason } : {}),
    }
  }

  // `/api/health` y `/api/health/ready` son la misma ruta con dos nombres, no
  // dos comportamientos: la primera porque ya hay documentación y guiones que
  // la usan, la segunda porque es el nombre que dice lo que hace.
  fastify.get('/api/health', { config: { rateLimit: false } }, readiness)
  fastify.get('/api/health/ready', { config: { rateLimit: false } }, readiness)

  fastify.get(
    '/api/context',
    { onRequest: [fastify.autenticar], schema: { querystring: PointNameQuerySchema } },
    async request => {
      const pointName = request.query.pointName ?? config.iconics.defaultPointName

      /*
       * El cliente de la SESIÓN, no el de salud: esto lee un punto de verdad
       * y tiene que salir con el token de quien pregunta. El de salud va sin
       * credenciales a propósito y aquí devolvería un 401 de ICONICS.
       */
      return {
        context: config.context,
        iconics: pointName ? await request.sesion.pila.client.readPoint(pointName) : null,
      }
    }
  )
}
