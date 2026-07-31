/**
 * prototypes/dashboard-v2/tiles.jsx
 * ------------------------------------------------------------------
 * Las piezas de la propuesta v2 del dashboard de planta.
 *
 * Igual que `dashboardTiles.jsx`, son componentes "tontos": reciben datos ya
 * agregados por `./model.js` y el tema por prop. Nombre en camelCase por la
 * misma razón — el archivo exporta varios hermanos sin uno principal.
 *
 * Cada bloque lleva anotada la mejora que demuestra (M1…M10) para poder
 * comparar contra la vista actual punto por punto.
 */
import {
  ComposedChart, Bar, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { ChartTooltip } from "@/components/charts/index.js";
import { METAS, fmtHM, bandColor } from "@/lib/shiftModel.js";
import { useCountUp, useMounted, usePrefersReducedMotion } from "@/lib/motion.js";
import { estadoColor, ESTADO_CORTO, TONO } from "./palette.js";
import { hasValue } from "@/lib/domain/index.js";
import { SIN_DATO, fmtEntero, fmtNum, fmtPct, pctSeguro } from "@/lib/format.js";

const MONO = "'IBM Plex Mono', monospace";
const SANS = "'Plus Jakarta Sans', sans-serif";

/* Tolerantes a huecos: con datos reales cualquier agregado puede ser null,
   y un hueco se pinta como el guion, jamas como un cero plausible. */
const num = (n) => fmtEntero(n);
const pct = (n) => fmtPct(n, 1);

/* ==================================================================
 * M1 · ESCALA TIPOGRÁFICA
 * ==================================================================
 * Una sola escala para toda la vista, y un solo héroe. Hoy conviven ~12
 * cifras entre 30 y 32 px y ninguna manda; aquí hay exactamente un número
 * a 54 px y el resto baja en escalones marcados.
 *
 * El héroe va en la SANS de la casa, no en mono: el mono da a cada dígito el
 * ancho de un «0» y a 54 px eso hace que «57.0» se lea suelto. El mono se
 * queda de 26 px hacia abajo, donde la alineación tabular sí trabaja a favor.
 */
export const ESCALA = {
  // 44 px y no más: el número vive DENTRO del arco, y a 54 px su caja se salía
  // del radio interior por los lados y el trazo le pasaba por encima. Sigue
  // siendo casi el doble que el siguiente escalón (26 px), que es lo que hace
  // la jerarquía — no el tamaño absoluto.
  heroe: { fontFamily: SANS, fontSize: 44, fontWeight: 800, lineHeight: 1, letterSpacing: -1.2 },
  kpi: { fontFamily: MONO, fontSize: 26, fontWeight: 700, lineHeight: 1.1 },
  tile: { fontFamily: MONO, fontSize: 20, fontWeight: 700, lineHeight: 1.1 },
  dato: { fontFamily: MONO, fontSize: 13, fontWeight: 600 },
  etiqueta: { fontSize: 10, fontWeight: 700, letterSpacing: 0.9, textTransform: "uppercase" },
};

/* ==================================================================
 * M8 + M10 · SUPERFICIE Y ENTRADA
 * ==================================================================
 * `Card` es el `Panel` del kit con dos cambios que son, ellos mismos, dos de
 * las mejoras propuestas:
 *
 *  · `tono` da TRES niveles de superficie en vez de uno solo. Hoy las ocho
 *    tarjetas son idénticas, así que el ojo no tiene ruta de entrada:
 *    "titular" (lavado de acento, sin borde), "detalle" (el panel de siempre)
 *    y "navegacion" (plano, se eleva al hover: se lee como "esto se toca").
 *
 *  · `delay` es EXPLÍCITO. `Panel` escalona su entrada con un contador de
 *    MÓDULO que no se reinicia entre montajes, así que la cascada arranca en
 *    un índice arbitrario según por dónde hayas navegado — a veces entra en
 *    orden y a veces al revés. Aquí el retraso lo fija la posición en la
 *    rejilla, arriba-izquierda → abajo-derecha, y la entrada se lee como una
 *    intención en lugar de un accidente.
 */
export function Card({ title, code, right, children, t, tono = "detalle", delay = 0, style, onClick }) {
  const fondos = {
    titular: {
      background: `linear-gradient(135deg, ${t.accentSoft} 0%, ${t.panel} 62%)`,
      border: `1px solid ${t.border}`,
      boxShadow: t.shadow,
    },
    detalle: { background: t.panel, border: `1px solid ${t.border}`, boxShadow: t.shadow },
    navegacion: { background: t.panel, border: `1px solid ${t.border}`, boxShadow: "none" },
  };

  return (
    <div
      className="panel-card"
      onClick={onClick}
      style={{
        ...fondos[tono],
        borderRadius: tono === "titular" ? 20 : 16,
        padding: "16px 18px 18px",
        // Alturas iguales dentro de una banda: el grid estira el envoltorio y
        // la tarjeta lo llena. Es lo que hace que los cantos alineen (M7).
        height: "100%",
        display: "flex",
        flexDirection: "column",
        animation: "fadeInUp 0.5s ease both",
        animationDelay: `${delay}s`,
        "--shadow-hover": t.shadowHover,
        ...style,
      }}
    >
      {(title || right) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            {title && <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: t.text, fontFamily: SANS }}>{title}</h3>}
            {/* M10 · subtítulo corto. Los de hoy son cadenas mono de hasta 60
                caracteres bajo cada título: una banda de ruido gris constante. */}
            {code && <span style={{ fontFamily: MONO, fontSize: 10.5, color: t.textFaint }}>{code}</span>}
          </div>
          {right}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

/* ==================================================================
 * M6 · SPARKLINE
 * ==================================================================
 * SVG a mano y no recharts: son 12 puntos sin ejes ni tooltip, y montar un
 * ResponsiveContainer por KPI costaría más de lo que vale. El punto final
 * lleva el anillo de 2 px en color de superficie que pide la especificación
 * de marcas, para que se lea aunque caiga sobre la propia línea.
 */
function Spark({ serie, color, t, w = 78, h = 24, delay = 0 }) {
  if (!serie || serie.length < 2) return null;
  const min = Math.min(...serie);
  const max = Math.max(...serie);
  const span = max - min || 1;
  const x = (i) => 2 + (i / (serie.length - 1)) * (w - 4);
  const y = (v) => h - 4 - ((v - min) / span) * (h - 8);
  const d = serie.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible", flexShrink: 0 }} aria-hidden="true">
      {/* `pathLength=100` normaliza el trazo para que el keyframe compartido
          `trazoDibujo` sirva sin medir la ruta. La línea se dibuja de
          izquierda a derecha, en el sentido en que se lee el tiempo. */}
      <path
        className="trazo-dibujo" pathLength={100} d={d}
        fill="none" stroke={t.textFaint} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.65}
        style={{ animationDelay: `${delay}s` }}
      />
      {/* El punto final entra cuando la línea ya llegó hasta él. */}
      <circle
        cx={x(serie.length - 1)} cy={y(serie[serie.length - 1])} r={3}
        fill={color} stroke={t.panel} strokeWidth={2}
        style={{ animation: `fadeIn 300ms ease ${delay + 0.85}s both` }}
      />
    </svg>
  );
}

/** Variación con signo. El color dice dirección × si subir es bueno. */
function Delta({ valor, t, subirEsBueno = true, unidad = "" }) {
  if (valor === null || Math.abs(valor) < 0.05) {
    return <span style={{ fontSize: 11, color: t.textFaint }}>sin cambio</span>;
  }
  const sube = valor > 0;
  const bueno = sube === subirEsBueno;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: bueno ? t.viz.verde : t.viz.coral, fontFamily: MONO }}>
      {sube ? "▲" : "▼"} {Math.abs(valor).toFixed(1)}{unidad}
    </span>
  );
}

/* ==================================================================
 * M3 · FRANJA DE ATENCIÓN
 * ==================================================================
 * Que haya una máquina en paro de emergencia es EL dato de un tablero de
 * planta, y hoy vive escondido como una rebanada de la dona de estados.
 *
 * Condicional a propósito: si no hay nada accionable, la franja no existe.
 * Una alerta que se enciende siempre deja de leerse en una semana.
 */
export function FranjaAtencion({ atencion, t, dark, onNavigate, delay = 0 }) {
  if (!atencion.length) return null;

  const critico = atencion.some((a) => a.severidad === "critico");
  const tono = TONO[critico ? "critico" : "aviso"](t);

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        padding: "10px 16px", borderRadius: 12,
        background: tono.fondo, borderLeft: `3px solid ${tono.borde}`,
        animation: "fadeInUp 0.5s ease both", animationDelay: `${delay}s`,
      }}
    >
      {/* Único bucle de la página junto al de las tarjetas en alarma, y al
          mismo compás de 2.4 s: un solo ritmo, no dos. */}
      <AlertTriangle className={critico ? "alerta-icono" : undefined} size={16} color={tono.texto} style={{ flexShrink: 0 }} />
      <span style={{ ...ESCALA.etiqueta, color: tono.texto, flexShrink: 0 }}>Requiere atención</span>

      {atencion.map((a) => (
        <span key={a.estado} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: t.textSoft }}>
            <strong style={{ color: t.text }}>{a.maquinas.length}</strong> en {ESTADO_CORTO[a.estado].toLowerCase()}
          </span>
          {a.maquinas.map((m) => (
            <button
              key={m.id}
              className="chip"
              onClick={() => onNavigate("machine-detail", { machineId: m.id, from: "dashboard-v2" })}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: t.panel, border: `1px solid ${t.border}`, borderRadius: 999,
                padding: "3px 10px", fontSize: 11.5, fontWeight: 600, color: t.text,
                fontFamily: "inherit", cursor: "pointer",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: estadoColor(dark, a.estado), flexShrink: 0 }} />
              {m.equipo}
            </button>
          ))}
        </span>
      ))}
    </div>
  );
}

/* ==================================================================
 * M6 · BANDA DE KPIs COMO STAT TILES
 * ==================================================================
 * Contrato completo de stat tile: etiqueta · valor · delta · sparkline.
 * Hoy son etiqueta + cifra + subtítulo, sin ninguna noción de si el número
 * viene subiendo o cayendo.
 *
 * Los 12 puntos NO son un dato nuevo: `plantTrend` y `productionTrend` ya los
 * generan para las gráficas de más abajo. Solo se estaban desaprovechando.
 *
 * De 5 celdas a 4: «producidas» y «aceptadas/rechazadas» contaban la misma
 * historia tres veces. Ahora el reparto va como barra apilada dentro de la
 * celda de producidas.
 */
/**
 * Cifra que cuenta hasta su valor. Se extrae como componente porque el conteo
 * es un hook y hace falta uno por número — dentro de un `.map()` no cabe.
 */
function Cifra({ valor, fmt, duracion = 1000, style }) {
  // Con `valor` null no hay destino que contar: los hooks no pueden ser
  // condicionales, asi que se anima hacia 0 pero se PINTA el guion.
  const hay = hasValue(valor);
  const v = useCountUp(hay ? valor : 0, duracion);
  return <span style={style}>{hay ? fmt(v) : SIN_DATO}</span>;
}

/**
 * `valorNum` + `fmt` en vez de una cadena ya formateada: para animar el
 * conteo hay que tener el NÚMERO. El formateo se aplica en cada fotograma,
 * así los millares y el símbolo se mantienen mientras la cifra sube.
 */
function StatTile({ label, valorNum, fmt, valorColor, sub, serie, serieColor, deltaVal, subirEsBueno, unidad, t, delay, children }) {
  return (
    <Card t={t} delay={delay} style={{ padding: "14px 16px 15px", gap: 0 }}>
      <div style={{ ...ESCALA.etiqueta, color: t.textFaint }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
        <div>
          <Cifra
            valor={valorNum} fmt={fmt} duracion={1100}
            style={{ ...ESCALA.kpi, color: valorColor ?? t.text, display: "block" }}
          />
          <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
            {deltaVal !== undefined && <Delta valor={deltaVal} t={t} subirEsBueno={subirEsBueno} unidad={unidad} />}
            {sub && <span style={{ fontSize: 11, color: t.textFaint }}>{sub}</span>}
          </div>
        </div>
        {serie && <Spark serie={serie} color={serieColor ?? t.accent} t={t} delay={(delay ?? 0) + 0.15} />}
      </div>
      {children && <div style={{ marginTop: 10 }}>{children}</div>}
    </Card>
  );
}

/** Barra apilada de aceptadas vs rechazadas, dentro del tile de producidas. */
function BarraReparto({ aceptadas, rechazadas, t }) {
  const listo = useMounted();
  // Sin conteos no hay reparto que ensenar: `null + null` es 0 en JS y la
  // barra afirmaria "0 aceptadas, 0 % rechazo" sin haber medido nada.
  if (!hasValue(aceptadas) && !hasValue(rechazadas)) {
    return <div style={{ fontSize: 10.5, color: t.textFaint }}>sin conteo de piezas</div>;
  }
  const total = (aceptadas ?? 0) + (rechazadas ?? 0) || 1;
  return (
    <div>
      {/* gap: 2 en color de superficie — el separador es aire, no un borde.
          El verde entra completo y el coral le va ganando su porción: el
          rechazo se lee como algo que APARECE, no como algo que ya estaba. */}
      <div style={{ display: "flex", gap: 2, height: 6 }}>
        <div style={{ flexGrow: aceptadas, flexBasis: 0, background: t.viz.verde, borderRadius: 3 }} />
        <div
          style={{
            flexGrow: listo ? rechazadas : 0, flexBasis: 0,
            background: t.viz.coral, borderRadius: 3,
            transition: "flex-grow 900ms cubic-bezier(0.22,1,0.36,1) 0.35s",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10.5, color: t.textFaint }}>
        <span>{num(aceptadas)} aceptadas</span>
        <span>{fmtNum(((rechazadas ?? 0) / total) * 100, 1)} % rechazo</span>
      </div>
    </div>
  );
}

/** Una casilla por máquina, coloreada por estado. Lee de un vistazo. */
function BarraEstados({ areas, t, dark }) {
  const todas = areas.flatMap((a) => a.maquinas);
  return (
    <div style={{ display: "flex", gap: 3, height: 8 }}>
      {todas.map((m) => (
        <div
          key={m.id}
          title={`${m.equipo} · ${ESTADO_CORTO[m.estado] ?? m.estado}`}
          style={{ flex: 1, borderRadius: 2, background: estadoColor(dark, m.estado) }}
        />
      ))}
    </div>
  );
}

export function BandaKpis({ s, series, areas, t, dark, base = 0 }) {
  const dFty = series.fty.length >= 2 ? series.fty.at(-1) - series.fty.at(-2) : null;
  const dRech = series.rechazadas.length >= 2 ? series.rechazadas.at(-1) - series.rechazadas.at(-2) : null;

  return (
    <>
      <div className="dv2-kpi">
        <StatTile
          t={t} delay={base} label="Piezas producidas" valorNum={s.producidas} fmt={num}
          sub="en el turno" serie={series.producidas} serieColor={t.accent}
        >
          <BarraReparto aceptadas={s.aceptadas} rechazadas={s.rechazadas} t={t} />
        </StatTile>
      </div>

      <div className="dv2-kpi">
        <StatTile
          t={t} delay={base + 0.05} label="First Time Yield" valorNum={s.fty} fmt={pct}
          valorColor={bandColor(t, s.fty)} sub="aceptadas ÷ producidas"
          serie={series.fty} serieColor={bandColor(t, s.fty)}
          deltaVal={dFty} subirEsBueno unidad=" pp"
        />
      </div>

      <div className="dv2-kpi">
        <StatTile
          t={t} delay={base + 0.1} label="Piezas rechazadas" valorNum={s.rechazadas} fmt={num}
          sub={hasValue(s.fty) ? `${fmtNum(100 - s.fty, 1)} % del total` : "sin yield que repartir"} serie={series.rechazadas} serieColor={t.viz.coral}
          deltaVal={dRech} subirEsBueno={false} unidad=" pz"
        />
      </div>

      <div className="dv2-kpi">
        <StatTile
          t={t} delay={base + 0.15} label="Máquinas operando"
          valorNum={s.operando} fmt={(v) => `${Math.round(v)}/${s.totalMaquinas}`}
          sub={s.sinDato > 0 ? `${s.sinDato} sin dato` : `${s.totalMaquinas - s.operando} detenidas`}
        >
          <BarraEstados areas={areas} t={t} dark={dark} />
        </StatTile>
      </div>
    </>
  );
}

/* ==================================================================
 * M2 · UN GAUGE HÉROE + TRES MEDIDORES LINEALES
 * ==================================================================
 * Hoy son cuatro `BandGauge` de 200 px con ticks numerados 0–100, aguja y
 * marca de meta cada uno: ~250 px de alto para cuatro números, y la gráfica
 * de tendencia justo debajo vuelve a mostrar esas mismas cuatro series.
 *
 * Aquí el OEE se lleva el arco y la cifra de 54 px; Disponibilidad,
 * Rendimiento y Calidad bajan a medidores lineales con su marca de meta y su
 * propio sparkline de 12 puntos. Con la «×» entre ellos y el «=» hacia el
 * héroe, el OEE deja de ser un número que hay que creer y pasa a ser una
 * fórmula que se ve: D × R × C.
 *
 * El arco es un MEDIDOR, no un dial: pista en un paso más claro del tema y
 * relleno en el color de banda. Sin ticks numerados, sin aguja — a 200 px
 * esos once números salían a 8 px, ilegibles y ruidosos.
 */
function Medidor({ label, valor, meta, serie, t, delay = 0 }) {
  const listo = useMounted();
  const sinDato = !hasValue(valor);
  const v = useCountUp(sinDato ? 0 : valor, 1000);
  const col = bandColor(t, valor);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {/* Caja baja y sin `letterSpacing`: en versalitas «Disponibilidad» pide
          ~92 px y desbordaba sobre su propia barra. Aquí cabe en 82 y además
          baja un escalón de énfasis respecto al rótulo OEE = D × R × C. */}
      <span style={{ fontSize: 11, fontWeight: 600, color: t.textSoft, width: 82, flexShrink: 0 }}>{label}</span>

      <div style={{ flex: 1, position: "relative", height: 9, minWidth: 52 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: t.hover }} />
        <div
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            // De 0 a su valor: sin `useMounted` el elemento nace ya en su
            // anchura final y la transición no llega a dispararse nunca.
            width: listo && !sinDato ? `${pctSeguro(valor)}%` : 0,
            borderRadius: 999, background: col,
            transition: `width 900ms cubic-bezier(0.22,1,0.36,1) ${delay}s`,
          }}
        />
        {/* Marca de meta: tick sólido de 2 px, no una línea discontinua. */}
        <div
          title={`meta ${meta} %`}
          style={{ position: "absolute", left: `${meta}%`, top: -3, bottom: -3, width: 2, background: t.text, opacity: 0.5, borderRadius: 1 }}
        />
      </div>

      <Spark serie={serie} color={col} t={t} w={40} h={16} delay={delay + 0.2} />
      <span style={{ ...ESCALA.dato, fontSize: 14, color: t.text, width: 46, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        {sinDato ? SIN_DATO : v.toFixed(1)}
      </span>
    </div>
  );
}

/** Arco medidor de 180°, con animación de trazado a la entrada. */
function ArcoOee({ valor, meta, t }) {
  const montado = useMounted();
  // Sin medicion el arco no barre y la cifra es un guion: un arco a cero
  // en coral diria "OEE 0 %", que es una lectura, no su ausencia.
  const sinDato = !hasValue(valor);
  // El arco y la cifra tardan lo mismo (900/1000 ms) y arrancan a la vez, así
  // que el número «llega» justo cuando el trazo termina de barrer.
  const v = useCountUp(sinDato ? 0 : valor, 1000);

  const W = 176, cx = 88, cy = 88, r = 68, sw = 12;
  const LARGO = Math.PI * r;
  const col = bandColor(t, valor);
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const a = Math.PI - (meta / 100) * Math.PI;
  const tick = (rad) => ({ x: cx + rad * Math.cos(a), y: cy - rad * Math.sin(a) });
  const ti = tick(r - sw / 2 - 3), to = tick(r + sw / 2 + 3);

  return (
    <div style={{ position: "relative", width: W, flexShrink: 0 }}>
      <svg width={W} height={104} viewBox={`0 0 ${W} 104`} style={{ display: "block" }} role="img" aria-label={sinDato ? "OEE sin medicion" : `OEE ${fmtNum(valor, 1)} por ciento`}>
        {/* Pista en `border` y no en `hover`: esta tarjeta lleva el lavado de
            acento del nivel "titular", y sobre ese degradado `hover` no
            contrasta — el medidor se quedaba sin su mitad vacía. */}
        <path d={d} fill="none" stroke={t.border} strokeWidth={sw} strokeLinecap="round" />
        <path
          d={d} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={LARGO}
          strokeDashoffset={montado && !sinDato ? LARGO * (1 - pctSeguro(valor) / 100) : LARGO}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
        <line x1={ti.x} y1={ti.y} x2={to.x} y2={to.y} stroke={t.text} strokeWidth={2} strokeLinecap="round" opacity={0.55} />
      </svg>

      {/* La cifra se centra en la mitad BAJA del interior del arco (top 44 →
          44..88), donde el radio interior deja ~136 px de ancho libre. La
          etiqueta cae ya por debajo de `cy`, fuera del trazo. */}
      <div style={{ position: "absolute", top: 44, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
        <div style={{ ...ESCALA.heroe, color: col }}>
          {sinDato ? SIN_DATO : v.toFixed(1)}
          {!sinDato && <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0, marginLeft: 2 }}>%</span>}
        </div>
        <div style={{ ...ESCALA.etiqueta, letterSpacing: 1.3, color: t.textFaint, marginTop: 5 }}>OEE de planta</div>
      </div>
    </div>
  );
}

export function HeroeOee({ s, series, tendencia, t, delay = 0 }) {
  const factores = [
    { key: "disponibilidad", label: "Disponibilidad", valor: s.disponibilidad, meta: METAS.disponibilidad },
    { key: "rendimiento", label: "Rendimiento", valor: s.rendimiento, meta: METAS.rendimiento },
    { key: "calidad", label: "Calidad", valor: s.calidad, meta: METAS.calidad },
  ];

  return (
    <Card t={t} tono="titular" delay={delay} code={`meta ${METAS.oee} % · marca de meta en cada barra`} title="Efectividad general">
      {/* `justifyContent: center` reparte el aire sobrante arriba y abajo: esta
          tarjeta comparte banda con la rejilla de máquinas, que es más alta.
          Si la columna de medidores no cabe al lado del arco, envuelve — y por
          eso la relación D × R × C se enuncia en el rótulo de la columna y no
          con un «=» suelto entre las dos, que al envolver quedaba huérfano. */}
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", flex: 1, minHeight: 0 }}>
        <ArcoOee valor={s.oee} meta={METAS.oee} t={t} />

        <div style={{ flex: "1 1 236px", minWidth: 216, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ ...ESCALA.etiqueta, color: t.textFaint, marginBottom: 3 }}>
            OEE <span style={{ color: t.textSoft }}>=</span> D <span style={{ color: t.textSoft }}>×</span> R{" "}
            <span style={{ color: t.textSoft }}>×</span> C
          </div>
          {factores.map((f, i) => (
            <div key={f.key}>
              {i > 0 && (
                <div style={{ paddingLeft: 88, fontSize: 11, color: t.textFaint, lineHeight: 1, margin: "1px 0 3px" }}>×</div>
              )}
              {/* Escalonados: D, luego R, luego C — el orden en que se
                  multiplican para dar el número del arco. */}
              <Medidor label={f.label} valor={f.valor} meta={f.meta} serie={series[f.key]} t={t} delay={0.15 * i} />
            </div>
          ))}
        </div>
      </div>

      {/* M10 · la tendencia del OEE vive AQUÍ, pegada al número que trendea,
          y no en una tarjeta propia dos bandas más abajo. De paso ocupa el
          aire que sobra al igualar altura con la rejilla de máquinas. */}
      <TendenciaOee data={tendencia} t={t} />
    </div>
    </Card>
  );
}

/* ==================================================================
 * M10 · TENDENCIA DE OEE — de cuatro líneas a una
 * ==================================================================
 * La gráfica actual superpone OEE, D, R y C. Medido con el validador, sus
 * dos líneas más importantes —OEE (violeta #A283EE) y Disponibilidad (azul
 * #7B95F5)— están a ΔE 1.1 bajo deuteranopía y a 6.5 con visión NORMAL:
 * prácticamente el mismo color para cualquiera.
 *
 * En vez de re-escalonar cuatro tonos, se corrige la FORMA. Cuando una serie
 * es el asunto y las demás son contexto, eso es énfasis, no categórico: aquí
 * queda el OEE solo, con su lavado de área al 10 %, y los tres factores ya
 * llevan su propio sparkline dentro de los medidores de arriba. Una sola
 * serie no necesita leyenda —el rótulo ya dice qué se pinta— y el problema
 * de paleta desaparece en vez de parchearse.
 */
function TendenciaOee({ data, t }) {
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
      <div style={{ ...ESCALA.etiqueta, color: t.textFaint, marginBottom: 2 }}>OEE durante el turno · por hora</div>
      <ResponsiveContainer width="100%" height={92}>
        <ComposedChart data={data} margin={{ top: 8, right: 6, left: -28, bottom: 0 }}>
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: t.textFaint }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis domain={["dataMin - 3", "dataMax + 3"]} tick={false} axisLine={false} tickLine={false} width={34} />
          <Tooltip content={<ChartTooltip />} />
          {/* Sin animación de trazado: la tarjeta ya entra con su fundido, y
              animar además el dato es movimiento por el movimiento. Mismo
              criterio que las gráficas del comparativo. */}
          <Area type="monotone" dataKey="oee" name="OEE" stroke="none" fill={t.accent} fillOpacity={0.1} isAnimationActive={false} />
          <Line type="monotone" dataKey="oee" name="OEE" stroke={t.accent} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: t.panel }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ==================================================================
 * M4 · REJILLA DE MÁQUINAS — el mapa de planta que falta
 * ==================================================================
 * La vista se llama "resumen de planta con las máquinas" y hoy las máquinas
 * no aparecen NUNCA individualmente: solo agregados y una tira de dos áreas
 * enterrada abajo a la derecha.
 *
 * La rejilla agrupada por área hace las dos cosas a la vez —es el mapa de
 * planta Y el desglose por área—, así que sustituye a `AreaStrip` y ahorra
 * una banda entera. La cabecera de cada área es el enlace al siguiente nivel
 * de zoom; cada celda, el enlace al detalle de máquina.
 *
 * El estado NUNCA se codifica solo con color: punto + borde + etiqueta de
 * texto. El color es refuerzo, no el canal de identidad.
 */
function CeldaMaquina({ m, t, dark, onNavigate, delay = 0 }) {
  const reduce = usePrefersReducedMotion();
  const listo = useMounted();
  const sinOee = !hasValue(m.oee);
  const oee = useCountUp(sinOee ? 0 : m.oee, 1000);

  const colEstado = estadoColor(dark, m.estado);
  const colOee = bandColor(t, m.oee);
  const emergencia = m.estado === "alarma";
  const alerta = TONO.critico(t);

  // Entrada escalonada por posición + el latido de alarma encima. Van en la
  // misma declaración `animation` (separadas por coma) porque son dos capas
  // del mismo elemento: la de entrada corre una vez y la de alarma arranca
  // cuando aquella termina, para que la tarjeta no aparezca ya latiendo.
  const entrada = `fadeInUp 0.45s ease ${delay}s both`;
  const animacion = emergencia && !reduce
    ? `${entrada}, alertaLatido 2.4s ease-in-out ${delay + 0.5}s infinite`
    : entrada;

  return (
    <div
      role="button"
      tabIndex={0}
      className="metric-card"
      title={`${m.equipo} · ${ESTADO_CORTO[m.estado] ?? m.estado} · OEE ${fmtNum(m.oee, 1)} %`}
      onClick={() => onNavigate("machine-detail", { machineId: m.id, from: "dashboard-v2" })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNavigate("machine-detail", { machineId: m.id, from: "dashboard-v2" });
        }
      }}
      style={{
        padding: "9px 11px 10px", borderRadius: 10, cursor: "pointer", outline: "none",
        border: `1px solid ${emergencia ? alerta.borde : t.border}`,
        borderLeft: `3px solid ${colEstado}`,
        animation: animacion,
        "--shadow-hover": t.shadowHover,
        // Con movimiento reducido el latido no corre, así que la alarma tiene
        // que leerse ESTÁTICA: fondo de alerta fijo. Sin esto, quien pide
        // menos movimiento vería la máquina en emergencia igual que el resto.
        background: emergencia && reduce ? alerta.fondo : t.panel,
        "--alerta-base": t.panel,
        "--alerta-tinte": alerta.fondo,
        // Hex-alfa aquí sí: un halo ES translúcido por definición. Lo que se
        // descartó en `palette.js` fue usar alfa para SUPERFICIES que tienen
        // que seguir siendo legibles en los dos modos; esto se pinta encima.
        "--alerta-halo": `${t.coral}59`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ position: "relative", display: "flex", flexShrink: 0 }}>
          {emergencia && (
            <span
              className="pulse-ring"
              style={{ position: "absolute", inset: 0, borderRadius: "50%", background: colEstado }}
            />
          )}
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: colEstado, position: "relative" }} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {m.equipo}
        </span>
      </div>

      <div style={{ ...ESCALA.tile, color: sinOee ? t.textFaint : t.text, margin: "6px 0 5px" }}>
        {sinOee ? SIN_DATO : oee.toFixed(1)}
        {!sinOee && <span style={{ fontSize: 11, fontWeight: 600, color: t.textFaint, marginLeft: 2 }}>%</span>}
      </div>

      <div style={{ height: 3, borderRadius: 999, background: t.hover, overflow: "hidden" }}>
        <div
          style={{
            width: listo && !sinOee ? `${pctSeguro(m.oee)}%` : 0, height: "100%", background: colOee, borderRadius: 999,
            transition: `width 900ms cubic-bezier(0.22,1,0.36,1) ${delay}s`,
          }}
        />
      </div>

      <div style={{ fontSize: 9.5, color: t.textFaint, marginTop: 5 }}>{ESTADO_CORTO[m.estado]}</div>
    </div>
  );
}

export function RejillaMaquinas({ areas, t, dark, onNavigate, delay = 0 }) {
  return (
    <Card
      t={t} tono="navegacion" delay={delay}
      title="Máquinas de la planta"
      code={`${areas.reduce((n, a) => n + a.totalMaquinas, 0)} equipos · entra a cualquiera`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {areas.map((a) => {
          const col = bandColor(t, a.oee);
          return (
            <div key={a.areaId}>
              {/* La cabecera de área ES la antigua AreaStrip, ya en su sitio. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onNavigate(a.ruta)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(a.ruta); }
                }}
                className="dv2-area-head"
                style={{
                  display: "flex", alignItems: "center", gap: 8, cursor: "pointer", outline: "none",
                  padding: "2px 0 8px", borderBottom: `1px solid ${t.border}`, marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>{a.label}</span>
                <span style={{ fontSize: 11, color: t.textFaint }}>
                  {a.totalMaquinas} equipos · {a.operando}/{a.totalMaquinas} operando
                </span>
                <Cifra
                  valor={a.oee} fmt={(v) => `${v.toFixed(1)} %`}
                  style={{ marginLeft: "auto", ...ESCALA.dato, color: col, fontVariantNumeric: "tabular-nums" }}
                />
                {/* El chevron se desplaza al pasar por encima: confirma que la
                    fila lleva a algún sitio antes de hacer clic. */}
                <ChevronRight className="dv2-chevron" size={14} color={t.textFaint} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 8 }}>
                {a.maquinas.map((m, i) => (
                  <CeldaMaquina
                    key={m.id} m={m} t={t} dark={dark} onNavigate={onNavigate}
                    // 40 ms por celda: la rejilla se «llena» de izquierda a
                    // derecha en ~0.4 s. Más lento y se percibe como carga.
                    delay={delay + 0.1 + i * 0.04}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ==================================================================
 * M9 · ESTADO Y PAROS — la dona se retira
 * ==================================================================
 * Con la rejilla de máquinas arriba, la dona de estados era redundante:
 * pintaba en 350 px de tarjeta lo mismo que la rejilla dice máquina a
 * máquina. Se sustituye por una barra apilada de 120 px con separación de
 * 2 px en color de superficie y chips etiquetados.
 *
 * Los colores son los de `./palette.js`, no los de `ESTADO_TOKEN`: ahí
 * «Limpieza» y «Preventivo» están a ΔE 0.9 bajo protanopía —dos rebanadas
 * contiguas indistinguibles— y «Receso» usa un token de TEXTO como color de
 * dato. Ver la cabecera de ese archivo.
 */
export function EstadoYParos({ s, areas, t, dark, delay = 0 }) {
  const listo = useMounted();
  // El paro NO previsto se deriva de la disponibilidad medida: sin
  // lecturas es null, y `numero + null` daria un total que parece real.
  const total =
    hasValue(s.paroPlanificado) && hasValue(s.paroNoPlanificado)
      ? s.paroPlanificado + s.paroNoPlanificado
      : null;
  const pctNo = hasValue(total) && total > 0 ? (s.paroNoPlanificado / total) * 100 : null;

  return (
    <Card t={t} delay={delay} title="Estado y paros" code={`${s.totalMaquinas} equipos`}>
      {/* La barra se abre desde la izquierda y los segmentos se reparten:
          se ve el ORDEN de gravedad antes de leer los chips. */}
      <div style={{ display: "flex", gap: 3, height: 14, marginBottom: 12 }}>
        {s.porEstado.map((e, i) => (
          <div
            key={e.estado}
            title={`${e.label}: ${e.valor}`}
            style={{
              flexGrow: listo ? e.valor : 0, flexBasis: 0, flexShrink: 1,
              background: estadoColor(dark, e.estado), borderRadius: 4,
              transition: `flex-grow 700ms cubic-bezier(0.22,1,0.36,1) ${delay + i * 0.06}s`,
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginBottom: 16 }}>
        {s.porEstado.map((e) => (
          <span key={e.estado} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: t.textSoft }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: estadoColor(dark, e.estado), flexShrink: 0 }} />
            {ESTADO_CORTO[e.estado]} <strong style={{ color: t.text }}>{e.valor}</strong>
          </span>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 14 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: "Paro NO previsto", valor: fmtHM(s.paroNoPlanificado), sub: "lo accionable", tono: "critico" },
            { label: "Paro previsto", valor: fmtHM(s.paroPlanificado), sub: "comidas y cambios", tono: "aviso" },
          ].map((k) => {
            const tono = TONO[k.tono](t);
            return (
              <div
                key={k.label}
                style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: tono.fondo, border: `1px solid ${t.border}` }}
              >
                <div style={{ ...ESCALA.etiqueta, color: t.textFaint }}>{k.label}</div>
                <div style={{ ...ESCALA.tile, color: t.text, margin: "3px 0 1px" }}>{k.valor}</div>
                <div style={{ fontSize: 10.5, color: t.textFaint }}>{k.sub}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 2, height: 8, marginTop: 12 }}>
          {/* Sin medicion la barra queda neutra: una barra toda ambar
              afirmaria que no hubo paro inesperado, que es lo que no sabemos. */}
          {hasValue(pctNo) && (<>
          <div
            style={{
              width: listo ? `${100 - pctNo}%` : "100%", background: t.viz.ambar, borderRadius: 4,
              transition: `width 800ms cubic-bezier(0.22,1,0.36,1) ${delay + 0.25}s`,
            }}
          />
          {/* El coral se «abre paso» empujando al ámbar: el paro no previsto
              se lee como lo que ganó terreno, que es justo lo accionable. */}
          <div style={{ flex: 1, background: t.viz.coral, borderRadius: 4 }} />
          </>)}
        </div>
        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 7, textAlign: "center" }}>
          {hasValue(pctNo) ? (
            <>
              <strong style={{ color: t.text }}>{fmtNum(pctNo, 0)} %</strong> del tiempo muerto no estaba previsto
            </>
          ) : (
            "sin lecturas de tiempo muerto"
          )}
        </div>
      </div>
    </Card>
  );
}

/* ==================================================================
 * M5 · PARETO DE RECHAZOS — el pastel se retira
 * ==================================================================
 * El pastel actual pinta 9 rebanadas con una paleta de 5 y `paleta[i % 5]`:
 * se pasa del techo de categorías, CICLA tonos (la 6.ª máquina vuelve a ser
 * coral, igual que la 1.ª) y asigna color por RANGO, no por entidad — si
 * mañana cambia el orden, cambian los colores. Y un pastel es la peor forma
 * posible de comparar valores parecidos.
 *
 * Barras horizontales, un solo tono, ordenadas, con columna de acumulado.
 * El acumulado es la razón de ser de un Pareto y es exactamente lo que un
 * pastel no puede decir: cuántos equipos hay que atacar para cubrir el 80 %.
 *
 * HTML y no recharts a propósito: control total del extremo redondeado y de
 * dónde cae cada etiqueta, y las columnas de cifras son ya la vista de tabla.
 */
export function ParetoRechazos({ pareto, scrapArea, t, delay = 0 }) {
  const listo = useMounted();
  const lider = scrapArea[0];

  // Sin ningun rechazo MEDIDO no hay Pareto: puede ser un turno limpio o
  // un servidor mudo, y la diferencia ya la cuenta la banda de KPIs.
  if (!pareto.total) {
    return (
      <Card t={t} delay={delay} title="Rechazos por máquina">
        <p style={{ margin: "18px 0", fontSize: 12.5, color: t.textFaint, textAlign: "center" }}>
          Sin rechazos registrados en el turno.
        </p>
      </Card>
    );
  }

  return (
    <Card t={t} delay={delay} title="Rechazos por máquina" code={`${num(pareto.total)} pz · de mayor a menor`}>
      {/* El titular que el pastel esconde. */}
      {lider && (
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: t.textSoft, lineHeight: 1.5 }}>
          <strong style={{ color: t.text }}>{lider.label}</strong> concentra el{" "}
          <strong style={{ color: t.viz.coral }}>{fmtNum(lider.pct, 0)} %</strong> del scrap
          con {lider.equipos} de {scrapArea.reduce((n, a) => n + a.equipos, 0)} equipos.
        </p>
      )}

      <div style={{ display: "flex", gap: 10, ...ESCALA.etiqueta, color: t.textFaint, paddingBottom: 6, borderBottom: `1px solid ${t.border}`, marginBottom: 8 }}>
        <span style={{ width: 74, flexShrink: 0 }}>Máquina</span>
        <span style={{ flex: 1 }} />
        <span style={{ width: 52, textAlign: "right", flexShrink: 0 }}>pz</span>
        <span style={{ width: 52, textAlign: "right", flexShrink: 0 }}>acum.</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {pareto.filas.map((f, i) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 74, flexShrink: 0, fontSize: 11.5, color: f.resto ? t.textFaint : t.textSoft, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {f.nombre}
            </span>

            <div style={{ flex: 1, minWidth: 40, height: 14, display: "flex", alignItems: "center" }}>
              {/* Crecen desde la línea base, en cascada de mayor a menor: el
                  orden del Pareto se percibe ANTES de leer una sola cifra. */}
              <div
                style={{
                  width: listo ? `${pareto.max ? (f.valor / pareto.max) * 100 : 0}%` : 0,
                  height: 14,
                  /* Extremo redondeado 4 px, cuadrado en la línea base. */
                  borderRadius: "0 4px 4px 0",
                  background: f.resto ? t.textFaint : t.viz.coral,
                  opacity: f.resto ? 0.45 : 1,
                  transition: `width 700ms cubic-bezier(0.22,1,0.36,1) ${delay + i * 0.07}s`,
                }}
              />
            </div>

            <span style={{ width: 52, textAlign: "right", flexShrink: 0, fontFamily: MONO, fontSize: 12, fontVariantNumeric: "tabular-nums", color: t.text }}>
              {num(f.valor)}
            </span>
            <span style={{ width: 52, textAlign: "right", flexShrink: 0, fontFamily: MONO, fontSize: 11, fontVariantNumeric: "tabular-nums", color: t.textFaint }}>
              {f.acum.toFixed(0)} %
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ==================================================================
 * PRODUCCIÓN POR HORA
 * ==================================================================
 * Se conserva la forma —apilada es correcta para parte-sobre-total— con tres
 * ajustes: barras capadas a 22 px (nunca llenan la ranura), separación de
 * 2 px en color de superficie entre los dos segmentos, y la leyenda de
 * recharts sustituida por dos chips en la cabecera. Esa leyenda reservaba
 * 54 px de alto para repetir lo que los colores ya dicen.
 */
export function ProduccionPorHora({ data, t, delay = 0 }) {
  const chip = (label, color) => (
    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: t.textSoft }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      {label}
    </span>
  );

  return (
    <Card
      t={t} delay={delay} title="Producción por hora" code="derivado del acumulado del turno"
      right={<div style={{ display: "flex", gap: 12 }}>{chip("Aceptadas", t.viz.verde)}{chip("Rechazadas", t.viz.coral)}</div>}
    >
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 6, right: 6, left: -6, bottom: 0 }}>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 10.5, fill: t.textSoft }} axisLine={{ stroke: t.grid }} tickLine={false} interval="preserveStartEnd" />
          {/* `width` holgado y `tabular-nums`: con 40 px el eje recortaba los
              millares a «00» / «'50». La columna de cifras sí quiere ancho fijo. */}
          <YAxis tick={{ fontSize: 10.5, fill: t.textSoft, fontVariantNumeric: "tabular-nums" }} axisLine={{ stroke: t.grid }} tickLine={false} width={52} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: t.hover }} />
          <Bar dataKey="aceptadas" name="Aceptadas" stackId="p" fill={t.viz.verde} maxBarSize={22} stroke={t.panel} strokeWidth={2} isAnimationActive={false} />
          <Bar dataKey="rechazadas" name="Rechazadas" stackId="p" fill={t.viz.coral} maxBarSize={22} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
