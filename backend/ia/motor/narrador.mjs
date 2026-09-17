/**
 * Poner en prosa un diagnóstico YA CALCULADO — Plan 31 F2.
 *
 * ── LO QUE ESTE ARCHIVO NO HACE, Y ES LA MITAD DEL DISEÑO ───────────
 *
 * No diagnostica. No puntúa. No reordena. No elige. Recibe la salida de
 * `motorDiagnostico.diagnosticar()` —causas ya ordenadas, bandas ya decididas,
 * respaldo ya contado— y pide al modelo que la escriba en una frase.
 *
 * Es `CLAUDE.md` §2.3 —«el código puntúa, el modelo redacta»— aplicado a una
 * superficie nueva, y no es teórico: el 03-09-2026 el modelo escribió «3 casos
 * previos» sobre un diagnóstico que llevaba `respaldo.casos` en 0 **en el mismo
 * objeto**. Un número inventado, dos veces, en un diagnóstico. Si se le deja
 * presentar la conclusión como suya, la inventa cuando no la tiene.
 *
 * ── POR QUÉ NO PASA POR `createChat` ────────────────────────────────
 *
 * Era la decisión que el Plan 31 dejaba abierta («chat.mjs o una ruta propia»).
 * Se resuelve con ruta propia, por tres motivos que no son de gusto:
 *
 *  1. **Coste.** `responder()` monta el catálogo de herramientas y el prompt de
 *     sistema en cada turno: medido, unos 14 000 tokens fijos. Aquí no hace
 *     falta ninguna herramienta —el diagnóstico ya está hecho— así que serían
 *     14 000 tokens por aviso para no usarlos.
 *  2. **La frontera.** Con herramientas en la mano, un modelo al que se le pide
 *     narrar un diagnóstico puede llamar a `diagnosticar_falla` y traerse OTRO.
 *     Entonces lo que narra ya no es lo que el motor decidió, y §2.3 se rompe
 *     por el camino más difícil de detectar: el resultado sigue pareciendo
 *     correcto.
 *  3. **La conversación.** `responder()` arrastra historial, caché entre turnos
 *     y cola. Un aviso no es un turno de nadie: no tiene conversación previa ni
 *     la tendrá.
 *
 * Lo que sí se reutiliza —literalmente, sin reescribir una coma— es
 * `comoRedactar` de `herramientas/diagnostico/index.mjs`. Cada cláusula de esa
 * instrucción tiene un defecto medido detrás, y redactar una segunda versión
 * «parecida» para esta pantalla sería empezar a acumular las dos divergencias
 * que §2.6 existe para impedir. Ver `instruccionDeNarracion()`.
 *
 * ── SIN SERVIDOR DE IA, ESTO DEVUELVE `null` Y NO LANZA ─────────────
 *
 * La vista tiene que seguir sirviendo sin narración: enseña el diagnóstico
 * determinista, que es lo que de verdad importa. Un fallo del modelo no puede
 * llevarse por delante un resultado que ya estaba calculado (§2.5 al revés:
 * aquí lo que se degrada es el adorno, no el dato — y se dice).
 */
import { logger } from '../../logger.mjs'

/**
 * Cuántos tokens como mucho para una narración.
 *
 * ── POR QUÉ NO HEREDA `IA_MAX_TOKENS` ───────────────────────────────
 *
 * Porque aquí se pide un párrafo, no una conversación con herramientas. El
 * tope global subió a 1536 el 14-09-2026 por un motivo que aquí no aplica: el
 * razonamiento de Qwen3.5 gasta del MISMO `max_tokens`, y una llamada con
 * herramientas que se queda corta trunca el JSON de la llamada y devuelve un
 * 500. Esta llamada no lleva herramientas, así que no puede truncar ningún
 * JSON — lo peor que le pasa es cortar una frase.
 *
 * 400 da holgura para el párrafo largo (un diagnóstico con conflicto, fuentes
 * caídas y evidencia en contra) sin dejar que el modelo se extienda hasta
 * convertir un aviso en un informe. Un aviso que no se lee de un vistazo ha
 * fallado como aviso.
 */
const TOPE_TOKENS_NARRACION = 400

/**
 * Corte propio, más corto que el del chat.
 *
 * El del chat (`IA_TIMEOUT_MS`, minutos) está dimensionado para varias pasadas
 * con herramientas. Aquí es una sola pasada sin herramientas, y sobre todo:
 * hay ALGUIEN ESPERANDO con la vista abierta. Pasado este corte se enseña el
 * diagnóstico sin narrar, que es preferible a una pantalla girando.
 */
const CORTE_MS = 45_000

/**
 * La instrucción de narración: `comoRedactar` del motor, más lo propio de esta
 * superficie.
 *
 * ── POR QUÉ SE REUTILIZA EN VEZ DE ESCRIBIR OTRA ────────────────────
 *
 * Porque `comoRedactar` no es prosa decorativa: es un registro de defectos
 * medidos. «Si NO viene `casosCitados`, no los menciones» está ahí por el «3
 * casos previos» del 03-09-2026. «Narra en ESE orden, sin reordenarlas» está
 * ahí porque un modelo que ve tres puntuaciones parecidas reordena. «Si viene
 * `estado`, DILO antes de narrar las causas» es el Plan 28 F3.
 *
 * Escribir una segunda instrucción «parecida» para esta pantalla significaría
 * que el próximo defecto medido se arregla en una de las dos y no en la otra.
 * Es exactamente la divergencia que `CLAUDE.md` §2.6 existe para impedir, y da
 * igual que aquí sea texto en vez de código.
 *
 * Lo que se AÑADE es sólo lo que distingue a un aviso de una respuesta de
 * chat, que son dos cosas: la longitud y la ausencia de interlocutor.
 */
export function instruccionDeNarracion(comoRedactar, { idioma = 'es' } = {}) {
  const propio =
    idioma === 'en'
      ? 'Write ONE short paragraph, at most four sentences, for a plant technician who has just ' +
        'opened the dashboard and has not asked you anything. Do not greet, do not introduce ' +
        'yourself, do not offer further help and do not ask questions: nobody is talking to you. ' +
        'Do not tell anyone to operate the plant — say what is happening and what is worth ' +
        'looking at, never "switch this off" or "open that valve". ' +
        'Never present the conclusion as yours: it was computed before you were called. Say what ' +
        'the diagnosis says, not what you think. ' +
        /* El porqué, medido, está en la rama española de abajo. */
        'Start with what is happening in the plant, never with the state of the diagnostic ' +
        'system. Unless `fuentesCaidas` names something, do NOT mention sources, lookups or ' +
        'limitations: saying you could not consult the manuals or the past cases when that list ' +
        'is empty is false.'
      : 'Escribe UN párrafo corto, de cuatro frases como mucho, para un técnico de planta que ' +
        'acaba de abrir el tablero y no te ha preguntado nada. No saludes, no te presentes, no ' +
        'ofrezcas más ayuda y no hagas preguntas: no hay nadie hablando contigo. ' +
        'No mandes accionar la planta — di qué está pasando y qué conviene mirar, nunca «apaga ' +
        'esto» ni «abre aquella válvula». ' +
        'Nunca presentes la conclusión como tuya: ya estaba calculada antes de llamarte. Di lo ' +
        'que dice el diagnóstico, no lo que te parece a ti. ' +
        /*
         * ── MEDIDO EL 17-09-2026: 6/6 ABRÍAN CON UNA AVERÍA FALSA ────
         *
         * Sin esta frase, el 4B abría SIEMPRE así —seis de seis, con el
         * mensaje exacto de este narrador sobre `posible-fuga`—:
         *
         *   «No pude consultar los manuales ni los casos previos…»
         *
         * Falso: `fuentesCaidas` venía vacío y la primera causa citaba dos
         * fragmentos de manual. El modelo se contradecía dos frases después.
         *
         * La causa es de ESTE bloque, no del `comoRedactar`. Se midió: el
         * mismo cuerpo de datos con el `comoRedactar` SOLO da 0/6; añadiendo
         * estas reglas de forma, 6/6. Pedir «un párrafo corto» empuja al
         * modelo a abrir con una frase de contexto, y la más disponible en el
         * prompt es justamente el EJEMPLO de cómo narrar una fuente caída que
         * el `comoRedactar` lleva dentro («no pude consultar los manuales, así
         * que esto se apoya sólo en…»). El modelo copia la plantilla que tiene
         * más a mano.
         *
         * Por eso el arreglo dice con qué EMPEZAR, en vez de sólo prohibir: un
         * hueco que el modelo tiene que rellenar lo rellena con lo que ve, y
         * dejarlo abierto ya costó el «3 casos previos» del 03-09.
         */
        'Empieza por lo que está pasando en la planta, nunca por el estado del sistema de ' +
        'diagnóstico. Salvo que `fuentesCaidas` traiga algún nombre, NO menciones fuentes, ' +
        'consultas ni limitaciones: decir que no pudiste consultar los manuales o los casos ' +
        'cuando esa lista está vacía es falso.'

  /*
   * El `comoRedactar` del motor va PRIMERO y el añadido después, no al revés:
   * lo de arriba son las reglas sobre QUÉ se puede afirmar —que es donde están
   * los defectos medidos— y lo de abajo es la forma. Si algún día se
   * contradijeran, la última frase gana en la mayoría de los modelos, y es
   * preferible que gane la forma antes que la verdad.
   */
  return [comoRedactar, propio].filter(Boolean).join(' ')
}

/**
 * ── POR QUÉ EL DIAGNÓSTICO VIAJA COMO JSON Y NO EN PROSA ────────────
 *
 * Porque `comoRedactar` habla de campos por su nombre: dice «si NO viene
 * `casosCitados`», «si `conflicto` es true», «cita su `origen`». Esa
 * instrucción sólo tiene sentido sobre el objeto tal cual. Resumirlo a prosa
 * antes de enseñárselo obligaría a reescribir la instrucción entera, que es
 * justo lo que este archivo evita.
 *
 * Se recorta a las TRES primeras causas: a partir de la tercera el respaldo ya
 * no distingue, y un aviso de cuatro frases no va a nombrar la quinta. Recortar
 * aquí y no en el motor es deliberado — el motor entrega lo que calculó, y
 * quien lo enseña decide cuánto cabe.
 */
function paraElModelo(diagnostico) {
  const { comoRedactar: _ignorado, ...datos } = diagnostico
  return JSON.stringify(
    { ...datos, causas: (datos.causas ?? []).slice(0, 3) },
    null,
    1
  )
}

/**
 * Crea el narrador.
 *
 * @param {object} args
 * @param {object} args.config  el de `config.mjs`; se usa `config.ia`
 */
export function crearNarrador({ config }) {
  const { base, timeoutMs, modelo } = config.ia

  /**
   * Un diagnóstico, en prosa.
   *
   * @param {object} args
   * @param {object} args.diagnostico   la salida de `diagnosticar_falla`, con
   *                                    su `comoRedactar`
   * @param {string} [args.idioma]      `"es"` | `"en"`
   * @param {AbortSignal} [args.signal]
   * @returns {Promise<{texto: string|null, motivo: string|null}>}
   *          `texto: null` con el motivo dicho, NUNCA una excepción: la vista
   *          enseña el diagnóstico sin narrar y sigue sirviendo.
   */
  async function narrar({ diagnostico, idioma = 'es', signal } = {}) {
    if (!base) {
      return { texto: null, motivo: 'sin_servidor' }
    }
    if (!diagnostico?.causas?.length) {
      /*
       * Un huérfano no se narra. No es un fallo: es que no hay nada que
       * poner en prosa, y pedirle al modelo que redacte sobre cero causas es
       * exactamente la situación que produce una causa inventada. La vista ya
       * sabe decir «este riesgo no tiene causas declaradas» sin ayuda de
       * nadie.
       */
      return { texto: null, motivo: 'sin_causas' }
    }

    const instruccion = instruccionDeNarracion(diagnostico.comoRedactar, { idioma })
    const corte = AbortSignal.timeout(Math.min(CORTE_MS, timeoutMs ?? CORTE_MS))
    const combinado = signal ? AbortSignal.any([corte, signal]) : corte

    try {
      const respuesta = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo,
          messages: [
            { role: 'system', content: instruccion },
            { role: 'user', content: paraElModelo(diagnostico) },
          ],
          max_tokens: TOPE_TOKENS_NARRACION,
          /*
           * Sin razonamiento, y no por ahorrar: el razonamiento de Qwen3.5
           * gasta del MISMO `max_tokens` que la respuesta, así que pensar
           * sobre una tarea que no lo necesita —reescribir un objeto que ya
           * trae la conclusión— se come el presupuesto del párrafo y lo deja
           * truncado. Aquí no hay nada que deducir.
           */
          chat_template_kwargs: { enable_thinking: false },
          temperature: 0.2,
          stream: false,
        }),
        signal: combinado,
      })

      if (!respuesta.ok) {
        const detalle = await respuesta.text().catch(() => '')
        logger.warn('El narrador no pudo redactar un aviso; se enseña sin narrar', {
          estado: respuesta.status,
          detalle: detalle.slice(0, 200),
        })
        return { texto: null, motivo: 'servidor_respondio_error' }
      }

      const cuerpo = await respuesta.json()
      const texto = cuerpo?.choices?.[0]?.message?.content?.trim()

      /*
       * ── LA RED DE SEGURIDAD DEL CONTENIDO VACÍO ──────────────────────
       *
       * Un modelo que razona puede gastarse el presupuesto entero pensando y
       * devolver `content: ""` con `finish_reason: "length"`. El chat ya lo
       * cubre; aquí también hace falta, y aquí es más barato: se enseña el
       * diagnóstico sin narrar en vez de una cadena vacía que la vista
       * pintaría como un párrafo en blanco.
       */
      if (!texto) {
        return { texto: null, motivo: 'respuesta_vacia' }
      }

      return { texto, motivo: null }
    } catch (error) {
      /*
       * Se traga TODO, a propósito, y se registra. Un aviso es un adorno sobre
       * un diagnóstico que ya está calculado: dejar que un corte de red o un
       * servidor caído tumbe la respuesta convertiría una mejora en una
       * fragilidad nueva de una pantalla que antes no dependía del modelo.
       */
      const abortado = error.name === 'AbortError' || error.name === 'TimeoutError'
      logger.warn('El narrador falló; se enseña el diagnóstico sin narrar', {
        error: error.message,
      })
      return { texto: null, motivo: abortado ? 'corte_de_tiempo' : 'sin_conexion' }
    }
  }

  return { narrar }
}
