/**
 * Barrel del kit de primitivas.
 *
 * Aquí solo vive lo reutilizable: piezas presentacionales, agnósticas del
 * dominio, que no hacen fetching ni conocen ningún feature. `src/components/`
 * es hoja del grafo y solo depende de `@/theme`.
 *
 * Ningún archivo de esta carpeta importa este barrel, porque crearía un ciclo;
 * entre ellos se importan en relativo.
 */
export * from "./Panel.jsx";
export * from "./SectionLabel.jsx";
export * from "./Tabs.jsx";
export * from "./Avatar.jsx";
export * from "./Button.jsx";
export * from "./Input.jsx";
export * from "./HoverTip.jsx";
export * from "./AlertBanner.jsx";
