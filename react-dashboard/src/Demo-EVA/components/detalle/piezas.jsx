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

/** Histórico real del historiador: `datos` es `[{ t, valor }]`. */
export function GraficaHistoria({ senal, datos, t, dark, alto = 150 }) {
  const filas = (datos ?? []).map((p) => ({
    hora: p.t.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    valor: p.valor,
  }));
  const col = bandaColor(t, dark, senal.banda);

  if (filas.length < 2) {
    return <GraficaAusente t={t} alto={alto} mensaje="El historiador aún no tiene suficientes muestras." />;
  }

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <AreaChart data={filas} margin={{ top: 6, right: 6, left: -28, bottom: 0 }}>
        <XAxis dataKey="hora" tick={{ fontSize: 10, fill: t.textFaint }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis domain={["dataMin", "dataMax"]} tick={false} axisLine={false} tickLine={false} width={30} />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone" dataKey="valor" name={senal.corto}
          stroke={col} strokeWidth={2} fill={col} fillOpacity={0.14}
          isAnimationActive={false} dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Búfer de sesión: `valores` son números planos, sin marca de tiempo. */
export function GraficaBufer({ senal, valores, t, dark, alto = 60 }) {
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
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={alto} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden="true">
      <path d={d} fill="none" stroke={col} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.85} />
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
