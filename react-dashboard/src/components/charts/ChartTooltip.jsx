/** Tooltip propio para las gráficas de recharts, en lugar del que trae. */
import { useTheme } from "@/theme";

export function ChartTooltip({ active, payload, label }) {
  const { theme: t } = useTheme();
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 11px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, boxShadow: t.shadowHover }}>
      {label && <div style={{ color: t.text, fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        // recharts no siempre rellena `color` para una serie (varía con el
        // tipo de gráfica y con si el color llega por `stroke` o por `fill`);
        // sin este último recurso el `style.color` quedaba en `undefined` y
        // el navegador caía a su negro por defecto — ilegible sobre el panel
        // oscuro, que es justo el caso que nadie miraba en claro.
        <div key={i} style={{ color: p.color || p.payload?.fill || p.stroke || t.text }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}
