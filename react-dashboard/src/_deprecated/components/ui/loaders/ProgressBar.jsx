/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/ProgressBar.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** Loaders/ProgressBar.jsx — barra de progreso horizontal con relleno degradado. */
import { useTheme } from "@/theme";

export function ProgressBar({ percent, label = "sincronizando…" }) {
  const { theme: t } = useTheme();
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: t.textSoft, marginBottom: 6 }}>
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div style={{ height: 7, background: t.grid, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${percent}%`, background: t.gradAccent, transition: "width 0.4s ease", borderRadius: 4 }} />
      </div>
    </div>
  );
}
