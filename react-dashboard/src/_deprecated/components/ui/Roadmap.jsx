/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/Roadmap.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * ui/Roadmap.jsx
 * ------------------------------------------------------------------
 * Roadmap interactivo de N etapas. Cada etapa define sus propios
 * campos en `stage.fields` (ver data/mockData.js), así el formulario
 * de la tarjeta de detalle cambia según la etapa activa: "Descubrimiento"
 * pregunta por entrevistas, "Desarrollo" pregunta por repositorio, etc.
 * "Estado" y "Notas" sí son comunes a todas, porque tiene sentido
 * rastrear eso sin importar en qué etapa estés.
 */
import { useState } from "react";
import {
  Check, ChevronLeft, ChevronRight, MessageSquare,
  Users, Target, PenTool, Link2, GitBranch, ShieldCheck, Calendar, Megaphone,
} from "lucide-react";
import { useTheme } from "@/theme";
import { Button } from "@/components/ui/Button.jsx";
import { Input, fieldStyle } from "@/components/ui/Input.jsx";

const ESTADOS = ["Pendiente", "En curso", "Completado"];

// Mapa string -> ícono, para que mockData.js no tenga que importar JSX.
const FIELD_ICONS = {
  users: <Users size={14} />,
  target: <Target size={14} />,
  pen: <PenTool size={14} />,
  link: <Link2 size={14} />,
  branch: <GitBranch size={14} />,
  shield: <ShieldCheck size={14} />,
  calendar: <Calendar size={14} />,
  megaphone: <Megaphone size={14} />,
};

export function Roadmap({ stages }) {
  const { theme: t } = useTheme();
  const [active, setActive] = useState(0);
  const progressPct = (active / (stages.length - 1)) * 100;
  const stage = stages[active];

  // formData[i] = { [campo1]: "", [campo2]: "", estado, notas } por etapa.
  const [formData, setFormData] = useState({});
  const current = formData[active] || { estado: "Pendiente", notas: "" };

  function updateField(field, val) {
    setFormData((prev) => ({ ...prev, [active]: { ...current, [field]: val } }));
  }

  return (
    <div>
      {/* Línea de progreso + círculos numerados */}
      <div style={{ position: "relative", padding: "0 8px", marginBottom: 30 }}>
        <div style={{ position: "absolute", top: 17, left: 24, right: 24, height: 3 }}>
          <div style={{ position: "absolute", inset: 0, background: t.grid, borderRadius: 3 }} />
          <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${progressPct}%`, background: t.gradAccent, borderRadius: 3, transition: "width 0.5s ease" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
          {stages.map((s, i) => {
            const done = i < active;
            const isCurrent = i === active;
            return (
              <button
                key={i}
                onClick={() => setActive(i)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", flex: 1 }}
              >
                <span
                  style={{
                    width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif",
                    background: done || isCurrent ? t.gradAccent : t.panel,
                    color: done || isCurrent ? "#fff" : t.textFaint,
                    border: `2px solid ${done || isCurrent ? "transparent" : t.border}`,
                    boxShadow: isCurrent ? `0 0 0 5px ${t.accentSoft}` : "none",
                    transition: "box-shadow 0.25s ease, background 0.25s ease",
                  }}
                >
                  {done ? <Check size={16} /> : i + 1}
                </span>
                <span style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? t.text : t.textFaint, textAlign: "center" }}>
                  {s.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tarjeta de detalle de la etapa activa */}
      <div key={active} className="row-fade" style={{ background: t.hover, borderRadius: 14, padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: t.accent, background: t.accentSoft, padding: "2px 9px", borderRadius: 999, fontFamily: "'IBM Plex Mono', monospace" }}>
            Etapa {active + 1} de {stages.length}
          </span>
          <span style={{ fontSize: 11.5, color: t.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{stage.date}</span>
        </div>

        <h4 style={{ margin: "4px 0 4px", fontSize: 16, fontWeight: 700, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{stage.title}</h4>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: t.textSoft, lineHeight: 1.55, maxWidth: 520 }}>{stage.desc}</p>

        {/* ---- Campos PROPIOS de esta etapa (distintos en cada una) ---- */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          {stage.fields.map((f) => (
            <div key={f.key}>
              <div style={{ fontSize: 11, color: t.textFaint, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>{f.label}</div>
              <Input
                icon={FIELD_ICONS[f.icon]}
                placeholder={f.placeholder}
                value={current[f.key] || ""}
                onChange={(e) => updateField(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>

        {/* ---- Campos COMUNES a todas las etapas ---- */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: t.textFaint, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>estado</div>
          <div style={{ display: "flex", gap: 6 }}>
            {ESTADOS.map((estado) => {
              const isSelected = current.estado === estado;
              return (
                <span
                  key={estado}
                  onClick={() => updateField("estado", estado)}
                  style={{
                    flex: 1, textAlign: "center", padding: "9px 8px", borderRadius: 9, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.15s ease",
                    background: isSelected ? t.gradAccent : t.panel,
                    color: isSelected ? "#fff" : t.textSoft,
                    border: `1px solid ${isSelected ? "transparent" : t.border}`,
                  }}
                >
                  {estado}
                </span>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: t.textFaint, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace", display: "flex", alignItems: "center", gap: 5 }}>
            <MessageSquare size={12} /> notas
          </div>
          <textarea
            placeholder="Agrega comentarios, bloqueos o próximos pasos para esta etapa…"
            rows={2}
            className="field"
            value={current.notas || ""}
            onChange={(e) => updateField("notas", e.target.value)}
            style={{ ...fieldStyle(t), resize: "vertical" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" icon={<ChevronLeft size={14} />} onClick={() => setActive((a) => Math.max(0, a - 1))}>Anterior</Button>
          <Button variant="primary" icon={<ChevronRight size={14} />} onClick={() => setActive((a) => Math.min(stages.length - 1, a + 1))}>Siguiente</Button>
        </div>
      </div>
    </div>
  );
}