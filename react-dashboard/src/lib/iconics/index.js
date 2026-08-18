/**
 * API pública del cliente ICONICS.
 *
 * Es infraestructura compartida, no de un feature: la consumen `features/data`,
 * el explorador de assets y la sección Demo EVA. Toda la E/S de red de la app
 * pasa por aquí; no hay ningún `fetch(` fuera de `apiClient.js`.
 *
 * Este barril no sabe qué instalación se está mirando. El catálogo de puntos de
 * Demo EVA vive en `@shared/eva/senales.js`, y antes se reexportaba desde aquí
 * el de Resonac (`tagCatalog.js`), que era lo que ataba la red a una planta
 * concreta.
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
 * punto suelto (`features/data`), pero no para pintar una instalación entera:
 * ocho tarjetas serían ocho temporizadores y ocho peticiones por ciclo. Para
 * eso está el motor de polling, que agrupa todo en una sola petición.
 */
export { useIconicsPoint } from "./useIconicsPoint.js";

export { QUALITY_GOOD, isGoodQuality } from "@shared/quality.js";
export { createPollingEngine } from "./pollingEngine.js";
export { TRANSPORTES, createRealTransport, esTransporteFalso, transporteInicial } from "./transport.js";
export { CAOS_SUAVE, CAOS_ALTO, SIN_CAOS, presetCaos } from "./caos.js";
