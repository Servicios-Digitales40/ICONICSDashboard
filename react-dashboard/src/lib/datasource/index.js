/**
 * API pública de la capa de origen de datos.
 *
 * Lo que se publica aquí es el ORIGEN —qué transporte está activo y cómo se
 * anuncia en pantalla—, no los datos. Cada sección construye su fuente sobre
 * el transporte que diga este contexto; la de Demo EVA vive en
 * `Demo-EVA/data/`.
 *
 * Aquí NO vive ninguna bandera de superficie. Hubo una, `VITE_ENABLE_DEMO`, que
 * gateaba a la vez el origen de los datos y qué rutas existían, y esa
 * conflación fue justamente lo que se deshizo.
 *
 * Antes este barril exportaba además `usePlantData`, `useAreaData`,
 * `useMachineData` y compañía: los hooks de las diez máquinas de Resonac. Se
 * fueron con esa sección, junto con `iconicsSource` y el tipo `Snapshot`.
 */
export {
  DataSourceProvider,
  useDataSource,
  TRANSPORTES,
  ORIGENES,
} from "./DataSourceProvider.jsx";
