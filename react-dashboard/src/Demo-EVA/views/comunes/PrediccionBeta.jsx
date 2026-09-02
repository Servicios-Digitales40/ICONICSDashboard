import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  Gauge,
  Search,
  Server,
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

import { AlertBanner, Button, Panel, SectionLabel } from "@/components/ui/index.js";
import { fieldStyle } from "@/components/ui/Input.jsx";
import {
  fetchEventHistory,
  fetchPredictionHealth,
  PREDICTION_API_BASE,
} from "@/lib/api/predictionApi.js";
import { useTheme } from "@/theme";
import { MONO, SANS } from "../../components/base.jsx";

const EVENTOS = [1, 2, 3, 4];
const HORAS_MAX = 168;

function statusMeta(status, t) {
  if (status === "ALERTA_PERSISTENTE") {
    return { label: "Alerta persistente", color: t.coral, bg: t.coralSoft, icon: <AlertCircle size={15} /> };
  }
  if (status === "VIGILANCIA") {
    return { label: "Vigilancia", color: t.amber, bg: t.amberSoft, icon: <AlertTriangle size={15} /> };
  }
  return { label: "Normal", color: t.success, bg: t.successSoft, icon: <CheckCircle2 size={15} /> };
}

function formatNumber(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

function booleanLabel(value) {
  return value ? "Sí" : "No";
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
      <div style={{ fontSize: 11, color: t.textFaint }}>{label} h antes del evento</div>
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
        <h3 style={{ margin: 0, color: t.text, fontFamily: SANS, fontSize: 16 }}>Consulta un evento histórico</h3>
        <p style={{ maxWidth: 440, margin: "8px auto 0", color: t.textFaint, fontSize: 12.5, lineHeight: 1.6 }}>
          Selecciona uno de los cuatro eventos documentados y cuántas horas anteriores deseas reproducir. El backend devolverá un estado por cada hora solicitada.
        </p>
      </div>
    </div>
  );
}

export default function PrediccionBeta() {
  const { theme: t } = useTheme();
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
      <SectionLabel sub="Reproducción histórica del modelo MetroPT-3 V4.4 mediante solicitudes POST">
        Predicción (Beta)
      </SectionLabel>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <AlertBanner type="error" title="No se pudo consultar la predicción" message={error} />
        </div>
      )}

      <div className="prediction-beta-grid">
        <Panel title="Consulta histórica" code="POST /api/v1/event-history/" delay={0}>
          <form onSubmit={consultar}>
            <div style={{ display: "grid", gap: 15 }}>
              <div>
                <FieldLabel t={t}>Evento de falla</FieldLabel>
                <select
                  value={eventId}
                  onChange={(e) => setEventId(Number(e.target.value))}
                  style={{ ...fieldStyle(t), height: 42, cursor: "pointer" }}
                >
                  {EVENTOS.map((id) => (
                    <option key={id} value={id}>Evento {id}</option>
                  ))}
                </select>
                <div style={{ marginTop: 5, fontSize: 10.5, color: t.textFaint }}>Eventos documentados disponibles: 1–4.</div>
              </div>

              <div>
                <FieldLabel t={t}>Horas previas al evento</FieldLabel>
                <input
                  type="number"
                  min="1"
                  max={HORAS_MAX}
                  step="1"
                  value={hoursBefore}
                  onChange={(e) => setHoursBefore(e.target.value)}
                  style={{ ...fieldStyle(t), height: 42 }}
                />
                <div style={{ marginTop: 5, fontSize: 10.5, color: t.textFaint }}>De 1 a 168 horas. Se devuelve un registro por hora.</div>
              </div>

              <Button type="submit" icon={<Search size={14} />} loading={loading}>
                Consultar predicción
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
              <InfoRow label="Evento" value={`#${data.event?.event_id ?? eventId}`} t={t} />
              <InfoRow label="Tipo" value={data.event?.failure_type ?? "—"} t={t} />
              <InfoRow label="Severidad" value={data.event?.severity ?? "—"} t={t} />
              <InfoRow label="Inicio del evento" value={formatDate(data.event?.event_timestamp)} t={t} />
              <InfoRow label="Puntos recibidos" value={`${timeline.length} / ${data.request?.expected_points ?? hoursBefore}`} t={t} mono />
            </div>
          )}
        </Panel>

        <Panel title="Estado de la máquina" code={selected ? `${selected.hours_to_event} h antes del evento` : "Selecciona una consulta"} delay={0.06}>
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
                  <div style={{ fontSize: 11, color: t.textFaint }}>Estado representativo de la hora</div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, color: selectedMeta.color, fontSize: 18, fontWeight: 800, fontFamily: SANS }}>
                    {selectedMeta.icon}
                    {selectedMeta.label}
                  </div>
                  <div style={{ marginTop: 7, color: t.textFaint, fontSize: 11.5 }}>{formatDate(selected.timestamp)}</div>
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
                <Kpi icon={<Gauge size={14} />} label="Índice de anomalía" value={`${formatNumber(selected.anomaly_index, 2)}`} sub="escala 0–100" t={t} color={selectedMeta.color} />
                <Kpi icon={<Activity size={14} />} label="Score raw" value={formatNumber(selected.raw_anomaly_score, 6)} sub="Isolation Forest" t={t} />
                <Kpi icon={<AlertTriangle size={14} />} label="Alerta instantánea" value={booleanLabel(selected.instant_alert)} sub={`umbral p${formatNumber(policy.instant_watch_threshold, 1)}`} t={t} color={selected.instant_alert ? t.amber : t.text} />
                <Kpi icon={<ShieldCheck size={14} />} label="Alerta persistente" value={booleanLabel(selected.persistent_alert)} sub={`${policy.required_windows ?? 6} ventanas / ${policy.window_hours ?? 1} h`} t={t} color={selected.persistent_alert ? t.coral : t.text} />
              </div>

              <div className="prediction-detail-grid" style={{ marginTop: 18 }}>
                <div>
                  <h4 style={{ margin: "0 0 8px", fontSize: 12.5, color: t.text, fontFamily: SANS }}>Política activa</h4>
                  <InfoRow label="Percentil persistente" value={`p${formatNumber(policy.percentile_threshold, 1)}`} t={t} mono />
                  <InfoRow label="Ventanas requeridas" value={policy.required_windows ?? "—"} t={t} mono />
                  <InfoRow label="Ventana temporal" value={`${policy.window_hours ?? "—"} h`} t={t} mono />
                  <InfoRow label="Calidad de datos" value={selected.data_quality ?? "—"} t={t} />
                  <InfoRow label="Ventanas observadas" value={selected.observed_windows_10m ?? "—"} t={t} mono />
                </div>

                <div>
                  <h4 style={{ margin: "0 0 8px", fontSize: 12.5, color: t.text, fontFamily: SANS }}>Principales desviaciones</h4>
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
                              actual {formatNumber(item.value, 3)} · baseline {formatNumber(item.baseline_median, 3)}
                            </div>
                          </div>
                          <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 750, color: t.accent }}>
                            {formatNumber(item.deviation_iqr, 3)} IQR
                          </span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: t.textFaint, fontSize: 11.5 }}>Sin desviaciones disponibles para este punto.</div>
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
          <SectionLabel sub="Cada punto representa la condición de mayor severidad observada dentro de esa hora">
            Evolución antes del evento
          </SectionLabel>

          <Panel delay={0.12}>
            <div className="prediction-summary-grid">
              <Kpi icon={<Clock3 size={14} />} label="Horas solicitadas" value={data.request?.hours_before ?? timeline.length} sub={`${timeline.length} estados devueltos`} t={t} />
              <Kpi icon={<CheckCircle2 size={14} />} label="Horas normales" value={counts.normal} sub="sin alerta persistente" t={t} color={t.success} />
              <Kpi icon={<AlertTriangle size={14} />} label="Horas en vigilancia" value={counts.watch} sub="desviación relevante" t={t} color={t.amber} />
              <Kpi icon={<AlertCircle size={14} />} label="Horas con alerta" value={counts.persistent} sub="política persistente activa" t={t} color={t.coral} />
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
                    label={{ value: "Horas antes del evento", position: "insideBottom", offset: -4, fill: t.textFaint, fontSize: 10 }}
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
              <span><strong style={{ color: t.amber }}>p{formatNumber(policy.percentile_threshold ?? 98.5, 1)}</strong> umbral base de persistencia</span>
              <span><strong style={{ color: t.coral }}>p{formatNumber(policy.instant_watch_threshold ?? 99, 1)}</strong> vigilancia instantánea</span>
              <span>Haz clic en la gráfica para inspeccionar esa hora.</span>
            </div>

            {timeline.length > 1 && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${t.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 7, fontSize: 11, color: t.textFaint }}>
                  <span>{timeline[0]?.hours_to_event} h antes</span>
                  <span style={{ color: selectedMeta?.color ?? t.textSoft, fontWeight: 700 }}>
                    {selectedMeta?.label ?? "—"} · {selected?.hours_to_event ?? "—"} h antes
                  </span>
                  <span>1 h antes</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={timeline.length - 1}
                  value={selectedIndex ?? 0}
                  onChange={(e) => setSelectedIndex(Number(e.target.value))}
                  style={{ width: "100%", accentColor: t.accent }}
                  aria-label="Seleccionar hora de la reproducción histórica"
                />
              </div>
            )}
          </Panel>

          <SectionLabel sub="Metadatos y advertencias entregados por el backend V4.4">
            Información técnica
          </SectionLabel>

          <div className="prediction-technical-grid">
            <Panel title="Modelo y evento" delay={0.18}>
              <InfoRow label="Modelo" value={data.model?.model_version ?? selected?.model_version ?? "—"} t={t} />
              <InfoRow label="Algoritmo" value={data.model?.algorithm ?? "—"} t={t} />
              <InfoRow label="Evento" value={`#${data.event?.event_id ?? "—"}`} t={t} mono />
              <InfoRow label="Tipo de falla" value={data.event?.failure_type ?? "—"} t={t} />
              <InfoRow label="Severidad" value={data.event?.severity ?? "—"} t={t} />
              <InfoRow label="Fecha del evento" value={formatDate(data.event?.event_timestamp)} t={t} />
              <InfoRow label="Fin documentado" value={formatDate(data.event?.event_end)} t={t} />
            </Panel>

            <Panel title="Calidad y metodología" delay={0.22}>
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
                      La consulta contiene {counts.gaps} hora(s) marcadas como GAP_HISTORICO. El backend conserva el último dato causal previo y no rellena con información futura.
                    </p>
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", color: t.textSoft, fontSize: 11.5, fontWeight: 650 }}>
              Ver respuesta JSON completa del backend
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
