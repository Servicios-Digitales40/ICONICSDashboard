/** ui/ChartTooltip.jsx — tooltip personalizado para las gráficas de recharts (reemplaza el feo por defecto). */
import { useTheme } from "@/theme";

export function ChartTooltip({ active, payload, label }) {
  const { theme: t } = useTheme();
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 11px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, boxShadow: t.shadowHover }}>
      {label && <div style={{ color: t.text, fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.payload?.fill || p.stroke }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}
