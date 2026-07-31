/**
 * Monitores de área y detalle de máquina (OEE).
 *
 * Es el único feature que sirve más de una ruta, a propósito: las vistas de
 * área y de detalle son la misma historia a dos niveles de zoom, comparten el
 * modelo de datos y navegan entre sí con `params.from`.
 *
 * La API pública son solo los componentes de ruta. Las subvistas de
 * `machine-detail/` no se exportan: se alcanzan por pestañas con estado local
 * y montarlas desde fuera no tendría sentido.
 *
 * `comparativoUi.jsx` y `compare.js` tampoco son públicos, salvo para
 * `src/prototypes/`, que los importa por ruta profunda para pintar las
 * propuestas con los mismos átomos que producción y que no se desincronicen.
 */
export { default as AreaView } from "./views/AreaView.jsx";
export { default as MachineDetail } from "./views/MachineDetail.jsx";
