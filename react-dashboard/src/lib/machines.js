/**
 * lib/machines.js
 * ------------------------------------------------------------------
 * Fuente ÚNICA de las máquinas/equipos monitoreados, agrupadas por área.
 *
 * Vive en `lib/` (infraestructura compartida) y NO dentro de
 * `features/machines/`, por el mismo motivo que el cliente ICONICS: lo
 * consumen varios features —`machines` y `sankey`— además de los
 * prototipos. Meterlo dentro de uno crearía una arista cruzada entre
 * features, que es justo lo que la estructura modular existe para evitar.
 *
 * ⚠ ESTE ES YA UN MÓDULO HEREDADO. Las vistas de producción NO lo leen:
 * consumen `lib/datasource`, que entrega máquinas en la forma `Machine`
 * del dominio y decide si vienen de ICONICS o del modo demo.
 *
 * Se conserva intacto a propósito, por dos motivos:
 *   · `demoSource` lo usa como origen de los datos de ejemplo, y por eso
 *     el modo demo enseña exactamente las mismas cifras de siempre;
 *   · los 11 prototipos de `src/prototypes/` lo importan directamente y
 *     siguen hablando el vocabulario anterior (area1/area2, estados en
 *     español). Cambiar su API los rompería a todos.
 *
 * Al retirar `src/prototypes/` este archivo se puede reducir a los datos
 * que necesite `demoSource`.
 *
 * Cada máquina tiene un `id` estable y único en toda la app, con el
 * que la vista de detalle la resuelve. El OEE NO se guarda: se calcula
 * en GaugeCard desde Disponibilidad × Rendimiento × Calidad.
 */

export const MACHINES = {
  area1: [
    { id: "a1-1", estado: "Mantenimiento Correctivo", noParte: 1, equipo: "Lineal 1", aprobadas: 850, rechazadas: 150, disponibilidad: 71.43, calidad: 85.0, rendimiento: 62.5, tiempoMuerto: 2 },
    { id: "a1-2", estado: "Operando", noParte: 2, equipo: "Lineal 2", aprobadas: 920, rechazadas: 80, disponibilidad: 78.57, calidad: 92.0, rendimiento: 70.0, tiempoMuerto: 1 },
    { id: "a1-3", estado: "Operando", noParte: 3, equipo: "Lineal 3", aprobadas: 980, rechazadas: 20, disponibilidad: 85.71, calidad: 98.0, rendimiento: 70.0, tiempoMuerto: 2 },
    { id: "a1-4", estado: "Limpieza", noParte: 4, equipo: "Lineal 4", aprobadas: 700, rechazadas: 300, disponibilidad: 92.86, calidad: 70.0, rendimiento: 83.33, tiempoMuerto: 1 },
    { id: "a1-5", estado: "Paro de Emergencia", noParte: 5, equipo: "Lineal 5", aprobadas: 850, rechazadas: 50, disponibilidad: 95.24, calidad: 94.44, rendimiento: 86.81, tiempoMuerto: 4 },
    { id: "a1-6", estado: "Receso", noParte: 6, equipo: "Lineal 6", aprobadas: 1000, rechazadas: 0, disponibilidad: 97.62, calidad: 100.0, rendimiento: 76.39, tiempoMuerto: 7 },
    { id: "a1-7", estado: "Mantenimiento Preventivo", noParte: 7, equipo: "Lineal 7", aprobadas: 950, rechazadas: 50, disponibilidad: 78.57, calidad: 95.0, rendimiento: 72.92, tiempoMuerto: 5 },
  ],
  area2: [
    { id: "a2-1", estado: "Mantenimiento Correctivo", noParte: 1, equipo: "Multi 10", aprobadas: 400, rechazadas: 600, disponibilidad: 71.43, calidad: 85.0, rendimiento: 62.5, tiempoMuerto: 2 },
    { id: "a2-2", estado: "Operando", noParte: 2, equipo: "Multi 11", aprobadas: 600, rechazadas: 400, disponibilidad: 82.0, calidad: 88.0, rendimiento: 75.0, tiempoMuerto: 1 },
    { id: "a2-3", estado: "Operando", noParte: 3, equipo: "Multi 13", aprobadas: 800, rechazadas: 200, disponibilidad: 92.0, calidad: 95.0, rendimiento: 88.0, tiempoMuerto: 2 },
  ],
  // TODO(prototypes): clave que NO es un área. La lee `getMachinesByArea("sandbox")`
  // desde `prototypes/SandboxPage.jsx` para pintar todas las propuestas con la
  // misma máquina. Se borra junto con `src/prototypes/` — ver el README de esa
  // carpeta. Ojo: duplica el id "a1-1" de area1, y como `getMachineById` recorre
  // las claves en orden, el de area1 lo tapa. Inofensivo hoy, pero significa que
  // cualquier consumidor de Object.keys(MACHINES) verá "sandbox" como si fuese
  // un área más.
  sandbox: [
        { id: "a1-1", estado: "Mantenimiento Correctivo", noParte: 1, equipo: "Lineal 1", aprobadas: 850, rechazadas: 150, disponibilidad: 71.43, calidad: 85.0, rendimiento: 62.5, tiempoMuerto: 2 }
  ]
};

/** Etiqueta legible de cada área (para títulos/breadcrumbs). */
export const AREA_LABELS = {
  area1: "Área 1",
  area2: "Área 2",
};

/**
 * Semántica de color de cada estado, como NOMBRE DE TOKEN del tema (no un
 * hex): quien pinta resuelve `theme[token]` y así funciona en claro y en
 * oscuro. Lectura rápida en piso de planta:
 *   verde  → operando          ámbar   → falla no prevista (correctivo)
 *   azul   → intervención prevista     violeta → limpieza
 *   gris   → inactivo por descanso     coral   → detención crítica
 *
 * TODO: `GaugeCard` mantiene su propio mapa equivalente (con iconos). Al
 * tocarlo, que lea de aquí para que no puedan divergir.
 */
export const ESTADO_TOKEN = {
  "Operando": "success",
  "Mantenimiento Correctivo": "amber",
  "Mantenimiento Preventivo": "accent",
  "Limpieza": "violet",
  "Receso": "textSoft",
  "Paro de Emergencia": "coral",
};

/** Devuelve las máquinas de un área (arreglo vacío si no existe). */
export function getMachinesByArea(areaId) {
  return MACHINES[areaId] ?? [];
}

/**
 * Resuelve una máquina por su id global, sin importar el área.
 * Devuelve { machine, areaId } o null si no se encuentra.
 */
export function getMachineById(id) {
  for (const areaId of Object.keys(MACHINES)) {
    const machine = MACHINES[areaId].find((m) => m.id === id);
    if (machine) return { machine, areaId };
  }
  return null;
}

/** Calcula el OEE (%) de una máquina: D × R × C / 10000. */
export function calcOEE({ disponibilidad, rendimiento, calidad }) {
  return (disponibilidad * rendimiento * calidad) / 10000;
}

/* ------------------------------------------------------------------
 * Historial simulado por máquina (para las gráficas del detalle).
 *
 * Hoy la API/PLC solo entrega un valor "instantáneo" por métrica. Para
 * poder graficar tendencias, generamos un historial PSEUDO-aleatorio
 * pero DETERMINISTA: la misma máquina produce siempre la misma serie
 * (no "salta" entre renders) y el ÚLTIMO punto coincide con el valor
 * real actual, de modo que la gráfica y el gauge cuentan lo mismo.
 *
 * Cuando exista histórico real, reemplaza `getMachineHistory` por la
 * consulta correspondiente; las subvistas del detalle no cambian.
 * ------------------------------------------------------------------ */

// PRNG determinista a partir de una cadena semilla (variante xmur3+mulberry32).
function seeded(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const clamp100 = (v) => Math.max(0, Math.min(100, v));

/**
 * Construye una serie horaria alrededor de unos valores base, con una
 * semilla dada (para que sea estable). El ruido se atenúa hacia el final
 * y el último punto ancla exactamente a los valores base.
 */
function buildHourly(seedKey, base, points = 12) {
  const rnd = seeded(seedKey);
  const out = [];
  for (let i = 0; i < points; i++) {
    const isLast = i === points - 1;
    // conv: 0 al inicio → 1 al final; reduce el ruido conforme se acerca al ancla.
    const conv = points > 1 ? i / (points - 1) : 1;
    const jitter = (b) => clamp100(b + (rnd() - 0.5) * 16 * (1 - conv * 0.65));

    const d = isLast ? base.disponibilidad : jitter(base.disponibilidad);
    const c = isLast ? base.calidad : jitter(base.calidad);
    const r = isLast ? base.rendimiento : jitter(base.rendimiento);

    out.push({
      t: `${String((8 + i) % 24).padStart(2, "0")}:00`,
      disponibilidad: +d.toFixed(1),
      calidad: +c.toFixed(1),
      rendimiento: +r.toFixed(1),
      oee: +((d * r * c) / 10000).toFixed(1),
    });
  }
  return out;
}

/**
 * Serie temporal por hora para una máquina (valor "en vivo"). El último
 * punto ancla al valor real actual, de modo que gráfica y gauge coinciden.
 */
export function getMachineHistory(machine, points = 12) {
  return buildHourly(machine.id, machine, points);
}

/**
 * Instantánea de una máquina para una FECHA concreta (YYYY-MM-DD).
 * Determinista por `id + fecha`: la misma fecha devuelve siempre la misma
 * foto, pero fechas distintas varían de forma realista. Las piezas se
 * derivan de la calidad de ese día. Es la base del comparativo por fechas.
 */
export function getMachineSnapshot(machine, dateStr) {
  const rnd = seeded(`${machine.id}:${dateStr}`);
  const vary = (base, spread = 20) => clamp100(base + (rnd() - 0.5) * spread);

  const disponibilidad = +vary(machine.disponibilidad).toFixed(1);
  const rendimiento = +vary(machine.rendimiento).toFixed(1);
  const calidad = +vary(machine.calidad).toFixed(1);
  const oee = +((disponibilidad * rendimiento * calidad) / 10000).toFixed(1);

  const total = machine.aprobadas + machine.rechazadas;
  const aprobadas = Math.round((total * calidad) / 100);
  const rechazadas = total - aprobadas;

  // Acepta las dos formas del campo: `tiempoMuerto` (minutos) es la del
  // mock heredado que consumen los prototipos; `tMuerto` (segundos) es la
  // del dominio, que llega desde el comparativo del detalle. Sin este
  // puente, `undefined + n` daría NaN y se propagaría en silencio.
  const base = machine.tiempoMuerto ?? (machine.tMuerto != null ? machine.tMuerto / 60 : 0);
  const tiempoMuerto = Math.max(0, Math.round(base + (rnd() - 0.5) * 6));

  return { disponibilidad, rendimiento, calidad, oee, aprobadas, rechazadas, tiempoMuerto };
}

/** Serie horaria de una máquina para una fecha concreta (para el comparativo). */
export function getMachineHistoryForDate(machine, dateStr, points = 12) {
  return buildHourly(`${machine.id}:${dateStr}`, getMachineSnapshot(machine, dateStr), points);
}
