/**
 * prototypes/comparativo/LayoutBalanza.jsx
 * ------------------------------------------------------------------
 * PROPUESTA B · "Balanza"
 *
 * Hipótesis de diseño:
 *   El veredicto NO va arriba: va FÍSICAMENTE EN MEDIO de las dos
 *   fechas, como el fiel de una balanza. La columna central absorbe la
 *   cinta y el canal de deltas de la propuesta A y los funde en una
 *   sola pieza vertical.
 *
 * Por qué podría ganar:
 *   • Es la expresión estructural más literal de "A contra B": el
 *     resultado ocupa el punto de equilibrio entre ambos platillos.
 *   • Una sola zona de lectura para la conclusión, en lugar de dos
 *     (cinta arriba + deltas al centro). Menos saltos de mirada.
 *   • El gradiente de fondo del centro se inclina hacia el color del
 *     ganador: el resultado se percibe antes de leer la cifra.
 *
 * Riesgo:
 *   La columna central compite en peso visual con las dos laterales y
 *   la pantalla puede sentirse dividida en tres cosas iguales en vez de
 *   "dos datos y una conclusión". Además, en pantallas estrechas el
 *   centro se aplasta y hay que decidir a dónde cae.
 */
import { Panel } from "@/components/ui/index.js";
import { DeltaChip, MetricCell, MiniTrend, CauseLine, sharedDomain, verdictColors } from "@/features/machines/components/comparativoUi.jsx";
import { fmtDay, signed } from "@/features/machines/lib/compare.js";

/** Platillo: una fecha con su OEE, sus tres factores y su tendencia. */
function Pan({ label, iso, snap, trend, accent, t, domain, domId }) {
  return (
    <Panel style={{ borderTop: `3px solid ${accent}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: accent, boxShadow: `0 0 0 3px ${accent}22` }} />
        <span style={{ fontSize: 10.5, color: t.textFaint, letterSpacing: 0.6, fontWeight: 700, textTransform: "uppercase" }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: t.textSoft, marginBottom: 10 }}>
        {fmtDay(iso)}
      </div>

      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 46, fontWeight: 700, color: accent, lineHeight: 1, marginBottom: 2 }}>
        {snap ? snap.oee.toFixed(1) : "—"}<span style={{ fontSize: 20, opacity: 0.65 }}>%</span>
      </div>
      <div style={{ fontSize: 10.5, color: t.textFaint, letterSpacing: 0.6, fontWeight: 700, textTransform: "uppercase", marginBottom: 14 }}>OEE</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[
          ["Dispon.", snap?.disponibilidad],
          ["Rendim.", snap?.rendimiento],
          ["Calidad", snap?.calidad],
        ].map(([k, val]) => (
          <div key={k} style={{ flex: 1, padding: "8px 4px", borderRadius: 10, background: t.hover, border: `1px solid ${t.border}` }}>
            <MetricCell label={k} value={val} accent={accent} t={t} compact />
          </div>
        ))}
      </div>

      <MiniTrend data={trend} accent={accent} t={t} domain={domain} id={domId} height={96} />
    </Panel>
  );
}

export default function LayoutBalanza({ model, t }) {
  const { dateA, dateB, snapA, snapB, trendA, trendB, cmp, v, colorA, colorB } = model;
  const domain = sharedDomain(trendA, trendB);
  const maxAbs = Math.max(...cmp.map((m) => Math.abs(m.delta)), 5);
  const { fg, bg } = verdictColors(v.state, t);

  // El fondo del fiel se inclina hacia el color de la fecha ganadora:
  // el resultado se percibe por posición del peso, antes de leer nada.
  const ganador = v.state === "up" ? colorB : v.state === "down" ? colorA : null;
  const tilt = ganador
    ? `linear-gradient(${v.state === "up" ? "0deg" : "180deg"}, ${ganador}1A, transparent 70%)`
    : "transparent";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(210px, 0.75fr) 1fr", gap: 14, alignItems: "stretch" }}>
      <Pan label="Fecha A · base" iso={dateA} snap={snapA} trend={trendA} accent={colorA} t={t} domain={domain} domId="bal-a" />

      {/* El fiel de la balanza: conclusión + causa + deltas por métrica. */}
      <div
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12, padding: "22px 16px", borderRadius: 16, textAlign: "center",
          background: bg,
          backgroundImage: ganador ? tilt : undefined,
          border: `1px solid ${fg}33`,
        }}
      >
        <div style={{ fontSize: 10.5, color: t.textFaint, letterSpacing: 0.8, fontWeight: 700, textTransform: "uppercase" }}>
          Diferencia B − A
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 52, fontWeight: 700, color: fg, lineHeight: 0.95 }}>
            {v.oee ? signed(v.oee.delta) : "—"}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: fg, opacity: 0.75 }}>pts</span>
        </div>

        <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text, lineHeight: 1.4 }}>{v.headline}</div>
        <CauseLine v={v} t={t} size={12} align="center" />

        <div style={{ width: "100%", height: 1, background: t.border, margin: "2px 0" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
          {cmp.filter((m) => m.key !== "oee").map((m) => (
            <div key={m.key}>
              <div style={{ fontSize: 9.5, color: t.textFaint, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 }}>
                {m.short}
              </div>
              <DeltaChip metric={m} t={t} size="sm" showBar max={maxAbs} />
            </div>
          ))}
        </div>
      </div>

      <Pan label="Fecha B · sujeto" iso={dateB} snap={snapB} trend={trendB} accent={colorB} t={t} domain={domain} domId="bal-b" />
    </div>
  );
}
