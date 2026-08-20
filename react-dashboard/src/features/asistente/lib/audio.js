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
  return motivoSinMicrofono() === null
}

/**
 * Por qué este navegador no puede grabar, o `null` si sí puede.
 *
 * ── POR QUÉ HACE FALTA UN MOTIVO Y NO UN BOOLEANO ──────────────────
 *
 * Porque la causa casi siempre es la misma y NO se puede arreglar desde el
 * código: `navigator.mediaDevices` sólo existe en contextos seguros —HTTPS o
 * localhost—. Al abrir el tablero por IP desde otro equipo de la planta
 * (`http://192.168.x.x:3001`), el navegador retira la API entera y el botón
 * del micrófono simplemente no se pintaba.
 *
 * Sin motivo visible eso es indistinguible de que la función no exista, de que
 * el servidor no la tenga configurada o de que esté rota. Alguien acaba
 * revisando whisper-server, el `.env.local` y los permisos del micrófono para
 * descubrir que bastaba con escribir «localhost» en la barra de direcciones.
 */
export function motivoSinMicrofono() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Este navegador no soporta la captura de audio.'
  }

  /*
   * `isSecureContext` se comprueba ANTES que `mediaDevices`, aunque el síntoma
   * sea la ausencia de `mediaDevices`. Es la relación causa/efecto: decir «tu
   * navegador no soporta grabar» cuando el navegador soporta grabar
   * perfectamente y lo que pasa es que la página va por HTTP manda a la
   * persona a buscar en el sitio equivocado.
   */
  if (!window.isSecureContext) {
    return (
      'El micrófono sólo funciona en páginas seguras. Estás abriendo el tablero por HTTP ' +
      'desde otro equipo, y el navegador bloquea la grabación por seguridad. Ábrelo como ' +
      'http://localhost:3001 en el propio servidor, o publica el tablero por HTTPS.'
    )
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Este navegador no da acceso al micrófono.'
  }

  if (!window.MediaRecorder) {
    return 'Este navegador no puede grabar audio (falta MediaRecorder).'
  }

  return null
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
export async function grabar({ alDetectarSilencio, alNivel } = {}) {
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

  // El detector de silencio sólo se monta si alguien lo pide: el dictado con
  // botón no lo quiere, y montar un `AudioContext` para nada cuesta CPU y deja
  // el micrófono con un grafo de audio colgando.
  const escucha = alDetectarSilencio || alNivel
    ? vigilarSilencio(pista, { alDetectarSilencio, alNivel })
    : null

  const apagarMicrofono = () => {
    escucha?.parar()
    pista.getTracks().forEach((t) => t.stop())
  }

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
        // Parar una grabadora ya parada lanza. Pasa cuando el silencio
        // dispara el fin de turno y el usuario pulsa el botón casi a la vez.
        if (grabadora.state !== 'inactive') grabadora.stop()
        else apagarMicrofono()
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

/* ── Detección de fin de turno ───────────────────────────────────────── */

/** Cada cuánto se mide el nivel del micrófono, en milisegundos. */
const MS_ENTRE_MEDIDAS = 100

/**
 * Silencio sostenido que se considera «he terminado de hablar».
 *
 * 1,2 s es la cifra que sale de probarlo hablando de verdad: por debajo de un
 * segundo corta en las pausas naturales de una frase —«el nivel del tanque…
 * ¿cuánto ha bajado?»— y por encima de segundo y medio la conversación se
 * siente lenta, porque hay que esperar mirando la pantalla a que reaccione.
 */
const MS_SILENCIO_FIN = 1200

/**
 * Mínimo hablando antes de poder cortar por silencio.
 *
 * Sin esto, el ruido de fondo de una sala de máquinas dispara el fin de turno
 * en el primer instante, antes de que a nadie le dé tiempo a decir nada, y el
 * modo de llamada entra en un bucle de transcripciones vacías.
 */
const MS_MINIMO_HABLA = 600

/**
 * Umbral de voz, sobre el nivel RMS normalizado (0 a 1).
 *
 * ── POR QUÉ SE CALIBRA Y NO ES UN NÚMERO FIJO ──────────────────────
 *
 * Porque el suelo de ruido de una oficina y el de una sala de bombas no se
 * parecen en nada, y un umbral fijo o corta siempre o no corta nunca. Se toman
 * los primeros instantes como referencia del silencio ambiente y se exige
 * superarlo con margen: lo que se detecta es «hay bastante más ruido que
 * antes», que es lo que distingue una voz del zumbido de un motor.
 */
const MARGEN_SOBRE_RUIDO = 2.5

/** Suelo absoluto, por si el micrófono arranca ya con voz encima. */
const UMBRAL_MINIMO = 0.012

/**
 * Vigila el micrófono y avisa cuando el que habla se calla.
 *
 * Se mide sobre el dominio del tiempo (`getByteTimeDomainData`) y no sobre el
 * espectro: para saber si hay voz basta la energía de la señal, y la FFT
 * costaría más CPU en un bucle que corre diez veces por segundo mientras el
 * modelo ya está ocupando la máquina.
 */
function vigilarSilencio(pista, { alDetectarSilencio, alNivel }) {
  const AudioCtx = window.AudioContext ?? window.webkitAudioContext
  if (!AudioCtx) return null

  const contexto = new AudioCtx()
  const fuente = contexto.createMediaStreamSource(pista)
  const analizador = contexto.createAnalyser()
  analizador.fftSize = 1024
  fuente.connect(analizador)

  const muestras = new Uint8Array(analizador.fftSize)
  const empezado = Date.now()

  let ruidoAmbiente = null
  let medidasDeCalibrado = 0
  let hablando = false
  let calladoDesde = null
  let terminado = false

  const temporizador = setInterval(() => {
    if (terminado) return

    analizador.getByteTimeDomainData(muestras)

    // RMS de la desviación respecto al centro (128 en 8 bits sin signo).
    let suma = 0
    for (const m of muestras) {
      const v = (m - 128) / 128
      suma += v * v
    }
    const nivel = Math.sqrt(suma / muestras.length)
    alNivel?.(nivel)

    // Los primeros 300 ms se usan para saber cómo suena el silencio aquí.
    if (medidasDeCalibrado < 3) {
      ruidoAmbiente = ruidoAmbiente === null ? nivel : Math.max(ruidoAmbiente, nivel)
      medidasDeCalibrado += 1
      return
    }

    const umbral = Math.max(UMBRAL_MINIMO, ruidoAmbiente * MARGEN_SOBRE_RUIDO)

    if (nivel > umbral) {
      hablando = true
      calladoDesde = null
      return
    }

    // Callado. Sólo cuenta si antes llegó a hablar y ya lleva un rato con el
    // micrófono abierto: ver `MS_MINIMO_HABLA`.
    if (!hablando || Date.now() - empezado < MS_MINIMO_HABLA) return

    calladoDesde ??= Date.now()
    if (Date.now() - calladoDesde >= MS_SILENCIO_FIN) {
      terminado = true
      clearInterval(temporizador)
      alDetectarSilencio?.()
    }
  }, MS_ENTRE_MEDIDAS)

  return {
    parar() {
      terminado = true
      clearInterval(temporizador)
      // Cerrar el contexto libera el hilo de audio. Sin esto, cada turno de
      // una llamada larga deja uno abierto y el navegador acaba negándose a
      // crear más.
      contexto.close().catch(() => {})
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
