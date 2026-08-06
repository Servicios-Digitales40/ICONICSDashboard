/**
 * prototypes/SandboxPage.jsx
 * ------------------------------------------------------------------
 * Banco de pruebas de diseño (temporal). Hoy alberga DOS evaluaciones
 * abiertas, cada una con su propio registro de propuestas:
 *
 *   1. Comparativo · disposición  → prototypes/comparativo/
 *      Tres maneras de organizar la vista comparativa (Fase 2 del
 *      rediseño), todas contra los mismos datos y con un selector de
 *      escenario para verlas resolver cada estado del veredicto.
 *
 *   2. Tarjeta de máquina         → prototypes/machine-cards/variants.js
 *      Cinco maneras de representar el estado de OEE de un equipo. El
 *      mismo registro que usan las 10 vistas de área y el detalle.
 *
 * Diferencia con las vistas de `prototypes/area-views/`: aquí se comparan las
 * propuestas entre sí; allí se ve cada una sola, en su contexto real de
 * uso. Cuando se elija una ganadora en cada evaluación, se promueve al
 * kit definitivo y esta página + las carpetas temp se van.
 */
import { useMemo, useState } from "react";
import { useTheme } from "@/theme";
import { CARD_VARIANTS } from "./machine-cards/variants.js";
import { COMPARATIVO_LAYOUTS } from "./comparativo/variants.js";
import { buildScenarios } from "./comparativo/scenarios.js";
import { getMachinesByArea, getMachineSnapshot, getMachineHistoryForDate } from "@/lib/machines.js";
import { buildComparison, verdict, isoDay, fmtDay } from "@/features/machines/lib/compare.js";

// Máquinas de muestra con estados y OEE contrastantes (bajo/alto/crítico).
const DEMO = getMachinesByArea("sandbox");

/* Encabezado de sección, común a las dos evaluaciones. */
function SectionHead({ tag, label, note, t }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${t.accent}`, flexWrap: "wrap" }}>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: t.accent, background: `${t.accent}18`, border: `1px solid ${t.accent}44`, borderRadius: 6, padding: "2px 8px" }}>
        {tag}
      </span>
      <span style={{ fontSize: 17, fontWeight: 700, color: t.text }}>{label}</span>
      <span style={{ fontSize: 12.5, color: t.textFaint, marginLeft: "auto" }}>{note}</span>
    </div>
  );
}

/* Botón de escenario / selector genérico del banco de pruebas. */
function PickButton({ active, onClick, title, children, t }) {
  return (
    <button
      type="button" onClick={onClick} title={title} aria-pressed={active} className="app-btn"
      style={{
        fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer",
        background: active ? `${t.accent}18` : "transparent",
        color: active ? t.accent : t.textSoft,
        border: `1px solid ${active ? `${t.accent}66` : t.border}`,
        fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/* ==================================================================
 * EVALUACIÓN 1 · Disposición de la vista comparativa
 * ================================================================== */
function ComparativoBench({ t }) {
  const machine = DEMO[0];
  const todayIso = isoDay(new Date());
  const scenarios = useMemo(() => buildScenarios(machine, todayIso), [machine, todayIso]);
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const sc = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];

  // El MISMO modelo alimenta las tres propuestas: lo único que cambia
  // entre ellas es la disposición, nunca los datos.
  const model = useMemo(() => {
    const snapA = getMachineSnapshot(machine, sc.dateA);
    const snapB = sc.missingB ? null : getMachineSnapshot(machine, sc.dateB);
    const trendA = getMachineHistoryForDate(machine, sc.dateA);
    const trendB = sc.missingB ? [] : getMachineHistoryForDate(machine, sc.dateB);
    const cmp = buildComparison(snapA, snapB);
    // Sin paleta por métrica a propósito (mejora #8): el color codifica
    // SOLO la identidad de la fecha, y verde/coral queda reservado a la
    // dirección del cambio. Tres sistemas de color compitiendo era una
    // de las razones por las que la vista actual se lee mal.
    return {
      dateA: sc.dateA, dateB: sc.dateB, snapA, snapB, trendA, trendB,
      cmp, v: verdict(cmp), colorA: t.accent, colorB: t.violet,
    };
  }, [machine, sc, t]);

  return (
    <>
      <SectionHead
        tag="fase 2" label="Comparativo · disposición"
        note={`${machine.equipo} · ${fmtDay(sc.dateA)} vs. ${fmtDay(sc.dateB)}`} t={t}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {scenarios.map((s) => (
          <PickButton key={s.id} active={s.id === scenarioId} onClick={() => setScenarioId(s.id)} title={s.hint} t={t}>
            {s.label}
          </PickButton>
        ))}
      </div>
      <div style={{ fontSize: 12, color: t.textFaint, marginBottom: 24 }}>{sc.hint}</div>

      {Object.entries(COMPARATIVO_LAYOUTS).map(([key, { label, Comp, tagline }]) => (
        <section key={key} style={{ marginBottom: 44 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: t.violet, background: `${t.violet}18`, border: `1px solid ${t.violet}44`, borderRadius: 6, padding: "2px 8px" }}>
              {key}
            </span>
            <span style={{ fontSize: 15.5, fontWeight: 700, color: t.text }}>{label}</span>
            <span style={{ fontSize: 12, color: t.textFaint }}>{tagline}</span>
          </div>
          <Comp model={model} t={t} />
        </section>
      ))}
    </>
  );
}

/* ==================================================================
 * EVALUACIÓN 2 · Tarjeta de máquina (ya existente)
 * ================================================================== */
function TarjetaBench({ t }) {
  return (
    <>
      {Object.entries(CARD_VARIANTS).map(([key, { label, Comp, wide }]) => (
        <section key={key} style={{ marginBottom: 40 }}>
          <SectionHead
            tag={key} label={label}
            note={wide ? "formato ancho · 2 por fila" : "formato compacto · 4 por fila"} t={t}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
            {DEMO.map((m) => (
              <div key={m.id} style={{ display: "flex", ...(wide ? { flex: "1 1 520px", maxWidth: 620 } : {}) }}>
                <Comp {...m} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function Sandbox() {
  const { theme: t } = useTheme();
  const [bench, setBench] = useState("comparativo");

  return (
    <>
      <div style={{ padding: "12px 16px", borderRadius: 12, background: t.hover, border: `1px dashed ${t.border}`, fontSize: 12.5, color: t.textSoft, marginBottom: 18 }}>
        <strong style={{ color: t.text }}>Banco de pruebas de diseño.</strong>{" "}
        Dos evaluaciones abiertas: la <em>disposición</em> de la vista comparativa (Fase 2 del
        rediseño) y la <em>tarjeta de máquina</em>. Todas las propuestas de cada evaluación se
        pintan con los mismos datos, para que la elección mida el diseño y no el dato.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 26 }}>
        <PickButton active={bench === "comparativo"} onClick={() => setBench("comparativo")} t={t}>
          Comparativo · disposición
        </PickButton>
        <PickButton active={bench === "tarjeta"} onClick={() => setBench("tarjeta")} t={t}>
          Tarjeta de máquina
        </PickButton>
      </div>

      {bench === "comparativo" ? <ComparativoBench t={t} /> : <TarjetaBench t={t} />}
    </>
  );
}
