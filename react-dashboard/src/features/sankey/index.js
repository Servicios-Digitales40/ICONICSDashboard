/**
 * features/sankey — banco de diagramas Sankey (d3-sankey).
 *
 * API pública del módulo: SOLO el componente de ruta. El componente
 * `SankeyChart` en sí NO vive aquí: es compartido (`@/components/charts`)
 * porque también lo consume `features/machines`.
 */
export { default as Sankey } from "./views/Sankey.jsx";
