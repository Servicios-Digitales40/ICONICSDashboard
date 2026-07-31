/**
 * Subvista "OEE", en modo comparación de diseño: muestra cuatro maneras de
 * representar el OEE actual para poder elegir una. Al decidirse, se conserva
 * solo esa y se retira el andamiaje (OptionSection y el aviso superior).
 *
 *   A · Cadena multiplicativa   (D × R × C → OEE + escala clase mundial)
 *   B · Sankey de pérdidas      (a dónde se va la capacidad, en piezas)
 *   C · Benchmark protagonista  (¿en qué banda de clase mundial cae?)
 *   D · Barras + tendencia      (lectura rápida, densa, sin gauges)
 *
 * Todo se alimenta de los valores en vivo de la máquina.
 */
import { AreaChart, Area, Tooltip, ResponsiveContainer } from "recharts";
import { Panel } from "@/components/ui/index.js";
import { ChartTooltip, SankeyChart } from "@/components/charts/index.js";
import { calcOEE, hasValue } from "@/lib/domain/index.js";
import { SIN_DATO, fmtEntero, fmtNum, pctSeguro } from "@/lib/format.js";

/* Bandas de "clase mundial" del OEE (escala cualitativa del ejemplo). */
export const OEE_BANDS = [
  { from: 0, to: 40, label: "Muy bajo" },
  { from: 40, to: 50, label: "Bajo" },
  { from: 50, to: 60, label: "Regular" },
  { from: 60, to: 75, label: "Bueno" },
  { from: 75, to: 85, label: "Altamente eficiente" },
  { from: 85, to: 100, label: "Clase mundial" },
];
const oeeBand = (v) => OEE_BANDS.find((b) => v < b.to) ?? OEE_BANDS[OEE_BANDS.length - 1];

/**
 * Color de banda. Con `null` devuelve el tono apagado del texto, para no
 * afirmar que el OEE sea malo ni bueno cuando no hay medición.
 */
const bandColor = (t, v) => (!hasValue(v) ? t.textFaint : v < 50 ? t.coral : v < 75 ? t.amber : t.success);

/*
 * La geometría (arcos, barras) usa `pctSeguro`, que devuelve 0 ante un hueco
 * porque necesita un número. El texto se resuelve siempre con `fmtNum`, que
 * distingue el hueco y escribe «—».
 */

/* Encabezado de sección para separar visualmente cada propuesta. */
function OptionSection({ tag, title, desc, accent, t, children }) {
  return (
    <section style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: `2px solid ${accent}` }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: accent, background: `${accent}18`, border: `1px solid ${accent}44`, borderRadius: 6, padding: "2px 8px" }}>
          {tag}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{title}</span>
        <span style={{ fontSize: 12, color: t.textFaint, marginLeft: "auto" }}>{desc}</span>
      </div>
      {children}
    </section>
  );
}

/* Gauge semicircular compacto (para la cadena multiplicativa). */
function SemiGauge({ value, label, color, t, size = 130, strong = false }) {
  const sinDato = !hasValue(value);
  const v = pctSeguro(value);
  // Sin medición el arco va apagado y el número es un guion: un arco a cero
  // en verde afirmaría un 0 % que nadie ha medido.
  const trazo = sinDato ? t.textFaint : color;
  const cx = size / 2, cy = size * 0.56, r = size * 0.4, sw = strong ? size * 0.11 : size * 0.09;
  const polar = (pct) => {
    const a = Math.PI - (pct / 100) * Math.PI;
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
  };
  const arc = (from, to) => {
    const A = polar(from), B = polar(to);
    return `M ${A.x} ${A.y} A ${r} ${r} 0 0 1 ${B.x} ${B.y}`;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`} style={{ overflow: "visible" }}>
        <path d={arc(0, 100)} fill="none" stroke={t.track || t.border} strokeWidth={sw} strokeLinecap="round" opacity={0.5} />
        {!sinDato && (
          <path d={arc(0, v)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" style={{ transition: "all 700ms cubic-bezier(0.22,1,0.36,1)" }} />
        )}
        <text x={cx} y={cy - 2} textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: strong ? size * 0.2 : size * 0.17, fontWeight: 700, fill: trazo }}>
          {fmtNum(value, strong ? 2 : 1)}
        </text>
        {!sinDato && (
          <text x={cx} y={cy + (strong ? size * 0.13 : size * 0.11)} textAnchor="middle" style={{ fontSize: size * 0.075, fill: t.textFaint }}>%</text>
        )}
      </svg>
      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, color: strong ? trazo : t.textSoft, textTransform: "uppercase", marginTop: 2 }}>{label}</span>
    </div>
  );
}

/* Termómetro vertical de clase mundial (apoyo de la opción A). */
function WorldClassScale({ value, t }) {
  const sinDato = !hasValue(value);
  const v = pctSeguro(value);
  const band = oeeBand(v);
  const H = 190;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
      <div style={{ position: "relative", width: 16, height: H, borderRadius: 8, background: `linear-gradient(to top, ${t.coral} 0%, ${t.amber} 50%, ${t.success} 100%)`, border: `1px solid ${t.border}` }}>
        {/* Marcador del valor. Sin medición no se sitúa en ningún punto de
            la escala: colocarlo abajo diría «muy bajo», que es una lectura. */}
        {!sinDato && (
          <div style={{ position: "absolute", left: -4, right: -4, bottom: `calc(${v}% - 1.5px)`, height: 3, background: t.text, borderRadius: 2, boxShadow: `0 0 0 2px ${t.panel}` }} />
        )}
      </div>
      <div style={{ position: "relative", width: 96, height: H, fontSize: 10.5, color: t.textSoft }}>
        {[
          { at: 92, txt: "Clase mundial" },
          { at: 80, txt: "Alt. eficiente" },
          { at: 67, txt: "Bueno" },
          { at: 55, txt: "Regular" },
          { at: 45, txt: "Bajo" },
          { at: 20, txt: "Muy bajo" },
        ].map((m) => (
          <span key={m.txt} style={{ position: "absolute", bottom: `${m.at}%`, transform: "translateY(50%)", whiteSpace: "nowrap" }}>{m.txt}</span>
        ))}
        {!sinDato && (
          <span style={{ position: "absolute", bottom: `calc(${v}% - 8px)`, left: 0, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: bandColor(t, value), fontSize: 11.5 }}>◂ {band.label}</span>
        )}
      </div>
    </div>
  );
}

/* Opción A: cadena multiplicativa */
function OptionChain({ machine, oee, t, C }) {
  const Times = () => <span style={{ fontSize: 26, fontWeight: 300, color: t.textFaint, alignSelf: "center", padding: "0 4px" }}>×</span>;
  return (
    <Panel>
      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
        <SemiGauge value={machine.disponibilidad} label="Disponib." color={C.disponibilidad} t={t} />
        <Times />
        <SemiGauge value={machine.rendimiento} label="Rendim." color={C.rendimiento} t={t} />
        <Times />
        <SemiGauge value={machine.calidad} label="Calidad" color={C.calidad} t={t} />
      </div>
      <div style={{ textAlign: "center", fontSize: 22, color: t.textFaint, margin: "-4px 0 2px" }}>↓</div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
        <SemiGauge value={oee} label="OEE" color={C.oee} t={t} size={190} strong />
        <WorldClassScale value={oee} t={t} />
      </div>
    </Panel>
  );
}

/* Opción B: Sankey de pérdidas (flujo de piezas)
 *
 * Dónde se pierde el OEE, como flujo y en piezas reales en vez de puntos
 * porcentuales. Todo se deriva de campos que la máquina ya tiene:
 *
 *   producción real  = aprobadas + rechazadas          ← dato directo
 *   capacidad ideal  = real / (D/100 × R/100)          ← sin paros ni pérdidas
 *                                                        de velocidad
 *   por paros        = ideal × (1 − D/100)             ← pérdida de disponibilidad
 *   tiempo operativo = ideal × D/100
 *   por velocidad    = operativo × (1 − R/100)         ← pérdida de rendimiento
 *   producción real  = operativo × R/100               ← cierra con el dato real
 *   aprobadas / rechazadas                             ← pérdida de calidad
 *
 * La gráfica es válida porque `calidad` es exactamente
 * aprobadas/(aprobadas+rechazadas): la cadena cierra sola y el ancho de
 * «Aprobadas» frente a «Capacidad ideal» es el OEE, sin constantes mágicas.
 */
function OptionFlow({ machine, oee, t }) {
  // El diagrama necesita cinco mediciones a la vez y no admite huecos: la
  // cadena se calcula por división encadenada, así que un solo `null`
  // produciría NaN en toda la cascada.
  const completo =
    hasValue(machine.aprobadas) && hasValue(machine.rechazadas) &&
    hasValue(machine.disponibilidad) && hasValue(machine.rendimiento) &&
    hasValue(machine.calidad);

  const real = completo ? machine.aprobadas + machine.rechazadas : 0;
  const d = completo ? machine.disponibilidad / 100 : 0;
  const r = completo ? machine.rendimiento / 100 : 0;

  // Sin lecturas completas, sin producción o con D/R en cero, la capacidad
  // ideal no está definida y no hay flujo que dibujar.
  if (!completo || !real || d <= 0 || r <= 0) {
    return (
      <Panel>
        <p style={{ textAlign: "center", fontSize: 13, color: t.textFaint, margin: "24px 0" }}>
          {completo
            ? "Sin producción registrada en el turno: no hay flujo que representar."
            : "Faltan lecturas de la máquina: no se puede reconstruir el flujo de piezas."}
        </p>
      </Panel>
    );
  }

  const ideal = Math.round(real / (d * r));
  const operativo = Math.round(ideal * d);
  const porParos = ideal - operativo;
  const porVelocidad = operativo - real;

  // OEE visto por el flujo: aprobadas sobre capacidad ideal. Con datos
  // coherentes coincide con calcOEE(); si no, se avisa.
  const oeePiezas = (machine.aprobadas / ideal) * 100;
  const calidadPiezas = (machine.aprobadas / real) * 100;
  const coherente = Math.abs(calidadPiezas - machine.calidad) < 0.5;

  // Familias de color, en lugar de siete tonos sueltos:
  //   azul  = el material que sigue vivo (el tronco del flujo)
  //   ámbar = tiempo perdido (paros y velocidad)
  //   coral = material desperdiciado (rechazos)
  //   verde = lo único que cuenta al final
  const V = t.viz;
  const nodes = [
    { id: "ideal", label: "Capacidad ideal", color: V.azul, note: "Sin paros ni pérdidas de velocidad" },
    { id: "paros", label: "Perdido por paros", color: V.ambar, note: `Disponibilidad ${fmtNum(machine.disponibilidad, 1)}%` },
    { id: "operativo", label: "En tiempo operativo", color: V.azul },
    { id: "veloc", label: "Perdido por velocidad", color: V.ambar, note: `Rendimiento ${fmtNum(machine.rendimiento, 1)}%` },
    { id: "real", label: "Producción real", color: V.azul },
    { id: "rechazadas", label: "Rechazadas", color: V.coral, note: `Calidad ${fmtNum(machine.calidad, 1)}%` },
    { id: "aprobadas", label: "Aprobadas", color: V.verde, note: "Piezas buenas = OEE del turno", hero: true },
  ];

  // d3-sankey no admite enlaces de valor 0: una máquina sin rechazos, o sin
  // pérdidas en un factor, no dibuja esa cinta.
  const links = [
    { source: "ideal", target: "operativo", value: operativo },
    ...(porParos > 0 ? [{ source: "ideal", target: "paros", value: porParos }] : []),
    { source: "operativo", target: "real", value: real },
    ...(porVelocidad > 0 ? [{ source: "operativo", target: "veloc", value: porVelocidad }] : []),
    { source: "real", target: "aprobadas", value: machine.aprobadas },
    ...(machine.rechazadas > 0 ? [{ source: "real", target: "rechazadas", value: machine.rechazadas }] : []),
  ];

  return (
    <Panel>
      <SankeyChart
        nodes={nodes}
        links={links}
        height={360}
        nodeWidth={16}
        unit=" pz"
        format={(v) => Math.round(v).toLocaleString("es-MX")}
        margin={{ top: 14, right: 132, bottom: 16, left: 132 }}
        // `left`, y no el `justify` por defecto, es lo que produce la cascada:
        // cada columna es el estado tras aplicar un factor, y las pérdidas se
        // quedan donde ocurrieron en vez de irse todas al final.
        align="left"
        // Cada columna se rotula con el factor que la produjo, para que se vea
        // que el diagrama y la fórmula D × R × C son lo mismo.
        stageLabels={["Capacidad ideal", "− Disponibilidad", "− Rendimiento", "− Calidad"]}
        // La silueta punteada mantiene la altura de la capacidad original en
        // todas las columnas: el hueco que queda es la pérdida acumulada.
        capacityGhost
      />
      {/* <p style={{ textAlign: "center", fontSize: 12, color: t.textFaint, margin: "10px 0 0" }}>
        De <strong style={{ color: V.azul }}>{ideal.toLocaleString("es-MX")} pz</strong> posibles solo salen{" "}
        <strong style={{ color: V.verde }}>{machine.aprobadas.toLocaleString("es-MX")} pz</strong> buenas:{" "}
        <strong style={{ color: t.text }}>{oeePiezas.toFixed(1)}% de la capacidad</strong>. El grosor de cada fuga
        (<span style={{ color: V.ambar, fontWeight: 700 }}>tiempo perdido</span> ·{" "}
        <span style={{ color: V.coral, fontWeight: 700 }}>material tirado</span>) es la pérdida real en piezas — la más
        gruesa es dónde atacar primero.
      </p> */}
      {/* Coherencia del dato: si `calidad` no concuerda con las piezas, el OEE
          del gauge y este flujo cuentan cosas distintas. Preferimos avisarlo a
          afirmar una equivalencia que el dato no sostiene. */}
      {!coherente && (
        <p style={{ textAlign: "center", fontSize: 11.5, color: t.amber, margin: "6px 0 0" }}>
          Aviso: el campo <code>calidad</code> del equipo dice {fmtNum(machine.calidad, 1)}%, pero las piezas dan{" "}
          {fmtNum(calidadPiezas, 1)}% ({fmtEntero(machine.aprobadas)} de {fmtEntero(real)}). El OEE del gauge
          ({fmtNum(oee, 1)}%) se calcula con el primero, así que no coincide con este flujo.
        </p>
      )}
    </Panel>
  );
}

/* Opción C: benchmark protagonista */
function OptionBenchmark({ machine, oee, t, C }) {
  const sinDato = !hasValue(oee);
  const v = pctSeguro(oee);
  const band = oeeBand(v);
  const col = bandColor(t, oee);
  const chip = (label, val, color) => (
    <div style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 10, background: t.hover, border: `1px solid ${t.border}` }}>
      <div style={{ fontSize: 10, color: t.textFaint, letterSpacing: 0.5, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 700, color: hasValue(val) ? color : t.textFaint, marginTop: 2 }}>
        {fmtNum(val, 1)}{hasValue(val) && "%"}
      </div>
    </div>
  );
  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 44, fontWeight: 700, color: col, lineHeight: 1 }}>
          {fmtNum(oee, 2)}{!sinDato && <span style={{ fontSize: 22, opacity: 0.7 }}>%</span>}
        </span>
        {/* Sin OEE no se etiqueta banda: decir «Muy bajo» sin medición sería
            una afirmación sobre el equipo, no una ausencia de dato. */}
        {!sinDato && (
          <span style={{ fontSize: 14, fontWeight: 700, color: col, background: `${col}18`, border: `1px solid ${col}55`, borderRadius: 20, padding: "4px 14px" }}>{band.label}</span>
        )}
      </div>

      {/* barra de bandas con marcador */}
      <div style={{ position: "relative", padding: "18px 0 4px" }}>
        {!sinDato && (
          <div style={{ position: "absolute", top: 0, left: `${v}%`, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", color: t.text }}>
            <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{fmtNum(oee, 1)}</span>
            <span style={{ fontSize: 12, lineHeight: 0.6 }}>▼</span>
          </div>
        )}
        <div style={{ height: 18, borderRadius: 10, background: `linear-gradient(90deg, ${t.coral} 0%, ${t.amber} 50%, ${t.success} 100%)`, border: `1px solid ${t.border}` }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 9.5, color: t.textFaint }}>
          {OEE_BANDS.map((b) => (
            <span key={b.label} style={{ flex: b.to - b.from, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {chip("Disponib.", machine.disponibilidad, C.disponibilidad)}
        {chip("Rendim.", machine.rendimiento, C.rendimiento)}
        {chip("Calidad", machine.calidad, C.calidad)}
      </div>
    </Panel>
  );
}

/* Opción D: barras + tendencia denso */
function FactorRow({ label, value, meta, color, t }) {
  const sinDato = !hasValue(value);
  const v = pctSeguro(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ width: 82, fontSize: 12, color: t.textSoft, fontWeight: 600 }}>{label}</span>
      <div style={{ position: "relative", flex: 1, height: 12, borderRadius: 6, background: t.track || t.hover }}>
        {/* Sin medición la barra queda vacía. Una barra a 0 con color es
            indistinguible de un factor real en cero. */}
        {!sinDato && (
          <div style={{ position: "absolute", inset: 0, width: `${v}%`, background: color, borderRadius: 6, transition: "width 700ms ease" }} />
        )}
        {/* marcador de meta: línea vertical sobre el track */}
        {meta != null && (
          <div title={`Meta ${meta}%`} style={{ position: "absolute", top: -3, bottom: -3, left: `${pctSeguro(meta)}%`, width: 2, background: t.text, opacity: 0.55, borderRadius: 2 }} />
        )}
      </div>
      <span style={{ width: 86, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 700, color: sinDato ? t.textFaint : t.text }}>
        {fmtNum(value, 1)}{!sinDato && "%"}
        {meta != null && <span style={{ color: t.textFaint, fontSize: 11 }}> /{meta}</span>}
      </span>
    </div>
  );
}
function OptionDense({ machine, oee, history, t, C }) {
  const col = bandColor(t, oee);
  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 11, color: t.textFaint, letterSpacing: 1, fontWeight: 700 }}>OEE</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 40, fontWeight: 700, color: col, lineHeight: 1 }}>
            {fmtNum(oee, 2)}{hasValue(oee) && <span style={{ fontSize: 20, opacity: 0.7 }}>%</span>}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 160, height: 56 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="dense-oee" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.oee} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.oee} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="oee" stroke={C.oee} strokeWidth={2} fill="url(#dense-oee)" dot={false} animationDuration={500} />
              <Tooltip content={<ChartTooltip />} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
        <FactorRow label="Disponib." value={machine.disponibilidad} meta={90} color={C.disponibilidad} t={t} />
        <FactorRow label="Rendim." value={machine.rendimiento} meta={85} color={C.rendimiento} t={t} />
        <FactorRow label="Calidad" value={machine.calidad} meta={99} color={C.calidad} t={t} />
        <div style={{ height: 1, background: t.border, margin: "2px 0" }} />
        <FactorRow label="OEE" value={oee} meta={85} color={col} t={t} />
      </div>
    </Panel>
  );
}

export default function OeeView({ machine, history, t, C }) {
  // Se prefiere el OEE que calcula ICONICS; si no llegó, se compone de los
  // tres factores. `calcOEE` devuelve `null` cuando falta alguno.
  const oee = hasValue(machine.oee) ? machine.oee : calcOEE(machine);

  return (
    <>


      <OptionSection tag="OPCIÓN A" title="Cadena multiplicativa"  accent={C.disponibilidad} t={t}>
        <OptionChain machine={machine} oee={oee} t={t} C={C} />
      </OptionSection>

      <OptionSection tag="OPCIÓN B" title="Sankey de pérdidas"  accent={t.coral} t={t}>
        <OptionFlow machine={machine} oee={oee} t={t} />
      </OptionSection>

      <OptionSection tag="OPCIÓN C" title="Benchmark protagonista"  accent={t.amber} t={t}>
        <OptionBenchmark machine={machine} oee={oee} t={t} C={C} />
      </OptionSection>

      <OptionSection tag="OPCIÓN D" title="Barras + tendencia (denso)"  accent={C.oee} t={t}>
        <OptionDense machine={machine} oee={oee} history={history} t={t} C={C} />
      </OptionSection>
    </>
  );
}
