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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** Cuánto dura la petición de confirmar el acuse. El mismo que `ControlesTanque`. */
const VENTANA_CONFIRMACION_MS = 4000;

/**
 * Los eventos que este operador ya ha visto, entre visitas a la pantalla
 * (Plan 24 F5 · `USO-05`).
 *
 * ── POR QUÉ `localStorage` Y NO EL SERVIDOR ────────────────────────
 *
 * Porque «leído» y «reconocido» son dos cosas distintas y confundirlas sería
 * grave. El ACUSE es un hecho de la instalación: viaja al Alarm Server, queda
 * con nombre y lo ven todos. El «leído» es una conveniencia de ESTA pantalla
 * para esta persona —qué ha mirado ya— y mandarlo al servidor lo convertiría en
 * una afirmación sobre el turno que nadie ha hecho.
 *
 * Por eso vive en el navegador, es por dispositivo, y se pierde al limpiar el
 * almacenamiento — todo aceptable para lo que es. Lo que NO puede pasar es que
 * un fallo al leerlo tire la vista: en un kiosco con el almacenamiento
 * bloqueado, `localStorage` lanza al tocarlo.
 */
const CLAVE_VISTOS = "eva:alarmas:vistos";

function leerVistos() {
  try {
    const crudo = globalThis.localStorage?.getItem(CLAVE_VISTOS);
    const lista = crudo ? JSON.parse(crudo) : [];
    return new Set(Array.isArray(lista) ? lista : []);
  } catch {
    // Sin memoria de lo leído se ve todo como nuevo, que es el lado seguro:
    // enseña de más, nunca de menos.
    return new Set();
  }
}

function guardarVistos(vistos) {
  try {
    /*
     * Se guardan como máximo los últimos 500. Sin tope, la lista crece con cada
     * evento de la planta para siempre — y lo que importa es no volver a marcar
     * como nuevo algo de esta semana, no llevar el registro de un año.
     */
    const lista = [...vistos].slice(-500);
    globalThis.localStorage?.setItem(CLAVE_VISTOS, JSON.stringify(lista));
  } catch {
    // Un kiosco con el almacenamiento bloqueado sigue funcionando: pierde la
    // memoria de lo leído, no la pantalla.
  }
}

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
  const [confirmando, setConfirmando] = useState(false);
  const timeoutConfirmar = useRef(null);

  /*
   * Lo ya visto por esta persona en este dispositivo, LEÍDO UNA VEZ al montar.
   * Ver `CLAVE_VISTOS`.
   *
   * Es una instantánea a propósito y por eso no tiene setter: si se actualizara,
   * las filas se marcarían como leídas delante de quien las está mirando y el
   * indicador desaparecería en el mismo render que lo enseñó. La memoria se
   * escribe en el efecto de abajo; lo que se VE no cambia hasta la siguiente
   * visita — que es exactamente lo que hace útil una bandeja. `useState` con
   * inicializador perezoso y sin setter es la forma de decir «esto se calcula al
   * montar y ya»; un `useRef` haría lo mismo pero se leería como estado mutable.
   */
  const [vistos] = useState(leerVistos);

  // El temporizador de la confirmación no puede sobrevivir al desmontaje: sin
  // esto, salir de la pestaña deja un `setConfirmando` apuntando a un
  // componente que ya no existe. Mismo cuidado que `ControlesTanque`.
  useEffect(() => () => clearTimeout(timeoutConfirmar.current), []);

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

  /** Cuáles de las que se están viendo son NUEVAS. Ver la nota de `vistos`. */
  const nuevas = useMemo(
    () => filtradas.filter((a) => a.eventId != null && !vistos.has(String(a.eventId))),
    [filtradas, vistos]
  );

  /*
   * Al llegar una tanda del servidor, lo que se enseña queda marcado como
   * leído en el almacenamiento — no en el estado. Ver `nuevas`.
   */
  useEffect(() => {
    if (!filtradas.length) return;
    const ids = filtradas.map((a) => a.eventId).filter((id) => id != null).map(String);
    if (!ids.length) return;
    guardarVistos(new Set([...leerVistos(), ...ids]));
    // `filtradas` se recalcula en cada render (es un `.filter().sort()` suelto),
    // así que la dependencia real es su contenido: los ids concretos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas.map((a) => a.eventId).join(",")]);

  function alternarSeleccion(eventId) {
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(eventId)) siguiente.delete(eventId);
      else siguiente.add(eventId);
      return siguiente;
    });
  }

  /**
   * Reconocer, con confirmación de dos pasos (Plan 24 F5 · `USO-05`).
   *
   * ── POR QUÉ ESTO NECESITA CONFIRMARSE ──────────────────────────────
   *
   * Porque es una acción SOBRE LA INSTALACIÓN, no sobre el tablero: el acuse
   * viaja al Alarm Server de ICONICS y allí queda, con el nombre de quien lo
   * hizo. No se deshace desde aquí, y un acuse en masa —la casilla de cabecera
   * selecciona la ventana entera— puede tapar de una vez un aviso que nadie ha
   * leído todavía.
   *
   * Mismo patrón de dos pasos que `ControlesTanque` (Plan 13): el primer clic
   * pide confirmar, un segundo dentro de la ventana ejecuta, y cualquier otra
   * cosa cancela. Se copia ese patrón y no se monta un modal por el motivo que
   * esa vista ya argumentó —no hay `ConfirmDialog` en el proyecto y crear uno
   * para dos botones sería sobre-ingeniería—, y además aquí el modal taparía la
   * lista de lo que se está a punto de reconocer, que es justo lo que hay que
   * seguir viendo mientras se decide.
   */
  function pedirReconocer() {
    if (seleccion.size === 0) return;
    if (confirmando) {
      reconocer();
      return;
    }
    setConfirmando(true);
    clearTimeout(timeoutConfirmar.current);
    timeoutConfirmar.current = setTimeout(() => setConfirmando(false), VENTANA_CONFIRMACION_MS);
  }

  async function reconocer() {
    clearTimeout(timeoutConfirmar.current);
    setConfirmando(false);
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

        {/* «Actualizar» estaba escrito a mano, y es el ejemplo LITERAL que la
            cabecera de `verificar-textos.mjs` nombra como su hueco conocido
            («"Actualizar" sola pasa»). Entra en el diccionario, y su verbo en
            `VERBOS_UI` para que el guion lo cace la próxima vez. */}
        <Button variant="ghost" icon={<RefreshCw size={13} />} onClick={cargar} loading={loading}>
          {traducir("common:refresh")}
        </Button>

        {/*
         * Cuántas de las que se ven son nuevas para esta persona (Plan 24 F5).
         * Sólo si hay alguna: un «0 sin leer» permanente es ruido que enseña a
         * no mirar la fila, el mismo criterio que el contador de recortados de
         * Documentación en F2.
         */}
        {nuevas.length > 0 && (
          <span
            style={{
              fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "3px 9px",
              borderRadius: 999, background: t.accentSoft, color: t.accent,
              border: `1px solid ${t.accent}33`,
            }}
          >
            {traducir("alarms:unreadBadge", { count: nuevas.length })}
          </span>
        )}

        {!readOnly && (
          // `primary` (azul) y no `success` (verde): la *Regla del Color con
          // Significado* reserva verde para una señal en banda, no para un
          // botón de acción. Azul es su única excepción — "lo accionable".
          /* El texto estaba escrito a mano en español —«Reconocer»— y se colaba
             por el hueco que `verificar-textos.mjs` documenta en su cabecera:
             una palabra suelta, sin tilde, sin partícula ni verbo de sus listas.
             Ahora pasa por el diccionario, y «reconocer» entra en `VERBOS_UI`
             para cerrar ese hueco. */
          <Button
            variant="primary" icon={<CheckCheck size={13} />}
            onClick={pedirReconocer} loading={reconociendo}
          >
            {confirmando
              ? traducir("alarms:ack.confirm")
              : seleccion.size > 0
                ? traducir("alarms:ack.actionCount", { count: seleccion.size })
                : traducir("alarms:ack.action")}
          </Button>
        )}
      </div>

      {estado === HISTORIAL.SIN_CONEXION ? (
        <AlertBanner
          type="error"
          title={traducir("errors:titles.alarmHistoryFailed")}
          message={mensajeDeError(error).titulo}
          detalle={mensajeDeError(error).detalle}
          accion={mensajeDeError(error).accion}
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
