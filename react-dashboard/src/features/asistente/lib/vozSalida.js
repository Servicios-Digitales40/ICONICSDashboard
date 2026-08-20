/**
 * Que el asistente conteste hablando.
 *
 * ── POR QUÉ EL SINTETIZADOR DEL NAVEGADOR Y NO UN MODELO ───────────
 *
 * `speechSynthesis` usa las voces del SISTEMA. En Windows son las de SAPI, que
 * vienen instaladas, funcionan sin red y no ocupan VRAM — que es el recurso
 * escaso aquí, donde ya compiten el modelo de lenguaje y el de audio.
 *
 * La alternativa era un modelo de voz neuronal (Piper, XTTS). Suenan mejor,
 * pero: hay que instalarlos, hay que descargar el modelo, y hay que reservarles
 * memoria. Para leer «el tanque está al 62 %, en banda» eso no compra nada. Si
 * algún día la voz de Windows resulta insuficiente, este archivo es el único
 * sitio que habría que cambiar.
 *
 * ── LO QUE NO HACE, Y ES DELIBERADO ────────────────────────────────
 *
 * No lee mientras el modelo escribe. Se espera a la respuesta ENTERA.
 *
 * Leer los tokens conforme llegan parecía lo natural —es lo que hace la
 * pantalla— y en voz es desastroso: el modelo genera a ráfagas, así que la
 * frase sale troceada con pausas donde no van, y encima el backend puede
 * añadir un aviso al final que ya no se leería. Una respuesta son unos
 * segundos de audio; esperar a tenerla entera cuesta poco y se entiende.
 */

/** Idioma de la voz. El mismo que habla el asistente. */
const IDIOMA = 'es-ES'

/**
 * Velocidad. Un poco por encima de la normal.
 *
 * Las voces de SAPI a velocidad 1 suenan lentas para escuchar una cifra que ya
 * está en pantalla. 1,05 se entiende igual y no cansa; más arriba, los números
 * con decimales empiezan a atropellarse, que es justo lo que no puede pasar.
 */
const VELOCIDAD = 1.05

export function puedeHablar() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * Las voces en español instaladas, mejor primero.
 *
 * ── POR QUÉ ESTO NO ES INMEDIATO ───────────────────────────────────
 *
 * `getVoices()` devuelve una lista VACÍA en la primera llamada de la página:
 * el navegador las carga de forma asíncrona y avisa con `voiceschanged`. Sin
 * esperar a ese evento, la primera respuesta se lee con la voz por defecto del
 * sistema —que en un Windows en inglés lee el español con acento inglés y es
 * ininteligible— y sólo a partir de la segunda suena bien.
 */
function vocesEnEspanol() {
  const todas = window.speechSynthesis.getVoices()
  return todas
    .filter(v => v.lang?.toLowerCase().startsWith('es'))
    // Las locales antes que las de red: una voz remota no funcionaría en una
    // planta sin salida a internet, que es el escenario de esta instalación.
    .sort((a, b) => Number(b.localService) - Number(a.localService))
}

/** Espera a que el navegador tenga las voces cargadas. */
function esperarVoces() {
  return new Promise(resolve => {
    if (window.speechSynthesis.getVoices().length) return resolve(vocesEnEspanol())

    const alCargar = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', alCargar)
      resolve(vocesEnEspanol())
    }
    window.speechSynthesis.addEventListener('voiceschanged', alCargar)

    // Red de seguridad: algún navegador no dispara nunca el evento si ya las
    // tenía. Sin esto, la promesa no se resolvería jamás y el modo manos
    // libres se quedaría mudo sin decir por qué.
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', alCargar)
      resolve(vocesEnEspanol())
    }, 1500)
  })
}

let vozElegida = null

/**
 * Lee un texto en voz alta.
 *
 * @param {string} texto
 * @returns {Promise<void>} se resuelve cuando termina de hablar, o al cortarlo
 */
export async function hablar(texto) {
  if (!puedeHablar()) return

  const limpio = paraLeer(texto)
  if (!limpio) return

  if (!vozElegida) {
    const voces = await esperarVoces()
    vozElegida = voces[0] ?? null
  }

  // Cancelar lo anterior antes de empezar: si no, las respuestas se encolan y
  // el asistente sigue leyendo la de hace tres preguntas.
  window.speechSynthesis.cancel()

  return new Promise(resolve => {
    const frase = new SpeechSynthesisUtterance(limpio)
    frase.lang = IDIOMA
    frase.rate = VELOCIDAD
    if (vozElegida) frase.voice = vozElegida

    // Se resuelve igual si falla: quien llama encadena el turno siguiente, y
    // dejarlo colgado por una voz que no arrancó dejaría el modo manos libres
    // esperando para siempre.
    frase.addEventListener('end', () => resolve())
    frase.addEventListener('error', () => resolve())

    window.speechSynthesis.speak(frase)
  })
}

/** Corta lo que se esté leyendo. */
export function callar() {
  if (puedeHablar()) window.speechSynthesis.cancel()
}

/**
 * Prepara un texto para que suene bien dicho.
 *
 * El asistente ya escribe en texto llano —se le prohíbe el markdown en las
 * instrucciones— así que aquí sólo quedan las cosas que se ven bien y se oyen
 * mal:
 *
 *  - Los símbolos que la voz deletrea o se salta. El «⚠» del aviso se lee como
 *    nada en unas voces y como «símbolo de advertencia» en otras; decir la
 *    palabra «Atención» es lo que se quería.
 *  - Las viñetas de las líneas, que se leen como «punto medio».
 *  - Las unidades pegadas al número. «62%» sale como «sesenta y dos» a secas en
 *    varias voces de SAPI, y perder la unidad en una lectura de proceso es
 *    exactamente el error que este asistente no puede cometer.
 */
function paraLeer(texto) {
  return String(texto ?? '')
    .replace(/⚠\s*/g, 'Atención: ')
    .replace(/^[·•\-*]\s*/gm, '')
    .replace(/(\d)\s*%/g, '$1 por ciento')
    .replace(/(\d)\s*°C/g, '$1 grados')
    // Una hora como «14:32» se lee dígito a dígito en algunas voces.
    .replace(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}
