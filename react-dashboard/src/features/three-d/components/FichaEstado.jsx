/**
 * La ficha del estado activo: qué significa y por qué canal lo dice el modelo.
 *
 * Existe para que la vista se explique sola. Una escena 3D que cambia de forma
 * sin decir por qué es una demo bonita; con la ficha al lado es una
 * herramienta con la que alguien puede aprender a leer la pantalla de planta,
 * que es lo que se mira ocho horas.
 */
import { ESTADOS } from "@/lib/domain/index.js";
import { useTheme } from "@/theme";
import { SIN_DATO } from "@/lib/format.js";

/** Cómo se describe cada canal en palabras. */
const POSE = {
  cerrada: "Cerrada",
  abierta: "Panel frontal abierto",
  despiece: "Abierta y con el módulo separado",
  fantasma: "Translúcida (estado desconocido)",
};

const MOVIMIENTO = {
  ninguno: "Ninguno",
  giro: "Husillo girando",
  sacudida: "Sacudida al entrar, una sola vez",
};

const BALIZA = {
  fija: "Encendida fija",
  destello: "Destello",
  apagada: "Apagada",
};

function Fila({ etiqueta, valor, color, t }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderTop: `1px solid ${t.border}` }}>
      <span style={{ fontSize: 11.5, color: t.textFaint, flexShrink: 0 }}>{etiqueta}</span>
      <span style={{ fontSize: 12, color: color ?? t.text, fontWeight: 600, textAlign: "right" }}>{valor}</span>
    </div>
  );
}

export default function FichaEstado({ descriptor, rpm }) {
  const { theme: t } = useTheme();
  const color = t[descriptor.token] ?? t.textFaint;
  const codigo = ESTADOS[descriptor.key]?.codigo;

  return (
    <div
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        padding: 16,
        boxShadow: t.shadow,
      }}
    >
      {/* Chip de estado, con la misma forma que en las tarjetas 2D. */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 12px 5px 10px",
          borderRadius: 999,
          background: `${color}1F`,
          border: `1px solid ${color}55`,
          marginBottom: 12,
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
        <span style={{ color, fontWeight: 700, fontSize: 13 }}>{descriptor.label}</span>
      </div>

      {/* El aviso que impide que la demo prometa lo que planta no tiene. */}
      {descriptor.esExtendido && (
        <div
          style={{
            fontSize: 11.5,
            lineHeight: 1.5,
            color: t.amber,
            background: t.amberSoft,
            border: `1px solid ${t.amber}44`,
            borderRadius: 9,
            padding: "8px 10px",
            marginBottom: 12,
          }}
        >
          Estado <strong>propuesto</strong>: ICONICS no lo emite hoy. Para usarlo en planta hay
          que darlo de alta primero en el servidor.
        </div>
      )}

      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: t.textSoft, margin: "0 0 12px" }}>
        {descriptor.lectura}
      </p>

      <Fila etiqueta="Código ICONICS" valor={codigo ?? SIN_DATO} t={t} />
      <Fila etiqueta="Baliza" valor={BALIZA[descriptor.baliza.patron]} color={color} t={t} />
      <Fila etiqueta="Silueta" valor={POSE[descriptor.pose]} t={t} />
      <Fila etiqueta="Cinta" valor={descriptor.pieza ? "Con pieza" : "Vacía"} t={t} />
      <Fila etiqueta="Movimiento" valor={MOVIMIENTO[descriptor.movimiento.tipo]} t={t} />

      {/* El ritmo sólo se afirma si se midió. Ver `rpmDe`. */}
      {descriptor.movimiento.tipo === "giro" && (
        <Fila
          etiqueta="Ritmo del husillo"
          valor={rpm.medido ? `${Math.round(rpm.rpm)} rpm` : `${Math.round(rpm.rpm)} rpm · sin medir`}
          color={rpm.medido ? t.text : t.textFaint}
          t={t}
        />
      )}

      <Fila
        etiqueta="Bucle"
        valor={descriptor.bucle === "ninguno" ? "Ninguno" : descriptor.bucle === "alarma" ? "Sí (alarma)" : "Sí (informativo)"}
        color={descriptor.bucle === "ninguno" ? t.textSoft : color}
        t={t}
      />
    </div>
  );
}
