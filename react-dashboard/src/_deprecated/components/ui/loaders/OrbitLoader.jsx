/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/OrbitLoader.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** Loaders/OrbitLoader.jsx — un punto orbitando alrededor de un ícono central. */
import { Sparkles } from "lucide-react";
import { useTheme } from "@/theme";

export function OrbitLoader() {
  const { theme: t } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ position: "relative", width: 44, height: 44 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px dashed ${t.border}` }} />
        <div className="orbit-spin" style={{ position: "absolute", inset: 0 }}>
          <span style={{ position: "absolute", top: -3, left: "50%", width: 8, height: 8, marginLeft: -4, borderRadius: "50%", background: t.gradAccent, boxShadow: `0 0 8px ${t.accent}` }} />
        </div>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={15} color={t.accent} />
        </div>
      </div>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: t.textSoft }}>generando insights…</span>
    </div>
  );
}
