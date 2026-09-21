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

/**
 * Los ids que el Topbar tiene que rotular.
 *
 * Antes esto era `PAGE_META`, un mapa `id → { title, sub }` con el texto en
 * español dentro. El texto se fue a `navigation.json` de cada idioma, indexado
 * por id (ver la cabecera de `routes.jsx`), así que lo único que queda por
 * derivar es qué ids existen — y de eso ya se encarga `ROUTE_IDS`.
 *
 * Se conserva el nombre `PAGE_META` porque sigue contestando a la misma
 * pregunta —«¿es esta una página conocida?»— y así el Topbar no cambia de
 * import; lo que cambió es que ahora sólo dice que existe, no cómo se llama.
 */
export const PAGE_META = Object.fromEntries(ROUTES.map((r) => [r.id, { id: r.id }]));

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

/**
 * Árbol del sidebar, en orden, SIN filtrar por rol.
 *
 * Es el menú completo: el que ve un administrador, y el que ve todo el mundo
 * con `AUTH_HABILITADA=false`. Se conserva como constante porque lo consumen
 * las pruebas que comprueban el ORDEN del menú y la ausencia de la estación
 * de llenado, y ésas no dependen de quién mire.
 *
 * Para el menú de una sesión concreta, `navParaRol()` (Plan 35 F3).
 */
export const NAV = buildNav(ROUTES, NAV_GROUPS);

/**
 * El árbol del sidebar para unos permisos dados.
 *
 * @param puede  `(rolMinimo) => boolean`, normalmente el de `usePermisos()`
 *
 * No es un hook ni memoiza: es una función pura sobre un array de una docena
 * de entradas, y llamarla al pintar cuesta menos que el `useMemo` que haría
 * falta para evitarlo. Quien la use dentro de un componente puede memoizarla
 * si mide que hace falta (`CLAUDE.md` §4.8).
 */
export const navParaRol = (puede) => buildNav(ROUTES, NAV_GROUPS, puede);

/**
 * El rol mínimo de cada ruta, o `null` si no declara ninguno.
 *
 * Lo usa la pantalla que decide qué hacer cuando alguien llega por URL a una
 * vista que no le corresponde. Se deriva del registro en vez de escribirse
 * aparte, por lo mismo que `SECCION_DE_PAGINA`: una segunda lista se queda
 * vieja en cuanto alguien añade una ruta.
 */
export const ROL_DE_PAGINA = Object.fromEntries(
  ROUTES.map((r) => [r.id, r.rol ?? null])
);
