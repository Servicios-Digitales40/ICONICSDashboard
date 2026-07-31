import React, { useMemo, useState } from "react";
import { CircleCheck, CircleSlash, OctagonAlert, PlugZap, Settings2, PauseCircle } from "lucide-react";
import { useTheme } from "@/theme";
import { estadoInfo, hasValue } from "@/lib/domain/index.js";
import { SIN_DATO, fmtDuracion, fmtNum, pctSeguro } from "@/lib/format.js";

/**
 * ui/GaugeCard.jsx
 * ------------------------------------------------------------------
 * Tarjeta de monitoreo de equipo (OEE). Deriva TODOS sus colores del
 * ThemeProvider vía useTheme(), por lo que se adapta a claro/oscuro
 * junto con el resto de la app. No hay colores literales de marca:
 * el mapa `palette(theme, dark)` traduce los tokens globales a los
 * nombres semánticos que usa este componente.
 *
 * ── DOS CAMBIOS DE LA MIGRACIÓN A ICONICS ──────────────────────────
 *
 * 1 · El estado ya no es una cadena en español: es una clave canónica
 *     del dominio (`running`, `standby`, …). La etiqueta y el color
 *     salen de `lib/domain/estado.js`, que es ahora la fuente única;
 *     aquí solo queda el ICONO, que sí es presentación.
 *
 * 2 · Cualquier métrica puede ser `null`. Se pinta «—», nunca 0: un
 *     cero inventado en una tarjeta de planta se lee como una máquina
 *     detenida.
 */

/* ---------- Paleta derivada del tema global ---------- */
function palette(t, dark) {
  return {
    panelTop: t.panel,
    // fondo con leve profundidad: en oscuro baja hacia page, en claro sube un pelín
    panelBottom: dark ? t.page : t.hover,
    border: t.border,
    hair: dark ? "rgba(255,255,255,0.06)" : "rgba(16,24,40,0.05)",
    track: dark ? "rgba(255,255,255,0.07)" : "rgba(16,24,40,0.07)",
    softFill: dark ? "rgba(255,255,255,0.03)" : "rgba(16,24,40,0.025)",
    ink: t.text,
    inkSoft: t.textSoft,
    inkDim: t.textFaint,
    red: t.coral,
    amber: t.amber,
    green: t.success,
    accent: t.accent,
    violet: t.violet,
    // estado neutro/inactivo (Receso): tono apagado derivado del texto suave
    slate: t.textSoft,
    shadow: t.shadow,
  };
}

/**
 * ICONO de cada estado, por clave canónica del dominio.
 *
 * Aquí ya NO viven ni la etiqueta ni el color: los pone
 * `lib/domain/estado.js`. Antes estaban duplicados entre este mapa y
 * `ESTADO_TOKEN`, con el riesgo de que divergieran — un estado podía
 * salir verde en la tarjeta y gris en el dashboard.
 *
 * Lectura rápida en piso de planta:
 *   • ✔ verde  → operando
 *   • ⏸ gris   → stand by, esperando arranque
 *   • ⚙ azul   → set-up, intervención en curso
 *   • ⚡ ámbar  → sin comunicación con el PLC
 *   • ⛔ rojo   → alarma activa
 *   • ⃠ tenue  → sin dato (mala calidad o aún sin leer)
 */
const ICONO_ESTADO = {
  running: CircleCheck,
  standby: PauseCircle,
  setup: Settings2,
  commfail: PlugZap,
  alarma: OctagonAlert,
  unknown: CircleSlash,
};

/* Umbrales OEE compartidos por el arco de fondo y el color del valor. */
const UMBRAL_BAJO = 50;
const UMBRAL_MEDIO = 75;

function valorColor(P, valor) {
  if (valor < UMBRAL_BAJO) return P.red;
  if (valor < UMBRAL_MEDIO) return P.amber;
  return P.green;
}

const clamp = (v) => Math.min(Math.max(v, 0), 100);

/* ---------- Geometría del arco (semicírculo) ---------- */
const CX = 100;
const CY = 100;
const R = 74;

function polar(pct, radius = R) {
  const angle = Math.PI - (clamp(pct) / 100) * Math.PI;
  return { x: CX + radius * Math.cos(angle), y: CY - radius * Math.sin(angle) };
}
function arcPath(fromPct, toPct, radius = R) {
  const a = polar(fromPct, radius);
  const b = polar(toPct, radius);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y}`;
}

/* Punta de un tick radial (marca de umbral) sobre el arco. */
function tick(pct, rInner, rOuter) {
  const a = Math.PI - (clamp(pct) / 100) * Math.PI;
  return {
    x1: CX + rInner * Math.cos(a), y1: CY - rInner * Math.sin(a),
    x2: CX + rOuter * Math.cos(a), y2: CY - rOuter * Math.sin(a),
  };
}

/* ---------- Gauge: OEE dominante arriba, arco+aguja abajo ---------- */
function Gauge({ valor, P }) {
  // Sin medición el arco se dibuja vacío y en tono apagado: la aguja a 0
  // con color rojo diría «OEE del 0 %», que es una afirmación, no un hueco.
  const sinDato = !hasValue(valor);
  const v = pctSeguro(valor);
  const color = sinDato ? P.inkDim : valorColor(P, v);
  const strokeW = 13;
  const tip = polar(v);
  const uid = useMemo(() => Math.random().toString(36).slice(2), []);
  const [intPart, decPart] = v.toFixed(2).split(".");

  // marcas de umbral: separan la banda roja/ámbar/verde
  const t50 = tick(UMBRAL_BAJO, R - strokeW / 2 - 1, R + strokeW / 2 + 1);
  const t75 = tick(UMBRAL_MEDIO, R - strokeW / 2 - 1, R + strokeW / 2 + 1);

  return (
    <div style={{ padding: "2px 0 0", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* OEE — el dato rey. Compensamos el letter-spacing con paddingLeft
          igual para que la palabra quede ópticamente centrada. */}
      <div style={{ fontSize: 11, letterSpacing: 4, paddingLeft: 4, color: P.inkDim, fontWeight: 600, marginBottom: 2, textAlign: "center" }}>OEE</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", fontFamily: "'IBM Plex Mono', monospace", marginBottom: -6 }}>
        {sinDato ? (
          <span style={{ fontSize: 52, fontWeight: 700, color, lineHeight: 1 }}>{SIN_DATO}</span>
        ) : (
          <>
            <span style={{ fontSize: 52, fontWeight: 700, color, lineHeight: 1, textShadow: `0 0 24px ${color}44` }}>{intPart}</span>
            <span style={{ fontSize: 28, fontWeight: 700, color, opacity: 0.75 }}>.{decPart}</span>
            <span style={{ fontSize: 19, fontWeight: 700, color, opacity: 0.6, marginLeft: 2 }}>%</span>
          </>
        )}
      </div>

      {/* arco + aguja */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
        <svg viewBox="0 0 200 116" width="100%" style={{ maxWidth: 244, overflow: "visible", display: "block" }}>
          <defs>
            <filter id={`glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id={`arc-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity="0.65" />
              <stop offset="100%" stopColor={color} stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* pista de fondo dividida en bandas de umbral: el operador ve
              dónde caen los cortes rojo(<50)/ámbar(<75)/verde sin leer el
              número. Van con baja opacidad para no competir con el valor. */}
          <path d={arcPath(0, UMBRAL_BAJO)} fill="none" stroke={P.red} strokeOpacity={0.22} strokeWidth={strokeW} strokeLinecap="round" />
          <path d={arcPath(UMBRAL_BAJO, UMBRAL_MEDIO)} fill="none" stroke={P.amber} strokeOpacity={0.22} strokeWidth={strokeW} />
          <path d={arcPath(UMBRAL_MEDIO, 100)} fill="none" stroke={P.green} strokeOpacity={0.22} strokeWidth={strokeW} strokeLinecap="round" />

          {/* marcas divisorias de umbral */}
          <line x1={t50.x1} y1={t50.y1} x2={t50.x2} y2={t50.y2} stroke={P.panelTop} strokeWidth={2.5} />
          <line x1={t75.x1} y1={t75.y1} x2={t75.x2} y2={t75.y2} stroke={P.panelTop} strokeWidth={2.5} />

          {/* arco de valor */}
          <path
            d={arcPath(0, v)}
            fill="none"
            stroke={`url(#arc-${uid})`}
            strokeWidth={strokeW}
            strokeLinecap="round"
            filter={`url(#glow-${uid})`}
            style={{ transition: "all 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
          />

          {/* aguja */}
          <line
            x1={CX} y1={CY} x2={tip.x} y2={tip.y}
            stroke={P.ink} strokeWidth={2.5} strokeLinecap="round"
            style={{ transition: "all 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
          <circle cx={CX} cy={CY} r={6.5} fill={P.ink} />
          <circle cx={CX} cy={CY} r={3} fill={color} />
        </svg>
      </div>
    </div>
  );
}

/* ---------- Ratio Aprobadas/Rechazadas ---------- */
function RatioBar({ aprobadas, rechazadas, P }) {
  const total = aprobadas + rechazadas || 1;
  const okPct = (aprobadas / total) * 100;
  return (
    <div>
      <div className="flex justify-between items-end" style={{ marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 11, color: P.inkDim, letterSpacing: 0.5, fontWeight: 600 }}>APROBADAS</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: P.green, fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{aprobadas}</div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 11, color: P.inkDim, letterSpacing: 0.5, fontWeight: 600 }}>RECHAZADAS</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: P.red, fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{rechazadas}</div>
        </div>
      </div>
      <div className="flex" style={{ height: 6, borderRadius: 4, overflow: "hidden", background: P.track }}>
        <div style={{ width: `${okPct}%`, background: P.green, transition: "width 900ms ease-out" }} />
        <div style={{ flex: 1, background: P.red, opacity: 0.85 }} />
      </div>
    </div>
  );
}

/* ---------- KPI (Disponibilidad / Calidad / Rendimiento) ---------- */
function Kpi({ label, value, P }) {
  const sinDato = !hasValue(value);
  const pct = pctSeguro(value);
  const color = sinDato ? P.inkDim : valorColor(P, pct);

  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 10, color: P.inkDim, letterSpacing: 0.7, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 700, color: sinDato ? P.inkDim : P.ink, margin: "3px 0 6px" }}>
        {fmtNum(value)}
        {!sinDato && <span style={{ fontSize: 11, color: P.inkDim }}>%</span>}
      </div>
      <div style={{ height: 4, borderRadius: 3, background: P.track, overflow: "hidden", margin: "0 6px" }}>
        {/* Sin dato la barra queda vacía, no a cero: son cosas distintas. */}
        <div style={{ height: "100%", width: sinDato ? 0 : `${pct}%`, background: color, borderRadius: 3, transition: "width 900ms ease-out" }} />
      </div>
    </div>
  );
}

/* ---------- Componente principal ---------- */
export default function GaugeCard({
  estado = "unknown",
  modelo,
  equipo,
  aprobadas,
  rechazadas,
  disponibilidad,
  calidad,
  rendimiento,
  tMuerto,
  /** OEE del servidor. Si falta se compone de los tres factores. */
  oee,
  /** La lectura lleva varios ciclos sin refrescarse. */
  stale = false,
  onClick, // opcional: si se pasa, la tarjeta se vuelve clickeable (botón)
}) {
  const { theme, dark } = useTheme();
  const P = useMemo(() => palette(theme, dark), [theme, dark]);

  const clickable = typeof onClick === "function";
  const [hover, setHover] = useState(false);

  // OEE = (Disponibilidad × Rendimiento × Calidad) / 10000, en %.
  // Los tres factores llegan como porcentajes (0–100); dividir entre
  // 10000 normaliza el producto de vuelta a la escala 0–100.
  //
  // Se prefiere el valor del servidor: ICONICS lo calcula con la misma
  // fórmula pero sobre lecturas instantáneas, así que es más fiel que
  // recomponerlo aquí a partir de tres factores que pueden venir de
  // ciclos distintos.
  const valor = useMemo(() => {
    if (hasValue(oee)) return oee;
    if (!hasValue(disponibilidad) || !hasValue(rendimiento) || !hasValue(calidad)) return null;
    return (disponibilidad * rendimiento * calidad) / 10000;
  }, [oee, disponibilidad, rendimiento, calidad]);

  // Etiqueta y color salen del dominio; el icono es lo único de aquí.
  const info = estadoInfo(estado);
  const estadoColor = theme[info.token] ?? P.inkDim;
  const Icon = ICONO_ESTADO[info.key] ?? ICONO_ESTADO.unknown;

  const glowAnim = useMemo(() => {
    if (info.critico) return "pulse-danger 1.4s ease-in-out infinite";
    if (info.key === "running" && hasValue(valor) && valor > 75) return "breathe-good 3s ease-in-out infinite";
    return "none";
  }, [info, valor]);

  // id único para las @keyframes con color dependiente del tema
  const uid = useMemo(() => Math.random().toString(36).slice(2), []);

  // Sombra/anillo: la alarma siempre resalta; al hacer hover sobre una
  // tarjeta clickeable se realza con el color de acento.
  const baseShadow = info.critico ? `0 0 0 1px ${estadoColor}44, ${P.shadow}` : P.shadow;
  const hoverShadow = `0 0 0 1.5px ${P.accent}, 0 14px 34px ${P.accent}33`;

  return (
    <div
      className="rounded-2xl"
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Ver detalle de ${equipo}` : undefined}
      onClick={onClick}
      onMouseEnter={clickable ? () => setHover(true) : undefined}
      onMouseLeave={clickable ? () => setHover(false) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
      style={{
        position: "relative",
        overflow: "hidden",
        width: 320,
        background: `radial-gradient(120% 80% at 50% 0%, ${P.panelTop} 0%, ${P.panelBottom} 70%)`,
        border: `1px solid ${P.border}`,
        boxShadow: clickable && hover ? hoverShadow : baseShadow,
        animation: `${glowAnim.split(" ")[0] === "none" ? "" : glowAnim.replace(/^(\S+)/, `$1-${uid}`)}`,
        cursor: clickable ? "pointer" : "default",
        transform: clickable && hover ? "translateY(-3px)" : "translateY(0)",
        transition: "transform 180ms ease, box-shadow 180ms ease",
        outline: "none",
      }}
    >
      {/* barra lateral de estado */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: estadoColor }} />

      <div className="px-4 py-4" style={{ paddingLeft: 18 }}>
        {/* fila superior: chip de estado + No.Parte/Equipo */}
        <div className="flex items-start justify-between" style={{ marginBottom: 6 }}>
          <div
            className="inline-flex items-center gap-1.5 rounded-full"
            style={{
              background: `${estadoColor}${info.critico ? "2E" : "1F"}`,
              border: `1px solid ${estadoColor}${info.critico ? "88" : "55"}`,
              padding: info.critico ? "4px 11px 4px 8px" : "4px 10px 4px 8px",
            }}
          >
            <Icon size={info.critico ? 16 : 15} strokeWidth={2.5} color={estadoColor} />
            <span style={{ color: estadoColor, fontWeight: 700, fontSize: 12, letterSpacing: 0.2 }}>{info.label}</span>
          </div>
          <div className="text-right" style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 11, color: P.inkDim }}>
              Equipo <span style={{ color: P.ink, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{equipo}</span>
            </div>
            {/* `Modelo` es la receta que el PLC tiene cargada, no un SKU. */}
            <div style={{ fontSize: 11, color: P.inkDim }}>
              Modelo <span style={{ color: P.inkSoft, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{modelo ?? SIN_DATO}</span>
            </div>
          </div>
        </div>

        {/* Aviso de dato rancio: la tarjeta sigue mostrando el último valor
            bueno —vaciarla sería peor— pero advierte de que no es fresco. */}
        {stale && (
          <div style={{ fontSize: 10.5, color: P.amber, textAlign: "right", marginBottom: 4, letterSpacing: 0.3 }}>
            dato desactualizado
          </div>
        )}

        <Gauge valor={valor} P={P} />

        <RatioBar aprobadas={aprobadas} rechazadas={rechazadas} P={P} />

        {/* KPIs con divisores verticales sutiles */}
        <div
          className="flex items-stretch rounded-xl"
          style={{ marginTop: 14, padding: "10px 4px", background: P.softFill, border: `1px solid ${P.hair}` }}
        >
          <Kpi label="DISPONIBILIDAD" value={disponibilidad} P={P} />
          <div style={{ width: 1, background: P.hair, margin: "2px 0" }} />
          <Kpi label="CALIDAD" value={calidad} P={P} />
          <div style={{ width: 1, background: P.hair, margin: "2px 0" }} />
          <Kpi label="RENDIMIENTO" value={rendimiento} P={P} />
        </div>

        {/* Tiempo muerto. ICONICS lo entrega en segundos y los valores
            reales son de miles, así que se formatea a h/m para que sea
            legible de un vistazo. */}
        <div className="flex items-center justify-center gap-1.5" style={{ marginTop: 12, fontSize: 12.5, color: P.inkDim }}>
          <span
            style={{
              width: 6, height: 6, borderRadius: "50%", display: "inline-block",
              background: !hasValue(tMuerto) ? P.inkDim : tMuerto > 0 ? P.amber : P.green,
            }}
          />
          Tiempo muerto
          <span style={{ color: hasValue(tMuerto) ? P.ink : P.inkDim, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, marginLeft: 2, fontSize: 13.5 }}>
            {fmtDuracion(tMuerto)}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes pulse-danger-${uid} {
          0%, 100% { box-shadow: 0 0 0 1px ${P.red}44, ${P.shadow}; }
          50% { box-shadow: 0 0 0 1px ${P.red}aa, 0 0 24px ${P.red}66, ${P.shadow}; }
        }
        @keyframes breathe-good-${uid} {
          0%, 100% { box-shadow: ${P.shadow}; }
          50% { box-shadow: 0 0 20px ${P.green}3a, ${P.shadow}; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* `AreaDemo` vivía aquí: una réplica del mockup del Área 1 con un equipo
   por estado, marcada como @deprecated y sin consumidores desde 2026-07.
   Se retiró en la migración a ICONICS porque quedó escrita en el
   vocabulario antiguo de estados y habría pintado las siete tarjetas como
   «Sin dato». Su función —ver todos los estados a la vez— la cumple hoy
   el modo demo, que asigna un estado distinto a cada máquina. */
