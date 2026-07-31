/**
 * features/machines — monitores de área y detalle de máquina (OEE).
 *
 * Es el único feature que sirve más de una ruta, y es deliberado: las vistas
 * de área y `machine-detail` son la misma historia contada a dos niveles de
 * zoom (parrilla → detalle), comparten el modelo de datos y navegan entre sí
 * con `params.from`. Separarlos crearía dos módulos que solo se hablan entre
 * ellos, que es peor que uno cohesivo.
 *
 * `Area1` y `Area2` se fusionaron en `AreaView`, que recibe el `areaId` del
 * catálogo de ICONICS (`LIN`, `REC`). Eran dos archivos idénticos salvo por
 * una constante, y con las áreas saliendo del catálogo esa duplicación
 * obligaría a tocar dos sitios por cada cambio de parrilla.
 *
 * API pública: SOLO los tres componentes de ruta. Las 5 subvistas de
 * `machine-detail/` NO se exportan: se alcanzan por pestañas (estado local,
 * no router) y montarlas desde fuera no tendría sentido.
 *
 * `comparativoUi.jsx` y `compare.js` tampoco son públicos... salvo para
 * `src/prototypes/`, que los importa por ruta profunda a propósito: pinta
 * las propuestas descartadas con los átomos REALES de producción para que no
 * puedan desincronizarse. Prototipo → producción es la dirección permitida.
 */
export { default as AreaView } from "./views/AreaView.jsx";
export { default as MachineDetail } from "./views/MachineDetail.jsx";
