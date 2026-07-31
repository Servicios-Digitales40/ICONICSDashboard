/** ui/SectionLabel.jsx — título de sección con una barrita degradada a la izquierda. */
import { useTheme } from "@/theme";

export function SectionLabel({ children, sub }) {
  const { theme: t } = useTheme();
  return (
    <div style={{ margin: "30px 0 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 5, height: 16, borderRadius: 3, background: t.gradAccent }} />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{children}</h2>
      </div>
      {sub && <p style={{ margin: "4px 0 0 13px", fontSize: 12.5, color: t.textFaint }}>{sub}</p>}
    </div>
  );
}
