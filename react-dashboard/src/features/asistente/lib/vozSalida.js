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
  const espanolas = (todas ?? []).filter(v => v.lang?.toLowerCase().startsWith('es'))
  if (!espanolas.length) return null

  /*
   * ── EL ORDEN DE PREFERENCIA SALE DE UN FALLO MEDIDO ────────────────
   *
   * En la máquina de planta, Chrome ofrecía 21 voces y se eligió «Microsoft
   * Raul - Spanish (Mexico)». No sonó NADA: ni audio, ni evento `start`, ni
   * error. La misma frase sin `voice` asignada sonaba perfectamente.
   *
   * Esas voces —las que Windows llama OneCore, con el nombre en formato
   * «Microsoft X - Idioma (País)»— aparecen en la lista de Chrome pero muchas
   * no reproducen nada. Es un fallo conocido del navegador, no de la
   * instalación: el motor OneCore y el que Chrome sabe manejar no son el
   * mismo.
   *
   * Las que sí funcionan, por orden de fiabilidad:
   *
   *   1. Las de Google (`Google español`). Son las propias de Chrome y las
   *      más fiables, cuando están.
   *   2. Las SAPI clásicas, que se reconocen por acabar en «Desktop»
   *      (`Microsoft Sabina Desktop`). Es el motor de toda la vida.
   *   3. Cualquier otra local.
   *   4. Las de red, sólo como último recurso: una planta sin salida a
   *      internet no puede depender de ellas.
   *
   * Y aunque se elija mal, `pronunciar` reintenta sin voz si no arranca. Este
   * orden reduce la probabilidad de necesitar ese reintento, no la sustituye.
   */
  const puntos = (v) => {
    const nombre = v.name ?? ''
    if (/google/i.test(nombre)) return 0
    if (/desktop$/i.test(nombre)) return 1
    // Formato OneCore: «Microsoft Raul - Spanish (Mexico)». Las últimas.
    if (/^Microsoft .+ - .+\(.+\)$/.test(nombre)) return 3
    return 2
  }

  return [...espanolas].sort((a, b) => {
    // Las locales siempre antes que las de red.
    const red = Number(a.localService === false) - Number(b.localService === false)
    if (red !== 0) return red
    return puntos(a) - puntos(b)
  })[0]
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
 * Dice una frase, y si no arranca la repite SIN voz asignada.
 *
 * ── POR QUÉ EL REINTENTO ES LA PIEZA CLAVE ─────────────────────────
 *
 * Medido en la máquina de planta: con «Microsoft Raul - Spanish (Mexico)»
 * asignada no sonaba nada —ni audio, ni evento `start`, ni error— y la misma
 * frase sin `voice` sonaba perfectamente. Son las voces OneCore de Windows,
 * que Chrome lista pero no siempre sabe reproducir.
 *
 * Elegir mejor la voz reduce la probabilidad de caer ahí, pero no la elimina:
 * cada equipo tiene su combinación de motores instalados y no se puede saber
 * de antemano cuál falla. El reintento sí lo resuelve, porque no depende de
 * acertar: si la voz elegida no arranca en un segundo, se repite dejando que
 * el navegador use la suya.
 *
 * Se preferirá siempre la voz en español; el reintento suena peor —puede leer
 * el español con voz inglesa— pero SE OYE, y una respuesta mal pronunciada es
 * infinitamente mejor que el silencio.
 *
 * @param {string} texto
 * @param {object} [opciones]
 * @param {number} [opciones.volumen]
 * @param {() => void} [opciones.alTerminar]
 */
function pronunciar(texto, { volumen, alTerminar } = {}) {
  const sintesis = window.speechSynthesis

  /*
   * `alTerminar` se llama UNA sola vez.
   *
   * Con el reintento hay dos frases en juego, y cancelar la primera puede
   * dispararle su `end`. Sin esta guarda, quien espera el final —el modo
   * llamada, para abrir el micrófono— arrancaría mientras la segunda todavía
   * está hablando, y volvería a grabarse a sí mismo.
   */
  let avisado = false
  let corteFinal = null
  const terminado = () => {
    if (avisado) return
    avisado = true
    clearTimeout(corteFinal)
    alTerminar?.()
  }

  /*
   * Corte por tiempo, SIEMPRE, arranque o no arranque la frase.
   *
   * Chrome no siempre emite `end`. Si quien espera ese aviso es el modo
   * llamada —que abre el micrófono cuando el saludo acaba— un `end` que no
   * llega deja el micrófono cerrado para siempre: el botón nunca se pone en
   * rojo y hablar no hace nada.
   *
   * Es justo lo que pasó al secuenciar el saludo con la escucha. Antes no se
   * notaba porque nadie esperaba el final del saludo.
   *
   * El margen se estima sobre la longitud del texto —unos 12 caracteres por
   * segundo a esta velocidad—, con holgura pero SIN pasarse: cortar antes de
   * tiempo solaparía la voz con el micrófono, que es el problema que se venía
   * de arreglar, pero un margen enorme convierte el fallo en una espera muerta
   * mirando un botón que no reacciona. Para «Te escucho» son ~3 s.
   */
  corteFinal = setTimeout(terminado, (texto.length / 12) * 1000 * 1.5 + 2000)

  const intentar = (conVoz) => {
    let cancelado = false
    const frase = new SpeechSynthesisUtterance(texto)
    frase.rate = VELOCIDAD
    if (typeof volumen === 'number') frase.volume = volumen
    if (conVoz) aplicarVoz(frase)

    let empezo = false
    frase.addEventListener('start', () => { empezo = true })
    // El `end` de un intento cancelado NO cuenta como final: lo marca el
    // propio reintento poniendo `cancelado`.
    frase.addEventListener('end', () => { if (!cancelado) terminado() })
    frase.addEventListener('error', () => { if (!cancelado) terminado() })

    /*
     * El oyente se registra ANTES de `speak()`: la llamada puede despachar
     * `start` de inmediato, y engancharse después significa perdérselo y
     * concluir que la frase no arrancó cuando sí lo hizo.
     */
    sintesis.speak(frase)

    setTimeout(() => {
      if (empezo) return

      if (conVoz) {
        // No arrancó con la voz elegida. Se repite sin ella, que es lo que en
        // planta demostró funcionar.
        cancelado = true
        sintesis.cancel()
        return intentar(false)
      }

      // Ni con la voz ni sin ella: ahora sí es un problema del navegador o del
      // audio del equipo, y hay que decirlo.
      const voces = sintesis.getVoices()
      onVozMuda?.(
        voces.length
          ? `La voz no arrancó ni con «${nombreDeVoz ?? 'la del sistema'}» ni sin ella, y hay ` +
            `${voces.length} voces disponibles. El navegador no está reproduciendo audio de esta ` +
            `página: revisa el volumen de Chrome en el mezclador de Windows.`
          : 'Este navegador no encuentra ninguna voz instalada. Prueba con otro, o reinícialo: ' +
            'Chrome a veces pierde la lista de voces.'
      )
      terminado()
    }, MS_PARA_ARRANCAR)
  }

  intentar(true)
}

/** Cuánto se le da al navegador para arrancar una frase antes de reintentar. */
const MS_PARA_ARRANCAR = 1000

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
export function desbloquearVoz(saludo, alTerminar) {
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
    pronunciar(saludo ?? '', { volumen: saludo ? undefined : 0, alTerminar })
  } catch {
    // Si el navegador se queja, se seguirá intentando al hablar de verdad —
    // pero hay que continuar igualmente, o el modo llamada se quedaría sin
    // arrancar por no haber podido saludar.
    alTerminar?.()
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
     * temporizador interno del navegador sin que se note en el audio.
     */
    const latido = setInterval(() => {
      if (acabado) return
      if (!window.speechSynthesis.speaking) return
      window.speechSynthesis.pause()
      window.speechSynthesis.resume()
    }, 10000)

    /*
     * Corte por tiempo, por si aun así se queda muda. Sin él, un `end` que no
     * llega deja la promesa colgada, y con ella el ciclo del modo llamada: no
     * vuelve a escuchar nunca. Se estima sobre la longitud del texto con
     * margen generoso: esperar de más es preferible a cortar una respuesta.
     */
    const corte = setTimeout(terminar, (limpio.length / 12) * 1000 * 2 + 8000)

    pronunciar(limpio, { alTerminar: terminar })
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


/** Corta lo que se esté leyendo. */
export function callar() {
  if (puedeHablar()) window.speechSynthesis.cancel()
}

/**
 * Prepara un texto para que suene bien dicho.
 *
 * ── EL MARKDOWN SE QUITA AQUÍ, NO SE LE PIDE AL MODELO ─────────────
 *
 * Esta función asumía que el asistente escribe en texto llano porque las
 * instrucciones se lo piden. **No lo hace.** Medido contra el servidor real,
 * cada respuesta venía así:
 *
 *     **Respuesta directa:**
 *     *   **No hay vigilancia activa:** El diagnóstico está apagado.
 *
 * Y en modo llamada la voz lo lee literal: «asterisco asterisco Respuesta
 * directa dos puntos asterisco asterisco». Una respuesta correcta convertida
 * en algo que no se entiende.
 *
 * Pedirle al modelo que no use markdown es una instrucción más que puede
 * ignorar —y la ignora—. Quitarlo aquí no depende de que obedezca: el texto
 * pasa por esta función siempre, escriba lo que escriba. La regla general de
 * este proyecto, otra vez: lo que puede hacer el código no se le encarga al
 * modelo.
 *
 * ── LO DEMÁS QUE SE VE BIEN Y SE OYE MAL ───────────────────────────
 *
 *  - El «⚠» se lee como nada en unas voces y como «símbolo de advertencia» en
 *    otras; decir la palabra «Atención» es lo que se quería.
 *  - Las unidades pegadas al número. «62%» sale como «sesenta y dos» a secas
 *    en varias voces de SAPI, y perder la unidad en una lectura de proceso es
 *    exactamente el error que este asistente no puede cometer. Por eso también
 *    se dicen `mm/s` y `m/s²`, que son las de vibración.
 */
function paraLeer(texto) {
  return String(texto ?? '')
    /* Tablas: las barras se leen como «barra vertical». La fila se convierte
       en una frase con pausas, y la línea de guiones que separa la cabecera
       se va entera porque no dice nada al oído. */
    .replace(/^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/gm, '')
    .replace(/^\s*\|(.+)\|\s*$/gm, (_, fila) => `${fila.split('|').map((c) => c.trim()).filter(Boolean).join(', ')}. `)
    /* Encabezados y citas. */
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    /* Negrita, cursiva y tachado. Los delimitadores se DELETREAN. */
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    /* La cursiva de un solo carácter sólo cuando NO está pegada a una letra:
       así `m/s²` y los nombres con guion bajo —`vRMS_S1`, `SPEED_BMS`— no se
       parten, que son justo los que aparecen en estas respuestas. */
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1$2')
    /* Código: las comillas invertidas se leen como «acento grave». */
    .replace(/```[a-zA-Z]*\n?/g, '')
    .replace(/`([^`]*)`/g, '$1')
    /* Enlaces: se dice el texto, nunca la dirección. */
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    /* Viñetas y numeración, con la sangría que el modelo les pone delante. */
    .replace(/^\s*[-*·•+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/⚠\s*/g, 'Atención: ')
    /* La raya larga separa incisos; leída suena a «raya». Una coma hace la
       misma pausa y no se pronuncia.
       El inciso suele venir PEGADO por un lado —así— y por eso no se exige
       espacio a ambos lados. Lo que sí se respeta es el rango numérico «3–5»:
       ahí la raya significa «a», no un inciso, y una coma lo estropearía. */
    .replace(/(?<!\d)\s*[—–]\s*(?!\d)/g, ', ')
    /* Unidades pegadas al número. */
    .replace(/(\d)\s*%/g, '$1 por ciento')
    .replace(/(\d)\s*°C/g, '$1 grados')
    .replace(/(\d)\s*mm\/s\b/g, '$1 milímetros por segundo')
    .replace(/(\d)\s*m\/s²/g, '$1 metros por segundo al cuadrado')
    .replace(/(\d)\s*rpm\b/gi, '$1 revoluciones por minuto')
    .replace(/(\d)\s*Hz\b/g, '$1 hercios')
    // Una hora como «14:32» se lee dígito a dígito en algunas voces.
    .replace(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/g, '$1 $2')
    /* Red de seguridad: cualquier marca que haya sobrevivido a lo anterior
       —un asterisco suelto, una barra de tabla mal cerrada— se va antes de
       llegar a la voz. Sin esto, un solo `*` desparejado basta para que la
       frase entera suene mal. */
    .replace(/[*_`#|~]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
