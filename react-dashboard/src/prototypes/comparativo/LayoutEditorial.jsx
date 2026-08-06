/**
 * prototypes/comparativo/LayoutEditorial.jsx
 * ------------------------------------------------------------------
 * PROPUESTA C · "Titular editorial"
 *
 * Hipótesis de diseño:
 *   Jerarquía deliberadamente DESEQUILIBRADA. La conclusión se trata
 *   como el titular de una portada — cifra enorme, frase en grande — y
 *   las dos fechas se degradan a una tira de evidencia compacta debajo,
 *   con las métricas enfrentadas fila a fila.
 *
 * Por qué podría ganar:
 *   • Responde "¿mejoramos?" en la primera fijación ocular, sin
 *     competencia visual de ningún tipo. Es la más rápida de leer.
 *   • La tabla enfrentada A│Δ│B pone los tres números de cada métrica en
 *     la MISMA línea: comparar deja de requerir movimiento ocular
 *     vertical, que es donde se pierde precisión.
 *   • Escala bien a móvil sin rediseño: ya es una pila vertical.
 *
 * Riesgo:
 *   Al subordinar la evidencia, invita a creerse el titular sin
 *   verificarlo — justo lo contrario de lo que quiere un operador que
 *   necesita diagnosticar. También desperdicia ancho en pantallas
 *   grandes, donde el espejo aprovecha mejor el espacio horizontal.
 */
import { Panel } from "@/components/ui/index.js";
import { DeltaChip, MiniTrend, CauseLine, sharedDomain, verdictColors } from "@/features/machines/components/comparativoUi.jsx";
import { fmtDay, signed } from "@/features/machines/lib/compare.js";

export default function LayoutEditorial({ model, t }) {
  const { dateA, dateB, snapA, snapB, trendA, trendB, cmp, v, colorA, colorB } = model;
  const domain = sharedDomain(trendA, trendB);
  const maxAbs = Math.max(...cmp.map((m) => Math.abs(m.delta)), 5);
  const { fg, bg } = verdictColors(v.state, t);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* TITULAR — la conclusión sin competencia visual. */}
      <Panel style={{ background: bg, borderColor: `${fg}33` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 68, fontWeight: 700, color: fg, lineHeight: 0.9, letterSpacing: -2 }}>
              {v.oee ? signed(v.oee.delta) : "—"}
            </span>
            <span style={{ fontSize: 18, fontWeight: 600, color: fg, opacity: 0.75 }}>pts</span>
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 21, fontWeight: 700, color: t.text, lineHeight: 1.25, marginBottom: 6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {v.headline}
            </div>
            <CauseLine v={v} t={t} size={13.5} />
          </div>
        </div>
      </Panel>

      {/* EVIDENCIA — tabla enfrentada: los tres números en la misma línea. */}
      <Panel title="La evidencia" code={`${fmtDay(dateA)}  vs.  ${fmtDay(dateB)}`}>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 100px 90px 100px", alignItems: "center", gap: "0 12px" }}>
          {/* encabezado */}
          <div />
          {[[dateA, colorA, "A · base"], [null, null, "Δ"], [dateB, colorB, "B · sujeto"]].map(([iso, c, lbl], i) => (
            <div key={i} style={{ textAlign: "center", paddingBottom: 10 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {c && <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, boxShadow: `0 0 0 3px ${c}22` }} />}
                <span style={{ fontSize: 10.5, color: c || t.textFaint, letterSpacing: 0.6, fontWeight: 700, textTransform: "uppercase" }}>{lbl}</span>
              </div>
            </div>
          ))}

          {cmp.map((m) => (
            <Row key={m.key} m={m} t={t} colorA={colorA} colorB={colorB} maxAbs={maxAbs} />
          ))}
        </div>

        {/* Tendencias como pie de página: presentes, pero subordinadas. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${t.border}` }}>
          {[[trendA, colorA, dateA, "edi-a"], [trendB, colorB, dateB, "edi-b"]].map(([data, c, iso, id]) => (
            <div key={id}>
              <div style={{ fontSize: 10.5, color: t.textFaint, letterSpacing: 0.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                OEE por hora · {fmtDay(iso)}
              </div>
              <MiniTrend data={data} accent={c} t={t} domain={domain} id={id} height={84} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/** Una métrica: etiqueta, valor A, delta, valor B — todo en la misma línea. */
function Row({ m, t, colorA, colorB, maxAbs }) {
  const strong = m.primary;
  const cell = (val, color) => (
    <div style={{
      textAlign: "center", fontFamily: "'IBM Plex Mono', monospace",
      fontSize: strong ? 20 : 16, fontWeight: 700, color,
    }}>
      {val == null ? "—" : `${val.toFixed(1)}%`}
    </div>
  );

  return (
    <>
      <div style={{
        fontSize: strong ? 14 : 13, fontWeight: strong ? 700 : 600,
        color: strong ? t.text : t.textSoft,
        padding: "11px 0", borderTop: `1px solid ${t.border}`,
      }}>
        {m.label}
      </div>
      <div style={{ padding: "11px 0", borderTop: `1px solid ${t.border}` }}>{cell(m.a, colorA)}</div>
      <div style={{ padding: "11px 0", borderTop: `1px solid ${t.border}`, textAlign: "center" }}>
        <DeltaChip metric={m} t={t} size={strong ? "md" : "sm"} showBar max={maxAbs} />
      </div>
      <div style={{ padding: "11px 0", borderTop: `1px solid ${t.border}` }}>{cell(m.b, colorB)}</div>
    </>
  );
}
