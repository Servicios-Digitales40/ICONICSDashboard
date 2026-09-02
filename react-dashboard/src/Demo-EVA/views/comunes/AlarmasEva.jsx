/**
 * Vista «Alarmas» — el HISTORIAL de eventos de la instalación, no un
 * semáforo de alarmas activas. Ver la cabecera de `data/alarmas.js` para
 * por qué esa distinción no es un matiz: prometer un semáforo en vivo con
 * un historial detrás sería el tipo de mentira que este tablero evita en
 * todo lo demás.
 *
 * Es la Fase 9 del Plan 13, y la única de las nueve con una dependencia
 * fuera del frontend: la forma exacta de un evento la decide GENESIS64, y
 * este repositorio sólo tiene confirmados `eventId` y `startDate`
 * (`scripts/verificar-backend.mjs`). El resto de columnas se rellena con lo
 * que aparezca, y se calla si no aparece nada — nunca inventa un dato.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCheck, RefreshCw } from "lucide-react";

import { AlertBanner, Button, SectionLabel } from "@/components/ui/index.js";
import { fetchHealth, acknowledgeIconicsAlarms } from "@/lib/iconics";
import { useTheme } from "@/theme";

import { estadoHistorial, HISTORIAL } from "../../data/estadoDelDato.js";
import { etiquetaDePunto, leerAlarmas, perteneceAlActivo } from "../../data/alarmas.js";
import { ACTIVOS, ACTIVO_IDS } from "../../domain/activos.js";
import { MONO } from "../../components/base.jsx";

const VENTANAS = [
  { horas: 1, label: "Última hora" },
  { horas: 6, label: "6 horas" },
  { horas: 24, label: "24 horas" },
  { horas: 48, label: "48 horas" },
];

/** "2026-08-20 10:00:00" → algo legible. Si no parsea, se enseña tal cual llegó — nunca una fecha inventada. */
function fechaLegible(startDate) {
  if (!startDate) return "—";
  const fecha = new Date(String(startDate).replace(" ", "T"));
  return Number.isNaN(fecha.getTime()) ? startDate : fecha.toLocaleString("es-MX");
}

function ChipVentana({ activo, onClick, t, children }) {
  return (
    <button
      type="button" aria-pressed={activo} onClick={onClick}
      style={{
        padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
        border: `1px solid ${activo ? t.accent : t.border}`,
        background: activo ? t.accentSoft : "transparent",
        color: activo ? t.accent : t.textSoft,
        cursor: "pointer", fontFamily: "'Inter', sans-serif",
      }}
    >
      {children}
    </button>
  );
}

export default function AlarmasEva() {
  const { theme: t } = useTheme();
  const [horas, setHoras] = useState(1);
  const [activoFiltro, setActivoFiltro] = useState("");
  const [alarmas, setAlarmas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // `true` hasta que /api/health confirme lo contrario: es el lado seguro,
  // el mismo criterio que el propio backend usa para ICONICS_READ_ONLY.
  const [readOnly, setReadOnly] = useState(true);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [reconociendo, setReconociendo] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAlarmas(await leerAlarmas(horas));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [horas]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    let vivo = true;
    fetchHealth()
      .then((h) => vivo && setReadOnly(Boolean(h.readOnly)))
      .catch(() => {}); // sin respuesta, se queda en `true`: el lado seguro.
    return () => {
      vivo = false;
    };
  }, []);

  const filtradas = alarmas
    .filter((a) => perteneceAlActivo(a, activoFiltro))
    .slice()
    .sort((a, b) => String(b.startDate ?? "").localeCompare(String(a.startDate ?? "")));

  const estado = estadoHistorial({ error, loading, datos: filtradas, minimo: 1 });

  function alternarSeleccion(eventId) {
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(eventId)) siguiente.delete(eventId);
      else siguiente.add(eventId);
      return siguiente;
    });
  }

  async function reconocer() {
    if (seleccion.size === 0) return;
    setReconociendo(true);
    try {
      await acknowledgeIconicsAlarms([...seleccion]);
      setSeleccion(new Set());
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setReconociendo(false);
    }
  }

  return (
    <>
      <SectionLabel sub="El historial de eventos de la instalación — no un semáforo de alarmas activas">
        Alarmas
      </SectionLabel>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {VENTANAS.map((v) => (
            <ChipVentana key={v.horas} t={t} activo={horas === v.horas} onClick={() => setHoras(v.horas)}>
              {v.label}
            </ChipVentana>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <ChipVentana t={t} activo={activoFiltro === ""} onClick={() => setActivoFiltro("")}>
            Todos los activos
          </ChipVentana>
          {ACTIVO_IDS.map((id) => (
            <ChipVentana key={id} t={t} activo={activoFiltro === id} onClick={() => setActivoFiltro(id)}>
              {ACTIVOS[id].corto}
            </ChipVentana>
          ))}
        </div>

        <Button variant="ghost" icon={<RefreshCw size={13} />} onClick={cargar} loading={loading}>
          Actualizar
        </Button>

        {!readOnly && (
          // `primary` (azul) y no `success` (verde): la *Regla del Color con
          // Significado* reserva verde para una señal en banda, no para un
          // botón de acción. Azul es su única excepción — "lo accionable".
          <Button
            variant="primary" icon={<CheckCheck size={13} />}
            onClick={reconocer} loading={reconociendo}
          >
            Reconocer {seleccion.size > 0 ? `(${seleccion.size})` : ""}
          </Button>
        )}
      </div>

      {estado === HISTORIAL.SIN_CONEXION ? (
        <AlertBanner type="error" title="No se pudo leer el historial de alarmas" message={error} />
      ) : estado === HISTORIAL.CARGANDO ? (
        <p style={{ fontSize: 13, color: t.textFaint }}>Consultando el historial de alarmas…</p>
      ) : estado === HISTORIAL.SIN_DATO ? (
        <p style={{ fontSize: 13, color: t.textFaint }}>
          Sin eventos en esta ventana{activoFiltro ? ` para ${ACTIVOS[activoFiltro].corto}` : ""}.
        </p>
      ) : (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: "hidden" }}>
          {filtradas.map((a) => {
            const punto = etiquetaDePunto(a);
            return (
              <div
                key={a.eventId}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "9px 14px",
                  borderTop: `1px solid ${t.border}`, fontSize: 12.5, color: t.text,
                }}
              >
                {!readOnly && (
                  <input
                    type="checkbox"
                    checked={seleccion.has(a.eventId)}
                    onChange={() => alternarSeleccion(a.eventId)}
                    aria-label={`Seleccionar evento ${a.eventId}`}
                  />
                )}
                <span style={{ fontFamily: MONO, fontSize: 11, color: t.textFaint, minWidth: 150 }}>
                  {fechaLegible(a.startDate)}
                </span>
                <span style={{ minWidth: 90, color: t.textSoft }}>{punto ?? "—"}</span>
                <span style={{ flex: 1, fontFamily: MONO, fontSize: 11, color: t.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.eventId}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
