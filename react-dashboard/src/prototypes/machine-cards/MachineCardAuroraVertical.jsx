/**
 * prototypes/machine-cards/MachineCardAuroraVertical.jsx
 * ------------------------------------------------------------------
 * Aurora vertical mejorado (~320px): aurora + partículas, OEE con
 * conteo animado y sparkline debajo, filas de vidrio con icono, valor
 * animado y brillo que barre.
 */
import { useMemo } from "react";
import { useTheme } from "@/theme";
import { estadoInfo, oee as calcOee, oeeColor, oeeBandLabel, clampPct, useCountUp, miniTrend, FACTOR_ICONS } from "./cardShared.js";

function Spark({ data, color, w = 260, h = 26 }) {
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - (d / 100) * h}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <polygon points={area} fill={color} opacity={0.18} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
    </svg>
  );
}

function GlassRow({ icon: Icon, label, value, tint, uid, i }) {
  const v = useCountUp(clampPct(value), 900 + i * 120);
  return (
    <div style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: 11, padding: "7px 11px" }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", left: "-50%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)", animation: `avpShine-${uid} 4s ease-in-out infinite`, animationDelay: `${i * 0.5}s` }} />
      <Icon size={15} color="#fff" strokeWidth={2.4} style={{ position: "relative" }} />
      <span style={{ position: "relative", width: 58, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "rgba(255,255,255,0.82)" }}>{label}</span>
      <div style={{ position: "relative", flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${v}%`, background: tint, boxShadow: `0 0 8px ${tint}` }} />
      </div>
      <span style={{ position: "relative", width: 48, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 700, color: "#fff" }}>{v.toFixed(1)}</span>
    </div>
  );
}

export default function MachineCardAuroraVertical({
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
  const trend = useMemo(() => miniTrend(v, `${id}-oee`, 18), [v, id]);

  return (
    <div style={{ position: "relative", width: 320, borderRadius: 22, overflow: "hidden", color: "#fff", background: `linear-gradient(150deg, ${estadoColor} 0%, ${t.accent} 55%, ${t.violet} 100%)`, boxShadow: `0 22px 54px ${vColor}44`, isolation: "isolate" }}>
      <div style={{ position: "absolute", width: 240, height: 240, borderRadius: "50%", background: vColor, filter: "blur(60px)", opacity: 0.6, top: -80, left: -30, animation: `avpA1-${uid} 12s ease-in-out infinite` }} />
      <div style={{ position: "absolute", width: 220, height: 220, borderRadius: "50%", background: t.amber, filter: "blur(60px)", opacity: 0.4, bottom: -90, right: -20, animation: `avpA2-${uid} 15s ease-in-out infinite` }} />
      {[18, 44, 70, 90].map((L, i) => (
        <span key={L} style={{ position: "absolute", left: `${L}%`, bottom: -6, width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.7)", boxShadow: "0 0 6px #fff", animation: `avpRise-${uid} ${7 + i}s linear infinite`, animationDelay: `${i * 1.4}s` }} />
      ))}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(6,10,20,0.45) 0%, rgba(6,10,20,0.2) 40%, rgba(6,10,20,0.5) 100%)" }} />

      <div style={{ position: "relative", padding: "14px 16px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.3)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: 999, padding: "4px 11px 4px 8px" }}>
            <Icon size={13} color="#fff" strokeWidth={2.6} style={{ animation: (estado === "Paro de Emergencia" || estado === "alarma") ? `avpBlink-${uid} 1s steps(1) infinite` : "none" }} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3 }}>{estado}</span>
          </div>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, opacity: 0.85 }}>{equipo} · #{noParte}</span>
        </div>

        {/* OEE centrado + sparkline */}
        <div style={{ textAlign: "center", margin: "2px 0 6px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 5, textTransform: "uppercase", opacity: 0.85, marginBottom: -8 }}>OEE</div>
          <div style={{ display: "inline-flex", alignItems: "baseline" }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 78, fontWeight: 700, lineHeight: 0.9, textShadow: "0 4px 22px rgba(0,0,0,0.35)" }}>{vc.toFixed(0)}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 28, fontWeight: 700, opacity: 0.9 }}>%</span>
          </div>
          <div style={{ margin: "2px 6px 0" }}><Spark data={trend} color="#fff" /></div>
          <div style={{ marginTop: 2 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 999, padding: "3px 13px", fontSize: 11.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", animation: `avpPulse-${uid} 1.6s ease-in-out infinite` }} />{band}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <GlassRow icon={FACTOR_ICONS.disponibilidad} label="Disponib." value={disponibilidad} tint={t.accent} uid={uid} i={0} />
          <GlassRow icon={FACTOR_ICONS.rendimiento} label="Rendim." value={rendimiento} tint={t.amber} uid={uid} i={1} />
          <GlassRow icon={FACTOR_ICONS.calidad} label="Calidad" value={calidad} tint={t.success} uid={uid} i={2} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 8, marginTop: 10 }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>✔ {aprobadas}</span>
          <span style={{ opacity: 0.9 }}>Paro <b style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{tiempoMuerto}s</b></span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>✘ {rechazadas}</span>
        </div>
      </div>

      <style>{`
        @keyframes avpA1-${uid} { 0%,100%{transform:translate(0,0) scale(1);} 50%{transform:translate(30px,26px) scale(1.2);} }
        @keyframes avpA2-${uid} { 0%,100%{transform:translate(0,0) scale(1);} 50%{transform:translate(-36px,-18px) scale(1.15);} }
        @keyframes avpShine-${uid} { 0%{left:-50%;} 55%,100%{left:130%;} }
        @keyframes avpRise-${uid} { 0%{transform:translateY(0);opacity:0;} 10%{opacity:1;} 100%{transform:translateY(-260px);opacity:0;} }
        @keyframes avpPulse-${uid} { 0%,100%{opacity:0.4;transform:scale(0.8);} 50%{opacity:1;transform:scale(1.2);} }
        @keyframes avpBlink-${uid} { 50%{opacity:0.25;} }
      `}</style>
    </div>
  );
}
