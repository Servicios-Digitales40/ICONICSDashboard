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
import { ArchiveRestore, FileUp, RefreshCw, Upload, X } from "lucide-react";

import { AlertBanner, Button, Panel, SectionLabel } from "@/components/ui/index.js";
import { fieldStyle } from "@/components/ui/Input.jsx";
import { archivarManual, listarManuales, reemplazarManual, subirManual } from "@/lib/ragApi.js";
import { useTheme } from "@/theme";
import { resumenDeSistemas } from "@shared/eva/sistemas.js";

import { MONO, SANS } from "../../components/base.jsx";

/** Cada cuántos ms se vuelve a preguntar mientras hay algo indexándose. Lo
 *  bastante rápido para que se sienta en vivo, lo bastante espaciado para no
 *  machacar al backend con una pregunta por fragmento. */
const MS_ENTRE_SONDEOS = 2000;

const EXTENSIONES_ADMITIDAS = [".pdf", ".docx", ".txt", ".md", ".csv", ".log"];

function formatoFecha(iso) {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "—" : fecha.toLocaleString("es-MX");
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

function estadoDeFila(manual) {
  if (manual.estado === "archivado") return { texto: "archivado", tipo: "mute" };
  if (manual.motivoIlegible) return { texto: "no se pudo leer", tipo: "bad" };
  if (!manual.fragmentos) return { texto: "indexando", tipo: "wait" };
  return { texto: "indexado", tipo: "ok" };
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

function FilaManual({ manual, t, sistemasPorId, cargaHabilitada, onReemplazar, onArchivar, ocupado }) {
  const [confirmando, setConfirmando] = useState(false);
  const inputRef = useRef(null);
  const estado = estadoDeFila(manual);
  const activo = manual.estado === "activo";
  const nombreSistema = manual.sistema ? sistemasPorId.get(manual.sistema) ?? manual.sistema : "toda la planta";

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
          {manual.archivo} · {nombreSistema}
          {manual.version > 1 ? ` · v${manual.version}` : ""}
        </div>
        {estado.tipo === "bad" && manual.motivoIlegible && (
          <div style={{ fontSize: 11.5, color: t.coral, marginTop: 3 }}>{manual.motivoIlegible}</div>
        )}
      </div>

      <div style={{ fontFamily: MONO, fontSize: 11.5, color: t.textSoft, width: 96, flexShrink: 0, textAlign: "right" }}>
        {activo ? (estado.tipo === "wait" ? "…" : `${manual.fragmentos} fragmentos`) : "—"}
      </div>

      <div style={{ width: 128, flexShrink: 0 }}>
        <Chip tipo={estado.tipo} t={t}>{estado.texto}</Chip>
      </div>

      <div style={{ fontSize: 11, color: t.textFaint, width: 128, flexShrink: 0, textAlign: "right" }}>
        {formatoFecha(manual.fecha)}
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
            title="Reemplazar contenido"
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
                Confirmar
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
              title="Archivar (no borra el archivo)"
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
              Título
            </label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              style={fieldStyle(t)}
              placeholder="Cómo se llamará este manual"
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.textSoft, marginBottom: 4 }}>
              Sistema
            </label>
            <select value={sistema} onChange={(e) => setSistema(e.target.value)} style={fieldStyle(t)}>
              <option value="">Toda la planta</option>
              {sistemas.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" icon={<Upload size={14} />} loading={subiendo} onClick={confirmar}>
            Subir
          </Button>
          <Button variant="secondary" onClick={cancelar} disabled={subiendo}>Cancelar</Button>
        </div>

        {error && <div style={{ marginTop: 10 }}><AlertBanner type="error" title="No se pudo subir" message={error} /></div>}
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
        Arrastra un manual aquí, o haz clic para elegirlo
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: t.textFaint }}>
        {EXTENSIONES_ADMITIDAS.join(" · ")}
      </div>
      {error && <div style={{ marginTop: 12, textAlign: "left" }}><AlertBanner type="error" title="No se pudo subir" message={error} /></div>}
    </div>
  );
}

/* ── La vista ──────────────────────────────────────────────────────────── */

export default function DocumentacionRag() {
  const { theme: t } = useTheme();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState(null);
  const [idOcupado, setIdOcupado] = useState(null);

  const sistemas = resumenDeSistemas();
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
      setErrorCarga(e.message);
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
      setErrorSubida(e.message);
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
      setErrorCarga(e.message);
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
      setErrorCarga(e.message);
    } finally {
      setIdOcupado(null);
    }
  }

  if (cargando) {
    return (
      <>
        <SectionLabel sub="Qué manuales alimentan el índice del asistente, y qué sabe extraer de cada uno">
          RAG · Documentación
        </SectionLabel>
        <Panel><div style={{ color: t.textFaint, fontSize: 13 }}>Cargando…</div></Panel>
      </>
    );
  }

  if (errorCarga && !datos) {
    return (
      <>
        <SectionLabel sub="Qué manuales alimentan el índice del asistente, y qué sabe extraer de cada uno">
          RAG · Documentación
        </SectionLabel>
        <AlertBanner type="error" title="No se pudo consultar el catálogo" message={errorCarga} />
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
        <SectionLabel sub="Qué manuales alimentan el índice del asistente, y qué sabe extraer de cada uno">
          RAG · Documentación
        </SectionLabel>
        <AlertBanner
          type="info"
          title="Sin documentación configurada"
          message="Este servidor no tiene una carpeta de documentación (falta IA_DOCS_DIR). Sin ella, el asistente no puede consultar manuales."
        />
      </>
    );
  }

  const activos = datos.manuales.filter((m) => m.estado === "activo");
  const sinLeer = activos.filter((m) => m.motivoIlegible).length;
  const totalFragmentos = activos.reduce((s, m) => s + (m.fragmentos ?? 0), 0);

  return (
    <>
      <SectionLabel sub="Qué manuales alimentan el índice del asistente, y qué sabe extraer de cada uno">
        RAG · Documentación
      </SectionLabel>

      <Panel
        right={
          <button
            type="button"
            onClick={() => cargar()}
            title="Actualizar"
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9,
              border: `1px solid ${t.border}`, background: t.hover, color: t.textSoft,
              fontSize: 11.5, fontWeight: 600, fontFamily: SANS, cursor: "pointer",
            }}
          >
            <RefreshCw size={13} />
            Actualizar
          </button>
        }
      >
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <Estadistica label="Documentos" valor={activos.length} t={t} />
          <Estadistica label="Fragmentos" valor={totalFragmentos.toLocaleString("es-MX")} t={t} />
          <Estadistica
            label="Búsqueda"
            valor={datos.modo === "embeddings + BM25" ? "Embeddings + BM25" : "BM25"}
            tono={datos.modo === "embeddings + BM25" ? t.success : t.textSoft}
            t={t}
          />
          <Estadistica label="Sin leer" valor={sinLeer} tono={sinLeer ? t.coral : t.text} t={t} />
        </div>
      </Panel>

      <Panel title="Manuales" style={{ marginTop: 16 }}>
        {datos.manuales.length === 0 ? (
          <div style={{ fontSize: 13, color: t.textFaint, padding: "8px 0" }}>
            Todavía no hay ningún manual cargado.
          </div>
        ) : (
          datos.manuales.map((manual) => (
            <FilaManual
              key={manual.id}
              manual={manual}
              t={t}
              sistemasPorId={sistemasPorId}
              cargaHabilitada={datos.cargaHabilitada}
              onReemplazar={manejarReemplazo}
              onArchivar={manejarArchivado}
              ocupado={idOcupado === manual.id}
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
            title="La carga de manuales está desactivada"
            message="Este servidor no acepta subir manuales desde el tablero (RAG_UPLOAD_ENABLED=false). Los archivos se pueden seguir dejando a mano en la carpeta de documentación."
          />
        )}
      </div>
    </>
  );
}
