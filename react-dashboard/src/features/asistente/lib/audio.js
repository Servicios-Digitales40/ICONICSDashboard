/**
 * Captura de voz y conversión a WAV, en el navegador.
 *
 * ── POR QUÉ CONVIERTE AQUÍ Y NO EN EL SERVIDOR ─────────────────────
 *
 * `whisper-server` sólo acepta WAV PCM de 16 kHz salvo que se arranque con
 * `--convert`, que necesita **ffmpeg instalado en el servidor de planta**. Eso
 * es una dependencia externa que habría que instalar y mantener en cada
 * despliegue, y el backend de este proyecto no tiene ninguna a propósito.
 *
 * El navegador ya trae todo lo necesario: `MediaRecorder` graba, la Web Audio
 * API descodifica cualquier formato que el navegador entienda, y el WAV se
 * escribe a mano —son 44 bytes de cabecera—. Nada de esto sale a la red, que
 * es el requisito que manda en esta instalación.
 *
 * De regalo, la misma función sirve para un archivo de audio que el usuario
 * arrastre al chat: si el navegador sabe reproducirlo, sabe convertirlo.
 */

/** Frecuencia que espera Whisper. No es negociable: el modelo se entrenó así. */
const FRECUENCIA_WHISPER = 16000

/**
 * ¿Puede este navegador grabar del micrófono?
 *
 * `getUserMedia` sólo existe en contextos seguros —HTTPS o localhost—, así que
 * en un despliegue de planta servido por HTTP plano desde una IP esto vale
 * `false` y el botón no se pinta. Es una limitación del navegador y no algo que
 * se pueda sortear desde aquí; enseñar un botón que siempre falla sería peor.
 */
export function puedeGrabar() {
  return Boolean(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' &&
    window.MediaRecorder
  )
}

/**
 * Arranca una grabación. Devuelve el mando para pararla.
 *
 * El objeto que devuelve tiene `detener()` —que da el WAV— y `cancelar()` —que
 * tira el audio—. Los dos apagan el micrófono: dejar la pista viva mantiene
 * encendido el piloto de la cámara/micro del portátil, y eso en una planta se
 * lee como que la aplicación está escuchando cuando no lo está.
 *
 * @returns {Promise<{ detener: () => Promise<Blob>, cancelar: () => void }>}
 */
export async function grabar() {
  const pista = await navigator.mediaDevices.getUserMedia({
    audio: {
      // Los tres ayudan de verdad con el ruido de una sala de máquinas. El
      // navegador los aplica antes de que lleguen aquí, así que salen gratis.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })

  const grabadora = new MediaRecorder(pista)
  const trozos = []
  grabadora.addEventListener('dataavailable', (e) => {
    if (e.data.size > 0) trozos.push(e.data)
  })
  grabadora.start()

  const apagarMicrofono = () => pista.getTracks().forEach((t) => t.stop())

  return {
    detener: () =>
      new Promise((resolve, reject) => {
        grabadora.addEventListener('stop', async () => {
          apagarMicrofono()
          try {
            const crudo = new Blob(trozos, { type: grabadora.mimeType })
            resolve(await aWav(crudo))
          } catch (error) {
            reject(error)
          }
        }, { once: true })
        grabadora.stop()
      }),

    cancelar: () => {
      // El orden importa: parar la grabadora dispara `stop`, y si el micrófono
      // ya está apagado ese manejador no tiene nada que hacer. Al revés se
      // quedaría la pista viva unos milisegundos de más.
      if (grabadora.state !== 'inactive') grabadora.stop()
      apagarMicrofono()
    },
  }
}

/**
 * Cualquier audio que el navegador sepa descodificar → WAV PCM 16 kHz mono.
 *
 * @param {Blob|File} archivo
 * @returns {Promise<Blob>} WAV listo para `POST /api/voz`
 */
export async function aWav(archivo) {
  const bytes = await archivo.arrayBuffer()

  // `AudioContext` se crea con la frecuencia de destino para que el remuestreo
  // lo haga el navegador —con un filtro decente— en vez de tirar muestras a
  // mano, que es lo que produce el siseo metálico que Whisper transcribe mal.
  const contexto = new (window.OfflineAudioContext ?? window.webkitOfflineAudioContext)(
    1, 1, FRECUENCIA_WHISPER
  )

  let decodificado
  try {
    decodificado = await contexto.decodeAudioData(bytes)
  } catch {
    throw new Error(
      'No se ha podido leer ese audio. Prueba con un archivo WAV, MP3, M4A u OGG.'
    )
  }

  const remuestreado = await remuestrear(decodificado)
  return escribirWav(remuestreado)
}

/**
 * Lleva el audio a 16 kHz y a un solo canal.
 *
 * Se hace con un `OfflineAudioContext` a la frecuencia de destino: el
 * navegador aplica su propio filtro anti-aliasing al remuestrear, que es
 * justo lo que no se puede improvisar bien a mano.
 *
 * La mezcla a mono la hace el propio grafo al declarar un solo canal de
 * salida. Grabar del micrófono ya da mono, pero un archivo que arrastre el
 * usuario puede ser estéreo, y Whisper con dos canales entrelazados oye ruido.
 */
async function remuestrear(buffer) {
  if (buffer.sampleRate === FRECUENCIA_WHISPER && buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0)
  }

  const destino = new (window.OfflineAudioContext ?? window.webkitOfflineAudioContext)(
    1,
    Math.ceil((buffer.duration * FRECUENCIA_WHISPER) || 1),
    FRECUENCIA_WHISPER
  )

  const fuente = destino.createBufferSource()
  fuente.buffer = buffer
  fuente.connect(destino.destination)
  fuente.start()

  const renderizado = await destino.startRendering()
  return renderizado.getChannelData(0)
}

/**
 * Muestras en coma flotante → un WAV de 16 bits, con su cabecera.
 *
 * Son 44 bytes de cabecera y una conversión de escala. Escribirlo a mano evita
 * traerse una librería para algo que cabe en veinte líneas, y además deja el
 * formato exacto que espera Whisper en vez del que decida un encoder genérico.
 *
 * @param {Float32Array} muestras  valores en [-1, 1]
 */
function escribirWav(muestras) {
  const bytesPorMuestra = 2
  const datos = muestras.length * bytesPorMuestra
  const buffer = new ArrayBuffer(44 + datos)
  const vista = new DataView(buffer)

  const texto = (offset, cadena) => {
    for (let i = 0; i < cadena.length; i++) vista.setUint8(offset + i, cadena.charCodeAt(i))
  }

  texto(0, 'RIFF')
  vista.setUint32(4, 36 + datos, true)          // tamaño del archivo - 8
  texto(8, 'WAVE')
  texto(12, 'fmt ')
  vista.setUint32(16, 16, true)                 // tamaño del bloque fmt
  vista.setUint16(20, 1, true)                  // 1 = PCM sin comprimir
  vista.setUint16(22, 1, true)                  // canales: mono
  vista.setUint32(24, FRECUENCIA_WHISPER, true)
  vista.setUint32(28, FRECUENCIA_WHISPER * bytesPorMuestra, true)  // bytes por segundo
  vista.setUint16(32, bytesPorMuestra, true)    // alineación de bloque
  vista.setUint16(34, 8 * bytesPorMuestra, true)
  texto(36, 'data')
  vista.setUint32(40, datos, true)

  for (let i = 0; i < muestras.length; i++) {
    /*
     * El recorte a [-1, 1] va ANTES de escalar, y no sobra.
     *
     * El remuestreo puede devolver picos ligeramente por encima de 1 —es un
     * filtro, no un limitador—, y sin recortar, `32767 * 1.02` desborda el
     * entero de 16 bits y da la vuelta al signo. En el audio eso suena como un
     * chasquido violento en el pico de cada palabra, y Whisper lo transcribe
     * como sílabas que nadie dijo.
     */
    const v = Math.max(-1, Math.min(1, muestras[i]))
    vista.setInt16(44 + i * bytesPorMuestra, v < 0 ? v * 0x8000 : v * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}
