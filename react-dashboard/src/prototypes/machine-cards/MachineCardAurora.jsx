/**
 * prototypes/machine-cards/MachineCardAurora.jsx
 * ------------------------------------------------------------------
 * Aurora Hero mejorado: aurora animada + partículas flotantes, OEE con
 * conteo animado, y chips de vidrio enriquecidos (icono + sparkline +
 * barra + brillo que barre). Máximo impacto, más información legible.
 */
import { useMemo } from "react";
import { useTheme } from "@/theme";
import { estadoInfo, oee as calcOee, oeeColor, oeeBandLabel, clampPct, useCountUp, miniTrend, FACTOR_ICONS } from "./cardShared.js";

/* Sparkline SVG minimalista. */
function Spark({ data, color, w = 96, h = 22 }) {
  const max = 100, min = 0;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / (max - min)) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
    </svg>
  );
}

/* Chip de vidrio con icono, valor animado y sparkline. */
function GlassStat({ icon: Icon, label, value, tint, id, uid, i }) {
  const v = useCountUp(clampPct(value), 900 + i * 120);
  const trend = useMemo(() => miniTrend(value, `${id}-${label}`), [value, id, label]);
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 96, overflow: "hidden", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: 12, padding: "9px 11px" }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", left: "-50%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)", animation: `apShine-${uid} 4s ease-in-out infinite`, animationDelay: `${i * 0.5}s` }} />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <Icon size={13} color="#fff" strokeWidth={2.4} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(255,255,255,0.85)" }}>{label}</span>
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 1.05 }}>{v.toFixed(1)}<span style={{ fontSize: 11, opacity: 0.75 }}>%</span></div>
        <Spark data={trend} color={tint} />
      </div>
    </div>
  );
}

export default function MachineCardAurora({
  id, estado = "Operando", noParte, equipo,
  aprobadas = 0, rechazadas = 0,
  disponibilidad = 0, calidad = 0, rendimiento = 0, tiempoMuerto = 0,
}) {
  const { theme: t } = useTheme();
  const uid = useMemo(() => Math.random().toString(36).slice(2), []);
  const v = clampPct(calcOee(disponibilidad, rendimiento, calidad));
  const vc = useCountUp(v, 1000);
  const vColor = oeeColor(t, v);
  const { color: estadoColor, Icon } = estadoInfo(t, estado);
  const band = oeeBandLabel(v);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 620, minWidth: 300, minHeight: 210, borderRadius: 24, overflow: "hidden", color: "#fff", background: `linear-gradient(120deg, ${estadoColor} 0%, ${t.accent} 55%, ${t.violet} 100%)`, boxShadow: `0 24px 60px ${vColor}44`, isolation: "isolate" }}>
      {/* aurora */}
      <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: vColor, filter: "blur(70px)", opacity: 0.6, top: -90, left: -40, animation: `apA1-${uid} 12s ease-in-out infinite` }} />
      <div style={{ position: "absolute", width: 260, height: 260, borderRadius: "50%", background: t.amber, filter: "blur(70px)", opacity: 0.45, bottom: -100, right: 40, animation: `apA2-${uid} 15s ease-in-out infinite` }} />
      <div style={{ position: "absolute", width: 220, height: 220, borderRadius: "50%", background: t.success, filter: "blur(70px)", opacity: 0.4, top: 20, right: -60, animation: `apA3-${uid} 18s ease-in-out infinite` }} />
      {/* partículas */}
      {[12, 30, 55, 72, 88].map((L, i) => (
        <span key={L} style={{ position: "absolute", left: `${L}%`, bottom: -8, width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.7)", boxShadow: "0 0 6px #fff", animation: `apRise-${uid} ${7 + i}s linear infinite`, animationDelay: `${i * 1.3}s` }} />
      ))}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(6,10,20,0.55) 0%, rgba(6,10,20,0.2) 55%, rgba(6,10,20,0.35) 100%)" }} />

      <div style={{ position: "relative", padding: "16px 20px 18px", display: "flex", flexDirection: "column", height: "100%" }}>
        {/* cabecera */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.3)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: 999, padding: "5px 13px 5px 10px" }}>
            <Icon size={15} color="#fff" strokeWidth={2.6} style={{ animation: (estado === "Paro de Emergencia" || estado === "alarma") ? `apBlink-${uid} 1s steps(1) infinite` : "none" }} />
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }}>{estado}</span>
          </div>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, opacity: 0.85 }}>{equipo} · #{noParte}</span>
        </div>

        {/* OEE + chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", flex: 1, margin: "10px 0" }}>
          <div style={{ flex: "0 0 auto" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 5, textTransform: "uppercase", opacity: 0.85, marginBottom: -6 }}>OEE</div>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 90, fontWeight: 700, lineHeight: 0.9, textShadow: "0 4px 24px rgba(0,0,0,0.35)" }}>{vc.toFixed(0)}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 34, fontWeight: 700, opacity: 0.9 }}>%</span>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4, background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", animation: `apPulse-${uid} 1.6s ease-in-out infinite` }} />{band}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 210 }}>
            <GlassStat icon={FACTOR_ICONS.disponibilidad} label="Disponib." value={disponibilidad} tint={t.accent} id={id} uid={uid} i={0} />
            <GlassStat icon={FACTOR_ICONS.rendimiento} label="Rendim." value={rendimiento} tint={t.amber} id={id} uid={uid} i={1} />
            <GlassStat icon={FACTOR_ICONS.calidad} label="Calidad" value={calidad} tint={t.success} id={id} uid={uid} i={2} />
          </div>
        </div>

        {/* pie */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 8 }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>✔ {aprobadas} <span style={{ opacity: 0.7, fontWeight: 500 }}>aprob.</span></span>
          <span style={{ opacity: 0.9 }}>Tiempo muerto <b style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{tiempoMuerto}s</b></span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>✘ {rechazadas} <span style={{ opacity: 0.7, fontWeight: 500 }}>rech.</span></span>
        </div>
      </div>

      <style>{`
        @keyframes apA1-${uid} { 0%,100%{transform:translate(0,0) scale(1);} 50%{transform:translate(40px,30px) scale(1.2);} }
        @keyframes apA2-${uid} { 0%,100%{transform:translate(0,0) scale(1);} 50%{transform:translate(-50px,-20px) scale(1.15);} }
        @keyframes apA3-${uid} { 0%,100%{transform:translate(0,0) scale(1);} 50%{transform:translate(-30px,40px) scale(1.25);} }
        @keyframes apShine-${uid} { 0%{left:-50%;} 55%,100%{left:130%;} }
        @keyframes apRise-${uid} { 0%{transform:translateY(0);opacity:0;} 10%{opacity:1;} 100%{transform:translateY(-240px);opacity:0;} }
        @keyframes apPulse-${uid} { 0%,100%{opacity:0.4;transform:scale(0.8);} 50%{opacity:1;transform:scale(1.2);} }
        @keyframes apBlink-${uid} { 50%{opacity:0.25;} }
      `}</style>
    </div>
  );
}
