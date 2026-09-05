/**
 * Rutas propias del puente: salud y contexto de cabecera.
 */
import { PointNameQuerySchema } from '../http/esquemas.mjs'

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

/**
 * Cómo está un servicio que este puente necesita, en tres estados y con la
 * variable que falta cuando falta.
 *
 * ── POR QUÉ «NO CONFIGURADO» ES UN ESTADO Y NO UN ERROR ────────────
 *
 * Porque una instalación mínima —sin asistente, sin dictado, sin manuales— es
 * legítima y permanente, no una avería a medio arreglar. Pintarla en rojo
 * enseñaría a ignorar el rojo. Lo que sí hace falta es que la pantalla pueda
 * decir QUÉ variable lo encendería, que es la única información accionable.
 */
function servicio({ nombre, configurado, variable, ok = true, detalle = null, extra = {} }) {
  return {
    nombre,
    estado: !configurado ? 'no_configurado' : ok ? 'ok' : 'error',
    ...(configurado ? {} : { variable }),
    ...(detalle ? { detalle } : {}),
    ...extra,
  }
}

export function registerSystemRoutes(
  fastify,
  { config, client, authenticator, startedAt, chat, cola, indiceDocumentos }
) {
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

    const indice = indiceDocumentos?.estado() ?? null

    return {
      status,
      version: config.version,
      iconicsReachable: connectivity.reachable,
      tokenValid,
      readOnly: config.iconics.readOnly,
      uptimeSeconds: uptimeSeconds(),
      timestamp: new Date().toISOString(),
      ...(connectivity.reason ? { reason: connectivity.reason } : {}),

      /*
       * ── EL ESTADO DE LOS DEMÁS SERVICIOS (Plan 20 F10) ─────────────
       *
       * Los campos de arriba se mantienen tal cual porque hay guiones y
       * documentación que los usan; esto se AÑADE, no los sustituye.
       *
       * Lo que sigue es lo que hoy hay que averiguar leyendo logs por SSH
       * cuando alguien dice que «va raro»: si el asistente está montado y qué
       * modelo tiene puesto, si hay cola, si el índice de manuales llegó a
       * cargarse, y —el más importante de todos— si este puente está sirviendo
       * DATOS INVENTADOS.
       */
      /*
       * Los dos relojes en juego, y el hueco del desfase (Plan 21 F6). Es lo
       * primero que hay que mirar cuando una ventana horaria trae datos del
       * momento equivocado, y hasta ahora no se podía ver desde fuera.
       */
      relojes: {
        servidor: config.relojes.servidor,
        planta: config.relojes.planta,
        /* `false` significa «nadie lo declaró, se da por hecho que coinciden». */
        plantaDeclarada: config.relojes.plantaDeclarada,
        coinciden: config.relojes.servidor === config.relojes.planta,
        ahora: new Date().toISOString(),
        /*
         * Cuánto se separa el reloj del puente del del historiador. `null` NO
         * es cero: es que no se ha medido, y medirlo necesita la planta
         * (Plan 26). Ponerlo a 0 aquí sería afirmar que están sincronizados
         * sin haberlo comprobado — §2.5.
         */
        desfaseConHistorianMs: null,
      },

      servicios: {
        /*
         * `ICONICS_FAKE` primero y con nombre propio. Es el estado en el que
         * NINGÚN dato es real, y la cabecera de `config.mjs` ya dice que el
         * arranque debería anunciarlo bien alto: aquí también, porque una
         * pantalla de planta con datos simulados y sin avisar es peor que una
         * pantalla apagada.
         */
        datos: {
          nombre: 'Origen de datos',
          estado: config.iconics.fake ? 'simulado' : 'ok',
          detalle: config.iconics.fake
            ? 'ICONICS_FAKE=true: los valores los genera el simulador. NINGÚN dato es real.'
            : `Lecturas reales de ${config.iconics.origin || 'ICONICS'}.`,
          soloLectura: config.iconics.readOnly,
        },
        asistente: servicio({
          nombre: 'Asistente',
          configurado: config.ia.isConfigured,
          variable: 'IA_BASE',
          detalle: config.ia.isConfigured ? null : 'El chat responde 503 y el tablero funciona igual.',
          extra: config.ia.isConfigured
            ? {
              modelo: chat?.modeloActivo?.() ?? null,
              modelosDisponibles: config.ia.modelos,
              maxPasos: config.ia.maxPasos,
              cola: cola?.estado?.() ?? null,
            }
            : {},
        }),
        dictado: servicio({
          nombre: 'Dictado por voz',
          configurado: config.ia.whisper.isConfigured,
          variable: 'IA_WHISPER_BASE',
          extra: config.ia.whisper.isConfigured ? { idioma: config.ia.whisper.idioma } : {},
        }),
        documentacion: servicio({
          nombre: 'Manuales de planta',
          configurado: Boolean(indice),
          variable: 'IA_DOCS_DIR',
          extra: indice
            ? {
              cargado: indice.cargado,
              indexando: indice.indexando,
              modo: indice.modo,
              documentos: indice.documentos.length,
              fragmentos: indice.documentos.reduce((n, d) => n + d.fragmentos, 0),
              ilegibles: indice.ilegibles?.length ?? 0,
              /*
               * `cargado: false` NO es un error: el índice se construye
               * perezosamente para no retrasar el arranque del puente, que
               * sirve pantallas que no dependen del asistente. Decirlo aquí
               * evita que la vista lo pinte en rojo.
               */
              detalle: indice.cargado
                ? null
                : 'El índice se carga a la primera búsqueda; todavía no se ha pedido ninguna.',
            }
            : {},
        }),
      },
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
    { schema: { querystring: PointNameQuerySchema } },
    async request => {
      const pointName = request.query.pointName ?? config.iconics.defaultPointName

      return {
        context: config.context,
        iconics: pointName ? await client.readPoint(pointName) : null,
      }
    }
  )
}
