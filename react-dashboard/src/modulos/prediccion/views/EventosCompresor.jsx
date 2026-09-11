/**
 * Reproducción histórica de un evento del compresor, contra el backend
 * predictivo. La única pantalla de este módulo que hoy trae dato real.
 *
 * ── POR QUÉ VIVE AQUÍ Y NO EN `Demo-EVA/` ───────────────────────────
 *
 * Hasta el 03-09-2026 estaba en `Demo-EVA/views/comunes/`, la carpeta que
 * `CLAUDE.md` §3 define como «todo lo que sabe de las dos máquinas de
 * planta». Esta pantalla no sabe de ninguna de las dos: consulta OTRO
 * backend, con el histórico de un compresor real que no leemos por ICONICS.
 *
 * Esa mudanza no es de orden. `CLAUDE.md` §2.1 permite una segunda fuente de
 * datos sólo si el módulo que la usa está separado y no mezcla su dato con el
 * de planta. Mientras el archivo viviera dentro de `Demo-EVA/`, esa
 * separación era una intención, no una estructura.
 *
 * Ver `docs/por-completar/PLAN-19-MODULARIZACION.md` F2.
 */
/* Carga el diccionario de este modulo. Ver `modulos/prediccion/i18n.js`. */
import "../i18n.js";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  Search,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useTranslation } from "react-i18next";

import { AlertBanner, Button, Panel, SectionLabel } from "@/components/ui/index.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { fieldStyle } from "@/components/ui/Input.jsx";
import { useFormato } from "@/i18n/formato.js";
import {
  fetchEventHistory,
  fetchPredictionHealth,
  PREDICTION_API_BASE,
} from "../data/predictionApi.js";
import { useTheme } from "@/theme";
/*
 * DEUDA CONOCIDA: `MONO`/`SANS` son tipografía de toda la aplicación, pero
 * viven en `Demo-EVA/components/base.jsx` por razones históricas — hasta el
 * punto de que el kit genérico (`components/ui/Panel.jsx`) también las importa
 * de ahí. Es el único hilo que queda entre este módulo y Demo-EVA, y es de
 * presentación, no de datos: no cruza ninguna fuente. Su sitio natural es
 * `@/theme`, y moverlas toca quince archivos, así que va por su cuenta
 * (docs/BACKLOG-FRONTEND.md).
 */
import { MONO, SANS } from "@/Demo-EVA/components/base.jsx";

const EVENTOS = [1, 2, 3, 4];
const HORAS_MAX = 168;

/*
 * El aspecto de un estado. Devuelve la CLAVE y no el rótulo: es una función
 * pura y no puede llamar a un hook, igual que `aspectoDe` en Salud o
 * `estadoDeFila` en Documentación. El estado lo decide aquí; cómo se escribe,
 * `prediction:events.status`.
 *
 * Los IDS (`ALERTA_PERSISTENTE`, `VIGILANCIA`) los manda el backend V4.4 y no
 * se traducen: son el contrato.
 */
function statusMeta(status, t) {
  if (status === "ALERTA_PERSISTENTE") {
    return { clave: "ALERTA_PERSISTENTE", color: t.coral, bg: t.coralSoft, icon: <AlertCircle size={15} /> };
  }
  if (status === "VIGILANCIA") {
    return { clave: "VIGILANCIA", color: t.amber, bg: t.amberSoft, icon: <AlertTriangle size={15} /> };
  }
  return { clave: "NORMAL", color: t.success, bg: t.successSoft, icon: <CheckCircle2 size={15} /> };
}

function formatNumber(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

/*
 * La fecha se formatea con el locale del idioma activo, no con `es-MX` fijo:
 * un tablero en inglés enseñaba el mes en español. Recibe el formateador
 * porque esto no es un componente y no puede pedirlo por su cuenta.
 */
function formatDate(value, fechaHora) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return fechaHora(d);
}

function FieldLabel({ children, t }) {
  return (
    <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: t.textSoft, marginBottom: 6 }}>
      {children}
    </label>
  );
}

function InfoRow({ label, value, t, mono = false, valueColor }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(135px, 0.8fr) minmax(0, 1.2fr)",
        gap: 14,
        alignItems: "baseline",
        padding: "9px 0",
        borderBottom: `1px solid ${t.border}`,
      }}
    >
      <span style={{ color: t.textFaint, fontSize: 11.5 }}>{label}</span>
      <span
        style={{
          color: valueColor || t.text,
          fontSize: 12.5,
          fontWeight: 650,
          textAlign: "right",
          fontFamily: mono ? MONO : "'Inter', sans-serif",
          overflowWrap: "anywhere",
        }}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

function Kpi({ icon, label, value, sub, t, color }) {
  return (
    <div
      style={{
        minWidth: 0,
        background: t.hover,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: t.textFaint, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7 }}>
        <span style={{ color: color || t.accent, display: "flex" }}>{icon}</span>
        {label}
      </div>
      <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 21, fontWeight: 750, color: color || t.text }}>{value}</div>
      {sub && <div style={{ marginTop: 4, color: t.textFaint, fontSize: 10.5 }}>{sub}</div>}
    </div>
  );
}

function PredictionTooltip({ active, payload, label, t }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("prediction");
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const meta = statusMeta(point.status, t);

  return (
    <div
      style={{
        minWidth: 210,
        background: t.panel,
        border: `1px solid ${t.border}`,
        boxShadow: t.shadow,
        borderRadius: 11,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 11, color: t.textFaint }}>
        {traducir("panel.hoursBeforeEvent", { n: label })}
      </div>
      <div style={{ marginTop: 5, fontFamily: MONO, fontSize: 18, fontWeight: 750, color: t.text }}>
        {formatNumber(point.anomaly_index, 2)} / 100
      </div>
      <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 6, color: meta.color, fontSize: 11.5, fontWeight: 700 }}>
        {meta.icon} {meta.label}
      </div>
    </div>
  );
}

function EmptyState({ t }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("prediction");
  return (
    <div style={{ minHeight: 430, display: "grid", placeItems: "center", textAlign: "center", padding: 30 }}>
      <div>
        <div
          style={{
            width: 54,
            height: 54,
            margin: "0 auto 14px",
            borderRadius: 16,
            display: "grid",
            placeItems: "center",
            background: t.accentSoft,
            color: t.accent,
          }}
        >
          <Activity size={25} />
        </div>
        <h3 style={{ margin: 0, color: t.text, fontFamily: SANS, fontSize: 16 }}>
          {traducir("events.query.title")}
        </h3>
        <p style={{ maxWidth: 440, margin: "8px auto 0", color: t.textFaint, fontSize: 12.5, lineHeight: 1.6 }}>
          {traducir("events.query.sub")}
        </p>
      </div>
    </div>
  );
}

export default function EventosCompresor() {
  /* El código del puente elige la frase; el detalle va debajo. Ver `@/i18n`. */
  const mensajeDeError = useMensajeDeError();
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("prediction");
  const { fechaHora } = useFormato();
  const { theme: t } = useTheme();

  /** «Sí»/«No» del idioma activo. Antes era una función suelta en español. */
  const booleanLabel = (valor) => traducir(valor ? "events.yes" : "events.no");
  /** La fecha, ya con el locale puesto. */
  const fecha = (valor) => formatDate(valor, fechaHora);
  const [eventId, setEventId] = useState(1);
  const [hoursBefore, setHoursBefore] = useState(48);
  const [data, setData] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [error, setError] = useState("");

  /*
   * La comprobación de salud al montar era un `useEffect` con su propio
   * `AbortController` a mano — es exactamente lo que `useQuery` hace por
   * defecto: cancela sola al desmontar, y `queryFn` recibe el `signal` listo
   * para pasárselo a `fetchPredictionHealth`. `retry: false` sale del
   * `QueryClient` global (`lib/queryClient.js`): un solo intento, igual que
   * el `.catch()` de antes.
   */
  const health = useQuery({
    queryKey: ["prediction-health"],
    queryFn: ({ signal }) => fetchPredictionHealth({ signal }),
  });

  /*
   * `consultar()` puede ADEMÁS declarar la conexión recuperada o caída sin
   * esperar a que se repita la comprobación de arriba: si la consulta de
   * evento respondió, el backend está disponible, y si falló con una razón
   * de red, no lo está. Forzar el estado de la query de salud (en vez de
   * reintentarla) sería más código para el mismo resultado, así que el
   * criterio queda en esta única variable, calculada más abajo.
   */
  const [saludForzada, setSaludForzada] = useState(null);
  const healthState = saludForzada ?? (health.isLoading ? "checking" : health.isError ? "error" : "ok");

  const consulta = useMutation({ mutationFn: fetchEventHistory });
  const loading = consulta.isPending;

  const timeline = data?.timeline ?? [];
  const selected = selectedIndex == null ? null : timeline[selectedIndex] ?? null;
  const selectedMeta = selected ? statusMeta(selected.status, t) : null;
  const policy = selected?.policy ?? data?.model?.policy ?? {};

  const chartData = useMemo(
    () => timeline.map((p, index) => ({ ...p, _index: index })),
    [timeline]
  );

  const counts = useMemo(() => {
    const out = { normal: 0, watch: 0, persistent: 0, gaps: 0 };
    for (const p of timeline) {
      if (p.status === "ALERTA_PERSISTENTE") out.persistent += 1;
      else if (p.status === "VIGILANCIA") out.watch += 1;
      else out.normal += 1;
      if (p.data_quality === "GAP_HISTORICO") out.gaps += 1;
    }
    return out;
  }, [timeline]);

  function validateHours(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= HORAS_MAX;
  }

  function consultar(event) {
    event?.preventDefault?.();
    setError("");

    if (!validateHours(hoursBefore)) {
      setError(`Las horas previas deben ser un entero entre 1 y ${HORAS_MAX}.`);
      return;
    }

    consulta.mutate(
      { eventId, hoursBefore },
      {
        onSuccess: (response) => {
          setData(response);
          // Se empieza por la hora más lejana para que la lectura visual avance
          // naturalmente hacia el evento. El usuario puede mover el selector o
          // hacer clic en la gráfica para ver cualquier punto.
          setSelectedIndex(0);
          setSaludForzada("ok");
        },
        onError: (e) => {
          setData(null);
          setSelectedIndex(null);
          setError(e.message || "No se pudo consultar el backend predictivo.");
          setSaludForzada("error");
        },
      }
    );
  }

  function selectFromChart(state) {
    const point = state?.activePayload?.[0]?.payload;
    if (Number.isInteger(point?._index)) setSelectedIndex(point._index);
  }

  return (
    <>
      <SectionLabel sub={traducir("events.beta.sub")}>
        {traducir("events.beta.title")}
      </SectionLabel>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <AlertBanner
            type="error"
            title={traducir("events.query.failed")}
            message={mensajeDeError(error).titulo}
            detalle={mensajeDeError(error).detalle}
          />
        </div>
      )}

      <div className="prediction-beta-grid">
        <Panel title={traducir("events.query.label")} code="POST /api/v1/event-history/" delay={0}>
          <form onSubmit={consultar}>
            <div style={{ display: "grid", gap: 15 }}>
              <div>
                <FieldLabel t={t}>{traducir("events.form.event")}</FieldLabel>
                <select
                  value={eventId}
                  onChange={(e) => setEventId(Number(e.target.value))}
                  style={{ ...fieldStyle(t), height: 42, cursor: "pointer" }}
                >
                  {EVENTOS.map((id) => (
                    <option key={id} value={id}>{traducir("events.form.eventN", { n: id })}</option>
                  ))}
                </select>
                <div style={{ marginTop: 5, fontSize: 10.5, color: t.textFaint }}>
                  {traducir("events.form.eventsAvailable")}
                </div>
              </div>

              <div>
                <FieldLabel t={t}>{traducir("events.form.hoursBefore")}</FieldLabel>
                <input
                  type="number"
                  min="1"
                  max={HORAS_MAX}
                  step="1"
                  value={hoursBefore}
                  onChange={(e) => setHoursBefore(e.target.value)}
                  style={{ ...fieldStyle(t), height: 42 }}
                />
                <div style={{ marginTop: 5, fontSize: 10.5, color: t.textFaint }}>
                  {traducir("events.query.hoursHint")}
                </div>
              </div>

              <Button type="submit" icon={<Search size={14} />} loading={loading}>
                {traducir("events.query.submit")}
              </Button>
            </div>
          </form>

          <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${t.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: t.textFaint }}>Backend MetroPT-3</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 999,
                  padding: "5px 8px",
                  fontSize: 10.5,
                  fontWeight: 700,
                  background: healthState === "ok" ? t.successSoft : healthState === "checking" ? t.hover : t.coralSoft,
                  color: healthState === "ok" ? t.success : healthState === "checking" ? t.textFaint : t.coral,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                {healthState === "ok" ? "Disponible" : healthState === "checking" ? "Comprobando" : "Sin conexión"}
              </span>
            </div>
            <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 10.5, color: t.textFaint, overflowWrap: "anywhere" }}>
              {PREDICTION_API_BASE}
            </div>
          </div>

          {data && (
            <div style={{ marginTop: 18 }}>
              <InfoRow label={traducir("events.row.event")} value={`#${data.event?.event_id ?? eventId}`} t={t} />
              <InfoRow label={traducir("events.row.type")} value={data.event?.failure_type ?? "—"} t={t} />
              <InfoRow label={traducir("events.row.severity")} value={data.event?.severity ?? "—"} t={t} />
              <InfoRow label={traducir("events.row.eventStart")} value={fecha(data.event?.event_timestamp)} t={t} />
              <InfoRow label={traducir("events.row.pointsReceived")} value={`${timeline.length} / ${data.request?.expected_points ?? hoursBefore}`} t={t} mono />
            </div>
          )}
        </Panel>

        <Panel
          title={traducir("events.machineState")}
          code={selected
            ? traducir("events.panel.hoursBeforeEvent", { n: selected.hours_to_event })
            : traducir("events.panel.pickQuery")}
          delay={0.06}
        >
          {!selected ? (
            <EmptyState t={t} />
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                  paddingBottom: 16,
                  borderBottom: `1px solid ${t.border}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: t.textFaint }}>{traducir("events.hourState")}</div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, color: selectedMeta.color, fontSize: 18, fontWeight: 800, fontFamily: SANS }}>
                    {selectedMeta.icon}
                    {traducir(`events.status.${selectedMeta.clave}`)}
                  </div>
                  <div style={{ marginTop: 7, color: t.textFaint, fontSize: 11.5 }}>{fecha(selected.timestamp)}</div>
                </div>
                <div
                  style={{
                    borderRadius: 999,
                    padding: "7px 10px",
                    background: selectedMeta.bg,
                    color: selectedMeta.color,
                    fontFamily: MONO,
                    fontSize: 11,
                    fontWeight: 750,
                  }}
                >
                  -{selected.hours_to_event} h
                </div>
              </div>

              <div className="prediction-kpi-grid" style={{ marginTop: 16 }}>
                {/* «Isolation Forest» es el nombre del algoritmo: no se traduce. */}
                <Kpi icon={<Gauge size={14} />} label={traducir("events.anomalyIndex")} value={`${formatNumber(selected.anomaly_index, 2)}`} sub={traducir("events.kpi.anomalyScale")} t={t} color={selectedMeta.color} />
                <Kpi icon={<Activity size={14} />} label={traducir("events.kpi.rawScore")} value={formatNumber(selected.raw_anomaly_score, 6)} sub="Isolation Forest" t={t} />
                <Kpi icon={<AlertTriangle size={14} />} label={traducir("events.instantAlert")} value={booleanLabel(selected.instant_alert)} sub={traducir("events.kpi.instantThreshold", { valor: formatNumber(policy.instant_watch_threshold, 1) })} t={t} color={selected.instant_alert ? t.amber : t.text} />
                <Kpi icon={<ShieldCheck size={14} />} label={traducir("events.kpi.persistentAlert")} value={booleanLabel(selected.persistent_alert)} sub={traducir("events.kpi.persistentSub", { ventanas: policy.required_windows ?? 6, horas: policy.window_hours ?? 1 })} t={t} color={selected.persistent_alert ? t.coral : t.text} />
              </div>

              <div className="prediction-detail-grid" style={{ marginTop: 18 }}>
                <div>
                  <h4 style={{ margin: "0 0 8px", fontSize: 12.5, color: t.text, fontFamily: SANS }}>
                    {traducir("events.activePolicy")}
                  </h4>
                  <InfoRow label={traducir("events.row.persistentPercentile")} value={`p${formatNumber(policy.percentile_threshold, 1)}`} t={t} mono />
                  <InfoRow label={traducir("events.row.requiredWindows")} value={policy.required_windows ?? "—"} t={t} mono />
                  <InfoRow label={traducir("events.row.timeWindow")} value={`${policy.window_hours ?? "—"} h`} t={t} mono />
                  <InfoRow label={traducir("events.row.dataQuality")} value={selected.data_quality ?? "—"} t={t} />
                  <InfoRow label={traducir("events.row.observedWindows")} value={selected.observed_windows_10m ?? "—"} t={t} mono />
                </div>

                <div>
                  <h4 style={{ margin: "0 0 8px", fontSize: 12.5, color: t.text, fontFamily: SANS }}>
                    {traducir("events.panel.deviations")}
                  </h4>
                  <div style={{ display: "grid", gap: 8 }}>
                    {(selected.top_deviations ?? []).length ? (
                      selected.top_deviations.map((item, index) => (
                        <div
                          key={`${item.sensor}-${index}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            gap: 12,
                            alignItems: "center",
                            padding: "9px 10px",
                            borderRadius: 10,
                            background: t.hover,
                            border: `1px solid ${t.border}`,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: t.text, overflow: "hidden", textOverflow: "ellipsis" }}>{item.sensor}</div>
                            <div style={{ marginTop: 3, fontSize: 10, color: t.textFaint }}>
                              {traducir("events.deviation.current", {
                                valor: formatNumber(item.value, 3),
                                baseline: formatNumber(item.baseline_median, 3),
                              })}
                            </div>
                          </div>
                          <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 750, color: t.accent }}>
                            {traducir("events.deviation.iqr", { valor: formatNumber(item.deviation_iqr, 3) })}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: t.textFaint, fontSize: 11.5 }}>
                        {traducir("events.noDeviations")}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>

      {data && (
        <>
          <SectionLabel sub={traducir("events.trend.sub")}>
            {traducir("events.trend.title")}
          </SectionLabel>

          <Panel delay={0.12}>
            <div className="prediction-summary-grid">
              <Kpi icon={<Clock3 size={14} />} label={traducir("events.kpi.hoursRequested")} value={data.request?.hours_before ?? timeline.length} sub={traducir("events.kpi.statesReturned", { n: timeline.length })} t={t} />
              <Kpi icon={<CheckCircle2 size={14} />} label={traducir("events.kpi.normalHours")} value={counts.normal} sub={traducir("events.kpi.noPersistentAlert")} t={t} color={t.success} />
              <Kpi icon={<AlertTriangle size={14} />} label={traducir("events.kpi.watchHours")} value={counts.watch} sub={traducir("events.trend.relevantDeviation")} t={t} color={t.amber} />
              <Kpi icon={<AlertCircle size={14} />} label={traducir("events.kpi.alertHours")} value={counts.persistent} sub={traducir("events.trend.persistentPolicy")} t={t} color={t.coral} />
            </div>

            <div style={{ height: 330, marginTop: 22 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 18, bottom: 10, left: 2 }} onClick={selectFromChart}>
                  <CartesianGrid stroke={t.grid} strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="hours_to_event"
                    stroke={t.textFaint}
                    tick={{ fill: t.textFaint, fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: t.border }}
                    minTickGap={28}
                    label={{ value: traducir("events.chart.xAxis"), position: "insideBottom", offset: -4, fill: t.textFaint, fontSize: 10 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke={t.textFaint}
                    tick={{ fill: t.textFaint, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={34}
                  />
                  <Tooltip content={<PredictionTooltip t={t} />} />
                  <ReferenceLine y={Number(policy.percentile_threshold ?? 98.5)} stroke={t.amber} strokeDasharray="5 5" />
                  <ReferenceLine y={Number(policy.instant_watch_threshold ?? 99)} stroke={t.coral} strokeDasharray="3 5" />
                  <Line
                    type="monotone"
                    dataKey="anomaly_index"
                    stroke={t.accent}
                    strokeWidth={2.2}
                    dot={{ r: 2.4, fill: t.accent, stroke: t.panel, strokeWidth: 1.2 }}
                    activeDot={{ r: 5, fill: t.accent, stroke: t.panel, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8, fontSize: 10.5, color: t.textFaint }}>
              <span>
                <strong style={{ color: t.amber }}>p{formatNumber(policy.percentile_threshold ?? 98.5, 1)}</strong>{" "}
                {traducir("events.chart.baseThreshold")}
              </span>
              <span>
                <strong style={{ color: t.coral }}>p{formatNumber(policy.instant_watch_threshold ?? 99, 1)}</strong>{" "}
                {traducir("events.trend.instantWatch")}
              </span>
              <span>{traducir("events.trend.clickHint")}</span>
            </div>

            {timeline.length > 1 && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${t.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 7, fontSize: 11, color: t.textFaint }}>
                  <span>{traducir("events.chart.hoursBefore", { n: timeline[0]?.hours_to_event })}</span>
                  <span style={{ color: selectedMeta?.color ?? t.textSoft, fontWeight: 700 }}>
                    {traducir("events.chart.selectedAt", {
                      estado: selectedMeta ? traducir(`events.status.${selectedMeta.clave}`) : "—",
                      horas: selected?.hours_to_event ?? "—",
                    })}
                  </span>
                  <span>{traducir("events.chart.oneHourBefore")}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={timeline.length - 1}
                  value={selectedIndex ?? 0}
                  onChange={(e) => setSelectedIndex(Number(e.target.value))}
                  style={{ width: "100%", accentColor: t.accent }}
                  aria-label={traducir("events.trend.pickHour")}
                />
              </div>
            )}
          </Panel>

          <SectionLabel sub={traducir("events.technical.sub")}>
            {traducir("events.technical.title")}
          </SectionLabel>

          <div className="prediction-technical-grid">
            <Panel title={traducir("events.panel.modelAndEvent")} delay={0.18}>
              <InfoRow label={traducir("events.row.model")} value={data.model?.model_version ?? selected?.model_version ?? "—"} t={t} />
              <InfoRow label={traducir("events.row.algorithm")} value={data.model?.algorithm ?? "—"} t={t} />
              <InfoRow label={traducir("events.row.event")} value={`#${data.event?.event_id ?? "—"}`} t={t} mono />
              <InfoRow label={traducir("events.row.failureType")} value={data.event?.failure_type ?? "—"} t={t} />
              <InfoRow label={traducir("events.row.severity")} value={data.event?.severity ?? "—"} t={t} />
              <InfoRow label={traducir("events.row.eventDate")} value={fecha(data.event?.event_timestamp)} t={t} />
              <InfoRow label={traducir("events.row.documentedEnd")} value={fecha(data.event?.event_end)} t={t} />
            </Panel>

            <Panel title={traducir("events.technical.quality")} delay={0.22}>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                  <Database size={16} color={t.accent} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ margin: 0, color: t.textSoft, fontSize: 11.5, lineHeight: 1.55 }}>{data.methodological_note}</p>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                  <AlertTriangle size={16} color={t.amber} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ margin: 0, color: t.textSoft, fontSize: 11.5, lineHeight: 1.55 }}>{data.warning}</p>
                </div>
                {counts.gaps > 0 && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                    <TimerReset size={16} color={t.coral} style={{ flexShrink: 0, marginTop: 2 }} />
                    <p style={{ margin: 0, color: t.textSoft, fontSize: 11.5, lineHeight: 1.55 }}>
                      {traducir("events.gaps", { n: counts.gaps })}
                    </p>
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", color: t.textSoft, fontSize: 11.5, fontWeight: 650 }}>
              {traducir("events.rawJson")}
            </summary>
            <pre
              className="scrollbar-thin"
              style={{
                marginTop: 10,
                maxHeight: 420,
                overflow: "auto",
                padding: 14,
                borderRadius: 12,
                border: `1px solid ${t.border}`,
                background: t.panel,
                color: t.textSoft,
                fontFamily: MONO,
                fontSize: 10.5,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </>
      )}
    </>
  );
}
