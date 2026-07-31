/**
 * lib/datasource/index.js — API pública de la capa de datos.
 *
 * Las vistas importan SOLO de aquí. Nadie fuera de esta carpeta conoce
 * `createDemoSource`, `createIconicsSource` ni el motor de polling: ese
 * es justamente el punto de la abstracción, y lo que hace que el botón
 * de demo no se filtre por toda la UI.
 *
 * Re-exports nombrados y explícitos, no `export *`.
 */
export { DataSourceProvider, useDataSource, MODOS, ORIGENES } from "./DataSourceProvider.jsx";

export {
  usePlantData,
  useAreaData,
  useMachineData,
  useMachineHistory,
  useMachineDay,
  useMachineDailyOee,
  useIconicsStats,
} from "./hooks.js";

export { SNAPSHOT_INICIAL } from "./types.js";
