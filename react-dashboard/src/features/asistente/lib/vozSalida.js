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

/**
 * Idioma que se pide si NO hay ninguna voz en español instalada.
 *
 * ── POR QUÉ NO SE FIJA 'es-ES' Y YA ────────────────────────────────
 *
 * Porque fijarlo dejó el asistente MUDO en la máquina de planta. Windows trae
 * voces de español de MÉXICO —Sabina, Raúl, todas `es-MX`— y ninguna `es-ES`.
 * Al pedir un locale sin voz instalada, Chrome no lanza ningún error: no suena
 * nada. Es el peor modo de fallo posible, porque no deja rastro en ninguna
 * parte.
 *
 * Ahora el idioma se toma de la VOZ que se haya elegido, sea la que sea. Este
 * valor es sólo el último recurso para cuando no hay ninguna en español y hay
 * que dejar que el sistema decida.
 */
const IDIOMA_POR_DEFECTO = 'es'

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
/**
 * La mejor voz disponible para hablar español.
 *
 * Cualquier variante vale —`es-MX`, `es-ES`, `es-AR`— porque una cifra de
 * proceso se entiende igual con acento mexicano que peninsular, y exigir una
 * región concreta es lo que dejó mudo al asistente en planta.
 *
 * Si no hay NINGUNA en español devuelve `null`, y entonces habla la voz por
 * defecto del sistema. Se entenderá regular, pero se oye — que es infinitamente
 * mejor que el silencio, porque el silencio no se puede diagnosticar.
 */
function elegirVoz(todas) {
  const espanolas = (todas ?? [])
    .filter(v => v.lang?.toLowerCase().startsWith('es'))
    // Las locales antes que las de red: una voz remota no funcionaría en una
    // planta sin salida a internet, que es el escenario de esta instalación.
    .sort((a, b) => Number(b.localService) - Number(a.localService))

  return espanolas[0] ?? null
}

function vocesEnEspanol() {
  return window.speechSynthesis.getVoices()
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

/**
 * Se guarda el NOMBRE de la voz, nunca el objeto.
 *
 * ── POR QUÉ ESTO IMPORTA TANTO ─────────────────────────────────────
 *
 * Chrome recrea los objetos `SpeechSynthesisVoice` cuando le apetece —al
 * cambiar de pestaña, al reanudar el equipo, al recargar la lista— y asignar
 * uno CADUCADO a `utterance.voice` hace que descarte la frase **sin emitir
 * ningún evento**. Ni `error`, ni `end`, ni nada.
 *
 * Fue exactamente lo que pasó en planta: pegar en la consola una frase sin
 * `voice` ni `lang` sonaba perfectamente, y la misma frase desde el código
 * —con un objeto de voz cacheado desde la carga de la página— no sonaba. La
 * diferencia entre las dos era el objeto caducado.
 *
 * Guardando el nombre y buscándolo en la lista ACTUAL en cada frase, el objeto
 * siempre es fresco.
 */
let nombreDeVoz = null

/**
 * Se piden las voces AL CARGAR LA PÁGINA, no al primer clic.
 *
 * `getVoices()` devuelve una lista vacía la primera vez y la rellena de forma
 * asíncrona. Si la primera petición ocurre en el clic del teléfono, la lista
 * aún está vacía en ese instante: no hay voz que asignar, y la frase de saludo
 * sale sin `voice`. Chrome, ante un `lang` que no puede resolver a una voz
 * concreta, descarta la frase sin decir nada.
 *
 * Pidiéndolas al importar el módulo —que ocurre al abrir el tablero, mucho
 * antes de que nadie pulse nada— para cuando llegue el clic ya están.
 */
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const cargar = () => {
    const voces = window.speechSynthesis.getVoices()
    if (voces.length && !nombreDeVoz) nombreDeVoz = elegirVoz(voces)?.name ?? null
  }
  cargar()
  window.speechSynthesis.addEventListener?.('voiceschanged', cargar)
}

/**
 * Desbloquea la síntesis de voz. Hay que llamarla DENTRO de un clic.
 *
 * ── POR QUÉ HACE FALTA ─────────────────────────────────────────────
 *
 * Chrome no deja hablar a una página que nunca ha recibido una interacción
 * del usuario — es la misma política que impide que un anuncio suene solo al
 * abrir una pestaña—. Y en el modo llamada, la primera respuesta se lee uno o
 * dos MINUTOS después del clic que encendió el modo, cuando el navegador ya no
 * considera que haya gesto reciente. El resultado es silencio: `speak()` no
 * lanza ningún error, simplemente no suena nada.
 *
 * Pronunciar una cadena vacía en el momento del clic basta para que el
 * navegador marque la página como autorizada, y a partir de ahí todo lo demás
 * suena. No se oye nada al hacerlo.
 */
export function desbloquearVoz(saludo) {
  if (!puedeHablar()) return

  try {
    // Pedir la lista dispara su carga asíncrona: para cuando llegue la primera
    // respuesta ya estarán. Y aquí, síncrono, puede que ya estén.
    const voces = window.speechSynthesis.getVoices()
    if (!nombreDeVoz && voces.length) nombreDeVoz = elegirVoz(voces)?.name ?? null

    /*
     * Se habla AQUÍ MISMO, sin `await` de por medio, y eso es lo importante.
     *
     * `hablar()` espera a que carguen las voces antes de llamar a `speak()`, y
     * ese `await` rompe la cadena del gesto: para el navegador, la llamada ya
     * no viene de un clic sino de un temporizador, y vuelve a bloquearla. La
     * frase de saludo tiene que salir en la misma vuelta del clic.
     */
    const frase = new SpeechSynthesisUtterance(saludo ?? '')
    frase.rate = VELOCIDAD
    aplicarVoz(frase)
    if (!saludo) frase.volume = 0

    window.speechSynthesis.speak(frase)
    avisarSiSeQuedaMuda(frase)
  } catch {
    // Si el navegador se queja, se seguirá intentando al hablar de verdad.
  }
}

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

  if (!nombreDeVoz) nombreDeVoz = elegirVoz(await esperarVoces())?.name ?? null

  // Cancelar lo anterior antes de empezar: si no, las respuestas se encolan y
  // el asistente sigue leyendo la de hace tres preguntas.
  window.speechSynthesis.cancel()

  return new Promise(resolve => {
    const frase = new SpeechSynthesisUtterance(limpio)
    frase.rate = VELOCIDAD
    aplicarVoz(frase)

    let acabado = false
    const terminar = () => {
      if (acabado) return
      acabado = true
      clearInterval(latido)
      clearTimeout(corte)
      resolve()
    }

    /*
     * El latido que mantiene viva la voz de Chrome.
     *
     * Chrome tiene un fallo antiguo y muy conocido: deja de hablar a los ~15
     * segundos y no emite ni `end` ni `error`. Una respuesta de este asistente
     * pasa de quince segundos leída con facilidad, así que se corta a mitad y
     * el modo llamada se queda esperando un `end` que no va a llegar nunca.
     *
     * El apaño aceptado es pausar y reanudar periódicamente: reinicia el
     * temporizador interno del navegador sin que se note en el audio. En las
     * demás plataformas es inocuo.
     */
    const latido = setInterval(() => {
      if (acabado) return
      if (!window.speechSynthesis.speaking) return
      window.speechSynthesis.pause()
      window.speechSynthesis.resume()
    }, 10000)

    /*
     * Y un corte por tiempo, por si aun así se queda muda.
     *
     * Sin él, un `end` que no llega deja la promesa colgada, y con ella el
     * ciclo del modo llamada: no vuelve a escuchar nunca. Se calcula sobre la
     * longitud del texto —unos 12 caracteres por segundo a esta velocidad— con
     * margen generoso, porque cortar una respuesta a medias es peor que
     * esperar unos segundos de más.
     */
    const msEstimados = (limpio.length / 12) * 1000 * 2 + 5000
    const corte = setTimeout(terminar, msEstimados)

    // Se resuelve igual si falla: quien llama encadena el turno siguiente, y
    // dejarlo colgado por una voz que no arrancó dejaría el modo manos libres
    // esperando para siempre.
    frase.addEventListener('end', terminar)
    frase.addEventListener('error', terminar)

    window.speechSynthesis.speak(frase)

    // También aquí, y no sólo en el saludo: si una RESPUESTA se descarta en
    // silencio, el operador se queda esperando una voz que no va a llegar y
    // sin nada en pantalla que lo explique.
    avisarSiSeQuedaMuda(frase)
  })
}

/**
 * Le pone voz e idioma a una frase.
 *
 * ── POR QUÉ SIN VOZ NO SE TOCA `lang` ──────────────────────────────
 *
 * Porque un `lang` que el navegador no sabe resolver a una voz concreta hace
 * que descarte la frase en silencio. Si no hemos podido elegir voz, lo seguro
 * es no pedir NADA y dejar que hable con la del sistema: se entenderá regular,
 * pero se oye — y el silencio es el único fallo que no se puede diagnosticar.
 */
function aplicarVoz(frase) {
  const voces = window.speechSynthesis.getVoices()
  if (!nombreDeVoz) nombreDeVoz = elegirVoz(voces)?.name ?? null

  // Se busca en la lista de AHORA, no se reutiliza un objeto guardado. Ver la
  // cabecera de `nombreDeVoz`.
  const voz = nombreDeVoz ? voces.find(v => v.name === nombreDeVoz) : null

  if (voz) {
    frase.voice = voz
    // El `lang` acompaña a la VOZ, no al revés: pedir `es-ES` con una voz
    // `es-MX` asignada es pedirle al navegador dos cosas incompatibles.
    frase.lang = voz.lang
  }
  // Sin voz no se toca `lang`: un idioma que el navegador no sabe resolver a
  // una voz concreta es otra de las formas de que descarte la frase callado.
}

/**
 * Qué hacer cuando el navegador se traga una frase sin decir nada.
 *
 * Se comprueba poco después de mandarla: si no está hablando NI tiene nada
 * pendiente, la frase se descartó. No hay evento para eso —ni `error`, ni
 * `end`— así que sin esta comprobación el síntoma es «no suena» y punto, que
 * es exactamente lo que costó dos rondas de diagnóstico encontrar.
 *
 * Lo que se hace con el aviso lo decide quien escuche `onVozMuda`; aquí sólo
 * se detecta.
 */
let onVozMuda = null
export function alQuedarseMuda(manejador) {
  onVozMuda = manejador
}

function avisarSiSeQuedaMuda(frase) {
  let empezo = false
  frase.addEventListener('start', () => { empezo = true })

  /*
   * Se mira si LLEGÓ A EMPEZAR, no si sigue hablando.
   *
   * La primera versión comprobaba `speechSynthesis.speaking` a los 400 ms, y
   * eso da falsos positivos: una frase corta como «Te escucho» ya ha terminado
   * para entonces, así que `speaking` es `false` y se avisaba de un fallo que
   * no existía. El evento `start` no miente — o la frase arrancó, o el
   * navegador la descartó.
   *
   * Segundo y medio de margen: el navegador puede tardar en arrancar la voz la
   * primera vez de la sesión, mientras carga el motor de síntesis.
   */
  setTimeout(() => {
    if (empezo) return

    const voces = window.speechSynthesis.getVoices()
    onVozMuda?.(
      voces.length
        ? 'El navegador no reprodujo la voz. Comprueba el volumen del sistema y que la ' +
          'pestaña no esté silenciada (clic derecho en la pestaña → «Activar sonido»).'
        : 'Este navegador no encuentra ninguna voz instalada, así que no puede hablar. ' +
          'Prueba con otro navegador, o reinícialo: Chrome a veces pierde la lista de voces.'
    )
  }, 1500)
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
