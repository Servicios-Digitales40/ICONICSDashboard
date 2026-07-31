/**
 * prototypes/machine-cards/MachineCardNeonHUD.jsx
 * ------------------------------------------------------------------
 * Neon Cyber HUD mejorado: se suma un BARRIDO tipo radar girando sobre
 * el radial, iconos por medidor, OEE con conteo animado, medidores con
 * brillo que recorre, esquinas que parpadean y una línea de telemetría.
 *
 * Funciona en tema claro y oscuro: todos los valores que antes estaban
 * cableados a la versión nocturna (fondo, tintas, muescas, resplandor)
 * salen ahora de `useNeonSkin()`. En claro la pieza se reinterpreta como
 * plano técnico —papel blanco azulado y tinta oscura— conservando el
 * movimiento completo. Ver _neonSkin.js para el porqué de cada regla.
 */
import { useMemo } from "react";
import { useTheme } from "@/theme";
import { useNeonSkin } from "./neonSkin.js";
import { estadoInfo, oee as calcOee, oeeColor, oeeBandLabel, clampPct, useCountUp, FACTOR_ICONS } from "./cardShared.js";

function NeonMeter({ icon: Icon, label, value, color, uid, i, S }) {
  const v = useCountUp(clampPct(value), 900 + i * 120);
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: S.inkSoft }}>
          <Icon size={13} color={color} strokeWidth={2.4} />{label}
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color, textShadow: S.glow(color) }}>{v.toFixed(1)}%</span>
      </div>
      <div style={{ position: "relative", height: 10, borderRadius: 5, background: S.track, border: `1px solid ${S.trackBorder}`, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, width: `${v}%`, background: color, borderRadius: 5, boxShadow: S.dark ? `0 0 12px ${color}, 0 0 4px ${color}` : `0 0 6px ${color}55` }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, width: 24, left: "-24px", background: `linear-gradient(90deg, transparent, ${S.shine}, transparent)`, animation: `nhpSweep-${uid} 3s ease-in-out infinite`, animationDelay: `${i * 0.4}s` }} />
        {/* muescas: el soporte asomando entre segmentos (negras en oscuro, blancas en claro) */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: `repeating-linear-gradient(90deg, transparent 0 calc(10% - 2px), ${S.notch} calc(10% - 2px) 10%)` }} />
      </div>
    </div>
  );
}

export default function MachineCardNeonHUD({
  estado = "Operando", noParte, equipo,
  aprobadas = 0, rechazadas = 0,
  disponibilidad = 0, calidad = 0, rendimiento = 0, tiempoMuerto = 0,
}) {
  const { theme: t } = useTheme();
  const S = useNeonSkin();
  const uid = useMemo(() => Math.random().toString(36).slice(2), []);
  const v = clampPct(calcOee(disponibilidad, rendimiento, calidad));
  const vc = useCountUp(v, 1000);
  const vColor = oeeColor(t, v);
  const { color: estadoColor, Icon } = estadoInfo(t, estado);
  const band = oeeBandLabel(v);

  const R = 54, SW = 7, CIRC = 2 * Math.PI * R, off = CIRC * (1 - v / 100), TICKS = 44;
  const corner = (pos) => ({ position: "absolute", width: 16, height: 16, ...pos });
  // wedge del radar
  const a0 = -Math.PI / 2, a1 = a0 + 0.6;
  const wedge = `M70,70 L${70 + 63 * Math.cos(a0)},${70 + 63 * Math.sin(a0)} A63,63 0 0 1 ${70 + 63 * Math.cos(a1)},${70 + 63 * Math.sin(a1)} Z`;

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 620, minWidth: 300, borderRadius: 14, overflow: "hidden", color: S.ink, background: S.surface, border: `1px solid ${vColor}${S.borderA}`, boxShadow: `0 0 0 1px ${vColor}22, ${S.drop}, inset 0 0 60px ${vColor}${S.innerA}` }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(${vColor}${S.gridA} 1px, transparent 1px), linear-gradient(90deg, ${vColor}${S.gridA} 1px, transparent 1px)`, backgroundSize: "26px 26px", pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${vColor}, transparent)`, opacity: S.scanOpacity, animation: `nhpScan-${uid} 4s linear infinite`, pointerEvents: "none" }} />
      <span style={{ ...corner({ top: 8, left: 8, borderTop: `2px solid ${vColor}`, borderLeft: `2px solid ${vColor}` }), animation: `nhpCorner-${uid} 2s ease-in-out infinite` }} />
      <span style={{ ...corner({ top: 8, right: 8, borderTop: `2px solid ${vColor}`, borderRight: `2px solid ${vColor}` }), animation: `nhpCorner-${uid} 2s ease-in-out infinite`, animationDelay: "0.5s" }} />
      <span style={{ ...corner({ bottom: 8, left: 8, borderBottom: `2px solid ${vColor}`, borderLeft: `2px solid ${vColor}` }), animation: `nhpCorner-${uid} 2s ease-in-out infinite`, animationDelay: "1s" }} />
      <span style={{ ...corner({ bottom: 8, right: 8, borderBottom: `2px solid ${vColor}`, borderRight: `2px solid ${vColor}` }), animation: `nhpCorner-${uid} 2s ease-in-out infinite`, animationDelay: "1.5s" }} />

      <div style={{ position: "relative", padding: "14px 18px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${estadoColor}`, borderRadius: 4, padding: "3px 10px", boxShadow: S.glow(`${estadoColor}66`, 12), background: `${estadoColor}18` }}>
            <Icon size={13} color={estadoColor} strokeWidth={2.6} style={{ animation: (estado === "Paro de Emergencia" || estado === "alarma") ? `nhpBlink-${uid} 1s steps(1) infinite` : "none" }} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: estadoColor, textShadow: S.glow(estadoColor) }}>{estado}</span>
          </div>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: S.inkFaint, letterSpacing: 1 }}>{equipo} · #{noParte}</span>
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flexShrink: 0, position: "relative" }}>
            <svg viewBox="0 0 140 140" width={170} height={170}>
              <defs>
                <filter id={`nhpGlow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <radialGradient id={`nhpWedge-${uid}`}>
                  <stop offset="0%" stopColor={vColor} stopOpacity={S.wedgeOpacity} />
                  <stop offset="100%" stopColor={vColor} stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* barrido radar */}
              <g style={{ animation: `nhpRadar-${uid} 3.5s linear infinite`, transformOrigin: "70px 70px" }}>
                <path d={wedge} fill={`url(#nhpWedge-${uid})`} />
              </g>
              {/* ticks */}
              {Array.from({ length: TICKS }).map((_, i) => {
                const ang = (i / TICKS) * 2 * Math.PI - Math.PI / 2;
                const lit = (i / TICKS) * 100 <= v;
                return (
                  <line key={i} x1={70 + 64 * Math.cos(ang)} y1={70 + 64 * Math.sin(ang)} x2={70 + 70 * Math.cos(ang)} y2={70 + 70 * Math.sin(ang)} stroke={lit ? vColor : S.tickOff} strokeWidth={2} style={{ filter: lit && S.dark ? `drop-shadow(0 0 3px ${vColor})` : "none" }} />
                );
              })}
              <g transform="rotate(-90 70 70)">
                <circle cx="70" cy="70" r={R} fill="none" stroke={S.ringTrack} strokeWidth={SW} />
                <circle cx="70" cy="70" r={R} fill="none" stroke={vColor} strokeWidth={SW} strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={off} filter={`url(#nhpGlow-${uid})`} style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }} />
              </g>
              {/* En claro el número va sin filtro de brillo: es lo que lo mantiene nítido. */}
              <text x="70" y="68" textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 34, fontWeight: 700, fill: S.dialInk }} filter={S.dialGlow ? `url(#nhpGlow-${uid})` : undefined}>{vc.toFixed(0)}</text>
              <text x="70" y="86" textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 3, fill: vColor }}>OEE %</text>
            </svg>
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: vColor, textShadow: S.glow(vColor, 10) }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: vColor, boxShadow: S.glow(vColor), animation: `nhpPulse-${uid} 1.4s ease-in-out infinite` }} />◈ {band}
            </div>
            <NeonMeter icon={FACTOR_ICONS.disponibilidad} label="Disponib." value={disponibilidad} color={t.accent} uid={uid} i={0} S={S} />
            <NeonMeter icon={FACTOR_ICONS.rendimiento} label="Rendim." value={rendimiento} color={t.amber} uid={uid} i={1} S={S} />
            <NeonMeter icon={FACTOR_ICONS.calidad} label="Calidad" value={calidad} color={t.success} uid={uid} i={2} S={S} />
          </div>
        </div>

        {/* telemetría + readouts */}
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: S.telemetry(vColor), letterSpacing: 1, margin: "10px 0 8px", whiteSpace: "nowrap", overflow: "hidden" }}>
          &gt; SYS.OK · SCAN {v.toFixed(1)}% · UPTIME {(100 - clampPct((tiempoMuerto / 10) * 100)).toFixed(0)}% · ▮▮▮▯▯
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { k: "APROB", val: aprobadas, c: t.success },
            { k: "RECH", val: rechazadas, c: t.coral },
            { k: "PARO", val: `${tiempoMuerto}s`, c: vColor },
          ].map((d) => (
            <div key={d.k} style={{ flex: 1, textAlign: "center", border: `1px solid ${d.c}44`, borderRadius: 6, padding: "5px 6px", background: `${d.c}${S.chipA}` }}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, color: S.inkFaint, fontWeight: 700 }}>{d.k}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 17, fontWeight: 700, color: d.c, textShadow: S.glow(d.c, 10) }}>{d.val}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes nhpScan-${uid} { 0%{top:0;opacity:0;} 10%{opacity:${S.scanOpacity};} 90%{opacity:${S.scanOpacity};} 100%{top:100%;opacity:0;} }
        @keyframes nhpRadar-${uid} { to { transform: rotate(360deg); } }
        @keyframes nhpSweep-${uid} { 0%{left:-24px;} 60%,100%{left:100%;} }
        @keyframes nhpPulse-${uid} { 0%,100%{opacity:0.5;transform:scale(0.8);} 50%{opacity:1;transform:scale(1.3);} }
        @keyframes nhpCorner-${uid} { 0%,100%{opacity:1;} 50%{opacity:0.35;} }
        @keyframes nhpBlink-${uid} { 50%{opacity:0.25;} }
      `}</style>
    </div>
  );
}
