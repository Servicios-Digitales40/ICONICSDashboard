/**
 * prototypes/machine-cards/MachineCardEditorial.jsx
 * ------------------------------------------------------------------
 * Versión mejorada del Panel Editorial: mantiene el ADN suizo/plano,
 * pero añade iconos por factor, números con conteo animado (count-up),
 * barras que se llenan al entrar con marcador de meta + delta vs meta,
 * y una barra de progreso animada bajo el OEE gigante.
 */
import { useTheme } from "@/theme";
import { estadoInfo, oee as calcOee, oeeColor, clampPct, useCountUp, FACTOR_ICONS, METAS } from "./cardShared.js";

/* Barra plana con icono, meta y delta. */
function FlatBar({ icon: Icon, label, value, meta, color, t, i }) {
  const v = useCountUp(clampPct(value), 900 + i * 120);
  const delta = value - meta;
  return (
    <div style={{ borderTop: `1px solid ${t.border}`, padding: "9px 0 7px", animation: `edpIn 500ms ease both`, animationDelay: `${i * 90}ms` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: t.textSoft }}>
          <Icon size={14} color={color} strokeWidth={2.5} /> {label}
        </span>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 700, color: t.text, lineHeight: 1 }}>{v.toFixed(1)}<span style={{ fontSize: 12, color: t.textFaint }}>%</span></span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, fontWeight: 700, color: delta >= 0 ? t.success : t.coral }}>{delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(0)}</span>
        </span>
      </div>
      <div style={{ position: "relative", height: 10, background: t.hover }}>
        <div style={{ height: "100%", width: `${v}%`, background: color }} />
        <div title={`Meta ${meta}%`} style={{ position: "absolute", top: -2, bottom: -2, left: `${clampPct(meta)}%`, width: 2, background: t.text }} />
      </div>
    </div>
  );
}

export default function MachineCardEditorial({
  estado = "Operando", noParte, equipo,
  aprobadas = 0, rechazadas = 0,
  disponibilidad = 0, calidad = 0, rendimiento = 0, tiempoMuerto = 0,
}) {
  const { theme: t } = useTheme();
  const v = clampPct(calcOee(disponibilidad, rendimiento, calidad));
  const vc = useCountUp(v, 1000);
  const vColor = oeeColor(t, v);
  const { color: estadoColor, Icon } = estadoInfo(t, estado);
  const [intPart, decPart] = vc.toFixed(1).split(".");

  return (
    <div style={{ width: 320, background: t.panel, border: `1px solid ${t.border}`, color: t.text, display: "flex", overflow: "hidden" }}>
      <div style={{ width: 8, background: estadoColor, flexShrink: 0 }} />
      <div style={{ flex: 1, padding: "16px 18px 16px" }}>
        {/* estado + equipo */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon size={16} color={estadoColor} strokeWidth={2.6} style={{ animation: (estado === "Paro de Emergencia" || estado === "alarma") ? "edpBlink 1s steps(1) infinite" : "none" }} />
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>{estado}</span>
          </div>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: t.textFaint }}>{equipo} · #{noParte}</span>
        </div>

        {/* OEE gigante + progreso */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 12, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase", color: t.textFaint, marginTop: 6 }}>OEE</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", lineHeight: 0.82 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 82, fontWeight: 700, color: vColor, letterSpacing: -3 }}>{intPart}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 32, fontWeight: 700, color: vColor }}>.{decPart}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 700, color: t.textFaint, marginLeft: 4 }}>%</span>
            </div>
            <div style={{ height: 6, background: t.hover, marginTop: 6 }}>
              <div style={{ height: "100%", width: `${vc}%`, background: vColor, transition: "width 120ms linear" }} />
            </div>
          </div>
        </div>

        {/* factores */}
        <div style={{ marginTop: 12 }}>
          <FlatBar icon={FACTOR_ICONS.disponibilidad} label="Disponib." value={disponibilidad} meta={METAS.disponibilidad} color={t.accent} t={t} i={0} />
          <FlatBar icon={FACTOR_ICONS.rendimiento} label="Rendim." value={rendimiento} meta={METAS.rendimiento} color={t.amber} t={t} i={1} />
          <FlatBar icon={FACTOR_ICONS.calidad} label="Calidad" value={calidad} meta={METAS.calidad} color={t.success} t={t} i={2} />
        </div>

        {/* piezas */}
        <div style={{ display: "flex", borderTop: `2px solid ${t.text}`, marginTop: 12, paddingTop: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: t.textFaint }}>Aprobadas</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 700, color: t.success }}>{aprobadas}</div>
          </div>
          <div style={{ flex: 1, borderLeft: `1px solid ${t.border}`, paddingLeft: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: t.textFaint }}>Rechazadas</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 700, color: t.coral }}>{rechazadas}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: t.textFaint }}>Paro</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 700, color: t.text }}>{tiempoMuerto}s</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes edpIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes edpBlink { 50% { opacity: 0.25; } }
      `}</style>
    </div>
  );
}
