/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/pages/Analytics.jsx
 * Motivo: página de la plantilla original «aurora-dashboard»; llevaba tiempo comentada en NAV y se retiró del router.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * pages/Analytics.jsx
 * ------------------------------------------------------------------
 * Vista de analíticas: línea, área apilada y barras en una fila,
 * más un ComposedChart a todo el ancho comparando ingresos, gastos
 * y meta. Incluye dos banners de "insights" a modo de resumen.
 */
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from "recharts";
import { useTheme } from "@/theme";
import { useData } from "../providers/DataProvider.jsx";
import { Panel, AlertBanner, ChartTooltip } from "../components/ui/index.js";

export default function Analytics() {
  const { theme: t } = useTheme();
  const { barData, lineData, areaData } = useData();

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        <AlertBanner
          type="info"
          title="Los usuarios activos crecieron 8% esta semana"
          message="El mayor incremento se registró los martes y jueves entre 10:00 y 12:00."
        />
        <AlertBanner
          type="warning"
          title="El tráfico pagado bajó respecto al mes anterior"
          message="Considera revisar el presupuesto de las campañas activas en el canal pagado."
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Panel title="Usuarios activos" code="LineChart">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={lineData}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="semana" tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: t.grid }} />
              <Line type="monotone" dataKey="usuarios" name="Usuarios" stroke={t.accent} strokeWidth={2.5} dot={{ r: 3, fill: t.accent, strokeWidth: 0 }} activeDot={{ r: 5 }} animationDuration={600} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Tráfico por canal" code="AreaChart">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={areaData}>
              <defs>
                <linearGradient id="fillOrganico" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={t.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={t.accent} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fillPagado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={t.amber} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={t.amber} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="semana" tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="organico" name="Orgánico" stroke={t.accent} strokeWidth={2} fill="url(#fillOrganico)" animationDuration={600} />
              <Area type="monotone" dataKey="pagado" name="Pagado" stroke={t.amber} strokeWidth={2} fill="url(#fillPagado)" animationDuration={600} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Ingresos por mes" code="BarChart">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: t.hover }} />
              <Bar dataKey="ingresos" fill={t.violet} name="Ingresos" radius={[4, 4, 0, 0]} animationDuration={600} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Ingresos vs. meta mensual" code="ComposedChart de ancho completo">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={barData}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: t.hover }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="gastos" fill={t.amber} name="Gastos" radius={[4, 4, 0, 0]} barSize={22} animationDuration={600} />
            <Bar dataKey="ingresos" fill={t.accent} name="Ingresos" radius={[4, 4, 0, 0]} barSize={22} animationDuration={600} />
            <Line type="monotone" dataKey="meta" name="Meta" stroke={t.coral} strokeWidth={2.5} dot={{ r: 3, fill: t.coral, strokeWidth: 0 }} animationDuration={600} />
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>
    </>
  );
}
