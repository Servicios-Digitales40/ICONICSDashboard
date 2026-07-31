/**
 * Banco de diagramas Sankey (d3-sankey).
 *
 * La API pública es solo el componente de ruta. `SankeyChart` no vive aquí:
 * está en `@/components/charts` porque también lo consume `features/machines`.
 */
export { default as Sankey } from "./views/Sankey.jsx";
