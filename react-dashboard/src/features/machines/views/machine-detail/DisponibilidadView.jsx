/**
 * pages/machine-detail/DisponibilidadView.jsx
 * ------------------------------------------------------------------
 * Subvista "Disponibilidad" · MODO COMPARACIÓN DE DISEÑO.
 *
 * Dos maneras de contar lo mismo, cada una respondiendo una pregunta
 * distinta del operador:
 *
 *   A · Cascada de tiempo   → ¿DE DÓNDE sale el porcentaje?
 *                             el desglose 28 800 → 25 200 → 18 000 s
 *   B · Tablero de KPIs     → ¿CUÁNTO falta para la meta?
 *                             lectura de reporte, densa y accionable
 *
 * Los tiempos salen de `tiemposTurno()` (ver shared.jsx): dos constantes
 * de trabajo — duración de turno y paro previsto — y el resto derivado
 * del dato real de la máquina. Cuando el PLC entregue tiempos, solo
 * cambia ese helper.
 *
 * Color: azul = tiempo que produce · ámbar = paro previsto (esperado) ·
 * coral = paro NO previsto (lo accionable). Se usa la paleta de datos
 * `theme.viz`, no los tokens de UI, porque son manchas grandes de color.
 */
import { useMemo } from "react";
import { Panel, BandGauge, KpiTile } from "@/components/ui/index.js";
import { hasValue } from "@/lib/domain/index.js";
import { fmtNum } from "@/lib/format.js";
import {
  tiemposTurno, fmtSeg, fmtHM, META_DISPONIBILIDAD, clampPct, bandColor,
} from "@/lib/shiftModel.js";
import {
  OptionSection, FormulaStrip, WaterfallRow, MdKeyframes,
} from "../../components/factorUi.jsx";

/* ================================================================
 * OPCIÓN A · Cascada de tiempo
 * ================================================================ */

function OptionCascada({ machine, T, t }) {
  const V = t.viz;
  return (
    <Panel>
      <FormulaStrip
        titulo="Disponibilidad"
        num={{ label: "Tiempo de ejecución real", value: fmtSeg(T.ejecucion) }}
        den={{ label: "Tiempo planificado disponible", value: fmtSeg(T.planificado) }}
        result={machine.disponibilidad}
        color={bandColor(t, machine.disponibilidad)}
        t={t}
      />

      <div style={{ display: "flex", gap: 26, alignItems: "center", flexWrap: "wrap", marginTop: 20 }}>
        <div style={{ flex: "1 1 420px", minWidth: 340 }}>
          <WaterfallRow i={0} label="Tiempo potencia disponible" value={T.potencia} total={T.potencia} color={t.textFaint} format={fmtSeg} t={t} />
          <WaterfallRow i={1} label="Tiempo de inactividad planificado" value={T.planificado} loss={T.paroPlanificado} lossLabel="Paro previsto" total={T.potencia} color={t.textFaint} lossColor={V.ambar} format={fmtSeg} t={t} />
          <WaterfallRow i={2} label="Tiempo planificado disponible" value={T.planificado} total={T.potencia} color={V.azul} format={fmtSeg} t={t} />
          <WaterfallRow i={3} label="Tiempo de inactividad no planificado" value={T.ejecucion} loss={T.paroNoPlanificado} lossLabel="Paro no previsto" total={T.potencia} color={V.azul} lossColor={V.coral} format={fmtSeg} t={t} />
          <WaterfallRow i={4} label="Tiempo de ejecución real" value={T.ejecucion} total={T.potencia} color={V.azul} format={fmtSeg} t={t} hero />
        </div>

        <div style={{ flex: "0 0 auto", margin: "0 auto" }}>
          <BandGauge value={machine.disponibilidad} label="Disponibilidad" meta={META_DISPONIBILIDAD} t={t} />
        </div>
      </div>
{/* 
      <p style={{ textAlign: "center", fontSize: 12, color: t.textFaint, margin: "14px 0 0" }}>
        Cada escalón descuenta un tipo de paro. El <strong style={{ color: V.ambar }}>ámbar</strong> es tiempo que ya
        estaba previsto; el <strong style={{ color: V.coral }}>coral</strong> es el que no debía ocurrir — ese es el que se ataca.
      </p> */}
    </Panel>
  );
}

/* ================================================================
 * OPCIÓN B · Tablero de KPIs
 * ================================================================ */

function OptionTablero({ machine, T, t }) {
  const V = t.viz;
  const sinDato = !hasValue(machine.disponibilidad);
  const v = clampPct(machine.disponibilidad);
  const col = bandColor(t, machine.disponibilidad);
  // Sin medición no hay brecha contra la meta que calcular: un delta de
  // −90 pts diría que el equipo está parado, y eso no lo sabemos.
  const delta = sinDato ? null : v - META_DISPONIBILIDAD;
  // Minutos de ejecución que faltan para alcanzar la meta: el KPI que
  // convierte "te falta un 18.6 %" en una cifra sobre la que se actúa.
  const faltan = sinDato ? null : Math.max(0, Math.round((T.planificado * (META_DISPONIBILIDAD - v)) / 100));

  const R = 62, SW = 13, CIRC = 2 * Math.PI * R;

  return (
    <Panel>
      <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        {/* anillo + delta contra meta */}
        <div style={{ position: "relative", flexShrink: 0, margin: "0 auto" }}>
          <svg width={170} height={170} viewBox="0 0 160 160">
            <circle cx="80" cy="80" r={R} fill="none" stroke={t.hover} strokeWidth={SW} />
            <g transform="rotate(-90 80 80)">
              {/* Sin medición el anillo queda vacío: un arco a cero se lee
                  como «disponibilidad del 0 %», que es una afirmación. */}
              {!sinDato && (
                <circle
                  cx="80" cy="80" r={R} fill="none" stroke={col} strokeWidth={SW} strokeLinecap="round"
                  strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - v / 100)}
                  style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
                />
              )}
              {/* marca de meta sobre el anillo */}
              <circle
                cx="80" cy="80" r={R} fill="none" stroke={t.text} strokeWidth={SW + 4} strokeOpacity={0.75}
                strokeDasharray={`2 ${CIRC - 2}`} strokeDashoffset={-CIRC * (META_DISPONIBILIDAD / 100)}
              />
            </g>
            <text x="80" y="78" textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 700, fill: col }}>{fmtNum(machine.disponibilidad, 1)}</text>
            <text x="80" y="96" textAnchor="middle" style={{ fontSize: 11, letterSpacing: 2, fill: t.textFaint }}>DISPON. %</text>
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: t.textSoft }}>Contra la meta del {META_DISPONIBILIDAD}%:</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 700, color: !hasValue(delta) ? t.textFaint : delta >= 0 ? V.verde : V.coral }}>
              {hasValue(delta) ? `${delta >= 0 ? "+" : ""}${fmtNum(delta, 1)} pts` : "sin medición"}
            </span>
          </div>

          {/* Brecha en tiempo: lo que hay que recuperar, en minutos.
              Tres estados, no dos. Sin el primero, un `faltan` nulo caía
              por ser falsy en la rama «meta cumplida» y la vista afirmaba
              que el equipo iba sobrado sin haber leído nada. */}
          <div
            style={{
              padding: "12px 14px", borderRadius: 12,
              background: sinDato ? t.hover : faltan ? `${V.coral}12` : `${V.verde}12`,
              border: `1px solid ${sinDato ? t.border : faltan ? `${V.coral}44` : `${V.verde}44`}`,
            }}
          >
            {sinDato ? (
              <>
                <div style={{ fontSize: 12, color: t.textSoft }}>Sin lectura de disponibilidad</div>
                <div style={{ fontSize: 11.5, color: t.textFaint, marginTop: 4 }}>
                  No se puede calcular la brecha contra la meta.
                </div>
              </>
            ) : faltan ? (
              <>
                <div style={{ fontSize: 12, color: t.textSoft }}>Para alcanzar la meta faltan</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color: V.coral, lineHeight: 1.15 }}>
                  {fmtHM(faltan)}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: t.textSoft }}>Meta cumplida, con holgura de</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color: V.verde, lineHeight: 1.15 }}>
                  {fmtHM((T.planificado * (v - META_DISPONIBILIDAD)) / 100)}
                </div>
                <div style={{ fontSize: 11.5, color: t.textFaint }}>por encima del objetivo del turno</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* desglose del turno en tarjetas */}
      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <KpiTile label="Potencia disponible" value={fmtHM(T.potencia)} sub={fmtSeg(T.potencia)} color={t.text} t={t} />
        <KpiTile label="Paro previsto" value={fmtHM(T.paroPlanificado)} sub="comidas y cambios" color={V.ambar} t={t} />
        <KpiTile label="Planificado disponible" value={fmtHM(T.planificado)} sub={fmtSeg(T.planificado)} color={V.azul} t={t} />
        <KpiTile label="Paro NO previsto" value={fmtHM(T.paroNoPlanificado)} sub="pérdida atacable" color={V.coral} t={t} strong />
        <KpiTile label="Ejecución real" value={fmtHM(T.ejecucion)} sub={fmtSeg(T.ejecucion)} color={V.verde} t={t} />
      </div>
    </Panel>
  );
}

/* ================================================================ */
export default function DisponibilidadView({ machine, t, C }) {
  const T = useMemo(() => tiemposTurno(machine), [machine]);

  return (
    <>


      <OptionSection tag="OPCIÓN A" title="Cascada de tiempo" accent={C.disponibilidad} t={t}>
        <OptionCascada machine={machine} T={T} t={t} />
      </OptionSection>

      <OptionSection tag="OPCIÓN B" title="Tablero de KPIs" accent={t.viz.verde} t={t}>
        <OptionTablero machine={machine} T={T} t={t} />
      </OptionSection>

      <MdKeyframes />
    </>
  );
}
