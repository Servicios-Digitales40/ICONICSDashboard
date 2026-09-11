/**
 * Proyección de consumo energético para los tres compresores.
 *
 * Cada compresor dispara una solicitud POST independiente contra el backend
 * de forecasting. La vista pinta DOS gráficas por compresor:
 *   1. consumo proyectado contra consumo real;
 *   2. error absoluto diario.
 *
 * El contrato esperado del backend es el acordado por forecasting:
 *
 *   {
 *     "daily": [
 *       {
 *         "day": 1,
 *         "date": "2026-07-01",
 *         "projected_kwh": 7329.675,
 *         "actual_kwh": 7686.702,
 *         "absolute_error_kwh": 357.027
 *       }
 *     ],
 *     "total" | "totals": { ... }
 *   }
 *
 * La lectura de `daily` acepta además los envoltorios `data`, `forecast` y
 * `result` para no acoplar la UI a un envoltorio HTTP concreto. Las columnas
 * de cada punto sí se mantienen estrictas: projected_kwh, actual_kwh y
 * absolute_error_kwh.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, CalendarDays, RefreshCw, Sigma, TrendingUp,
} from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { AlertBanner, Button, Panel, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";
import {
  fetchConsumptionForecast, PREDICTION_API_BASE,
} from "@/lib/predictionApi.js";

const COMPRESSORS = ["CP01", "CP02", "CP03"];
const DAYS = 30;
const PERSIST = false;
const MONO = "'IBM Plex Mono', monospace";
const SANS = "'Plus Jakarta Sans', sans-serif";

const GRID = `
.forecast-page { display: flex; flex-direction: column; gap: 20px; }
.forecast-section { display: flex; flex-direction: column; gap: 14px; }
.forecast-chart-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.forecast-kpi-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 1120px) {
  .forecast-chart-grid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .forecast-kpi-grid { grid-template-columns: 1fr; }
}
`;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmtKwh(value, digits = 1) {
  const n = finite(value);
  if (n === null) return "—";
  return `${new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)} kWh`;
}

function shortDate(value) {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}` : String(value);
}

function extractDaily(payload) {
  const candidates = [
    payload?.daily,
    payload?.data?.daily,
    payload?.forecast?.daily,
    payload?.result?.daily,
  ];
  const daily = candidates.find(Array.isArray);
  if (!daily) return [];

  return daily
    .map((row, index) => ({
      day: finite(row?.day) ?? index + 1,
      date: row?.date ?? null,
      projected_kwh: finite(row?.projected_kwh),
      actual_kwh: finite(row?.actual_kwh),
      absolute_error_kwh: finite(row?.absolute_error_kwh),
    }))
    .filter((row) => row.date || row.projected_kwh !== null || row.actual_kwh !== null);
}

function sumPresent(rows, key) {
  const values = rows.map((row) => finite(row[key])).filter((value) => value !== null);
  return values.length ? values.reduce((acc, value) => acc + value, 0) : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const n = finite(value);
    if (n !== null) return n;
  }
  return null;
}

function extractTotals(payload, rows) {
  const wrapped = payload?.totals ?? payload?.total ?? payload?.summary ?? {};
  return {
    projected_kwh: firstFinite(
      wrapped?.projected_kwh,
      wrapped?.total_projected_kwh,
      payload?.total_projected_kwh,
      sumPresent(rows, "projected_kwh")
    ),
    actual_kwh: firstFinite(
      wrapped?.actual_kwh,
      wrapped?.total_actual_kwh,
      payload?.total_actual_kwh,
      sumPresent(rows, "actual_kwh")
    ),
    absolute_error_kwh: firstFinite(
      wrapped?.absolute_error_kwh,
      wrapped?.total_absolute_error_kwh,
      payload?.total_absolute_error_kwh,
      sumPresent(rows, "absolute_error_kwh")
    ),
  };
}

function normalizeForecast(payload) {
  const daily = extractDaily(payload);
  return {
    raw: payload,
    daily,
    totals: extractTotals(payload, daily),
  };
}

function ForecastTooltip({ active, payload, label }) {
  const { theme: t } = useTheme();
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderRadius: 9,
        padding: "9px 11px",
        boxShadow: t.shadowHover,
        fontFamily: MONO,
        fontSize: 11.5,
      }}
    >
      <div style={{ color: t.text, fontWeight: 700, marginBottom: 5 }}>{label}</div>
      {payload.map((item) => (
        <div key={item.dataKey} style={{ color: item.color || t.textSoft, marginTop: 2 }}>
          {item.name}: {fmtKwh(item.value, 2)}
        </div>
      ))}
    </div>
  );
}

function Kpi({ icon, label, value, t, color }) {
  return (
    <div
      style={{
        padding: "11px 12px",
        borderRadius: 11,
        border: `1px solid ${t.border}`,
        background: t.hover,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: t.textFaint, fontSize: 10.5 }}>
        <span style={{ display: "flex", color: color ?? t.textFaint }}>{icon}</span>
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          color: color ?? t.text,
          fontFamily: MONO,
          fontSize: 15,
          fontWeight: 750,
          fontVariantNumeric: "tabular-nums",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyChart({ t, message }) {
  return (
    <div
      style={{
        minHeight: 270,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        border: `1px dashed ${t.border}`,
        color: t.textFaint,
        fontSize: 12,
        textAlign: "center",
        padding: 18,
      }}
    >
      {message}
    </div>
  );
}

function ComparisonChart({ rows, t }) {
  if (!rows.length) return <EmptyChart t={t} message="El backend no devolvió elementos en daily." />;

  return (
    <ResponsiveContainer width="100%" height={290}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 2 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={{ fontSize: 10, fill: t.textFaint }}
          axisLine={false}
          tickLine={false}
          minTickGap={18}
        />
        <YAxis
          tick={{ fontSize: 10, fill: t.textFaint }}
          axisLine={false}
          tickLine={false}
          width={62}
          tickFormatter={(value) => `${Math.round(value / 1000)}k`}
        />
        <Tooltip content={<ForecastTooltip />} labelFormatter={(value) => value || "—"} />
        <Line
          type="monotone"
          dataKey="projected_kwh"
          name="Proyectado"
          stroke={t.viz.azul}
          strokeWidth={2.2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="actual_kwh"
          name="Real"
          stroke={t.viz.verde}
          strokeWidth={2.2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ErrorChart({ rows, t }) {
  const hasError = rows.some((row) => row.absolute_error_kwh !== null);
  if (!rows.length || !hasError) {
    return <EmptyChart t={t} message="No hay valores de absolute_error_kwh para este compresor." />;
  }

  return (
    <ResponsiveContainer width="100%" height={290}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 2 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={{ fontSize: 10, fill: t.textFaint }}
          axisLine={false}
          tickLine={false}
          minTickGap={18}
        />
        <YAxis
          tick={{ fontSize: 10, fill: t.textFaint }}
          axisLine={false}
          tickLine={false}
          width={62}
          tickFormatter={(value) => `${Math.round(value)}`}
        />
        <Tooltip content={<ForecastTooltip />} labelFormatter={(value) => value || "—"} />
        <Line
          type="monotone"
          dataKey="absolute_error_kwh"
          name="Error absoluto"
          stroke={t.viz.ambar}
          strokeWidth={2.2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function LoadingPanel({ t }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          style={{
            height: index === 2 ? 210 : 48,
            borderRadius: 10,
            background: t.shimmer,
            backgroundSize: "220% 100%",
            animation: "shimmer 1.5s linear infinite",
          }}
        />
      ))}
    </div>
  );
}

function CompressorSection({ compressor, state, t, delay }) {
  const rows = state?.data?.daily ?? [];
  const totals = state?.data?.totals ?? {};

  return (
    <section className="forecast-section" aria-labelledby={`forecast-${compressor}`}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          paddingTop: 4,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 id={`forecast-${compressor}`} style={{ margin: 0, color: t.text, fontFamily: SANS, fontSize: 15.5 }}>
            Compresor {compressor}
          </h3>
          <div style={{ marginTop: 3, color: t.textFaint, fontSize: 11.5, fontFamily: MONO }}>
            {`{ compressor: "${compressor}", days: ${DAYS}, persist: ${PERSIST} }`}
          </div>
        </div>
        {state?.data && (
          <span
            style={{
              padding: "5px 9px",
              borderRadius: 999,
              background: t.successSoft,
              color: t.success,
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            {rows.length} días recibidos
          </span>
        )}
      </div>

      {state?.error && (
        <AlertBanner
          type="error"
          title={`No se pudo consultar ${compressor}`}
          message={state.error}
        />
      )}

      <div className="forecast-kpi-grid">
        <Kpi
          icon={<TrendingUp size={13} />}
          label="Total proyectado"
          value={state?.loading ? "Consultando…" : fmtKwh(totals.projected_kwh)}
          t={t}
          color={t.viz.azul}
        />
        <Kpi
          icon={<Activity size={13} />}
          label="Total real"
          value={state?.loading ? "Consultando…" : fmtKwh(totals.actual_kwh)}
          t={t}
          color={t.viz.verde}
        />
        <Kpi
          icon={<Sigma size={13} />}
          label="Error absoluto total"
          value={state?.loading ? "Consultando…" : fmtKwh(totals.absolute_error_kwh)}
          t={t}
          color={t.viz.ambar}
        />
      </div>

      <div className="forecast-chart-grid">
        <Panel
          title={`${compressor} · Proyectado vs real`}
          code={`${DAYS} días · kWh por día`}
          delay={delay}
          style={{ minWidth: 0 }}
        >
          {state?.loading ? <LoadingPanel t={t} /> : <ComparisonChart rows={rows} t={t} />}
        </Panel>

        <Panel
          title={`${compressor} · Error absoluto`}
          code="|real - proyectado| · kWh por día"
          delay={delay + 0.04}
          style={{ minWidth: 0 }}
        >
          {state?.loading ? <LoadingPanel t={t} /> : <ErrorChart rows={rows} t={t} />}
        </Panel>
      </div>
    </section>
  );
}

export default function ProyeccionConsumo() {
  const { theme: t } = useTheme();
  const [refreshKey, setRefreshKey] = useState(0);
  const [states, setStates] = useState(() => Object.fromEntries(
    COMPRESSORS.map((compressor) => [compressor, { loading: true, data: null, error: "" }])
  ));

  const load = useCallback(async (signal) => {
    setStates(Object.fromEntries(
      COMPRESSORS.map((compressor) => [compressor, { loading: true, data: null, error: "" }])
    ));

    const results = await Promise.allSettled(
      COMPRESSORS.map((compressor) => fetchConsumptionForecast({
        compressor,
        days: DAYS,
        persist: PERSIST,
        signal,
      }))
    );

    if (signal?.aborted) return;

    const next = {};
    results.forEach((result, index) => {
      const compressor = COMPRESSORS[index];
      if (result.status === "fulfilled") {
        const normalized = normalizeForecast(result.value);
        next[compressor] = normalized.daily.length
          ? { loading: false, data: normalized, error: "" }
          : {
              loading: false,
              data: normalized,
              error: "La respuesta fue válida, pero no contiene un arreglo daily con datos para graficar.",
            };
      } else {
        next[compressor] = {
          loading: false,
          data: null,
          error: result.reason?.message || "No se pudo consultar el backend de forecasting.",
        };
      }
    });
    setStates(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  const loading = useMemo(
    () => COMPRESSORS.some((compressor) => states[compressor]?.loading),
    [states]
  );

  return (
    <>
      <style>{GRID}</style>
      <div className="forecast-page">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <SectionLabel sub="Dos gráficas por compresor · CP01, CP02 y CP03 · 30 días por solicitud">
            Proyección de consumo
          </SectionLabel>

          <Button
            variant="secondary"
            icon={<RefreshCw size={14} />}
            loading={loading}
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            Actualizar proyecciones
          </Button>
        </div>

        <Panel
          title="Fuente de datos"
          code="POST /api/v1/forecasting/forecast/"
          delay={0}
          style={{ paddingBottom: 18 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: t.textSoft, fontSize: 12 }}>
              <CalendarDays size={14} color={t.accent} />
              30 días por compresor
            </span>
            <span style={{ color: t.textFaint, fontSize: 12 }}>·</span>
            <span style={{ color: t.textSoft, fontSize: 12 }}>persist = false</span>
            <span style={{ color: t.textFaint, fontSize: 12 }}>·</span>
            <span style={{ color: t.textSoft, fontSize: 12 }}>3 solicitudes POST en paralelo</span>
          </div>
          <div
            style={{
              marginTop: 9,
              fontFamily: MONO,
              fontSize: 10.5,
              color: t.textFaint,
              overflowWrap: "anywhere",
            }}
          >
            {`${PREDICTION_API_BASE}/api/v1/forecasting/forecast/`}
          </div>
        </Panel>

        {COMPRESSORS.map((compressor, index) => (
          <CompressorSection
            key={compressor}
            compressor={compressor}
            state={states[compressor]}
            t={t}
            delay={0.05 + index * 0.1}
          />
        ))}
      </div>
    </>
  );
}
