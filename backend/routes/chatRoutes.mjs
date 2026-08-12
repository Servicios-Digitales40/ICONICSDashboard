/**
 * El asistente: `GET /api/chat` para saber si existe, `POST /api/chat` para
 * preguntarle.
 *
 * ── POR QUÉ SSE Y NO UN JSON AL FINAL ──────────────────────────────
 *
 * Una respuesta tarda entre 30 y 90 segundos con este modelo. Un `fetch` que
 * no devuelve nada durante minuto y medio es indistinguible de uno colgado:
 * el operador pulsa otra vez, y ahora hay dos preguntas compitiendo por la
 * misma GPU. Con SSE la pantalla recibe el primer estado en milisegundos y
 * los tokens conforme se generan.
 *
 * ── POR QUÉ UNA CONSULTA A LA VEZ ──────────────────────────────────
 *
 * llama-server corre con `--parallel 1` y una sola GPU. Dos preguntas
 * simultáneas no tardan lo mismo cada una: se reparten el hardware y tardan
 * el doble las dos. Con varias pantallas de planta abiertas eso es el caso
 * normal, no el raro, así que la segunda recibe un 409 que dice qué pasa en
 * vez de una espera silenciosa.
 */
import { RequestBodyError, readJsonBody } from '../http/requestBody.mjs'
import { sendError, sendJson } from '../http/responses.mjs'
import { logger } from '../logger.mjs'

/** Longitud máxima de una pregunta. Más que esto no es una pregunta. */
const MAX_PREGUNTA = 2000

export function registerChatRoutes(router, { config, chat }) {
  /**
   * Quién está preguntando ahora mismo, o `null`. Es un único hueco a
   * propósito: ver la cabecera del archivo.
   */
  let enCurso = null

  router.get('/api/chat', ({ response }) => {
    sendJson(response, 200, {
      ok: true,
      habilitado: config.ia.isConfigured,
      modelo: config.ia.isConfigured ? config.ia.modelo : null,
      ocupado: enCurso !== null,
    })
  })

  router.post('/api/chat', async ({ request, response }) => {
    if (!config.ia.isConfigured) {
      return sendError(
        response, 503,
        'El asistente no está configurado en este servidor. Falta la variable IA_BASE.'
      )
    }

    if (enCurso) {
      return sendError(
        response, 409,
        'Hay otra consulta en curso. El asistente atiende una cada vez; espera a que termine.'
      )
    }

    let cuerpo
    try {
      cuerpo = await readJsonBody(request, config.limits.maxRequestBodyBytes)
    } catch (error) {
      if (error instanceof RequestBodyError) return sendError(response, error.statusCode, error.message)
      throw error
    }

    const pregunta = String(cuerpo?.pregunta ?? '').trim()
    if (!pregunta) return sendError(response, 400, 'Falta la pregunta.')
    if (pregunta.length > MAX_PREGUNTA) {
      return sendError(response, 400, `La pregunta no puede pasar de ${MAX_PREGUNTA} caracteres.`)
    }

    /* ── A partir de aquí la respuesta es un flujo ─────────────────── */

    const abortador = new AbortController()
    enCurso = abortador

    // Si el usuario cierra la pestaña o pulsa cancelar, se aborta también la
    // petición al modelo. Sin esto, llama-server sigue generando tokens para
    // nadie y bloquea la siguiente pregunta durante el minuto que le quede.
    //
    // Se escucha en `response` y NO en `request`: el cuerpo ya se consumió
    // entero unas líneas más arriba, así que el stream de petición ya emitió
    // su `close` y un manejador registrado ahora no se ejecutaría jamás. El
    // de la respuesta sigue vivo hasta que la conexión se cierra, y el
    // `writableEnded` distingue "el cliente se fue" de "terminamos nosotros".
    response.on('close', () => {
      if (!response.writableEnded) abortador.abort()
    })

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Sin esto, un proxy inverso —IIS en el servidor de planta— puede
      // acumular el flujo entero y entregarlo de golpe al final, que es
      // exactamente lo que el streaming venía a evitar.
      'X-Accel-Buffering': 'no',
    })

    const emitir = evento => {
      if (response.writableEnded) return
      response.write(`data: ${JSON.stringify(evento)}\n\n`)
    }

    const empezado = Date.now()
    try {
      const resumen = await chat.responder({
        pregunta,
        signal: abortador.signal,
        onEvento: emitir,
      })

      emitir({ tipo: 'fin', ...resumen, duracionMs: Date.now() - empezado })
      logger.info('Chat respondido', { ...resumen, duracionMs: Date.now() - empezado })
    } catch (error) {
      // Cancelar no es un error que reportar: el cliente ya se fue.
      const cancelado = error?.name === 'AbortError' || abortador.signal.aborted

      if (!cancelado) {
        logger.error('Chat falló', { err: error, duracionMs: Date.now() - empezado })
        emitir({ tipo: 'error', mensaje: mensajeDeFallo(error, config.ia.timeoutMs) })
      }
    } finally {
      enCurso = null
      if (!response.writableEnded) response.end()
    }
  })
}

/**
 * Traduce el fallo a algo que un operador pueda accionar. Los tres modos que
 * se ven en planta se arreglan en sitios distintos, y un mensaje genérico
 * obliga a averiguar cuál es antes de poder hacer nada.
 */
function mensajeDeFallo(error, timeoutMs) {
  if (error?.name === 'TimeoutError') {
    return `El asistente no respondió en ${Math.round(timeoutMs / 1000)} s. ` +
      'Con este modelo una respuesta tarda entre 30 y 90 s; si se repite, revisa que ' +
      'llama-server siga en marcha y no esté atendiendo otra cosa.'
  }

  const texto = String(error?.message ?? '')
  if (/ECONNREFUSED|fetch failed/i.test(texto)) {
    return 'No se puede contactar con llama-server. El tablero funciona igual; ' +
      'solo el asistente no está disponible.'
  }

  return `El asistente falló: ${texto}`
}
