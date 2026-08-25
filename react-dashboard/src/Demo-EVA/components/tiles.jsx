/**
 * Las piezas de la vista de Planta de Demo EVA.
 *
 * Componentes «tontos»: reciben el sistema ya evaluado por `domain/sistema.js`,
 * sus derivaciones de `lib/modelo.js` y el tema por prop. Ninguno lee datos ni
 * decide una banda; eso ya está decidido cuando llegan aquí. Nombre en
 * camelCase por lo mismo que `tiles.jsx` de la v2: el archivo exporta varios
 * hermanos sin uno principal.
 *
 * ── EL MAPA CONTRA «PLANTA · V2» ───────────────────────────────────
 *
 * Cada bloque ocupa el hueco de uno de allá, con la misma forma y otro
 * contenido. La columna de la derecha es la razón, y ninguna es estética:
 *
 *   FranjaAtencion   ← franja de atención  · aquí la enciende un umbral, no una
 *                                            alarma: ICONICS no publica alarmas
 *                                            para este árbol
 *   BandaSenales     ← banda de 4 KPIs     · las 4 señales con serie propia
 *   HeroeNivel       ← héroe OEE + gauges  · no hay OEE; el nivel del tanque es
 *                                            la magnitud de estado del sistema
 *   RejillaActivos   ← rejilla de máquinas · no hay máquinas: cuatro activos
 *   EstadoSenales    ← estado y paros      · no hay tiempos de paro
 *   MargenesConsumidos ← Pareto de rechazos · no hay rechazos
 *   TendenciaSenales ← producción por hora · no hay producción
 *
 * `RecorridoSistema` no tiene equivalente en la v2: es nuevo, la topología
 * de los 4 activos como diagrama, sin la magnitud de flujo que un Sankey
 * físico prometería y que este servidor no puede respaldar (ver su cabecera).
 */
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ChevronRight, Droplets, Info } from "lucide-react";

import { ChartTooltip } from "@/components/charts/index.js";
import { HoverTip } from "@/components/ui/index.js";
import { hasValue } from "@shared/valores.js";
import { SIN_DATO, fmtNum } from "@/lib/format.js";
import { navegarConMorph, useCountUp, useMounted, usePrefersReducedMotion } from "@/lib/motion.js";

import { estadoInfo } from "../domain/estado.js";
import { UMBRALES } from "../domain/umbrales.js";
import { FRESCURA, HISTORIAL, estadoHistorial, presentarValor } from "../data/estadoDelDato.js";
import { fmtCifra, fmtSenal, fmtVentana, formateadorDe, pctDeEscala } from "../lib/formato.js";
import { delta } from "../lib/modelo.js";
import { Card, Cifra, Delta, ESCALA, MONO, PuntoEstado, Spark } from "./base.jsx";
import { TONO, bandaColor, estadoColor, estadoTextColor } from "./paleta.js";

/* ==================================================================
 * FRANJA DE ATENCIÓN
 * ==================================================================
 * Condicional a propósito: sin nada fuera de banda, la franja no existe. Una
 * alerta que se enciende siempre deja de leerse en una semana.
 *
 * A diferencia de la v2 de Resonac, los chips **no son botones**. Allí llevan
 * al detalle de la máquina; aquí no hay ninguna vista de detalle por señal a la
 * que llevar, y un botón que no lleva a ningún sitio es peor que un texto.
 */
export function FranjaAtencion({ atencion, t, dark, delay = 0 }) {
  if (!atencion.length) return null;

  const critico = atencion.some((a) => a.severidad === "critico");
  const tono = TONO[critico ? "critico" : "aviso"](t);

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        padding: "10px 16px", borderRadius: 12,
        background: tono.fondo, border: `1px solid ${tono.borde}33`,
        animation: "fadeInUp 0.5s ease both", animationDelay: `${delay}s`,
      }}
    >
      <AlertTriangle className={critico ? "alerta-icono" : undefined} size={16} color={tono.texto} style={{ flexShrink: 0 }} />
      <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
        <span style={{ ...ESCALA.etiqueta, color: tono.texto }}>Requiere atención</span>
        <HoverTip
          wide
          label="Umbral que definimos nosotros, no una alarma de ICONICS: la señal salió de su banda cómoda. No hace falta ninguna acción sobre la instalación real."
        >
          <Info
            size={13}
            color={tono.texto}
            tabIndex={0}
            role="img"
            aria-label="Qué significa este aviso"
            style={{ cursor: "help", opacity: 0.75 }}
          />
        </HoverTip>
      </span>

      {atencion.map((a) => (
        <span key={a.estado} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: t.textSoft }}>
            <strong style={{ color: t.text }}>{a.senales.length}</strong>{" "}
            {estadoInfo(a.estado).label.toLowerCase()}
          </span>
          {a.senales.map((s) => (
            <span
              key={s.key}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: t.panel, border: `1px solid ${t.border}`, borderRadius: 999,
                padding: "3px 10px", fontSize: 11.5, fontWeight: 600, color: t.text,
              }}
            >
              <PuntoEstado color={estadoColor(dark, a.estado)} size={6} />
              {s.corto}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

/* ==================================================================
 * BANDA DE SEÑALES · stat tiles
 * ==================================================================
 * Contrato completo de stat tile: etiqueta · valor · delta · sparkline.
 *
 * Son EXACTAMENTE las cuatro señales con serie propia en el historiador, y no
 * una selección de las «más importantes». Un stat tile promete tendencia por su
 * forma, y las otras cuatro no la pueden dar sin mentir: el historiador les
 * devuelve la curva de la temperatura del tanque. Esas viven en la tarjeta de
 * su activo, donde la ausencia de serie cabe explicada en una línea.
 */
function StatSenal({ senal, serie, t, dark, delay, ahora }) {
  const valores = serie?.map((p) => p.valor) ?? [];
  const color = bandaColor(t, dark, senal.banda);

  const { atenuado, texto: textoCongelado, frescura } = presentarValor({
    receivedAt: senal.receivedAt,
    stale: senal.stale,
    ahora,
    formateado: null, // fresco/envejecido no lo usan: los pinta <Cifra> animado.
  });
  // `atenuado` cubre envejecido Y congelado; sólo congelado sustituye por
  // completo el número — animar un conteo hacia un valor que va a
  // desaparecer bajo su propia edad no tendría sentido.
  const congelado = frescura === FRESCURA.CONGELADO;

  return (
    <Card t={t} delay={delay} style={{ padding: "14px 16px 15px", gap: 0 }}>
      <div style={{ ...ESCALA.etiqueta, color: t.textFaint }}>{senal.label}</div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
        <div>
          {congelado ? (
            <span
              title="El puente no ha vuelto a leer este punto recientemente."
              style={{ ...ESCALA.kpi, fontSize: 15, color: t.textFaint, display: "block" }}
            >
              {textoCongelado}
            </span>
          ) : (
            <Cifra
              valor={senal.valor}
              fmt={(v) => fmtNum(v, senal.decimales)}
              duracion={1100}
              style={{ ...ESCALA.kpi, color: atenuado ? t.textFaint : color, display: "block" }}
            />
          )}
          <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
            <Delta
              valor={delta(valores)}
              t={t}
              subirEsBueno={senal.subirEsBueno}
              decimales={senal.decimales}
              unidad={senal.unidad ? ` ${senal.unidad}` : ""}
            />
            <span style={{ fontSize: 11, color: t.textFaint }}>
              {senal.unidad || senal.tag.toLowerCase()}
            </span>
          </div>
        </div>
        <Spark serie={valores} color={color} t={t} delay={(delay ?? 0) + 0.15} />
      </div>

      <div style={{ marginTop: 10 }}>
        <BarraBanda senal={senal} t={t} dark={dark} delay={delay} />
      </div>
    </Card>
  );
}

/**
 * Posición del valor dentro de su escala, con la banda cómoda marcada encima.
 *
 * Es lo que sustituye a la marca de meta de los medidores de OEE. Una meta es
 * un objetivo que se persigue; una banda es un intervalo en el que hay que
 * quedarse, y por eso se dibuja como una ZONA y no como un tick: se lee «entre
 * aquí y aquí» en vez de «llega hasta aquí».
 */
/**
 * La marca vertical lleva el color de la banda y NUNCA es su único portador:
 * el `corto` del estado —el mismo par punto+texto que usa el resto del
 * tablero, ver `FilaSenal`— va debajo, en el hueco entre los extremos de
 * escala. Antes de este cambio, `StatSenal` y `Medidor` (los dos
 * consumidores) no repetían el estado en ningún otro sitio de su tarjeta:
 * quien no distinguía verde de ámbar no tenía ninguna otra pista.
 */
export function BarraBanda({ senal, t, dark, delay = 0, alto = 6 }) {
  const listo = useMounted();
  const u = UMBRALES[senal.key];
  const sinDato = !hasValue(senal.valor);
  const info = estadoInfo(senal.banda);

  const pctDe = (v) => (hasValue(v) ? pctDeEscala(senal, v) : null);
  const desde = pctDe(u?.avisoMin) ?? 0;
  const hasta = pctDe(u?.avisoMax) ?? 100;

  return (
    <div>
      <div style={{ position: "relative", height: alto, borderRadius: 999, background: t.hover }}>
        {/* La banda cómoda, como zona apenas teñida bajo la barra. */}
        {u && (
          <div
            style={{
              position: "absolute", top: 0, bottom: 0,
              left: `${desde}%`, width: `${Math.max(0, hasta - desde)}%`,
              background: t.successSoft, borderRadius: 999,
            }}
          />
        )}
        {/* El valor, como marca vertical: una barra desde cero afirmaría que la
            magnitud crece desde 0, y una tensión de línea no lo hace. */}
        {!sinDato && (
          <div
            style={{
              position: "absolute", top: -2, bottom: -2,
              left: `calc(${listo ? pctDeEscala(senal) : 0}% - 1px)`,
              width: 3, borderRadius: 2,
              background: bandaColor(t, dark, senal.banda),
              transition: `left 900ms cubic-bezier(0.22,1,0.36,1) ${delay}s`,
            }}
          />
        )}
      </div>
      {senal.escala && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, fontSize: 9.5, color: t.textFaint, fontFamily: MONO }}>
          <span>{senal.escala.min}</span>
          {!sinDato && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "'Inter', sans-serif" }}>
              <PuntoEstado color={bandaColor(t, dark, senal.banda)} size={5} />
              {info.corto}
            </span>
          )}
          <span>{senal.escala.max}</span>
        </div>
      )}
    </div>
  );
}

export function BandaSenales({ senales, series, t, dark, ahora, base = 0 }) {
  return (
    <>
      {senales.map((s, i) => (
        <div className="eva-kpi" key={s.key}>
          <StatSenal senal={s} serie={series[s.key]} t={t} dark={dark} ahora={ahora} delay={base + i * 0.05} />
        </div>
      ))}
    </>
  );
}

/* ==================================================================
 * HÉROE · el nivel del tanque
 * ==================================================================
 * El OEE de Resonac era el número que resume la planta, y su arco lo
 * acompañaban los tres factores que lo componen: la relación era una FÓRMULA
 * (D × R × C) y la vista la enseñaba.
 *
 * Aquí no hay fórmula que enseñar —las señales no se multiplican entre sí— así
 * que la relación es otra: el nivel es el ESTADO del sistema y los tres
 * medidores de al lado son lo que lo está moviendo. Por eso llevan el rótulo
 * «qué lo está moviendo» y no un signo de multiplicación: prometer una
 * aritmética que no existe sería peor que no prometer ninguna.
 */
function ArcoNivel({ senal, t, dark }) {
  const montado = useMounted();
  const sinDato = !hasValue(senal.valor);
  // El arco y la cifra tardan lo mismo (900/1000 ms) y arrancan a la vez, así
  // que el número «llega» justo cuando el trazo termina de barrer.
  const v = useCountUp(sinDato ? 0 : senal.valor, 1000);

  const W = 176, cx = 88, cy = 88, r = 68, sw = 12;
  const LARGO = Math.PI * r;
  const col = bandaColor(t, dark, senal.banda);
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const u = UMBRALES[senal.key];
  const tickEn = (valor) => {
    const a = Math.PI - (pctDeEscala(senal, valor) / 100) * Math.PI;
    const punto = (rad) => ({ x: cx + rad * Math.cos(a), y: cy - rad * Math.sin(a) });
    return { i: punto(r - sw / 2 - 3), o: punto(r + sw / 2 + 3) };
  };

  return (
    <div style={{ position: "relative", width: W, flexShrink: 0 }}>
      <svg
        width={W} height={104} viewBox={`0 0 ${W} 104`} style={{ display: "block" }} role="img"
        aria-label={sinDato ? "Nivel del tanque sin medición" : `Nivel del tanque ${fmtNum(senal.valor, 1)} por ciento`}
      >
        <path d={d} fill="none" stroke={t.border} strokeWidth={sw} strokeLinecap="round" />
        <path
          d={d} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={LARGO}
          strokeDashoffset={montado && !sinDato ? LARGO * (1 - pctDeEscala(senal) / 100) : LARGO}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
        {/* Los dos extremos de la banda cómoda, no una marca de meta: aquí no
            se persigue un número, se permanece en un intervalo. Aparecen con
            un pop de escala cuando el arco termina de barrer, para que el
            héroe de la vista se sienta trazado con intención y no puesto de
            golpe. */}
        {[u?.avisoMin, u?.avisoMax].filter(hasValue).map((valor, i) => {
          const { i: desde, o: hasta } = tickEn(valor);
          return (
            <line
              key={valor} x1={desde.x} y1={desde.y} x2={hasta.x} y2={hasta.y}
              stroke={t.text} strokeWidth={2} strokeLinecap="round" opacity={0.45}
              className="tick-draw" style={{ animationDelay: `${0.75 + i * 0.07}s` }}
            />
          );
        })}
      </svg>

      <div style={{ position: "absolute", top: 44, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
        <div style={{ ...ESCALA.heroe, color: col }}>
          {sinDato ? SIN_DATO : v.toFixed(1)}
          {!sinDato && <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0, marginLeft: 2 }}>%</span>}
        </div>
        <div style={{ ...ESCALA.etiqueta, letterSpacing: 1.3, color: t.textFaint, marginTop: 5 }}>Nivel del tanque</div>
      </div>
    </div>
  );
}

/**
 * Medidor lineal de una señal de apoyo, con su banda y su sparkline.
 *
 * `serie` llega ya como números planos y no como puntos del historiador: de los
 * tres medidores del héroe, dos tienen serie propia y el tercero —la carga del
 * motor— no la tiene y se alimenta del búfer de sesión. Aplanar arriba es lo que
 * permite que este componente no tenga que saber de cuál viene cada uno.
 */
function Medidor({ senal, serie, t, dark, delay = 0 }) {
  const sinDato = !hasValue(senal.valor);
  const col = bandaColor(t, dark, senal.banda);
  const reposo = senal.estado === "reposo";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: t.textSoft, width: 82, flexShrink: 0 }}>
        {senal.corto}
      </span>

      <div style={{ flex: 1, minWidth: 52 }}>
        <BarraBanda senal={senal} t={t} dark={dark} delay={delay} alto={9} />
      </div>

      <Spark serie={serie ?? []} color={col} t={t} w={40} h={16} delay={delay + 0.2} />

      <span
        style={{
          ...ESCALA.dato, fontSize: 14, color: reposo ? t.textFaint : t.text,
          width: 52, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums",
        }}
      >
        {sinDato ? SIN_DATO : fmtCifra(senal)}
      </span>
    </div>
  );
}

/**
 * @param series  `{ clave: number[] }` — series YA aplanadas de los apoyos. Ver
 *                `Medidor`: unas vienen del historiador y otra del búfer vivo,
 *                y quien las compone es la vista.
 */
export function HeroeNivel({ nivel, apoyos, series, historia, t, dark, delay = 0 }) {
  return (
    <Card
      t={t} tono="titular" delay={delay}
      title="Estado del sistema de agua"
      code={`banda cómoda ${UMBRALES.nivelTanque.avisoMin}–${UMBRALES.nivelTanque.avisoMax} % · marcada en el arco`}
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", flex: 1, minHeight: 0 }}>
          <ArcoNivel senal={nivel} t={t} dark={dark} />

          <div style={{ flex: "1 1 236px", minWidth: 216, display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ ...ESCALA.etiqueta, color: t.textFaint, marginBottom: 3 }}>Qué lo está moviendo</div>
            {apoyos.map((s, i) => (
              <Medidor
                key={s.key} senal={s} serie={series[s.key]}
                t={t} dark={dark} delay={0.15 * i}
              />
            ))}
          </div>
        </div>

        {/* La tendencia del nivel vive AQUÍ, pegada al número que trendea, y no
            en una tarjeta propia dos bandas más abajo. */}
        <TendenciaNivel datos={historia} t={t} dark={dark} senal={nivel} />
      </div>
    </Card>
  );
}

function TendenciaNivel({ datos, senal, t, dark }) {
  const filas = (datos ?? []).map((p) => ({
    hora: p.t.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    valor: p.valor,
  }));

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
      <div style={{ ...ESCALA.etiqueta, color: t.textFaint, marginBottom: 2 }}>
        Nivel · últimas horas, del historiador
      </div>
      {filas.length < 2 ? (
        <p style={{ margin: "14px 0", fontSize: 11.5, color: t.textFaint, textAlign: "center" }}>
          El historiador aún no tiene suficientes muestras de esta señal.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={92}>
          <AreaChart data={filas} margin={{ top: 8, right: 6, left: -28, bottom: 0 }}>
            <XAxis dataKey="hora" tick={{ fontSize: 10, fill: t.textFaint }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={false} axisLine={false} tickLine={false} width={34} />
            <Tooltip content={<ChartTooltip />} />
            {/* Sin animación de trazado: la tarjeta ya entra con su fundido, y
                animar además el dato es movimiento por el movimiento. */}
            <Area
              type="monotone" dataKey="valor" name={senal.corto}
              stroke={bandaColor(t, dark, senal.banda)} strokeWidth={2}
              fill={bandaColor(t, dark, senal.banda)} fillOpacity={0.1}
              isAnimationActive={false} dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ==================================================================
 * REJILLA DE ACTIVOS · el mapa de la instalación
 * ==================================================================
 * Ocupa el sitio de la rejilla de máquinas, y hace lo mismo: es el mapa y el
 * desglose a la vez, así que ahorra una banda entera.
 *
 * El estado NUNCA se codifica sólo con color: punto + borde + etiqueta de
 * texto. El color es refuerzo, no el canal de identidad.
 */
function FilaSenal({ senal, serieViva, t, dark, ahora }) {
  const info = estadoInfo(senal.estado);
  const col = estadoColor(dark, senal.estado);
  const reposo = senal.estado === "reposo";

  const { texto: textoValor, atenuado } = presentarValor({
    receivedAt: senal.receivedAt,
    stale: senal.stale,
    ahora,
    formateado: fmtSenal(senal),
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
      <PuntoEstado color={col} size={7} />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {senal.corto}
        </div>
        {/* El nombre del tag va SIEMPRE a la vista: varios rótulos de esta demo
            son lectura nuestra (la «tensión de línea» se llama en el servidor
            «índice de desviación»), y quien conozca la instalación tiene que
            poder reconocer el punto sin abrir el explorador de Assets. */}
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: t.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {senal.tag}
        </div>
      </div>

      {senal.historizado === false && senal.tipo !== "booleano" && (
        <Spark serie={serieViva ?? []} color={col} t={t} w={38} h={15} />
      )}

      <span
        title={atenuado ? "El puente no ha vuelto a leer este punto recientemente." : undefined}
        style={{
          ...ESCALA.dato, fontSize: atenuado ? 11 : 13,
          color: atenuado ? t.textFaint : reposo ? t.textFaint : t.text,
          textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
        }}
      >
        {textoValor}
      </span>

      <span style={{ fontSize: 9.5, color: t.textFaint, width: 52, textAlign: "right", flexShrink: 0 }}>
        {info.corto}
      </span>
    </div>
  );
}

function TarjetaActivo({ activo, seriesVivas, t, dark, onNavigate, ahora, delay = 0 }) {
  const reduce = usePrefersReducedMotion();
  const col = estadoColor(dark, activo.estado);
  const info = estadoInfo(activo.estado);
  const critico = activo.estado === "critico";
  const alerta = TONO.critico(t);

  const entrada = `fadeInUp 0.45s ease ${delay}s both`;
  const animacion = critico && !reduce
    ? `${entrada}, alertaLatido 2.4s ease-in-out ${delay + 0.5}s infinite`
    : entrada;

  // navegarConMorph, no onNavigate directo: esta tarjeta lleva
  // `view-transition-name: activo-<id>` (ver style abajo) y su destino en la
  // Maqueta 3D lleva el mismo nombre, así que el navegador las morphea en vez
  // de cortar entre pantallas — la misma señal, vista dos veces, es
  // literalmente el North Star "El Gemelo Digital" de DESIGN.md.
  const ir = () => {
    if (!onNavigate) return;
    navegarConMorph(onNavigate, "eva-maqueta", { activo: activo.id });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="metric-card"
      title={`${activo.label} · ${info.label}`}
      onClick={ir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); }
      }}
      style={{
        padding: "11px 13px 12px", borderRadius: 10, cursor: "pointer",
        // Sin `outline: none`: `.metric-card:focus-visible` en index.css
        // necesita el outline nativo del navegador para marcar el foco de
        // teclado (WCAG 2.4.7). El color de estado ya lo lleva PuntoEstado en
        // la cabecera; un borde lateral aquí duplicaría la misma información.
        border: `1px solid ${critico ? alerta.borde : t.border}`,
        animation: animacion,
        "--shadow-hover": t.shadowHover,
        // Con movimiento reducido el latido no corre, así que lo crítico tiene
        // que leerse ESTÁTICO: fondo de alerta fijo.
        background: critico && reduce ? alerta.fondo : t.panel,
        "--alerta-base": t.panel,
        "--alerta-tinte": alerta.fondo,
        "--alerta-halo": `${t.coral}59`,
        // Nombre compartido con el resumen de activo en la Maqueta 3D: es lo
        // único que necesita el navegador para morphear una tarjeta en la
        // otra. Inerte fuera de una transición activa, así que no afecta al
        // resto del ciclo de vida de la tarjeta.
        viewTransitionName: `activo-${activo.id}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
        <PuntoEstado color={col} size={7} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>{activo.corto}</span>
        <span style={{ fontSize: 10, color: t.textFaint, marginLeft: "auto" }}>{info.corto}</span>
        <ChevronRight className="eva-chevron" size={13} color={t.textFaint} />
      </div>

      <div style={{ fontSize: 10.5, color: t.textFaint, marginBottom: 4 }}>{activo.pregunta}</div>

      <div style={{ borderTop: `1px solid ${t.border}` }}>
        {activo.senales.map((s) => (
          <FilaSenal key={s.key} senal={s} serieViva={seriesVivas[s.key]} t={t} dark={dark} ahora={ahora} />
        ))}
      </div>
    </div>
  );
}

export function RejillaActivos({ activos, seriesVivas, ventana, t, dark, onNavigate, ahora, delay = 0 }) {
  return (
    <Card
      t={t} tono="navegacion" delay={delay}
      title="Activos de la instalación"
      code={`${activos.length} activos · agrupación propia, el servidor no publica equipos`}
      right={
        <span style={{ fontSize: 10.5, color: t.textFaint }}>
          mini-series: {fmtVentana(ventana?.ventanaS)} en esta sesión
        </span>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(228px, 1fr))", gap: 10 }}>
        {activos.map((a, i) => (
          <TarjetaActivo
            key={a.id} activo={a} seriesVivas={seriesVivas} t={t} dark={dark}
            onNavigate={onNavigate} ahora={ahora} delay={delay + 0.1 + i * 0.05}
          />
        ))}
      </div>
    </Card>
  );
}

/* ==================================================================
 * ESTADO DE LAS SEÑALES
 * ==================================================================
 * Ocupa el sitio de «Estado y paros». Los tiempos de paro no tienen
 * equivalente —no hay tag de tiempo en este árbol— así que las dos cajas de
 * abajo dicen los dos hechos operativos que sí publica el servidor: si el
 * sistema está impulsando y quién manda sobre el variador.
 */
export function EstadoSenales({ sistema, t, dark, delay = 0 }) {
  const listo = useMounted();
  const { porEstado } = sistema.resumen;
  const modo = sistema.senales.modoVdf;

  const cajas = [
    {
      label: "Impulsión",
      valor: sistema.enReposo ? "En reposo" : "En marcha",
      sub: sistema.enReposo ? "caudal y motor a cero" : "hay caudal y carga",
      tono: sistema.enReposo ? "info" : "ok",
    },
    {
      label: "Modo del variador",
      valor: modo.texto ?? SIN_DATO,
      sub: modo.tag,
      tono: "info",
    },
  ];

  return (
    <Card t={t} delay={delay} title="Estado de las señales" code={`${sistema.resumen.totalSenales} señales · ${sistema.resumen.medidas} con lectura`}>
      <div style={{ display: "flex", gap: 3, height: 14, marginBottom: 12 }}>
        {porEstado.map((e, i) => (
          <div
            key={e.estado}
            title={`${estadoInfo(e.estado).label}: ${e.valor}`}
            style={{
              flexGrow: listo ? e.valor : 0, flexBasis: 0, flexShrink: 1,
              background: estadoColor(dark, e.estado), borderRadius: 4,
              transition: `flex-grow 700ms cubic-bezier(0.22,1,0.36,1) ${delay + i * 0.06}s`,
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginBottom: 16 }}>
        {porEstado.map((e) => (
          <span key={e.estado} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: t.textSoft }}>
            <PuntoEstado color={estadoColor(dark, e.estado)} />
            {estadoInfo(e.estado).corto} <strong style={{ color: t.text }}>{e.valor}</strong>
          </span>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 14 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {cajas.map((k) => {
            const tono = TONO[k.tono](t);
            return (
              <div key={k.label} style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, background: tono.fondo, border: `1px solid ${t.border}` }}>
                <div style={{ ...ESCALA.etiqueta, color: t.textFaint }}>{k.label}</div>
                <div style={{ ...ESCALA.tile, fontSize: 16, color: t.text, margin: "3px 0 1px" }}>{k.valor}</div>
                <div style={{ fontSize: 10, color: t.textFaint, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis" }}>{k.sub}</div>
              </div>
            );
          })}
        </div>

        {sistema.enReposo && (
          <p style={{ margin: "12px 0 0", fontSize: 11, color: t.textFaint, lineHeight: 1.5 }}>
            Con el sistema parado, el caudal, la presión, la carga del motor y la
            eficiencia no se evalúan contra su banda: se marcan «en reposo».
          </p>
        )}
      </div>
    </Card>
  );
}

/* ==================================================================
 * MARGEN CONSUMIDO · lo que sustituye al Pareto
 * ==================================================================
 * Barras horizontales ordenadas, un solo tono por banda, y sin columna de
 * acumulado: un Pareto acumula porque sus barras son partes de un total, y
 * estas son siete magnitudes distintas medidas cada una contra SU banda.
 * Sumarlas daría un número sin significado. La columna de la derecha dice la
 * banda, que es lo que sí informa.
 *
 * HTML y no recharts a propósito: control total del extremo redondeado y de
 * dónde cae cada etiqueta, y las columnas de cifras son ya la vista de tabla.
 */
export function MargenesConsumidos({ margenes, t, dark, delay = 0 }) {
  const listo = useMounted();

  if (!margenes.length) {
    return (
      <Card t={t} delay={delay} title="Margen consumido por señal">
        <p style={{ margin: "18px 0", fontSize: 12.5, color: t.textFaint, textAlign: "center" }}>
          Sin lecturas evaluables todavía.
        </p>
      </Card>
    );
  }

  const lider = margenes[0];

  return (
    <Card
      t={t} delay={delay} title="Margen consumido por señal"
      code="0 % es el centro de la banda cómoda · 100 % es tocar el límite · señales en reposo no entran"
    >
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: t.textSoft, lineHeight: 1.5 }}>
        <strong style={{ color: t.text }}>{lider.nombre}</strong> es la señal más
        cerca de su límite, con{" "}
        <strong style={{ color: estadoTextColor(t, lider.estado) }}>{fmtNum(lider.valor, 0)} %</strong>{" "}
        del margen consumido.
      </p>

      <div style={{ display: "flex", gap: 10, ...ESCALA.etiqueta, color: t.textFaint, paddingBottom: 6, borderBottom: `1px solid ${t.border}`, marginBottom: 8 }}>
        <span style={{ width: 84, flexShrink: 0 }}>Señal</span>
        <span style={{ flex: 1 }} />
        <span style={{ width: 46, textAlign: "right", flexShrink: 0 }}>margen</span>
        <span style={{ width: 58, textAlign: "right", flexShrink: 0 }}>banda</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {margenes.map((f, i) => {
          const col = estadoColor(dark, f.estado);
          return (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 84, flexShrink: 0, fontSize: 11.5, color: t.textSoft, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.nombre}
              </span>

              <div style={{ flex: 1, minWidth: 40, height: 14, display: "flex", alignItems: "center" }}>
                <div
                  style={{
                    // Se recorta a 100 para la GEOMETRÍA —una barra al 340 %
                    // reventaría la caja— pero el orden ya lo fijó el valor
                    // real, así que la señal más grave sigue encabezando.
                    //
                    // Ancho fijo al 100 % y escala por transform en vez de
                    // animar `width`: evita el recálculo de layout en cada
                    // fotograma sin cambiar el resultado visual.
                    width: "100%",
                    height: 14,
                    borderRadius: "0 4px 4px 0",
                    background: col,
                    transformOrigin: "left",
                    transform: `scaleX(${listo ? Math.min(100, f.valor) / 100 : 0})`,
                    transition: `transform 700ms cubic-bezier(0.22,1,0.36,1) ${delay + i * 0.07}s`,
                  }}
                />
              </div>

              <span style={{ width: 46, textAlign: "right", flexShrink: 0, fontFamily: MONO, fontSize: 12, fontVariantNumeric: "tabular-nums", color: t.text }}>
                {fmtNum(f.valor, 0)}
              </span>
              <span style={{ width: 58, textAlign: "right", flexShrink: 0, fontSize: 10.5, color: t.textFaint }}>
                {estadoInfo(f.estado).corto}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ==================================================================
 * RECORRIDO DEL SISTEMA · topología del proceso, no un flujo físico
 * ==================================================================
 * Nodos = los 4 activos, en el orden real del recorrido del agua y la
 * energía. Tanque y Eléctrico alimentan a Bombeo; Bombeo alimenta a
 * Distribución:
 *
 *   Tanque ──────┐
 *                ├──► Bombeo ──► Distribución
 *   Eléctrico ───┘
 *
 * NO es un Sankey de magnitud física: las 8 señales del catálogo tienen
 * unidades incompatibles (%, °C, V, y dos sin unidad — caudal y presión), así
 * que no hay ninguna cantidad que "fluya" y se conserve entre activos.
 * Forzar esa lectura inventaría una conversión que el servidor no respalda.
 *
 * Por eso el grosor de cada tramo es FIJO —proporcional al nº de señales del
 * activo de origen, siempre 2 aquí— y no cambia con cada lectura: es un mapa
 * estructural, no una serie en vivo. Lo dinámico es sólo el COLOR de cada
 * tramo y nodo, ligado al peor estado del activo de origen — mismo criterio
 * de color-con-significado que ya usa `RejillaActivos`.
 *
 * SVG a mano y no `d3-sankey`: con topología fija de 4 nodos y 3 tramos, el
 * layout no varía nunca — no hay nada que un motor de layout resuelva mejor
 * que cuatro coordenadas escritas una vez. Mismo espíritu que
 * `MargenesConsumidos`: "HTML/SVG y no una librería de gráficos, a propósito".
 */
const RECORRIDO_ANCHO = 720;
const RECORRIDO_ALTO = 220;

/** Columna X de cada nodo. Tanque y Eléctrico comparten la de origen. */
const RECORRIDO_X = { tanque: 40, electrico: 40, bombeo: 320, distribucion: 548 };
/** Centro Y de cada nodo. */
const RECORRIDO_Y = { tanque: 55, electrico: 165, bombeo: 110, distribucion: 110 };
/** Alto del bloque-nodo: proporcional al nº de señales del activo (todas 2). */
const RECORRIDO_ALTO_NODO = 46;
const RECORRIDO_ANCHO_NODO = 132;

const RECORRIDO_TRAMOS = [
  { id: "tanque-bombeo", de: "tanque", a: "bombeo" },
  { id: "electrico-bombeo", de: "electrico", a: "bombeo" },
  { id: "bombeo-distribucion", de: "bombeo", a: "distribucion" },
];

/** Curva cúbica horizontal entre el borde derecho de un nodo y el izquierdo del otro. */
function curvaTramo(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

/**
 * El dibujo es SVG puro —sin nada de DOM mezclado dentro—, y el hover vive en
 * una capa HTML aparte, superpuesta con posiciones en `%` sobre el mismo
 * contenedor: mezclar `HoverTip` (un `<span>`) dentro del árbol SVG rompería
 * el namespace de `<path>`/`<g>`, y un `<foreignObject>` por elemento sería
 * más código para el mismo resultado.
 */
function CapaRecorrido({ activos, t, dark, listo, delay }) {
  return (
    <svg
      viewBox={`0 0 ${RECORRIDO_ANCHO} ${RECORRIDO_ALTO}`}
      style={{ width: "100%", height: "auto", minWidth: 420, display: "block" }}
    >
      {RECORRIDO_TRAMOS.map((tr, i) => {
        const origen = activos[tr.de];
        const x1 = RECORRIDO_X[tr.de] + RECORRIDO_ANCHO_NODO;
        const y1 = RECORRIDO_Y[tr.de];
        const x2 = RECORRIDO_X[tr.a];
        const y2 = RECORRIDO_Y[tr.a];

        return (
          <path
            key={tr.id}
            d={curvaTramo(x1, y1, x2, y2)}
            fill="none"
            stroke={estadoColor(dark, origen.estado)}
            strokeWidth={origen.senales.length * 6}
            strokeLinecap="round"
            opacity={listo ? 0.55 : 0}
            style={{ transition: `opacity 500ms ease ${delay + 0.1 + i * 0.06}s` }}
          />
        );
      })}

      {Object.keys(RECORRIDO_X).map((id, i) => {
        const activo = activos[id];
        const x = RECORRIDO_X[id];
        const y = RECORRIDO_Y[id] - RECORRIDO_ALTO_NODO / 2;
        const col = estadoColor(dark, activo.estado);
        const t2 = delay + 0.2 + i * 0.05;

        return (
          <g
            key={id}
            style={{
              opacity: listo ? 1 : 0,
              transform: listo ? "translateY(0)" : "translateY(4px)",
              transition: `opacity 500ms ease ${t2}s, transform 500ms ease ${t2}s`,
            }}
          >
            <rect
              x={x} y={y} width={RECORRIDO_ANCHO_NODO} height={RECORRIDO_ALTO_NODO}
              rx={10} fill={t.panel} stroke={col} strokeWidth={1.5}
            />
            <circle cx={x + 14} cy={y + RECORRIDO_ALTO_NODO / 2} r={4} fill={col} />
            <text
              x={x + 26} y={y + RECORRIDO_ALTO_NODO / 2 + 4}
              fontSize={12} fontWeight={700} fill={t.text}
              fontFamily="'Inter', sans-serif"
            >
              {activo.corto}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Zonas invisibles en `%` del mismo lienzo, cada una envuelta en `HoverTip`:
 * es lo que da el tooltip por nodo y por tramo reutilizando el componente que
 * ya usa el resto de la vista, sin duplicar su lógica de mostrar/ocultar.
 */
function CapaHover({ activos, t }) {
  const zonaNodo = (id) => ({
    left: `${(RECORRIDO_X[id] / RECORRIDO_ANCHO) * 100}%`,
    top: `${((RECORRIDO_Y[id] - RECORRIDO_ALTO_NODO / 2) / RECORRIDO_ALTO) * 100}%`,
    width: `${(RECORRIDO_ANCHO_NODO / RECORRIDO_ANCHO) * 100}%`,
    height: `${(RECORRIDO_ALTO_NODO / RECORRIDO_ALTO) * 100}%`,
  });

  const zonaTramo = (tr) => {
    const x1 = RECORRIDO_X[tr.de] + RECORRIDO_ANCHO_NODO;
    const x2 = RECORRIDO_X[tr.a];
    const y = Math.min(RECORRIDO_Y[tr.de], RECORRIDO_Y[tr.a]);
    const alto = Math.max(24, Math.abs(RECORRIDO_Y[tr.de] - RECORRIDO_Y[tr.a]));
    return {
      left: `${(x1 / RECORRIDO_ANCHO) * 100}%`,
      top: `${((y - alto / 2) / RECORRIDO_ALTO) * 100}%`,
      width: `${((x2 - x1) / RECORRIDO_ANCHO) * 100}%`,
      height: `${(alto / RECORRIDO_ALTO) * 100}%`,
    };
  };

  // `HoverTip` es un `<span inline-flex>` que se ajusta a su contenido: sin
  // forzar sus propias dimensiones se encoge a (0,0) y el hover nunca llega a
  // dispararse. `absolute inset:0` sobre el propio span de `HoverTip` (vía
  // `style` vertido con `{...zona}`) lo estira a la zona del `div` padre,
  // que es lo que hace que el área de captura coincida con el nodo/tramo real.
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {RECORRIDO_TRAMOS.map((tr) => {
        const origen = activos[tr.de];
        const destino = activos[tr.a];
        return (
          <HoverTip
            key={tr.id}
            wide
            label={`${origen.corto} → ${destino.corto} · ${estadoInfo(origen.estado).label.toLowerCase()}`}
            style={{ position: "absolute", ...zonaTramo(tr) }}
          >
            <span style={{ display: "block", width: "100%", height: "100%" }} />
          </HoverTip>
        );
      })}
      {Object.keys(RECORRIDO_X).map((id) => {
        const activo = activos[id];
        return (
          <HoverTip
            key={id}
            wide
            label={`${activo.label} · ${estadoInfo(activo.estado).label.toLowerCase()}`}
            style={{ position: "absolute", ...zonaNodo(id) }}
          >
            <span style={{ display: "block", width: "100%", height: "100%" }} />
          </HoverTip>
        );
      })}
    </div>
  );
}

export function RecorridoSistema({ activos, t, dark, delay = 0 }) {
  const listo = useMounted();
  const porId = Object.fromEntries(activos.map((a) => [a.id, a]));

  return (
    <Card
      t={t} delay={delay} title="Recorrido del sistema"
      code="Topología del proceso, no una medición de flujo físico"
    >
      <div style={{ width: "100%", position: "relative", overflowX: "auto" }}>
        <CapaRecorrido activos={porId} t={t} dark={dark} listo={listo} delay={delay} />
        <CapaHover activos={porId} t={t} />
      </div>
    </Card>
  );
}

/* ==================================================================
 * TENDENCIA · cuatro gráficas pequeñas, no cuatro líneas superpuestas
 * ==================================================================
 * La banda de cierre de la v2 es una gráfica de producción apilada, que aquí no
 * tiene equivalente. Lo que ocupa su sitio son las cuatro señales historizadas
 * a lo largo del turno.
 *
 * ── POR QUÉ SEPARADAS Y NO SUPERPUESTAS ────────────────────────────
 *
 * Superponer nivel (%), temperatura (°C), caudal y presión en un solo eje
 * exigiría normalizarlas, y una gráfica normalizada no se puede leer: dos
 * líneas al mismo alto no significan nada comparable. Además reaparecería el
 * problema de paleta que la v2 documenta —cuatro series a distinguir sólo por
 * color— justo cuando no hace ninguna falta.
 *
 * Cuatro paneles pequeños con eje propio se comparan por FORMA, que es la
 * pregunta real («¿qué se movió a la vez?»), y cada uno conserva su escala.
 */
function PanelTendencia({ senal, datos, error, t, dark }) {
  const filas = (datos ?? []).map((p) => ({
    hora: p.t.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    valor: p.valor,
  }));
  const col = bandaColor(t, dark, senal.banda);
  const fmt = formateadorDe(senal);
  // `TendenciaSenales` sólo se monta cuando `PlantaEva` ya terminó de cargar
  // el historiador (ver su "Leyendo el historiador…"), así que aquí no hay
  // estado de carga que distinguir: sólo si sobrevivió un fallo de red.
  const sinConexion = estadoHistorial({ error, datos: filas, minimo: 2 }) === HISTORIAL.SIN_CONEXION;

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <span style={{ ...ESCALA.etiqueta, color: t.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {senal.corto}
        </span>
        <span style={{ ...ESCALA.dato, fontSize: 12, color: col, fontVariantNumeric: "tabular-nums" }}>
          {fmt(senal.valor)}
        </span>
      </div>

      {filas.length < 2 ? (
        <div style={{ height: 116, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: t.textFaint, textAlign: "center", border: `1px dashed ${t.border}`, borderRadius: 8, padding: "0 10px" }}>
          {sinConexion ? "no se pudo consultar el historiador" : "sin muestras suficientes"}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={116}>
          <AreaChart data={filas} margin={{ top: 6, right: 4, left: -34, bottom: 0 }}>
            <XAxis dataKey="hora" tick={{ fontSize: 9.5, fill: t.textFaint }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={["dataMin", "dataMax"]} tick={false} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone" dataKey="valor" name={senal.corto}
              stroke={col} strokeWidth={1.8} fill={col} fillOpacity={0.12}
              isAnimationActive={false} dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function TendenciaSenales({ senales, porClave, metaPorClave, horas, t, dark, delay = 0 }) {
  return (
    <Card
      t={t} delay={delay}
      title="Las cuatro señales con historia propia"
      code={`últimas ${horas} h · del Data Historian`}
      right={
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.textSoft }}>
          <Droplets size={13} color={t.accent} />
          escala propia en cada panel
        </span>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
        {senales.map((s) => (
          <PanelTendencia
            key={s.key} senal={s} datos={porClave[s.key]} error={metaPorClave?.[s.key]?.error}
            t={t} dark={dark}
          />
        ))}
      </div>
    </Card>
  );
}
