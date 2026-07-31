/**
 * @deprecated 2026-07 · barrel del archivo
 *
 * Barrel espejo del kit de UI para las páginas archivadas. Existe para que
 * esas páginas conserven su `import { ... } from "@/components/ui/index.js"`
 * SIN un solo cambio: reexporta las primitivas que siguen vivas y añade las
 * que se archivaron con ellas.
 *
 * Dirección permitida: archivo → vivo. NUNCA al revés — ningún archivo de
 * producción puede importar de `_deprecated/`.
 *
 * Los dos conjuntos son disjuntos, así que no hay riesgo de nombre ambiguo
 * (dos `export *` exportando el mismo nombre lo excluirían en silencio).
 */

// Primitivas VIVAS que estas páginas siguen usando.
export * from "@/components/ui/index.js";
export * from "@/components/charts/index.js";

// Primitivas archivadas junto a sus últimas páginas consumidoras.
export * from "./Badge.jsx";
export * from "./Checkbox.jsx";
export * from "./CountUp.jsx";
export * from "./DateField.jsx";
export * from "./GaugeKPI.jsx";
export * from "./RadioOption.jsx";
export * from "./Roadmap.jsx";
export * from "./Sparkline.jsx";
export * from "./Toggle.jsx";
export * from "./TreeNode.jsx";
export * from "./TrendPill.jsx";
export * from "./loaders/index.js";
