/**
 * features/data — lectura, escritura y borrado de puntos ICONICS.
 *
 * API pública del módulo: SOLO el componente de ruta. Las subvistas
 * (Lectura/Escritura/Eliminar) y los componentes internos no se exportan
 * porque nadie fuera del feature debe montarlos: se alcanzan por las
 * pestañas de `Data`, que son estado local y no tocan el router.
 */
export { default as Data } from "./views/Data.jsx";
