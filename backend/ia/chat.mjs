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

/** Estados que se le enseñan al usuario mientras espera. */
export const ESTADOS = {
  pensando: 'Pensando…',
  consultando: 'Consultando ICONICS…',
  redactando: 'Redactando la respuesta…',
}

/**
 * Detecta cifras en una respuesta sin herramienta.
 *
 * Deja pasar los números que forman parte de un nombre de máquina («Línea 1»,
 * «Multi 13») porque el modelo los repite al pedir aclaraciones, y esas
 * respuestas son legítimas. Cualquier otro número es una medición inventada.
 */
function contieneCifras(texto) {
  const sinMaquinas = String(texto ?? '')
    .replace(/\b(l[ií]nea|lineal|multi|rectificadora|lin|rec)\s*\/?\s*\d+/gi, '')
    .replace(/\b(LIN|REC)\/\d+/g, '')
  return /\d/.test(sinMaquinas)
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
function instrucciones(catalogo) {
  return [
    'Eres el asistente del tablero de planta de Resonac. Respondes en español, con frases cortas.',
    '',
    `Hoy es ${hoyLocal()}. Las fechas se escriben siempre como YYYY-MM-DD.`,
    '',
    'REGLAS QUE NO PUEDES SALTARTE:',
    '',
    '1. NUNCA inventes una cifra. Todo número que digas tiene que venir de una herramienta que',
    '   acabes de llamar en este mismo turno. Si no tienes el dato, dilo.',
    '2. Si una herramienta devuelve un error, cuéntaselo al usuario con tus palabras. No lo',
    '   maquilles ni lo sustituyas por una estimación.',
    '3. Solo algunas máquinas tienen datos históricos. Si el usuario pregunta por una fecha',
    '   pasada de una máquina que no los tiene, dilo claramente y ofrece su estado actual.',
    '4. No existen todas las máquinas que suenan plausibles: la numeración tiene huecos reales.',
    '   Usa listar_maquinas si dudas en vez de suponer.',
    '5. Di siempre de dónde viene el dato: si es de tiempo real o del historiador, y de qué día.',
    '',
    'Las máquinas de la planta:',
    catalogo,
  ].join('\n')
}

export function createChat({ config, herramientas }) {
  const { base, timeoutMs, maxTokens, modelo } = config.ia

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
   */
  async function pasadaRedactando(messages, signal, onEvento) {
    // Sin pensar: el dato ya está en la conversación y esto es reformularlo.
    const respuesta = await llamarModelo({ messages, stream: true, signal, pensar: false })

    let completo = ''
    let resto = ''

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
          if (delta) {
            completo += delta
            onEvento({ tipo: 'texto', delta })
          }
        } catch {
          // Un trozo mal formado no tumba la respuesta entera: se ignora y se
          // sigue leyendo, que es lo que hace cualquier cliente de SSE.
        }
      }
    }

    return completo
  }

  /**
   * Responde a una pregunta. Emite eventos por `onEvento` y devuelve un
   * resumen de lo que pasó, que es lo que se registra.
   *
   * @param {object} opciones
   * @param {string} opciones.pregunta
   * @param {AbortSignal} [opciones.signal]  cancelación del usuario
   * @param {(evento: object) => void} opciones.onEvento
   */
  async function responder({ pregunta, signal, onEvento }) {
    const catalogo = (await herramientas.ejecutar('listar_maquinas')).maquinas
      .map(m => `  ${m.id} — ${m.nombre} (${m.area})${m.tieneHistoria ? ' · con historia' : ''}`)
      .join('\n')

    const messages = [
      { role: 'system', content: instrucciones(catalogo) },
      { role: 'user', content: pregunta },
    ]

    onEvento({ tipo: 'estado', valor: ESTADOS.pensando })
    const primera = await pasadaConHerramientas(messages, signal)

    /* ── El modelo no pidió ninguna herramienta ────────────────────── */
    if (!primera.llamadas.length) {
      if (contieneCifras(primera.contenido)) {
        logger.warn('El modelo respondió con cifras sin llamar a ninguna herramienta', {
          pregunta: pregunta.slice(0, 120),
        })
        onEvento({
          tipo: 'texto',
          delta:
            'No he podido consultar los datos de la planta para responder a eso, así que no voy ' +
            'a darte cifras. Si llama-server se arrancó sin la opción --jinja, no ve las ' +
            'herramientas y contesta de memoria: revísalo antes de fiarte de ninguna respuesta.',
        })
        return { herramienta: null, bloqueada: true }
      }

      // Sin cifras es una respuesta legítima: un saludo, una aclaración.
      onEvento({ tipo: 'texto', delta: primera.contenido })
      return { herramienta: null, bloqueada: false }
    }

    /* ── Ejecutar la herramienta ───────────────────────────────────── */
    const llamada = primera.llamadas[0]
    const nombre = llamada.function?.name ?? ''

    let argumentos = {}
    try {
      argumentos = JSON.parse(llamada.function?.arguments || '{}')
    } catch {
      argumentos = {}
    }

    onEvento({ tipo: 'estado', valor: ESTADOS.consultando })
    onEvento({ tipo: 'herramienta', nombre, argumentos })

    const resultado = await herramientas.ejecutar(nombre, argumentos)
    logger.info('Herramienta ejecutada', { nombre, ok: resultado.ok })

    /* ── Redactar con el dato delante ──────────────────────────────── */
    messages.push({ role: 'assistant', content: null, tool_calls: [llamada] })
    messages.push({
      role: 'tool',
      tool_call_id: llamada.id ?? nombre,
      name: nombre,
      content: JSON.stringify(resultado),
    })

    onEvento({ tipo: 'estado', valor: ESTADOS.redactando })
    const texto = await pasadaRedactando(messages, signal, onEvento)

    /*
     * Red de seguridad: el modelo consultó el dato pero no escribió nada.
     *
     * La causa conocida es el razonamiento comiéndose el presupuesto entero,
     * y va atajada apagándolo en esta pasada. Pero el modelo se cambia con un
     * `-m` y sin tocar código, así que la red se queda: una burbuja vacía en
     * la pantalla del operador no se distingue de una avería, y el dato ya
     * está aquí como para perderlo por no saber redactarlo.
     */
    if (!texto.trim()) {
      logger.warn('El modelo no redactó nada pese a tener el dato', { herramienta: nombre })
      onEvento({ tipo: 'texto', delta: resumirSinModelo(nombre, resultado) })
      return { herramienta: nombre, ok: resultado.ok, bloqueada: false, sinRedactar: true }
    }

    return { herramienta: nombre, ok: resultado.ok, bloqueada: false, longitud: texto.length }
  }

  return { responder }
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

  if (nombre === 'listar_maquinas') {
    const conHistoria = resultado.maquinas.filter(m => m.tieneHistoria).map(m => m.id)
    return `Hay ${resultado.maquinas.length} máquinas: ` +
      resultado.maquinas.map(m => `${m.nombre} (${m.id})`).join(', ') + '. ' +
      `Con datos históricos: ${conHistoria.join(', ') || 'ninguna'}.`
  }

  const donde = resultado.fecha ? `el ${resultado.fecha}` : 'ahora mismo'
  const partes = [
    resultado.oee !== null && resultado.oee !== undefined && `OEE ${resultado.oee} %`,
    resultado.disponibilidad != null && `disponibilidad ${resultado.disponibilidad} %`,
    resultado.rendimiento != null && `rendimiento ${resultado.rendimiento} %`,
    resultado.calidad != null && `calidad ${resultado.calidad} %`,
    resultado.aprobadas != null && `${resultado.aprobadas} piezas aprobadas`,
    resultado.rechazadas != null && `${resultado.rechazadas} rechazadas`,
    resultado.estado && `estado: ${resultado.estado}`,
  ].filter(Boolean)

  return `${resultado.nombre ?? resultado.maquina}, ${donde}: ${partes.join(', ')}. ` +
    `Dato leído del ${resultado.fuente ?? 'servidor'}.`
}
