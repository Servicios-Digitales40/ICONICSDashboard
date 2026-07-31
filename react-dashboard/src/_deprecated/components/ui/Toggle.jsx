/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/Toggle.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** ui/Toggle.jsx — interruptor on/off con degradado y sombra cuando está activo. */
import { useState } from "react";
import { useTheme } from "@/theme";

export function Toggle({ defaultOn }) {
  const { theme: t } = useTheme();
  const [on, setOn] = useState(!!defaultOn);
  return (
    <button
      className="toggle-track"
      onClick={() => setOn((o) => !o)}
      style={{
        width: 38, height: 22, borderRadius: 999, border: "none",
        background: on ? t.gradAccent : t.grid, position: "relative", cursor: "pointer",
        padding: 0, boxShadow: on ? `0 2px 8px ${t.accent}4D` : "none",
      }}
    >
      <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#FFFFFF", transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
    </button>
  );
}
