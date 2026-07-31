/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/RadioOption.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** ui/RadioOption.jsx — una opción de radio-group; el estado "seleccionado" lo controla el padre. */
import { useTheme } from "@/theme";

export function RadioOption({ label, selected, onSelect }) {
  const { theme: t } = useTheme();
  return (
    <label onClick={onSelect} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: t.textSoft }}>
      <span
        style={{
          width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${selected ? t.accent : t.border}`,
          boxShadow: selected ? `0 2px 6px ${t.accent}40` : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {selected && <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.gradAccent }} />}
      </span>
      {label}
    </label>
  );
}
