/**
 * lib/format.js
 * ------------------------------------------------------------------
 * Formateo consciente de la AUSENCIA DE DATO.
 *
 * Con datos reales cualquier medición puede faltar: mala calidad, tag
 * ausente o división por cero en el servidor. El dominio ya convierte
 * todo eso en `null` (ver lib/domain/machine.js); aquí se decide cómo
 * se ve un `null` en pantalla.
 *
 * La regla es una sola y se aplica sin excepciones:
 *
 *     un hueco se pinta como hueco, JAMÁS como cero
 *
 * Un «0.00 %» donde no hubo medición es indistinguible de una máquina
 * parada de verdad. En un tablero de planta eso no es un detalle
 * cosmético: es una lectura equivocada que puede mover a alguien a
 * intervenir un equipo que estaba bien.
 */
import { hasValue } from "./domain/index.js";

/** Lo que se muestra cuando no hay medición. Un solo sitio lo decide. */
export const SIN_DATO = "—";

/** 84.5 → "84.50 %" · null → "—" */
export const fmtPct = (v, decimales = 2) =>
  hasValue(v) ? `${v.toFixed(decimales)} %` : SIN_DATO;

/** 84.5 → "84.50" · null → "—" (sin unidad, para cuando ya la pone la UI) */
export const fmtNum = (v, decimales = 2) =>
  hasValue(v) ? v.toFixed(decimales) : SIN_DATO;

/** 1234 → "1 234" · null → "—" */
export const fmtEntero = (v) =>
  hasValue(v) ? Math.round(v).toLocaleString("es-MX") : SIN_DATO;

/**
 * Segundos → forma legible. 45 → "45 s" · 5400 → "1 h 30 m".
 * ICONICS entrega todos los tiempos en segundos, y los tiempos muertos
 * reales son de miles: mostrarlos crudos sería ilegible.
 */
export function fmtDuracion(segundos) {
  if (!hasValue(segundos)) return SIN_DATO;

  const s = Math.round(segundos);
  if (s < 60) return `${s} s`;

  const min = Math.floor(s / 60);
  if (min < 60) return `${min} m`;

  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, "0")} m`;
}

/** Antigüedad legible de una lectura: "hace 3 s", "hace 2 m". */
export function fmtAntiguedad(fecha, ahora = Date.now()) {
  if (!fecha) return SIN_DATO;

  const s = Math.max(0, Math.round((ahora - fecha.getTime()) / 1000));
  if (s < 5) return "ahora";
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} m`;
  return `hace ${Math.floor(s / 3600)} h`;
}

/** Porcentaje acotado a 0–100, tolerante a huecos (devuelve 0 para geometría). */
export const pctSeguro = (v) => (hasValue(v) ? Math.max(0, Math.min(100, v)) : 0);
