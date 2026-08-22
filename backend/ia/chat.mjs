/**
 * El bucle de conversación con herramientas.
 *
 * llama.cpp no puede llamar a nada: es un endpoint HTTP sin estado que
 * escribe texto. Cuando decide usar una herramienta emite un JSON y se
 * detiene. Este archivo es el que lo lee, ejecuta la herramienta contra
 * ICONICS y le devuelve el resultado para que redacte.
 *
 * ── DOS PASADAS, Y NO MÁS ──────────────────────────────────────────
 *
 *   1. Con herramientas    → el modelo decide qué necesita
 *      (se ejecuta la herramienta contra ICONICS, en proceso)
 *   2. SIN herramientas    → el modelo redacta con el dato en la mano
 *
 * La segunda pasada no lleva herramientas a propósito. Con el Q8 en una GPU
 * de 8 GB cada pasada cuesta decenas de segundos, así que una cadena de tres
 * llamadas convierte una pregunta en dos minutos de espera. Las herramientas
 * son gruesas justamente para que una baste.
 *
 * ── LA REGLA QUE NO SE PUEDE RELAJAR ───────────────────────────────
 *
 * Si el modelo contesta SIN haber llamado a ninguna herramienta y su
 * respuesta contiene cifras, esa respuesta no sale. Está recitando de
 * memoria, y el caso más probable es que llama-server se arrancara sin
 * `--jinja`: sin esa bandera el modelo no ve las herramientas y contesta con
 * el mismo aplomo que si las hubiera usado. Es el fallo más peligroso del
 * sistema porque parece que funciona.
 */
import { logger } from '../logger.mjs'

/**
 * Tokens extra que se le dan a la primera pasada para pensar.
 *
 * `max_tokens` cubre razonamiento y respuesta a la vez. Si la primera pasada
 * compartiera el presupuesto de la respuesta, un razonamiento largo truncaría
 * la llamada a la herramienta —y el síntoma sería un `tool_calls` a medias,
 * que es de los que cuesta diagnosticar—.
 */
const RESERVA_RAZONAMIENTO = 512

/**
 * Cuántos mensajes del hilo anterior se le recuerdan al modelo: cuatro
 * intercambios, es decir ocho mensajes.
 *
 * No es una cifra bonita. La primera pasada —la que elige la herramienta— es
 * la cara del bucle y crece con el prompt, así que un historial sin tope
 * convierte una conversación larga en una lenta, justo al revés de lo que
 * espera quien está preguntando.
 *
 * El tope se aplica AQUÍ y no en el frontend: un cliente que mande cincuenta
 * turnos no puede degradar el servicio de las demás pantallas.
 */
const MAX_MENSAJES_HISTORIAL = 8

/** Recorte por mensaje, para que un turno larguísimo no se coma el contexto. */
const MAX_CARACTERES_TURNO = 600

/**
 * Convierte el historial que manda el cliente en mensajes para el modelo.
 *
 * ── QUÉ ENTRA Y QUÉ NO ─────────────────────────────────────────────
 *
 * Entra el TEXTO de cada turno. **No entran los resultados de las
 * herramientas**, y esa es la decisión importante: devolverle al modelo el
 * JSON de consultas anteriores le invita a mezclarlo con la pregunta nueva y
 * a citar la cifra del turno pasado como si fuera la de este. El texto ya
 * dice lo que hace falta para entender el hilo, y no se puede confundir con
 * un dato recién leído.
 *
 * Tampoco entran los turnos bloqueados ni los que fallaron; de eso se encarga
 * el cliente, que es quien sabe cuáles fueron, y aquí se descarta lo que no
 * tenga forma de turno.
 */
function historialAMensajes(historial) {
  if (!Array.isArray(historial)) return []

  return historial
    .filter(t => t && typeof t.texto === 'string' && t.texto.trim())
    .map(t => ({
      role: t.rol === 'asistente' ? 'assistant' : 'user',
      content: t.texto.trim().slice(0, MAX_CARACTERES_TURNO),
    }))
    .slice(-MAX_MENSAJES_HISTORIAL)
}

/** Estados que se le enseñan al usuario mientras espera. */
export const ESTADOS = {
  pensando: 'Pensando…',
  consultando: 'Consultando ICONICS…',
  documentacion: 'Buscando en la documentación…',
  analizando: 'Analizando los datos…',
  // La bomba no se «consulta»: se actúa sobre ella, y la escritura tarda lo
  // suyo porque `controlar_bomba` relee el punto para confirmar el efecto. Un
  // «Consultando ICONICS…» ahí diría que se está leyendo algo que no es.
  controlando: 'Actuando sobre la bomba…',
  redactando: 'Redactando la respuesta…',
}

/**
 * Qué se le enseña al operador mientras corre cada herramienta.
 *
 * No es decoración. Una consulta encadenada son entre uno y tres minutos, y
 * «Pensando…» fijo durante ese rato es indistinguible de un cuelgue: el
 * operador pulsa otra vez y ahora hay dos preguntas peleándose por la misma
 * GPU. Ver la cabecera de `chatRoutes.mjs`.
 */
const ESTADO_POR_HERRAMIENTA = {
  estado_del_sistema: ESTADOS.consultando,
  historia_de_senal: ESTADOS.consultando,
  comparar_periodos: ESTADOS.consultando,
  analisis_de_senal: ESTADOS.analizando,
  perfil_de_senal: ESTADOS.analizando,
  correlacionar_senales: ESTADOS.analizando,
  grafico_de_senal: ESTADOS.consultando,
  consultar_documentacion: ESTADOS.documentacion,
  controlar_bomba: ESTADOS.controlando,
}

/**
 * Saca del resultado de una herramienta lo que NO puede entrar en el contexto
 * del modelo.
 *
 * El contrato es el guion bajo: cualquier clave `_algo` es carga útil para la
 * pantalla, no para el modelo. Hoy sólo la usa `grafico_de_senal`, cuyo SVG
 * son decenas de miles de caracteres — meterlo en los mensajes desbordaba la
 * ventana de contexto y expulsaba las instrucciones y el propio dato que había
 * que contar.
 *
 * @returns {{ paraElModelo: object, adjuntos: object[] }}
 */
function separarAdjuntos(resultado) {
  if (!resultado || typeof resultado !== 'object') {
    return { paraElModelo: resultado, adjuntos: [] }
  }

  const paraElModelo = {}
  const adjuntos = []

  for (const [clave, valor] of Object.entries(resultado)) {
    if (clave.startsWith('_')) {
      if (valor) adjuntos.push(valor)
    } else {
      paraElModelo[clave] = valor
    }
  }

  return { paraElModelo, adjuntos }
}

/**
 * Detecta cifras en una respuesta sin herramienta.
 *
 * Deja pasar dos clases de número, y sólo dos:
 *
 *  - **Contar el catálogo.** «Hay 8 señales», «4 activos», «sólo 4 tienen
 *    historia». El catálogo entero viaja en las instrucciones, así que contar
 *    sus filas es leer, no suponer. Sin esta excepción se bloqueaba la
 *    pregunta más básica de todas: «¿qué puedes consultar?».
 *  - **Los nombres propios que llevan número dentro**, como la raíz del árbol
 *    `ac:TDCON/DEMO/SENSORES/`, que no lleva ninguno hoy pero sí lo llevan las
 *    unidades citadas de memoria en una aclaración («en °C»). Se cubren con la
 *    lista de sustantivos de abajo y no con una regla general.
 *
 * Cualquier otro número es una medición inventada. Se es deliberadamente
 * estrecho: ninguna cifra de proceso —un nivel, una presión— se escribe jamás
 * seguida de la palabra «señales» o «activos».
 *
 * ── POR QUÉ ESTA LISTA Y NO LA DE ANTES ────────────────────────────
 *
 * La versión anterior perdonaba los números pegados a un nombre de máquina
 * («Línea 1», «Multi 13», «LIN/1»). En esta instalación **no hay máquinas
 * numeradas**: es un solo sistema con ocho señales. Mantener aquella
 * excepción no sería inofensivo — dejaría pasar «el nivel bajó a 1» si el
 * modelo escribiera «línea» por «línea de distribución», que es justo la
 * palabra que más va a usar hablando de tuberías.
 */
function contieneCifras(texto) {
  const sinRecuentos = String(texto ?? '')
    // «8 señales», «4 activos», «ocho puntos».
    .replace(/\b\d+\s+(se[ñn]al|activo|punto|tag|magnitud)(es)?\b/gi, '')
    // «sólo 4 tienen historia». Es el otro modo de contar el catálogo, y sin
    // esta forma se bloqueaba la respuesta a «¿qué puedes consultar?» por su
    // segunda mitad. Se ata a las palabras «serie» o «historia» a propósito:
    // ninguna medición de proceso se escribe jamás así.
    .replace(/\b\d+\s+(?:de\s+(?:ellas|ellos|las\s+ocho)\s+)?(?:s[oó]lo\s+)?tienen?\s+(?:serie|historia)\b/gi, '')
  return /\d/.test(sinRecuentos)
}

/**
 * Marcado con el que Qwen anuncia una llamada a herramienta.
 *
 * En la pasada de redactar **no** se le pasan herramientas, así que si el
 * modelo intenta llamar a otra —porque la primera no le bastó— llama-server no
 * lo interpreta y su marcado interno sale como texto plano. En pantalla eso es
 * un `<tool_call>` crudo en mitad de la respuesta, que es lo peor de los dos
 * mundos: ni contesta ni parece un error.
 */
const MARCADO_HERRAMIENTA = ['<tool_call>', '<function=', '<tools>', '<|tool_call|>']

/** Longitud del marcador más largo, para no partirlo entre dos trozos. */
const MARGEN_MARCADO = Math.max(...MARCADO_HERRAMIENTA.map(m => m.length))

/** Posición del primer marcado en el texto, o -1. */
function buscarMarcado(texto) {
  let primero = -1
  for (const marca of MARCADO_HERRAMIENTA) {
    const i = texto.indexOf(marca)
    if (i !== -1 && (primero === -1 || i < primero)) primero = i
  }
  return primero
}

/**
 * ¿Ya contó el modelo el aviso de la herramienta?
 *
 * Se busca la idea, no la frase literal: el modelo la reformula. Aquí el aviso
 * que más viaja es el de procedencia de los umbrales —que las bandas son
 * nuestras y no del servidor—, así que basta con que haya dicho que el límite
 * es una estimación, que no está confirmado, o que el estado lo calcula el
 * tablero. Si no, el backend lo añade detrás.
 */
function mencionaElAviso(texto) {
  // `estimad[oa]s?` además de `estimación`: medido con el 4B, la forma que le
  // sale de dentro es «el límite inferior estimado es 15 %», y sin cubrirla el
  // backend añadía el aviso entero detrás de una frase que ya lo decía.
  return /estimaci[oó]n|estimad[oa]s?|no (?:est[aá]n?|son|es) confirmad|sin confirmar|provisional|no (?:los|lo) publica|no (?:es|son) (?:un )?dato de ICONICS|c[aá]lculo del tablero|l[ií]mites? (?:propios|nuestros)/i
    .test(String(texto ?? ''))
}

/** Fecha de hoy en local, para que el modelo resuelva «hoy» y «ayer». */
function hoyLocal() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Instrucciones del sistema.
 *
 * Son parte del programa, no un adorno: es lo único que el modelo lee para
 * decidir cuándo llamar a una herramienta y qué hacer cuando no hay dato.
 */
function instrucciones(catalogo, maxPasos) {
  return [
    'Te llamas Tdconcito. Eres el asistente de un tablero que vigila un SISTEMA DE AGUA',
    'INDUSTRIAL: un tanque, un',
    'grupo de bombeo, una red de distribución y su suministro eléctrico. Respondes en español,',
    'con frases cortas.',
    '',
    `Hoy es ${hoyLocal()}. Las fechas se escriben siempre como YYYY-MM-DD.`,
    '',
    'QUÉ ES ESTA INSTALACIÓN, Y QUÉ NO ES:',
    '',
    'El servidor publica OCHO señales y nada más. Aquí no hay máquinas, ni líneas de producción,',
    'ni piezas, ni OEE, ni disponibilidad, ni rendimiento, ni calidad, ni turnos de fabricación.',
    'Si te preguntan por algo de eso, di que esta instalación no lo mide y enumera lo que sí.',
    '',
    'REGLAS QUE NO PUEDES SALTARTE:',
    '',
    '1. NUNCA inventes una cifra. Todo número que digas tiene que venir de una herramienta que',
    '   acabes de llamar en este mismo turno. Si no tienes el dato, dilo.',
    '2. Si una herramienta devuelve un error, cuéntaselo al usuario con tus palabras. No lo',
    '   maquilles ni lo sustituyas por una estimación.',
    '3. Sólo CUATRO de las ocho señales tienen historia: nivel del tanque, temperatura del',
    '   tanque, caudal instantáneo y presión relativa. A tres de las otras cuatro —carga del',
    '   motor, eficiencia energética y tensión de línea— el historiador les devuelve la curva',
    '   de OTRA señal sin dar error, así que no se les pide nunca. Si preguntan por el pasado',
    '   de cualquiera de las cuatro, dilo claramente y ofrece su valor actual.',
    '4. NUNCA inventes una unidad. El servidor no declara las unidades: el caudal y la presión',
    '   vienen sin unidad, y decir "l/s" o "bares" sería inventarse la magnitud. Si la',
    '   herramienta te da la unidad, úsala; si te la da vacía, di el número a secas.',
    '5. Di siempre de dónde viene el dato: si es de tiempo real o del historiador, y de cuándo.',
    '5b. Las BANDAS con las que se juzga cada señal son estimaciones nuestras y NO se parecen a',
    '    esta instalación: medido contra el servidor real, la presión relativa pasa el 92 % del',
    '    tiempo por debajo de su «mínimo». Por eso, cuando te pregunten si un valor es normal o',
    '    raro, NO contestes con la banda: usa perfil_de_senal, que lo mide.',
    '6. El ESTADO de una señal («en banda», «en aviso», «fuera de límite») lo calcula el tablero',
    '   comparando el valor contra límites estimados por nosotros, NO por quien opera la',
    '   instalación, y este árbol no tiene alarmas configuradas. Cuando digas que algo está',
    '   fuera de límite, di también de quién es ese límite. La herramienta te manda el aviso',
    '   hecho; no hace falta que lo copies literal, pero la idea tiene que estar.',
    '7. La instalación está PARADA la mayor parte del tiempo, y eso es normal. Con el motor a',
    '   cero y sin caudal, el caudal, la presión, la carga del motor y la eficiencia no',
    '   significan nada y aparecen como "En reposo". Reposo no es avería: no lo cuentes como',
    '   un problema ni propongas revisar nada por ello.',
    '8. Esto es una conversación: «¿y hace tres horas?» o «¿y la presión?» se refieren a lo que',
    '   se acaba de hablar. Resuelve a qué señal y a qué momento se refieren, y VUELVE A',
    '   CONSULTAR con la herramienta. Nunca deduzcas una cifra nueva a partir de otra que ya',
    '   dijiste: los datos se leen, no se calculan.',
    '9. No hagas aritmética. Cita los números tal y como vienen de la herramienta. Si te dice',
    '   que hay 8 señales, 5 en banda y 3 en reposo, di exactamente eso; no restes, no sumes',
    '   y no repartas por activos de tu cuenta. Una cuenta mal hecha en la frase final estropea',
    '   una consulta que salió bien.',
    `10. Puedes encadenar hasta ${maxPasos} consultas para una misma pregunta, y en cada ronda`,
    '    puedes pedir varias herramientas a la vez. Pero no gastes pasos de más: si la pregunta',
    '    es "¿qué nivel tiene el tanque?", una llamada a estado_del_sistema la responde entera,',
    '    porque devuelve las OCHO señales juntas. Encadena sólo cuando la respuesta lo necesite',
    '    de verdad — un diagnóstico, una comparación, algo que hay que buscar en el manual.',
    '    Cuando ya tengas con qué contestar, contesta: cada consulta de más son segundos que',
    '    el operador pasa mirando una pantalla que no dice nada.',
    '',
    'CÓMO SE DIAGNOSTICA UNA AVERÍA:',
    '',
    'Si te preguntan por qué ha fallado algo, o qué ha podido causar un problema, ése es',
    'justamente el caso para encadenar consultas. El camino que funciona es:',
    '',
    '  a) estado_del_sistema, para ver cómo está todo AHORA y qué señal está mal.',
    '  b) analisis_de_senal o historia_de_senal sobre las señales sospechosas, para ver qué',
    '     pasó ANTES del fallo. Las anomalías que devuelve analisis_de_senal son las candidatas.',
    '  b2) perfil_de_senal si necesitas saber si un valor es RARO. Compara contra semanas de',
    '     historia real en vez de contra las bandas, que son estimaciones nuestras. Antes de',
    '     decir que algo es anómalo, compruébalo aquí.',
    '  c) correlacionar_senales cuando quieras saber si dos magnitudes se movieron a la vez.',
    '     Eso es lo que distingue "la presión cayó porque cayó la tensión" de "las dos cosas',
    '     pasaron el mismo día".',
    '  d) consultar_documentacion si el manual dice algo del componente o del código de error.',
    '',
    'Y AL REDACTAR EL DIAGNÓSTICO:',
    '',
    'Separa SIEMPRE dos cosas, y dilo con estas palabras o parecidas: lo que has MEDIDO y lo',
    'que es una HIPÓTESIS. "La tensión cayó a 96 V a las 14:32 y la carga del motor se fue a',
    'cero un minuto después" es medido. "Probablemente el motor se paró por subtensión" es una',
    'hipótesis, y va marcada como tal. Nunca las mezcles en la misma frase sin distinguirlas.',
    '',
    'Si los datos NO permiten explicar el fallo, dilo. "Con lo que mide esta instalación no',
    'puedo determinar la causa; lo que sí veo es esto" es una respuesta correcta y útil. Una',
    'causa inventada que suena razonable manda a alguien a revisar el equipo equivocado.',
    '',
    'CORRELACIÓN NO ES CAUSA. Si dos señales se mueven a la vez, eso es un indicio, no una',
    'demostración. Dilo cuando lo uses.',
    /*
     * Esta regla se mantiene CORTA a propósito.
     *
     * Tuvo una versión larga que enumeraba aquí todas las formas de período
     * aceptadas. Medido con el 4B: la pasada de elegir herramienta se fue a
     * 17 s y devolvió `content` vacío y sin llamada — el razonamiento se comió
     * el presupuesto entero. La lista ya vive en la descripción del parámetro
     * `periodo`, que es donde el modelo la lee al decidir; repetirla aquí no
     * añadía información, sólo prompt.
     */
    '11. No traduzcas los períodos ni las fechas. Si te preguntan por "la última hora", por',
    '    "las últimas 3 horas" o por "ayer a las 12", pasa ESE TEXTO tal cual a la herramienta:',
    '    el servidor sabe resolverlo y tú no. Calcular calendarios no es tu trabajo aquí.',
    '12. Puedes usar markdown para dar estructura: **negrita** para resaltar una cifra o una',
    '    palabra clave, viñetas con - para enumerar, ## para un título si la respuesta tiene',
    '    varias secciones. El panel lo renderiza. No lo fuerces en una respuesta corta de una',
    '    frase: úsalo cuando de verdad ayude a leer, no como decoración.',
    '13. Responde a lo que se te ha preguntado y para ahí. La herramienta te devuelve las ocho',
    '    señales siempre, pero a "¿qué nivel tiene el tanque?" se contesta con el nivel, no',
    '    con un informe de la instalación entera.',
    '',
    '14. Puedes encender y apagar la bomba con la herramienta controlar_bomba. Antes de encenderla',
    '    ella misma comprueba el nivel del tanque y se niega si está demasiado alto: si eso pasa,',
    '    cuéntaselo al usuario tal cual te lo diga la herramienta, no lo intentes de otra forma ni',
    '    le ofrezcas un rodeo para forzarlo. Si te piden algo que pueda dañar la instalación —forzar',
    '    la bomba estando el tanque lleno, por ejemplo— explica que no puedes hacerlo y por qué.',
    '',
    'Las señales de la instalación:',
    catalogo,
  ].join('\n')
}

/**
 * La firma con la que se reconoce una consulta ya hecha.
 *
 * ── POR QUÉ NO BASTA `JSON.stringify` ──────────────────────────────
 *
 * Porque el modelo escribe el mismo argumento de formas distintas. Medido con
 * qwen2.5:7b en una sola pregunta de diagnóstico:
 *
 *     historia_de_senal({ senal: "Presión relativa", periodo: "últimas 24 horas" })
 *     historia_de_senal({ senal: "presión relativa", periodo: "las últimas 24 horas" })
 *
 * Son la MISMA lectura —el resolvedor de señales y el de períodos las llevan al
 * mismo sitio— pero como cadenas no se parecen, así que la guarda de repetidas
 * no las veía y se pagaban dos viajes a ICONICS y treinta segundos de espera
 * por el segundo.
 *
 * Se normaliza igual que hace `herramientas.mjs` para resolver nombres —sin
 * acentos, en minúsculas, sin signos— y además se quitan los artículos
 * iniciales, que es la otra forma en que varía («la última hora» / «última
 * hora»). Las claves se ordenan porque el orden en que el modelo escribe los
 * argumentos tampoco es estable.
 *
 * Es deliberadamente conservador: normaliza la FORMA, no el significado. Dos
 * períodos que se resuelven a la misma ventana pero se escriben distinto
 * («ayer» y una fecha concreta) siguen contando como consultas distintas, y
 * eso está bien: aquí un falso positivo le negaría al modelo un dato que
 * necesita, que es mucho peor que un viaje de más.
 */
function firmaDe(nombre, argumentos) {
  const normalizar = (valor) => {
    if (Array.isArray(valor)) return valor.map(normalizar).join('|')
    if (valor === null || valor === undefined) return ''
    if (typeof valor !== 'string') return String(valor)

    return valor
      .normalize('NFD')
      // Escrito con escapes y no con acentos literales: son caracteres
      // combinantes, invisibles al abrir el archivo. Mismo motivo y misma
      // forma que en `shared/periodo.js` y en `herramientas.mjs`.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/^(?:el|la|los|las|un|una|de|del)\s+/g, '')
      .trim()
  }

  const partes = Object.keys(argumentos ?? {})
    .sort()
    .map(clave => `${clave}=${normalizar(argumentos[clave])}`)

  return `${nombre}:${partes.join(';')}`
}

export function createChat({ config, herramientas }) {
  const { base, timeoutMs, maxTokens, modelo } = config.ia
  const maxPasos = config.ia.maxPasos ?? 1

  /**
   * Tope duro de herramientas ejecutadas en un turno.
   *
   * `maxPasos` limita las RONDAS, pero en cada ronda el modelo puede pedir
   * varias herramientas a la vez, así que sin este segundo tope tres rondas
   * podrían ser quince lecturas contra ICONICS por una sola pregunta. Se fija
   * en el doble de las rondas: deja sitio para el paralelismo útil —estado e
   * historia en la misma ronda— y corta el bucle patológico.
   */
  const MAX_HERRAMIENTAS = maxPasos * 2

  /**
   * ¿Ha llamado el modelo a alguna herramienta desde que arrancó el proceso?
   *
   * Distingue las dos causas de una respuesta sin consultar, que se arreglan
   * en sitios distintos:
   *
   *  - Si NUNCA ha llamado a ninguna, lo más probable es que llama-server se
   *    arrancara sin `--jinja` y el modelo no las vea.
   *  - Si ya ha llamado antes, la bandera está bien y lo que pasa es que esta
   *    pregunta concreta no encaja en ninguna herramienta. Mandar a revisar
   *    `--jinja` en ese caso es enviar a nadie a buscar nada.
   */
  let vistaAlgunaLlamada = false

  /**
   * Una llamada a llama-server. Combina el corte por tiempo con la
   * cancelación del usuario: si cualquiera de los dos salta, la petición al
   * modelo se aborta de verdad y no queda generando tokens para nadie.
   *
   * `pensar` controla el razonamiento del modelo, y no es un ajuste fino:
   * Qwen3.5 emite sus tokens de pensamiento en `reasoning_content`, aparte de
   * `content`, pero **ambos gastan del mismo `max_tokens`**. Con el
   * razonamiento encendido en la pasada de redactar se llegó a consumir el
   * presupuesto entero pensando y a entregar `content` VACÍO: una burbuja en
   * blanco en la pantalla del operador. Medido con el 4B: 76 tokens de
   * razonamiento y 2,1 s para redactar una frase que sin pensar sale idéntica
   * en 0,4 s.
   */
  async function llamarModelo({ messages, tools, stream, signal, pensar, tope }) {
    const corte = AbortSignal.timeout(timeoutMs)
    const combinado = signal ? AbortSignal.any([corte, signal]) : corte

    const respuesta = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        messages,
        ...(tools ? { tools, tool_choice: 'auto' } : {}),
        max_tokens: tope ?? maxTokens,
        // La plantilla de chat de Qwen entiende esta llave. En un modelo que
        // no razone es inocua, así que no hace falta detectar cuál corre.
        // `reasoning_effort` NO sirve: se probó y este build lo ignora.
        chat_template_kwargs: { enable_thinking: Boolean(pensar) },
        // Baja pero no nula: con 0 el modelo se atasca repitiendo cuando una
        // herramienta devuelve un error que no sabe explicar.
        temperature: 0.2,
        stream: Boolean(stream),
      }),
      signal: combinado,
    })

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '')
      throw new Error(`llama-server respondió ${respuesta.status}. ${detalle.slice(0, 200)}`)
    }
    return respuesta
  }

  /**
   * Pasada sin streaming: la que decide si hace falta una herramienta.
   *
   * Aquí el razonamiento SÍ se deja encendido: es donde de verdad trabaja el
   * modelo —elegir entre cuatro herramientas y convertir «25 de marzo de
   * 2025» en `2025-03-25`—, y apagarlo empeora justo lo que hay que acertar.
   * Por eso lleva presupuesto propio: el de la respuesta más una reserva para
   * pensar, o un razonamiento largo truncaría la llamada a la herramienta.
   */
  async function pasadaConHerramientas(messages, signal) {
    const respuesta = await llamarModelo({
      messages,
      tools: herramientas.definiciones,
      stream: false,
      signal,
      pensar: true,
      tope: maxTokens + RESERVA_RAZONAMIENTO,
    })

    const cuerpo = await respuesta.json()
    const mensaje = cuerpo?.choices?.[0]?.message ?? {}

    return {
      contenido: mensaje.content ?? '',
      llamadas: Array.isArray(mensaje.tool_calls) ? mensaje.tool_calls : [],
    }
  }

  /**
   * Pasada con streaming: la que redacta. Va emitiendo `texto` conforme
   * llegan los tokens, que con este presupuesto de tiempo es la diferencia
   * entre una pantalla viva y una que parece colgada.
   *
   * Filtra el marcado de herramienta por el camino. El texto se retiene unos
   * caracteres antes de emitirlo —lo que mide el marcador más largo— para que
   * un `<tool_call>` partido entre dos trozos del flujo no se cuele por la
   * rendija. Es imperceptible: son unos pocos caracteres de retraso sobre un
   * texto que llega a 40 tok/s.
   *
   * El markdown que escribe el modelo sale tal cual: lo renderiza el panel
   * (ver `Asistente.jsx`), así que aquí no se toca.
   *
   * @returns {{ texto: string, marcado: boolean }}
   */
  async function pasadaRedactando(messages, signal, onEvento) {
    // Sin pensar: el dato ya está en la conversación y esto es reformularlo.
    const respuesta = await llamarModelo({ messages, stream: true, signal, pensar: false })

    let resto = ''        // trozo de línea SSE a medias
    let pendiente = ''    // texto leído y aún no emitido
    let emitido = ''
    let marcado = false

    /** Emite lo que ya es seguro y avisa si aparece marcado de herramienta. */
    const vaciar = (final = false) => {
      if (marcado) return

      const corte = buscarMarcado(pendiente)
      if (corte !== -1) {
        // A partir de aquí el modelo dejó de contestar y empezó a pedir otra
        // herramienta. Lo que va delante suele ser un preámbulo («voy a
        // consultar…»), así que se emite y se corta ahí.
        const util = pendiente.slice(0, corte)
        if (util) { emitido += util; onEvento({ tipo: 'texto', delta: util }) }
        pendiente = ''
        marcado = true
        return
      }

      // Se retiene la cola por si es el principio de un marcador partido.
      const corteSeguro = final ? pendiente.length : Math.max(0, pendiente.length - MARGEN_MARCADO)

      const seguro = pendiente.slice(0, corteSeguro)
      if (!seguro) return

      pendiente = pendiente.slice(seguro.length)

      emitido += seguro
      onEvento({ tipo: 'texto', delta: seguro })
    }

    for await (const trozo of respuesta.body) {
      resto += Buffer.from(trozo).toString('utf8')
      const lineas = resto.split('\n')
      resto = lineas.pop() ?? ''

      for (const linea of lineas) {
        if (!linea.startsWith('data:')) continue

        const dato = linea.slice(5).trim()
        if (dato === '[DONE]') continue

        try {
          const delta = JSON.parse(dato)?.choices?.[0]?.delta?.content
          if (delta) pendiente += delta
        } catch {
          // Un trozo mal formado no tumba la respuesta entera: se ignora y se
          // sigue leyendo, que es lo que hace cualquier cliente de SSE.
        }
      }

      vaciar()
    }

    vaciar(true)
    return { texto: emitido, marcado }
  }

  /**
   * Responde a una pregunta. Emite eventos por `onEvento` y devuelve un
   * resumen de lo que pasó, que es lo que se registra.
   *
   * @param {object} opciones
   * @param {string} opciones.pregunta
   * @param {object[]} [opciones.historial]  turnos anteriores `{ rol, texto }`
   * @param {AbortSignal} [opciones.signal]  cancelación del usuario
   * @param {(evento: object) => void} opciones.onEvento
   */
  async function responder({ pregunta, historial = [], signal, onEvento }) {
    // El catálogo va SIEMPRE en las instrucciones, no en una herramienta: es
    // información fija y barata, y tenerla delante evita que el modelo gaste
    // su única llamada en pedir lo que ya tiene.
    const catalogo = herramientas.catalogo()
      .map(s => [
        `  ${s.nombre}`,
        s.unidad ? ` (${s.unidad})` : ' (sin unidad declarada)',
        ` · ${s.activo}`,
        s.historia ? ' · con historia' : ' · SIN historia',
        // Que una señal sólo valga en marcha es la mitad de por qué la demo no
        // abre en rojo: sin esta marca, el modelo lee «caudal 0» con la bomba
        // parada y lo cuenta como una avería.
        s.soloEnMarcha ? ' · sólo con la bomba en marcha' : '',
      ].join(''))
      .join('\n')

    const previos = historialAMensajes(historial)

    const messages = [
      { role: 'system', content: instrucciones(catalogo, maxPasos) },
      ...previos,
      { role: 'user', content: pregunta },
    ]

    /* ── El bucle de consultas ─────────────────────────────────────── */

    /** Nombres de lo que se ha ejecutado, en orden. Es la traza del turno. */
    const ejecutadas = []
    /** `herramienta:{argumentos}` de todo lo pedido, para no repetir consultas. */
    const firmasVistas = new Set()
    /** Resultados, para la red de seguridad y para los avisos obligatorios. */
    const resultados = []
    let ejecutadasTotal = 0

    /**
     * Lo que dijo el modelo cuando decidió NO llamar a nada.
     *
     * Se guarda porque en la primera ronda puede ser la respuesta entera —un
     * saludo, una aclaración— mientras que en las siguientes es el preámbulo de
     * una redacción que aún no ha empezado.
     */
    let sinLlamadas = null

    for (let paso = 0; paso < maxPasos; paso++) {
      onEvento({
        tipo: 'estado',
        // A partir de la segunda ronda ya está trabajando sobre datos, no
        // decidiendo desde cero. Decir «Pensando…» otra vez haría parecer que
        // ha vuelto al principio.
        valor: paso === 0 ? ESTADOS.pensando : ESTADOS.analizando,
      })

      const ronda = await pasadaConHerramientas(messages, signal)

      if (!ronda.llamadas.length) {
        sinLlamadas = ronda.contenido
        break
      }

      /*
       * Se ejecutan TODAS las herramientas de la ronda, y en paralelo.
       *
       * En paralelo porque son lecturas independientes contra el mismo
       * servidor: pedir el estado y la historia de una señal una detrás de otra
       * sería sumar dos veces la latencia de ICONICS por nada. `ejecutar()` no
       * lanza —devuelve el fallo como dato—, así que no hace falta envolver
       * cada una: un error de una no cancela las demás, que es justo lo que se
       * quiere en un diagnóstico.
       */
      const dePaso = ronda.llamadas.slice(0, Math.max(0, MAX_HERRAMIENTAS - ejecutadasTotal))
      if (!dePaso.length) {
        logger.warn('Se alcanzó el tope de herramientas del turno', {
          pregunta: pregunta.slice(0, 120), ejecutadas,
        })
        break
      }

      const invocaciones = dePaso.map(llamada => {
        const nombre = llamada.function?.name ?? ''
        let argumentos = {}
        try {
          argumentos = JSON.parse(llamada.function?.arguments || '{}')
        } catch {
          // Argumentos ilegibles no abortan la llamada: casi todas las
          // herramientas tienen defaults razonables, y `estado_del_sistema` ni
          // siquiera lleva parámetros. Que la herramienta se queje es más útil
          // que un error de parseo que el modelo no sabe corregir.
          argumentos = {}
        }
        return { llamada, nombre, argumentos, firma: firmaDe(nombre, argumentos) }
      })

      /*
       * Una consulta repetida no se vuelve a ejecutar.
       *
       * ── POR QUÉ HACE FALTA ESTO ────────────────────────────────────
       *
       * Un modelo pequeño que no sabe qué hacer con un resultado tiende a
       * volver a pedirlo, palabra por palabra. Sin esta guarda, esa indecisión
       * gasta las tres rondas en la MISMA lectura: tres viajes a ICONICS y
       * hasta dos minutos de espera para acabar redactando con lo que ya tenía
       * en el primer paso.
       *
       * Se le contesta con una nota en vez de con el dato repetido, y la nota
       * le dice explícitamente que conteste. Devolverle el mismo JSON otra vez
       * sería premiar el bucle.
       */
      const repetidas = invocaciones.filter(i => firmasVistas.has(i.firma))
      for (const { firma } of invocaciones) firmasVistas.add(firma)

      onEvento({
        tipo: 'estado',
        valor: ESTADO_POR_HERRAMIENTA[invocaciones[0].nombre] ?? ESTADOS.consultando,
      })
      for (const { nombre, argumentos, firma } of invocaciones) {
        if (!repetidas.some(r => r.firma === firma)) {
          onEvento({ tipo: 'herramienta', nombre, argumentos })
        }
      }

      vistaAlgunaLlamada = true
      ejecutadasTotal += invocaciones.length

      const crudos = await Promise.all(
        invocaciones.map(({ nombre, argumentos, firma }) =>
          repetidas.some(r => r.firma === firma)
            ? Promise.resolve({
              ok: true,
              yaConsultado: true,
              nota:
                  `Ya llamaste a ${nombre} con estos mismos argumentos en este turno y tienes su ` +
                  `resultado más arriba. No lo vuelvas a pedir: responde ya con lo que tienes, o ` +
                  `si de verdad te falta algo, pide una consulta DISTINTA.`,
            })
            : herramientas.ejecutar(nombre, argumentos)
        )
      )

      // Un solo mensaje `assistant` con todas las llamadas de la ronda, y
      // después un mensaje `tool` por cada una: es el formato que espera la
      // plantilla de Qwen, y partirlo en varios turnos de assistant confunde al
      // modelo sobre qué respuesta corresponde a qué llamada.
      messages.push({ role: 'assistant', content: null, tool_calls: dePaso })

      for (let i = 0; i < invocaciones.length; i++) {
        const { llamada, nombre } = invocaciones[i]
        const { paraElModelo, adjuntos } = separarAdjuntos(crudos[i])

        // Los adjuntos van directos a la pantalla y NUNCA a los mensajes. Ver
        // `separarAdjuntos`.
        for (const adjunto of adjuntos) onEvento({ tipo: 'adjunto', ...adjunto })

        // Una repetición no se apunta en la traza ni cuenta como consulta: no
        // se leyó nada. Enseñarla al operador como una línea más de procedencia
        // diría que el dato se consultó dos veces, que es falso.
        if (!paraElModelo?.yaConsultado) {
          logger.info('Herramienta ejecutada', { nombre, ok: paraElModelo?.ok, paso })
          ejecutadas.push(nombre)
          resultados.push({ nombre, resultado: paraElModelo })
        } else {
          logger.warn('El modelo repitió una consulta idéntica; se le devuelve una nota', {
            nombre, paso,
          })
        }

        messages.push({
          role: 'tool',
          tool_call_id: llamada.id ?? `${nombre}-${i}`,
          name: nombre,
          content: JSON.stringify(paraElModelo),
        })
      }

      /*
       * Si TODA la ronda fue repetición, se sale a redactar sin gastar otra.
       *
       * El modelo ya tiene la nota diciéndole que conteste, y darle una ronda
       * más para que decida lo mismo son otros treinta segundos de espera por
       * una lectura que no va a ocurrir. La pasada de redactar es la que hace
       * falta ahora, y va justo después del bucle.
       */
      if (repetidas.length === invocaciones.length) break
    }

    /* ── Nunca llamó a nada: la respuesta es lo que escribió ────────── */
    if (!ejecutadas.length) {
      const contenido = sinLlamadas ?? ''

      if (contieneCifras(contenido)) {
        logger.warn('El modelo respondió con cifras sin llamar a ninguna herramienta', {
          pregunta: pregunta.slice(0, 120),
          vistaAlgunaLlamada,
        })
        onEvento({ tipo: 'texto', delta: avisoDeBloqueo(vistaAlgunaLlamada) })
        return { herramientas: [], bloqueada: true, turnosRecordados: previos.length }
      }

      /*
       * Ni herramienta ni texto: el modelo se quedó en blanco.
       *
       * Pasa con preguntas que no encajan en ninguna herramienta —un rango,
       * un mes— donde se gasta el presupuesto pensando y no llega a escribir.
       * Una burbuja vacía no se distingue de una avería, así que se dice qué
       * sí se puede preguntar, que además es la información útil.
       */
      if (!contenido.trim()) {
        logger.warn('El modelo no llamó a ninguna herramienta y tampoco escribió nada', {
          pregunta: pregunta.slice(0, 120),
        })
        onEvento({ tipo: 'texto', delta: NO_SE_QUE_CONTESTAR })
        return {
          herramientas: [], bloqueada: false, sinRedactar: true,
          turnosRecordados: previos.length,
        }
      }

      // Sin cifras es una respuesta legítima: un saludo, una aclaración.
      onEvento({ tipo: 'texto', delta: contenido })
      return { herramientas: [], bloqueada: false, turnosRecordados: previos.length }
    }

    /* ── Redactar con los datos delante ─────────────────────────────── */
    onEvento({ tipo: 'estado', valor: ESTADOS.redactando })
    const { texto, marcado } = await pasadaRedactando(messages, signal, onEvento)

    /*
     * Red de seguridad, por dos motivos distintos que acaban igual:
     *
     *  - `!texto`  → el modelo no escribió nada. La causa conocida es el
     *    razonamiento comiéndose el presupuesto, ya atajada apagándolo en
     *    esta pasada; pero el modelo se cambia con un `-m` y sin tocar
     *    código, así que la red se queda.
     *  - `marcado` → el modelo intentó llamar a OTRA herramienta en vez de
     *    redactar, porque ya se le habían acabado las rondas. Lo que dijo antes
     *    es un preámbulo («voy a consultar…»), no una respuesta.
     *
     * En ambos casos los datos ya están aquí y sería absurdo perderlos por que
     * el modelo no supiera contarlos. Se resume el ÚLTIMO resultado que salió
     * bien: es el que el modelo estaba a punto de redactar.
     */
    if (marcado || !texto.trim()) {
      logger.warn('El modelo no llegó a redactar la respuesta', {
        herramientas: ejecutadas,
        motivo: marcado ? 'intentó otra herramienta' : 'no escribió nada',
      })
      const ultimoBueno = [...resultados].reverse().find(r => r.resultado?.ok) ?? resultados.at(-1)
      onEvento({
        tipo: 'texto',
        delta: (texto.trim() ? '\n\n' : '') +
          resumirSinModelo(ultimoBueno.nombre, ultimoBueno.resultado),
      })
      return {
        herramientas: ejecutadas, bloqueada: false,
        sinRedactar: true, marcado, turnosRecordados: previos.length,
      }
    }

    /*
     * El aviso de dato imposible no puede depender de que el modelo se
     * acuerde de contarlo.
     *
     * Comprobado en planta: con `rendimiento = 110,4 %` el 4B dio la cifra
     * sin una palabra, y al comparar dos días con OEE por encima de 100
     * declaró ganador a uno de ellos. El aviso viaja en el resultado de la
     * herramienta para que pueda redactarlo con naturalidad, pero si no lo
     * hace lo añade el backend. Una advertencia que se pierde no es una
     * advertencia.
     *
     * Con varias herramientas por turno el aviso se repite en cada resultado,
     * así que se deduplica: verlo tres veces seguidas al pie de una respuesta
     * lo convierte en ruido que se deja de leer, que es como perderlo.
     */
    const avisos = [...new Set(resultados.map(r => r.resultado?.aviso).filter(Boolean))]
    for (const aviso of avisos) {
      if (!mencionaElAviso(texto)) onEvento({ tipo: 'texto', delta: `\n\n⚠ ${aviso}` })
    }

    return {
      herramientas: ejecutadas,
      ok: resultados.every(r => r.resultado?.ok),
      bloqueada: false,
      longitud: texto.length,
      turnosRecordados: previos.length,
    }
  }

  return { responder }
}

/**
 * Lo que se dice cuando el modelo no produce nada aprovechable.
 *
 * Enumera lo que SÍ se puede preguntar en vez de disculparse: es lo único
 * accionable, y la causa más común de llegar aquí es haber pedido un rango.
 */
const NO_SE_QUE_CONTESTAR =
  'No he sabido responder a eso. Puedo darte el estado actual de toda la instalación de agua ' +
  '—el nivel y la temperatura del tanque, el caudal, la presión, la carga del motor, el modo ' +
  'del variador, la tensión de línea y la eficiencia energética— y la evolución de las cuatro ' +
  'señales que el historiador guarda: nivel, temperatura, caudal y presión. También comparar ' +
  'dos períodos de una de ellas.'

/**
 * Qué se le dice al usuario cuando se bloquea una respuesta.
 *
 * El mensaje cambia según si el modelo ha usado herramientas alguna vez en
 * este proceso, porque son dos averías con arreglos distintos. Antes estaba
 * cableado el diagnóstico de `--jinja`, y con la bandera bien puesta mandaba
 * a revisar algo que no tenía nada que ver.
 */
function avisoDeBloqueo(vistaAlgunaLlamada) {
  const base =
    'No voy a darte cifras porque no he consultado los datos de la instalación para esta ' +
    'pregunta. Puedo leer el estado actual de las ocho señales del sistema de agua, y la ' +
    'evolución de las cuatro que el historiador guarda —nivel del tanque, temperatura del ' +
    'tanque, caudal y presión— en el período que quieras. También comparar dos períodos ' +
    'entre sí.'

  /*
   * El aviso de `--jinja` solo se añade si el modelo NO ha usado herramientas
   * en todo el proceso, y aun así en condicional.
   *
   * Antes se afirmaba como causa, y era falso a menudo: con la bandera bien
   * puesta, esto pasa simplemente cuando la pregunta no encaja en ninguna
   * herramienta. Un diagnóstico equivocado con aplomo cuesta más tiempo que
   * no dar ninguno, y aquí el dato accionable es lo de arriba.
   */
  if (vistaAlgunaLlamada) return base

  return base +
    '\n\nSi esto te pasa con TODAS las preguntas, comprueba que llama-server esté arrancado ' +
    'con la opción --jinja: sin ella el modelo no ve las herramientas y contesta de memoria.'
}

/**
 * Redacta el resultado de una herramienta SIN el modelo.
 *
 * Es deliberadamente seco y sin adornos: no imita al asistente, porque no lo
 * es. Prefiere quedarse corto a inventar contexto — el dato viene de ICONICS
 * y eso es lo único que puede prometer.
 */
function resumirSinModelo(nombre, resultado) {
  if (!resultado?.ok) {
    return resultado?.error ?? 'La consulta no devolvió ningún dato.'
  }

  /* Estado en vivo: se listan las ocho señales, una por línea. En una pantalla
     de 420 px una tabla no cabe, pero ocho líneas sí — y son el dato entero. */
  if (Array.isArray(resultado.activos)) {
    const lineas = resultado.activos.flatMap(a =>
      a.senales.map(s => `· ${s.senal}: ${valorLegible(s)} — ${s.estado}`)
    )

    return [
      `Instalación de agua, ahora mismo: ${resultado.estadoGeneral}` +
        `${resultado.enReposo ? ' (en reposo: no se está impulsando agua)' : ''}.`,
      ...lineas,
      `Lectura en tiempo real de ICONICS.`,
      resultado.avisoUmbrales ? `⚠ ${resultado.avisoUmbrales}` : '',
    ].filter(Boolean).join('\n')
  }

  /* Historia de una señal. */
  if (resultado.senal && resultado.promedio !== undefined) {
    const u = resultado.unidad ? ` ${resultado.unidad}` : ''
    return (
      `${resultado.senal}, ${resultado.periodo}: mínimo ${resultado.minimo}${u}, ` +
      `máximo ${resultado.maximo}${u}, promedio ${resultado.promedio}${u}, ` +
      `último ${resultado.ultimo}${u}, sobre ${resultado.muestras} muestras. ` +
      `Dato leído del historiador.` +
      (resultado.avisoUmbrales ? `\n⚠ ${resultado.avisoUmbrales}` : '')
    )
  }

  return 'La consulta devolvió datos, pero no he podido resumirlos.'
}

/**
 * El valor de una señal tal y como se puede escribir.
 *
 * Tres casos y los tres importan: la booleana se dice con su palabra
 * («Automático»), la que no tiene lectura dice «sin dato» —y no cero—, y la
 * que no tiene unidad declarada va a secas, porque ponerle una sería
 * inventarse la magnitud.
 */
function valorLegible(s) {
  if (s.texto) return s.texto
  if (s.valor === null || s.valor === undefined) return 'sin dato'
  return s.unidad ? `${s.valor} ${s.unidad}` : String(s.valor)
}
