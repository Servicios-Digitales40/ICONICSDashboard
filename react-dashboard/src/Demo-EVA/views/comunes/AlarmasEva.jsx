/**
 * Vista «Alarmas» — dos pestañas, dos fuentes que no se pueden confundir.
 *
 * ── LAS DOS PESTAÑAS SON DOS COSAS DISTINTAS, A PROPÓSITO ──────────
 *
 * «Historial» es el HISTORIAL de eventos de GENESIS64 (`GET
 * /api/iconics/alarms`, `eventId`/`startDate`) — la Fase 9 del Plan 13, sin
 * cambios desde entonces. Hasta el 10-09-2026 esta página ERA sólo eso, y su
 * cabecera decía, con razón, que no era un semáforo en vivo: no había nada en
 * vivo que mostrar.
 *
 * «En vivo» es nueva (Plan 27, tras historizar las alarmas del PLC en F6):
 * el estado AHORA MISMO de `naturaleza: "alarma"` en `senales.js`, leído
 * del mismo sistema que ya usa Planta (`useSistemaAgua`) — no pide nada
 * aparte al servidor. Es genuinamente un semáforo en vivo, pero de OTRA
 * fuente: un bit del PLC, no un evento configurado en el Alarm Server. Que
 * las dos vivan en la misma página bajo el mismo nombre es a propósito —el
 * usuario las llama "alarmas" a las dos, con razón—, pero mezclarlas en el
 * mismo cuerpo sería repetir el error que esta página ya evitó una vez. Por
 * eso son pestañas separadas y no una lista fusionada.
 *
 * `?tab=vivo&activo=<id>` abre ya en la pestaña «En vivo», filtrada a ese
 * activo — es el destino del indicador «N alarmas activas» de `TarjetaActivo`
 * (Planta) y `CabeceraActivo` (Detalle).
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDominio } from "@/i18n/useDominio.js";
import { useFormato } from "@/i18n/formato.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { CheckCheck, RefreshCw } from "lucide-react";

import { AlertBanner, Button, SectionLabel, Tabs } from "@/components/ui/index.js";
import { fetchHealth, acknowledgeIconicsAlarms } from "@/lib/iconics";
import { useTheme } from "@/theme";

import { estadoHistorial, HISTORIAL } from "../../data/comunes/estadoDelDato.js";
import { etiquetaDePunto, leerAlarmas, perteneceAlActivo } from "../../data/comunes/alarmas.js";
import { useSistemaAgua } from "../../data/comunes/hooks.js";
import { ACTIVO_IDS } from "../../domain/activos.js";
import { MONO, PuntoEstado } from "../../components/base.jsx";
import { estadoColor } from "../../components/paleta.js";

const VENTANAS = [
  { horas: 1, clave: "h1" },
  { horas: 6, clave: "h6" },
  { horas: 24, clave: "h24" },
  { horas: 48, clave: "h48" },
];

/** "2026-08-20 10:00:00" → algo legible. Si no parsea, se enseña tal cual llegó — nunca una fecha inventada. */
function fechaLegible(startDate, locale) {
  if (!startDate) return "—";
  const fecha = new Date(String(startDate).replace(" ", "T"));
  return Number.isNaN(fecha.getTime()) ? startDate : fecha.toLocaleString(locale);
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

/**
 * El chip de activo se comparte entre las dos pestañas —es el mismo filtro,
 * `activoFiltro`—, así que se declara una sola vez.
 */
function ChipsActivo({ activoFiltro, onElegir, t, traducir, activoTexto }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <ChipVentana t={t} activo={activoFiltro === ""} onClick={() => onElegir("")}>
        {traducir("alarms:allAssets")}
      </ChipVentana>
      {ACTIVO_IDS.map((id) => (
        <ChipVentana key={id} t={t} activo={activoFiltro === id} onClick={() => onElegir(id)}>
          {activoTexto(id, "corto")}
        </ChipVentana>
      ))}
    </div>
  );
}

function HistorialAlarmas({ activoFiltro, t }) {
  const mensajeDeError = useMensajeDeError();
  const { t: traducir } = useTranslation(["alarms", "errors"]);
  const { activo: activoTexto } = useDominio();
  const { locale } = useFormato();
  const [horas, setHoras] = useState(1);
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
      /*
       * Se guarda el ERROR entero, no su `.message`: aplanarlo aquí tiraba el
       * `codigo` que manda el puente y con él la única forma de traducir el fallo.
       * Quien lo pinta pasa por `useMensajeDeError`.
       */
      setError(e);
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
      setError(e);
    } finally {
      setReconociendo(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {VENTANAS.map((v) => (
            <ChipVentana key={v.horas} t={t} activo={horas === v.horas} onClick={() => setHoras(v.horas)}>
              {traducir(`alarms:windows.${v.clave}`)}
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
        <AlertBanner
          type="error"
          title={traducir("errors:titles.alarmHistoryFailed")}
          message={mensajeDeError(error).titulo}
          detalle={mensajeDeError(error).detalle}
        />
      ) : estado === HISTORIAL.CARGANDO ? (
        <p style={{ fontSize: 13, color: t.textFaint }}>{traducir("alarms:loading")}</p>
      ) : estado === HISTORIAL.SIN_DATO ? (
        <p style={{ fontSize: 13, color: t.textFaint }}>
          {activoFiltro ? traducir("alarms:emptyForAsset", { activo: activoTexto(activoFiltro, "corto") }) : traducir("alarms:empty")}
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
                    aria-label={traducir("selectEventAria", { id: a.eventId })}
                  />
                )}
                <span style={{ fontFamily: MONO, fontSize: 11, color: t.textFaint, minWidth: 150 }}>
                  {fechaLegible(a.startDate, locale)}
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

/**
 * Una fila de alarma: punto + severidad + estado booleano. Mismo léxico que
 * `FilaSenal` de Planta (`PuntoEstado` + `estadoColor` + `estadoTexto`), para
 * que "crítico" signifique lo mismo aquí que en cualquier otra pantalla.
 */
function FilaAlarma({ senal, dark, t }) {
  const { estado: estadoTexto, senal: senalTexto } = useDominio();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px" }}>
      <PuntoEstado color={estadoColor(dark, senal.estado)} size={7} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>{senalTexto(senal.key, "corto")}</div>
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: t.textFaint }}>{senal.tag}</div>
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: t.text }}>{senal.texto ?? "—"}</span>
      <span style={{ fontSize: 9.5, color: t.textFaint, width: 60, textAlign: "right" }}>
        {estadoTexto(senal.estado, "corto")}
      </span>
    </div>
  );
}

function EstadoAlarmasVivo({ activoFiltro, dark, t }) {
  const { t: traducir } = useTranslation("alarms");
  const { activo: activoTexto } = useDominio();
  const { sistema, loading } = useSistemaAgua();

  if (loading && !sistema.resumen?.medidas) {
    return <p style={{ fontSize: 13, color: t.textFaint }}>{traducir("vivo.loading")}</p>;
  }

  // `sistema.activos` es un arreglo (orden del catálogo), no un objeto por
  // id — ver `sistema.js`, `ACTIVO_IDS.map(createActivo)`.
  const activosAMostrar = activoFiltro
    ? sistema.activos.filter((a) => a.id === activoFiltro)
    : sistema.activos;

  return (
    <>
      <p style={{ fontSize: 12.5, color: t.textFaint, marginBottom: 14 }}>{traducir("vivo.sub")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {activosAMostrar.map((activo) => {
          const alarmas = activo.senales.filter((s) => s.naturaleza === "alarma");
          if (!alarmas.length) return null;
          return (
            <div key={activo.id} style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: t.hover }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>{activoTexto(activo.id, "corto")}</span>
                <span style={{ fontSize: 11, color: t.textFaint, marginLeft: "auto" }}>
                  {activo.alarmas.activas > 0
                    ? traducir("vivo.activas", { count: activo.alarmas.activas })
                    : traducir("vivo.sinAlarmas")}
                </span>
              </div>
              <div>
                {alarmas.map((senal) => (
                  <div key={senal.key} style={{ borderTop: `1px solid ${t.border}` }}>
                    <FilaAlarma senal={senal} dark={dark} t={t} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function AlarmasEva({ params, onNavigate }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("alarms");
  const { activo: activoTexto } = useDominio();
  const { theme: t, dark } = useTheme();
  const [tab, setTab] = useState(params?.tab === "vivo" ? "vivo" : "historial");
  const [activoFiltro, setActivoFiltro] = useState(params?.activo ?? "");

  // Un enlace nuevo (badge de otro activo, o volver atrás en el navegador)
  // llega como un rerender con `params` distintos, no como un montaje nuevo
  // — mismo criterio que el rango de `DetalleActivo`.
  useEffect(() => {
    if (params?.tab === "vivo") setTab("vivo");
    if (params?.activo) setActivoFiltro(params.activo);
  }, [params?.tab, params?.activo]);

  const cambiarTab = (siguiente) => {
    setTab(siguiente);
    onNavigate?.("eva-alarmas", activoFiltro ? { tab: siguiente, activo: activoFiltro } : { tab: siguiente });
  };

  const elegirActivo = (id) => {
    setActivoFiltro(id);
    onNavigate?.("eva-alarmas", id ? { tab, activo: id } : { tab });
  };

  return (
    <>
      <SectionLabel sub={traducir("alarms:sub")}>Alarmas</SectionLabel>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Tabs
          items={[
            { key: "historial", label: traducir("alarms:tabs.historial") },
            { key: "vivo", label: traducir("alarms:tabs.vivo") },
          ]}
          value={tab}
          onChange={cambiarTab}
        />
        <ChipsActivo activoFiltro={activoFiltro} onElegir={elegirActivo} t={t} traducir={traducir} activoTexto={activoTexto} />
      </div>

      {tab === "historial" ? (
        <HistorialAlarmas activoFiltro={activoFiltro} t={t} />
      ) : (
        <EstadoAlarmasVivo activoFiltro={activoFiltro} dark={dark} t={t} />
      )}
    </>
  );
}
