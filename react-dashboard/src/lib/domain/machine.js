/**
 * La forma `Machine`: el único vocabulario que conocen las vistas.
 *
 * Se define desde lo que el servidor ofrece y no desde lo que la UI usa hoy;
 * congelarla según la pantalla actual obligaría a tocar las dos fuentes y el
 * normalizador cada vez que apareciera un dato nuevo.
 *
 * Todo campo numérico es `number | null`, donde `null` significa «no hay
 * medición» y las vistas pintan un hueco, nunca un cero. Se pierde un dato de
 * dos maneras, y ambas acaban en `null`:
 *
 *  - Mala calidad, que ya filtró el adaptador de ICONICS (ver quality.js).
 *  - Aritmética inválida (`NaN` o `Infinity`). El servidor calcula `OEE_Cal`
 *    como (Pz_OK / Prod_Real_Total) × 100 sin proteger la división, así que a
 *    inicio de turno desborda y un solo NaN contaminaría el resumen de la
 *    planta entera.
 *
 * Por eso el saneamiento vive aquí, en la frontera, y no en las vistas.
 */
import { estadoFromCode, ESTADOS } from "./estado.js";

/**
 * Convierte a número utilizable o a `null`.
 * `Number.isFinite` descarta de una vez NaN, Infinity, null, undefined,
 * cadenas vacías y objetos.
 */
export function toNumber(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Texto no vacío o `null`. */
export function toText(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

/** ¿Hay medición? Se usa en las vistas antes de formatear. */
export const hasValue = (v) => v !== null && v !== undefined;

/**
 * OEE a partir de sus tres factores, en %. Devuelve `null` si falta alguno:
 * un OEE calculado con un factor ausente sería un número inventado.
 */
export function calcOEE({ disponibilidad, rendimiento, calidad }) {
  if (!hasValue(disponibilidad) || !hasValue(rendimiento) || !hasValue(calidad)) return null;
  const oee = (disponibilidad * rendimiento * calidad) / 10000;
  return Number.isFinite(oee) ? oee : null;
}

/**
 * Construye una `Machine` normalizada.
 *
 * `readings` llega ya filtrado por calidad: cada clave es un campo de
 * dominio y su valor es el crudo del servidor o `null`.
 *
 * Las dos derivaciones son conservadoras a propósito, para no rellenar nunca
 * un hueco con una estimación: `producidas` cae a aprobadas + rechazadas solo
 * si ambas existen, y `oee` se recalcula desde los factores solo si el
 * servidor no lo dio.
 */
export function createMachine({ id, areaId, machineId, equipo, readings = {}, receivedAt = null, stale = false }) {
  const disponibilidad = toNumber(readings.disponibilidad);
  const rendimiento = toNumber(readings.rendimiento);
  const calidad = toNumber(readings.calidad);

  const aprobadas = toNumber(readings.aprobadas);
  const rechazadas = toNumber(readings.rechazadas);

  const producidasLeidas = toNumber(readings.producidas);
  const producidas =
    hasValue(producidasLeidas) ? producidasLeidas
    : hasValue(aprobadas) && hasValue(rechazadas) ? aprobadas + rechazadas
    : null;

  const oeeLeido = toNumber(readings.oee);
  const oee = hasValue(oeeLeido) ? oeeLeido : calcOEE({ disponibilidad, rendimiento, calidad });

  return {
    id,
    areaId,
    machineId,
    equipo,

    // `estado` nunca es null: la ausencia de dato es un estado en sí misma
    // (`unknown`), así que las vistas no necesitan un camino especial.
    estado: estadoFromCode(toNumber(readings.estado)),
    modelo: toText(readings.modelo),

    oee,
    disponibilidad,
    rendimiento,
    calidad,

    aprobadas,
    rechazadas,
    producidas,

    // Tiempos, todos en segundos tal y como los entrega ICONICS.
    tCiclo: toNumber(readings.tCiclo),
    tCicloCalc: toNumber(readings.tCicloCalc),
    tCicloTeo: toNumber(readings.tCicloTeo),
    tDispPot: toNumber(readings.tDispPot),
    tInacPlan: toNumber(readings.tInacPlan),
    tMuerto: toNumber(readings.tMuerto),

    // Frescura del dato: la UI los usa para el semáforo.
    receivedAt,
    stale,
  };
}

/** Máquina sin ninguna lectura todavía. Evita huecos en la primera pintada. */
export function emptyMachine({ id, areaId, machineId, equipo }) {
  return createMachine({ id, areaId, machineId, equipo, readings: {}, stale: true });
}

/** ¿La máquina tiene al menos una medición utilizable? */
export function tieneDatos(m) {
  return hasValue(m.oee) || hasValue(m.disponibilidad) || hasValue(m.aprobadas);
}

export { ESTADOS };
