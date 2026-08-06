/**
 * prototypes/comparativo/LayoutEspejo.jsx
 * ------------------------------------------------------------------
 * PROPUESTA A · "Cinta y espejo"  (la descrita en el plan)
 *
 * Hipótesis de diseño:
 *   El veredicto es una CINTA a ancho completo, y debajo las dos fechas
 *   se reflejan una contra otra con un canal central estrecho donde
 *   viven los deltas.
 *
 * Por qué podría ganar:
 *   • La simetría hace que la FORMA de la pantalla comunique su función
 *     ("esto contra aquello") antes de leer un solo número.
 *   • A y B pesan exactamente lo mismo: no sugiere que una fecha sea más
 *     importante que la otra, lo cual es correcto cuando el usuario aún
 *     no sabe cuál fue mejor.
 *   • El canal central rescata los deltas del último panel, donde hoy
 *     están exiliados, sin robarle protagonismo a la evidencia.
 *
 * Riesgo:
 *   El espejo obliga a alinear B a la derecha, y leer cifras alineadas
 *   a la derecha es ligeramente más lento en un idioma que se lee de
 *   izquierda a derecha. Hay que comprobar si molesta en uso real.
 */
import { Panel } from "@/components/ui/index.js";
import { DeltaChip, MetricCell, SideHeader, MiniTrend, CauseLine, sharedDomain, verdictColors } from "@/features/machines/components/comparativoUi.jsx";
import { signed } from "@/features/machines/lib/compare.js";

/** Cinta de veredicto a ancho completo. */
function VerdictBand({ v, t }) {
  const { fg, bg } = verdictColors(v.state, t);
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
        padding: "16px 22px", borderRadius: 14,
        background: bg, border: `1px solid ${fg}33`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 40, fontWeight: 700, color: fg, lineHeight: 1 }}>
          {v.oee ? signed(v.oee.delta) : "—"}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: fg, opacity: 0.8 }}>pts</span>
      </div>
      <div style={{ minWidth: 220, flex: 1 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: t.text, marginBottom: 3 }}>{v.headline}</div>
        <CauseLine v={v} t={t} />
      </div>
    </div>
  );
}

/** Una de las dos columnas espejo. */
function MirrorSide({ label, iso, snap, trend, accent, t, domain, domId, align }) {
  const right = align === "right";
  return (
    <Panel style={{ borderTop: `3px solid ${accent}`, borderRadius: 16, overflow: "hidden" }}>
      <div style={{ margin: "-20px -22px 14px", padding: "16px 22px 12px", background: `linear-gradient(${right ? "270deg" : "90deg"}, ${accent}14, transparent)` }}>
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

      <MiniTrend data={trend} accent={accent} t={t} domain={domain} id={domId} />
    </Panel>
  );
}

export default function LayoutEspejo({ model, t }) {
  const { dateA, dateB, snapA, snapB, trendA, trendB, cmp, v, colorA, colorB } = model;
  const domain = sharedDomain(trendA, trendB);
  const maxAbs = Math.max(...cmp.map((m) => Math.abs(m.delta)), 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <VerdictBand v={v} t={t} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 108px 1fr", gap: 12, alignItems: "stretch" }}>
        <MirrorSide label="Fecha A · base" iso={dateA} snap={snapA} trend={trendA} accent={colorA} t={t} domain={domain} domId="esp-a" align="left" />

        {/* Canal central: el eje de simetría donde vive la diferencia. */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, padding: "8px 0" }}>
          {cmp.map((m) => (
            <div key={m.key} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9.5, color: t.textFaint, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 }}>
                {m.short}
              </div>
              <DeltaChip metric={m} t={t} size="sm" showBar max={maxAbs} />
            </div>
          ))}
        </div>

        <MirrorSide label="Fecha B · sujeto" iso={dateB} snap={snapB} trend={trendB} accent={colorB} t={t} domain={domain} domId="esp-b" align="right" />
      </div>
    </div>
  );
}
