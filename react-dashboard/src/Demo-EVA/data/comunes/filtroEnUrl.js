/**
 * El filtro de series de una máquina configurada que viaja en la URL: de
 * `params` al filtro, y del filtro a `params` (Plan 42.5 F6, D16).
 *
 * Mismo criterio que `rangoEnUrl.js`: un enlace copiado abre la misma vista,
 * y un valor corrupto degrada a lo que funciona en vez de romper la pantalla.
 * Sin React: son dos cadenas.
 *
 * ── LAS DOS CLAVES ───────────────────────────────────────────────────
 *
 *   `filtro`  un `assetId`, `todas` (toda la máquina) o ausente (el activo
 *             POR DEFECTO de la vista: ninguno en la Planta, el de la pestaña
 *             en el Detalle). Que `todas` sea una palabra y no la ausencia es
 *             lo que permite al Detalle distinguir «no dijo nada» de «pidió
 *             cruzar activos».
 *   `series`  `todas` apaga «sólo medidas»; ausente lo deja encendido, que
 *             es el arranque (D16): doce gráficas, no setenta.
 *
 * Quien lee un `filtro` que no es de ningún activo de la máquina cae al
 * activo por defecto: eso lo decide la vista, que es quien tiene la lista.
 */

/** El valor de `filtro` que pide toda la máquina. */
export const TODA_LA_MAQUINA = "todas";

/**
 * `params` → `{ activo, soloMedidas }`.
 *
 * @param {object|undefined} params
 * @param {{ activoPorDefecto?: string|null }} [opciones]
 */
export function leerFiltroDeUrl(params, { activoPorDefecto = null } = {}) {
  const crudo = typeof params?.filtro === "string" ? params.filtro.trim() : "";
  const activo = crudo === "" ? activoPorDefecto : crudo === TODA_LA_MAQUINA ? null : crudo;
  const soloMedidas = params?.series !== TODA_LA_MAQUINA;
  return { activo, soloMedidas };
}

/**
 * `{ activo, soloMedidas }` → los `params` que hay que añadir a la URL. Lo
 * que coincide con el arranque NO viaja: una URL limpia es la del estado por
 * defecto, y `navigate()` reemplaza los parámetros enteros, así que quien
 * navega junta esto con `parametrosDeRango`.
 */
export function parametrosDeFiltro({ activo = null, soloMedidas = true } = {}, { activoPorDefecto = null } = {}) {
  /** @type {Record<string, string>} */
  const salida = {};
  if (activo === null || activo === undefined) {
    if (activoPorDefecto !== null && activoPorDefecto !== undefined) salida.filtro = TODA_LA_MAQUINA;
  } else if (activo !== activoPorDefecto) {
    salida.filtro = activo;
  }
  if (!soloMedidas) salida.series = TODA_LA_MAQUINA;
  return salida;
}
