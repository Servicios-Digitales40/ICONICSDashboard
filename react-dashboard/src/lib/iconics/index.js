/**
 * lib/iconics/index.js — API pública del cliente ICONICS.
 *
 * Es infraestructura COMPARTIDA, no de un feature: la consumen tanto
 * `features/data` como `features/assets`. Meterla dentro de cualquiera de
 * los dos crearía una arista cruzada entre features, que es justo lo que la
 * modularidad existe para evitar.
 *
 * Toda la E/S de red de la app pasa por aquí: no hay un solo `fetch(` fuera
 * de `apiClient.js`.
 *
 * Re-exports nombrados y explícitos, no `export *`.
 */
export {
  fetchIconicsPoint,
  fetchIconicsBatch,
  fetchIconicsHistory,
  browseIconics,
  writeIconicsPoint,
  writeIconicsBatch,
} from "./apiClient.js";

/**
 * ⚠ `useIconicsPoint` abre UN `setInterval` POR COMPONENTE.
 *
 * Es correcto para lo que hace `features/data`: leer un punto suelto que
 * el usuario escribe a mano. NO debe usarse para pintar máquinas: diez
 * tarjetas serían diez temporizadores y diez peticiones por ciclo.
 *
 * Para datos de planta se usa `lib/datasource`, que agrupa todos los
 * puntos de la pantalla en una sola petición por ciclo.
 */
export { useIconicsPoint } from "./useIconicsPoint.js";

/* --- Contrato con el servidor y motor de lectura --- */
export {
  AREAS,
  AREA_IDS,
  TAGS,
  listMachines,
  machineKey,
  pointName,
  historyPointName,
  parsePointName,
  tagsForArea,
} from "./tagCatalog.js";

export { QUALITY_GOOD, isGoodQuality } from "./quality.js";
export { createPollingEngine } from "./pollingEngine.js";
export { createTransport, createRealTransport, esTransporteFalso } from "./transport.js";
export { createFakeTransport, CAOS_SUAVE, CAOS_ALTO, SIN_CAOS } from "./fakeTransport.js";
