/**
 * Los botones que recorren los estados en «Máquina 3D».
 *
 * ── POR QUÉ VAN EN DOS GRUPOS ROTULADOS ────────────────────────────
 *
 * Cuatro de los estados que se piden demostrar —los mantenimientos, la
 * limpieza y el paro de emergencia— **el servidor no los emite hoy**. Sólo
 * viven en `lib/machines.js`, el mock anterior. El proyecto ya decidió una vez
 * no resucitarlos: enseñar un estado que ICONICS nunca manda sería mostrar una
 * pantalla que no existe.
 *
 * Aquí se enseñan igual, porque para eso está la vista, pero separados y con
 * su rótulo. Es la diferencia entre demostrar una capacidad y prometer una
 * funcionalidad.
 */
import { useTheme } from "@/theme";
import { estadoInfo } from "@/lib/domain/index.js";
import { CLAVES_CANONICAS, CLAVES_EXTENDIDAS, comportamiento } from "../lib/estadoVisual.js";

function Boton({ clave, activo, onSelect, t }) {
  const c = comportamiento(clave);
  const color = t[c.token] ?? t.textFaint;

  return (
    <button
      onClick={() => onSelect(clave)}
      aria-pressed={activo}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 12px",
        borderRadius: 999,
        cursor: "pointer",
        border: `1px solid ${activo ? color : t.border}`,
        background: activo ? `${color}1F` : "transparent",
        color: activo ? color : t.textSoft,
        fontSize: 12.5,
        fontWeight: activo ? 700 : 500,
        fontFamily: "'Inter', sans-serif",
        transition: "background 160ms ease, border-color 160ms ease, color 160ms ease",
      }}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          flexShrink: 0,
          // El punto imita la baliza: apagado cuando el estado no señaliza.
          background: c.baliza.patron === "apagada" ? "transparent" : color,
          border: c.baliza.patron === "apagada" ? `1.5px solid ${t.textFaint}` : "none",
          boxShadow: activo && c.baliza.patron !== "apagada" ? `0 0 8px ${color}` : "none",
        }}
      />
      {c.label}
    </button>
  );
}

function Grupo({ titulo, nota, claves, valor, onSelect, t }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: t.textSoft, textTransform: "uppercase" }}>
          {titulo}
        </span>
        {nota && <span style={{ fontSize: 11, color: t.textFaint }}>{nota}</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {claves.map((k) => (
          <Boton key={k} clave={k} activo={k === valor} onSelect={onSelect} t={t} />
        ))}
      </div>
    </div>
  );
}

export default function SelectorEstado({ valor, onSelect }) {
  const { theme: t } = useTheme();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Grupo
        titulo="Estados del servidor"
        nota={`los ${CLAVES_CANONICAS.length} que emite ICONICS`}
        claves={CLAVES_CANONICAS}
        valor={valor}
        onSelect={onSelect}
        t={t}
      />
      <Grupo
        titulo="Estados propuestos"
        nota="aún NO los emite ICONICS · requieren darlos de alta en el servidor"
        claves={CLAVES_EXTENDIDAS}
        valor={valor}
        onSelect={onSelect}
        t={t}
      />
    </div>
  );
}

/** Etiqueta de un estado canónico, para los desplegables de la vista. */
export const etiquetaDe = (key) => estadoInfo(key).label;
