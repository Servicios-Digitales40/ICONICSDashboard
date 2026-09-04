/**
 * Contrato con ICONICS para la demo de sistemas de agua: qué señales existen,
 * cómo se llama cada punto y qué se puede afirmar de cada una.
 *
 * Es el catálogo de puntos de este árbol, y cumple el
 * mismo pacto: **es el único archivo de Demo EVA que contiene nombres de tag**.
 * El resto del módulo habla en claves de dominio (`nivelTanque`, `cargaMotor`)
 * y nunca de `SNIVEL_TANQUE`.
 *
 * ── POR QUÉ NO REUTILIZA EL CATÁLOGO DE RESONAC ────────────────────
 *
 * Porque no hay nada que reutilizar. Aquel describe 10 máquinas × 14 tags con
 * `Estado`, OEE y contadores de pieza; aquí el servidor ofrece **ocho señales
 * planas de un solo sistema**, sin estado, sin OEE y sin producción. No es un
 * catálogo distinto: es otra forma de datos. Ver `docs/PLAN-8-DEMO-EVA.md` §1.
 *
 * ── EL CAMPO `historizado` NO ES UN DETALLE ────────────────────────
 *
 * Se midió contra el servidor real (Plan 8 §1.3) que el historiador devuelve
 * **la serie de `STEMPERATURA_TANQUE`** cuando se le piden `CARGA_TRABAJO_MOTOR`
 * o `KPIEFICIENCIA_ENERGETICA`. No falla: responde `ok: true`, con marcas de
 * tiempo correctas y valores plausibles.
 *
 * `INDICE_DESVIACION_VOLTAJE` estuvo en esa lista hasta el 24-08-2026. Se le
 * configuró el `Historical data source` del activo —apuntando a la entrada del
 * Data Historian `hda:\Configuration\DEMO DANONE:Tension`— y desde entonces
 * sirve la suya: su histórico da ~121 V donde antes daba ~23, que eran grados.
 *
 * Un sparkline de «Carga del motor» alimentado de ahí sería la curva de la
 * temperatura del tanque, rotulada con otro nombre, y nadie lo notaría mirando
 * la pantalla. Por eso la marca vive en el CATÁLOGO y no en cada vista: quien
 * quiera una serie tiene que pasar por `historizadas()`, y lo que no está
 * verificado no se puede pedir.
 *
 * Si algún día se configura el `Historical data source` de los que quedan, se
 * pone `historizado: true` aquí y las gráficas aparecen solas. Marcar «Is
 * Collected» sobre la señal NO basta: lo que redirige el histórico del activo
 * es ese campo, y sin él la petición se resuelve a otra serie del árbol.
 *
 * ── LO QUE ESTÁ SUPUESTO, MARCADO COMO TAL ─────────────────────────
 *
 * `.Description` está vacía en el servidor y `.Attributes` no devuelve nada, así
 * que **no hay unidades declaradas**. Las de aquí salen del nombre del tag y del
 * valor observado, y las dudosas llevan `nota`, que la interfaz pinta bajo el
 * valor. Preferimos un rótulo que confiese la duda a uno que invente autoridad.
 */

/**
 * ── ESTE CATÁLOGO ES DE UN SOLO SISTEMA, Y HAY DOS ─────────────────
 *
 * En planta hay DOS instalaciones separadas, cada una con su PLC y su
 * variador propios:
 *
 *   1. EL SISTEMA DEL TANQUE  — PLC_1, `ua:DEMO2`. Es el que describe este
 *      archivo: tanque, grupo de bombeo, red y suministro. **No tiene
 *      sensores de vibración.**
 *
 *   2. EL SISTEMA DE VIBRACIONES — PLC_2, `ua:DEMO3`, con un SIPLUS CMS 1200
 *      SM 1281. Es OTRA máquina, con OTRO motor y OTRO variador.
 *
 *      **Esta nota se escribió antes de que ese sistema existiera en el
 *      código, y ya no es su fuente.** Hoy lo describe entero
 *      `shared/eva/vibraciones/vibraciones.js`, que además la corrige en dos
 *      puntos: los sensores son TRES y no dos (S1/S2/S3), y sus tags sí están
 *      publicados en AssetWorX bajo `ac:TDCON/Motors/01/`.
 *
 *      Se conserva el resto porque lo que este párrafo hace falta que siga
 *      diciendo es lo de abajo —por qué las vibraciones no cuelgan del activo
 *      «bombeo»—, no el inventario de la otra máquina:
 *
 *        motor        WEG W22 143/5T, 2 HP (1,5 kW), **2 polos** → 3475 rpm
 *                     a plena carga; con variador, la velocidad varía y las
 *                     frecuencias de defecto varían con ella.
 *        rodamientos  6205 ZZ en el lado acople del motor. El que aquí se
 *                     daba por «6204 ZZ (lado ventilador)» describía una pieza
 *                     que ningún canal está midiendo; el porqué está en la
 *                     cabecera de `vibraciones.js`.
 *        norma        1,5 kW está MUY por debajo de los 15 kW de ISO 10816-3.
 *                     La tabla que aplica es **ISO 10816-1 Clase I**:
 *                     0,71 / 1,8 / 4,5 mm/s. Usar la de 10816-3 pondría el
 *                     aviso en 4,5 y se perdería la mitad del margen.
 *        eléctrico    ese PLC publica además un medidor de energía **Janitza**.
 *                     Es la pareja natural de la vibración: mide la MISMA
 *                     máquina, así que su potencia sirve de punto de
 *                     operación para normalizar la vibración, y sus armónicos
 *                     confirman los fallos eléctricos que el espectro de
 *                     velocidad ve a 2× la frecuencia de red.
 *
 * Por qué esto va escrito aquí y no en una nota suelta: los cuatro activos de
 * `activos.js` —tanque, bombeo, distribución, eléctrico— son todos del
 * sistema 1. Cuando lleguen las vibraciones, la tentación va a ser colgarlas
 * del activo «bombeo» porque suena a bomba. **Sería falso**: vigilarían un
 * motor que no es ése, alimentado por un variador que no es ése, y cualquier
 * correlación que alguien sacara entre el caudal de aquí y la vibración de
 * allí estaría uniendo dos máquinas distintas.
 *
 * Las vibraciones necesitan su propio activo, y probablemente su propia raíz.
 */

/** Raíz del árbol del SISTEMA DEL TANQUE en AssetWorX (ver nota de arriba). */
export const RAIZ = "ac:TDCON/DEMO/SENSORES/";

/**
 * Las ocho señales, en el orden en que se presentan.
 *
 * Forma de una señal:
 *
 *   key          clave de dominio, única
 *   tag          nombre del punto bajo RAIZ  ← lo único acoplado al servidor
 *   label        rótulo largo
 *   corto        rótulo para cajas estrechas (celdas de ~130 px)
 *   unidad       texto que acompaña al valor; "" cuando no se sabe
 *   decimales    cifras significativas al formatear
 *   tipo         "real" | "booleano"
 *   activo       a qué activo pertenece (ver ./activos.js)
 *   historizado  ¿su serie del historiador es SUYA? Ver cabecera
 *   escala       { min, max } para geometría (barras, arcos, nivel 3D)
 *   subirEsBueno dirección deseable, para el color del delta
 *   soloEnMarcha su valor sólo significa algo con el sistema impulsando
 *   nota         advertencia que la interfaz muestra junto al valor
 */
const CATALOGO = [
  {
    key: "nivelTanque",
    tag: "SNIVEL_TANQUE",
    label: "Nivel del tanque",
    corto: "Nivel",
    unidad: "%",
    decimales: 1,
    tipo: "real",
    activo: "tanque",
    historizado: true,
    escala: { min: 0, max: 100 },
    subirEsBueno: true,
    soloEnMarcha: false,
    // El sensor está montado ENCIMA DE LA COLUMNA de distribución, no sobre
    // el bidón de almacenamiento: el porcentaje es el llenado de ese vaso.
    // Lo confirmó quien conoce la instalación, en agosto de 2026, y hasta
    // entonces la maqueta 3D lo pintaba dentro del bidón de abajo. La señal
    // se queda en el activo `tanque` —responde a «¿hay agua, y en qué
    // condiciones?»— pero se DIBUJA donde se mide.
    nota: "El sensor de nivel está sobre la columna de distribución, no sobre el depósito.",
  },
  {
    key: "temperaturaTanque",
    tag: "STEMPERATURA_TANQUE",
    label: "Temperatura del tanque",
    corto: "Temperatura",
    unidad: "°C",
    decimales: 1,
    tipo: "real",
    activo: "tanque",
    historizado: true,
    escala: { min: 0, max: 60 },
    // Ni subir ni bajar es «bueno» en una temperatura de proceso: lo bueno es
    // quedarse en banda. El delta se pinta neutro.
    subirEsBueno: null,
    soloEnMarcha: false,
  },
  {
    key: "cargaMotor",
    tag: "CARGA_TRABAJO_MOTOR",
    label: "Carga de trabajo del motor",
    corto: "Carga motor",
    unidad: "%",
    decimales: 1,
    tipo: "real",
    activo: "bombeo",
    // Medido: el historiador devuelve aquí la serie de la temperatura.
    historizado: false,
    escala: { min: 0, max: 100 },
    subirEsBueno: null,
    soloEnMarcha: true,
    nota: "El historiador no publica serie propia de este tag.",
  },
  {
    key: "modoVdf",
    tag: "Modo AM VDF",
    label: "Modo del variador",
    corto: "Modo VDF",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    activo: "bombeo",
    historizado: false,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    // A/M = Automático/Manual. Qué lado del booleano es cuál NO está
    // documentado en el servidor; se asume `false = Automático`, que es el
    // reposo natural de un arranque, y se confiesa en pantalla.
    etiquetas: { true: "Manual", false: "Automático" },
    nota: "Correspondencia Automático/Manual sin confirmar en el servidor.",
  },
  {
    key: "flujoInstantaneo",
    tag: "SFLUJO_INSTANTANEO",
    label: "Caudal instantáneo",
    corto: "Caudal",
    // Sin unidad declarada: el tag no dice si son l/s o m³/h, y poner una de
    // las dos sería inventarse la magnitud. Ver `nota`.
    unidad: "",
    decimales: 2,
    tipo: "real",
    activo: "distribucion",
    historizado: true,
    escala: { min: 0, max: 60 },
    subirEsBueno: true,
    soloEnMarcha: true,
    nota: "Unidad no declarada en el servidor.",
  },
  {
    key: "presionRelativa",
    tag: "SPRESION_RELATIVA",
    label: "Presión relativa",
    corto: "Presión",
    unidad: "",
    decimales: 2,
    tipo: "real",
    activo: "distribucion",
    historizado: true,
    escala: { min: 0, max: 8 },
    subirEsBueno: true,
    soloEnMarcha: true,
    nota: "Unidad no declarada en el servidor.",
  },
  {
    key: "tensionLinea",
    tag: "INDICE_DESVIACION_VOLTAJE",
    // El tag se llama «índice de desviación» pero entrega ~122, que es una
    // TENSIÓN y no un índice (que rondaría 0-5 %). Rotularlo «índice» pintaría
    // una desviación catastrófica sobre una red probablemente sana, así que
    // manda el valor observado y el nombre del tag queda a la vista en la
    // tarjeta para que nadie pierda el rastro.
    //
    // Red CONFIRMADA por el usuario el 25-08-2026: 208Y/120, y la señal mide
    // UNA sola línea contra neutro. Por eso lee 121-127 V y no 208. El nominal
    // que aplica a los umbrales es 120 V, no 208.
    label: "Tensión de línea",
    corto: "Tensión",
    unidad: "V",
    decimales: 1,
    tipo: "real",
    activo: "electrico",
    historizado: true,
    escala: { min: 90, max: 150 },
    subirEsBueno: null,
    soloEnMarcha: false,
    nota: "El tag se llama «índice de desviación», pero entrega una tensión.",
  },
  {
    key: "eficienciaEnergetica",
    tag: "KPIEFICIENCIA_ENERGETICA",
    label: "Eficiencia energética",
    corto: "Eficiencia",
    unidad: "%",
    decimales: 1,
    tipo: "real",
    activo: "electrico",
    historizado: false,
    escala: { min: 0, max: 100 },
    subirEsBueno: true,
    soloEnMarcha: true,
    nota: "El historiador no publica serie propia de este tag.",
  },
];

/** Señal por clave. Es el mapa que consultan el resto de módulos. */
export const SENALES = Object.fromEntries(CATALOGO.map((s) => [s.key, s]));

/** Claves en orden de presentación. */
export const SENAL_KEYS = CATALOGO.map((s) => s.key);

/** Metadatos de una señal. Devuelve `null` ante una clave desconocida. */
export const senalInfo = (key) => SENALES[key] ?? null;

/**
 * Punto de tiempo real: `ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE`.
 *
 * Ojo con `Modo AM VDF`: **lleva espacios**. Se comprobó contra el servidor que
 * el lote (`/api/iconics/data/batch`, separado por comas) y la validación del
 * puente lo aceptan tal cual, porque el cliente codifica cada punto por
 * separado. No hay que sanearlo aquí.
 */
export function pointName(key) {
  const s = SENALES[key];
  return s ? `${RAIZ}${s.tag}` : null;
}

/** Los ocho puntos, para registrar de una vez en el motor de polling. */
export const TODOS_LOS_PUNTOS = SENAL_KEYS.map(pointName);

/**
 * Claves cuya serie del historiador es realmente suya (ver cabecera).
 *
 * Es la única puerta a la historia: `data/historia.js` rechaza cualquier clave
 * que no esté aquí, en vez de dejar que el servidor devuelva la serie de otro.
 */
export const historizadas = () => SENAL_KEYS.filter((k) => SENALES[k].historizado);

/** ¿Se puede pedir la serie de esta señal sin mentir? */
export const esHistorizada = (key) => Boolean(SENALES[key]?.historizado);

/** Nombre del punto → clave de dominio. Se construye una vez. */
const DOMINIO_POR_TAG = Object.fromEntries(CATALOGO.map((s) => [s.tag, s.key]));

/**
 * Inverso de `pointName`. Devuelve `null` ante cualquier punto que no
 * reconozca, para que un cambio en el servidor se vea como dato ausente y
 * nunca como una asignación a la señal equivocada — mismo criterio que
 * `parsePointName` del catálogo de Resonac.
 */
export function parsePointName(name) {
  if (typeof name !== "string" || !name.startsWith(RAIZ)) return null;
  return DOMINIO_POR_TAG[name.slice(RAIZ.length)] ?? null;
}
