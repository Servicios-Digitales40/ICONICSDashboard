/**
 * Subvista "Calidad", en modo comparación de diseño. Tres maneras de contar
 * lo mismo, cada una respondiendo una pregunta distinta:
 *
 *   A · Balance de piezas → ¿de dónde sale el porcentaje?
 *   B · Mosaico de 100    → ¿qué significa ese porcentaje?
 *   C · Tablero de KPIs   → ¿cuánto falta para la meta?
 *
 * A diferencia de Disponibilidad, aquí no hay que reponer nada: las piezas
 * buenas y malas son dato directo y `calidad` es exactamente
 * aprobadas/(aprobadas+rechazadas), así que todo lo que se muestra es medición.
 *
 * Color: verde = pieza buena · coral = pieza rechazada.
 */
import { useMemo } from "react";
import { Panel, BandGauge, KpiTile } from "@/components/ui/index.js";
import { hasValue } from "@/lib/domain/index.js";
import { SIN_DATO, fmtEntero, fmtNum } from "@/lib/format.js";
import { META_CALIDAD, clampPct, bandColor } from "@/lib/shiftModel.js";
import {
  OptionSection, FormulaStrip, WaterfallRow, MdKeyframes, SinLecturas,
} from "../../components/factorUi.jsx";

const fmtPz = (n) => (hasValue(n) ? `${Math.round(n).toLocaleString("es-MX")} pz` : SIN_DATO);

/**
 * Magnitudes de calidad del turno.
 *
 * Todos los campos pueden ser `null` y hay que comprobarlos: en JavaScript
 * `null + null` vale 0, así que una máquina sin lecturas mostraría un balance
 * de cero piezas y una calidad del 0 %, ambos creíbles y ambos inventados.
 */
function piezas(machine) {
  const buenas = machine.aprobadas;
  const malas = machine.rechazadas;
  const hayConteo = hasValue(buenas) && hasValue(malas);
  const total = hayConteo ? buenas + malas : null;

  return {
    buenas,
    malas,
    total,
    // Calidad vista por las piezas. Coincide con machine.calidad cuando el
    // dato es coherente (ver el aviso de la subvista OEE).
    pct: total ? (buenas / total) * 100 : null,
    ppm: total ? Math.round((malas / total) * 1000000) : null,
    // Rechazos que la meta todavía toleraría.
    maxRechazos: hasValue(total) ? Math.round((total * (100 - META_CALIDAD)) / 100) : null,
  };
}

/* Opción A · Balance de piezas */
function OptionBalance({ P, t }) {
  const V = t.viz;
  return (
    <Panel>
      <FormulaStrip
        titulo="Calidad"
        num={{ label: "Piezas buenas", value: fmtPz(P.buenas) }}
        den={{ label: "Piezas buenas + malas", value: fmtPz(P.total) }}
        result={P.pct}
        color={bandColor(t, P.pct)}
        t={t}
      />

      <div style={{ display: "flex", gap: 26, alignItems: "center", flexWrap: "wrap", marginTop: 20 }}>
        <div style={{ flex: "1 1 420px", minWidth: 340 }}>
          <WaterfallRow i={0} label="Piezas totales" value={P.total} total={P.total} color={t.textFaint} format={fmtPz} t={t} />
          <WaterfallRow
            i={1} label="Piezas buenas" value={P.buenas} loss={P.malas} lossLabel="Piezas malas"
            total={P.total} color={V.verde} lossColor={V.coral} format={fmtPz} t={t} hero
          />
        </div>

        <div style={{ flex: "0 0 auto", margin: "0 auto" }}>
          <BandGauge value={P.pct} label="Calidad" meta={META_CALIDAD} t={t} />
        </div>
      </div>

      {/* <p style={{ textAlign: "center", fontSize: 12, color: t.textFaint, margin: "14px 0 0" }}>
        Las dos barras se escalan contra las <strong style={{ color: t.textSoft }}>{fmtPz(P.total)}</strong> producidas:
        el trozo <strong style={{ color: V.coral }}>coral</strong> es material que se pagó, se procesó y se tiró.
      </p> */}
    </Panel>
  );
}

/*
 * Opción B · Mosaico de 100 piezas.
 *
 * Un porcentaje es abstracto; cien cuadritos no. Cada celda es el 1 % de la
 * producción y las coral son las que se tiran.
 */
function Leyenda({ color, label, value, pct, t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: t.textSoft, flex: 1 }}>{label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 700, color: t.text }}>{value}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: t.textFaint, width: 52, textAlign: "right" }}>
        {fmtNum(pct, 1)}%
      </span>
    </div>
  );
}

function OptionMosaico({ P, t }) {
  const V = t.viz;
  const malas100 = Math.round(clampPct(100 - P.pct)); // celdas defectuosas de cada 100
  const piezasPorCelda = P.total / 100;

  return (
    <Panel>
      <div style={{ display: "flex", gap: 30, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        {/* la rejilla */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 5, width: 300, flexShrink: 0 }}>
          {Array.from({ length: 100 }).map((_, i) => {
            // Las defectuosas se agrupan al final: en bloque se comparan
            // mejor que salpicadas al azar.
            const mala = i >= 100 - malas100;
            return (
              <div
                key={i}
                title={mala ? "Pieza rechazada" : "Pieza buena"}
                style={{
                  aspectRatio: "1",
                  borderRadius: 4,
                  background: mala ? V.coral : V.verde,
                  boxShadow: mala ? `0 0 8px ${V.coral}66` : "none",
                  animation: `mdPop 380ms cubic-bezier(0.22,1,0.36,1) ${i * 7}ms both`,
                }}
              />
            );
          })}
        </div>

        {/* lectura */}
        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          <div style={{ fontSize: 13, color: t.textSoft, marginBottom: 2 }}>De cada 100 piezas producidas</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 52, fontWeight: 700, color: V.coral, lineHeight: 1 }}>
              {malas100}
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>se rechazan</span>
          </div>
          <div style={{ fontSize: 12.5, color: t.textFaint, marginBottom: 16 }}>
            ≈ {fmtPz(malas100 * piezasPorCelda)} de las {fmtPz(P.total)} del turno
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Leyenda color={V.verde} label="Piezas buenas" value={fmtPz(P.buenas)} pct={P.pct} t={t} />
            <Leyenda color={V.coral} label="Piezas malas" value={fmtPz(P.malas)} pct={100 - P.pct} t={t} />
            <div style={{ height: 1, background: t.border, margin: "2px 0" }} />
            <Leyenda color={t.textFaint} label="Piezas totales" value={fmtPz(P.total)} pct={100} t={t} />
          </div>
        </div>
      </div>

      {/* <p style={{ textAlign: "center", fontSize: 12, color: t.textFaint, margin: "18px 0 0" }}>
        Cada cuadro es el 1 % de la producción (≈ {fmtPz(piezasPorCelda)}). La meta del {META_CALIDAD}% solo permitiría{" "}
        <strong style={{ color: t.textSoft }}>{100 - META_CALIDAD} de estos cuadros</strong> en coral.
      </p> */}
    </Panel>
  );
}

/* Opción C · Tablero de KPIs */
function OptionTablero({ P, t }) {
  const V = t.viz;
  const v = clampPct(P.pct);
  const col = bandColor(t, v);
  const delta = v - META_CALIDAD;
  // Rechazos que sobran para cumplir la meta, que es lo accionable.
  const exceso = Math.max(0, P.malas - P.maxRechazos);

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
              {/* marca de meta sobre el anillo */}
              <circle
                cx="80" cy="80" r={R} fill="none" stroke={t.text} strokeWidth={SW + 4} strokeOpacity={0.75}
                strokeDasharray={`2 ${CIRC - 2}`} strokeDashoffset={-CIRC * (META_CALIDAD / 100)}
              />
            </g>
            <text x="80" y="78" textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 700, fill: col }}>{fmtNum(P.pct, 1)}</text>
            <text x="80" y="96" textAnchor="middle" style={{ fontSize: 11, letterSpacing: 2, fill: t.textFaint }}>CALIDAD %</text>
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: t.textSoft }}>Contra la meta del {META_CALIDAD}%:</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 700, color: delta >= 0 ? V.verde : V.coral }}>
              {delta >= 0 ? "+" : ""}{fmtNum(delta, 1)} pts
            </span>
          </div>

          <div style={{ padding: "12px 14px", borderRadius: 12, background: exceso ? `${V.coral}12` : `${V.verde}12`, border: `1px solid ${exceso ? `${V.coral}44` : `${V.verde}44`}` }}>
            {exceso ? (
              <>
                <div style={{ fontSize: 12, color: t.textSoft }}>Para alcanzar la meta sobran</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color: V.coral, lineHeight: 1.15 }}>
                  {fmtPz(exceso)}
                </div>
                {/* <div style={{ fontSize: 11.5, color: t.textFaint }}>
                  rechazadas: hay {fmtPz(P.malas)} y el objetivo tolera {fmtPz(P.maxRechazos)}
                </div> */}
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: t.textSoft }}>Meta cumplida, con margen de</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color: V.verde, lineHeight: 1.15 }}>
                  {fmtPz(P.maxRechazos - P.malas)}
                </div>
                <div style={{ fontSize: 11.5, color: t.textFaint }}>rechazadas antes de bajar del objetivo</div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <KpiTile label="Piezas totales" value={fmtEntero(P.total)} sub="producidas en el turno" color={t.text} t={t} />
        <KpiTile label="Piezas buenas" value={fmtEntero(P.buenas)} sub={`${fmtNum(P.pct)}% del total`} color={V.verde} t={t} />
        <KpiTile label="Piezas malas" value={fmtEntero(P.malas)} sub="material desperdiciado" color={V.coral} t={t} strong />
        <KpiTile label="Tasa de rechazo" value={`${fmtNum(100 - P.pct)}%`} sub={`meta ≤ ${(100 - META_CALIDAD).toFixed(0)}%`} color={V.ambar} t={t} />
        <KpiTile label="PPM defectuosas" value={fmtEntero(P.ppm)} sub="partes por millón" color={V.ambar} t={t} />
      </div>
    </Panel>
  );
}

export default function CalidadView({ machine, t, C }) {
  const P = useMemo(() => piezas(machine), [machine]);

  // Toda la vista se deriva del conteo de piezas: sin él las tres propuestas
  // mostrarían ceros indistinguibles de una máquina que no produjo nada.
  if (!hasValue(P.total)) return <SinLecturas que="producción" t={t} />;

  return (
    <>


      <OptionSection tag="OPCIÓN A" title="Balance de piezas"  accent={C.calidad} t={t}>
        <OptionBalance P={P} t={t} />
      </OptionSection>

      <OptionSection tag="OPCIÓN B" title="Mosaico de 100 piezas" accent={t.viz.coral} t={t}>
        <OptionMosaico P={P} t={t} />
      </OptionSection>

      <OptionSection tag="OPCIÓN C" title="Tablero de KPIs"  accent={t.viz.verde} t={t}>
        <OptionTablero P={P} t={t} />
      </OptionSection>

      <MdKeyframes />
    </>
  );
}
