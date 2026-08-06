/**
 * API pública de la capa de datos.
 *
 * Las vistas importan solo de aquí. Fuera de esta carpeta nadie conoce
 * `createDemoSource`, `createIconicsSource` ni el motor de polling, que es
 * lo que evita que el modo demo se filtre por toda la UI.
 */
export {
  DataSourceProvider,
  useDataSource,
  MODOS,
  ORIGENES,
  /** Lo lee el registro de rutas para decidir si existen las de propuesta. */
  DEMO_HABILITADO,
} from "./DataSourceProvider.jsx";

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
