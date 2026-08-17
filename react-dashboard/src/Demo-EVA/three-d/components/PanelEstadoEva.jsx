/**
 * El panel lateral de la vista «Equipo 3D»: el selector de estado y la ficha
 * que explica qué comunica el modelo.
 *
 * ── POR QUÉ LA FICHA NO ES DECORACIÓN ──────────────────────────────
 *
 * La vista es el banco de pruebas del contrato de `lib/comportamiento.js`: aquí
 * se ve, uno por uno, qué comunica cada estado y por qué canal. Sin la ficha
 * que lo enuncia, quien mira sólo ve un modelo que cambia de color y tiene que
 * adivinar la regla — y adivinándola, la aprende mal.
 *
 * ── LA DIFERENCIA CON EL SELECTOR DE RESONAC ───────────────────────
 *
 * Aquél separa los estados en dos grupos porque cuatro de los suyos **no los
 * emite ICONICS** y enseñarlos sin decirlo prometería una pantalla que en
 * planta no ocurre. Aquí no hace falta esa separación por un motivo distinto y
 * más incómodo: **ninguno** de los cinco lo emite ICONICS, porque los cinco son
 * derivados. Así que el aviso no va sobre unos pocos, va sobre el grupo entero
 * y se escribe una vez, arriba.
 */
import { useTheme } from "@/theme";

import { ESTADOS_ORDEN, estadoInfo } from "../../domain/estado.js";
import { estadoColor } from "../../components/paleta.js";
import { RPM_MAX, RPM_MIN, comportamiento } from "../lib/comportamiento.js";

export function SelectorEstado({ valor, onSelect }) {
  const { theme: t, dark } = useTheme();

  return (
    <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 14, padding: 14, boxShadow: t.shadow }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.9, textTransform: "uppercase", color: t.textFaint, marginBottom: 4 }}>
        Estados derivados
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 11, color: t.textFaint, lineHeight: 1.5 }}>
        Los cinco salen de comparar las señales contra umbrales locales. ICONICS
        no publica ningún estado para este árbol.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {ESTADOS_ORDEN.map((key) => {
          const info = estadoInfo(key);
          const activo = valor === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              aria-pressed={activo}
              style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: "8px 10px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                border: `1px solid ${activo ? t.accent : t.border}`,
                background: activo ? t.accentSoft : "transparent",
                color: activo ? t.text : t.textSoft,
                fontSize: 12.5, fontWeight: activo ? 700 : 500,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <span
                style={{
                  width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                  background: estadoColor(dark, key),
                }}
              />
              {info.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Fila «canal → qué hace» de la ficha. */
function Canal({ etiqueta, valor, t }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "5px 0", borderTop: `1px solid ${t.border}` }}>
      <span style={{ fontSize: 10.5, color: t.textFaint, width: 74, flexShrink: 0 }}>{etiqueta}</span>
      <span style={{ fontSize: 11.5, color: t.textSoft, lineHeight: 1.45 }}>{valor}</span>
    </div>
  );
}

const PATRON = {
  fija: "Encendida fija",
  destello: "En destello",
  apagada: "Apagada",
};

export function FichaComportamiento({ descriptor, rpm }) {
  const { theme: t, dark } = useTheme();
  const c = comportamiento(descriptor.key);
  const color = estadoColor(dark, descriptor.key);

  const ritmo = () => {
    if (rpm.rpm <= 0) {
      return rpm.motivo === "reposo"
        ? "Parado: el sistema no está impulsando."
        : "Parado.";
    }
    const cifra = `${Math.round(rpm.rpm)} rpm`;
    return rpm.medido
      ? `${cifra}, escalado desde la carga del motor (${RPM_MIN}–${RPM_MAX} rpm).`
      : `${cifra}, ritmo nominal: impulsa, pero la carga no se está midiendo.`;
  };

  return (
    <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 14, padding: 14, boxShadow: t.shadow }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{descriptor.label}</span>
      </div>

      <p style={{ margin: "0 0 10px", fontSize: 12, color: t.textSoft, lineHeight: 1.5 }}>{c.lectura}</p>

      <Canal etiqueta="Baliza" valor={PATRON[c.baliza.patron] ?? c.baliza.patron} t={t} />
      <Canal
        etiqueta="Material"
        valor={
          c.material.wireframe
            ? "Translúcido y en malla: no se afirma nada."
            : c.material.desaturar > 0
              ? "Desaturado: presente, sin actividad."
              : c.material.tinte
                ? "Teñido del color del estado."
                : "Acabado normal."
        }
        t={t}
      />
      <Canal etiqueta="Impulsor" valor={ritmo()} t={t} />
      <Canal
        etiqueta="Bucle"
        valor={
          c.bucle === "ninguno"
            ? rpm.rpm > 0
              ? "Sólo el giro del impulsor, que es informativo."
              : "Ninguno. La escena no repinta."
            : "Destello de la baliza: es el único bucle de alarma."
        }
        t={t}
      />
    </div>
  );
}
