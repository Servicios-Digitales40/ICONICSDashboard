/**
 * lib/domain/index.js — API pública del modelo de dominio.
 *
 * Es el vocabulario COMPARTIDO entre las dos fuentes de datos (ICONICS y
 * demo) y todas las vistas. Nadie fuera de `lib/` construye una `Machine`
 * a mano: se pasa siempre por `createMachine`, que es donde vive el
 * saneamiento de calidad y de NaN.
 *
 * Re-exports nombrados y explícitos, no `export *`.
 */
export {
  createMachine,
  emptyMachine,
  calcOEE,
  toNumber,
  toText,
  hasValue,
  tieneDatos,
} from "./machine.js";

export { daySummary } from "./history.js";

export {
  ESTADOS,
  ESTADOS_ORDEN,
  estadoFromCode,
  estadoInfo,
  estadoLabel,
  estaOperando,
} from "./estado.js";
