/**
 * Deriva las tres vistas del registro único de `routes.jsx`.
 *
 * `PAGES`, `NAV` y `PAGE_META` conservan la misma forma que tenían cuando se
 * mantenían a mano, así que `App.jsx`, `Sidebar.jsx` y `Topbar.jsx` solo
 * cambian de dónde importan.
 */
import { ROUTES, NAV_GROUPS, DEFAULT_ROUTE } from "./routes.jsx";
import { buildNav } from "./buildNav.js";

export { ROUTES, DEFAULT_ROUTE };
export { useNavegacion } from "./useNavegacion.js";

/** id de página → componente. Lo consume el <Shell> de App.jsx. */
export const PAGES = Object.fromEntries(ROUTES.map((r) => [r.id, r.component]));

/** Ids navegables. Lo consume `useNavegacion` para validar lo que llega en la URL. */
export const ROUTE_IDS = ROUTES.map((r) => r.id);

/** id de página → { title, sub }. Lo consume el Topbar. */
export const PAGE_META = Object.fromEntries(
  ROUTES.map((r) => [r.id, { title: r.title, sub: r.sub }])
);

/** Árbol del sidebar, en orden. Ver `buildNav.js` para las reglas de orden. */
export const NAV = buildNav(ROUTES, NAV_GROUPS);
