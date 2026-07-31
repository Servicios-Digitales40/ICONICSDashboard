/**
 * app/routes/index.js
 * ------------------------------------------------------------------
 * Deriva las tres vistas del registro único de `routes.jsx`.
 *
 * Estrategia: DERIVAR, no reescribir. `PAGES`, `NAV` y `PAGE_META` conservan
 * exactamente la misma forma que tenían cuando se mantenían a mano, así que
 * `App.jsx`, `Sidebar.jsx` y `Topbar.jsx` no cambian ni una línea de lógica
 * — solo de dónde importan.
 */
import { ROUTES, NAV_GROUPS, DEFAULT_ROUTE } from "./routes.jsx";
import { buildNav } from "./buildNav.js";

export { ROUTES, DEFAULT_ROUTE };

/** id de página → componente. Lo consume el <Shell> de App.jsx. */
export const PAGES = Object.fromEntries(ROUTES.map((r) => [r.id, r.component]));

/** id de página → { title, sub }. Lo consume el Topbar. */
export const PAGE_META = Object.fromEntries(
  ROUTES.map((r) => [r.id, { title: r.title, sub: r.sub }])
);

/** Árbol del sidebar, en orden. Ver `buildNav.js` para las reglas de orden. */
export const NAV = buildNav(ROUTES, NAV_GROUPS);
