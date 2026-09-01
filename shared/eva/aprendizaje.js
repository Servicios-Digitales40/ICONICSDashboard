/**
 * Lo que el asistente ha aprendido de esta planta, y lo que propone aprender.
 *
 * ── EL PROBLEMA QUE RESUELVE ───────────────────────────────────────
 *
 * El modelo no tiene memoria. Cada conversación empieza en blanco: se le puede
 * explicar la instalación entera hoy y mañana no sabrá nada. Lo que en la
 * práctica hace de «aprender» es esto — un sitio donde se acumula lo
 * CONFIRMADO, que se le entrega en cada petición.
 *
 * Aquí viven las cosas que en esta planta costaron días de averiguar y que no
 * se deducen mirando el servidor: que hay tres sensores y no dos, que el grupo
 * del historiador lleva un espacio en el nombre, que la red es 208Y/120 y la
 * señal mide una línea contra neutro.
 *
 * ── LAS DOS MITADES, Y POR QUÉ NO SE MEZCLAN ───────────────────────
 *
 *   HECHOS      lo confirmado. El asistente los da por buenos y los cita.
 *   PROPUESTAS  lo que el asistente ha observado y cree que podría ser una
 *               regla. NO se aplican. Esperan a que alguien las apruebe.
 *
 * ── POR QUÉ UNA PROPUESTA NO SE CONVIERTE SOLA EN REGLA ────────────
 *
 * Porque estas reglas deciden si una pantalla de planta dice «riesgo de
 * derrame», y los dos errores cuestan en direcciones opuestas: una regla
 * inventada que salta sin motivo se desactiva a la semana y se lleva por
 * delante la credibilidad de las que sí valen; una que calle cuando debía
 * hablar deja tranquilo a quien no debería estarlo.
 *
 * Y hay una razón medida, no teórica: contra este mismo servidor, el modelo
 * local dijo tres veces seguidas «velocidad eficaz 1,13 mm/s» leyendo la
 * ACELERACIÓN —otra magnitud, otras unidades— con total aplomo. Quien confunde
 * un campo no puede firmar el criterio con el que se para una bomba.
 *
 * Lo que sí puede, y es útil de verdad: mirar semanas de datos, ver un patrón
 * que a nadie se le había ocurrido, y redactarlo con su evidencia para que una
 * persona lo juzgue en treinta segundos en vez de descubrirlo en seis meses.
 *
 * ── CÓMO SE CIERRA EL CICLO ────────────────────────────────────────
 *
 *   1. el asistente observa y llama a `proponer_regla`
 *   2. queda aquí, en estado `pendiente`
 *   3. una persona la revisa:  node scripts/revisar-propuestas.mjs
 *   4. si la aprueba, se escribe como regla en `riesgos.js` CON SU PRUEBA
 *   5. la propuesta pasa a `aplicada` y deja de proponerse
 *
 * El paso 4 es a mano y a propósito. Una regla sin prueba es una regla que
 * nadie ha comprobado que dispare cuando debe y calle cuando no.
 */

/** Estados por los que pasa una propuesta. */
export const ESTADOS = ["pendiente", "aprobada", "rechazada", "aplicada"];

/** Forma vacía del almacén, para cuando el archivo aún no existe. */
export const VACIO = { version: 1, hechos: [], propuestas: [], intervenciones: [] };

/**
 * ── HECHOS QUE VIENEN DE FÁBRICA ───────────────────────────────────
 *
 * Lo que se confirmó durante la puesta en marcha. Van en el código y no en el
 * archivo de datos porque son el punto de partida de CUALQUIER instalación de
 * este tablero: si alguien borra `datos/aprendizaje.json`, esto sigue.
 *
 * Cada uno lleva de dónde salió. Un hecho sin origen es indistinguible de una
 * suposición que alguien escribió con seguridad.
 */
export const HECHOS_INICIALES = [
  {
    id: "dos-sistemas",
    sistema: null,
    hecho:
      "La planta tiene DOS instalaciones separadas: el tanque con su grupo de bombeo, y el " +
      "sistema de vibraciones. Cada una con su propio motor, variador y PLC.",
    origen: "Confirmado por el usuario el 25-08-2026",
  },
  {
    id: "tres-sensores",
    sistema: "vibraciones",
    hecho:
      "Hay TRES acelerómetros, no dos: lado acople (100,05 mV/g), rodamiento intermedio " +
      "(99 mV/g) y lado libre (100 mV/g). Cada uno con su calibración propia.",
    origen: "Medido contra el servidor y confirmado por el usuario el 26-08-2026",
  },
  {
    id: "vibraciones-se-leen-en-vivo",
    sistema: "vibraciones",
    hecho:
      "Las medidas de vibración se leen EN VIVO del árbol de activos, en «ac:TDCON/Motors/01/», " +
      "con una carpeta por apoyo (S1, S2, S3) y otra para el variador (V20). NO se leen del " +
      "historiador: dos puntos («DKW_S1» sin muestras y «MonState_v_f_S3» ni declarado) hacían " +
      "esperar 5 segundos al lote entero y volvían sin valor.",
    origen: "Medido el 27-08-2026",
  },
  {
    id: "grupo-con-espacio",
    sistema: "vibraciones",
    hecho:
      "El grupo del historiador se llama «DEMO 3», CON espacio. Pedirlo como «DEMO3» " +
      "devuelve HTTP 500 y parece que el tag no existe. Ese grupo es para las SERIES; " +
      "el valor del momento no sale de ahí.",
    origen: "Medido el 26-08-2026, matizado el 27-08-2026",
  },
  {
    id: "red-208y120",
    sistema: "tanque",
    hecho:
      "La red es 208Y/120 y la señal de tensión mide UNA línea contra neutro, por eso lee " +
      "121-127 V y no 208. El nominal que aplica a los umbrales es 120 V.",
    origen: "Confirmado por el usuario el 25-08-2026",
  },
  {
    id: "rodamientos-sin-vigilar",
    sistema: "vibraciones",
    hecho:
      "El diagnóstico de rodamientos del módulo (BPFO, BPFI, FTF) está APAGADO en los tres " +
      "apoyos. Necesita la geometría del rodamiento para poder calcular esas frecuencias.",
    origen: "Medido el 26-08-2026",
  },
];

/** Normaliza lo leído de disco, tolerando un archivo a medias o corrupto. */
export function normalizarAlmacen(bruto) {
  const hechos = Array.isArray(bruto?.hechos) ? bruto.hechos : [];
  const propuestas = Array.isArray(bruto?.propuestas) ? bruto.propuestas : [];
  const intervenciones = Array.isArray(bruto?.intervenciones) ? bruto.intervenciones : [];
  return {
    version: 1,
    hechos: hechos.filter((h) => h && typeof h.hecho === "string"),
    propuestas: propuestas.filter((p) => p && typeof p.titulo === "string"),
    intervenciones: intervenciones.filter((i) => i && typeof i.sintoma === "string"),
  };
}

/**
 * ── LA BITÁCORA: QUÉ SE HIZO, NO QUÉ ES LA INSTALACIÓN ─────────────
 *
 * Un HECHO describe cómo es la planta: «el sensor S3 es de 100 mV/g». Una
 * INTERVENCIÓN describe qué le pasó y qué se hizo: «el pico del lado acople
 * copiaba el eficaz; se cambió tal cosa en el servidor web y quedó».
 *
 * Son cosas distintas y por eso no comparten lista. Un hecho es permanente
 * hasta que alguien lo corrija; una intervención está fechada y no se corrige
 * nunca —lo que pasó, pasó—, y su valor está justo en poder leerla dentro de
 * seis meses cuando el mismo síntoma vuelva.
 *
 * Es lo que en una planta se llama historial de mantenimiento, y es lo primero
 * que se pierde cuando la persona que arregló algo se va o simplemente lo
 * olvida. La única forma de que no se pierda es que anotarlo cueste una frase
 * dicha en voz alta.
 *
 * `resuelto` puede ser `false` a propósito: un intento que NO funcionó vale
 * tanto como uno que sí. Ahorra repetirlo.
 *
 * ── LOS CAMPOS DE PLAN 16 FASE 5, Y POR QUÉ SON OPCIONALES ─────────
 *
 * `disparador`, `muestraSensores`, `diagnostico`, `causaReal`, `resultado` y
 * `diagnosticoCorrecto` extienden el esquema —ver §4 del plan— para el
 * CIERRE DE DIAGNÓSTICO: la persona que acaba de intervenir sobre un riesgo
 * concreto, con la muestra de sensores y la causa propuesta ya puestas por
 * el sistema, confirma o corrige la causa REAL y cómo terminó.
 *
 * Por voz o chat (`registrar_intervencion`) nunca llegan: nadie dicta una
 * muestra de sensores ni el desglose de un diagnóstico. Por eso son
 * opcionales y no un segundo esquema — «las dos puertas escriben en el
 * mismo sitio» (Plan 16 §5, Fase 5): la puerta rápida rellena lo de
 * siempre, la puerta del cierre rellena además lo nuevo, y las dos
 * conviven en la misma `intervenciones[]` sin que `normalizarAlmacen`, ni
 * `textoDeRecuperacion`, ni `hechos_de_la_planta` necesiten saber cuál usó
 * cada una.
 *
 * `solucion` sigue siendo el texto plano de siempre y NO el objeto
 * `{accion, texto}` del jsonc de §4: cambiar su forma habría roto todo lo
 * que ya lo lee como cadena —`textoDeRecuperacion`, `hechos_de_la_planta`,
 * cada intervención ya guardada—. `causaReal` cubre lo que ese objeto
 * aportaba de más (un `tipo` estructurado, pensado para apuntar al `id` de
 * una causa de `causas.js`) sin tocar un campo que ya funciona.
 */
export function crearIntervencion(datos, ahora = new Date()) {
  return {
    /*
     * El sufijo aleatorio no es cosmético: sin él, dos intervenciones
     * creadas en el MISMO milisegundo comparten id —medido, ocurre al
     * registrar dos casos de sonda seguidos en una prueba, y nada impide
     * que ocurra en producción con dos conversaciones a la vez—. Plan 16
     * Fase 2 empezó a usar `id` como clave de un `Map` en `casos.mjs`: con
     * el id repetido, la segunda intervención pisaba a la primera en
     * silencio, sin ningún error, y esa primera desaparecía del índice de
     * casos aunque siguiera intacta en `aprendizaje.json`.
     */
    id: `interv-${ahora.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    fecha: ahora.toISOString(),
    sistema: datos.sistema ?? null,
    sintoma: String(datos.sintoma),
    causa: datos.causa ? String(datos.causa) : null,
    solucion: String(datos.solucion),
    /* Por defecto se da por resuelta: quien lo cuenta suele contarlo porque
       funcionó. Un intento fallido hay que declararlo, y por eso la
       herramienta lo pregunta. */
    resuelto: datos.resuelto !== false,
    origen: datos.origen ?? "el usuario",
    // Cada uno viaja sólo si llegó: un `null` a secas se confundiría con
    // «se preguntó y no había», cuando lo cierto es que ni se preguntó.
    ...(datos.disparador ? { disparador: { ...datos.disparador } } : {}),
    ...(datos.muestraSensores ? { muestraSensores: { ...datos.muestraSensores } } : {}),
    ...(datos.diagnostico ? { diagnostico: { ...datos.diagnostico } } : {}),
    ...(datos.causaReal ? { causaReal: { ...datos.causaReal } } : {}),
    ...(datos.resultado ? { resultado: { ...datos.resultado } } : {}),
    ...(typeof datos.diagnosticoCorrecto === "boolean"
      ? { diagnosticoCorrecto: datos.diagnosticoCorrecto }
      : {}),
  };
}

/** Las intervenciones, de la más reciente a la más antigua. */
export function intervencionesRecientes(almacen, cuantas = 10) {
  return [...(almacen?.intervenciones ?? [])]
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .slice(0, cuantas);
}

/**
 * Los hechos que el asistente debe conocer: los de fábrica más los aprendidos.
 *
 * Los aprendidos van DESPUÉS a propósito. Si alguien confirma algo que
 * contradice un hecho inicial, lo último dicho es lo que manda, y se ve en el
 * orden en vez de esconderse en una fusión silenciosa.
 */
export function hechosVigentes(almacen) {
  return [...HECHOS_INICIALES, ...(almacen?.hechos ?? [])];
}

/** Sólo las propuestas que esperan revisión. */
export function pendientes(almacen) {
  return (almacen?.propuestas ?? []).filter((p) => p.estado === "pendiente");
}

/**
 * ¿Es una propuesta utilizable?
 *
 * Se exige EVIDENCIA con datos, y no sólo una idea. Una propuesta sin cifras
 * no se puede revisar: quien la lea tendría que ir a buscar los datos él
 * mismo, y entonces la propuesta no le ha ahorrado nada.
 */
export function validarPropuesta(p) {
  const faltan = [];
  if (!p?.titulo || p.titulo.length < 10) faltan.push("titulo");
  if (!p?.condicion || p.condicion.length < 10) faltan.push("condicion");
  if (!p?.evidencia || p.evidencia.length < 20) faltan.push("evidencia");
  if (!p?.consecuencia || p.consecuencia.length < 20) faltan.push("consecuencia");
  if (!["critico", "atencion", "informativo"].includes(p?.severidad)) faltan.push("severidad");
  if (!Array.isArray(p?.senales) || p.senales.length === 0) faltan.push("senales");
  return { ok: faltan.length === 0, faltan };
}

/**
 * Una propuesta nueva, lista para guardar.
 *
 * `estado` nace SIEMPRE en `pendiente` y no se acepta del que llama: si el
 * asistente pudiera decidir el estado, podría marcarla como aprobada, y la
 * revisión humana dejaría de existir sin que nadie lo notara.
 */
export function crearPropuesta(datos, ahora = new Date()) {
  return {
    id: `prop-${ahora.getTime().toString(36)}`,
    creada: ahora.toISOString(),
    estado: "pendiente",
    titulo: String(datos.titulo),
    sistema: datos.sistema ?? null,
    severidad: datos.severidad,
    condicion: String(datos.condicion),
    senales: [...datos.senales],
    evidencia: String(datos.evidencia),
    consecuencia: String(datos.consecuencia),
    accion: datos.accion ? String(datos.accion) : null,
    /* Quién la propuso. Una propuesta del modelo y una escrita por un técnico
       no merecen el mismo grado de confianza al revisarlas. */
    origen: datos.origen ?? "asistente",
  };
}

/** Un hecho nuevo, confirmado por una persona. */
export function crearHecho(datos, ahora = new Date()) {
  return {
    id: `hecho-${ahora.getTime().toString(36)}`,
    registrado: ahora.toISOString(),
    sistema: datos.sistema ?? null,
    hecho: String(datos.hecho),
    /*
     * Sin `origen` no se guarda. Es la diferencia entre «lo dijo quien opera la
     * instalación» y «lo dedujo el modelo de tres lecturas»: dentro de un mes,
     * leídos los dos en la misma lista, no habría forma de distinguirlos.
     */
    origen: String(datos.origen),
  };
}
