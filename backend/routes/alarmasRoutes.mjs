/**
 * `GET /api/alarmas` — qué alarmas tiene disparadas la planta ahora mismo.
 *
 * ── POR QUÉ UNA RUTA PROPIA SI YA HAY UNA HERRAMIENTA ──────────────
 *
 * Porque son dos consumidores con necesidades distintas. La herramienta
 * `alarmas_activas` la llama el MODELO cuando alguien pregunta; esta ruta la
 * consulta la PANTALLA cada medio minuto, sin que nadie haya preguntado nada,
 * para poder avisar de que hay algo disparado.
 *
 * Encadenar la pantalla a la herramienta del modelo sería mucho peor: cada
 * comprobación de alarmas ocuparía la GPU durante un minuto y bloquearía la
 * cola de consultas. Aquí no interviene el modelo en absoluto: es una lectura
 * en lote contra ICONICS y punto.
 *
 * ── PERO LOS DATOS SÍ SON LOS MISMOS ───────────────────────────────
 *
 * Se reutiliza `herramientas.ejecutar('alarmas_activas')` en vez de leer las
 * alarmas por segunda vez con otro código. Si la pantalla y el asistente
 * leyeran las alarmas por caminos distintos acabarían discrepando —el panel
 * diciendo que hay una activa y el asistente que no— y esa contradicción, en
 * una pantalla de planta, destruye la confianza en las dos.
 */
import { sendError, sendJson } from '../http/responses.mjs'
import { logger } from '../logger.mjs'

/**
 * Vida de la caché, en milisegundos.
 *
 * Con varias pantallas abiertas, todas preguntan por lo mismo cada 30 s. Sin
 * caché eso son N lecturas de 55 puntos contra ICONICS por cada ronda; con
 * ella, una. Es el mismo criterio que `batchCacheTtlMs` para las señales.
 *
 * 10 s es muy inferior a la cadencia de sondeo, así que no añade retraso
 * perceptible: una alarma tarda como mucho ese tiempo de más en aparecer.
 */
const TTL_CACHE_MS = 10000

export function registerAlarmasRoutes(router, { config, herramientas }) {
  let cache = null
  let cacheHasta = 0

  router.get('/api/alarmas', async ({ response }) => {
    if (!config.iconics.isConfigured) {
      return sendError(
        response, 503,
        'ICONICS no está configurado en este servidor. Falta la variable ICONICS_API_BASE.'
      )
    }

    if (cache && Date.now() < cacheHasta) return sendJson(response, 200, cache)

    const resultado = await herramientas.ejecutar('alarmas_activas', {})

    if (!resultado?.ok) {
      /*
       * 502 y no 500: el puente funciona, quien no contesta es ICONICS.
       *
       * La distinción importa porque el frontend NO pinta un error rojo por
       * esto. Que el servidor de alarmas no responda un momento no puede
       * convertir el panel del asistente en una pantalla de avería: lo que
       * hace es dejar de enseñar el aviso hasta que vuelva.
       */
      logger.warn('No se pudieron leer las alarmas', { error: resultado?.error })
      return sendError(response, 502, resultado?.error ?? 'No se pudieron leer las alarmas.')
    }

    // Sólo lo que la pantalla necesita pintar. El resultado de la herramienta
    // lleva además indicaciones dirigidas al modelo —cómo diagnosticar, cómo
    // redactar— que aquí no significan nada.
    cache = {
      ok: true,
      hayAlarmasActivas: resultado.hayAlarmasActivas,
      cuantasActivas: resultado.cuantasActivas,
      activas: resultado.activas.map(a => ({
        alarma: a.alarma,
        severidad: a.severidad,
        desde: a.desde,
        mensaje: a.mensaje,
        vigilaLaSenal: a.vigilaLaSenal ?? null,
        queSignifica: a.queSignifica ?? null,
      })),
      leidoA: new Date().toISOString(),
    }
    cacheHasta = Date.now() + TTL_CACHE_MS

    sendJson(response, 200, cache)
  })
}
