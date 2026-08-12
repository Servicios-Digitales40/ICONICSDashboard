/**
 * API pública del modelo de dominio: el vocabulario compartido entre las dos
 * fuentes de datos y todas las vistas.
 *
 * Nadie fuera de `lib/` construye una `Machine` a mano; siempre se pasa por
 * `createMachine`, que es donde vive el saneamiento de calidad y de NaN.
 */
export {
  createMachine,
  emptyMachine,
  calcOEE,
  toNumber,
  toText,
  hasValue,
  tieneDatos,
} from "@shared/domain/machine.js";

export { daySummary } from "@shared/domain/history.js";

export {
  ESTADOS,
  ESTADOS_ORDEN,
  estadoFromCode,
  estadoInfo,
  estadoLabel,
  estaOperando,
} from "@shared/domain/estado.js";
