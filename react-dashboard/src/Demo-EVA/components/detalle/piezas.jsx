/**
 * Átomos de la vista Detalle de activo (`components/detalle/DetalleGrid.jsx`,
 * consumida por `views/DetalleActivo.jsx`): cómo se pinta un histórico real,
 * un búfer de sesión, o su ausencia. Separados del layout porque de tres
 * acomodos comparados en vivo se quedó uno, pero la verdad sobre el origen
 * del dato es la misma independientemente de cuál hubiera ganado.
 */
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { History, Radio } from "lucide-react";

import { ChartTooltip } from "@/components/charts/index.js";
import { hasValue } from "@shared/valores.js";

import { bandaColor } from "../paleta.js";
import { MONO } from "../base.jsx";

/**
 * Insignia que declara el ORIGEN de una serie. Nunca se deja a que el lector
 * adivine si una curva es del historiador o del búfer de esta sesión — son
 * promesas distintas (Plan 8, `lib/buffer.js`) y confundirlas es mentir sobre
 * el dato.
 */
export function InsigniaOrigen({ real, t }) {
  const Icono = real ? History : Radio;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.3,
        color: t.textFaint, textTransform: "uppercase",
      }}
    >
      <Icono size={10} />
      {real ? "Historiador" : "Sesión actual"}
    </span>
  );
}

/** Menos de 36 h: se lee mejor por hora. Más: por hora sola no dice de qué día es. */
const UMBRAL_MULTIDIA_MS = 36 * 3_600_000;

function formatoTick(multiDia) {
  return (ms) =>
    multiDia
      ? new Date(ms).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
      : new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function formatoTooltip(ms) {
  return new Date(ms).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Dominio del eje Y: la escala declarada de la señal (`BandaValor` usa la
 * misma), no `dataMin`/`dataMax`. Un rango que se ajusta a los propios datos
 * estira CUALQUIER variación —incluido el ruido de una décima— hasta llenar
 * el alto entero del recuadro, y una oscilación de 102.01 a 102.12 se lee
 * como un desplome. Fijar la escala real hace que un movimiento pequeño se
 * VEA pequeño. Se expande sólo si la serie se sale de la escala —un valor
 * fuera de rango no debe desaparecer del recuadro— y cae en `dataMin`/`Max`
 * si la señal no declara escala.
 */
export function dominioY(escala) {
  if (!escala) return ["dataMin", "dataMax"];
  return [
    (dataMin) => Math.min(dataMin, escala.min),
    (dataMax) => Math.max(dataMax, escala.max),
  ];
}

/**
 * `labelFormatter` de Recharts sólo se aplica al tooltip por defecto — con
 * un `content` propio, como `ChartTooltip`, Recharts pasa el `label` tal
 * cual venía en la fila (aquí, el epoch en milisegundos crudo). Por eso el
 * formateo se hace aquí, envolviendo `ChartTooltip` sin tocarlo: es un
 * componente compartido con gráficas que sí le pasan una hora ya en texto.
 */
export function TooltipHistoria(props) {
  return <ChartTooltip {...props} label={typeof props.label === "number" ? formatoTooltip(props.label) : props.label} />;
}

/**
 * Histórico real del historiador, o del búfer en vivo cuando `enVivo` —
 * `datos` es `[{ t, valor }]` en los dos casos.
 *
 * `cargando` no vacía la gráfica: la sube `useSeriesHistoricas` mientras trae
 * el rango nuevo, y aquí sólo cambia el mensaje de ausencia (si aún no hay
 * nada que mostrar) o añade una insignia sobre la curva anterior (si ya
 * había algo) — nunca un parpadeo en blanco al cambiar de rango. En modo
 * vivo no hay «cargando»: el búfer no sale a la red, sólo crece.
 *
 * El área se revela una vez con `.grafica-revela` (index.css) al MONTAR este
 * bloque — que sólo ocurre cuando pasa de "sin datos" a "con datos": primera
 * carga, o cambio de activo. Un cambio de rango con la misma serie ya
 * cargada no remonta nada (mismo nodo, sólo cambian sus atributos), así que
 * no vuelve a dispararse; y en vivo, cada muestra nueva sólo actualiza el
 * `d` del área ya revelada. Por eso `isAnimationActive` sigue en `false`: la
 * animación de Recharts se repetiría en cada actualización, que es
 * exactamente el parpadeo que ya se evitó a propósito en `tiles.jsx`.
 */
export function GraficaHistoria({ senal, datos, cargando, enVivo, t, dark, alto = 150, delay = 0 }) {
  const filas = (datos ?? []).map((p) => ({ t: p.t.getTime(), valor: p.valor }));
  const col = bandaColor(t, dark, senal.banda);

  if (filas.length < 2) {
    const mensaje = enVivo
      ? "Sin muestras todavía en esta sesión."
      : cargando
      ? "Consultando el historiador…"
      : "No hay muestras del historiador en este rango.";
    return <GraficaAusente t={t} alto={alto} mensaje={mensaje} />;
  }

  const multiDia = filas[filas.length - 1].t - filas[0].t > UMBRAL_MULTIDIA_MS;

  return (
    <div className="grafica-revela" style={{ position: "relative", animationDelay: `${delay}s` }}>
      <ResponsiveContainer width="100%" height={alto}>
        <AreaChart data={filas} margin={{ top: 6, right: 6, left: -28, bottom: 0 }}>
          <XAxis
            dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
            tickFormatter={formatoTick(multiDia)}
            tick={{ fontSize: 10, fill: t.textFaint }} axisLine={false} tickLine={false} interval="preserveStartEnd"
          />
          <YAxis domain={dominioY(senal.escala)} tick={false} axisLine={false} tickLine={false} width={30} />
          <Tooltip content={<TooltipHistoria />} />
          <Area
            type="monotone" dataKey="valor" name={senal.corto}
            stroke={col} strokeWidth={2} fill={col} fillOpacity={0.14}
            isAnimationActive={false} dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      {cargando && (
        <span
          style={{
            position: "absolute", top: 2, right: 2,
            fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase",
            color: t.textFaint, background: t.hover, borderRadius: 999, padding: "2px 8px",
          }}
        >
          Actualizando…
        </span>
      )}
    </div>
  );
}

/**
 * Búfer de sesión: `valores` son números planos, sin marca de tiempo.
 *
 * Se revela con la misma `.grafica-revela` (index.css) que `GraficaHistoria`,
 * en vez del trazado de `Spark`: el `pathLength` que usa `Spark` para
 * animar `stroke-dasharray` no combina con el `preserveAspectRatio="none"` +
 * `vector-effect="non-scaling-stroke"` de este SVG (la escala anisotrópica
 * del viewBox rompe el cálculo de longitud del trazo y el "dibujo" sale
 * discontinuo). El clip-path no toca esa geometría, así que es la vía segura
 * — y de paso iguala el lenguaje de revelado con `GraficaHistoria`.
 */
export function GraficaBufer({ senal, valores, t, dark, alto = 60, delay = 0 }) {
  if (!valores || valores.length < 2) {
    return <GraficaAusente t={t} alto={alto} mensaje="Sin muestras todavía en esta sesión." compacta />;
  }

  const col = bandaColor(t, dark, senal.banda);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const span = max - min || 1;
  const w = 100, h = alto;
  const x = (i) => (i / (valores.length - 1)) * w;
  const y = (v) => h - 3 - ((v - min) / span) * (h - 6);
  const d = valores.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");

  return (
    <svg
      className="grafica-revela"
      viewBox={`0 0 ${w} ${h}`} width="100%" height={alto} preserveAspectRatio="none"
      style={{ display: "block", animationDelay: `${delay}s` }} aria-hidden="true"
    >
      <path
        d={d}
        fill="none" stroke={col} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke" opacity={0.85}
      />
    </svg>
  );
}

/** Ausencia honesta: nunca un hueco vacío ni una gráfica inventada. */
export function GraficaAusente({ t, alto = 150, mensaje, compacta }) {
  return (
    <div
      style={{
        height: alto, display: "flex", alignItems: "center", justifyContent: "center",
        textAlign: "center", padding: compacta ? "0 8px" : "0 24px",
        fontSize: compacta ? 10.5 : 11.5, color: t.textFaint, lineHeight: 1.5,
        border: `1px dashed ${t.border}`, borderRadius: 8,
      }}
    >
      {mensaje}
    </div>
  );
}

/** Posición de un valor dentro de su banda, como zona — misma idea que `BarraBanda` de tiles.jsx. */
export function BandaValor({ senal, t, dark, alto = 7 }) {
  const sinDato = !hasValue(senal.valor);
  const pct = senal.escala && hasValue(senal.valor)
    ? Math.max(0, Math.min(100, ((senal.valor - senal.escala.min) / (senal.escala.max - senal.escala.min)) * 100))
    : null;

  if (!senal.escala) return null;

  return (
    <div>
      <div style={{ position: "relative", height: alto, borderRadius: 999, background: t.hover }}>
        {!sinDato && pct !== null && (
          <div
            style={{
              position: "absolute", top: -2, bottom: -2, left: `calc(${pct}% - 1.5px)`,
              width: 3, borderRadius: 2, background: bandaColor(t, dark, senal.banda),
              transition: "left 700ms cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9.5, color: t.textFaint, fontFamily: MONO }}>
        <span>{senal.escala.min}</span>
        <span>{senal.escala.max}</span>
      </div>
    </div>
  );
}

/** El valor actual de una booleana, con las dos etiquetas posibles a modo de leyenda. */
export function EstadoBooleano({ senal, t }) {
  const opciones = Object.entries(senal.etiquetas ?? {});
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: t.text }}>
        {senal.texto ?? "—"}
      </div>
      {opciones.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {opciones.map(([valor, etiqueta]) => (
            <span
              key={valor}
              style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 600,
                background: senal.texto === etiqueta ? t.accentSoft : t.hover,
                color: senal.texto === etiqueta ? t.accent : t.textFaint,
              }}
            >
              {etiqueta}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
