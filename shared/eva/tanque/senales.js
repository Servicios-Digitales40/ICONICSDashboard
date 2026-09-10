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
 * catálogo distinto: es otra forma de datos. Ver `docs/por-completar/PLAN-8-DEMO-EVA.md` §1.
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

/**
 * Prefijo común a las trece ramas del árbol (Plan 27 F0-F1): planta reorganizó
 * `ac:TDCON/DEMO/` el 09-09-2026 en doce carpetas que reproducen el DB del
 * banco hidráulico (`docs/Lista-variables.pdf`), más `SENSORES/`, la capa de
 * KPIs propia de ICONICS que ya existía. Antes de esa reorganización el
 * sistema tenía una sola raíz —`SENSORES/`— y `RAIZ` la nombraba; hoy no hay
 * una raíz del sistema, sólo un prefijo común a sus trece ramas, así que eso
 * es lo que `RAIZ` significa desde este commit. Sigue exportándose con el
 * mismo nombre porque tres sitios ya lo usaban sólo para MOSTRARLO —nunca
 * para resolver un punto— y para los tres «la raíz de la instalación» es
 * justo este prefijo: `AssetsEva.jsx` (el botón que salta al árbol de la demo
 * en el explorador de Assets), `MaquetaTanque3D.jsx` (el pie de foto bajo la
 * maqueta) y `estadoTanque.js` (el campo `raiz` del resumen del asistente).
 */
export const RAIZ = "ac:TDCON/DEMO/";

/**
 * Las trece ramas del árbol, por id. Cada entrada del catálogo declara en
 * cuál vive (`rama`), y `pointName()` compone `RAMAS[rama] + tag` — nunca al
 * revés: el nombre completo no se guarda en el catálogo porque la reubicación
 * del 09-09-2026 es la prueba de que una rama se mueve más a menudo que un tag
 * cambia de nombre.
 *
 * `SENSORES/` es la única que no viene del DB del PLC (§1.1 de
 * `docs/completados/PLAN-27-VARIABLES-DEL-TANQUE.md`): es la capa de KPIs que ICONICS ya
 * calculaba antes de la reorganización, y de ahí que sea la única que no
 * tiene una sección correspondiente en `Lista-variables.pdf`.
 */
export const RAMAS = {
  sensores: `${RAIZ}SENSORES/`,
  seguridad: `${RAIZ}SEGURIDAD/`,
  instrumentacionProceso: `${RAIZ}INSTRUMENTACION_DE_PROCESO/`,
  mandoVariadorVfd: `${RAIZ}MANDO_DEL_VARIADOR_VFD/`,
  solenoide1Inferior: `${RAIZ}SOLENOIDE_1_INFERIOR/`,
  solenoide2Superior: `${RAIZ}SOLENOIDE_2_SUPERIOR/`,
  bombaDeAire: `${RAIZ}BOMBA_DE_AIRE/`,
  automatismoLlenadoVacio: `${RAIZ}AUTOMATISMO_LLENADO_VACIO/`,
  lecturaVariadorModbusRtu: `${RAIZ}LECTURA_VARIADOR_MODBUS_RTU/`,
  medidorDeEnergia: `${RAIZ}MEDIDOR_DE_ENERGIA/`,
  alarmas: `${RAIZ}ALARMAS/`,
  advertenciaEstadoDeOperacion: `${RAIZ}ADVERTENCIA_ESTADO_DE_OPERACION/`,
  contadoresVariablesDeMaquina: `${RAIZ}CONTADORES_VARIABLES_DE_MAQUINA/`,
};

/**
 * Las señales del sistema, en el orden en que se presentan: las ocho de
 * siempre, más la primera cosecha de variables nuevas del Plan 27 F3.
 *
 * Forma de una señal:
 *
 *   key          clave de dominio, única
 *   rama         en qué rama de RAMAS vive (Plan 27 F1)
 *   tag          nombre del punto dentro de esa rama  ← lo único acoplado al servidor
 *   label        rótulo largo
 *   corto        rótulo para cajas estrechas (celdas de ~130 px)
 *   unidad       texto que acompaña al valor; "" cuando no se sabe
 *   decimales    cifras significativas al formatear
 *   tipo         "real" | "booleano"
 *   naturaleza   opcional; ausente = "medida" (comportamiento de siempre).
 *                "alarma" y "mando" desde F3; "consigna" y "crudo" desde F4;
 *                "estado" desde F5 (ver `estadoDeSenal` en `./estado.js`:
 *                "mando"/"consigna"/"crudo" se informan sin juzgar,
 *                "estado" usa la tabla común `ESTADO_EQUIPO`). "contador" y
 *                "sin_instrumento" siguen en el diseño de
 *                `docs/completados/PLAN-27-VARIABLES-DEL-TANQUE.md` §2 sin ninguna señal
 *                que los use todavía.
 *   estadoActivo sólo con `naturaleza: "alarma"`: qué estado reporta cuando
 *                el bit está activo ("critico" si no se declara). Permite
 *                que un par de dos niveles del propio PLC (`NIVEL_ALTO` /
 *                `NIVEL_ALTO_ALTO`) se distinga sin inventar un umbral.
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
    // Plan 27 F2: se movió Y se renombró (perdió la `S`) el 09-09-2026, de
    // `SENSORES/SNIVEL_TANQUE` a `INSTRUMENTACION_DE_PROCESO/NIVEL_TANQUE`.
    rama: "instrumentacionProceso",
    tag: "NIVEL_TANQUE",
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
    // Plan 27 F2: se movió Y se renombró (perdió la `S`) el 09-09-2026, de
    // `SENSORES/STEMPERATURA_TANQUE` a
    // `INSTRUMENTACION_DE_PROCESO/TEMPERATURA_TANQUE`.
    rama: "instrumentacionProceso",
    tag: "TEMPERATURA_TANQUE",
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
    rama: "sensores",
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
    // Plan 27 F2: se movió Y se renombró (espacios → `_`) el 09-09-2026, de
    // `SENSORES/Modo AM VDF` a `MANDO_DEL_VARIADOR_VFD/Modo_AM_VDF`.
    rama: "mandoVariadorVfd",
    tag: "Modo_AM_VDF",
    label: "Modo del variador",
    corto: "Modo VDF",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    activo: "bombeo",
    historizado: true,
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
    // Plan 27 F2: se movió Y se renombró (perdió la `S`) el 09-09-2026, de
    // `SENSORES/SFLUJO_INSTANTANEO` a
    // `INSTRUMENTACION_DE_PROCESO/FLUJO_INSTANTANEO`.
    rama: "instrumentacionProceso",
    tag: "FLUJO_INSTANTANEO",
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
    // Plan 27 F2: se movió el 09-09-2026, de `SENSORES/SPRESION_RELATIVA` a
    // `INSTRUMENTACION_DE_PROCESO/PRESION_RELATIVA` (también perdió la `S`).
    rama: "instrumentacionProceso",
    tag: "PRESION_RELATIVA",
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
    rama: "sensores",
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
    rama: "sensores",
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

  /*
   * ── PLAN 27 F3: LOS PRIMEROS PUNTOS DEL DB DEL PLC ──────────────────
   *
   * Hasta aquí, las ocho señales de siempre. Lo que sigue es la primera
   * cosecha de `docs/completados/PLAN-27-VARIABLES-DEL-TANQUE.md`: las ocho alarmas de
   * `ALARMAS/` (Lista-variables.pdf §1.10) y los dos puntos de `SEGURIDAD/`.
   *
   * Los ocho bits de alarma SÍ se evalúan como una condición —`naturaleza:
   * "alarma"` en `estado.js` los juzga `critico`/`atencion` cuando están
   * activos—, porque su polaridad es la que dice su propio nombre: `true` es
   * la condición mala en las ocho, sin excepción, según el PDF. `CONTROL` es
   * `naturaleza: "mando"`: una orden, no una condición. `PARO_DE_EMERGENCIA`
   * SÍ es `naturaleza: "alarma"`, con `invertida: true`: el PDF sugería lógica
   * de contacto normalmente cerrado (`TRUE` = sin emergencia) y quien opera la
   * instalación lo confirmó el 10-09-2026 contra el programa real. `estado.js`
   * lee `invertida` antes de juzgar el bit, así que aquí no se niega el valor
   * a mano — sería la misma inversión escrita dos veces, en dos archivos.
   */
  {
    key: "nivelAltoAlto",
    rama: "alarmas",
    tag: "NIVEL_ALTO_ALTO",
    label: "Nivel alto-alto",
    corto: "Nivel A-A",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "alarma",
    estadoActivo: "critico",
    activo: "tanque",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Activa", false: "Inactiva" },
    nota: "Nivel por encima del límite crítico superior. Riesgo de derrame.",
  },
  {
    key: "nivelAlto",
    rama: "alarmas",
    tag: "NIVEL_ALTO",
    label: "Nivel alto",
    corto: "Nivel alto",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "alarma",
    estadoActivo: "atencion",
    activo: "tanque",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Activa", false: "Inactiva" },
    nota: "Nivel por encima del límite de advertencia superior.",
  },
  {
    key: "nivelBajoBajo",
    rama: "alarmas",
    tag: "NIVEL_BAJO_BAJO",
    label: "Nivel bajo-bajo",
    corto: "Nivel B-B",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "alarma",
    estadoActivo: "critico",
    activo: "tanque",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Activa", false: "Inactiva" },
    nota: "Nivel por debajo del límite crítico inferior. Riesgo de marcha en seco de la bomba.",
  },
  {
    key: "nivelBajo",
    rama: "alarmas",
    tag: "NIVEL_BAJO",
    label: "Nivel bajo",
    corto: "Nivel bajo",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "alarma",
    estadoActivo: "atencion",
    activo: "tanque",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Activa", false: "Inactiva" },
    nota: "Nivel por debajo del límite de advertencia inferior.",
  },
  {
    key: "presionAlta",
    rama: "alarmas",
    tag: "PRESION_ALTA",
    label: "Presión alta",
    corto: "Presión alta",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "alarma",
    estadoActivo: "critico",
    activo: "distribucion",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Activa", false: "Inactiva" },
    nota: "Presión de línea por encima del límite.",
  },
  {
    key: "faltaDePresion",
    rama: "alarmas",
    tag: "FALTA_DE_PRESION",
    label: "Falta de presión",
    corto: "Sin presión",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "alarma",
    estadoActivo: "critico",
    activo: "distribucion",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    // Sólo significa algo con la bomba en marcha: el PDF la define como
    // "presión ausente CON BOMBA EN MARCHA". Parada la bomba, la ausencia de
    // presión no es una avería, es lo esperable.
    soloEnMarcha: true,
    etiquetas: { true: "Activa", false: "Inactiva" },
    nota: "Presión ausente con bomba en marcha. Indica cebado perdido, succión obstruida o fuga.",
  },
  {
    key: "bajoFlujo",
    rama: "alarmas",
    tag: "DP_BAJO_FLUJO",
    label: "Bajo flujo",
    corto: "Bajo flujo",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "alarma",
    estadoActivo: "critico",
    activo: "distribucion",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    // Mismo motivo que faltaDePresion: el PDF la define "con bomba en marcha".
    soloEnMarcha: true,
    etiquetas: { true: "Activa", false: "Inactiva" },
    nota: "Caudal por debajo del mínimo con bomba en marcha.",
  },
  {
    key: "fallaVariador",
    rama: "alarmas",
    tag: "FALLA_VARIADOR_DE_FRECUENCIA",
    label: "Falla del variador",
    corto: "Falla VFD",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "alarma",
    estadoActivo: "critico",
    activo: "bombeo",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Activa", false: "Inactiva" },
    nota: "Falla activa reportada por el variador.",
  },
  {
    key: "control",
    rama: "seguridad",
    tag: "CONTROL",
    label: "Mando del proceso",
    corto: "Control",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "mando",
    // Plan 27 F5: activo propio («Seguridad»). Hasta F4 vivía
    // PROVISIONALMENTE en `electrico` para no arrastrar el cambio de cuatro
    // a seis activos a una fase que no lo pedía — ver la cabecera de
    // `activos.js`.
    activo: "seguridad",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Encendido", false: "Apagado" },
    // Aclarado por quien conoce la instalación el 09-09-2026: enciende y
    // apaga el proceso. Es el mismo punto que escribe `controlar_bomba`
    // (`backend/ia/herramientas/maquina/index.mjs`) y confirma
    // `EstadoMaquinaBanner`. No figura en Lista-variables.pdf ni en el DB
    // exportado — su significado se sabe por esa conversación, no por el
    // servidor. Se movió de `SENSORES/` a `SEGURIDAD/` el mismo día.
    nota: "Enciende y apaga el proceso. No está documentado en el DB del PLC.",
  },
  {
    key: "paroDeEmergencia",
    rama: "seguridad",
    tag: "PARO_DE_EMERGENCIA",
    label: "Paro de emergencia",
    corto: "Paro emerg.",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "alarma",
    // Lógica de contacto normalmente cerrado: `TRUE` es "sin emergencia",
    // `FALSE` es la condición mala. `invertida: true` se lo dice a
    // `estadoDeSenal()` antes de juzgar el bit — sin esto, la regla genérica
    // de alarma («TRUE es la condición mala») leería exactamente al revés.
    invertida: true,
    estadoActivo: "critico",
    // Plan 27 F5: activo propio («Seguridad») — ver la nota de `control`.
    activo: "seguridad",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Sin emergencia", false: "Emergencia activada" },
    // PDF §1.1: "Valor inicial TRUE sugiere lógica de contacto normalmente
    // cerrado (TRUE = sin emergencia)." Confirmado el 10-09-2026 por quien
    // opera la instalación, contra el programa real del PLC.
    nota: "Lógica invertida confirmada: TRUE es SIN emergencia, FALSE es la emergencia activada.",
  },

  /*
   * ── PLAN 27 F4: LO QUE SE MIDE DE VERDAD ────────────────────────────
   *
   * Veintidós señales de tres ramas: `MEDIDOR_DE_ENERGIA/`,
   * `LECTURA_VARIADOR_MODBUS_RTU/` y `AUTOMATISMO_LLENADO_VACIO/`.
   *
   * Los diez registros del variador (`Lista-variables.pdf` §1.8) son el
   * caso de libro de `naturaleza: "crudo"`: el PDF lo dice explícito —
   * "Todos son Int sin escalar: el factor de escala lo aplica el FB de
   * lectura, no el DB"— y esa confirmación sigue pendiente (§3 de este
   * plan). Se leen, se enseñan, y se pintan SIN unidad hasta tenerla.
   *
   * `TENSION_L1_N` y `TENSION_MAXIMA_L1_N` son un caso distinto, aunque el
   * resultado se vea igual: el PDF SÍ les da unidad (V), pero el valor
   * medido —hasta 276 V— no es plausible como tensión fase-neutro de una
   * red 208Y/120 (nominal ~120 V), la misma anomalía que ya tiene
   * `INDICE_DESVIACION_VOLTAJE`. No se etiquetan `crudo` —no son un
   * registro sin escalar, son un Real con una unidad declarada que no
   * cuadra— así que se quedan como medida normal y es sólo el campo
   * `unidad` el que confiesa la duda, con su `nota`.
   *
   * Los cinco restantes de `MEDIDOR_DE_ENERGIA/` no tienen ninguna anomalía
   * medida todavía: llevan la unidad que declara el PDF y ninguna entrada en
   * `umbrales.js` — sin banda que jugar hasta que alguien confirme un rango
   * operativo, mismo criterio que el resto del catálogo con `PROVISIONALES`.
   *
   * `AUTOMATISMO_LLENADO_VACIO/` reparte en tres formas: dos órdenes
   * (`naturaleza: "mando"`, como `CONTROL`), un modo (booleano genérico,
   * como `modoVdf`) y dos set points (`naturaleza: "consigna"`) cuya unidad
   * sigue sin confirmar —pregunta 2 de §3— aunque el PDF sugiere que
   * comparten la de `nivelTanque`.
   */
  {
    key: "corrienteL1",
    rama: "medidorDeEnergia",
    tag: "DP_CORRIENTE_L1",
    label: "Corriente de línea (L1)",
    corto: "Corriente L1",
    unidad: "A",
    decimales: 2,
    tipo: "real",
    activo: "electrico",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
  },
  {
    key: "potenciaReactivaL1",
    rama: "medidorDeEnergia",
    tag: "POTENCIA_REACTIVA_QN_L1",
    label: "Potencia reactiva (L1)",
    corto: "Pot. reactiva",
    unidad: "var",
    decimales: 1,
    tipo: "real",
    activo: "electrico",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
  },
  {
    key: "energiaAparenteL1",
    rama: "medidorDeEnergia",
    tag: "DP_ENERGIA_APARENTEL1",
    label: "Energía aparente acumulada (L1)",
    corto: "Energía L1",
    unidad: "VAh",
    decimales: 1,
    tipo: "real",
    activo: "electrico",
    historizado: true,
    escala: null,
    // Es un acumulador: sólo crece. Ni subir ni bajar es "bueno" o "malo" en
    // sí mismo, es el registro de lo consumido.
    subirEsBueno: null,
    soloEnMarcha: false,
  },
  {
    key: "tensionL1N",
    rama: "medidorDeEnergia",
    tag: "TENSION_L1_N",
    label: "Tensión de línea (L1-N)",
    corto: "Tensión L1-N",
    // Sin unidad: ver la nota de cabecera de esta sección. El PDF dice "V",
    // pero 276 V no es plausible como fase-neutro de una red 208Y/120.
    unidad: "",
    decimales: 1,
    tipo: "real",
    activo: "electrico",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    nota: "El PDF la declara en voltios, pero el valor medido no es plausible como tensión fase-neutro de esta red. Sin escala confirmada.",
  },
  {
    key: "tensionMaximaL1N",
    rama: "medidorDeEnergia",
    tag: "TENSION_MAXIMA_L1_N",
    label: "Máximo histórico de tensión (L1-N)",
    corto: "Tensión máx. L1-N",
    unidad: "",
    decimales: 1,
    tipo: "real",
    activo: "electrico",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    nota: "Máximo histórico de tensionL1N: hereda la misma duda de escala.",
  },
  {
    key: "potenciaActivaL1",
    rama: "medidorDeEnergia",
    tag: "POTENCIA_ACTIVA_L1",
    label: "Potencia activa (L1)",
    corto: "Pot. activa",
    unidad: "W",
    decimales: 1,
    tipo: "real",
    activo: "electrico",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
  },
  {
    key: "potenciaAparenteL1",
    rama: "medidorDeEnergia",
    tag: "POTENCIA_APARENTE_L1",
    label: "Potencia aparente (L1)",
    corto: "Pot. aparente",
    unidad: "VA",
    decimales: 1,
    tipo: "real",
    activo: "electrico",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
  },

  {
    key: "frecuenciaSalidaVariador",
    rama: "lecturaVariadorModbusRtu",
    tag: "FRECUENCIA_DE_SALIDA",
    label: "Frecuencia de salida del variador",
    corto: "Frec. salida",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "crudo",
    activo: "bombeo",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: true,
    nota: "Registro Modbus sin escalar (Lista-variables.pdf §1.8): el factor de escala del variador está sin confirmar.",
  },
  {
    key: "velocidadMotor",
    rama: "lecturaVariadorModbusRtu",
    tag: "VELOCIDAD",
    label: "Velocidad calculada del motor",
    // No "Velocidad" a secas: el sistema de vibraciones ya tiene una señal
    // con ese nombre corto ("velocidad eficaz"), y resolverla por nombre
    // acabaría en ambigüedad entre dos máquinas distintas.
    corto: "Velocidad VFD",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "crudo",
    activo: "bombeo",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: true,
    nota: "Registro Modbus sin escalar: el factor de escala del variador está sin confirmar.",
  },
  {
    key: "corrienteVariador",
    rama: "lecturaVariadorModbusRtu",
    tag: "DP_CORRIENTE",
    label: "Corriente de salida del variador",
    corto: "Corriente VFD",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "crudo",
    activo: "bombeo",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: true,
    nota: "Registro Modbus sin escalar: el factor de escala del variador está sin confirmar.",
  },
  {
    key: "torqueVariador",
    rama: "lecturaVariadorModbusRtu",
    tag: "TORQUE",
    label: "Par estimado por el variador",
    corto: "Torque",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "crudo",
    activo: "bombeo",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: true,
    nota: "Registro Modbus sin escalar: el factor de escala del variador está sin confirmar.",
  },
  {
    key: "potenciaActualVariador",
    rama: "lecturaVariadorModbusRtu",
    tag: "PWR_ACTUAL",
    label: "Potencia instantánea del variador",
    corto: "Pot. instant.",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "crudo",
    activo: "bombeo",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: true,
    nota: "Registro Modbus sin escalar: el factor de escala del variador está sin confirmar.",
  },
  {
    key: "energiaAcumuladaVariador",
    rama: "lecturaVariadorModbusRtu",
    tag: "KWH_TOTAL",
    label: "Energía acumulada del variador",
    corto: "Energía VFD",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "crudo",
    activo: "bombeo",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    // Es un acumulador de parámetro fijo, no depende de si el motor impulsa
    // en este instante.
    soloEnMarcha: false,
    nota: "Registro Modbus sin escalar: el factor de escala del variador está sin confirmar.",
  },
  {
    key: "voltajeBusDc",
    rama: "lecturaVariadorModbusRtu",
    tag: "VOLTAJE_BUS_DC",
    label: "Tensión del bus de continua",
    corto: "Bus DC",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "crudo",
    activo: "bombeo",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    nota: "Registro Modbus sin escalar: el factor de escala del variador está sin confirmar.",
  },
  {
    key: "referenciaVariador",
    rama: "lecturaVariadorModbusRtu",
    tag: "REFERENCIA",
    label: "Consigna de frecuencia leída del variador",
    corto: "Referencia",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "crudo",
    activo: "bombeo",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: true,
    nota: "Registro Modbus sin escalar: el factor de escala del variador está sin confirmar.",
  },
  {
    key: "potenciaNominalVariador",
    rama: "lecturaVariadorModbusRtu",
    tag: "POTENCIA_NOMINAL",
    label: "Potencia nominal parametrizada",
    corto: "Pot. nominal",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "crudo",
    activo: "bombeo",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    // Parámetro fijo del variador, no una lectura de proceso: no depende de
    // si el motor está impulsando ahora mismo.
    soloEnMarcha: false,
    nota: "Registro Modbus sin escalar: el factor de escala del variador está sin confirmar.",
  },
  {
    key: "voltajeSalidaVariador",
    rama: "lecturaVariadorModbusRtu",
    tag: "VOLTAJE_SALIDA",
    label: "Tensión de salida hacia el motor",
    corto: "Tensión salida",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "crudo",
    activo: "bombeo",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: true,
    nota: "Registro Modbus sin escalar: el factor de escala del variador está sin confirmar.",
  },

  {
    key: "arranqueParoLlenado",
    rama: "automatismoLlenadoVacio",
    tag: "ARRANQUE_PARO_LLENADO",
    label: "Orden de llenado",
    corto: "Orden llenado",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "mando",
    activo: "tanque",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "En marcha", false: "Detenida" },
    nota: "Orden de inicio/parada de la secuencia de llenado.",
  },
  {
    key: "arranqueParoVaciado",
    rama: "automatismoLlenadoVacio",
    tag: "ARRANQUE_PARO_VACIADO",
    label: "Orden de vaciado",
    corto: "Orden vaciado",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "mando",
    activo: "tanque",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "En marcha", false: "Detenida" },
    nota: "Orden de inicio/parada de la secuencia de vaciado.",
  },
  {
    key: "recirculacionAutomatica",
    rama: "automatismoLlenadoVacio",
    tag: "RECIRCULACION_AUTOMATICA",
    label: "Recirculación automática",
    corto: "Recirc. auto",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    // Sin `naturaleza`: es un modo de operación, no una orden puntual —mismo
    // trato que `modoVdf`, booleano genérico sin banda.
    activo: "tanque",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Habilitada", false: "Deshabilitada" },
    nota: "Habilita el ciclo automático de recirculación entre tanques.",
  },
  {
    key: "setpointLlenado",
    rama: "automatismoLlenadoVacio",
    tag: "SETPOINT_LLENANDO",
    label: "Consigna de llenado",
    corto: "SP llenado",
    // Sin unidad: pregunta 2 de §3 del plan, sin responder. El PDF sugiere
    // que comparte la de nivelTanque (banda de histéresis de 40 unidades
    // entre 40 y 80), pero lo deja condicionado a que lo sea.
    unidad: "",
    decimales: 1,
    tipo: "real",
    naturaleza: "consigna",
    activo: "tanque",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    nota: "Consigna de nivel a la que se detiene el llenado. Unidad sin confirmar — se presume la misma de Nivel del tanque.",
  },
  {
    key: "setpointVaciado",
    rama: "automatismoLlenadoVacio",
    tag: "SETPOINT_VACIADO",
    label: "Consigna de vaciado",
    corto: "SP vaciado",
    unidad: "",
    decimales: 1,
    tipo: "real",
    naturaleza: "consigna",
    activo: "tanque",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    nota: "Consigna de nivel a la que se detiene el vaciado. Unidad sin confirmar — se presume la misma de Nivel del tanque.",
  },

  /*
   * ── PLAN 27 F5: LAS DOS ELECTROVÁLVULAS Y LA BOMBA DE AIRE ──────────
   *
   * Doce señales de tres ramas (`SOLENOIDE_1_INFERIOR/`,
   * `SOLENOIDE_2_SUPERIOR/`, `BOMBA_DE_AIRE/`), las tres con la MISMA forma
   * (`Lista-variables.pdf` §1.4-§1.6): un selector de modo (booleano
   * genérico, como `modoVdf`), una orden de apertura/marcha
   * (`naturaleza: "mando"`), un bloqueo de mantenimiento
   * (`naturaleza: "mando"` también: es una orden del operador, no una
   * condición) y un estado de equipo (`naturaleza: "estado"`, la tabla
   * común de `ESTADO_EQUIPO` en `./estado.js`).
   *
   * Primer uso real de `naturaleza: "estado"` en el catálogo — `MTTO_VFD` y
   * `DP_ESTADO_VFD` (el mismo patrón, en `MANDO_DEL_VARIADOR_VFD/`) quedan
   * fuera de esta fase, ver la cabecera de `activos.js`.
   */
  {
    key: "manualAutoS1",
    rama: "solenoide1Inferior",
    tag: "MANUAL_AUTO_S1",
    label: "Modo de la electroválvula inferior",
    corto: "Modo S1",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    activo: "valvulasYAire",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Manual", false: "Automático" },
    nota: "Selector de modo de la electroválvula inferior. Correspondencia Automático/Manual no confirmada — mismo criterio que el modo del variador.",
  },
  {
    key: "arranqueParoS1",
    rama: "solenoide1Inferior",
    tag: "START_STOP_S1",
    label: "Orden de la electroválvula inferior",
    corto: "Orden S1",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "mando",
    activo: "valvulasYAire",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Abrir", false: "Cerrar" },
    nota: "Orden de apertura/cierre de la electroválvula inferior.",
  },
  {
    key: "mttoS1",
    rama: "solenoide1Inferior",
    tag: "MTTO_S1",
    label: "Bloqueo de mantenimiento (S1)",
    corto: "Mtto S1",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "mando",
    activo: "valvulasYAire",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Bloqueada", false: "Disponible" },
    nota: "Bloqueo por mantenimiento de la electroválvula inferior.",
  },
  {
    key: "estadoS1",
    rama: "solenoide1Inferior",
    tag: "ESTADO_S1",
    label: "Estado de la electroválvula inferior",
    corto: "Estado S1",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "estado",
    activo: "valvulasYAire",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { 1: "Apagado", 2: "En marcha", 3: "Error", 4: "Mantenimiento" },
    nota: "Estado de la electroválvula inferior. 0 es el valor inicial del PLC: se trata como sin dato, no como apagado.",
  },

  {
    key: "manualAutoS2",
    rama: "solenoide2Superior",
    tag: "MANUAL_AUTO_S2",
    label: "Modo de la electroválvula superior",
    corto: "Modo S2",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    activo: "valvulasYAire",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Manual", false: "Automático" },
    nota: "Selector de modo de la electroválvula superior. Correspondencia Automático/Manual no confirmada.",
  },
  {
    key: "arranqueParoS2",
    rama: "solenoide2Superior",
    tag: "START_STOP_S2",
    label: "Orden de la electroválvula superior",
    corto: "Orden S2",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "mando",
    activo: "valvulasYAire",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Abrir", false: "Cerrar" },
    nota: "Orden de apertura/cierre de la electroválvula superior.",
  },
  {
    key: "mttoS2",
    rama: "solenoide2Superior",
    tag: "MTTO_S2",
    label: "Bloqueo de mantenimiento (S2)",
    corto: "Mtto S2",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "mando",
    activo: "valvulasYAire",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Bloqueada", false: "Disponible" },
    nota: "Bloqueo por mantenimiento de la electroválvula superior.",
  },
  {
    key: "estadoS2",
    rama: "solenoide2Superior",
    tag: "ESTADO_S2",
    label: "Estado de la electroválvula superior",
    corto: "Estado S2",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "estado",
    activo: "valvulasYAire",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { 1: "Apagado", 2: "En marcha", 3: "Error", 4: "Mantenimiento" },
    nota: "Estado de la electroválvula superior. 0 es el valor inicial del PLC: se trata como sin dato, no como apagado.",
  },

  {
    key: "manualAutoBa",
    rama: "bombaDeAire",
    tag: "MANUAL_AUTO_BA",
    label: "Modo de la bomba de aire",
    corto: "Modo BA",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    activo: "valvulasYAire",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Manual", false: "Automático" },
    nota: "Selector de modo de la bomba de aire. Correspondencia Automático/Manual no confirmada.",
  },
  {
    key: "arranqueParoBa",
    rama: "bombaDeAire",
    tag: "START_STOP_BA",
    label: "Orden de la bomba de aire",
    corto: "Orden BA",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "mando",
    activo: "valvulasYAire",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "En marcha", false: "Detenida" },
    nota: "Orden de marcha/paro de la bomba de aire.",
  },
  {
    key: "mttoBa",
    rama: "bombaDeAire",
    tag: "MTTO_BA",
    label: "Bloqueo de mantenimiento (bomba de aire)",
    corto: "Mtto BA",
    unidad: "",
    decimales: 0,
    tipo: "booleano",
    naturaleza: "mando",
    activo: "valvulasYAire",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { true: "Bloqueada", false: "Disponible" },
    nota: "Bloqueo por mantenimiento de la bomba de aire.",
  },
  {
    key: "estadoBa",
    rama: "bombaDeAire",
    tag: "ESTADO_BA",
    label: "Estado de la bomba de aire",
    corto: "Estado BA",
    unidad: "",
    decimales: 0,
    tipo: "real",
    naturaleza: "estado",
    activo: "valvulasYAire",
    historizado: true,
    escala: null,
    subirEsBueno: null,
    soloEnMarcha: false,
    etiquetas: { 1: "Apagado", 2: "En marcha", 3: "Error", 4: "Mantenimiento" },
    nota: "Estado de la bomba de aire. 0 es el valor inicial del PLC: se trata como sin dato, no como apagado.",
  },
];

/** Señal por clave. Es el mapa que consultan el resto de módulos. */
export const SENALES = Object.fromEntries(CATALOGO.map((s) => [s.key, s]));

/** Claves en orden de presentación. */
export const SENAL_KEYS = CATALOGO.map((s) => s.key);

/** Metadatos de una señal. Devuelve `null` ante una clave desconocida. */
export const senalInfo = (key) => SENALES[key] ?? null;

/**
 * Punto de tiempo real: `ac:TDCON/DEMO/INSTRUMENTACION_DE_PROCESO/NIVEL_TANQUE`,
 * compuesto de la rama de la señal (`RAMAS[s.rama]`) y su `tag` — ya no de una
 * raíz única (Plan 27 F1: antes de la reorganización del 09-09-2026 las dos
 * cosas coincidían, porque sólo había una rama).
 *
 * El variador llevaba espacios en su nombre (`Modo AM VDF`) hasta que planta
 * lo renombró el 09-09-2026 a `Modo_AM_VDF`, así que hoy ningún tag del
 * catálogo los tiene — pero si vuelve a aparecer uno, el lote
 * (`/api/iconics/data/batch`, separado por comas) y la validación del puente
 * lo aceptan tal cual, porque el cliente codifica cada punto por separado. No
 * hay que sanearlo aquí.
 */
export function pointName(key) {
  const s = SENALES[key];
  if (!s) return null;
  const rama = RAMAS[s.rama];
  return rama ? `${rama}${s.tag}` : null;
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

/**
 * Las historizadas que además son MEDIDAS comparables entre sí: magnitudes
 * reales sin `naturaleza` especial (una alarma, un mando, una consigna, un
 * crudo sin escalar o un estado enumerado no son "una medida" en el sentido
 * que necesita una banda de KPIs con sparkline, o un selector de "compara
 * esta señal contra aquélla").
 *
 * Antes del Plan 27 F6 (10-09-2026) esto y `historizadas()` eran la misma
 * lista —las cinco originales eran todas medidas—, así que nada la
 * necesitaba. Historizar cuarenta y cinco señales más, la mayoría booleanas
 * o crudas, separó las dos preguntas: «¿tiene serie propia?» ya no implica
 * «¿es una cifra que tiene sentido comparar o graficar como KPI?». La UI que
 * antes escribía `esHistorizada` para armar una banda de KPIs numérica
 * —`Demo-EVA/lib/modelo.js`, `GraficaComparada.jsx`— tiene que preguntar
 * esto, no aquello.
 */
export const historizadasMedidas = () =>
  historizadas().filter((k) => SENALES[k].tipo === "real" && !SENALES[k].naturaleza);

/** ¿Se puede pedir la serie de esta señal sin mentir? */
export const esHistorizada = (key) => Boolean(SENALES[key]?.historizado);

/**
 * Las ocho señales `naturaleza: "alarma"` del PLC (Plan 27 F3), en el orden
 * del catálogo. Vive aquí y no se recalcula donde se necesita —la vista de
 * Planta, la de Detalle, la pestaña «En vivo» de Alarmas— porque las tres
 * necesitan exactamente el mismo criterio: si un componente decidiera con su
 * propio filtro, una alarma nueva entraría en una vista y no en la otra sin
 * que nadie lo note. Ver `estado.js` para por qué `naturaleza: "alarma"` se
 * juzga distinto de un booleano genérico.
 */
export const ALARMAS = SENAL_KEYS.filter((k) => SENALES[k].naturaleza === "alarma");

/**
 * ── EL NOMBRE `hda:` DE LA SERIE, PORQUE YA NO ES EL MISMO QUE EL DE VIVO ──
 * (Plan 27 F6, 10-09-2026)
 *
 * Hasta este commit `series.punto` de `sistemas.js` usaba `pointName` a
 * secas: el punto histórico se pedía con el mismo nombre `ac:` que el de
 * vivo, y así había sido desde el Plan 8. La reorganización del árbol del
 * 09-09-2026 lo rompió — `/History` contra `ac:TDCON/DEMO/…` da 500 para
 * doce de las trece ramas nuevas; sólo el árbol PROPIO del historiador,
 * `hda:\Configuration\DEMO TANQUE\…`, contesta (ver §4 de
 * `docs/completados/PLAN-27-VARIABLES-DEL-TANQUE.md`). Mismo hecho que ya sabía
 * `vibraciones.js` de su propia máquina desde el 27-08-2026 —`hda:` es el
 * ARCHIVO, `ac:` es el VALOR EN VIVO—, sólo que aquí tardó un mes más en
 * hacerse cierto porque hasta la reorganización el redirect vivía
 * configurado en el propio activo del servidor.
 *
 * `RAMA_A_CARPETA_HDA` traduce rama → carpeta del árbol `hda:`, confirmado
 * con `browse()` el 09-09-2026: LAS MISMAS trece carpetas, pero sin la
 * partícula `_DE_`/`_INFERIOR`/`_SUPERIOR` que sí lleva `ac:` en cuatro de
 * ellas. `OVERRIDE_TAG_HDA` cubre los dos tags que además el propio servidor
 * escribe distinto de como se declaran aquí: un typo real de planta
 * (`DP_EENERGIA_APARENTEL1`, doble E) y una diferencia de mayúsculas
 * (`MODO_AM_VDF`) — confirmados los dos con `browse()`, no adivinados. No
 * hay una regla que derive el uno del otro; por eso esto es tabla, no
 * cálculo (tal como anticipaba el plan en su §F6).
 *
 * `cargaMotor` y `eficienciaEnergetica` quedan permanentemente fuera —por
 * eso `historizado` sigue en `false` para ellas pese a estar en la rama
 * `sensores` como `tensionLinea`—: son las dos de las que la cabecera de
 * este archivo documenta que el historiador devuelve la serie de
 * `temperaturaTanque`. `tensionLinea` es la excepción de la excepción: su
 * `Historical data source` SÍ está configurado en el activo, contra el punto
 * SUELTO de la raíz del árbol `hda:` (`Tension`, sin carpeta) — el mismo que
 * ya se documentaba en agosto para `INDICE_DESVIACION_VOLTAJE`.
 */
const B = String.fromCharCode(92);
const RAIZ_HDA = `hda:${B}Configuration${B}DEMO TANQUE${B}`;
const RAIZ_HDA_SUELTA = `hda:${B}Configuration${B}DEMO TANQUE:`;

const RAMA_A_CARPETA_HDA = {
  instrumentacionProceso: "INSTRUMENTACION_PROCESO",
  seguridad: "SEGURIDAD",
  mandoVariadorVfd: "MANDO_DEL_VARIADOR_VFD",
  solenoide1Inferior: "SOLENOIDE_1",
  solenoide2Superior: "SOLENOIDE_2",
  bombaDeAire: "BOMBA_DE_AIRE",
  automatismoLlenadoVacio: "AUTOMATISMO_LLENADO_VACIADO",
  lecturaVariadorModbusRtu: "LECTURA_VARIADOR_MODBUS_RTU",
  medidorDeEnergia: "MEDIDOR_DE_ENERGIA",
  alarmas: "ALARMAS",
};

const OVERRIDE_TAG_HDA = {
  DP_ENERGIA_APARENTEL1: "DP_EENERGIA_APARENTEL1",
  Modo_AM_VDF: "MODO_AM_VDF",
};

/**
 * El nombre `hda:` de la serie de una señal — el que hay que pedir en
 * `/History`, nunca el de `pointName()` salvo para `tensionLinea`. Devuelve
 * `null` si la señal no tiene serie propia (`historizado: false`) o si su
 * rama no tiene carpeta conocida en el árbol `hda:`.
 */
export function puntoHistorico(key) {
  if (!esHistorizada(key)) return null;
  if (key === "tensionLinea") return `${RAIZ_HDA_SUELTA}Tension`;
  const s = SENALES[key];
  const carpeta = RAMA_A_CARPETA_HDA[s.rama];
  if (!carpeta) return null;
  const tag = OVERRIDE_TAG_HDA[s.tag] ?? s.tag;
  return `${RAIZ_HDA}${carpeta}:${tag}`;
}

/**
 * Nombre de punto COMPLETO → clave de dominio. Se construye una vez, contra
 * las trece ramas — no basta con indexar por `tag` a secas (Plan 27 F1): con
 * una sola rama nunca hacía falta distinguir de cuál venía un tag, y con
 * trece dos señales de ramas distintas podrían compartir tag algún día sin
 * que nadie lo notara si sólo se comparara la mitad del nombre.
 */
const DOMINIO_POR_PUNTO = Object.fromEntries(
  CATALOGO.map((s) => [pointName(s.key), s.key]).filter(([punto]) => punto !== null)
);

/**
 * Inverso de `pointName`. Devuelve `null` ante cualquier punto que no
 * reconozca, para que un cambio en el servidor se vea como dato ausente y
 * nunca como una asignación a la señal equivocada — mismo criterio que
 * `parsePointName` del catálogo de Resonac.
 */
export function parsePointName(name) {
  if (typeof name !== "string") return null;
  return DOMINIO_POR_PUNTO[name] ?? null;
}

/**
 * Inverso de `puntoHistorico` (Plan 27 F6). Se construye por separado de
 * `DOMINIO_POR_PUNTO` porque el nombre histórico no es el mismo que el de
 * vivo para casi ninguna señal desde la reorganización del 09-09-2026 —
 * unificar las dos tablas confundiría un punto `ac:` con uno `hda:` que da
 * la casualidad de que empieza distinto pero podría no hacerlo. Lo usa el
 * transporte falso (`ICONICS_FAKE=true`) para reconocer contra qué señal
 * está pidiendo historia una llamada real del código, no del catálogo.
 */
const DOMINIO_POR_PUNTO_HISTORICO = Object.fromEntries(
  SENAL_KEYS.map((k) => [puntoHistorico(k), k]).filter(([punto]) => punto !== null)
);

/** Inverso de `puntoHistorico`. `null` ante cualquier nombre que no reconozca. */
export function parsePuntoHistorico(name) {
  if (typeof name !== "string") return null;
  return DOMINIO_POR_PUNTO_HISTORICO[name] ?? null;
}
