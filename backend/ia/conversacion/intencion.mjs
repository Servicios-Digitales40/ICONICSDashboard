/**
 * Qué clase de pregunta es, para no darle veintiséis herramientas al modelo
 * cuando le bastan cuatro — Plan 28 F5.
 *
 * ── EL PROBLEMA, MEDIDO ─────────────────────────────────────────────
 *
 * El esquema de las herramientas son ~8 650 tokens y viaja ENTERO en la pasada
 * que elige herramienta, sea cual sea la pregunta. Con el prompt de sistema
 * (~5 680) eso son ~14 330 tokens de coste fijo antes de que el modelo lea una
 * sola palabra de lo que se le preguntó. «¿Qué es una bomba?» paga lo mismo
 * que «diagnostica el tanque».
 *
 * Y no es sólo coste: el 15-09-2026, con `IA_MAX_TOKENS` en 512, una pregunta
 * sobre alarmas tardó 73,8 s y acabó en un 500 de llama-server porque el
 * modelo se quedó sin presupuesto ESCRIBIENDO el JSON de la herramienta. Menos
 * herramientas es menos contexto que leer y menos donde equivocarse.
 *
 * ── POR QUÉ NO SE LE PREGUNTA AL MODELO ─────────────────────────────
 *
 * Sería lo primero que se ocurre —«que el LLM clasifique»— y es exactamente lo
 * que el §2.3 no deja: *el código puntúa, el modelo redacta*. Además, en
 * términos prácticos:
 *
 *   · añade una ronda de 30-90 s, justo el coste que `IA_MAX_PASOS` acota;
 *   · se equivoca en silencio, y una clasificación mala es indistinguible de
 *     una buena hasta que la respuesta sale rara;
 *   · no es reproducible, así que un fallo no se puede investigar.
 *
 * Un clasificador por reglas sobre el texto se prueba en Node sin arrancar
 * nada, da siempre lo mismo, y cuando falla se ve POR QUÉ falló.
 *
 * ── EL FALLO ES ABIERTO, Y ESO DECIDE TODO EL DISEÑO ────────────────
 *
 * Ante la menor duda se entrega el catálogo COMPLETO, que es el comportamiento
 * de hoy. Los dos errores no cuestan lo mismo:
 *
 *   cerrar de más  → el modelo no tiene la herramienta que necesitaba y
 *                    contesta peor. El técnico lo nota, y no sabe por qué.
 *   abrir de más   → se pierde la optimización. Nadie lo nota.
 *
 * Así que este archivo sólo acota cuando está SEGURO. Una pregunta que encaja
 * en dos intenciones, o en ninguna, recibe las veintiséis.
 */
import { SISTEMAS } from '../../../shared/eva/comun/sistemas.js'

/**
 * Las familias, por lo que el modelo necesita PODER hacer.
 *
 * `sistemas_de_la_planta` está en todas: es el registro de qué máquinas
 * existen y con qué ids, y sin él el modelo inventa nombres de sistema — un
 * fallo que ya se midió antes de que existiera esta fase.
 */
const SIEMPRE = ['sistemas_de_la_planta']

/*
 * ── CUÁNDO EL REGISTRO NO HACE FALTA (Plan 39 F5) ──────────────────
 *
 * `sistemas_de_la_planta` está en todas las intenciones porque el modelo
 * tiene que poder averiguar de qué máquina le hablan. Pero con CONTEXTO DE
 * PANTALLA ya lo sabe, y medido el 21-09-2026 lo que hacía con la
 * herramienta a mano era barrer las cuatro máquinas ante «¿hay algún riesgo
 * activo?». Así que, con contexto, el registro sale del turno —salvo que la
 * pregunta nombre OTRA máquina del registro o pida la planta entera—, y el
 * modelo no puede llamar a lo que no tiene.
 *
 * Las marcas de «planta entera» son deliberadamente pocas: una palabra de más
 * aquí devuelve el barrido; una de menos deja al modelo sin registro ante una
 * pregunta que sí lo pedía, y eso se ve en el instrumento
 * (`medir-asistente-configurada`, caso «inventario»).
 */
const MARCAS_PLANTA = [
  'maquinas', 'sistemas', 'planta', 'cuales hay', 'que hay', 'todas las', 'todos los',
  'otra maquina', 'otras maquinas', 'otro sistema', 'otros sistemas', 'las demas', 'los demas',
  'machines', 'systems', 'plant', 'which ones', 'the others', 'other machine',
]

/** ¿La pregunta nombra otra máquina del registro, o la planta entera? */
export function mencionaOtraMaquina(pregunta, sistemaId) {
  const texto = normalizar(pregunta)
  if (!texto) return false
  if (MARCAS_PLANTA.some((m) => contienePalabra(texto, m))) return true
  return SISTEMAS.some((s) => {
    if (s.id === sistemaId) return false
    return [s.id, s.nombre].filter(Boolean).some((n) => contienePalabra(texto, normalizar(n)))
  })
}

const FAMILIAS = Object.freeze({
  /** Lo que dice el papel. */
  documental: ['consultar_documentacion', 'limites_del_manual'],

  /** Cómo está la planta AHORA. */
  actual: ['estado_del_sistema', 'riesgos_activos'],

  /** Cómo estuvo: la familia entera de `historicos/`. */
  historica: [
    'historia_de_senal', 'valor_en_momento', 'comparar_periodos', 'analisis_de_senal',
    'perfil_de_senal', 'correlacionar_senales', 'tendencia_multiple', 'buscar_evento',
    'alarma_sostenida', 'resumen_de_turno', 'pronostico_de_desgaste',
  ],

  /** Por qué pasa lo que pasa. */
  diagnostico: ['diagnosticar_falla', 'diagnostico'],

  /** Lo que la gente ha hecho y ha aprendido. */
  intervenciones: [
    'hechos_de_la_planta', 'registrar_intervencion', 'cerrar_diagnostico',
    'recordar_hecho', 'proponer_regla',
  ],

  /** Sacar algo de la conversación: un gráfico, un PDF. */
  salida: ['grafico_de_senal', 'generar_reporte'],

  /**
   * Accionar la planta. Es UNA herramienta y tiene familia propia a propósito:
   * es la única que escribe en la máquina, y mezclarla con las de consulta
   * haría que cualquier intención que abra aquélla abra también ésta.
   */
  accion: ['controlar_bomba'],
})

/**
 * Qué familias abre cada intención.
 *
 * `diagnostico` abre CUATRO y no una: un diagnóstico de verdad cruza el estado
 * actual, la historia y el manual — es lo que hace la propia herramienta
 * `diagnostico({sintoma})` por dentro. Acotarla a `diagnosticar_falla` dejaría
 * al modelo sin poder mirar lo que el diagnóstico necesita.
 */
const INTENCIONES = Object.freeze({
  documental: ['documental'],
  actual: ['actual'],
  /* Quien pregunta por el pasado suele querer compararlo con el presente, y a
     menudo pide un gráfico o un reporte de lo que acaba de ver. */
  historica: ['historica', 'actual', 'salida'],
  diagnostico: ['diagnostico', 'actual', 'historica', 'documental', 'salida'],
  intervenciones: ['intervenciones', 'actual'],
  /*
   * Accionar abre TAMBIÉN el estado actual, y no por comodidad: `controlar_bomba`
   * se niega a encender con el tanque por encima del aviso, así que el modelo
   * necesita poder mirar antes de pedir. Lo que NO abre es al revés — ninguna
   * intención de consulta abre `accion`, porque preguntar por el estado no es
   * pedir una maniobra.
   */
  accion: ['accion', 'actual'],
})

/**
 * Las marcas de cada intención.
 *
 * ── POR QUÉ SIN ACENTOS Y EN MINÚSCULAS ─────────────────────────────
 *
 * Porque un operador con prisa escribe «cuanto tardo» y «cuánto tardó» con la
 * misma intención, y una tabla que distinga las dos acota mal la mitad de las
 * veces. `normalizar()` quita los acentos antes de comparar.
 *
 * ── LOS DOS IDIOMAS, PORQUE EL TABLERO TIENE DOS ────────────────────
 *
 * Desde el Plan 21 el asistente narra en inglés cuando el tablero está en
 * inglés, y quien lo usa así pregunta en inglés. Una tabla sólo en español
 * mandaría a esas preguntas al catálogo completo siempre — que no rompe nada,
 * pero desperdicia justo la mitad de los casos.
 */
const MARCAS = Object.freeze({
  documental: [
    'manual', 'documentacion', 'documento', 'especificacion', 'ficha tecnica',
    'que dice el', 'segun el', 'procedimiento', 'norma', 'iso',
    'documentation', 'datasheet', 'spec', 'what does the manual', 'according to',
  ],
  actual: [
    'ahora', 'ahora mismo', 'actual', 'actualmente', 'en este momento', 'como esta',
    'que tal esta', 'hay algun riesgo', 'riesgos activos', 'estado',
    'right now', 'currently', 'at the moment', 'how is', 'current',
  ],
  historica: [
    'ayer', 'anoche', 'hoy', 'esta semana', 'la semana pasada', 'el mes pasado',
    'ultimas horas', 'ultima hora', 'ultimos dias', 'historico', 'historial',
    'tendencia', 'evolucion', 'ha subido', 'ha bajado', 'cuando fue', 'cuando paso',
    'entre las', 'turno',
    'yesterday', 'last night', 'last week', 'last month', 'last hours', 'trend',
    'history', 'historical', 'over time', 'when did',
  ],
  diagnostico: [
    'por que', 'porque', 'diagnostic', 'diagnostica', 'causa', 'falla', 'fallo',
    'averia', 'problema', 'que le pasa', 'que esta pasando', 'anomalia', 'raro',
    'no funciona', 'se paro', 'fuga',
    'why', 'diagnose', 'root cause', 'fault', 'failure', 'what is wrong',
    'anomaly', 'not working',
  ],
  intervenciones: [
    'intervencion', 'intervenciones', 'se hizo', 'hicimos', 'se reparo', 'se cambio',
    'registra', 'anota', 'cierra el caso', 'cerrar el caso', 'caso anterior',
    'casos previos', 'mantenimiento',
    'intervention', 'we fixed', 'we replaced', 'log this', 'previous case',
    'close the case', 'maintenance',
  ],
  /*
   * Verbos de MANIOBRA, no de consulta. La lista es corta a propósito: abrir
   * `controlar_bomba` de más sería ofrecerle al modelo la única herramienta
   * que toca la planta en una conversación donde nadie la pidió. Ante duda, el
   * fallo abierto entrega el catálogo entero de todos modos — así que esta
   * intención no necesita cubrir todas las formas de pedirlo, sólo las
   * inequívocas.
   */
  accion: [
    'enciende', 'encender', 'apaga', 'apagar', 'arranca', 'arrancar', 'para la bomba',
    'detener la bomba', 'pon en marcha',
    'turn on', 'turn off', 'start the pump', 'stop the pump',
  ],
})

/** Sin acentos, en minúsculas y con los espacios colapsados. */
function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Qué intenciones reconoce una pregunta. Puede ser ninguna, una o varias.
 *
 * Se devuelve la LISTA y no «la mejor»: elegir una entre dos empatadas sería
 * inventar un criterio de desempate, y el que llama ya sabe qué hacer con la
 * ambigüedad — abrir del todo.
 */
export function intencionesDe(pregunta) {
  const texto = normalizar(pregunta)
  if (!texto) return []

  return Object.entries(MARCAS)
    .filter(([, marcas]) => marcas.some((m) => contienePalabra(texto, m)))
    .map(([intencion]) => intencion)
}

/**
 * ¿Aparece la marca como PALABRA, y no dentro de otra?
 *
 * ── EL FALSO POSITIVO QUE ESTO EVITA, Y ES REAL ─────────────────────
 *
 * Medido al escribir las pruebas de esta fase: «¿qué es una bomba
 * CENTRÍFUGA?» se clasificaba como diagnóstico, porque la marca `fuga` casa
 * dentro de `centrifuga`. Una pregunta de manual acabando en el subconjunto
 * de diagnóstico es justo el error caro —cerrar de más— y lo producía una
 * comparación de subcadenas.
 *
 * Es el mismo defecto que `verificar-herramientas.mjs` ya vigila para los
 * nombres cortos de señal: «lo corto no dispara dentro de otra palabra».
 *
 * Los bordes se comprueban a mano en vez de con `\b` porque varias marcas son
 * FRASES («que dice el», «hay algun riesgo») y `\b` alrededor de una frase con
 * espacios no dice lo que parece. Aquí basta con que lo que rodea a la marca
 * no sea una letra ni un dígito.
 */
function contienePalabra(texto, marca) {
  let desde = 0
  for (;;) {
    const i = texto.indexOf(marca, desde)
    if (i === -1) return false

    const antes = i === 0 ? '' : texto[i - 1]
    const despues = texto[i + marca.length] ?? ''
    if (!esLetraODigito(antes) && !esLetraODigito(despues)) return true

    desde = i + 1
  }
}

/** Ya viene normalizado (sin acentos, en minúsculas), así que basta el rango
 *  ASCII más la eñe, que `normalize('NFD')` no descompone en letra + tilde. */
function esLetraODigito(ch) {
  return ch !== '' && /[a-z0-9ñ]/.test(ch)
}

/**
 * El subconjunto de herramientas para una pregunta, o el catálogo entero.
 *
 * @param {object[]} catalogo  las definiciones completas, tal como van al modelo
 * @param {string} pregunta
 * @returns {{definiciones: object[], intenciones: string[], acotado: boolean}}
 */
export function acotarCatalogo(catalogo, pregunta, { contexto = null } = {}) {
  const intenciones = intencionesDe(pregunta)

  /* Con contexto de pantalla y sin otra máquina nombrada, el registro sale
     del turno, se acote o no por intención: ver MARCAS_PLANTA arriba. */
  const sinRegistro = Boolean(contexto?.sistema) && !mencionaOtraMaquina(pregunta, contexto.sistema)
  const nombreDe = (d) => d?.function?.name ?? d?.name
  const sinElRegistro = (defs) => (sinRegistro ? defs.filter((d) => !SIEMPRE.includes(nombreDe(d))) : defs)

  /*
   * Ninguna marca reconocida: puede ser conversación general («¿qué es una
   * bomba?») o algo que esta tabla no cubre. Los dos casos se tratan igual y
   * se abre del todo — distinguirlos exigiría estar seguro de lo segundo, y no
   * lo estamos.
   *
   * TRES O MÁS intenciones a la vez es señal de una pregunta que cruza medio
   * sistema; acotar ahí es donde más fácil sería cerrar de más.
   */
  if (intenciones.length === 0 || intenciones.length >= 3) {
    return { definiciones: sinElRegistro(catalogo), intenciones, acotado: false, sinRegistro }
  }

  const familias = new Set(intenciones.flatMap((i) => INTENCIONES[i] ?? []))
  const permitidas = new Set([
    ...(sinRegistro ? [] : SIEMPRE),
    ...[...familias].flatMap((f) => FAMILIAS[f] ?? []),
  ])

  const definiciones = catalogo.filter((d) => permitidas.has(nombreDe(d)))

  /*
   * Si el filtro deja el catálogo casi entero no merece la pena: se devuelve
   * completo para no tener dos caminos que hacen lo mismo. Y si lo deja
   * demasiado corto —menos de tres— probablemente la tabla no entendió la
   * pregunta, y abrir es más barato que equivocarse.
   */
  if (definiciones.length < 3 || definiciones.length >= catalogo.length - 2) {
    return { definiciones: sinElRegistro(catalogo), intenciones, acotado: false, sinRegistro }
  }

  return { definiciones, intenciones, acotado: true, sinRegistro }
}

/** Para las pruebas y para `verificar-intencion.mjs`. */
export const _interno = Object.freeze({ FAMILIAS, INTENCIONES, MARCAS, MARCAS_PLANTA, normalizar })
