/**
 * Barrel del kit de primitivas.
 *
 * Aquí solo vive lo reutilizable: piezas presentacionales, agnósticas del
 * dominio, que no hacen fetching ni conocen ningún feature. `src/components/`
 * es hoja del grafo y solo depende de `@/theme`.
 *
 * Ningún archivo de esta carpeta importa este barrel, porque crearía un ciclo;
 * entre ellos se importan en relativo.
 *
 * ── QUÉ SE FUE EN LA FASE 3 DEL PLAN 20, Y POR QUÉ ─────────────────
 *
 * `Tabs`, `Avatar` y `HoverTip`. Los tres se quedaron sin un solo consumidor
 * al borrar el tablero de planta: las pestañas eran del detalle de activo, el
 * avatar del Topbar y el tooltip de las gráficas.
 *
 * Se borran en vez de dejarlos «por si acaso». Un barril `export *` los
 * mantenía nombrables desde cualquier sitio, así que no eran código muerto
 * inerte: eran una invitación a construir con piezas que nadie mantiene ni
 * prueba. El bundler ya no los incluía —lo cual es justo el problema, porque
 * su ausencia no dolía y su presencia tampoco se notaba—.
 */
export * from "./Panel.jsx";
export * from "./SectionLabel.jsx";
export * from "./Button.jsx";
export * from "./Input.jsx";
export * from "./AlertBanner.jsx";
