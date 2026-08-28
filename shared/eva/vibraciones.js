/**
 * Catálogo del SISTEMA DE VIBRACIONES — el segundo sistema, no el del tanque.
 *
 * ── POR QUÉ ES UN ARCHIVO APARTE Y NO UNA SECCIÓN DE `senales.js` ──
 *
 * Porque son DOS MÁQUINAS DISTINTAS. `senales.js` describe el tanque y su
 * grupo de bombeo (PLC_1, `ua:DEMO2`). Esto describe otro motor, con otro
 * variador y otro PLC (PLC_2, `ua:DEMO3`). Colgar las vibraciones del activo
 * «bombeo» porque suena a bomba haría que cualquiera cruzara el caudal de allí
 * con la vibración de aquí, y esa correlación uniría dos instalaciones que no
 * se tocan. La nota larga de `senales.js` ya avisaba de esto; aquí se cumple.
 *
 * ── CÓMO SE DIRECCIONAN ESTOS PUNTOS ───────────────────────────────
 *
 * Por su ruta en AssetWorX, igual que el tanque:
 *
 *     ac:TDCON/Motors/01/S1/vRMS_S1
 *
 * Ni por node id de OPC UA (`ua:DEMO3\[http://BMS_1]i=458..592`) ni por el
 * grupo del historiador. Los tres caminos llevan al mismo dato; la diferencia
 * está en de qué depende cada uno.
 *
 * ── POR QUÉ SE DEJÓ DE LEER POR `hda:` (27-08-2026) ────────────────
 *
 * Este catálogo nació apuntando al Hyper Historian —`hda:\Configuration\DEMO
 * 3:`—, y se validó comprobando que los 119 tags del grupo devolvían valor.
 * La comprobación fue verde y la decisión se cerró ahí; el problema es que
 * medía el estado del historiador, no el del dato.
 *
 * Lo que se vio después: `DKW_S1` y `MonState_v_f_S3` tardaban **5 segundos
 * clavados** y volvían sin valor y con calidad de error. No eran el sensor ni
 * el PLC: por `ac:` los dos entregan lectura buena al instante. `DKW_S1`
 * estaba declarado en el historiador pero SIN muestras (`Empty value`), y
 * `MonState_v_f_S3` ni siquiera estaba declarado.
 *
 * Y el coste no lo pagaban esos dos puntos, sino la pantalla entera: el sondeo
 * pide los 73 en UN solo lote, así que los otros 71 esperaban a que esos dos
 * agotaran su plazo. Medido sobre el lote real:
 *
 *     los 73 por hda:                    ~5030 ms, 71 de 73 con valor
 *     69 por ac: + 4 alarmas por ae:       11-30 ms, 73 de 73 con valor
 *
 * El fondo del asunto: `hda:` es el ARCHIVO y `ac:` es el VALOR EN VIVO. Esta
 * pantalla mira el instante —`historizado` sigue en `false` más abajo, y no se
 * afirma ninguna tendencia—, así que estaba pidiendo lecturas en vivo por la
 * ruta del histórico. Funcionaba porque el historiador también sabe devolver
 * el último valor, pero añadía dos condiciones que este uso no necesita: que
 * cada punto esté declarado Y recogiendo.
 *
 * Se conserva lo que motivó la decisión original: esto sigue siendo un NOMBRE
 * y no un node id, así que sigue sin moverse cuando se recompile el PLC.
 *
 * Las 4 alarmas NO cambian: son contadores de AlarmWorX (`ae:`), no puntos de
 * activo, y responden bien. Ver `AREA_ALARMAS`.
 *
 * Para leer SERIES —el día que las haya— el sitio sigue siendo `hda:`. La ruta
 * de activo es para el instante.
 *
 * ── LA HISTORIA ACABA DE EMPEZAR, Y TODAVÍA NO SE PROMETE ──────────
 *
 * El 25-08-2026 el grupo `DEMO 3` devolvía HTTP 500 en sus 119 tags: definidos
 * pero sin recoger. El 26-08 empezó a registrar, y se vio entrar **mientras se
 * medía**: entre dos comprobaciones separadas por minutos, `DKW_S2`, `DKW_S3` y
 * `ENABLED_BMS` pasaron de fallar a devolver serie.
 *
 * Aun así `historizado` sigue siendo `false` en todo este archivo, a propósito.
 * Un tag que hoy responde y mañana no deja una gráfica rota o —peor— una que
 * se rellena con la serie de otra señal, que es el fallo que nadie detecta
 * mirando la pantalla. Esta marca se levanta cuando la configuración deje de
 * moverse, no cuando empiece a funcionar.
 *
 * Mientras tanto se vigila el instante, y **no se afirma ninguna tendencia**.
 * «El aRMS lleva tres semanas subiendo» es exactamente la frase que este
 * archivo no permite decir todavía.
 *
 *   node scripts/comprobar-historia-vibraciones.mjs
 *
 * ── LA MÁQUINA, CONFIRMADA ─────────────────────────────────────────
 *
 *   motor        WEG W22 143/5T, 2 HP (1,5 kW), 2 polos → 3475 rpm a plena
 *                carga. Con variador, la velocidad varía, y las frecuencias
 *                de defecto de rodamiento varían con ella.
 *   rodamientos  6205 ZZ (lado acople) y 6204 ZZ (lado ventilador).
 *   norma        1,5 kW está MUY por debajo de los 15 kW de ISO 10816-3. La
 *                tabla que aplica es **ISO 10816-1 Clase I**. Usar la de
 *                10816-3 pondría el aviso en 4,5 mm/s y se perdería la mitad
 *                del margen útil.
 */

/**
 * Rama de este motor en AssetWorX. Los puntos NO cuelgan de aquí directamente:
 * cada apoyo tiene su carpeta (`S1/`, `S2/`, `S3/`) y el variador la suya
 * (`V20/`). Enumerado con `Data/Browse` el 27-08-2026.
 */
export const RAIZ_VIB = "ac:TDCON/Motors/01/";

/**
 * Carpeta del variador dentro de la rama. Los tags `*_BMS` viven aquí y no
 * junto a los apoyos —se comprobó pidiéndolos bajo `01/` y no respondían—.
 */
export const CARPETA_VARIADOR = "V20/";

/**
 * Grupo del Hyper Historian. Ya no se usa para leer el instante (ver la nota
 * de cabecera), pero se conserva porque es donde vivirán las SERIES el día que
 * el grupo registre de verdad. El espacio de «DEMO 3» es literal: sin él
 * ICONICS responde 500 y parece que el tag no existe.
 */
export const GRUPO_HISTORIADOR = "hda:\\Configuration\\DEMO 3:";

/**
 * ── LOS TRES CANALES ───────────────────────────────────────────────
 *
 * Se creía que había dos sensores. El servidor publica **tres**, los tres con
 * calidad buena y valores plausibles, y cada uno dice su propio nombre en
 * `EQUIPMENT NAME_Sn` (leído en vivo el 25-08-2026):
 *
 *   S1  MTR-01_DRIVE_SIDE_VIB          lado acople
 *   S2  MTR-01_INTERMEDIATE_BRG_VIB    rodamiento intermedio
 *   S3  MTR-01_FREE_END_VIB            lado libre (ventilador)
 *
 * `sensibilidad` es la calibración de CADA sonda, en mV/g, y no es un detalle
 * de papeleo: el SM 1281 divide por ella, así que un canal configurado con el
 * 100 nominal cuando la sonda trae 99 devuelve todas sus lecturas escaladas un
 * 1 % de más, para siempre y sin avisar.
 */
export const CANALES = [
  {
    id: "S1",
    sufijo: "S1",
    label: "Lado acople",
    equipo: "MTR-01_DRIVE_SIDE_VIB",
    // Confirmada por el usuario: la sonda VIB S01 trae 100.05, no 100.
    sensibilidad: 100.05,
    // Del catálogo WEG del W22 143/5T: el rodamiento del lado acople.
    rodamiento: "6205 ZZ",
  },
  {
    id: "S2",
    sufijo: "S2",
    label: "Rodamiento intermedio",
    equipo: "MTR-01_INTERMEDIATE_BRG_VIB",
    sensibilidad: 99,
    /*
     * Un rodamiento INTERMEDIO no es del motor: es un soporte de la máquina
     * accionada o del acoplamiento. No sale del catálogo WEG, así que aquí no
     * se pone ninguno. Sin referencia no se pueden calcular BPFO/BPFI/FTF, y
     * ponerlas con la geometría del 6205 daría frecuencias de defecto de otro
     * rodamiento: números con aspecto de diagnóstico apuntando a otra pieza.
     */
    rodamiento: null,
  },
  {
    id: "S3",
    sufijo: "S3",
    label: "Lado libre",
    equipo: "MTR-01_FREE_END_VIB",
    /*
     * Confirmada por el usuario el 26-08-2026: 100 mV/g clavados.
     *
     * Estuvo en `null` un día entero porque sólo se habían dado las de S01 y
     * S02 —se creía que había dos sensores—, y poner el 100 nominal por
     * parecido habría sido inventar un dato de calibración. Que al final
     * resultara ser 100 no cambia que suponerlo estaba mal: S01 trae 100,05 y
     * S02 trae 99, así que el nominal no era una apuesta segura.
     */
    sensibilidad: 100,
    rodamiento: "6204 ZZ",
  },
];

/** Canal por id. */
export const CANAL = Object.fromEntries(CANALES.map((c) => [c.id, c]));

/**
 * ── MEDIDAS POR CANAL ──────────────────────────────────────────────
 *
 * Cada medida existe tres veces, una por canal. El sufijo se pega al nombre:
 * `vRMS` + `_S1`. La única excepción es `MonState_vRMS`, que en S2 se llama
 * `MonState_vRMS_2` y no `MonState_vRMS_S2` —falta la S—; está así en el
 * servidor y aquí se respeta en vez de corregirlo, porque corregirlo
 * silenciosamente pediría un tag inexistente.
 */
export const MEDIDAS = [
  {
    key: "vRMS",
    tag: "vRMS",
    label: "Velocidad eficaz",
    corto: "vRMS",
    unidad: "mm/s",
    decimales: 3,
    escala: { min: 0, max: 6 },
    // Ver `LIMITES_ISO`: es la única medida con norma detrás.
    norma: "ISO 10816-1 Clase I",
    mide: "Desequilibrio, desalineación y holguras. Es la medida de « estado " +
      "general de la máquina», y la única que una norma acota en absoluto.",
  },
  {
    key: "aRMS",
    tag: "aRMS",
    label: "Aceleración eficaz",
    corto: "aRMS",
    unidad: "m/s²",
    decimales: 3,
    escala: { min: 0, max: 10 },
    norma: null,
    mide: "Energía de alta frecuencia. Sube cuando un rodamiento empieza a " +
      "picarse, mucho antes de que se note en la velocidad.",
  },
  {
    key: "aPeak",
    tag: "aPeak",
    label: "Aceleración de pico",
    corto: "aPico",
    unidad: "m/s²",
    decimales: 3,
    escala: { min: 0, max: 20 },
    norma: null,
    mide: "El golpe más fuerte del intervalo. Comparado con el aRMS da el " +
      "factor de cresta, que distingue un impacto seco de un ruido de fondo.",
  },
  {
    key: "DKW",
    tag: "DKW",
    label: "Valor característico de daño",
    corto: "DKW",
    unidad: "",
    decimales: 3,
    escala: { min: 0, max: 10 },
    norma: null,
    /*
     * El DKW es RELATIVO a una referencia que el módulo aprende con la máquina
     * sana. Sin ese aprendizaje no vale nada, y el servidor lo confirma: el
     * 25-08-2026 `DKW_S1` devolvía calidad MALA mientras S2 y S3 daban número.
     */
    mide: "Cuántas veces peor está la máquina que cuando se aprendió su " +
      "referencia. Sin aprendizaje previo no significa nada.",
  },
];

/** Estados y diagnóstico por canal, que no son medidas sino banderas. */
export const BANDERAS = [
  { key: "alarma", tag: "Alarma", label: "Alarma del módulo", tipo: "booleano" },
  { key: "aviso", tag: "Warning", label: "Aviso del módulo", tipo: "booleano" },
  { key: "offset", tag: "Sensoroffset", label: "Desviación del sensor", tipo: "real" },
];

/**
 * ── LOS ESTADOS DE VIGILANCIA ──────────────────────────────────────
 *
 * El módulo no publica sólo el número medido: publica también, para cada cosa
 * que vigila, en qué estado está esa vigilancia. Llegan como cadena base64 de
 * un arreglo de bytes en el que **un solo byte vale 1**, y su posición es el
 * estado. Medido el 26-08-2026 con la máquina en marcha y estable:
 *
 *   MonState_vRMS / aRMS / DKW      [0 1 0 0]   en los tres canales
 *   MonState_a_f  / v_f             [0 1 0 0]   en los tres canales
 *   MonState_e_f_BPFO / BPFI / FTF  [1 0 0 0]   en los tres canales
 *
 * ── DE DÓNDE SALE LA LECTURA DE ESAS POSICIONES ────────────────────
 *
 * La posición está MEDIDA; lo que significa cada una está DEDUCIDO, y el
 * razonamiento va aquí para que se pueda discutir en vez de creerse:
 *
 *   · `Alarma_Sn` y `Warning_Sn` valían `false` en los tres canales, así que
 *     nada estaba en aviso ni en alarma en ese momento.
 *   · Las medidas que sí funcionan estaban en la posición 1.
 *   · Las frecuencias de defecto de rodamiento estaban en la 0.
 *   · Las dos no pueden significar «en orden», porque son distintas y ninguna
 *     puede ser «en alarma».
 *
 * De ahí que 1 sea «vigilado y en orden» y 0 sea «no se está vigilando». Las
 * posiciones 2 y 3 no se han observado nunca: se declaran como aviso y alarma
 * por ser el orden natural, y quedan marcadas como no confirmadas.
 *
 * **Confirmar contra la tabla `MonState` del manual del SM 1281 antes de
 * apoyar ninguna decisión en las posiciones 2 y 3.**
 */
export const VIGILANCIA = [
  { indice: 0, id: "apagado", label: "No se vigila", confirmado: true },
  { indice: 1, id: "ok", label: "Vigilado y en orden", confirmado: true },
  { indice: 2, id: "aviso", label: "En aviso", confirmado: false },
  { indice: 3, id: "alarma", label: "En alarma", confirmado: false },
];

/**
 * Cadena base64 del módulo → `{ indice, id, label, confirmado }`, o `null`.
 *
 * Devuelve `null` —y no la posición 0— cuando no hay exactamente un byte a 1.
 * Un arreglo con dos bytes encendidos, o con ninguno, no es un estado que este
 * catálogo sepa leer, y hacerlo pasar por «no se vigila» convertiría un dato
 * que no entendemos en una afirmación sobre la máquina.
 */
export function decodificarVigilancia(valor) {
  if (typeof valor !== "string") return null;
  let bytes;
  try {
    bytes = [...Uint8Array.from(atob(valor), (ch) => ch.charCodeAt(0))];
  } catch {
    return null;
  }
  const encendidos = bytes.reduce((n, b, i) => (b === 1 ? [...n, i] : n), []);
  if (encendidos.length !== 1) return null;
  return VIGILANCIA.find((v) => v.indice === encendidos[0]) ?? null;
}

/**
 * `indice` → la cadena base64 que publicaría el módulo, o `null` si ese estado
 * no existe. Inverso exacto de `decodificarVigilancia`.
 *
 * Existe para el SIMULADOR (`simuladorVibraciones.js`), que tiene que servir
 * estos estados por el mismo hueco por el que llegan los del servidor. Vive
 * aquí y no allí porque el base64 y la longitud del arreglo son parte de cómo
 * el módulo escribe este dato, igual que los nombres de tag: si mañana el
 * arreglo tuviera cinco posiciones, el que se entera es este archivo, y las
 * dos direcciones cambiarían juntas.
 */
export function codificarVigilancia(indice) {
  if (!VIGILANCIA.some((v) => v.indice === indice)) return null;
  const bytes = VIGILANCIA.map((v) => (v.indice === indice ? 1 : 0));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * ── QUÉ VIGILA EL MÓDULO, ADEMÁS DE LOS NÚMEROS ────────────────────
 *
 * Tres grupos, y el tercero es el que de verdad diagnostica rodamientos.
 *
 *   umbral     el valor medido contra su límite. Es lo mismo que ya se ve en
 *              `MEDIDAS`, pero dicho por el módulo y no calculado por nosotros.
 *   espectro   la forma del espectro completo contra una máscara aprendida.
 *              Detecta cambios que el valor eficaz promedia y esconde.
 *   rodamiento el espectro de envolvente en las frecuencias de defecto de UN
 *              rodamiento concreto. Es el diagnóstico de verdad: no dice «esto
 *              vibra más», dice «la pista exterior está picada».
 */
export const VIGILANCIAS = [
  { key: "monVRMS", tag: "MonState_vRMS", label: "Velocidad eficaz contra su umbral", grupo: "umbral" },
  { key: "monARMS", tag: "MonState_aRMS", label: "Aceleración eficaz contra su umbral", grupo: "umbral" },
  { key: "monDKW", tag: "MonState_DKW", label: "Valor de daño contra su referencia", grupo: "umbral" },
  { key: "monEspectroA", tag: "MonState_a_f", label: "Espectro de aceleración", grupo: "espectro" },
  { key: "monEspectroV", tag: "MonState_v_f", label: "Espectro de velocidad", grupo: "espectro" },
  {
    key: "bpfo", tag: "MonState_e_f_BPFO", grupo: "rodamiento",
    label: "Frecuencia de defecto de pista exterior (BPFO)",
    defecto: "Picado o descascarillado de la PISTA EXTERIOR del rodamiento.",
  },
  {
    key: "bpfi", tag: "MonState_e_f_BPFI", grupo: "rodamiento",
    label: "Frecuencia de defecto de pista interior (BPFI)",
    defecto: "Picado o descascarillado de la PISTA INTERIOR del rodamiento.",
  },
  {
    key: "ftf", tag: "MonState_e_f_FTF", grupo: "rodamiento",
    label: "Frecuencia de la jaula (FTF)",
    defecto: "Jaula deformada o rota, o falta de lubricación.",
  },
];

/**
 * ── LA CONFIANZA DE CADA MEDIDA ────────────────────────────────────
 *
 * `QC_vRMS_Sn` y compañía acompañan a cada medida con un número que el módulo
 * usa para decir cuánta confianza tiene en ella. Medido el 26-08-2026: valían
 * **1,000** en todos los canales con la máquina en marcha.
 *
 * Se incorporan porque son la respuesta a la pregunta que el valor solo no
 * contesta: un vRMS de 0,16 mm/s con confianza baja y otro con confianza plena
 * son el mismo número y no significan lo mismo. Qué escala usa exactamente
 * —si 1 es el máximo, o el mínimo aceptable— está sin confirmar, así que aquí
 * sólo se guarda el valor y se avisa cuando se aparta del 1 observado.
 */
export const CALIDADES = [
  { key: "qcVRMS", tag: "QC_vRMS", label: "Confianza de la velocidad eficaz" },
  { key: "qcARMS", tag: "QC_aRMS", label: "Confianza de la aceleración eficaz" },
  { key: "qcDKW", tag: "QC_DKW", label: "Confianza del valor de daño" },
];

/** Valor de `QC_*` observado con la máquina sana. Apartarse de él es la señal. */
export const QC_NOMINAL = 1;

/**
 * ── EL SERVIDOR DE ALARMAS, QUE NO ES LO MISMO QUE `Alarma_Sn` ─────
 *
 * `Alarma_Sn` y `Warning_Sn` son dos booleanos que el PLC publica por canal.
 * Esto es otra cosa: **AlarmWorX**, el servidor de alarmas de ICONICS, con
 * **57 alarmas configuradas** bajo el área `DEMO VIBRACIONES` —una por cada
 * cosa que el SM 1281 sabe vigilar, más los fallos del propio módulo—.
 *
 * Se descubrió porque estaban configuradas y la pantalla no decía ni una
 * palabra de ellas. Entre otras: `Alarm_MonState_e_f_BPFO/BPFI/FTF/BSF`,
 * `Alarm_SensorState`, `Alarm_AtualOpMode`, «Cable roto» ×4, «fallo de la
 * monitorización de vRMS» ×4, «fallo de monitorización del espectro de
 * envolvente» ×4, «Error interno», «Espacio en memoria crítico».
 *
 * ── OJO: HAY UNA CUARTA FRECUENCIA DE RODAMIENTO ───────────────────
 *
 * El servidor de alarmas vigila **BSF** —frecuencia de giro del elemento
 * rodante—, además de BPFO, BPFI y FTF. En el grupo `DEMO 3` del historiador
 * NO existe `MonState_e_f_BSF_Sn`: sólo están las otras tres. Así que hay una
 * vigilancia de rodamiento que el módulo hace y que este catálogo no puede
 * leer, y por eso `VIGILANCIAS` tiene tres filas y no cuatro.
 *
 * ── LO QUE SE PUEDE LEER, Y LO QUE NO ──────────────────────────────
 *
 * Medido el 26-08-2026:
 *
 *   sí   los contadores DEL ÁREA (`ae:/DEMO VIBRACIONES=ActiveUnackedCount`…)
 *   no   el estado de UNA alarma concreta: `.Severity`, `.State`, `.Active` y
 *        los contadores con el nombre de la alarma delante devuelven calidad
 *        mala. La API REST no expone el estado alarma por alarma.
 *   no   el historial (`/AlarmHistory` da 500). El Alarm Historian es otro
 *        subsistema, y está como estaba el Hyper Historian esta mañana.
 *
 * Por eso la pantalla dice CUÁNTAS hay y no CUÁL es cada una. Decir «hay 3
 * alarmas» y callar que no se sabe cuáles sería peor que no decir nada.
 */
export const AREA_ALARMAS = "ae:/DEMO VIBRACIONES";

/**
 * Contadores del área, en vivo.
 *
 * `normalSinReconocer` es el que más se malinterpreta: son alarmas que
 * dispararon y VOLVIERON a normal sin que nadie las reconociera. La máquina ya
 * está bien; lo que queda es la constancia de que pasó algo y nadie lo miró.
 * Contarlas junto a las activas taparía una alarma real entre doce apagadas.
 */
export const CONTADORES_ALARMA = [
  {
    key: "activasSinReconocer", sufijo: "=ActiveUnackedCount",
    label: "Activas sin reconocer", nivel: "critico",
  },
  {
    key: "activasReconocidas", sufijo: "=ActiveAckedCount",
    label: "Activas ya reconocidas", nivel: "atencion",
  },
  {
    key: "normalSinReconocer", sufijo: "=NormalUnackedCount",
    label: "Volvieron a normal sin reconocer", nivel: "informativo",
  },
  {
    key: "severidadActivas", sufijo: "=ActiveUnackedMaxSeverity",
    label: "Severidad máxima activa", nivel: null,
  },
];

/** Nombre completo de un contador de alarmas del área. */
export function puntoAlarma(contadorKey) {
  const c = CONTADORES_ALARMA.find((x) => x.key === contadorKey);
  return c ? `${AREA_ALARMAS}${c.sufijo}` : null;
}

/**
 * ── ISO 10816-1, CLASE I ───────────────────────────────────────────
 *
 * Máquinas pequeñas hasta 15 kW. Este motor son 1,5 kW, así que es Clase I.
 *
 *   ≤ 0,71   A — máquina nueva
 *   ≤ 1,8    B — admisible para servicio prolongado
 *   ≤ 4,5    C — insatisfactoria; sirve para funcionar, no para dejar
 *   > 4,5    D — daño
 *
 * El aviso va en 1,8 y la alarma en 4,5. Que nadie los suba «porque salta
 * mucho»: la banda C ya es una máquina que hay que intervenir.
 */
export const LIMITES_ISO = Object.freeze({ nueva: 0.71, aviso: 1.8, alarma: 4.5 });

/**
 * ── DÓNDE DEJA DE VALER LA NORMA ───────────────────────────────────
 *
 * ISO 10816 evalúa la velocidad eficaz en la banda **10–1000 Hz**, y por eso
 * su criterio sólo aplica a partir de unas 600 rpm: por debajo, la frecuencia
 * de giro cae fuera de la banda y el filtro se come justo la componente de
 * desequilibrio que se quería medir.
 *
 * Esto NO es teoría en esta instalación. El 25-08-2026 el variador entregaba
 * 20,15 Hz y el motor giraba a **604 rpm**.
 *
 * Y aquí hay que ser exacto, porque es fácil pasarse: 604 rpm son 10,07 Hz,
 * o sea que la máquina SÍ está dentro del alcance de la norma. Lo que pasa es
 * que está pegada al borde inferior, y un filtro paso alto no es un muro: en
 * su propia frecuencia de corte ya atenúa unos 3 dB, cerca de un 30 %. La
 * componente de giro —la del desequilibrio, que es la que más pesa en el
 * vRMS— entra en la medida recortada.
 *
 * O sea: a 604 rpm el veredicto de ISO vale, pero va con un margen que no se
 * ve en el número. Decir «la norma no aplica» sería falso; decir «0,23 mm/s,
 * perfecto» sin más sería quedarse corto. Por eso hay DOS umbrales:
 * `RPM_MINIMA_ISO`, por debajo del cual la norma no se pronuncia, y
 * `RPM_BORDE_ISO`, por debajo del cual se pronuncia pero conviene decir en voz
 * alta que la lectura sale recortada.
 */
export const RPM_MINIMA_ISO = 600;

/**
 * Hasta 12 Hz (720 rpm) la frecuencia de giro sigue lo bastante cerca del
 * corte del filtro como para que la atenuación importe. Por encima, la
 * componente de giro entra limpia y el número se puede leer tal cual.
 */
export const RPM_BORDE_ISO = 720;

/** Velocidad mínima que el SIPLUS CMS SM 1281 admite para medir. */
export const RPM_MINIMA_MODULO = 120;

/**
 * En qué zona de ISO 10816-1 Clase I cae una velocidad eficaz.
 *
 * ── POR QUÉ ESTO ES UNA FUNCIÓN Y NO SE DEJA COMPARAR AL QUE PINTA ─
 *
 * Porque quien lee estos datos no siempre es una persona. El asistente recibe
 * las medidas y la norma en la misma respuesta, y medido con el modelo local
 * el resultado fue: «velocidad eficaz 1,13 mm/s, por encima del aviso de 1,8
 * mm/s». Dos errores en una frase —el 1,13 era la aceleración, y 1,13 no está
 * por encima de 1,8— dichos con total aplomo.
 *
 * Dar el número y el umbral por separado es invitar a esa frase. Dando la zona
 * ya resuelta, lo único que queda por hacer es citarla.
 *
 * Devuelve `null` cuando la norma no se ha pronunciado —sin dato, o sin saber
 * si aplica—, y quien lo use tiene que tratarlo como «no evaluado» y no como
 * «bien». Un verde ahí sería la mentira más barata de todo el módulo.
 */
export function bandaISO(vRMS, normaAplicable) {
  if (!Number.isFinite(vRMS) || normaAplicable !== true) return null;
  if (vRMS > LIMITES_ISO.alarma) return { zona: "D", label: "zona D · daño", nivel: "critico" };
  if (vRMS > LIMITES_ISO.aviso) return { zona: "C", label: "zona C · insatisfactoria", nivel: "atencion" };
  if (vRMS > LIMITES_ISO.nueva) return { zona: "B", label: "zona B · admisible", nivel: "ok" };
  return { zona: "A", label: "zona A · como nueva", nivel: "ok" };
}

/**
 * ── EL VARIADOR ────────────────────────────────────────────────────
 *
 * El mismo PLC publica el variador de ESTA máquina. Importa por dos motivos:
 * da la velocidad, sin la cual no se puede saber si la norma aplica; y da el
 * par y la potencia, sin los cuales no se sabe si la máquina estaba trabajando
 * o girando en vacío cuando se tomó la medida.
 *
 * Comprobado en vivo el 25-08-2026: los trece tags responden con calidad buena.
 */
export const VARIADOR = [
  { key: "velocidad", tag: "SPEED_BMS", label: "Velocidad", unidad: "rpm", decimales: 0 },
  { key: "frecuencia", tag: "FREQ OUTPUT_BMS", label: "Frecuencia de salida", unidad: "Hz", decimales: 2 },
  { key: "tensionSalida", tag: "OUTPUT VOLTS_BMS", label: "Tensión de salida", unidad: "V", decimales: 0 },
  { key: "corriente", tag: "CURRENT_BMS", label: "Corriente", unidad: "A", decimales: 2 },
  { key: "par", tag: "TORQUE_BMS", label: "Par", unidad: "%", decimales: 2 },
  { key: "potencia", tag: "ACTUAL PWR_BMS", label: "Potencia", unidad: "kW", decimales: 2 },
  { key: "busCC", tag: "DC BUS VOLTS_BMS", label: "Tensión del bus CC", unidad: "V", decimales: 0 },
  { key: "fallo", tag: "FAULT_BMS", label: "Fallo", unidad: "", decimales: 0 },
  { key: "ultimoFallo", tag: "LAST FAULT_BMS", label: "Último fallo", unidad: "", decimales: 0 },
  { key: "aviso", tag: "WARNING_BMS", label: "Aviso", unidad: "", decimales: 0 },
  { key: "listo", tag: "READY TO RUN_BMS", label: "Listo para arrancar", unidad: "", decimales: 0 },
  { key: "habilitado", tag: "ENABLED_BMS", label: "Habilitado", unidad: "", decimales: 0 },
];

/** Tag del variador por clave. */
export const VARIADOR_POR_CLAVE = Object.fromEntries(VARIADOR.map((v) => [v.key, v]));

/**
 * ── EL MEDIDOR JANITZA NO ESTÁ ENTREGANDO ──────────────────────────
 *
 * Los tags `CMS-*` existen en el grupo, pero el 25-08-2026 **dieciséis de
 * dieciocho devolvían calidad mala** (`0x80000020`): tensiones, corrientes,
 * frecuencia y armónicos, todos sin dato. Sólo respondían dos contadores de
 * energía aparente.
 *
 * Se listan igual, y con la marca puesta, porque la idea de normalizar la
 * vibración por la potencia eléctrica real depende de que esto se arregle.
 * Borrarlos escondería el problema; darlos por buenos sería peor.
 */
export const JANITZA_SIN_DATO = true;

/**
 * Carpeta de un canal dentro de la rama: `ac:TDCON/Motors/01/S1/`.
 *
 * Los tres apoyos son carpetas hermanas y el nombre de la carpeta es el id del
 * canal, no su sufijo — coinciden hoy, pero son dos cosas distintas: el sufijo
 * puede ser irregular (ver `sufijoDe`) y la carpeta nunca lo es.
 */
function carpetaDe(canal) {
  return `${RAIZ_VIB}${canal.id}/`;
}

/**
 * ── UN TAG MAL ESCRITO EN EL SERVIDOR ──────────────────────────────
 *
 * En `S1/` la alarma se llama **`Alarrma_S1`**, con dos erres. En S2 y S3 está
 * bien escrita. Es un error de dedo en la configuración de ICONICS, visto al
 * enumerar el árbol el 27-08-2026.
 *
 * Se respeta aquí por lo mismo que se respetan `MonState_vRMS_2` y
 * `Sensor_state_1` más abajo: escribirlo «bien» pediría un punto que no
 * existe, y el fallo no se vería —la pantalla enseñaría un guión y nadie
 * sabría que el nombre estaba mal armado—.
 *
 * **Es una errata del servidor, no una convención.** Si se corrige allí, esta
 * excepción sobra y hay que quitarla; la prueba de `verificar-riesgos-vibracion`
 * lo detecta porque comprueba el nombre contra el servidor.
 */
const ERRATAS_DEL_SERVIDOR = { Alarma_S1: "Alarrma_S1" };

function comoLoEscribeElServidor(nombre) {
  return ERRATAS_DEL_SERVIDOR[nombre] ?? nombre;
}

/** Nombre completo del punto de una medida en un canal. */
export function puntoMedida(medidaKey, canalId) {
  const m = MEDIDAS.find((x) => x.key === medidaKey);
  const c = CANAL[canalId];
  if (!m || !c) return null;
  return `${carpetaDe(c)}${m.tag}_${c.sufijo}`;
}

/** Nombre completo del punto de una bandera en un canal. */
export function puntoBandera(banderaKey, canalId) {
  const b = BANDERAS.find((x) => x.key === banderaKey);
  const c = CANAL[canalId];
  if (!b || !c) return null;
  return `${carpetaDe(c)}${comoLoEscribeElServidor(`${b.tag}_${c.sufijo}`)}`;
}

/**
 * ── UNA IRREGULARIDAD DEL SERVIDOR, RESPETADA A PROPÓSITO ──────────
 *
 * Casi todos los tags acaban en `_S1`, `_S2`, `_S3`. Dos familias no:
 *
 *   MonState_vRMS_2     en S2 le falta la S. En S1 y S3 sí la lleva.
 *   Sensor_state_1/2/3  usan el número suelto en los tres canales.
 *
 * Está así en el servidor. Corregirlo aquí en silencio pediría un tag que no
 * existe y el punto volvería vacío, que es el fallo que no se nota: la
 * pantalla enseñaría un guión y nadie sabría que el nombre estaba mal armado.
 */
function sufijoDe(tagBase, canal) {
  if (tagBase === "Sensor_state") return canal.sufijo.slice(1);
  if (tagBase === "MonState_vRMS" && canal.id === "S2") return "2";
  return canal.sufijo;
}

/** Nombre completo del punto de una vigilancia en un canal. */
export function puntoVigilancia(vigilanciaKey, canalId) {
  const v = VIGILANCIAS.find((x) => x.key === vigilanciaKey);
  const c = CANAL[canalId];
  if (!v || !c) return null;
  return `${carpetaDe(c)}${v.tag}_${sufijoDe(v.tag, c)}`;
}

/** Nombre completo del punto de una confianza en un canal. */
export function puntoCalidad(calidadKey, canalId) {
  const q = CALIDADES.find((x) => x.key === calidadKey);
  const c = CANAL[canalId];
  if (!q || !c) return null;
  return `${carpetaDe(c)}${q.tag}_${c.sufijo}`;
}

/** Estado del propio sensor (montaje y cableado), por canal. */
export function puntoSensor(canalId) {
  const c = CANAL[canalId];
  return c ? `${carpetaDe(c)}Sensor_state_${sufijoDe("Sensor_state", c)}` : null;
}

/** Nombre completo de un punto del variador, que vive en su propia carpeta. */
export function puntoVariador(key) {
  const v = VARIADOR_POR_CLAVE[key];
  return v ? `${RAIZ_VIB}${CARPETA_VARIADOR}${v.tag}` : null;
}

/**
 * Todos los puntos que hacen falta para evaluar el estado de vibración, para
 * registrarlos de una vez en el motor de sondeo.
 */
export function todosLosPuntos() {
  const puntos = [];
  for (const c of CANALES) {
    for (const m of MEDIDAS) puntos.push(puntoMedida(m.key, c.id));
    for (const b of BANDERAS) puntos.push(puntoBandera(b.key, c.id));
    for (const v of VIGILANCIAS) puntos.push(puntoVigilancia(v.key, c.id));
    for (const q of CALIDADES) puntos.push(puntoCalidad(q.key, c.id));
    puntos.push(puntoSensor(c.id));
  }
  for (const v of VARIADOR) puntos.push(puntoVariador(v.key));
  for (const a of CONTADORES_ALARMA) puntos.push(puntoAlarma(a.key));
  return puntos;
}

/**
 * Punto → `{ tipo, medida|bandera|variador, canal }`. Devuelve `null` ante
 * cualquier punto que no reconozca, para que un cambio en el servidor se vea
 * como dato ausente y nunca como una asignación a la señal equivocada.
 */
/*
 * El mapa inverso se CONSTRUYE con los mismos generadores de nombre, en vez de
 * volver a deducir el sufijo al revés. Así `parsePunto` es el inverso exacto
 * por construcción, incluidas las dos irregularidades de `sufijoDe`: si mañana
 * aparece una tercera, entra sola en los dos sentidos.
 */
const POR_PUNTO = (() => {
  const mapa = new Map();
  for (const c of CANALES) {
    for (const m of MEDIDAS) mapa.set(puntoMedida(m.key, c.id), { tipo: "medida", clave: m.key, canal: c.id });
    for (const b of BANDERAS) mapa.set(puntoBandera(b.key, c.id), { tipo: "bandera", clave: b.key, canal: c.id });
    for (const v of VIGILANCIAS) mapa.set(puntoVigilancia(v.key, c.id), { tipo: "vigilancia", clave: v.key, canal: c.id });
    for (const q of CALIDADES) mapa.set(puntoCalidad(q.key, c.id), { tipo: "calidad", clave: q.key, canal: c.id });
    mapa.set(puntoSensor(c.id), { tipo: "sensor", clave: "sensor", canal: c.id });
  }
  for (const v of VARIADOR) mapa.set(puntoVariador(v.key), { tipo: "variador", clave: v.key, canal: null });
  for (const a of CONTADORES_ALARMA) mapa.set(puntoAlarma(a.key), { tipo: "alarma", clave: a.key, canal: null });
  return mapa;
})();

export function parsePunto(nombre) {
  if (typeof nombre !== "string") return null;
  return POR_PUNTO.get(nombre) ?? null;
}

/**
 * Ninguna señal de este catálogo tiene serie propia hoy. Existe como función
 * —y no como constante `false`— para que el día que se active el registro del
 * grupo el cambio sea de una línea y no una búsqueda por todo el módulo.
 */
export const esHistorizada = () => false;
