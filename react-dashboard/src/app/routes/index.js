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

/**
 * id de página → id de su sección del sidebar (`sec-llenado`,
 * `sec-vibraciones`, `sec-general`), o `null` si la ruta no está en ninguna.
 *
 * Existe para que nadie tenga que preguntar «¿esta pantalla es de la estación
 * de llenado?» con una lista de ids escrita a mano. Esa lista es una copia del
 * registro, y una copia se queda vieja en cuanto alguien añada una vista: la
 * pantalla nueva heredaría la respuesta equivocada sin que nada lo delate.
 *
 * Lo consume el Topbar para decidir si el indicador de encendido de la bomba
 * tiene algo que decir en la pestaña actual — ese indicador lee un tag del
 * TANQUE, así que en una pantalla de vibraciones estaría enseñando el estado
 * de la máquina equivocada.
 */
export const SECCION_DE_PAGINA = Object.fromEntries(
  ROUTES.map((r) => [r.id, r.nav?.group ?? null])
);

/** Árbol del sidebar, en orden. Ver `buildNav.js` para las reglas de orden. */
export const NAV = buildNav(ROUTES, NAV_GROUPS);
