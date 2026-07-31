/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/TrendPill.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** ui/TrendPill.jsx — pastilla +N% / -N% con flecha, usada en las tarjetas de métricas. */
import { TrendingUp, TrendingDown } from "lucide-react";
import { useTheme } from "@/theme";

export function TrendPill({ value }) {
  const { theme: t } = useTheme();
  const up = value >= 0;
  const color = up ? t.success : t.coral;
  const bg = up ? t.successSoft : t.coralSoft;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: bg, color, fontSize: 11.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? "+" : ""}{value}%
    </span>
  );
}
