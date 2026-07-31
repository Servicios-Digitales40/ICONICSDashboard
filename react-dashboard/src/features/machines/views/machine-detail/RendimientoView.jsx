/**
 * Subvista "Rendimiento", en modo comparación de diseño. Tres maneras de
 * contar lo mismo:
 *
 *   A · Balance de producción → ¿de dónde sale el porcentaje?
 *   B · Ciclo por pieza       → ¿por qué se pierde?
 *   C · Tablero de KPIs       → ¿cuánto falta para la meta?
 *
 * El ciclo nominal no está en los datos, así que en lugar de fijarlo como
 * constante se deriva del rendimiento real: pasa de supuesto a KPI calculado,
 * y así la producción teórica cuadra con las piezas que la máquina reporta y
 * con el nodo «En tiempo operativo» del Sankey de la subvista OEE.
 *
 * Color: verde = producción lograda · ámbar = producción perdida por ir por
 * debajo de la velocidad nominal (tiempo, no material).
 */
import { useMemo } from "react";
import { Panel, BandGauge, KpiTile } from "@/components/ui/index.js";
import { hasValue } from "@/lib/domain/index.js";
import { SIN_DATO, fmtEntero, fmtNum } from "@/lib/format.js";
import { tiemposTurno, fmtSeg, fmtHM, clampPct, bandColor } from "@/lib/shiftModel.js";
import {
  OptionSection, FormulaStrip, WaterfallRow, MdKeyframes, SinLecturas,
} from "../../components/factorUi.jsx";

const META_RENDIMIENTO = 85; // % objetivo
const fmtPz = (n) => (hasValue(n) ? `${Math.round(n).toLocaleString("es-MX")} pz` : SIN_DATO);
const fmtSegDec = (s) => (hasValue(s) ? `${s.toFixed(2)} s` : SIN_DATO);

/**
 * Magnitudes de rendimiento del turno.
 *
 *   real     = aprobadas + rechazadas            ← dato directo
 *   teórica  = real / (R/100)                    ← lo que cabría a ritmo nominal
 *   ciclo ideal = tiempo de ejecución / teórica  ← KPI derivado, no supuesto
 *   ciclo real  = tiempo de ejecución / real
 *
 * El tiempo de ejecución viene del modelo de turno de Disponibilidad, así que
 * las tres subvistas hablan de los mismos segundos.
 *
 * Devuelve `null` en `real` cuando faltan lecturas. La cadena se calcula por
 * división encadenada, y un solo hueco arrastraría NaN hasta los cinco KPIs
 * finales; peor aún, `null / null` en JavaScript da 0, que parece un dato.
 */
function produccion(machine) {
  const { ejecucion } = tiemposTurno(machine);

  const completo =
    hasValue(machine.aprobadas) && hasValue(machine.rechazadas) &&
    hasValue(machine.rendimiento) && hasValue(ejecucion);

  if (!completo) {
    return {
      ejecucion, real: null, teorica: null, perdida: null,
      cicloIdeal: null, cicloReal: null, perdidaCiclo: null,
      tiempoPerdido: null, ritmoReal: null, ritmoIdeal: null, pct: null,
    };
  }

  const real = machine.aprobadas + machine.rechazadas;
  const r = machine.rendimiento / 100;
  const teorica = r > 0 ? Math.round(real / r) : 0;
  const perdida = teorica - real;
  const cicloIdeal = teorica ? ejecucion / teorica : 0;
  const cicloReal = real ? ejecucion / real : 0;
  return {
    ejecucion,
    real,
    teorica,
    perdida,
    cicloIdeal,
    cicloReal,
    perdidaCiclo: cicloReal - cicloIdeal,
    // Los segundos que la máquina pasó produciendo de más por ir lenta.
    tiempoPerdido: Math.round(perdida * cicloIdeal),
    ritmoReal: ejecucion ? (real / ejecucion) * 3600 : 0,
    ritmoIdeal: ejecucion ? (teorica / ejecucion) * 3600 : 0,
    pct: teorica ? (real / teorica) * 100 : 0,
  };
}

/* Opción A · Balance de producción */
function OptionBalance({ P, t }) {
  const V = t.viz;
  return (
    <Panel>
      <FormulaStrip
        titulo="Rendimiento"
        num={{ label: "Producción real", value: fmtPz(P.real) }}
        den={{ label: "Producción teórica", value: fmtPz(P.teorica) }}
        result={P.pct}
        color={bandColor(t, P.pct)}
        t={t}
      />

      <div style={{ display: "flex", gap: 26, alignItems: "center", flexWrap: "wrap", marginTop: 20 }}>
        <div style={{ flex: "1 1 420px", minWidth: 340 }}>
          {/* El ciclo no es una magnitud de producción, así que va como
              cabecera de contexto y no como barra: mezclarlo en la misma
              escala que las piezas sería comparar peras con manzanas. */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, padding: "9px 12px", borderRadius: 10, background: t.hover, border: `1px solid ${t.border}` }}>
            <span style={{ fontSize: 12.5, color: t.textSoft, flex: 1 }}>Tiempo de ciclo</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: V.verde }}>
              {fmtSegDec(P.cicloIdeal)} <span style={{ fontSize: 10.5, color: t.textFaint }}>ideal</span>
            </span>
            <span style={{ color: t.textFaint }}>→</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: V.ambar }}>
              {fmtSegDec(P.cicloReal)} <span style={{ fontSize: 10.5, color: t.textFaint }}>real</span>
            </span>
          </div>

          <WaterfallRow i={0} label="Producción teórica" value={P.teorica} total={P.teorica} color={t.textFaint} format={fmtPz} t={t} />
          <WaterfallRow
            i={1} label="Producción real" value={P.real} loss={P.perdida} lossLabel="Perdido por velocidad"
            total={P.teorica} color={V.verde} lossColor={V.ambar} format={fmtPz} t={t} hero
          />
        </div>

        <div style={{ flex: "0 0 auto", margin: "0 auto" }}>
          <BandGauge value={P.pct} label="Rendimiento" meta={META_RENDIMIENTO} t={t} />
        </div>
      </div>
{/* 
      <p style={{ textAlign: "center", fontSize: 12, color: t.textFaint, margin: "14px 0 0" }}>
        En los <strong style={{ color: t.textSoft }}>{fmtHM(P.ejecucion)}</strong> que la máquina estuvo corriendo cabían{" "}
        <strong style={{ color: t.textSoft }}>{fmtPz(P.teorica)}</strong>. El trozo{" "}
        <strong style={{ color: V.ambar }}>ámbar</strong> no es material tirado: son piezas que nunca llegaron a hacerse.
      </p> */}
    </Panel>
  );
}

/*
 * Opción B · Ciclo por pieza.
 *
 * El rendimiento es un problema de velocidad, y la velocidad se entiende mejor
 * en la escala de una pieza que en la del turno. Se comparan los dos ciclos
 * lado a lado y se multiplica el retraso por las piezas del turno.
 */
function CicloBar({ label, value, max, color, t, i, sub }) {
  const w = max ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: t.textSoft, flex: 1 }}>{label}</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 700, color }}>{fmtSegDec(value)}</span>
      </div>
      <div style={{ position: "relative", height: 30, borderRadius: 8, background: t.hover, border: `1px solid ${t.border}`, overflow: "hidden" }}>
        <div
          style={{
            height: "100%", width: `${w}%`,
            background: `linear-gradient(90deg, ${color}, ${color}bb)`,
            transformOrigin: "left center",
            animation: `mdGrow 700ms cubic-bezier(0.22,1,0.36,1) ${i * 140}ms both`,
          }}
        />
      </div>
      {sub && <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function OptionCiclo({ P, t }) {
  const V = t.viz;
  const max = Math.max(P.cicloReal, P.cicloIdeal);

  return (
    <Panel>
      <div style={{ display: "flex", gap: 30, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 380px", minWidth: 320 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.textFaint, marginBottom: 12 }}>
            Lo que tarda una sola pieza
          </div>
          <CicloBar i={0} label="Ciclo ideal (velocidad nominal)" value={P.cicloIdeal} max={max} color={V.verde} t={t} sub={`${fmtNum(P.ritmoIdeal, 0)} pz/h`} />
          <CicloBar i={1} label="Ciclo real (medido en el turno)" value={P.cicloReal} max={max} color={V.ambar} t={t} sub={`${fmtNum(P.ritmoReal, 0)} pz/h`} />
        </div>

        <div style={{ flex: "1 1 260px", minWidth: 250 }}>
          <div style={{ padding: "16px 18px", borderRadius: 14, background: `${V.ambar}12`, border: `1px solid ${V.ambar}44` }}>
            <div style={{ fontSize: 12.5, color: t.textSoft }}>Cada pieza tarda</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 44, fontWeight: 700, color: V.ambar, lineHeight: 1.1 }}>
                +{fmtNum(P.perdidaCiclo)}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: t.text }}>s de más</span>
            </div>
            <div style={{ height: 1, background: `${V.ambar}44`, margin: "12px 0" }} />
            <div style={{ fontSize: 12.5, color: t.textSoft }}>
              × {fmtPz(P.real)} del turno ={" "}
              <strong style={{ fontFamily: "'IBM Plex Mono', monospace", color: t.text }}>{fmtHM(P.tiempoPerdido)}</strong>
            </div>
            {/* <div style={{ fontSize: 11.5, color: t.textFaint, marginTop: 2 }}>
              de producción perdida ({fmtSeg(P.tiempoPerdido)}) ≈ {fmtPz(P.perdida)} que no se hicieron
            </div> */}
          </div>
        </div>
      </div>

      {/* <p style={{ textAlign: "center", fontSize: 12, color: t.textFaint, margin: "16px 0 0" }}>
        Un porcentaje no dice qué hay que corregir; un ciclo sí. Bajar el ciclo real a{" "}
        <strong style={{ color: V.verde }}>{fmtSegDec(P.cicloIdeal)}</strong> es exactamente lo que significa llegar al 100 %.
      </p> */}
    </Panel>
  );
}

/* Opción C · Tablero de KPIs */
function OptionTablero({ P, t }) {
  const V = t.viz;
  const v = clampPct(P.pct);
  const col = bandColor(t, v);
  const delta = v - META_RENDIMIENTO;
  // Piezas que faltan para la meta y ciclo al que habría que bajar para
  // conseguirlas en el mismo tiempo de ejecución.
  const faltan = Math.max(0, Math.round((P.teorica * (META_RENDIMIENTO - v)) / 100));
  const cicloObjetivo = P.teorica ? P.ejecucion / ((P.teorica * META_RENDIMIENTO) / 100) : 0;

  const R = 62, SW = 13, CIRC = 2 * Math.PI * R;

  return (
    <Panel>
      <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flexShrink: 0, margin: "0 auto" }}>
          <svg width={170} height={170} viewBox="0 0 160 160">
            <circle cx="80" cy="80" r={R} fill="none" stroke={t.hover} strokeWidth={SW} />
            <g transform="rotate(-90 80 80)">
              <circle
                cx="80" cy="80" r={R} fill="none" stroke={col} strokeWidth={SW} strokeLinecap="round"
                strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - v / 100)}
                style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
              />
              <circle
                cx="80" cy="80" r={R} fill="none" stroke={t.text} strokeWidth={SW + 4} strokeOpacity={0.75}
                strokeDasharray={`2 ${CIRC - 2}`} strokeDashoffset={-CIRC * (META_RENDIMIENTO / 100)}
              />
            </g>
            <text x="80" y="78" textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 700, fill: col }}>{fmtNum(P.pct, 1)}</text>
            <text x="80" y="96" textAnchor="middle" style={{ fontSize: 11, letterSpacing: 2, fill: t.textFaint }}>RENDIM. %</text>
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: t.textSoft }}>Contra la meta del {META_RENDIMIENTO}%:</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 700, color: delta >= 0 ? V.verde : V.ambar }}>
              {delta >= 0 ? "+" : ""}{fmtNum(delta, 1)} pts
            </span>
          </div>

          <div style={{ padding: "12px 14px", borderRadius: 12, background: faltan ? `${V.ambar}12` : `${V.verde}12`, border: `1px solid ${faltan ? `${V.ambar}44` : `${V.verde}44`}` }}>
            {faltan ? (
              <>
                <div style={{ fontSize: 12, color: t.textSoft }}>Para alcanzar la meta faltan</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color: V.ambar, lineHeight: 1.15 }}>
                  {fmtPz(faltan)}
                </div>
                {/* <div style={{ fontSize: 11.5, color: t.textFaint }}>
                  en el mismo tiempo: bajar el ciclo de {fmtSegDec(P.cicloReal)} a {fmtSegDec(cicloObjetivo)}
                </div> */}
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: t.textSoft }}>Meta cumplida, con margen de</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color: V.verde, lineHeight: 1.15 }}>
                  {fmtPz(P.real - (P.teorica * META_RENDIMIENTO) / 100)}
                </div>
                <div style={{ fontSize: 11.5, color: t.textFaint }}>por encima del objetivo del turno</div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <KpiTile label="Tiempo de ciclo ideal" value={fmtSegDec(P.cicloIdeal)} sub={`${fmtNum(P.ritmoIdeal, 0)} pz/h`} color={V.verde} t={t} />
        <KpiTile label="Tiempo de ciclo real" value={fmtSegDec(P.cicloReal)} sub={`${fmtNum(P.ritmoReal, 0)} pz/h`} color={V.ambar} t={t} />
        <KpiTile label="Producción teórica" value={fmtEntero(P.teorica)} sub={`en ${fmtHM(P.ejecucion)} de ejecución`} color={t.text} t={t} />
        <KpiTile label="Producción real" value={fmtEntero(P.real)} sub={`${fmtNum(P.pct)}% de la teórica`} color={V.verde} t={t} />
        <KpiTile label="Piezas no producidas" value={fmtEntero(P.perdida)} sub={`${fmtHM(P.tiempoPerdido)} perdidas`} color={V.ambar} t={t} strong />
      </div>
    </Panel>
  );
}

export default function RendimientoView({ machine, t, C }) {
  const P = useMemo(() => produccion(machine), [machine]);

  // Las tres propuestas derivan de la producción real y del rendimiento.
  // Sin ellos no hay ciclo, ni ritmo, ni pérdida que mostrar.
  if (!hasValue(P.real)) return <SinLecturas que="producción y rendimiento" t={t} />;

  return (
    <>

      <OptionSection tag="OPCIÓN A" title="Balance de producción" accent={C.rendimiento} t={t}>
        <OptionBalance P={P} t={t} />
      </OptionSection>

      <OptionSection tag="OPCIÓN B" title="Ciclo por pieza"  accent={t.viz.azul} t={t}>
        <OptionCiclo P={P} t={t} />
      </OptionSection>

      <OptionSection tag="OPCIÓN C" title="Tablero de KPIs"  accent={t.viz.verde} t={t}>
        <OptionTablero P={P} t={t} />
      </OptionSection>

      <MdKeyframes />
    </>
  );
}
