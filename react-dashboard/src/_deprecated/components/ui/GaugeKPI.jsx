/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/GaugeKPI.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * ui/GaugeKPI.jsx
 * ------------------------------------------------------------------
 * Tarjeta de KPI tipo "velocímetro": arco de ticks degradado, aguja
 * animada, número contando, y varios toques de movimiento continuo
 * (brillo pulsante, ícono flotando, ticks apareciendo en cascada, y
 * una pequeña variación automática cada pocos segundos para que se
 * vea "vivo", como si llegaran datos en tiempo real).
 *
 * Props:
 *  - title, description: textos de la tarjeta
 *  - value: 0-100 (valor "base"; el gauge oscila un poco alrededor de él)
 *  - tone: "warm" | "cool" | "success" — paleta del arco
 *  - icon: nodo de ícono (p. ej. <Server size={18} />)
 *  - live: si es true, muestra un punto pulsante ("en vivo")
 *  - onView: callback del botón "Ver panel"
 */
import { useEffect, useState } from "react";
import { useTheme } from "@/theme";
import { Button } from "@/components/ui/Button.jsx";
import { Eye } from "lucide-react";

const TONE_STOPS = {
  warm: ["#B91C1C", "#EA580C", "#F59E0B", "#FDE047"],
  cool: ["#1D4ED8", "#6D28D9", "#C026D3", "#EC4899"],
  success: ["#0F766E", "#16A34A", "#65A30D", "#BEF264"],
};

function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bch = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bch})`;
}

function multiStopColor(stops, t) {
  const segment = t * (stops.length - 1);
  const lower = Math.floor(segment);
  const upper = Math.min(lower + 1, stops.length - 1);
  return lerpColor(stops[lower], stops[upper], segment - lower);
}

const CX = 110, CY = 118, R_IN = 74, R_OUT = 94, TICKS = 26;

export function GaugeKPI({ title, description, value, tone = "warm", icon, live, onView }) {
  const { theme: t } = useTheme();
  const stops = TONE_STOPS[tone];

  // 1) "Vida propia": cada 3.5s el gauge se mueve solo un poquito
  //    alrededor del valor real, como si recibiera datos en vivo.
  const [jitter, setJitter] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setJitter(Math.round((Math.random() - 0.5) * 14)); // entre -7 y +7
    }, 3500);
    return () => clearInterval(id);
  }, []);
  const effectiveValue = Math.min(100, Math.max(0, value + jitter));

  // 2) Anima el número mostrado dentro del SVG hacia `effectiveValue`.
  //    (No podemos usar el componente <CountUp>: es un <span> HTML y
  //    esto vive dentro de un <text> de SVG.)
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    const start = displayValue;
    const end = effectiveValue;
    const duration = 900;
    const t0 = performance.now();
    let raf;
    function tick(now) {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayValue(Math.round(start + (end - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveValue]);

  const ticks = Array.from({ length: TICKS }, (_, i) => {
    const ratio = i / (TICKS - 1);
    const angleDeg = 180 - ratio * 180; // 180° (izquierda) -> 0° (derecha)
    const rad = (angleDeg * Math.PI) / 180;
    const x1 = CX + R_IN * Math.cos(rad);
    const y1 = CY - R_IN * Math.sin(rad);
    const x2 = CX + R_OUT * Math.cos(rad);
    const y2 = CY - R_OUT * Math.sin(rad);
    return { x1, y1, x2, y2, color: multiStopColor(stops, ratio) };
  });

  // La aguja se dibuja apuntando a la izquierda (0°) y se rota clockwise
  // `effectiveValue * 1.8` grados (0-180) para barrer todo el arco.
  const needleRotation = effectiveValue * 1.8;

  return (
    <div
      className="panel-card"
      style={{
        background: t.panel, border: `1px solid ${t.border}`, borderRadius: 18,
        padding: "22px 22px 20px", boxShadow: t.shadow, textAlign: "center",
        position: "relative", overflow: "hidden",
        "--shadow-hover": t.shadowHover,
      }}
    >
      {/* Brillo pulsante detrás del gauge — puro movimiento decorativo */}
      <div
        className="gauge-glow"
        style={{
          position: "absolute", top: 70, left: "50%", width: 180, height: 180,
          marginLeft: -90, borderRadius: "50%",
          background: `radial-gradient(circle, ${stops[1]}33 0%, transparent 70%)`,
          filter: "blur(18px)", pointerEvents: "none",
        }}
      />

      {/* Ícono flotando */}
      <div style={{ position: "relative", display: "inline-flex", marginBottom: 12 }}>
        <span
          className="icon-float"
          style={{
            width: 46, height: 46, borderRadius: "50%", background: `${stops[1]}1F`,
            display: "flex", alignItems: "center", justifyContent: "center", color: stops[1],
          }}
        >
          {icon}
        </span>
        {live && (
          <span style={{ position: "absolute", top: -1, right: -1, width: 10, height: 10, borderRadius: "50%", background: t.success, border: `2px solid ${t.panel}` }}>
            <span className="pulse-ring" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: t.success }} />
          </span>
        )}
      </div>

      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif", position: "relative" }}>{title}</h3>
      <p style={{ margin: "6px auto 4px", fontSize: 12, color: t.textFaint, maxWidth: 230, lineHeight: 1.5, position: "relative" }}>{description}</p>

      {/* Gauge SVG */}
      <svg width="220" height="128" viewBox="0 0 220 128" style={{ display: "block", margin: "4px auto -6px", position: "relative" }}>
        {ticks.map((tk, i) => (
          <line
            key={i} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2}
            stroke={tk.color} strokeWidth={6} strokeLinecap="round"
            className="tick-draw"
            style={{ animationDelay: `${i * 0.02}s` }}
          />
        ))}

        {/* Aguja: apunta a la izquierda por defecto, se rota vía CSS */}
        <g style={{ transform: `rotate(${needleRotation}deg)`, transformOrigin: `${CX}px ${CY}px`, transition: "transform 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
          <polygon points={`${CX - 62},${CY} ${CX - 4},${CY - 5} ${CX - 4},${CY + 5}`} fill={t.textFaint} />
        </g>
        <circle className="hub-pulse" cx={CX} cy={CY} r={9} fill={t.panel} stroke={t.textFaint} strokeWidth={3} />

        <text x={CX} y={CY - 26} textAnchor="middle" fontSize="27" fontWeight="700" fontFamily="'Plus Jakarta Sans', sans-serif" fill={t.text}>
          {displayValue}%
        </text>
      </svg>

      <div style={{ marginTop: 8, position: "relative" }}>
        <Button variant="secondary" icon={<Eye size={14} />} onClick={onView}>Ver panel</Button>
      </div>
    </div>
  );
}