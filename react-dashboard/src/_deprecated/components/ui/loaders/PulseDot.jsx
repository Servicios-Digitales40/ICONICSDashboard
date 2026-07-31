/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/PulseDot.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** Loaders/PulseDot.jsx — punto con anillo expandiéndose, sugiere "en vivo". */
import { useTheme } from "@/theme";

export function PulseDot() {
  const { theme: t } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ position: "relative", width: 14, height: 14, display: "inline-flex" }}>
        <span className="pulse-ring" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: t.coral }} />
        <span style={{ width: 14, height: 14, borderRadius: "50%", background: t.coral, position: "relative" }} />
      </span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: t.textSoft }}>transmisión en vivo</span>
    </div>
  );
}
