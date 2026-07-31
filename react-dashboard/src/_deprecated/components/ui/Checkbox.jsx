/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/Checkbox.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** ui/Checkbox.jsx — casilla personalizada (la nativa del navegador no se puede tematizar bien). */
import { useState } from "react";
import { Check } from "lucide-react";
import { useTheme } from "@/theme";

export function Checkbox({ label, defaultChecked }) {
  const { theme: t } = useTheme();
  const [checked, setChecked] = useState(!!defaultChecked);
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 13, color: t.textSoft }}>
      <span
        onClick={() => setChecked((c) => !c)}
        style={{
          width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${checked ? t.accent : t.border}`,
          background: checked ? t.gradAccent : "transparent", boxShadow: checked ? `0 2px 8px ${t.accent}40` : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {checked && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
      </span>
      {label}
    </label>
  );
}
