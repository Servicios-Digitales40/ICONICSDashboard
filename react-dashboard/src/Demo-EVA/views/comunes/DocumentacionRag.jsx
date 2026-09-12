/**
 * RAG · Documentación — qué manuales alimentan el índice del asistente, y qué
 * sabe de verdad extraer de cada uno.
 *
 * ── LA PREGUNTA QUE ESTA VISTA CONTESTA NO ES «QUÉ ARCHIVOS HAY» ────
 *
 * Es «¿qué sabe el asistente?». `backend/ia/indices/documentos.mjs` ya distingue un
 * manual indexado de uno que entró y no se pudo leer —un PDF escaneado, sin
 * una palabra extraíble—, y hasta ahora esa distinción sólo se veía en un
 * log que nadie mira. El síntoma es el peor posible: el asistente contesta
 * «no lo he encontrado en la documentación» sobre un manual que SÍ está en
 * la carpeta, y quien lo subió da por hecho que la búsqueda no funciona. Por
 * eso cada fila se presenta por lo que el índice sacó de ella —fragmentos, o
 * el motivo si no sacó ninguno— y no por el nombre del archivo a secas.
 *
 * ── NO HAY BOTÓN ELIMINAR ─────────────────────────────────────────
 *
 * Mismo criterio que el resto del tablero (`app/routes/routes.jsx`). Archivar
 * mueve el manual fuera de lo que el índice recorre —deja de contestar
 * preguntas, sin perder el archivo— y es la única baja que existe.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArchiveRestore, FileUp, RefreshCw, Upload, X } from "lucide-react";

import { useFormato } from "@/i18n/formato.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { AlertBanner, Button, Panel, SectionLabel } from "@/components/ui/index.js";
import { fieldStyle } from "@/components/ui/Input.jsx";
import {
  archivarManual,
  asignarSistemaManual,
  listarManuales,
  reemplazarManual,
  subirManual,
} from "@/lib/api/ragApi.js";
import { useDominio } from "@/i18n/useDominio.js";
import { useTheme } from "@/theme";

import { MONO, SANS } from "../../components/base.jsx";

/** Cada cuántos ms se vuelve a preguntar mientras hay algo indexándose. Lo
 *  bastante rápido para que se sienta en vivo, lo bastante espaciado para no
 *  machacar al backend con una pregunta por fragmento. */
const MS_ENTRE_SONDEOS = 2000;

const EXTENSIONES_ADMITIDAS = [".pdf", ".docx", ".txt", ".md", ".csv", ".log"];

/** `null` si la fecha del manifiesto no se puede leer; `useFormato` da "" ahí. */
function fechaValida(iso) {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * La cabecera de la vista, que se pintaba CUATRO veces —cargando, error, sin
 * configurar y el caso normal— con el mismo par de frases copiado.
 *
 * El texto sale de `navigation`, que es de donde lo saca también el Topbar y
 * el sidebar: eran tres sitios diciendo casi lo mismo con palabras distintas
 * («Qué manuales alimentan…» aquí, «Los manuales que alimentan…» en la ruta),
 * y ahora es uno. El «RAG · » se compone con el nombre de su sección, no
 * escrito a mano, por el mismo motivo.
 */
function Cabecera() {
  const { t: traducir } = useTranslation("navigation");
  const seccion = traducir("sections.sec-rag");
  return (
    <SectionLabel sub={traducir("routes.rag-documentacion.sub")}>
      {`${seccion} · ${traducir("routes.rag-documentacion.title")}`}
    </SectionLabel>
  );
}

/* ── Estadística de cabecera ─────────────────────────────────────────── */

function Estadistica({ label, valor, tono, t }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.09em", textTransform: "uppercase", color: t.textFaint }}>
        {label}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 22, fontWeight: 700, color: tono ?? t.text, marginTop: 4 }}>
        {valor}
      </div>
    </div>
  );
}

/* ── Una fila del catálogo ────────────────────────────────────────────── */

/**
 * ── «INDEXANDO» ERA UNA MENTIRA CÓMODA ─────────────────────────────
 *
 * Esto decía `if (!manual.fragmentos) return "indexando"`, y `!0` es
 * `true`: un manual con CERO fragmentos se quedaba en «indexando» para
 * siempre, aunque el índice hubiera terminado hacía horas. Medido el
 * 03-09-2026 con un manifiesto que apuntaba a un archivo movido a
 * `.archivados/`: la fila prometía un trabajo en curso que nadie estaba
 * haciendo.
 *
 * Ahora se mira el estado REAL del índice. Y son TRES estados, no dos: el
 * índice se carga perezosamente, así que «cero fragmentos» puede querer
 * decir dos cosas muy distintas —que la carpeta aún no se ha leído, o que
 * se leyó y este archivo no estaba— y sólo la segunda es un problema.
 * Confundirlas fue el primer intento de arreglar esto, y pintaba de rojo
 * seis manuales sanos.
 *
 * Devuelve la CLAVE del estado y no su texto: es una función pura, no puede
 * llamar a un hook, y quien la escribe decide QUÉ estado es — cómo se escribe
 * lo dice el diccionario. Mismo reparto que `aspectoDe` en «Salud».
 */
function estadoDeFila(manual, { indexando, cargado }) {
  if (manual.estado === "archivado") return { clave: "archivado", tipo: "mute" };
  if (manual.motivoIlegible) return { clave: "ilegible", tipo: "bad" };
  /*
   * ── RECORTADO VA ANTES DE «INDEXADO», Y NO ES «ok» (Plan 24 F2) ──
   *
   * Un parcial TIENE fragmentos buscables, así que sin esta rama caía en
   * `indexado` y salía en verde: indistinguible de un manual completo. Y lo que
   * el asistente puede citar de él está incompleto — si lo que quedó fuera era
   * el capítulo que hacía falta, la respuesta sale corta y nadie sabe por qué.
   *
   * `wait` y no `bad`: no está roto, está a medias. Pintarlo de rojo junto a los
   * ilegibles borraría la distinción que el Plan 22 F2 se tomó el trabajo de
   * mantener —«aquí SÍ hay fragmentos buscables, y lo que hay que decidir es si
   * lo que quedó fuera importaba»— y el arreglo de cada uno es distinto.
   *
   * El Plan 22 lo dejó escrito: «la pantalla de Documentación aún no la pinta;
   * eso es del Plan 24 (`USO-04`), y hasta entonces sale en el registro de
   * arranque». Esto es esa deuda.
   */
  if (manual.motivoParcial) return { clave: "parcial", tipo: "wait" };
  if (manual.fragmentos > 0) return { clave: "indexado", tipo: "ok" };
  if (indexando) return { clave: "indexando", tipo: "wait" };
  if (!cargado) return { clave: "sinLeer", tipo: "wait" };
  return { clave: "faltaArchivo", tipo: "bad" };
}

const CHIP_COLOR = {
  ok: (t) => ({ bg: t.successSoft, fg: t.success }),
  bad: (t) => ({ bg: t.coralSoft, fg: t.coral }),
  wait: (t) => ({ bg: t.amberSoft, fg: t.amber }),
  mute: (t) => ({ bg: t.hover, fg: t.textFaint }),
};

function Chip({ tipo, children, t }) {
  const { bg, fg } = CHIP_COLOR[tipo](t);
  return (
    <span
      style={{
        fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.05em",
        padding: "3px 9px", borderRadius: 999, background: bg, color: fg,
        border: `1px solid ${fg}33`, whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function FilaManual({
  manual, t, sistemas, sistemasPorId, cargaHabilitada,
  onReemplazar, onArchivar, onAsignar, ocupado, indice,
}) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["assistant", "common"]);
  const { fechaHora } = useFormato();
  const [confirmando, setConfirmando] = useState(false);
  const inputRef = useRef(null);
  const estado = estadoDeFila(manual, indice);
  const activo = manual.estado === "activo";
  const nombreSistema = manual.sistema
    ? sistemasPorId.get(manual.sistema) ?? manual.sistema
    : traducir("assistant:rag.docs.wholePlant");
  const sinAsignar = activo && !manual.sistema;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 14, padding: "12px 0",
        borderBottom: `1px solid ${t.border}`, flexWrap: "wrap", opacity: activo ? 1 : 0.6,
      }}
    >
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis" }}>
          {manual.titulo}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: t.textFaint, marginTop: 2 }}>
          {manual.archivo}
          {manual.version > 1 ? ` · v${manual.version}` : ""}
        </div>
        {estado.tipo === "bad" && manual.motivoIlegible && (
          <div style={{ fontSize: 11.5, color: t.coral, marginTop: 3 }}>{manual.motivoIlegible}</div>
        )}
        {/* El motivo del recorte, en ámbar y no en coral: dice qué se perdió
            («se cortó a 400 fragmentos»), que es lo que hace falta para decidir
            si importaba. Sin él, «recortado» sería una etiqueta sin salida. */}
        {estado.clave === "parcial" && manual.motivoParcial && (
          <div style={{ fontSize: 11.5, color: t.amber, marginTop: 3 }}>{manual.motivoParcial}</div>
        )}
      </div>

      {/*
       * ── LA MÁQUINA, EDITABLE ────────────────────────────────────────
       *
       * Era texto fijo al lado del nombre del archivo, y no había forma de
       * cambiarlo desde ninguna parte: medido el 03-09-2026, los nueve
       * manuales estaban en «toda la planta», así que el filtro por sistema
       * del índice —montado desde el Plan 17 F3a— no filtraba nada y un
       * diagnóstico de vibraciones podía respaldarse en el manual de la bomba.
       *
       * «Toda la planta» se queda como opción de primera clase y no como el
       * hueco de arriba de la lista: un anexo de límites aplica de verdad a
       * las dos máquinas, y esos manuales compiten SIEMPRE. Por eso lo que se
       * resalta no es «vacío», es «sin asignar» — que es otra cosa: nadie ha
       * decidido todavía.
       */}
      <div style={{ width: 170, flexShrink: 0 }}>
        {cargaHabilitada && activo ? (
          <select
            value={manual.sistema ?? ""}
            disabled={ocupado}
            onChange={(e) => onAsignar(manual.id, e.target.value)}
            title={traducir("assistant:rag.docs.systemTip")}
            style={{
              ...fieldStyle(t),
              height: 30,
              fontSize: 12,
              padding: "0 8px",
              ...(sinAsignar ? { borderColor: t.amber, color: t.amber } : {}),
            }}
          >
            <option value="">{traducir("assistant:rag.docs.wholePlant")}</option>
            {sistemas.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: t.textFaint }}>{nombreSistema}</span>
        )}
      </div>

      <div style={{ fontFamily: MONO, fontSize: 11.5, color: t.textSoft, width: 96, flexShrink: 0, textAlign: "right" }}>
        {activo
          ? (estado.tipo === "wait"
            ? "…"
            : traducir("assistant:rag.docs.fragments", { n: manual.fragmentos }))
          : "—"}
      </div>

      <div style={{ width: 128, flexShrink: 0 }}>
        <Chip tipo={estado.tipo} t={t}>
          {traducir(`assistant:rag.docs.state.${estado.clave}`)}
        </Chip>
      </div>

      {/*
        La fecha se formatea con el locale del idioma activo. Estaba fijada a
        `es-MX`, así que un tablero en inglés enseñaba «3/9/2026, 14:05» con
        el día delante del mes — que en inglés se lee como el 9 de marzo.
      */}
      <div style={{ fontSize: 11, color: t.textFaint, width: 128, flexShrink: 0, textAlign: "right" }}>
        {fechaHora(fechaValida(manual.fecha)) || "—"}
      </div>

      {cargaHabilitada && activo && (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <input
            ref={inputRef}
            type="file"
            accept={EXTENSIONES_ADMITIDAS.join(",")}
            style={{ display: "none" }}
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              e.target.value = "";
              if (archivo) onReemplazar(manual.id, archivo);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={ocupado}
            title={traducir("assistant:rag.docs.replaceTip")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 7, border: `1px solid ${t.border}`,
              background: t.hover, color: t.textSoft, cursor: ocupado ? "default" : "pointer",
            }}
          >
            <FileUp size={13} />
          </button>

          {confirmando ? (
            <>
              <button
                type="button"
                onClick={() => { setConfirmando(false); onArchivar(manual.id); }}
                disabled={ocupado}
                style={{
                  fontFamily: SANS, fontSize: 11.5, fontWeight: 600, padding: "0 10px",
                  borderRadius: 7, border: "none", background: `${t.coral}18`, color: t.coral,
                  cursor: ocupado ? "default" : "pointer", height: 28,
                }}
              >
                {traducir("common:actions.confirm")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 28, borderRadius: 7, border: `1px solid ${t.border}`,
                  background: "transparent", color: t.textSoft, cursor: "pointer",
                }}
              >
                <X size={13} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={ocupado}
              title={traducir("assistant:rag.docs.archiveTip")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 28, borderRadius: 7, border: `1px solid ${t.border}`,
                background: t.hover, color: t.textSoft, cursor: ocupado ? "default" : "pointer",
              }}
            >
              <ArchiveRestore size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── La zona de carga ─────────────────────────────────────────────────── */

function ZonaCarga({ t, sistemas, subiendo, error, onSubir }) {
  /* El código del puente elige la frase; el detalle va debajo. Ver `@/i18n`. */
  const mensajeDeError = useMensajeDeError();
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["assistant", "common", "errors"]);
  const [arrastrando, setArrastrando] = useState(false);
  const [pendiente, setPendiente] = useState(null); // File
  const [sistema, setSistema] = useState("");
  const [titulo, setTitulo] = useState("");
  const inputRef = useRef(null);

  function elegir(archivo) {
    if (!archivo) return;
    setPendiente(archivo);
    setTitulo(archivo.name.replace(/\.[^.]+$/, ""));
    setSistema("");
  }

  function cancelar() {
    setPendiente(null);
    setTitulo("");
    setSistema("");
  }

  async function confirmar() {
    await onSubir({ archivo: pendiente, sistema: sistema || null, titulo });
    cancelar();
  }

  if (pendiente) {
    return (
      <div style={{ border: `1px solid ${t.accent}`, background: t.accentSoft, borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <FileUp size={15} color={t.accent} />
          <span style={{ fontFamily: MONO, fontSize: 12, color: t.text }}>{pendiente.name}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.textSoft, marginBottom: 4 }}>
              {traducir("assistant:rag.docs.upload.title")}
            </label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              style={fieldStyle(t)}
              placeholder={traducir("assistant:rag.docs.upload.titlePlaceholder")}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.textSoft, marginBottom: 4 }}>
              {traducir("assistant:rag.docs.upload.system")}
            </label>
            <select value={sistema} onChange={(e) => setSistema(e.target.value)} style={fieldStyle(t)}>
              <option value="">{traducir("assistant:rag.docs.wholePlant")}</option>
              {sistemas.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" icon={<Upload size={14} />} loading={subiendo} onClick={confirmar}>
            {traducir("assistant:rag.docs.upload.submit")}
          </Button>
          <Button variant="secondary" onClick={cancelar} disabled={subiendo}>
            {traducir("common:actions.cancel")}
          </Button>
        </div>

        {error && (
          <div style={{ marginTop: 10 }}>
            <AlertBanner
              type="error"
              title={traducir("errors:titles.uploadFailed")}
              message={mensajeDeError(error).titulo}
              detalle={mensajeDeError(error).detalle}
              accion={mensajeDeError(error).accion}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        elegir(e.dataTransfer.files?.[0]);
      }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `1.5px dashed ${arrastrando ? t.accent : t.border}`,
        background: arrastrando ? t.accentSoft : "transparent",
        borderRadius: 12, padding: 24, textAlign: "center", cursor: "pointer",
        transition: "border-color 150ms ease, background 150ms ease",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={EXTENSIONES_ADMITIDAS.join(",")}
        style={{ display: "none" }}
        onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ""; }}
      />
      <Upload size={20} color={t.textFaint} style={{ marginBottom: 8 }} />
      <div style={{ fontFamily: SANS, fontSize: 13, color: t.textSoft, marginBottom: 4 }}>
        {traducir("assistant:rag.docs.upload.dropzone")}
      </div>
      {/* Las extensiones son extensiones: no se traducen. */}
      <div style={{ fontFamily: MONO, fontSize: 11, color: t.textFaint }}>
        {EXTENSIONES_ADMITIDAS.join(" · ")}
      </div>
      {error && (
        <div style={{ marginTop: 12, textAlign: "left" }}>
          <AlertBanner
            type="error"
            title={traducir("errors:titles.uploadFailed")}
            message={mensajeDeError(error).titulo}
            detalle={mensajeDeError(error).detalle}
            accion={mensajeDeError(error).accion}
          />
        </div>
      )}
    </div>
  );
}

/* ── La vista ──────────────────────────────────────────────────────────── */

/**
 * @param {object} p
 * @param {{filtro?: string}} [p.params]  El filtro por máquina viaja en la URL
 *   desde el Plan 24 F4 (`USO-02`) — ver `filtroSistema` abajo.
 * @param {(page: string, params?: object) => void} [p.onNavigate]
 */
export default function DocumentacionRag({ params, onNavigate }) {
  /* El código del puente elige la frase; el detalle va debajo. Ver `@/i18n`. */
  const mensajeDeError = useMensajeDeError();
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["assistant", "common", "errors"]);
  const { numero } = useFormato();
  const { theme: t } = useTheme();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState(null);
  const [idOcupado, setIdOcupado] = useState(null);
  /**
   * `""` = todos · `"sin-asignar"` · `"planta"` · el id de un sistema.
   *
   * ── POR QUÉ ESTE FILTRO VIAJA EN LA URL (Plan 24 F4 · `USO-02`) ──
   *
   * Porque pasa el criterio del mecanismo: es lo que alguien querría **enviar
   * por chat a un compañero** («mira, estos nueve están sin asignar») o dejar
   * puesto en una pantalla. Un desplegable abierto o el archivo a medio subir
   * no lo pasan, y por eso no viajan.
   *
   * El valor arranca de la URL y de ahí en más `onNavigate` la mantiene al día
   * — el mismo patrón que `AlarmasEva` estableció con `?tab=vivo&activo=<id>` y
   * que `DetalleActivo` ya usa para su rango. Es una CADENA, así que sobrevive
   * al filtro de `esSerializable()` de `useNavegacion`; un valor desconocido
   * cae solo en «todos», porque `manualesVisibles` no reconoce ningún caso y
   * devuelve la lista completa.
   */
  const [filtroSistema, setFiltroSistema] = useState(
    typeof params?.filtro === "string" ? params.filtro : ""
  );

  /**
   * Cambiar de filtro: el estado local y la URL a la vez.
   *
   * Usa `onNavigate` —que apila con `pushState`— y no un `replaceState` propio,
   * por consistencia con `DetalleActivo`, que ya hace exactamente esto con su
   * rango de tiempo desde el Plan 11. Apilar tiene un coste real —cinco cambios
   * de filtro son cinco pulsaciones de «atrás» para salir de la pantalla— pero
   * inventar aquí una segunda semántica de navegación, distinta de la de la
   * vista hermana, cuesta más: son dos comportamientos que explicar en vez de
   * uno. Si el historial llega a molestar, se cambia en `useNavegacion` para
   * las dos, que es donde vive esa decisión.
   */
  const elegirFiltro = (valor) => {
    setFiltroSistema(valor);
    onNavigate?.("rag-documentacion", valor ? { filtro: valor } : {});
  };

  /*
   * Con el nombre ya traducido: `shared/` los declara en español y aquí se
   * pintan en un `<select>` que debe hablar el idioma del resto de la
   * pantalla. Ver `sistema()` en `useDominio`.
   */
  const { sistemas: sistemasTraducidos } = useDominio();
  const sistemas = sistemasTraducidos();
  const sistemasPorId = new Map(sistemas.map((s) => [s.id, s.nombre]));

  const cargar = useCallback(async (signal) => {
    /*
     * `setCargando(false)` NO va en un `finally` a propósito.
     *
     * StrictMode monta dos veces en desarrollo: la primera petición se
     * aborta de inmediato y la segunda es la que de verdad trae los datos.
     * Con `finally`, el abort de la primera apagaba `cargando` en cuanto su
     * promesa rechazaba —antes de que la segunda hubiera terminado— y el
     * componente se quedaba un instante con `cargando: false`, `datos: null`
     * y `errorCarga: null` a la vez: la combinación que ninguno de los `if`
     * de más abajo contempla, y `!datos.configurado` explotaba sobre `null`.
     *
     * Una petición abortada fue SUPERADA por otra más nueva; no le
     * corresponde tocar ningún estado, ni siquiera para decir que terminó.
     */
    try {
      const respuesta = await listarManuales({ signal });
      setDatos(respuesta);
      setErrorCarga(null);
      setCargando(false);
    } catch (e) {
      if (e.name === "AbortError") return;
      /*
       * Se guarda el ERROR entero, no su `.message`: aplanarlo aquí tiraba el
       * `codigo` que manda el puente y con él la única forma de traducir el fallo.
       * Quien lo pinta pasa por `useMensajeDeError`.
       */
      setErrorCarga(e);
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const control = new AbortController();
    cargar(control.signal);
    return () => control.abort();
  }, [cargar]);

  // Mientras el índice está poniéndose al día tras una subida, se vuelve a
  // preguntar sola: es lo que hace que «indexando» pase a «indexado» sin que
  // alguien tenga que refrescar la página a mano.
  useEffect(() => {
    if (!datos?.indexando) return undefined;
    const id = setInterval(() => cargar(), MS_ENTRE_SONDEOS);
    return () => clearInterval(id);
  }, [datos?.indexando, cargar]);

  async function manejarSubida({ archivo, sistema, titulo }) {
    setSubiendo(true);
    setErrorSubida(null);
    try {
      await subirManual({ archivo, sistema, titulo });
      await cargar();
    } catch (e) {
      setErrorSubida(e);
    } finally {
      setSubiendo(false);
    }
  }

  async function manejarReemplazo(id, archivo) {
    setIdOcupado(id);
    try {
      await reemplazarManual({ id, archivo });
      await cargar();
    } catch (e) {
      setErrorCarga(e);
    } finally {
      setIdOcupado(null);
    }
  }

  /*
   * Reasignar dispara una recarga como el resto de escrituras, y por un
   * motivo que no es cosmético: el backend rehace su mapa `archivo → sistema`
   * en el mismo `recargar()` del índice, así que el número de fragmentos y el
   * estado que se ven aquí son los de después del cambio, no los de antes.
   */
  async function manejarAsignacion(id, sistema) {
    setIdOcupado(id);
    try {
      await asignarSistemaManual({ id, sistema });
      await cargar();
    } catch (e) {
      setErrorCarga(e);
    } finally {
      setIdOcupado(null);
    }
  }

  async function manejarArchivado(id) {
    setIdOcupado(id);
    try {
      await archivarManual({ id });
      await cargar();
    } catch (e) {
      setErrorCarga(e);
    } finally {
      setIdOcupado(null);
    }
  }

  if (cargando) {
    return (
      <>
        <Cabecera />
        <Panel>
          <div style={{ color: t.textFaint, fontSize: 13 }}>{traducir("common:state.loading")}</div>
        </Panel>
      </>
    );
  }

  if (errorCarga && !datos) {
    return (
      <>
        <Cabecera />
        <AlertBanner
          type="error"
          title={traducir("errors:titles.catalogQueryFailed")}
          message={mensajeDeError(errorCarga).titulo}
          detalle={mensajeDeError(errorCarga).detalle}
          accion={mensajeDeError(errorCarga).accion}
        />
      </>
    );
  }

  // Red de seguridad: no debería llegarse aquí con `datos` vacío —`cargando`
  // o `errorCarga` ya lo habrían cubierto arriba—, pero preferir un parpadeo
  // de nada a un `TypeError` sobre `null` si algún día deja de ser cierto.
  if (!datos) return null;

  if (!datos.configurado) {
    return (
      <>
        <Cabecera />
        <AlertBanner
          type="info"
          title={traducir("assistant:rag.docs.notConfigured.title")}
          message={traducir("assistant:rag.docs.notConfigured.message")}
        />
      </>
    );
  }

  const activos = datos.manuales.filter((m) => m.estado === "activo");
  const sinLeer = activos.filter((m) => m.motivoIlegible).length;
  /*
   * Los RECORTADOS, aparte de los ilegibles (Plan 24 F2 · `USO-04`). Cuenta
   * propia y no sumados a `sinLeer` por el mismo motivo que el backend los
   * mantiene en dos listas (Plan 22 F2): el arreglo de cada uno es distinto
   * —uno hay que sustituirlo, del otro hay que decidir si lo que faltó
   * importaba— y mezclarlos obligaría a leer el motivo para saber cuál es cuál.
   */
  const recortados = activos.filter((m) => m.motivoParcial).length;
  const totalFragmentos = activos.reduce((s, m) => s + (m.fragmentos ?? 0), 0);

  /*
   * «Sin asignar» cuenta sólo los ACTIVOS: un manual archivado está fuera de
   * lo que el índice recorre, así que su máquina da igual y contarlo aquí
   * inflaría un número que existe para ser bajado a cero.
   *
   * Y «sin asignar» no es lo mismo que «toda la planta», aunque en disco sean
   * el mismo `null`. La diferencia es de intención: uno es una decisión
   * —este anexo vale para las dos máquinas— y el otro es que nadie ha mirado
   * todavía. Sin poder distinguirlos en el dato, se distinguen en el flujo:
   * el contador empuja a revisarlos, y quien decida «toda la planta» lo deja
   * como está. Es lo más honesto que se puede hacer sin inventar un tercer
   * valor que el backend no tiene.
   */
  const sinAsignar = activos.filter((m) => !m.sistema).length;

  const manualesVisibles = datos.manuales.filter((m) => {
    if (!filtroSistema) return true;
    if (filtroSistema === "sin-asignar") return m.estado === "activo" && !m.sistema;
    if (filtroSistema === "planta") return !m.sistema;
    return m.sistema === filtroSistema;
  });

  return (
    <>
      <Cabecera />

      <Panel
        right={
          <button
            type="button"
            onClick={() => cargar()}
            title={traducir("common:actions.refresh")}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9,
              border: `1px solid ${t.border}`, background: t.hover, color: t.textSoft,
              fontSize: 11.5, fontWeight: 600, fontFamily: SANS, cursor: "pointer",
            }}
          >
            <RefreshCw size={13} />
            {traducir("common:actions.refresh")}
          </button>
        }
      >
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <Estadistica
            label={traducir("assistant:rag.docs.stats.documents")}
            valor={activos.length}
            t={t}
          />
          {/*
           * El separador de millares es del IDIOMA: 1,234 en inglés y 1.234
           * en español. Estaba fijado a `es-MX`, que en un tablero en inglés
           * se lee como «uno coma doscientos treinta y cuatro».
           */}
          <Estadistica
            label={traducir("assistant:rag.docs.stats.fragments")}
            valor={numero(totalFragmentos, 0)}
            t={t}
          />
          {/*
           * «Embeddings + BM25» NO se traduce: son los nombres de los dos
           * algoritmos de búsqueda, no una descripción. BM25 se llama BM25 en
           * los dos idiomas, igual que un tag de ICONICS.
           */}
          <Estadistica
            label={traducir("assistant:rag.docs.stats.search")}
            valor={datos.modo === "embeddings + BM25" ? "Embeddings + BM25" : "BM25"}
            tono={datos.modo === "embeddings + BM25" ? t.success : t.textSoft}
            t={t}
          />
          <Estadistica
            label={traducir("assistant:rag.docs.stats.unread")}
            valor={sinLeer}
            tono={sinLeer ? t.coral : t.text}
            t={t}
          />
          {/*
           * Sólo cuando hay alguno: a diferencia de «sin asignar» —un contador
           * que existe para bajarse a cero y por eso se enseña siempre— un cero
           * aquí no pide nada a nadie, y una métrica permanente en cero enseña a
           * no mirar la fila. Cuando aparece, en ámbar: el manual sirve, pero
           * incompleto.
           */}
          {recortados > 0 && (
            <Estadistica
              label={traducir("assistant:rag.docs.stats.truncated")}
              valor={recortados}
              tono={t.amber}
              t={t}
            />
          )}
          {/*
           * En ámbar y no en rojo: un manual sin asignar no está roto, y
           * puede que «toda la planta» sea la respuesta correcta para él.
           * Lo que sí es cierto es que compite en las búsquedas de las DOS
           * máquinas, y eso merece una mirada — el 03-09-2026 los nueve
           * estaban así y un diagnóstico de vibraciones podía respaldarse en
           * el manual de la bomba.
           */}
          <Estadistica
            label={traducir("assistant:rag.docs.stats.unassigned")}
            valor={sinAsignar}
            tono={sinAsignar ? t.amber : t.success}
            t={t}
          />
        </div>
      </Panel>

      <Panel
        title={traducir("assistant:rag.docs.panelTitle")}
        style={{ marginTop: 16 }}
        right={
          /*
           * ── UN FILTRO, NO UNA PANTALLA POR MÁQUINA ────────────────────
           *
           * Se valoró partir esta vista en una por máquina y se descartó, por
           * cuatro razones que están en `docs/` pero que conviene recordar
           * aquí, que es donde alguien tendría la tentación:
           *
           *  1. «Toda la planta» es una categoría REAL, no un valor sin
           *     poner: esos manuales compiten en las dos máquinas. En una
           *     pantalla por máquina aparecerían en las dos, y archivarlos
           *     desde una los archivaría en la otra.
           *  2. El índice es UNO y su estado es global (`indexando`,
           *     `progreso`, `cargado`). Dos pantallas enseñarían la misma
           *     barra de progreso sugiriendo dos corpus, y no puede haberlos:
           *     BM25 no es invariante al tamaño del corpus y los umbrales
           *     están calibrados contra éste.
           *  3. Alta, reemplazo y archivado son un solo flujo sobre una
           *     carpeta y un manifiesto. Duplicar la UI duplica dónde
           *     arreglar cada fallo.
           *  4. Sólo desde una lista completa se ve «cuántos van sin
           *     asignar» y se arregla de una pasada.
           */
          <select
            value={filtroSistema}
            onChange={(e) => elegirFiltro(e.target.value)}
            style={{ ...fieldStyle(t), height: 30, fontSize: 12, padding: "0 8px", width: 190 }}
          >
            <option value="">{traducir("assistant:rag.docs.filter.all")}</option>
            <option value="sin-asignar">
              {traducir("assistant:rag.docs.filter.unassigned", { n: sinAsignar })}
            </option>
            <option value="planta">{traducir("assistant:rag.docs.filter.onlyPlant")}</option>
            {sistemas.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        }
      >
        {datos.manuales.length === 0 ? (
          <div style={{ fontSize: 13, color: t.textFaint, padding: "8px 0" }}>
            {traducir("assistant:rag.docs.empty")}
          </div>
        ) : manualesVisibles.length === 0 ? (
          <div style={{ fontSize: 13, color: t.textFaint, padding: "8px 0" }}>
            {traducir("assistant:rag.docs.noMatch")}
          </div>
        ) : (
          manualesVisibles.map((manual) => (
            <FilaManual
              key={manual.id}
              manual={manual}
              t={t}
              sistemas={sistemas}
              sistemasPorId={sistemasPorId}
              cargaHabilitada={datos.cargaHabilitada}
              onReemplazar={manejarReemplazo}
              onArchivar={manejarArchivado}
              onAsignar={manejarAsignacion}
              ocupado={idOcupado === manual.id}
              indice={{ indexando: datos.indexando, cargado: datos.cargado }}
            />
          ))
        )}
      </Panel>

      <div style={{ marginTop: 16 }}>
        {datos.cargaHabilitada ? (
          <ZonaCarga t={t} sistemas={sistemas} subiendo={subiendo} error={errorSubida} onSubir={manejarSubida} />
        ) : (
          <AlertBanner
            type="warning"
            title={traducir("assistant:rag.docs.uploadDisabled.title")}
            message={traducir("assistant:rag.docs.uploadDisabled.message")}
          />
        )}
      </div>
    </>
  );
}
