/**
 * «¿La presión cayó cuando cayó el caudal?» — la pregunta de diagnóstico que
 * hoy sólo puede contestar el asistente (`correlacionar_senales`), aquí
 * mirable directamente.
 *
 * Sólo hay CUATRO señales con serie propia en el historiador, y viven en DOS
 * activos distintos —Tanque (nivel, temperatura) y Distribución (caudal,
 * presión)—, así que esta pieza vive fuera de la rejilla por pestaña de
 * `DetalleActivo.jsx`: comparar nivel contra presión cruza justo la frontera
 * que las pestañas existen para trazar.
 *
 * ── LOS DOS MODOS, Y POR QUÉ EL SEGUNDO EXISTE ───────────────────────
 *
 * Sin normalizar: hasta DOS señales, cada una con su propio eje —izquierda
 * para la primera, derecha para la segunda—. Es la lectura más honesta
 * cuando las dos comparten naturaleza (dos señales en % de escala similar).
 *
 * Normalizado a 0-100 % de su ESCALA declarada: hasta CUATRO a la vez, todas
 * en un solo eje. Existe porque nivel (%) y caudal (sin unidad declarada) no
 * se pueden comparar en valor absoluto de ninguna manera razonable — sin
 * esto, la única comparación posible sería entre las dos únicas señales que
 * ya comparten % (nivel y eficiencia, que ni siquiera están las dos aquí).
 */
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, MONO, PuntoEstado } from "../base.jsx";
import { TooltipHistoria } from "./piezas.jsx";
import { useSeriesHistoricas } from "../../data/comunes/hooks.js";
import { SENALES, historizadas } from "../../domain/senales.js";
import { combinarPorTolerancia, normalizarAEscala } from "../../lib/comparar.js";

/** Un color de la paleta de DATOS por señal, en el orden en que se seleccionó — nunca un token de interfaz (`t.accent`, `t.coral`…): ver DESIGN.md, "La Regla de las Dos Paletas". */
const colorDeSerie = (t, i) => [t.viz.azul, t.viz.ambar, t.viz.verde, t.viz.violeta][i % 4];

/** Las cuatro claves con serie propia, en el orden fijo del catálogo — el mismo orden en todas las visitas, para que "la primera seleccionada" sea predecible. */
const CLAVES_COMPARABLES = historizadas();

const MAX_SIN_NORMALIZAR = 2;
const MAX_NORMALIZADO = 4;

function ChipSenal({ clave, activa, deshabilitada, color, t, onToggle }) {
  const meta = SENALES[clave];
  return (
    <button
      type="button"
      aria-pressed={activa}
      disabled={!activa && deshabilitada}
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600,
        border: `1px solid ${activa ? color : "transparent"}`,
        background: activa ? `${color}22` : "transparent",
        color: activa ? color : t.textSoft,
        cursor: !activa && deshabilitada ? "default" : "pointer",
        opacity: !activa && deshabilitada ? 0.45 : 1,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {activa && <PuntoEstado color={color} size={7} />}
      {meta.corto}
    </button>
  );
}

export function GraficaComparada({ rango, t, dark, delay = 0 }) {
  const [seleccion, setSeleccion] = useState(["nivelTanque", "presionRelativa"]);
  const [normalizar, setNormalizar] = useState(false);

  const maxSeleccion = normalizar ? MAX_NORMALIZADO : MAX_SIN_NORMALIZAR;

  // Cada chip conmuta siempre — nada de un botón activo que a veces se
  // niega a soltarse. Bajar de dos simplemente cae en el mensaje de "elige
  // al menos dos", más predecible que un toggle que a veces no hace nada.
  const alternar = (clave) => {
    setSeleccion((prev) => {
      if (prev.includes(clave)) return prev.filter((k) => k !== clave);
      if (prev.length >= maxSeleccion) return prev;
      return [...prev, clave];
    });
  };

  // Sin rango del historiador (modo «Tiempo real» del selector) no hay nada
  // que pedir: el búfer en vivo no tiene la profundidad para comparar
  // tendencias, y alinear dos búferes de sesión es un problema distinto que
  // esta pieza no resuelve. Se le pide al operador que elija un rango.
  const { porClave, loading, metaPorClave } = useSeriesHistoricas(rango ? seleccion : [], rango);

  const filas = combinarPorTolerancia(porClave);
  const filasListas = normalizar
    ? filas.map((f) => {
        const out = { ms: f.ms, t: f.t };
        for (const clave of seleccion) out[clave] = normalizarAEscala(f[clave], SENALES[clave].escala);
        return out;
      })
    : filas;

  const [claveIzquierda, claveDerecha] = seleccion;
  const huboError = seleccion.some((k) => metaPorClave?.[k]?.error);

  return (
    <Card
      t={t} delay={delay} tono="detalle"
      title="Comparar señales"
      code="hasta 4 señales, sobre la misma línea de tiempo"
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {CLAVES_COMPARABLES.map((clave) => (
          <ChipSenal
            key={clave}
            clave={clave}
            activa={seleccion.includes(clave)}
            deshabilitada={seleccion.length >= maxSeleccion}
            color={colorDeSerie(t, Math.max(0, seleccion.indexOf(clave)))}
            t={t}
            onToggle={() => alternar(clave)}
          />
        ))}

        <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 11.5, color: t.textSoft, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={normalizar}
            onChange={(e) => setNormalizar(e.target.checked)}
          />
          Normalizar a % de escala
        </label>
      </div>

      {seleccion.length < 2 ? (
        <MensajeComparacion t={t}>Elige al menos dos señales para comparar.</MensajeComparacion>
      ) : !rango ? (
        <MensajeComparacion t={t}>
          Elige un rango de tiempo (no «Tiempo real») en el selector de arriba para comparar señales.
        </MensajeComparacion>
      ) : huboError ? (
        <MensajeComparacion t={t} color={t.coral}>
          No se pudo consultar el historiador. Reintenta en unos segundos.
        </MensajeComparacion>
      ) : loading && filas.length === 0 ? (
        <MensajeComparacion t={t}>Consultando el historiador…</MensajeComparacion>
      ) : filas.length < 2 ? (
        <MensajeComparacion t={t}>No hay muestras suficientes en este rango.</MensajeComparacion>
      ) : (
        <>
          {/*
           * La leyenda dice de qué eje es cada señal — sin esto, dos ejes sin
           * rotular invitan a leer una escala equivocada con total confianza.
           * Mismo par punto+texto que el resto del tablero: nunca sólo color.
           */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginBottom: 8, fontSize: 11, fontFamily: MONO, color: t.textFaint }}>
            {seleccion.map((clave, i) => (
              <span key={clave} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <PuntoEstado color={colorDeSerie(t, i)} size={7} />
                {SENALES[clave].corto}
                {!normalizar && (i === 0 ? " · eje izquierdo" : " · eje derecho")}
              </span>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={filasListas} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={t.border} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="ms" type="number" scale="time" domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 10, fill: t.textFaint }} axisLine={false} tickLine={false}
                tickFormatter={(ms) => new Date(ms).toLocaleString("es-MX", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              />
              {/*
                Mismo tooltip que la gráfica de detalle, y por la misma razón:
                el eje X lleva el epoch en milisegundos, y con un `content`
                propio Recharts entrega el `label` crudo. Sin envolverlo salía
                «1787609088000» donde tiene que ir «24-ago, 02:24 p.m.».
              */}
              <Tooltip content={<TooltipHistoria />} />
              {normalizar ? (
                <YAxis yAxisId="unica" domain={[0, 100]} tick={{ fontSize: 10, fill: t.textFaint }} axisLine={false} tickLine={false} width={30} />
              ) : (
                <>
                  <YAxis yAxisId="izq" orientation="left" tick={{ fontSize: 10, fill: colorDeSerie(t, 0) }} axisLine={false} tickLine={false} width={34} />
                  <YAxis yAxisId="der" orientation="right" tick={{ fontSize: 10, fill: colorDeSerie(t, 1) }} axisLine={false} tickLine={false} width={34} />
                </>
              )}
              {seleccion.map((clave, i) => (
                <Area
                  key={clave}
                  yAxisId={normalizar ? "unica" : i === 0 ? "izq" : "der"}
                  type="monotone" dataKey={clave} name={SENALES[clave].corto}
                  stroke={colorDeSerie(t, i)} fill={colorDeSerie(t, i)} fillOpacity={0.08}
                  strokeWidth={2} isAnimationActive={false} dot={false} connectNulls={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </Card>
  );
}

function MensajeComparacion({ t, color, children }) {
  return (
    <div
      style={{
        height: 120, display: "flex", alignItems: "center", justifyContent: "center",
        textAlign: "center", padding: "0 20px", fontSize: 12, color: color ?? t.textFaint,
        border: `1px dashed ${t.border}`, borderRadius: 8,
      }}
    >
      {children}
    </div>
  );
}
