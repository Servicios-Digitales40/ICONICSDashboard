/**
 * La tarjeta que se abre al pulsar una máquina de la maqueta.
 *
 * ── POR QUÉ ES DOM Y NO GEOMETRÍA ──────────────────────────────────
 *
 * Va dentro de un `<Html>` de drei, así que es HTML normal flotando sobre la
 * escena. La alternativa era dibujar el texto en 3D con `<Text>`, y se
 * descartó por tres motivos, en este orden:
 *
 *  1. Obliga a reimplementar el formateo. Aquí se reutiliza `fmtPct`, que ya
 *     sabe pintar «—» cuando no hay medición — que es la regla más importante
 *     de esta aplicación y la más fácil de romper al reescribirla.
 *  2. Hereda el tema, las tipografías y el `Panel` del resto del tablero, así
 *     que la tarjeta se ve igual que las demás y no como un injerto.
 *  3. `<Text>` arrastra `troika-three-text`: ~120 KB y un *web worker*.
 *
 * ── POR QUÉ NO ESCALA CON LA DISTANCIA ─────────────────────────────
 *
 * Sin `distanceFactor`, la tarjeta mantiene su tamaño en pantalla aunque la
 * cámara se aleje. Se pierde el efecto de estar «pegada» al modelo, y a cambio
 * el dato se lee siempre — que es a lo que viene. Es lo mismo que hace la
 * pantalla de GraphWorX de la que sale la idea.
 */
import { Html } from "@react-three/drei";
import { X } from "lucide-react";

import { useTheme } from "@/theme";
import { estadoInfo, hasValue } from "@/lib/domain/index.js";
import { SIN_DATO, fmtPct } from "@/lib/format.js";

/** Umbrales compartidos con `GaugeCard`, para que el color signifique lo mismo. */
const UMBRAL_BAJO = 50;
const UMBRAL_MEDIO = 75;

function colorFactor(t, v) {
  if (!hasValue(v)) return t.textFaint;
  if (v < UMBRAL_BAJO) return t.coral;
  if (v < UMBRAL_MEDIO) return t.amber;
  return t.success;
}

/** Una métrica: barra + cifra. Sin dato la barra queda VACÍA, no a cero. */
function Factor({ etiqueta, valor, t }) {
  const sinDato = !hasValue(valor);
  const color = colorFactor(t, valor);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9.5, letterSpacing: 0.4, color: t.textFaint, fontWeight: 600, whiteSpace: "nowrap" }}>
        {etiqueta}
      </div>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 14,
          fontWeight: 700,
          color: sinDato ? t.textFaint : t.text,
          margin: "1px 0 4px",
        }}
      >
        {sinDato ? SIN_DATO : valor.toFixed(1)}
        {!sinDato && <span style={{ fontSize: 9.5, color: t.textFaint }}> %</span>}
      </div>
      <div style={{ height: 3, borderRadius: 2, background: `${t.textFaint}33`, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: sinDato ? 0 : `${Math.max(0, Math.min(100, valor))}%`,
            background: color,
            transition: "width 700ms ease-out",
          }}
        />
      </div>
    </div>
  );
}

export default function TarjetaKpi({ machine, altura = 2.1, onCerrar, onDetalle }) {
  const { theme: t } = useTheme();

  const info = estadoInfo(machine.estado);
  const colorEstado = t[info.token] ?? t.textFaint;
  const colorOee = colorFactor(t, machine.oee);

  return (
    <Html position={[0, altura, 0]} center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
      {/* El puntero se reactiva sólo en la tarjeta: sin esto, el contenedor
          invisible de <Html> se traga los clics sobre las máquinas de detrás. */}
      <div
        style={{
          pointerEvents: "auto",
          width: 226,
          background: t.panel,
          border: `1px solid ${t.border}`,
          borderLeft: `3px solid ${colorEstado}`,
          borderRadius: 12,
          padding: "10px 12px 12px",
          boxShadow: t.shadowHover,
          fontFamily: "'Inter', sans-serif",
          // Nace un poco por debajo y sube: el movimiento la ata a la máquina
          // que se acaba de pulsar. Una sola vez, no en bucle.
          animation: "tarjeta-kpi-entra 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.text, lineHeight: 1.2 }}>{machine.equipo}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: colorEstado, flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: colorEstado, fontWeight: 700 }}>{info.label}</span>
            </div>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: t.textFaint, padding: 2, lineHeight: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Dato desactualizado: se sigue mostrando el último valor bueno
            —vaciar la tarjeta sería peor— pero se advierte. */}
        {machine.stale && (
          <div style={{ fontSize: 9.5, color: t.amber, marginBottom: 6, letterSpacing: 0.2 }}>dato desactualizado</div>
        )}

        {/* OEE, el dato rey. */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 4,
            padding: "6px 8px",
            borderRadius: 8,
            background: `${colorOee}14`,
            marginBottom: 9,
          }}
        >
          <span style={{ fontSize: 9.5, letterSpacing: 1.6, color: t.textFaint, fontWeight: 700, marginRight: 2 }}>OEE</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 21, fontWeight: 700, color: colorOee, lineHeight: 1 }}>
            {hasValue(machine.oee) ? machine.oee.toFixed(2) : SIN_DATO}
          </span>
          {hasValue(machine.oee) && <span style={{ fontSize: 11, color: colorOee, opacity: 0.7 }}>%</span>}
        </div>

        <div style={{ display: "flex", gap: 9 }}>
          <Factor etiqueta="DISPON." valor={machine.disponibilidad} t={t} />
          <Factor etiqueta="RENDIM." valor={machine.rendimiento} t={t} />
          <Factor etiqueta="CALIDAD" valor={machine.calidad} t={t} />
        </div>

        <button
          onClick={onDetalle}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${t.accent}55`,
            background: t.accentSoft,
            color: t.accent,
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Ver detalle
        </button>

        <style>{`
          @keyframes tarjeta-kpi-entra {
            from { opacity: 0; transform: translateY(6px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
      </div>
    </Html>
  );
}

/** Etiqueta escueta del hover: sólo el nombre, para no tapar la planta. */
export function EtiquetaEquipo({ machine, altura = 1.55 }) {
  const { theme: t } = useTheme();
  const info = estadoInfo(machine.estado);
  const color = t[info.token] ?? t.textFaint;

  return (
    <Html position={[0, altura, 0]} center style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 9px",
          borderRadius: 999,
          background: t.panel,
          border: `1px solid ${t.border}`,
          boxShadow: t.shadow,
          fontSize: 11,
          fontWeight: 700,
          color: t.text,
          fontFamily: "'Inter', sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
        {machine.equipo}
        <span style={{ color: t.textFaint, fontWeight: 500 }}>
          {hasValue(machine.oee) ? `${machine.oee.toFixed(1)} %` : fmtPct(null)}
        </span>
      </div>
    </Html>
  );
}
