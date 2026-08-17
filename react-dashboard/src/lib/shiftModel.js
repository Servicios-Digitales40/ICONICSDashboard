/**
 * Formato y banda de color del turno.
 *
 * Desde el Plan 7, la **aritmética** del turno —`TURNO_S`, las metas y
 * `tiemposTurno`— vive en [`shared/turno.js`](../../../shared/turno.js),
 * porque `buildPlantSummary` la necesita y ese resumen lo calculan ahora los
 * dos lados: el tablero y las herramientas del asistente.
 *
 * Lo que se queda aquí es presentación: depende del tema y de `lib/format.js`,
 * y no tiene nada que hacer en el backend. Se reexporta lo movido para que los
 * diez consumidores sigan importando de un solo sitio.
 */
import { hasValue } from "./domain/index.js";
import { SIN_DATO, pctSeguro } from "./format.js";
import {
  METAS,
  META_CALIDAD,
  META_DISPONIBILIDAD,
  PARO_PLANIFICADO_S,
  TURNO_S,
  tiemposTurno,
} from "@shared/turno.js";

export { METAS, META_CALIDAD, META_DISPONIBILIDAD, PARO_PLANIFICADO_S, TURNO_S, tiemposTurno };

/*
 * Formateo. Los tres toleran huecos porque `tiemposTurno` devuelve `null`
 * cuando falta la disponibilidad, y `Math.round(null)` vale 0 en JavaScript:
 * sin la comprobación la vista pintaría «0 s» donde no hubo medición.
 */

/** 18000 → "18 000 s" · null → "—" */
export const fmtSeg = (s) => (hasValue(s) ? `${Math.round(s).toLocaleString("es-MX")} s` : SIN_DATO);

/** 18000 → "5 h 00 m" · 3600 → "1 h 00 m" · 900 → "15 m" · null → "—" */
export function fmtHM(s) {
  if (!hasValue(s)) return SIN_DATO;
  const total = Math.round(s / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")} m` : `${m} m`;
}

/**
 * Acota a 0–100 para geometría (anchos de barra, arcos, offsets).
 *
 * Devuelve 0 ante un hueco, así que no sirve para producir texto: para eso
 * están `fmtNum`/`fmtPct` de lib/format.js, que distinguen la ausencia de
 * dato y escriben «—».
 */
export const clampPct = (v) => pctSeguro(v);

/**
 * Color por banda, con los mismos cortes que usa el resto de la app. Sin
 * medición devuelve el tono apagado, para no marcar en rojo un factor que
 * simplemente no se ha leído.
 */
export const bandColor = (t, v) =>
  !hasValue(v) ? t.textFaint : v < 50 ? t.viz.coral : v < 75 ? t.viz.ambar : t.viz.verde;
