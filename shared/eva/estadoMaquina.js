/**
 * La forma en que TODA máquina cuenta cómo está: una sola, para todas.
 *
 * ── QUÉ PROBLEMA RESUELVE ──────────────────────────────────────────
 *
 * Que había dos. El tanque produce el `Sistema` de `sistema.js` —señales
 * evaluadas, con banda y estado, agrupadas por activo—; vibraciones produce
 * `{ canales, variador, alarmas }` en crudo. Las dos son correctas para su
 * máquina y ninguna sirve para la otra.
 *
 * El resultado se veía en el catálogo de herramientas del asistente: el tanque
 * tenía OCHO y vibraciones UNA, y no porque nadie hubiera escrito las otras
 * siete, sino porque cada una estaba escrita contra la forma del tanque. Lo
 * mismo iba a pasar con los informes, con las gráficas genéricas y —cuando
 * llegue— con la predicción de fallos: cada consumidor nuevo tendría que
 * aprender tantas formas como máquinas haya.
 *
 * ── QUÉ ES Y QUÉ NO ES ─────────────────────────────────────────────
 *
 * NO es un dominio nuevo que sustituya a los dos: cada máquina sigue teniendo
 * el suyo, con sus reglas y su vocabulario, y `evaluarRiesgos` y
 * `evaluarRiesgosVibracion` siguen recibiendo lo que siempre recibieron. Esto
 * es la **proyección común** que se sirve hacia afuera, y se construye desde
 * el dominio de cada una.
 *
 * La diferencia importa: si esta forma sustituyera al dominio, cada máquina
 * nueva presionaría para meter aquí su particularidad —el factor de cresta, el
 * modo del variador, el reposo del tanque— y en cinco máquinas sería un objeto
 * con treinta campos opcionales que no describe bien a ninguna.
 *
 * ── LO QUE ESTA FORMA SE NIEGA A PERDER ────────────────────────────
 *
 * `sinDato`. Es la mitad de la información y la primera que se cae al
 * normalizar, porque no es un valor sino su ausencia. Una máquina tranquila y
 * una máquina que no contesta se ven idénticas si sólo se listan las señales
 * que sí llegaron, y esa confusión es el fallo caro de este proyecto: el
 * 26-08-2026 quince de veintiún puntos se apagaron a la vez y una pantalla que
 * contara sólo riesgos activos habría estado en verde sobre una máquina de la
 * que no sabía nada.
 */


/**
 * Una señal en la forma común.
 *
 *   clave     identificador dentro de su máquina
 *   label     cómo se llama para una persona
 *   valor     número | booleano | null. `null` es SIN DATO, nunca cero
 *   unidad    texto que acompaña al valor; "" cuando no se sabe
 *   estado    "nominal" | "atencion" | "critico" | "sin_dato" | "reposo" | null
 *             `null` NO es «bien»: es «esta señal no tiene criterio contra el
 *             que juzgarla». La mayoría de las medidas de vibración están así,
 *             porque sólo la velocidad eficaz tiene una norma detrás. Decir
 *             «en banda» de un número que nadie acota sería inventar autoridad
 *   texto     la lectura en palabras, para las booleanas («Manual»/«Automático»)
 *   canal     de qué apoyo/punto de medida es, cuando la máquina los tiene
 *   grupo     a qué agrupación pertenece (activo, apoyo, subsistema…)
 *   tag       el punto de ICONICS, para que se pueda rastrear
 *   decimales cuántas cifras tiene sentido enseñar. NO es cosmética: ICONICS
 *             entrega el float crudo del PLC —el nivel llega como
 *             `50.09765625`— y un modelo de lenguaje lo cita tal cual. Trece
 *             decimales sugieren una exactitud que el sensor no tiene
 *   historia  ¿se puede pedir su serie sin mentir? Ver `series` del registro
 */
export function senalComun({
  clave,
  label,
  valor = null,
  unidad = "",
  estado = null,
  texto = null,
  canal = null,
  grupo = null,
  tag = null,
  banda = null,
  nota = null,
  decimales = 1,
  historia = false,
}) {
  return {
    clave, label, valor, unidad, estado, texto, canal, grupo, tag, banda, nota,
    decimales, historia,
  };
}

/**
 * Recuento por estado.
 *
 * `conMedicion` y `sinDato` no son complementarios de `total`: una señal en
 * reposo tiene medición y no tiene banda que evaluar. Se cuentan las cuatro
 * cosas por separado en vez de deducir unas de otras, porque deducirlas es
 * justo donde se cuela el «no hay problemas» sobre una máquina muda.
 */
export function contar(senales) {
  const con = (e) => senales.filter((s) => s.estado === e).length;
  return {
    senales: senales.length,
    conMedicion: senales.filter((s) => s.valor !== null && s.valor !== undefined).length,
    enBanda: con("nominal"),
    enAviso: con("atencion"),
    fueraDeLimite: con("critico"),
    enReposo: con("reposo"),
    sinDato: senales.filter((s) => s.valor === null || s.valor === undefined).length,
  };
}

/**
 * El estado de una máquina, en la forma común.
 *
 * @param {object} args
 * @param {object} args.sistema      entrada del registro (`sistemas.js`)
 * @param {Array}  args.senales      señales ya en forma común
 * @param {Array}  [args.grupos]     `[{ id, label, responde }]`, en orden
 * @param {string} [args.estadoGeneral]
 * @param {boolean|null} [args.enReposo]  `null` = esta máquina no tiene reposo
 * @param {string[]} [args.sinLectura]    puntos que no entregaron
 * @param {object} [args.extra]      lo que sólo tiene sentido en esta máquina
 */
export function estadoComun({
  sistema,
  senales,
  grupos = [],
  estadoGeneral = null,
  enReposo = null,
  sinLectura = [],
  puntosPedidos = null,
  leidoA = null,
  extra = {},
}) {
  return {
    sistema: sistema.id,
    nombre: sistema.nombre,
    maquina: sistema.maquina,
    plc: sistema.plc,
    leidoA,
    estadoGeneral,
    enReposo,
    recuento: contar(senales),
    grupos,
    senales,
    /*
     * Los puntos mudos viajan en el estado, no aparte. Quien lo pinte o lo
     * cuente tiene que poder decir «29 de 73 no contestan» sin volver a pedir
     * nada, que es la frase que separa una pantalla en verde de una ciega.
     */
    sinLectura,
    puntosPedidos,
    /** Lo que hay que confesar al contestar sobre esta máquina. */
    limitaciones: sistema.limitaciones ?? [],
    ...extra,
  };
}

/** ¿La máquina está callada? Más de la mitad de sus puntos sin entregar. */
export function estaMuda(estado) {
  const total = estado?.puntosPedidos ?? 0;
  return total > 0 && (estado.sinLectura?.length ?? 0) > total / 2;
}
