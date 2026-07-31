/**
 * Piezas visuales de la vista comparativa: el titular sobre dos columnas
 * espejo. El banco de pruebas de `prototypes/comparativo/` las consume por
 * re-exportación, así que hay una sola definición y no se desincronizan.
 *
 * Reglas de color que conviene no romper:
 *
 *  - El color de identidad (azul/violeta) codifica solo qué fecha es.
 *  - Verde y coral se reservan a la dirección del cambio.
 *  - Ninguna métrica tiene color propio: la identifican la etiqueta y la
 *    posición, no el tono.
 *
 * Todo el cálculo vive en `compare.js`; aquí solo se pinta.
 */
import {
  AreaChart, Area, ComposedChart, Line, ResponsiveContainer,
  YAxis, XAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { ArrowUp, ArrowDown, Minus, AlertTriangle } from "lucide-react";
import { Panel } from "@/components/ui/index.js";
import { fmtDay, signed, niceDomain, METAS } from "../lib/compare.js";

/** Colores del veredicto. Gris cuando el cambio no es significativo. */
export function verdictColors(state, t) {
  if (state === "up") return { fg: t.success, bg: t.successSoft };
  if (state === "down") return { fg: t.coral, bg: t.coralSoft };
  return { fg: t.textFaint, bg: t.hover };
}

/**
 * Pastilla de delta con zona muerta: por debajo de DEAD_BAND se pinta en gris
 * y sin flecha, para que un +0.1 no reciba el mismo verde que un +12.
 */
export function DeltaChip({ metric, t, size = "md", showBar = false, max = 10 }) {
  const { fg, bg } = verdictColors(metric.direction, t);
  const Icon = metric.direction === "up" ? ArrowUp : metric.direction === "down" ? ArrowDown : Minus;
  const S = size === "lg"
    ? { font: 20, pad: "5px 12px", icon: 16 }
    : size === "sm"
      ? { font: 12, pad: "2px 7px", icon: 11 }
      : { font: 14.5, pad: "3px 9px", icon: 13 };

  // Micro-barra divergente: separa de un vistazo la señal fuerte de la
  // apenas significativa, que el número por sí solo no distingue.
  const pct = Math.min(100, (Math.abs(metric.delta) / max) * 100);

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <span
        style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          background: bg, color: fg, borderRadius: 999, padding: S.pad,
          fontFamily: "'IBM Plex Mono', monospace", fontSize: S.font, fontWeight: 700,
          lineHeight: 1.2, whiteSpace: "nowrap",
        }}
      >
        <Icon size={S.icon} strokeWidth={2.6} />
        {metric.missing ? "—" : signed(metric.delta)}
      </span>
      {showBar && !metric.missing && (
        <span style={{ position: "relative", width: 44, height: 3, borderRadius: 2, background: t.border }}>
          <span style={{
            position: "absolute", left: "50%", top: 0, height: 3, borderRadius: 2, background: fg,
            width: `${pct / 2}%`, transform: metric.delta < 0 ? "translateX(-100%)" : "none",
          }} />
        </span>
      )}
    </span>
  );
}

/** Valor de UNA métrica en UN lado. El color viene de la fecha, no de la métrica. */
export function MetricCell({ label, value, accent, t, compact = false }) {
  return (
    <div style={{ textAlign: "center", minWidth: 0 }}>
      <div style={{
        fontSize: 11, color: t.textFaint, letterSpacing: 0.4, fontWeight: 600,
        textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {label}
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: compact ? 15 : 17, fontWeight: 700, color: accent, marginTop: 2 }}>
        {value == null ? "—" : `${value.toFixed(1)}%`}
      </div>
    </div>
  );
}

/** Cabecera de un lado: punto de color, rótulo, fecha y OEE grande. */
export function SideHeader({ label, iso, snap, accent, t, align = "left" }) {
  const right = align === "right";
  return (
    <div style={{ display: "flex", flexDirection: right ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: accent, boxShadow: `0 0 0 3px ${accent}22`, flexShrink: 0 }} />
      <div style={{ textAlign: right ? "right" : "left", minWidth: 0 }}>
        <div style={{ fontSize: 10.5, color: t.textFaint, letterSpacing: 0.6, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5, fontWeight: 700, color: t.text }}>{fmtDay(iso)}</div>
      </div>
      <div style={{ [right ? "marginRight" : "marginLeft"]: "auto", textAlign: right ? "left" : "right" }}>
        <div style={{ fontSize: 10.5, color: t.textFaint, letterSpacing: 0.6, fontWeight: 700, textTransform: "uppercase" }}>OEE</div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1 }}>
          {snap?.oee != null ? snap.oee.toFixed(1) : "—"}<span style={{ fontSize: 14, opacity: 0.7 }}>%</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Mini-tendencia de un día.
 *
 * Recibe el dominio ya calculado y compartido entre A y B: con escalas
 * distintas, la misma altura significaría valores diferentes en cada columna.
 *
 * `showAxis` se activa en la vista real porque el dominio está recortado y sin
 * eje el lector se queda sin referencia absoluta. En miniaturas donde el eje
 * no cabe hay que dar la escala por otro medio.
 */
export function MiniTrend({ data, accent, t, domain, height = 110, id, showAxis = false }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: showAxis ? -26 : 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.32} />
            <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <YAxis
          domain={domain} hide={!showAxis} width={34}
          tick={{ fontSize: 11, fill: t.textSoft }} axisLine={false} tickLine={false}
        />
        {showAxis && (
          <XAxis
            dataKey="t" tick={{ fontSize: 10.5, fill: t.textSoft }} axisLine={{ stroke: t.grid }}
            tickLine={false} interval="preserveStartEnd"
          />
        )}
        <Area type="monotone" dataKey="oee" stroke={accent} strokeWidth={2} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Dominio común a las dos series de un comparativo. */
export const sharedDomain = (trendA, trendB) =>
  niceDomain([...(trendA ?? []), ...(trendB ?? [])].map((r) => r.oee), { pad: 6 });

/**
 * Frase de causa: qué métrica empujó y cuál frenó. Sin ella el titular dice
 * «subió» pero no deja nada sobre lo que actuar.
 */
export function CauseLine({ v, t, size = 12.5 }) {
  if (!v.driver && !v.drag) return null;
  return (
    <div style={{ fontSize: size, color: t.textSoft, lineHeight: 1.5 }}>
      {v.driver && (
        <>impulsado por <strong style={{ color: t.text }}>{v.driver.label}</strong>{" "}
          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>({signed(v.driver.delta)})</span></>
      )}
      {v.driver && v.drag && <span style={{ color: t.textFaint }}> · </span>}
      {v.drag && (
        <>frenado por <strong style={{ color: t.text }}>{v.drag.label}</strong>{" "}
          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>({signed(v.drag.delta)})</span></>
      )}
    </div>
  );
}

/**
 * Titular: la conclusión, sin competencia visual. La cifra grande y la frase
 * responden «¿mejoramos?» de un vistazo, y las columnas de abajo quedan como
 * la evidencia que lo sostiene.
 */
export function VerdictHeadline({ v, t }) {
  const { fg, bg } = verdictColors(v.state, t);
  return (
    <Panel style={{ background: bg, borderColor: `${fg}33` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 68, fontWeight: 700,
            color: fg, lineHeight: 0.9, letterSpacing: -2,
          }}>
            {v.oee ? signed(v.oee.delta) : "—"}
          </span>
          <span style={{ fontSize: 18, fontWeight: 600, color: fg, opacity: 0.75 }}>pts</span>
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{
            fontSize: 21, fontWeight: 700, color: t.text, lineHeight: 1.25,
            marginBottom: 6, fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            {v.headline}
          </div>
          <CauseLine v={v} t={t} size={13.5} />
        </div>
      </div>
    </Panel>
  );
}

/*
 * Dumbbell por métrica, en lugar de barras agrupadas.
 *
 * Con 4 métricas × 2 series, las barras obligan a comparar alturas dentro de
 * cada par y luego entre pares. El dumbbell codifica la diferencia como
 * longitud de un segmento, que es la variable de interés: las cuatro brechas
 * se leen de un vistazo y el color del conector da la dirección.
 *
 * Va en HTML posicionado y no en SVG: son cuatro filas con dos puntos cada
 * una, y el posicionamiento porcentual es responsive por construcción, sin
 * ResponsiveContainer ni recálculos en resize.
 */

/** Una fila: etiqueta · pista con los dos puntos y su conector · delta. */
function DumbbellRow({ m, lo, hi, colorA, colorB, t, maxAbs }) {
  const pos = (v) => ((v - lo) / (hi - lo)) * 100;
  const { fg } = verdictColors(m.direction, t);
  const strong = m.primary;

  const pA = m.a == null ? null : pos(m.a);
  const pB = m.b == null ? null : pos(m.b);
  const meta = m.meta != null && m.meta >= lo && m.meta <= hi ? pos(m.meta) : null;
  const dot = strong ? 13 : 11;

  return (
    <>
      <div style={{
        fontSize: strong ? 13.5 : 12.5, fontWeight: strong ? 700 : 600,
        color: strong ? t.text : t.textSoft, paddingRight: 10, whiteSpace: "nowrap",
      }}>
        {m.label}
      </div>

      <div style={{ position: "relative", height: 30 }}>
        {/* pista */}
        <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 2, marginTop: -1, background: t.grid, borderRadius: 2 }} />

        {/* marca de meta: la referencia absoluta que el eje recortado no da */}
        {meta != null && (
          <div
            title={`Meta ${m.meta}%`}
            style={{
              position: "absolute", left: `${meta}%`, top: 3, bottom: 3, width: 0,
              borderLeft: `2px dashed ${t.textFaint}`, opacity: 0.65,
            }}
          />
        )}

        {/* conector A→B: su longitud es la diferencia */}
        {pA != null && pB != null && (
          <div style={{
            position: "absolute", top: "50%", height: strong ? 6 : 5, marginTop: strong ? -3 : -2.5,
            left: `${Math.min(pA, pB)}%`, width: `${Math.abs(pB - pA)}%`,
            background: fg, borderRadius: 3, opacity: m.significant ? 0.9 : 0.35,
          }} />
        )}

        {[[pA, colorA, "A"], [pB, colorB, "B"]].map(([p, c, k]) =>
          p == null ? null : (
            <div
              key={k}
              title={`${k}: ${(k === "A" ? m.a : m.b).toFixed(1)}%`}
              style={{
                position: "absolute", left: `${p}%`, top: "50%",
                width: dot, height: dot, marginLeft: -dot / 2, marginTop: -dot / 2,
                borderRadius: "50%", background: c, border: `2px solid ${t.panel}`,
                boxShadow: `0 0 0 1px ${c}66`,
              }}
            />
          )
        )}
      </div>

      <div style={{ textAlign: "right", paddingLeft: 10 }}>
        <DeltaChip metric={m} t={t} size={strong ? "md" : "sm"} showBar max={maxAbs} />
      </div>
    </>
  );
}

/**
 * Dumbbell de las cuatro métricas, todas sobre la misma escala. Compartirla
 * permite comparar también en vertical («Calidad va por delante de
 * Disponibilidad»), lectura que las barras agrupadas ya daban.
 */
export function MetricDumbbell({ cmp, colorA, colorB, t, maxAbs }) {
  const valores = cmp.flatMap((m) => [m.a, m.b]).filter((v) => v != null);
  const [lo, hi] = niceDomain(valores, { pad: 6 });
  const ticks = [lo, (lo + hi) / 2, hi];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(96px, auto) 1fr minmax(74px, auto)", alignItems: "center", gap: "12px 0" }}>
      {cmp.map((m) => (
        <DumbbellRow key={m.key} m={m} lo={lo} hi={hi} colorA={colorA} colorB={colorB} t={t} maxAbs={maxAbs} />
      ))}

      {/* Eje con sus valores. El dominio está recortado para que las
          diferencias se vean, así que hace falta poder situar los puntos
          en su escala real. */}
      <div />
      <div style={{ position: "relative", height: 20, marginTop: 4, borderTop: `1px solid ${t.border}` }}>
        {ticks.map((v) => (
          <span
            key={v}
            style={{
              position: "absolute", left: `${((v - lo) / (hi - lo)) * 100}%`, top: 4,
              transform: "translateX(-50%)", fontSize: 11, color: t.textFaint,
              fontFamily: "'IBM Plex Mono', monospace", whiteSpace: "nowrap",
            }}
          >
            {v}%
          </span>
        ))}
      </div>
      <div />
    </div>
  );
}

/* Banda de diferencia por hora. */

/** Tooltip que muestra A, B y Δ juntos, con la resta ya hecha. */
export function CompareTooltip({ active, payload, label, t, dateA, dateB }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const d = row.A == null || row.B == null ? null : +(row.B - row.A).toFixed(1);
  const color = d == null ? t.textFaint : Math.abs(d) < 1 ? t.textFaint : d > 0 ? t.success : t.coral;

  return (
    <div style={{
      background: t.panel, border: `1px solid ${t.border}`, borderRadius: 8,
      padding: "9px 12px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
      boxShadow: t.shadowHover, minWidth: 150,
    }}>
      <div style={{ color: t.text, fontWeight: 700, marginBottom: 5 }}>{label}</div>
      <TipRow label={fmtDay(dateA)} value={row.A} color={t.textSoft} />
      <TipRow label={fmtDay(dateB)} value={row.B} color={t.textSoft} />
      <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 5, paddingTop: 5, display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: t.textFaint }}>Δ</span>
        <strong style={{ color }}>{d == null ? "—" : signed(d)}</strong>
      </div>
    </div>
  );
}

function TipRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color }}>
      <span>{label}</span>
      <span>{value == null ? "—" : `${value.toFixed(1)}%`}</span>
    </div>
  );
}

/**
 * Leyenda propia: la de recharts no explica que el trazo punteado es la
 * referencia ni qué codifican los dos rellenos, que es lo que hace falta
 * saber para leer esta gráfica.
 */
export function DiffLegend({ dateA, dateB, colorA, colorB, t }) {
  const Item = ({ children }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: t.textSoft, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", alignItems: "center" }}>
      <Item>
        <svg width="22" height="8" aria-hidden><line x1="0" y1="4" x2="22" y2="4" stroke={colorA} strokeWidth="2" strokeDasharray="5 4" /></svg>
        {fmtDay(dateA)} <span style={{ color: t.textFaint }}>· base</span>
      </Item>
      <Item>
        <svg width="22" height="8" aria-hidden><line x1="0" y1="4" x2="22" y2="4" stroke={colorB} strokeWidth="2.4" /></svg>
        {fmtDay(dateB)} <span style={{ color: t.textFaint }}>· sujeto</span>
      </Item>
      <Item>
        <span style={{ width: 13, height: 10, borderRadius: 3, background: t.success, opacity: 0.45 }} />
        B por encima
      </Item>
      <Item>
        <span style={{ width: 13, height: 10, borderRadius: 3, background: t.coral, opacity: 0.45 }} />
        B por debajo
      </Item>
    </div>
  );
}

/**
 * OEE por hora con la diferencia rellena entre las dos series:
 *
 *  - A va en línea punteada (la referencia).
 *  - B va en línea sólida (el sujeto).
 *  - El área entre ambas se rellena verde donde B>A y coral donde B<A.
 *
 * Así se ve en qué horas se ganó o se perdió, que es la pregunta operativa,
 * en vez del nivel absoluto de cada serie.
 *
 * El relleno se consigue apilando tres series: `lower` (el mínimo, invisible)
 * más `gapUp` o `gapDown`, de las que solo una es distinta de cero en cada
 * punto. La suma reproduce la banda [min, max] y el color lo pone la activa.
 */
export function HourlyDiff({ overlay, dateA, dateB, colorA, colorB, t, height = 300 }) {
  const data = overlay.map((r) => {
    const { A, B } = r;
    if (A == null || B == null) return { ...r, lower: null, gapUp: 0, gapDown: 0 };
    const lower = Math.min(A, B);
    return { ...r, lower, gapUp: B > A ? B - A : 0, gapDown: B < A ? A - B : 0 };
  });

  const [lo, hi] = niceDomain(data.flatMap((r) => [r.A, r.B]).filter((v) => v != null), { pad: 6 });
  const meta = METAS.oee;
  const showMeta = meta >= lo && meta <= hi;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="t" tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} />
        <YAxis domain={[lo, hi]} tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} width={40} />
        <Tooltip content={<CompareTooltip t={t} dateA={dateA} dateB={dateB} />} cursor={{ stroke: t.textFaint, strokeDasharray: "3 3" }} />

        {/* Referencia absoluta, para que el eje recortado no engañe. */}
        {showMeta && (
          <ReferenceLine
            y={meta} stroke={t.textFaint} strokeDasharray="4 4"
            label={{ value: `meta ${meta}%`, position: "right", fill: t.textFaint, fontSize: 11 }}
          />
        )}

        {/* Banda de diferencia, apilada como se describe arriba. */}
        <Area dataKey="lower" stackId="band" stroke="none" fill="none" isAnimationActive={false} legendType="none" />
        <Area dataKey="gapUp" stackId="band" stroke="none" fill={t.success} fillOpacity={0.28} isAnimationActive={false} legendType="none" />
        <Area dataKey="gapDown" stackId="band" stroke="none" fill={t.coral} fillOpacity={0.28} isAnimationActive={false} legendType="none" />

        {/* Las dos series encima de la banda. */}
        <Line type="monotone" dataKey="A" name={fmtDay(dateA)} stroke={colorA} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="B" name={fmtDay(dateB)} stroke={colorB} strokeWidth={2.4} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * Estado degenerado: la misma fecha en A y en B.
 *
 * Ocupa el hueco del titular para que este no afirme «sin cambio en el OEE»,
 * que siendo cierto sugiere que se compararon dos días y salieron iguales.
 */
export function SameDateNotice({ iso, t }) {
  return (
    <Panel style={{ background: t.hover, borderColor: `${t.amber}44` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <AlertTriangle size={26} color={t.amber} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: t.text, marginBottom: 3, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Estás comparando {fmtDay(iso)} consigo mismo
          </div>
          <div style={{ fontSize: 12.5, color: t.textSoft }}>
            Elige una segunda fecha distinta —o usa uno de los atajos de arriba— para obtener una comparación.
          </div>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Aviso sobre el estado de la lectura del historiador (leyendo, sin historia,
 * error), no sobre el dato.
 *
 * Ocupa el mismo hueco que el titular: es donde la vista responde
 * «¿mejoramos?», así que cuando no se puede responder hay que decir por qué
 * ahí mismo, en vez de rellenarlo con ceros o una estimación.
 */
export function HistoryNotice({ icon, titulo, detalle, tono = "neutro", t }) {
  const color = tono === "error" ? t.coral : tono === "aviso" ? t.amber : t.textFaint;
  return (
    <Panel style={{ background: t.hover, borderColor: `${color}44` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ display: "flex", color, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: t.text, marginBottom: 3, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {titulo}
          </div>
          <div style={{ fontSize: 12.5, color: t.textSoft, lineHeight: 1.5 }}>{detalle}</div>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Una de las dos columnas espejo. `align="right"` refleja el contenido
 * para que las dos fechas se enfrenten a través del canal central.
 */
export function MirrorSide({ label, iso, snap, trend, accent, t, domain, domId, align, className }) {
  const right = align === "right";
  return (
    <Panel className={className} style={{ borderTop: `3px solid ${accent}`, overflow: "hidden" }}>
      <div style={{
        margin: "-20px -22px 14px", padding: "16px 22px 12px",
        background: `linear-gradient(${right ? "270deg" : "90deg"}, ${accent}14, transparent)`,
      }}>
        <SideHeader label={label} iso={iso} snap={snap} accent={accent} t={t} align={align} />
      </div>

      <div style={{ display: "flex", flexDirection: right ? "row-reverse" : "row", gap: 8, marginBottom: 12 }}>
        {[
          ["Disponibilidad", snap?.disponibilidad],
          ["Rendimiento", snap?.rendimiento],
          ["Calidad", snap?.calidad],
        ].map(([k, val]) => (
          <div key={k} style={{ flex: 1, padding: "8px 4px", borderRadius: 10, background: t.hover, border: `1px solid ${t.border}` }}>
            <MetricCell label={k} value={val} accent={accent} t={t} compact />
          </div>
        ))}
      </div>

      <MiniTrend data={trend} accent={accent} t={t} domain={domain} id={domId} height={124} showAxis />
    </Panel>
  );
}
