/**
 * El armazón visual de la aplicación.
 *
 * Sidebar y Topbar no son componentes reutilizables: hay exactamente uno de
 * cada uno, montado por `App.jsx`, y ambos leen la configuración de rutas. Por
 * eso viven en `app/` y no en `components/`.
 */
export { Sidebar } from "./Sidebar.jsx";
export { Topbar } from "./Topbar.jsx";
export { DataSourceBanner } from "./DataSourceBanner.jsx";
