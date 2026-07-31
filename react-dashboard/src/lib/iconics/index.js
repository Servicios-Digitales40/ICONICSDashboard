/**
 * API pública del cliente ICONICS.
 *
 * Es infraestructura compartida, no de un feature: la consumen tanto
 * `features/data` como `features/assets`. Toda la E/S de red de la app pasa
 * por aquí; no hay ningún `fetch(` fuera de `apiClient.js`.
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
 * `useIconicsPoint` abre un `setInterval` por componente. Sirve para leer un
 * punto suelto (`features/data`), pero no para pintar máquinas: diez tarjetas
 * serían diez temporizadores y diez peticiones por ciclo. Para datos de planta
 * está `lib/datasource`, que agrupa todo en una sola petición.
 */
export { useIconicsPoint } from "./useIconicsPoint.js";

/* Contrato con el servidor y motor de lectura. */
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
