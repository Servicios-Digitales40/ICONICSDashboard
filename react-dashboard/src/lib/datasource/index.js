/**
 * API pública de la capa de datos.
 *
 * Las vistas importan solo de aquí. Fuera de esta carpeta nadie conoce
 * `createIconicsSource`, los transportes ni el motor de polling, que es lo que
 * evita que el origen de los datos se filtre por toda la UI.
 *
 * Aquí NO vive ninguna bandera de superficie: la que decide qué rutas existen
 * está en `lib/flags.js`. Antes se exportaba `DEMO_HABILITADO` desde este
 * barril y la consumía el registro de rutas, que es lo que mezclaba «de dónde
 * vienen los datos» con «qué pantallas hay». Ver docs/PLAN-5-DOS-ORIGENES.md.
 */
export {
  DataSourceProvider,
  useDataSource,
  TRANSPORTES,
  ORIGENES,
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
