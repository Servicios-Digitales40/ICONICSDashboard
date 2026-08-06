/**
 * Máquinas/equipos monitoreados, agrupadas por área.
 *
 * Módulo heredado: las vistas de producción no lo leen, consumen
 * `lib/datasource`. Se conserva porque `demoSource` lo usa como origen de los
 * datos de ejemplo y porque los prototipos de `src/prototypes/` —que sólo se
 * cargan en el build de demo— lo importan directamente con el vocabulario
 * anterior (area1/area2, estados en español).
 *
 * Cada máquina tiene un `id` estable con el que la resuelve la vista de
 * detalle. El OEE no se guarda: se calcula desde D × R × C.
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
  // Esta clave no es un área: la lee `getMachinesByArea("sandbox")` desde
  // `prototypes/SandboxPage.jsx` para pintar todas las propuestas con la misma
  // máquina, y se borra cuando se borren los prototipos.
  //
  // Duplica el id "a1-1" de area1, que lo tapa porque `getMachineById` recorre
  // las claves en orden; el efecto secundario es que cualquier consumidor de
  // `Object.keys(MACHINES)` ve "sandbox" como un área más. Los prototipos sólo
  // se cargan en el build de demo, pero este dato viaja igual en los dos: es
  // una constante de un módulo que `demoSource` ya importa.
  sandbox: [
    { id: "a1-1", estado: "Mantenimiento Correctivo", noParte: 1, equipo: "Lineal 1", aprobadas: 850, rechazadas: 150, disponibilidad: 71.43, calidad: 85.0, rendimiento: 62.5, tiempoMuerto: 2 },
  ],
};

/** Etiqueta legible de cada área (para títulos/breadcrumbs). */
export const AREA_LABELS = {
  area1: "Área 1",
  area2: "Área 2",
};

/**
 * Color de cada estado como nombre de token del tema, no un hex: quien pinta
 * resuelve `theme[token]` y funciona en claro y en oscuro.
 *
 *   verde → operando                   ámbar   → falla no prevista
 *   azul  → intervención prevista      violeta → limpieza
 *   gris  → inactivo por descanso      coral   → detención crítica
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

/*
 * Historial simulado por máquina, para las gráficas del detalle.
 *
 * El PLC solo entrega un valor instantáneo por métrica, así que la serie es
 * pseudo-aleatoria pero determinista: la misma máquina produce siempre la
 * misma, y el último punto coincide con el valor actual para que la gráfica y
 * el gauge cuenten lo mismo.
 *
 * Con histórico real basta sustituir `getMachineHistory` por la consulta
 * correspondiente; las subvistas del detalle no cambian.
 */

// PRNG determinista a partir de una cadena semilla (xmur3 + mulberry32).
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
 * Serie horaria alrededor de unos valores base, con semilla fija para que sea
 * estable. El ruido se atenúa hacia el final y el último punto ancla
 * exactamente a los valores base.
 */
function buildHourly(seedKey, base, points = 12) {
  const rnd = seeded(seedKey);
  const out = [];
  for (let i = 0; i < points; i++) {
    const isLast = i === points - 1;
    // De 0 al inicio a 1 al final: reduce el ruido al acercarse al ancla.
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
 * Serie horaria de una máquina en vivo. El último punto ancla al valor actual,
 * de modo que gráfica y gauge coinciden.
 */
export function getMachineHistory(machine, points = 12) {
  return buildHourly(machine.id, machine, points);
}

/**
 * Instantánea de una máquina para una fecha concreta (YYYY-MM-DD), base del
 * comparativo. Determinista por `id + fecha`, así que la misma fecha devuelve
 * siempre la misma foto. Las piezas se derivan de la calidad de ese día.
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

  // Acepta las dos formas del campo: `tiempoMuerto` (minutos) del mock
  // heredado y `tMuerto` (segundos) del dominio. Sin este puente,
  // `undefined + n` daría NaN y se propagaría en silencio.
  const base = machine.tiempoMuerto ?? (machine.tMuerto != null ? machine.tMuerto / 60 : 0);
  const tiempoMuerto = Math.max(0, Math.round(base + (rnd() - 0.5) * 6));

  return { disponibilidad, rendimiento, calidad, oee, aprobadas, rechazadas, tiempoMuerto };
}

/** Serie horaria de una máquina para una fecha concreta (para el comparativo). */
export function getMachineHistoryForDate(machine, dateStr, points = 12) {
  return buildHourly(`${machine.id}:${dateStr}`, getMachineSnapshot(machine, dateStr), points);
}
