/**
 * Salud del proceso, conectividad con ICONICS y contexto compatible de la API.
 */
import { PointNameQuerySchema } from '../http/esquemas.mjs'

/**
 * La salud comprueba conectividad, no un token global. Cero sesiones
 * es un estado válido; los tokens pertenecen a cada persona.
 */
function resolveStatus({ reachable }) {
  return reachable ? 'ok' : 'error'
}

export function registerSystemRoutes(fastify, { config, client, registro, startedAt }) {
  const uptimeSeconds = () => Math.floor((Date.now() - startedAt) / 1000)

  /**
 * Liveness no consulta ICONICS ni consume cuota del limitador.
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
      simulated: config.iconics.fake,
      sesionesActivas: registro.activas(),
      readOnly: config.iconics.readOnly,
      capabilities: {
        assistant: config.ia.isConfigured,
        voice: config.ia.whisper.isConfigured,
        manuals: Boolean(config.ia.docsDir),
        semanticSearch: Boolean(config.ia.embeddingBase),
        manualUpload: config.ia.ragUploadEnabled,
        conversationExport: Boolean(config.backlogChat.dir),
      },
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
