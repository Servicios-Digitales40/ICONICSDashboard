/**
 * Formateo consciente de la ausencia de dato.
 *
 * Cualquier medición puede faltar (mala calidad, tag ausente, división por
 * cero en el servidor). El dominio ya lo convierte todo en `null`; aquí se
 * decide cómo se ve un `null` en pantalla.
 *
 * La regla es que un hueco se pinta como hueco y nunca como cero: un
 * «0.00 %» donde no hubo medición es indistinguible de una máquina parada de
 * verdad, y puede llevar a intervenir un equipo que estaba bien.
 */
import { hasValue } from "@shared/valores.js";

/** Lo que se muestra cuando no hay medición. Un solo sitio lo decide. */
export const SIN_DATO = "—";

/** 84.5 → "84.50 %" · null → "—" */
export const fmtPct = (v, decimales = 2) =>
  hasValue(v) ? `${v.toFixed(decimales)} %` : SIN_DATO;

/** 84.5 → "84.50" · null → "—" (sin unidad, para cuando ya la pone la UI) */
export const fmtNum = (v, decimales = 2) =>
  hasValue(v) ? v.toFixed(decimales) : SIN_DATO;


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
