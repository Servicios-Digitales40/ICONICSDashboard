/**
 * Dictado por voz: `GET /api/voz` para saber si existe, `POST /api/voz` para
 * transcribir un audio.
 *
 * ── POR QUÉ ES UNA RUTA APARTE Y NO PARTE DE /api/chat ─────────────
 *
 * Porque transcribir NO es preguntar. Lo que devuelve esta ruta es el texto de
 * lo que se dijo, y ahí termina: el usuario lo ve en el cuadro de pregunta,
 * puede corregirlo, y decide si lo envía.
 *
 * Encadenar las dos cosas —hablar y que se consulte sin más— parecía más
 * cómodo y es peor. La transcripción se equivoca, sobre todo con ruido de
 * planta y con nombres de tag; una consulta lanzada sobre una frase mal oída
 * gasta un minuto de GPU para responder a algo que nadie preguntó, y el
 * operador no llega a ver dónde estuvo el malentendido. Con el texto delante,
 * un error de transcripción se ve y se arregla antes de costar nada.
 *
 * ── POR QUÉ ADMITE VARIAS A LA VEZ ─────────────────────────────────
 *
 * A diferencia de `/api/chat`, aquí no hay hueco único. `whisper-server`
 * atiende en paralelo y una transcripción son segundos, no minutos: un 409
 * porque otra pantalla está dictando sería una molestia sin motivo. El techo
 * lo pone el limitador por IP, que ya cubre toda la API.
 */
import { RequestBodyError, readRawBody } from '../http/requestBody.mjs'
import { sendError, sendJson } from '../http/responses.mjs'
import { logger } from '../logger.mjs'

export function registerVozRoutes(router, { config, voz }) {
  router.get('/api/voz', ({ response }) => {
    sendJson(response, 200, {
      ok: true,
      habilitado: config.ia.whisper.isConfigured,
      idioma: config.ia.whisper.isConfigured ? config.ia.whisper.idioma : null,
      // El frontend necesita el tope para poder cortar la grabación ANTES de
      // enviar. Descubrirlo con un 413 después de que alguien haya hablado tres
      // minutos es tirar los tres minutos.
      maxBytes: config.limits.maxAudioBytes,
    })
  })

  router.post('/api/voz', async ({ request, response }) => {
    if (!config.ia.whisper.isConfigured) {
      return sendError(
        response, 503,
        'El dictado por voz no está configurado en este servidor. Falta la variable ' +
          'IA_WHISPER_BASE, que apunta a whisper-server.'
      )
    }

    let audio
    try {
      audio = await readRawBody(request, config.limits.maxAudioBytes)
    } catch (error) {
      if (error instanceof RequestBodyError) {
        sendError(response, error.statusCode, error.message)
        // La respuesta ya está escrita; ahora sí se corta, para que un cliente
        // que siga subiendo megas no deje el socket ocupado hasta su propio
        // timeout. El orden es lo que hace que el 413 llegue: ver `readRawBody`.
        request.destroy()
        return
      }
      throw error
    }

    if (!audio.length) return sendError(response, 400, 'No ha llegado ningún audio.')

    // Si el cliente se va a mitad de la transcripción, se aborta también la
    // llamada a whisper-server. Mismo motivo que en `/api/chat`: no dejar al
    // otro proceso trabajando para nadie.
    const abortador = new AbortController()
    response.on('close', () => {
      if (!response.writableEnded) abortador.abort()
    })

    try {
      const resultado = await voz.transcribir(audio, { signal: abortador.signal })

      if (!resultado.ok) {
        // 422 y no 500: el audio llegó y se procesó, pero no dio texto
        // aprovechable. Es un resultado, no una avería del servidor, y el
        // frontend lo enseña como aviso en vez de como error rojo.
        return sendError(response, 422, resultado.error)
      }

      sendJson(response, 200, { ok: true, texto: resultado.texto })
    } catch (error) {
      if (error?.name === 'AbortError' || abortador.signal.aborted) return

      logger.error('La transcripción falló', { err: error, bytes: audio.length })
      if (!response.headersSent) {
        sendError(response, 502, `No se pudo transcribir el audio: ${error?.message ?? error}`)
      }
    }
  })
}
