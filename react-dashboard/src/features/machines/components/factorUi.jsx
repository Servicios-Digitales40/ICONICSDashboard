/**
 * Piezas de UI compartidas por las subvistas de factor del detalle de máquina
 * (Disponibilidad, Calidad, Rendimiento).
 *
 * Todas reciben el tema `t` por prop, en lugar de llamar a useTheme, para que
 * las subvistas sigan siendo componentes tontos y fáciles de testear.
 *
 * El nombre va en camelCase porque el archivo exporta varios componentes
 * hermanos sin uno principal.
 */
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { ChartTooltip } from "@/components/charts/index.js";
import { Panel } from "@/components/ui/index.js";
import { fmtNum } from "@/lib/format.js";
import { clampPct, bandColor } from "@/lib/shiftModel.js";

/*
 * Los tres factores se cuentan igual: una fórmula (numerador/denominador), un
 * desglose en barras y un dial contra su meta; solo cambian las unidades.
 * Están centralizados para que no diverjan visualmente y parezca que miden
 * cosas distintas.
 */

/**
 * Tira con la fórmula del factor y sus valores reales sustituidos. Es el
 * puente entre el porcentaje y las magnitudes que lo producen.
 *
 *   num / den : { label, value } — `value` ya formateado
 */
export function FormulaStrip({ titulo, num, den, result, color, t }) {
  const V = t.viz;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 18, flexWrap: "wrap",
        padding: "14px 18px", borderRadius: 12,
        background: `linear-gradient(135deg, ${V.azul}14, ${V.azul}05)`,
        border: `1px solid ${V.azul}33`,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{titulo} =</span>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11.5, color: t.textSoft, paddingBottom: 4, borderBottom: `1.5px solid ${t.border}` }}>
          {num.label} <strong style={{ fontFamily: "'IBM Plex Mono', monospace", color: V.azul }}>{num.value}</strong>
        </div>
        <div style={{ fontSize: 11.5, color: t.textSoft, paddingTop: 4 }}>
          {den.label} <strong style={{ fontFamily: "'IBM Plex Mono', monospace", color: t.text }}>{den.value}</strong>
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>=</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color }}>
        {fmtNum(result)}<span style={{ fontSize: 15, opacity: 0.7 }}>%</span>
      </span>
    </div>
  );
}

/**
 * Fila de desglose: la barra de lo que sobrevive con el trozo de pérdida
 * pegado a su derecha. Ambas se escalan contra el total, que es lo que permite
 * compararlas entre filas.
 */
export function WaterfallRow({ label, value, loss, lossLabel, total, color, lossColor, format, t, i = 0, hero }) {
  const fmt = format ?? ((n) => Math.round(n).toLocaleString("es-MX"));
  const w = (value / total) * 100;
  const lw = loss ? (loss / total) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
      <span style={{ width: 210, flexShrink: 0, fontSize: 12.5, fontWeight: hero ? 700 : 500, color: hero ? t.text : t.textSoft }}>
        {label}
      </span>
      <div style={{ flex: 1, position: "relative", height: 34, display: "flex", alignItems: "center" }}>
        {/* pista del total, como referencia de fondo */}
        <div style={{ position: "absolute", inset: "6px 0", borderRadius: 6, background: t.hover, border: `1px solid ${t.border}` }} />
        <div
          style={{
            position: "relative", height: 28, width: `${w}%`, borderRadius: 6,
            background: `linear-gradient(90deg, ${color}, ${color}bb)`,
            boxShadow: hero ? `0 0 16px ${color}55` : "none",
            display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8,
            transformOrigin: "left center", animation: `mdGrow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 90}ms both`,
          }}
        >
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}>
            {fmt(value)}
          </span>
        </div>
        {loss > 0 && (
          <div
            style={{
              position: "relative", height: 28, width: `${lw}%`, borderRadius: 6, marginLeft: 3,
              background: lossColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              transformOrigin: "left center", animation: `mdGrow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 90 + 200}ms both`,
            }}
            title={`${lossLabel}: ${fmt(loss)}`}
          >
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
              −{fmt(loss)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* `BandGauge` y `KpiTile` viven ahora en `@/components/ui`: son
   presentacionales puros y los necesita también el dashboard. */

/** Keyframes compartidos por las subvistas. Se renderiza una vez por vista. */
export function MdKeyframes() {
  return (
    <style>{`
      @keyframes mdGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      @keyframes mdPop  { from { transform: scale(0.2); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      @media (prefers-reduced-motion: reduce) {
        [style*="mdGrow"], [style*="mdPop"] { animation: none !important; }
      }
    `}</style>
  );
}

/**
 * Panel de ausencia de lecturas.
 *
 * Las subvistas de factor derivan casi todo de dos o tres mediciones. Cuando
 * faltan, el desglose entero deja de tener sentido y sale más a cuenta decirlo
 * una vez que proteger treinta puntos de formateo uno a uno.
 *
 * Es distinto de «no hubo producción», que sí es una lectura válida y cada
 * vista comunica a su manera.
 */
export function SinLecturas({ que, t }) {
  return (
    <Panel>
      <p style={{ textAlign: "center", fontSize: 13, color: t.textFaint, margin: "28px 0 6px" }}>
        Sin lecturas de {que} para este equipo.
      </p>
      <p style={{ textAlign: "center", fontSize: 11.5, color: t.textFaint, margin: "0 0 28px", opacity: 0.8 }}>
        Puede ser mala calidad del dato, un tag no configurado o que aún no haya llegado la primera lectura.
      </p>
    </Panel>
  );
}

/* Encabezado de propuesta (andamiaje del modo comparación de diseño).
   Se elimina junto con las opciones descartadas cuando se elija una. */
export function OptionSection({ tag, title, desc, accent, t, children }) {
  return (
    <section style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: `2px solid ${accent}` }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: accent, background: `${accent}18`, border: `1px solid ${accent}44`, borderRadius: 6, padding: "2px 8px" }}>
          {tag}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{title}</span>
        <span style={{ fontSize: 12, color: t.textFaint, marginLeft: "auto" }}>{desc}</span>
      </div>
      {children}
    </section>
  );
}

/* Pastilla-KPI compacta usada bajo las gráficas de cada subvista. */
export function MiniStat({ label, value, color, t }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "4px 8px" }}>
      <div style={{ fontSize: 10.5, color: t.textFaint, letterSpacing: 0.6, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 700, color: color || t.text, marginTop: 3 }}>{value}</div>
    </div>
  );
}

/* Tendencia (área) de una métrica 0–100 con líneas de referencia opcionales. */
export function TrendArea({ data, dataKey, color, t, refs = [] }) {
  const gid = `fill-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.34} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="t" tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} width={34} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: t.grid }} />
        {refs.map((r) => (
          <ReferenceLine
            key={r.y}
            y={r.y}
            stroke={r.color}
            strokeDasharray="4 4"
            strokeOpacity={0.7}
            label={{ value: r.label, position: "right", fontSize: 10, fill: r.color }}
          />
        ))}
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} fill={`url(#${gid})`} dot={{ r: 2.5, fill: color, strokeWidth: 0 }} activeDot={{ r: 5 }} animationDuration={600} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* Barras verticales de una métrica por hora. */
export function TrendBars({ data, dataKey, color, t }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="t" tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} width={34} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: t.hover }} />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} animationDuration={600} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* Dona de dos porciones con valor central. */
export function DonutSplit({ okValue, koValue, okColor, koColor, centerLabel, centerValue, t }) {
  const data = [
    { name: "ok", value: okValue },
    { name: "ko", value: koValue },
  ];
  return (
    <div style={{ position: "relative" }}>
      <ResponsiveContainer width="100%" height={230}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={62} outerRadius={92} startAngle={90} endAngle={-270} paddingAngle={2} stroke="none" animationDuration={600}>
            <Cell fill={okColor} />
            <Cell fill={koColor} />
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ fontSize: 10.5, color: t.textFaint, letterSpacing: 0.6, fontWeight: 600, textTransform: "uppercase" }}>{centerLabel}</div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color: t.text }}>{centerValue}</div>
      </div>
    </div>
  );
}
