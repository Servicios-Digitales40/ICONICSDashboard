/**
 * components/ui/index.js — barrel del kit de primitivas.
 *
 * Aquí solo vive lo GENUINAMENTE reutilizable: piezas presentacionales,
 * agnósticas del dominio, que no hacen fetching ni conocen ningún feature.
 * `src/components/` es hoja del grafo — solo depende de `@/theme`.
 *
 * Es el único barrel del proyecto que conserva `export *`: es un kit plano
 * de primitivas y el riesgo de nombre ambiguo es bajo. Todo barrel nuevo usa
 * re-exports nombrados explícitos.
 *
 * Regla: ningún archivo de esta carpeta importa este barrel (crearía un
 * ciclo barrel → archivo → barrel). Entre ellos se importan en relativo.
 */
export * from "./Panel.jsx";
export * from "./SectionLabel.jsx";
export * from "./Tabs.jsx";
export * from "./Avatar.jsx";
export * from "./Button.jsx";
export * from "./Input.jsx";
export * from "./DatePicker.jsx";
export * from "./HoverTip.jsx";
export * from "./AlertBanner.jsx";
export * from "./BandGauge.jsx";
export * from "./KpiTile.jsx";
