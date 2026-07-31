/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/SkeletonRow.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** Loaders/SkeletonRow.jsx — una línea de "esqueleto" con efecto shimmer. Recibe el ancho (`w`). */
import { useTheme } from "@/theme";

export function SkeletonRow({ w = "70%" }) {
  const { theme: t } = useTheme();
  return (
    <div className="shimmer" style={{ height: 12, width: w, background: t.shimmer, backgroundSize: "400% 100%", borderRadius: 3 }} />
  );
}
