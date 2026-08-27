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
export const VACIO = { version: 1, hechos: [], propuestas: [] };

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
    id: "grupo-con-espacio",
    sistema: "vibraciones",
    hecho:
      "El grupo del historiador se llama «DEMO 3», CON espacio. Pedirlo como «DEMO3» " +
      "devuelve HTTP 500 y parece que el tag no existe.",
    origen: "Medido el 26-08-2026",
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
  return {
    version: 1,
    hechos: hechos.filter((h) => h && typeof h.hecho === "string"),
    propuestas: propuestas.filter((p) => p && typeof p.titulo === "string"),
  };
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
