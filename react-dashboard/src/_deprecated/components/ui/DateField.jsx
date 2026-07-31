/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/DateField.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * ui/DateField.jsx
 * ------------------------------------------------------------------
 * Selector de fecha limpio, construido sobre `<input type="date">` para
 * heredar el calendario nativo del sistema (accesible y ya localizado),
 * pero con la piel del tema: mismo fondo, borde y radio que el resto de
 * campos, y `color-scheme` sincronizado para que el ícono del calendario
 * se vea bien en claro/oscuro.
 *
 * Un punto de acento (`accent`) a la izquierda permite etiquetar visual-
 * mente cada fecha (p. ej. serie A vs serie B en un comparativo).
 *
 * Props:
 *  - label: rótulo pequeño encima del campo
 *  - value / onChange: controlado (string YYYY-MM-DD)
 *  - accent: color del punto/realce (default: t.accent)
 *  - max / min: límites opcionales (YYYY-MM-DD)
 */
import { useTheme } from "@/theme";
import { fieldStyle } from "@/components/ui/Input.jsx";

export function DateField({ label, value, onChange, accent, min, max }) {
  const { theme: t, dark } = useTheme();
  const dot = accent || t.accent;

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      {label && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: t.textFaint }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, boxShadow: `0 0 0 3px ${dot}22` }} />
          {label}
        </span>
      )}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="field"
        style={{
          ...fieldStyle(t),
          colorScheme: dark ? "dark" : "light",
          fontFamily: "'IBM Plex Mono', monospace",
          fontWeight: 600,
          borderColor: `${dot}55`,
          cursor: "pointer",
        }}
      />
    </label>
  );
}
