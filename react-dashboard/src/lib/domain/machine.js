/**
 * lib/domain/machine.js
 * ------------------------------------------------------------------
 * La forma `Machine`: el único vocabulario que conocen las vistas.
 *
 * Se define desde el EXCEL (lo que el servidor ofrece) y no desde lo que
 * la UI usa hoy. Si se congelara según la pantalla actual, cada dato
 * nuevo obligaría a tocar las dos fuentes de datos y el normalizador.
 *
 * ── AUSENCIA DE DATO ───────────────────────────────────────────────
 *
 * Todo campo numérico es `number | null`. `null` significa «no hay
 * medición», y las vistas deben pintar un hueco, jamás un cero.
 *
 * Hay dos formas de perder un dato y ambas terminan en `null`:
 *
 *   1. Mala calidad — el adaptador de ICONICS ya lo filtró con la regla
 *      de la calidad 192 (ver lib/iconics/quality.js).
 *   2. Aritmética inválida — `NaN` o `Infinity`.
 *
 * El caso 2 no es teórico. En el Excel, `OEE_Cal` a nivel de instancia
 * es (Pz_OK / Prod_Real_Total) × 100 SIN protección por abajo: al inicio
 * del turno, con `Prod_Real_Total` en 0, el servidor devuelve Infinity o
 * NaN. Como `buildPlantSummary` promedia sin comprobar, un solo NaN
 * contamina el resumen de la planta entera. Revelador: la clase
 * `Calculos` del propio Excel sí acota a 0–120, señal de que el problema
 * ya se detectó en el servidor pero no en todas las rutas.
 *
 * Por eso el saneamiento vive AQUÍ, en la frontera, y no en las vistas.
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

/** ¿Hay medición? Úsese en las vistas antes de formatear. */
export const hasValue = (v) => v !== null && v !== undefined;

/**
 * OEE a partir de sus tres factores, en %.
 * Devuelve `null` si falta alguno: un OEE calculado con un factor
 * ausente sería un número inventado.
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
 * Las dos derivaciones son deliberadamente conservadoras:
 *   · `producidas` cae a aprobadas + rechazadas solo si ambas existen.
 *   · `oee` se recalcula desde los factores solo si el servidor no lo dio.
 * Nunca se rellena un hueco con una estimación.
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

    // `estado` es el único campo que nunca es null: la ausencia de dato
    // es un estado en sí misma (`unknown`), y así las vistas no necesitan
    // un camino especial para pintarlo.
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

    // Metadatos de frescura: la UI los usa para el semáforo de dato.
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
