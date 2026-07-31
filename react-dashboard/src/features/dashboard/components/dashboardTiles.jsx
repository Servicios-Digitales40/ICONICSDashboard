/**
 * Los tiles del dashboard de planta. Cada uno recibe datos ya agregados por
 * `../lib/plantModel.js` y el tema `t` por prop: son componentes tontos, no
 * calculan nada ni conocen el origen del dato.
 *
 * El nombre va en camelCase porque el archivo exporta varios componentes
 * hermanos sin uno principal.
 */
import {
  PieChart, Pie, Cell, LineChart, Line, ComposedChart, Bar, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Panel, BandGauge, KpiTile } from "@/components/ui/index.js";
import { ChartTooltip } from "@/components/charts/index.js";
import { ESTADOS, estadoInfo, hasValue } from "@/lib/domain/index.js";
import { fmtEntero, fmtNum, fmtPct } from "@/lib/format.js";
import { METAS, fmtHM, bandColor } from "@/lib/shiftModel.js";
import { useCountUp, useMounted, usePrefersReducedMotion } from "@/lib/motion.js";

/* Formateo tolerante a huecos. Los agregados de `plantModel` ya vienen
 * saneados, pero se delega igualmente en `lib/format` para que un cambio
 * futuro en el rollup no acabe como un «NaN %» en pantalla. */
const num = (n) => fmtEntero(n);
const pct = (n) => fmtPct(n, 1);

/**
 * Cifra que cuenta hasta su valor.
 *
 * Es un componente aparte porque el conteo es un hook: hace falta uno por
 * número y dentro de un `.map()` no cabe. Recibe el número y no la cadena ya
 * formateada, de modo que el formato se reaplica en cada fotograma y los
 * millares siguen puestos mientras la cifra sube.
 */
function Cifra({ valor, fmt, duracion = 1000, style }) {
  // Con `valor` null el conteo se anima hacia 0, porque los hooks no pueden
  // ser condicionales, pero lo que se pinta es fmt(null), es decir «—». Sin
  // esta guarda useCountUp interpolaría hacia NaN.
  const hay = hasValue(valor);
  const v = useCountUp(hay ? valor : 0, duracion);
  return <span style={style}>{hay ? fmt(v) : fmt(null)}</span>;
}

/* Banda de KPIs: el titular del turno. */

/**
 * Celda de la banda superior. Cifra grande, etiqueta pequeña.
 *
 * `delay` escalona la entrada de izquierda a derecha, en el orden de lectura.
 * La cifra cuenta hasta su valor: en el primer montaje sube desde cero, y al
 * refrescarse el dato se mueve desde el número que ya estaba en pantalla, de
 * modo que el cambio se ve como un movimiento y no como un reinicio.
 */
function KpiCell({ label, valor, fmt, sub, color, t, alert, delay = 0 }) {
  return (
    <div
      style={{
        flex: "1 1 150px", minWidth: 140, padding: "14px 16px", borderRadius: 14,
        background: alert ? `${color}12` : t.panel,
        border: `1px solid ${alert ? `${color}44` : t.border}`,
        boxShadow: t.shadow,
        animation: "fadeInUp 0.5s ease both",
        animationDelay: `${delay}s`,
      }}
    >
      <Cifra
        valor={valor} fmt={fmt} duracion={1100}
        style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 700, color, lineHeight: 1.1 }}
      />
      <div style={{ fontSize: 11.5, fontWeight: 600, color: t.textSoft, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: t.textFaint, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

export function KpiBand({ s, t }) {
  // El complemento de un hueco es otro hueco: `100 - null` vale 100 en
  // JavaScript, y el tile de rechazadas diría «100.0 % del total» con el
  // servidor caído.
  const resto = (v) => (hasValue(v) ? 100 - v : null);

  // «Detenidas» solo cuenta máquinas cuyo estado se conoce y no es operar.
  // Las que no han dicho nada van aparte, para no diagnosticar sin datos.
  const detenidas = s.totalMaquinas - s.operando - s.sinDato;

  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      <KpiCell label="Piezas producidas" valor={s.producidas} fmt={num} sub="en el turno" color={t.text} t={t} delay={0} />
      <KpiCell label="Piezas aceptadas" valor={s.aceptadas} fmt={num} sub={`${pct(s.fty)} del total`} color={t.viz.verde} t={t} delay={0.06} />
      <KpiCell
        label="Piezas rechazadas" valor={s.rechazadas} fmt={num} sub={`${pct(resto(s.fty))} del total`}
        color={t.viz.coral} t={t} alert={s.rechazadas > 0} delay={0.12}
      />
      <KpiCell
        label="First Time Yield" valor={s.fty} fmt={pct} sub="aceptadas ÷ producidas"
        color={bandColor(t, s.fty)} t={t} delay={0.18}
      />
      <KpiCell
        label="Máquinas operando" valor={s.operando} fmt={(v) => `${Math.round(v)}/${s.totalMaquinas}`}
        sub={s.sinDato > 0 ? `${s.sinDato} sin dato` : `${detenidas} detenidas`}
        color={s.sinDato === s.totalMaquinas ? t.textFaint : s.operando === s.totalMaquinas ? t.viz.verde : t.viz.ambar}
        t={t} delay={0.24}
      />
    </div>
  );
}

/*
 * Gauges: OEE y sus tres factores.
 *
 * El OEE de planta no es la media de los OEE, sino D × R × C de estos tres
 * gauges (ver plantModel). Por eso los cuatro se muestran juntos.
 */
export function FactorGauges({ s, t }) {
  const gauges = [
    { key: "oee", label: "OEE", value: s.oee, meta: METAS.oee },
    { key: "disponibilidad", label: "Disponibilidad", value: s.disponibilidad, meta: METAS.disponibilidad },
    { key: "rendimiento", label: "Rendimiento", value: s.rendimiento, meta: METAS.rendimiento },
    { key: "calidad", label: "Calidad", value: s.calidad, meta: METAS.calidad },
  ];

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
      {gauges.map((g, i) => (
        // `delay` explícito: sin él la cascada la decide el contador global de
        // Panel, que no se reinicia y saca los diales en orden aleatorio.
        <Panel key={g.key} delay={0.3 + i * 0.08} style={{ flex: "1 1 210px", minWidth: 200, display: "flex", justifyContent: "center" }}>
          <BandGauge value={g.value} label={g.label} meta={g.meta} t={t} size={200} />
        </Panel>
      ))}
    </div>
  );
}

/* Dona de estados: qué está haciendo la planta ahora mismo. */
export function EstadoDonut({ s, t }) {
  // La etiqueta y el color salen del dominio, para que la dona no pinte de un
  // color lo que la tarjeta de máquina pinta de otro.
  const data = s.porEstado.map((e) => ({
    name: estadoInfo(e.estado).label,
    value: e.valor,
    color: t[estadoInfo(e.estado).token] ?? t.textFaint,
  }));

  return (
    <Panel title="Estado de las máquinas" code={`${s.totalMaquinas} equipos`}>
      <div style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none">
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend
              verticalAlign="bottom" height={54} iconType="circle" iconSize={8}
              formatter={(v, e) => (
                <span style={{ fontSize: 11.5, color: t.textSoft }}>
                  {v} <strong style={{ color: t.text }}>({e.payload.value})</strong>
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Centro de la dona: el dato que se busca primero. */}
        <div
          style={{
            position: "absolute", top: 92, left: 0, right: 0, textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <Cifra
            valor={s.operando} fmt={(v) => String(Math.round(v))} duracion={900}
            style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 700, color: t.text, lineHeight: 1 }}
          />
          <div style={{ fontSize: 10, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", color: t.textFaint }}>
            operando
          </div>
        </div>
      </div>
    </Panel>
  );
}

/*
 * Pastel de rechazos: de dónde sale el scrap.
 *
 * Cuenta rechazos y no volumen a propósito: todas las máquinas producen
 * cantidades parecidas, así que un pastel de producción serían diez porciones
 * casi idénticas.
 */
export function RechazosPie({ reparto, s, t }) {
  const paleta = [t.viz.coral, t.viz.ambar, t.viz.violeta, t.viz.azul, t.viz.verde];
  const data = reparto.filter((m) => m.rechazadas > 0);

  return (
    <Panel title="Rechazos por máquina" code={`${num(s.rechazadas)} pz · de mayor a menor`}>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="rechazadas" nameKey="nombre" outerRadius={88} paddingAngle={1.5} stroke="none">
            {data.map((d, i) => <Cell key={d.id} fill={paleta[i % paleta.length]} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          <Legend
            verticalAlign="bottom" height={54} iconType="circle" iconSize={8}
            formatter={(v, e) => (
              <span style={{ fontSize: 11.5, color: t.textSoft }}>
                {v} <strong style={{ color: t.text }}>({num(e.payload.value)})</strong>
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </Panel>
  );
}

/* Producción por hora: aceptadas frente a rechazadas. */
export function ProduccionTrend({ data, t }) {
  return (
    <Panel title="Producción por hora" code="aceptadas vs. rechazadas · derivado del acumulado del turno">
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} width={44} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: t.hover }} />
          <Bar dataKey="aceptadas" name="Aceptadas" stackId="p" fill={t.viz.verde} radius={[0, 0, 0, 0]} />
          <Bar dataKey="rechazadas" name="Rechazadas" stackId="p" fill={t.viz.coral} radius={[3, 3, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </Panel>
  );
}

/*
 * Tendencia de OEE: los cuatro factores a lo largo del turno. El último punto
 * ancla al valor actual, así que el extremo derecho coincide con los gauges.
 */
export function OeeTrend({ data, t }) {
  const series = [
    { key: "oee", label: "OEE", color: t.viz.violeta, width: 2.6 },
    { key: "disponibilidad", label: "Disponibilidad", color: t.viz.azul, width: 1.8 },
    { key: "rendimiento", label: "Rendimiento", color: t.viz.ambar, width: 1.8 },
    { key: "calidad", label: "Calidad", color: t.viz.verde, width: 1.8 },
  ];

  return (
    <Panel title="OEE y factores durante el turno" code="promedio de planta · por hora">
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} width={34} />
          <Tooltip content={<ChartTooltip />} />
          <Legend verticalAlign="bottom" height={30} iconType="plainline" iconSize={14}
            formatter={(v) => <span style={{ fontSize: 11.5, color: t.textSoft }}>{v}</span>} />
          {series.map((s) => (
            <Line
              key={s.key} type="monotone" dataKey={s.key} name={s.label}
              stroke={s.color} strokeWidth={s.width} dot={false} activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
}

/*
 * Tiempos muertos: previsto frente a no previsto.
 *
 * El ámbar ya estaba en el plan (comidas, cambios de formato); el coral es el
 * que no debía ocurrir, y es el accionable. Mismo criterio de color que la
 * subvista de Disponibilidad.
 */
export function DowntimeTiles({ s, t }) {
  const listo = useMounted();
  // El paro planificado sale de constantes de turno y siempre hay número,
  // pero el no planificado se deriva de la disponibilidad medida: sin lecturas
  // es null, y `número + null` en JS daría un total que parece real.
  const total =
    hasValue(s.paroPlanificado) && hasValue(s.paroNoPlanificado)
      ? s.paroPlanificado + s.paroNoPlanificado
      : null;
  const pctNo = hasValue(total) && total > 0 ? (s.paroNoPlanificado / total) * 100 : null;

  return (
    <Panel title="Tiempo muerto acumulado" code={`${s.totalMaquinas} equipos · turno de 8 h`}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KpiTile
          label="Paro NO previsto" value={fmtHM(s.paroNoPlanificado)}
          sub="lo accionable" color={t.viz.coral} t={t} strong
        />
        <KpiTile
          label="Paro previsto" value={fmtHM(s.paroPlanificado)}
          sub="comidas y cambios" color={t.viz.ambar} t={t}
        />
      </div>

      {/* Barra de reparto: qué proporción del paro no debía ocurrir.
          El ámbar arranca ocupándolo todo y el coral le va ganando terreno,
          así el paro NO previsto —lo accionable— se lee como algo que crece
          y no como una repartición que ya venía dada. */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: t.hover }}>
          {/* Sin medición la barra queda neutra (el track vacío), no toda
              ámbar: una barra 100 % «previsto» afirmaría que no hubo paro
              inesperado, que es justo lo que no sabemos. */}
          {hasValue(pctNo) && (
            <>
              <div
                style={{
                  width: listo ? `${100 - pctNo}%` : "100%", background: t.viz.ambar,
                  transition: "width 900ms cubic-bezier(0.22,1,0.36,1) 0.3s",
                }}
              />
              <div style={{ flex: 1, background: t.viz.coral }} />
            </>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: t.textFaint, marginTop: 8, textAlign: "center" }}>
          {hasValue(pctNo) ? (
            <>
              <strong style={{ color: t.viz.coral }}>{fmtNum(pctNo, 0)} %</strong> del tiempo muerto no estaba previsto
            </>
          ) : (
            "sin lecturas de tiempo muerto"
          )}
        </div>
      </div>
    </Panel>
  );
}

/* Tira por área: el puente al siguiente nivel de zoom. */
export function AreaStrip({ areas, t, onNavigate }) {
  const reduce = usePrefersReducedMotion();

  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {areas.map((a) => {
        const col = bandColor(t, a.oee);
        // `porEstado` viene del rollup: si el área contiene una máquina en
        // alarma, la tarjeta late. Es la señal más fina que puede dar esta
        // vista, que no pinta las máquinas una a una.
        const emergencia = a.porEstado.some((e) => e.estado === ESTADOS.alarma.key && e.valor > 0);

        return (
          <Panel
            key={a.areaId}
            className="metric-card"
            style={{
              flex: "1 1 260px", minWidth: 240, cursor: "pointer",
              borderLeft: `3px solid ${emergencia ? t.coral : col}`,
              // Con movimiento reducido el latido no corre, así que la alarma
              // pasa a ser un fondo fijo para seguir siendo visible.
              ...(emergencia && reduce ? { background: t.coralSoft } : null),
              ...(emergencia && !reduce
                ? {
                    animation: "alertaLatido 2.4s ease-in-out 0.4s infinite",
                    "--alerta-base": t.panel,
                    "--alerta-tinte": t.coralSoft,
                    "--alerta-halo": `${t.coral}59`,
                  }
                : null),
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => onNavigate(`area-${a.areaId}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onNavigate(a.areaId);
                }
              }}
              style={{ outline: "none" }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{a.label}</span>
                <span style={{ fontSize: 11.5, color: emergencia ? t.coral : t.textFaint, fontWeight: emergencia ? 700 : 400 }}>
                  {emergencia ? "paro de emergencia →" : `${a.totalMaquinas} equipos →`}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "8px 0 2px" }}>
                <Cifra
                  valor={a.oee} fmt={(v) => fmtNum(v, 1)} duracion={1100}
                  style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 32, fontWeight: 700, color: col, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}
                />
                <span style={{ fontSize: 14, fontWeight: 600, color: col, opacity: 0.7 }}>% OEE</span>
              </div>
              <div style={{ fontSize: 11.5, color: t.textSoft }}>
                {num(a.producidas)} pz · {a.operando}/{a.totalMaquinas} operando
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
