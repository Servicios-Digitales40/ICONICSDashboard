/**
 * Rutas propias del puente: salud y contexto de cabecera.
 */
import { PointNameQuerySchema } from '../http/esquemas.mjs'
import { validarConsulta } from '../http/validar.mjs'

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

export function registerSystemRoutes(fastify, { config, client, authenticator, startedAt }) {
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
    const tokenValid = authenticator.hasValidToken()
    const status = resolveStatus({ reachable: connectivity.reachable, tokenValid })

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
    } else if (status === 'degraded') {
      request.log.warn(
        { estado: status, usuario: config.iconics.username || null },
        'Se alcanza ICONICS pero NO hay token válido: las lecturas saldrán sin autenticar. ' +
          'Revisa ICONICS_USERNAME / ICONICS_PASSWORD y los permisos de ese usuario.'
      )
    }

    return {
      status,
      version: config.version,
      iconicsReachable: connectivity.reachable,
      tokenValid,
      readOnly: config.iconics.readOnly,
      uptimeSeconds: uptimeSeconds(),
      timestamp: new Date().toISOString(),
      ...(connectivity.reason ? { reason: connectivity.reason } : {}),
    }
  }

  // `/api/health` se mantiene como estaba —con `status`, `iconicsReachable` y
  // `tokenValid`— porque ya hay documentación y guiones que la usan; `ready`
  // es el nombre que dice lo que hace. Son la misma ruta con dos nombres, no
  // dos comportamientos.
  fastify.get('/api/health', { config: { rateLimit: false } }, readiness)
  fastify.get('/api/health/ready', { config: { rateLimit: false } }, readiness)

  fastify.get(
    '/api/context',
    { preHandler: validarConsulta(PointNameQuerySchema) },
    async request => {
      const pointName = request.query.pointName ?? config.iconics.defaultPointName

      return {
        context: config.context,
        iconics: pointName ? await client.readPoint(pointName) : null,
      }
    }
  )
}
