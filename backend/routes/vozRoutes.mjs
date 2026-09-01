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

/**
 * El audio llega como bytes, no como JSON.
 *
 * Se registra un parser propio para `application/octet-stream` en lugar de
 * leer el flujo a mano: el cuerpo llega ya como `Buffer` y el tope pasa a ser
 * del servidor. Ojo: ese tope corta el socket, así que el 413 que llega al
 * cliente lo escribe la guarda de `Content-Length` de la ruta, no esto — ver
 * su comentario.
 *
 * El límite es mucho mayor que el de JSON a propósito: un minuto de voz en
 * WAV de 16 kHz son casi 2 MB, y el tope de JSON (1 MB) rechazaría media frase.
 *
 * NO se convierte a texto en ningún punto: hacerlo destrozaría el WAV —los
 * bytes que no son secuencias UTF-8 válidas se sustituyen por el carácter de
 * reemplazo—, y el audio llegaría corrupto **sin dar ningún error**, con el
 * síntoma de una transcripción vacía o de ruido.
 */
function registrarParserDeAudio(fastify, maxAudioBytes) {
  fastify.addContentTypeParser(
    ['application/octet-stream', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/webm'],
    { parseAs: 'buffer', bodyLimit: maxAudioBytes },
    (request, cuerpo, hecho) => hecho(null, cuerpo)
  )
}

export function registerVozRoutes(fastify, { config, voz }) {
  registrarParserDeAudio(fastify, config.limits.maxAudioBytes)

  fastify.get('/api/voz', async () => ({
    ok: true,
    habilitado: config.ia.whisper.isConfigured,
    idioma: config.ia.whisper.isConfigured ? config.ia.whisper.idioma : null,
    // El frontend necesita el tope para poder cortar la grabación ANTES de
    // enviar. Descubrirlo con un 413 después de que alguien haya hablado tres
    // minutos es tirar los tres minutos.
    maxBytes: config.limits.maxAudioBytes,
  }))

  fastify.post(
    '/api/voz',
    {
      bodyLimit: config.limits.maxAudioBytes,
      /*
       * ── POR QUÉ SE MIRA `Content-Length` ANTES DE LEER ───────────────
       *
       * Esta guarda existe por un fallo real, y por eso comprueba algo tan
       * concreto. Cuando el cuerpo supera `bodyLimit`, Fastify —igual que
       * hacía el lector anterior con `request.destroy()`— corta el socket; y
       * con 6 MB el cliente TODAVÍA ESTÁ SUBIENDO cuando eso ocurre, así que
       * la respuesta muere con la conexión: quien graba un audio demasiado
       * largo recibe `ECONNRESET` —un error de red genérico— en lugar del 413
       * que le diría por qué. Medido, y es la misma lección que costó
       * descubrir la primera vez.
       *
       * Rechazar por la cabecera resuelve las dos mitades: la respuesta se
       * escribe ANTES de que empiece la subida, así que llega entera, y no se
       * lee ni un byte del cuerpo, que es lo que protegía el límite.
       *
       * `bodyLimit` se mantiene detrás como red: un cliente puede mentir en
       * `Content-Length` u omitirlo (`Transfer-Encoding: chunked`), y en ese
       * caso vuelve a cortarse el socket — pero eso ya no es un usuario
       * legítimo con un audio largo.
       */
      onRequest: async (request, reply) => {
        const declarado = Number(request.headers['content-length'] ?? 0)
        if (declarado > config.limits.maxAudioBytes) {
          const mb = Math.round(config.limits.maxAudioBytes / 1024 / 1024)
          request.log.info(
            { bytes: declarado, tope: config.limits.maxAudioBytes },
            `Audio rechazado antes de subirlo: ${Math.round(declarado / 1024 / 1024)} MB ` +
              `supera el tope de ${mb} MB`
          )
          return reply.code(413).send({
            ok: false,
            error: `El audio supera el límite de ${mb} MB.`,
          })
        }
      },
    },
    async (request, reply) => {
      if (!config.ia.whisper.isConfigured) {
        request.log.warn(
          { variable: 'IA_WHISPER_BASE' },
          'Se pidió una transcripción pero el dictado no está configurado: falta IA_WHISPER_BASE, ' +
            'que debe apuntar a whisper-server (p. ej. http://localhost:8081).'
        )
        return reply.code(503).send({
          ok: false,
          error:
            'El dictado por voz no está configurado en este servidor. Falta la variable ' +
            'IA_WHISPER_BASE, que apunta a whisper-server.',
        })
      }

      const audio = request.body
      if (!Buffer.isBuffer(audio) || !audio.length) {
        return reply.code(400).send({ ok: false, error: 'No ha llegado ningún audio.' })
      }

      // Si el cliente se va a mitad de la transcripción, se aborta también la
      // llamada a whisper-server. Mismo motivo que en `/api/chat`: no dejar al
      // otro proceso trabajando para nadie.
      const abortador = new AbortController()
      request.raw.on('aborted', () => abortador.abort())
      reply.raw.on('close', () => {
        if (!reply.raw.writableEnded) abortador.abort()
      })

      const empezado = Date.now()

      /* Qué sistema se está mirando, para elegir el vocabulario que Whisper
         necesita oír bien. Un id desconocido no es un error: cae al contexto
         general, que es peor transcripción pero nunca un fallo. */
      const sistema = request.query?.sistema ?? null

      try {
        const resultado = await voz.transcribir(audio, { signal: abortador.signal, sistema })

        if (!resultado.ok) {
          /*
           * 422 y no 500: el audio llegó y se procesó, pero no dio texto
           * aprovechable. Es un resultado, no una avería del servidor, y el
           * frontend lo enseña como aviso en vez de como error rojo.
           */
          request.log.info(
            { bytes: audio.length, ms: Date.now() - empezado, motivo: resultado.error },
            `Audio de ${Math.round(audio.length / 1024)} kB procesado sin texto aprovechable: ${resultado.error}`
          )
          return reply.code(422).send({ ok: false, error: resultado.error })
        }

        request.log.debug(
          { bytes: audio.length, caracteres: resultado.texto.length, ms: Date.now() - empezado },
          `Audio transcrito: ${resultado.texto.length} caracteres en ${Date.now() - empezado} ms`
        )

        return { ok: true, texto: resultado.texto }
      } catch (error) {
        if (error?.name === 'AbortError' || abortador.signal.aborted) {
          request.log.debug(
            { bytes: audio.length },
            'El cliente canceló el dictado antes de que whisper-server respondiera'
          )
          return reply.hijack()
        }

        request.log.error(
          { err: error, bytes: audio.length, whisperBase: config.ia.whisper.base, ms: Date.now() - empezado },
          `whisper-server no pudo transcribir un audio de ${Math.round(audio.length / 1024)} kB: ` +
            `${error?.message ?? error}. Revisa que whisper-server siga en marcha en ${config.ia.whisper.base}.`
        )

        return reply.code(502).send({
          ok: false,
          error: `No se pudo transcribir el audio: ${error?.message ?? error}`,
        })
      }
    }
  )
}
