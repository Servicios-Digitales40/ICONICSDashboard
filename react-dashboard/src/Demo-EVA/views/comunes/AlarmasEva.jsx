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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDominio } from "@/i18n/useDominio.js";
import { useFormato } from "@/i18n/formato.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { RefreshCw } from "lucide-react";

import { AlertBanner, Button, SectionLabel, Tabs } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { estadoHistorial, HISTORIAL } from "../../data/comunes/estadoDelDato.js";
import { ALARMAS_HISTORIZABLES, leerAlarmas } from "../../data/comunes/alarmas.js";
import { idDeEvento } from "@shared/eva/comun/eventosDeAlarma.js";
import { useSistemaAgua } from "../../data/comunes/hooks.js";
import { ACTIVO_IDS } from "../../domain/activos.js";
import { MONO, PuntoEstado } from "../../components/base.jsx";
import { estadoColor } from "../../components/paleta.js";
import { crearVistoPorMi } from "@/lib/vistoPorMi.js";

const VENTANAS = [
  { horas: 1, clave: "h1" },
  { horas: 6, clave: "h6" },
  { horas: 24, clave: "h24" },
  { horas: 48, clave: "h48" },
];


/**
 * Los eventos que este operador ya ha visto, entre visitas a la pantalla
 * (Plan 24 F5 · `USO-05`). Extraído a `lib/vistoPorMi.js` el 12-09-2026
 * (Plan 25 F6), al necesitar la bandeja de hallazgos el mismo mecanismo
 * sobre otro conjunto de ids — ver la cabecera de ese archivo.
 */
const vistoPorMi = crearVistoPorMi("eva:alarmas");

/**
 * Cuánto duró una alarma, en la unidad que se lea de un vistazo.
 *
 * ── POR QUÉ NO PASA POR EL DICCIONARIO ─────────────────────────────
 *
 * Porque `2 h 14 min` se escribe igual en los dos idiomas: son cifras y las
 * abreviaturas de hora y minuto, que el español y el inglés comparten. Meterlo
 * en i18n añadiría cuatro claves para producir el mismo texto.
 *
 * Los segundos sólo aparecen por debajo del minuto: una alarma que duró 4 h no
 * necesita decir cuántos segundos, y añadirlos haría la columna ilegible en la
 * lista.
 */
function fmtDuracion(ms) {
  const seg = Math.round(ms / 1000);
  if (seg < 60) return `${seg} s`;

  const min = Math.floor(seg / 60);
  if (min < 60) return `${min} min`;

  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
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
  const { activo: activoTexto, senal: senalTexto } = useDominio();
  const { locale } = useFormato();
  const [horas, setHoras] = useState(1);
  /**
   * Qué alarma se está consultando (12-09-2026).
   *
   * El historiador sirve el historial POR PUNTO, así que esta pantalla mira una
   * alarma a la vez y hay que decir cuál. Arranca en la primera del catálogo —
   * `NIVEL_ALTO_ALTO`, la de más consecuencia— en vez de dejarlo vacío: una
   * pantalla que abre sin datos y con un selector por tocar se lee como rota.
   */
  const [alarmaSel, setAlarmaSel] = useState(ALARMAS_HISTORIZABLES[0] ?? null);
  /**
   * Los eventos derivados de la serie de la alarma elegida.
   *
   * Se llamaba `alarmas` cuando venían del Alarm Server tal cual. Ahora son
   * EVENTOS construidos a partir de los flancos (`eventosDeAlarma`), y el
   * nombre lo dice: no son lo que ICONICS llama una alarma.
   */
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  const [vistos] = useState(vistoPorMi.leer);


  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { eventos: derivados } = await leerAlarmas(horas, alarmaSel);
      setEventos(derivados);
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
  }, [horas, alarmaSel]);

  useEffect(() => {
    cargar();
  }, [cargar]);


  /*
   * ── YA NO HAY FILTRO POR ACTIVO AQUÍ, Y ES CONSECUENCIA ────────────
   *
   * El historial es de UNA alarma, elegida en el selector, así que todos sus
   * eventos son del mismo activo por construcción: filtrar por activo sobre
   * ellos sería o no filtrar nada, o vaciar la lista entera. Los chips de
   * activo siguen sirviendo en la pestaña «En vivo», que sí mira las nueve a la
   * vez.
   *
   * Se ordena del más reciente al más antiguo, como antes — lo que cambia es
   * que ahora el criterio es una `Date` y no una cadena.
   */
  const filtradas = useMemo(
    () => [...eventos].sort((a, b) => b.inicio.getTime() - a.inicio.getTime()),
    [eventos]
  );

  const estado = estadoHistorial({ error, loading, datos: filtradas, minimo: 1 });

  /** Cuáles de los que se están viendo son NUEVOS. Ver la nota de `vistos`. */
  const nuevas = useMemo(
    () => filtradas.filter((e) => !vistos.has(idDeEvento(alarmaSel, e))),
    [filtradas, vistos, alarmaSel]
  );

  /*
   * Al llegar una tanda del servidor, lo que se enseña queda marcado como
   * leído en el almacenamiento — no en el estado. Ver `nuevas`.
   */
  const idsVisibles = filtradas.map((e) => idDeEvento(alarmaSel, e)).join(",");
  useEffect(() => {
    if (!idsVisibles) return;
    vistoPorMi.marcar(idsVisibles.split(","));
  }, [idsVisibles]);

  /*
   * ── AQUÍ YA NO SE RECONOCE, Y ES UNA CONSECUENCIA MEDIDA ──────────
   *
   * El acuse (Plan 24 F5) vivía aquí, con su confirmación de dos pasos y su
   * anotación en el diario. Se retira porque esta pestaña ya no enseña eventos
   * del Alarm Server: los deriva de la serie del historiador, y un flanco no
   * tiene `eventId` — reconocer es una operación del Alarm Server SOBRE un id
   * suyo.
   *
   * Medido el 12-09-2026 (`scripts/sondear-alarmas.mjs`): `/AlarmHistory`
   * devuelve 500 en esta instalación, así que ese id no existe y el botón
   * fallaría siempre. Un botón que se sabe que va a fallar es peor que ninguno.
   *
   * Lo que se retira es la UI, no la capacidad: `acknowledgeIconicsAlarms` sigue
   * en `lib/iconics` y la ruta del puente sigue anotando en el diario, para el
   * día que haya Alarm Historian (`ICO-10`, Plan 26).
   */

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

        {/*
         * Qué alarma se consulta (12-09-2026).
         *
         * Va junto a los chips de ventana porque son la misma decisión partida
         * en dos: QUÉ se mira y DE CUÁNDO. Un `<select>` y no chips como los de
         * al lado: son ocho opciones y crecerían con el catálogo, mientras que
         * las ventanas son cuatro y fijas.
         */}
        {ALARMAS_HISTORIZABLES.length > 0 && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: t.textFaint }}>
              {traducir("alarms:history.pointLabel")}
            </span>
            <select
              value={alarmaSel ?? ""}
              onChange={(e) => setAlarmaSel(e.target.value)}
              style={{
                height: 32, fontSize: 12, padding: "0 8px", borderRadius: 8,
                background: t.panel, color: t.text, border: `1px solid ${t.border}`,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {ALARMAS_HISTORIZABLES.map((key) => (
                /* El rótulo sale del diccionario de dominio, como en el resto
                   del tablero: `shared/` declara los nombres en español. */
                <option key={key} value={key}>{senalTexto(key, "corto")}</option>
              ))}
            </select>
          </label>
        )}

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

      </div>

      {/*
       * De dónde sale esta lista, dicho en la propia pantalla.
       *
       * No es un detalle técnico de más: estos eventos NO son los del Alarm
       * Server —esta instalación no lo tiene— sino flancos derivados de la serie
       * del historiador. Por eso no hay mensaje, ni severidad, ni acuse; y quien
       * lea la pantalla merece saberlo antes de preguntarse dónde están.
       */}
      <p style={{ fontSize: 11.5, color: t.textFaint, margin: "0 0 12px", lineHeight: 1.5 }}>
        {traducir("alarms:history.derivedNote")}
      </p>

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
          {filtradas.map((e) => (
            <div
              key={idDeEvento(alarmaSel, e)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "9px 14px",
                borderTop: `1px solid ${t.border}`, fontSize: 12.5, color: t.text,
              }}
            >
              {/* Un punto rojo mientras siga activa: es lo primero que hay que
                  ver en una lista donde casi todo ya terminó. */}
              <PuntoEstado color={e.activa ? t.coral : t.border} size={7} />

              <span style={{ fontFamily: MONO, fontSize: 11, color: t.textFaint, minWidth: 150 }}>
                {e.inicio.toLocaleString(locale)}
              </span>

              {/*
               * `desdeAntes` dice que la alarma YA estaba activa cuando empieza
               * la ventana, así que esa hora es el borde del rango y no el
               * momento real de entrada. Se marca en vez de callarlo: una hora
               * que parece exacta y no lo es se cree.
               */}
              {e.desdeAntes && (
                <span style={{ fontSize: 10.5, color: t.amber }}>
                  {traducir("alarms:history.fromBefore")}
                </span>
              )}

              <span style={{ minWidth: 120, color: t.textSoft }}>
                {e.activa
                  ? traducir("alarms:history.stillActive")
                  : e.fin.toLocaleString(locale)}
              </span>

              {/* Sin duración cuando sigue activa: poner una afirmaría que
                  terminó. Ver `eventosDeAlarma.js`. */}
              <span style={{ flex: 1, fontFamily: MONO, fontSize: 11, color: t.textFaint }}>
                {e.duracionMs === null ? "—" : fmtDuracion(e.duracionMs)}
              </span>
            </div>
          ))}
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
