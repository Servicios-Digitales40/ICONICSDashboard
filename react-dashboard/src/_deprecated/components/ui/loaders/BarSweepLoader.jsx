/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/BarSweepLoader.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** Loaders/BarSweepLoader.jsx — barra con un tramo de luz que recorre de lado a lado. */
import { useTheme } from "@/theme";

export function BarSweepLoader() {
  const { theme: t } = useTheme();
  return (
    <div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: t.textSoft, marginBottom: 6 }}>procesando lote…</div>
      <div style={{ position: "relative", height: 8, background: t.grid, borderRadius: 4, overflow: "hidden" }}>
        <div className="sweep-bar" style={{ position: "absolute", top: 0, bottom: 0, width: "40%", background: t.gradAccent, borderRadius: 4 }} />
      </div>
    </div>
  );
}
