/**
 * La ficha que se abre al pulsar un activo de la maqueta.
 *
 * ── POR QUÉ ES DOM Y NO GEOMETRÍA ──────────────────────────────────
 *
 * Tres motivos, en orden de peso:
 * reutiliza el formateo que ya sabe pintar «—» cuando no hay medición —la regla
 * más importante de esta aplicación y la más fácil de romper al reescribirla—,
 * hereda tema y tipografías, y evita arrastrar `troika-three-text` (~120 KB y
 * un web worker) para dibujar cuatro líneas de texto.
 *
 * ── POR QUÉ NO ESCALA CON LA DISTANCIA ─────────────────────────────
 *
 * Sin `distanceFactor` la ficha mantiene su tamaño en pantalla aunque la cámara
 * se aleje. Se pierde el efecto de estar «pegada» al modelo y a cambio el dato
 * se lee siempre, que es a lo que viene.
 */
import { Html } from "@react-three/drei";
import { X } from "lucide-react";

import { useTheme } from "@/theme";

import { estadoInfo } from "../../domain/estado.js";
import { fmtSenal } from "../../lib/formato.js";
import { estadoColor } from "../../components/paleta.js";

/** Una señal dentro de la ficha: punto de estado, nombre, valor y banda. */
function FilaSenal({ senal, t, dark }) {
  const info = estadoInfo(senal.estado);
  const reposo = senal.estado === "reposo";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0" }}>
      <span
        style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: estadoColor(dark, senal.estado),
        }}
      />
      <span style={{ fontSize: 11, color: t.textSoft, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {senal.corto}
      </span>
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700,
          color: reposo ? t.textFaint : t.text, whiteSpace: "nowrap",
        }}
      >
        {fmtSenal(senal)}
      </span>
      <span style={{ fontSize: 9.5, color: t.textFaint, width: 46, textAlign: "right", flexShrink: 0 }}>
        {info.corto}
      </span>
    </div>
  );
}

export default function FichaActivo({ activo, altura = 2.5, onCerrar, onDetalle }) {
  // `dark` se lee y se pasa: la ficha es DOM sobre el canvas, así que hereda el
  // tema como cualquier tarjeta. Fijarlo a claro dejaría los puntos de estado
  // con la paleta equivocada justo en modo oscuro, que es el de un wallboard.
  const { theme: t, dark } = useTheme();
  const info = estadoInfo(activo.estado);
  const color = estadoColor(dark, activo.estado);

  return (
    <Html position={[0, altura, 0]} center zIndexRange={[40, 0]} style={{ pointerEvents: "auto" }}>
      <div
        // El clic no debe llegar al suelo, que cierra la ficha.
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 250,
          background: t.panel,
          border: `1px solid ${t.border}`,
          borderTop: `3px solid ${color}`,
          borderRadius: 12,
          boxShadow: t.shadowHover,
          padding: "11px 13px 12px",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{activo.label}</div>
            <div style={{ fontSize: 10.5, color: t.textFaint }}>{info.label}</div>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: t.textFaint, padding: 2, display: "flex", flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${t.border}` }}>
          {activo.senales.map((s) => (
            <FilaSenal key={s.key} senal={s} t={t} dark={dark} />
          ))}
        </div>

        {/*
          Las notas del catálogo, que hasta ahora no se pintaban en ningún
          sitio: existían en `domain/senales.js`, las verificaba una prueba y no
          las veía nadie.
          Hacen falta desde que el nivel se dibuja en la columna: quien lea
          «Nivel 62 %» bajo «Tanque de almacenamiento» y mire el bidón vacío
          tiene derecho a saber por qué, y la respuesta está escrita en el
          catálogo desde que se supo.
        */}
        {activo.senales.filter((s) => s.nota).map((s) => (
          <p
            key={`nota-${s.key}`}
            style={{ margin: "6px 0 0", fontSize: 10, lineHeight: 1.45, color: t.textFaint }}
          >
            {s.corto}: {s.nota}
          </p>
        ))}

        {onDetalle && (
          <button
            onClick={onDetalle}
            style={{
              marginTop: 9, width: "100%", padding: "6px 10px", borderRadius: 8,
              border: `1px solid ${t.border}`, background: t.hover, color: t.textSoft,
              fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Ver detalle completo
          </button>
        )}
      </div>
    </Html>
  );
}

/** Etiqueta ligera al señalar, sin abrir la ficha. */
export function EtiquetaActivo({ activo, altura = 2.2 }) {
  const { theme: t } = useTheme();

  return (
    <Html position={[0, altura, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <div
        style={{
          padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
          background: t.panel, border: `1px solid ${t.border}`, boxShadow: t.shadow,
          fontSize: 11, fontWeight: 600, color: t.text, fontFamily: "'Inter', sans-serif",
        }}
      >
        {activo.corto}
      </div>
    </Html>
  );
}
