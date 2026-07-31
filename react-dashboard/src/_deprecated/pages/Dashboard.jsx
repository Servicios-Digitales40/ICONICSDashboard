/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/pages/Dashboard.jsx
 * Motivo: página de la plantilla original «aurora-dashboard»; llevaba tiempo comentada en NAV y se retiró del router.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * pages/Dashboard.jsx
 * ------------------------------------------------------------------
 * Página de resumen general: tarjetas de métricas con sparkline,
 * un gráfico combinado (barras + línea de meta), distribución del
 * equipo, actividad reciente y ranking de top performers.
 */
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line,
} from "recharts";
import { CheckCircle2, Plus, AlertTriangle, Users as UsersIcon, XCircle, Star, Server, Activity, Heart } from "lucide-react";
import { useTheme } from "@/theme";
import { useData } from "../providers/DataProvider.jsx";
import { useToast } from "@/app/providers";
import { chartPalette } from "@/theme/themes.js";
import { activityFeed, topPerformers, gaugeKpis, roadmapStages } from "../data/mockData.js";
import { Panel, SectionLabel, Avatar, Sparkline, TrendPill, CountUp, ChartTooltip, GaugeKPI, Roadmap } from "../components/ui/index.js";

const GAUGE_ICONS = {
  server: <Server size={19} />,
  activity: <Activity size={19} />,
  heart: <Heart size={19} />,
};

export default function Dashboard() {
  const { theme: t } = useTheme();
  const { barData, pieData, sparklines, totalIngresos, totalGastos } = useData();
  const { pushToast } = useToast();
  const pieColors = chartPalette(t);

  const metrics = [
    { label: "Ingresos", value: totalIngresos, suffix: "k", prefix: "$", trend: 12, grad: t.gradAccent, data: sparklines[0], color: t.accent },
    { label: "Gastos", value: totalGastos, suffix: "k", prefix: "$", trend: -4, grad: t.gradWarm, data: sparklines[1], color: t.amber },
    { label: "Usuarios activos", value: 1240 + sparklines[2][sparklines[2].length - 1].v, trend: 8, grad: t.gradViolet, data: sparklines[2], color: t.violet },
    { label: "Conversión", value: 3, suffix: ".2%", trend: 2, grad: t.gradSuccess, data: sparklines[3], color: t.success },
  ];

  const toneMap = { success: t.success, warning: t.amber, danger: t.coral, accent: t.accent, violet: t.violet };
  const iconMap = {
    success: <CheckCircle2 size={14} />,
    accent: <Plus size={14} />,
    warning: <AlertTriangle size={14} />,
    violet: <UsersIcon size={14} />,
    danger: <XCircle size={14} />,
  };

  return (
    <>
      {/* Tarjetas de métricas con mini-gráficas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        {metrics.map((m, i) => (
          <div
            key={i}
            className="metric-card row-fade"
            style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 18px 8px", boxShadow: t.shadow, overflow: "hidden", animationDelay: `${i * 0.06}s`, "--shadow-hover": t.shadowHover }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: t.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{m.label}</span>
              <TrendPill value={m.trend} />
            </div>
            <CountUp value={m.value} prefix={m.prefix} suffix={m.suffix} color={t.text} size={24} />
            <div style={{ marginTop: 6, marginLeft: -4, marginRight: -4 }}>
              <Sparkline data={m.data} color={m.color} />
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico combinado + distribución del equipo */}
      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 16, marginBottom: 16 }}>
        <Panel title="Ingresos vs. meta" code="ComposedChart · barras + línea">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={barData}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: t.hover }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ingresos" fill={t.accent} name="Ingresos" radius={[4, 4, 0, 0]} barSize={26} animationDuration={600} />
              <Line type="monotone" dataKey="meta" name="Meta" stroke={t.coral} strokeWidth={2.5} dot={{ r: 3, fill: t.coral, strokeWidth: 0 }} animationDuration={600} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Distribución del equipo" code="PieChart">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={85} paddingAngle={2} animationDuration={600}>
                {pieData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} stroke={t.panel} strokeWidth={2} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {pieData.map((p, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: t.textSoft }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: pieColors[i % pieColors.length] }} />
                {p.name}
              </span>
            ))}
          </div>
        </Panel>
      </div>

      {/* Actividad reciente + top performers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel title="Actividad reciente" code="últimas 24 horas">
          <div style={{ display: "flex", flexDirection: "column" }}>
            {activityFeed.map((a, i) => (
              <div key={i} className="row-fade" style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < activityFeed.length - 1 ? `1px solid ${t.border}` : "none", animationDelay: `${i * 0.05}s` }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: `${toneMap[a.tone]}18`, color: toneMap[a.tone], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {iconMap[a.tone]}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: t.text }}>{a.text}</div>
                  <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Top performers" code="por puntaje">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {topPerformers.map((p, i) => (
              <div key={i} className="row-fade" style={{ display: "flex", alignItems: "center", gap: 12, animationDelay: `${i * 0.05}s` }}>
                <span style={{ fontSize: 11, color: t.textFaint, width: 14, fontFamily: "'IBM Plex Mono', monospace" }}>{i + 1}</span>
                <Avatar name={p.name} size={32} grad={i === 0 ? t.gradWarm : t.gradAccent} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>{p.name}</div>
                  <div style={{ height: 5, background: t.grid, borderRadius: 4, marginTop: 5, overflow: "hidden" }}>
                    <div style={{ width: `${p.score}%`, height: "100%", background: i === 0 ? t.gradWarm : t.gradAccent, borderRadius: 4 }} />
                  </div>
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>{p.score}</span>
                {i === 0 && <Star size={13} color={t.amber} fill={t.amber} />}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* KPIs tipo velocímetro */}
      <SectionLabel sub="Vista rápida del estado de la infraestructura y la experiencia del cliente">Indicadores clave</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 8 }}>
        {gaugeKpis.map((k, i) => (
          <div key={i} className="row-fade" style={{ animationDelay: `${i * 0.06}s` }}>
            <GaugeKPI
              title={k.title}
              description={k.description}
              value={k.value}
              tone={k.tone}
              icon={GAUGE_ICONS[k.icon]}
              live={k.live}
              onView={() => pushToast("info", `Abriendo el panel de "${k.title}"`)}
            />
          </div>
        ))}
      </div>

      {/* Roadmap del proyecto */}
      <SectionLabel sub="Sigue el avance del proyecto etapa por etapa">Roadmap</SectionLabel>
      <Panel>
        <Roadmap stages={roadmapStages} />
      </Panel>
    </>
  );
}

