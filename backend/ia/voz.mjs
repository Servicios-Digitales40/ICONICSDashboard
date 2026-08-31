/**
 * Transcripción de voz: el puente hacia `whisper-server`.
 *
 * ── POR QUÉ UN SERVIDOR Y NO EJECUTAR whisper-cli ──────────────────
 *
 * La alternativa era lanzar `whisper-cli.exe` por cada audio. Se descartó por
 * tres cosas, y la primera manda: cargar el modelo cuesta ~0,9 s **cada vez**,
 * y sobre una transcripción que dura 2 s eso es casi la mitad del tiempo
 * tirado. Además obligaría a escribir el audio en un archivo temporal —con su
 * limpieza, sus permisos y su carrera entre dos peticiones— y a que el backend
 * pudiera lanzar procesos, que es justo la capacidad que uno no quiere darle a
 * un puente expuesto a la red de planta.
 *
 * Con `whisper-server` el modelo se queda cargado y esto es un `fetch`. Es
 * exactamente la misma forma que ya tiene `IA_BASE` con llama-server, así que
 * el despliegue no aprende nada nuevo: otro proceso local, otro puerto.
 *
 * ── EL AUDIO LLEGA YA CONVERTIDO ───────────────────────────────────
 *
 * `whisper-server` sólo acepta WAV PCM de 16 kHz salvo que se arranque con
 * `--convert`, que necesita ffmpeg instalado. Aquí no se depende de ffmpeg: la
 * conversión la hace el NAVEGADOR con la Web Audio API antes de enviar, que no
 * cuesta nada, no añade dependencias y no saca el audio de la máquina. Ver
 * `react-dashboard/src/features/asistente/lib/audio.js`.
 *
 * Este módulo, por tanto, no interpreta el audio: lo reenvía tal cual.
 */
import { logger } from '../logger.mjs'

/**
 * Frase que se le da a Whisper como contexto inicial.
 *
 * No es un adorno: Whisper usa el prompt para decidir cómo escribir lo que
 * oye, y sin él transcribe el vocabulario de esta planta como le suena.
 * Medido con el modelo `small`: «Cerabar» salía como «cera bar» y «caudal
 * instantáneo» como «caudal instant Ánio». Con los nombres propios delante,
 * los reconoce.
 *
 * Se mantiene CORTA a propósito. El prompt gasta contexto del propio modelo de
 * audio, y una lista larga de tags empeora la transcripción de todo lo demás.
 */
const CONTEXTO = 'Sistema de agua industrial: tanque, bomba, caudal, presión, ' +
  'temperatura, tensión de línea, variador, ICONICS, Cerabar.'

export function createVoz({ config }) {
  const { base, idioma, timeoutMs } = config.ia.whisper

  /**
   * Transcribe un WAV.
   *
   * @param {Buffer} audio      WAV PCM de 16 kHz, mono
   * @param {object} [opciones]
   * @param {AbortSignal} [opciones.signal]
   * @returns {Promise<{ ok: true, texto: string } | { ok: false, error: string }>}
   */
  async function transcribir(audio, { signal } = {}) {
    if (!base) {
      return {
        ok: false,
        error: 'La transcripción de voz no está configurada en este servidor (falta IA_WHISPER_BASE).',
      }
    }

    /*
     * Un WAV válido empieza por «RIFF» y lleva «WAVE» en el byte 8.
     *
     * Se comprueba AQUÍ y no se delega en whisper-server porque su respuesta a
     * un audio que no entiende es una transcripción VACÍA, no un error. Eso
     * llega a la pantalla como «no se oyó nada» y manda al operador a repetir
     * la frase más alto, cuando lo que pasa es que el navegador mandó webm sin
     * convertir.
     */
    if (audio.length < 44 || audio.toString('latin1', 0, 4) !== 'RIFF' ||
        audio.toString('latin1', 8, 12) !== 'WAVE') {
      return {
        ok: false,
        error: 'El audio recibido no es un WAV. El navegador tenía que haberlo convertido antes de enviarlo.',
      }
    }

    const corte = AbortSignal.timeout(timeoutMs)
    const combinado = signal ? AbortSignal.any([corte, signal]) : corte

    // `FormData` y `Blob` son estándar en Node 18+, así que el multipart no
    // trae ninguna dependencia: se construye con lo que ya hay en el runtime.
    const formulario = new FormData()
    formulario.append('file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav')
    formulario.append('response_format', 'json')
    formulario.append('language', idioma)
    formulario.append('prompt', CONTEXTO)
    // Sin marcas de tiempo: lo que se quiere es la frase para meterla en el
    // cuadro de texto, y los `[00:00:00.000 --> ...]` habría que quitarlos
    // después con una expresión regular que se rompería con cualquier cambio
    // de formato.
    formulario.append('no_timestamps', 'true')

    const empezado = Date.now()
    let respuesta
    try {
      respuesta = await fetch(`${base}/inference`, {
        method: 'POST',
        body: formulario,
        signal: combinado,
      })
    } catch (error) {
      if (error?.name === 'TimeoutError') {
        return {
          ok: false,
          error: `La transcripción no terminó en ${Math.round(timeoutMs / 1000)} s. ` +
            'Con audios largos en CPU puede pasar; prueba con una frase más corta.',
        }
      }
      if (error?.name === 'AbortError') throw error
      return {
        ok: false,
        error: 'No se puede contactar con whisper-server. El chat escrito sigue funcionando; ' +
          'sólo el dictado no está disponible.',
      }
    }

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '')
      logger.warn('whisper-server rechazó el audio', {
        status: respuesta.status, detalle: detalle.slice(0, 200),
      })
      return { ok: false, error: `whisper-server respondió ${respuesta.status}.` }
    }

    const cuerpo = await respuesta.json().catch(() => null)
    const texto = limpiar(cuerpo?.text ?? '')

    const segundos = duracionWav(audio)
    logger.debug(
      `whisper-server transcribió ${segundos} s de audio en ${Date.now() - empezado} ms ` +
        `(${texto.length} caracteres)`,
      { bytes: audio.length, segundos, caracteres: texto.length, duracionMs: Date.now() - empezado }
    )

    if (!texto) {
      return {
        ok: false,
        error: 'No se ha entendido nada en ese audio. Puede que el micrófono no captara la voz.',
      }
    }

    return { ok: true, texto }
  }

  return { transcribir, habilitado: Boolean(base) }
}

/**
 * Limpia la transcripción antes de devolverla.
 *
 * Whisper marca entre corchetes o paréntesis lo que oye y no es habla —
 * `[BLANK_AUDIO]`, `(música de fondo)`, `[ruido]`—. En un chat eso no es texto
 * que el usuario quisiera decir: es una anotación del transcriptor, y si llega
 * al cuadro de pregunta acaba enviada al modelo de lenguaje como si fuera parte
 * de la consulta.
 */
function limpiar(texto) {
  return String(texto ?? '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\((?:música|musica|risas|aplausos|ruido|silencio)[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Segundos de audio que lleva un WAV, leídos de su cabecera.
 *
 * Sólo para la traza, y por eso es tolerante: si la cabecera no es la canónica
 * de 44 bytes devuelve `null` en vez de un número inventado. Saber cuánto
 * audio costó cuántos segundos de proceso es lo que permite decidir si el
 * modelo `small` da el rendimiento necesario en esta máquina.
 */
function duracionWav(buffer) {
  try {
    const bytesPorSegundo = buffer.readUInt32LE(28)
    if (!bytesPorSegundo) return null
    return +((buffer.length - 44) / bytesPorSegundo).toFixed(1)
  } catch {
    return null
  }
}
