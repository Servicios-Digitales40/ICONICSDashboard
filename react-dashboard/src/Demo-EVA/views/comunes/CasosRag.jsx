/**
 * RAG · Casos — la bitácora de intervenciones, para revisarla y podarla.
 *
 * ── POR QUÉ ESTA PANTALLA VA EN «RAG» Y NO EN UNA MÁQUINA ──────────
 *
 * Porque la sección RAG es «de dónde saca el asistente lo que sabe fuera de
 * lo que mide ICONICS» (ver `app/routes/routes.jsx`), y hasta ahora sólo
 * enseñaba una de las dos fuentes: los manuales. Los casos previos son la
 * OTRA —la Fuente #3 del diagnóstico, ver `backend/ia/motor/casos.mjs`— y
 * no se veían por ningún lado. Un caso se escribía por voz, por chat o
 * cerrando un diagnóstico, y a partir de ahí sólo existía dentro de una
 * búsqueda por parecido que nadie podía inspeccionar.
 *
 * Colgarla de una máquina habría sido peor: la bitácora tiene casos de las
 * dos, y algunos de ninguna (`sistema: null`).
 *
 * ── QUÉ PROBLEMA RESUELVE DE VERDAD ────────────────────────────────
 *
 * Que un caso basura no es inocuo. `buscarCasosSimilares` lo recupera y
 * `respaldoDeCasos` lo cuenta como respaldo de una causa, así que un
 * «La bomba falla / Por investigarse» dicho en una prueba acaba subiendo la
 * banda de un diagnóstico real. La auditoría del 01-09-2026 midió 2 de 5
 * registros así. Sin esta pantalla, la única forma de verlos era abrir
 * `datos/aprendizaje.json` a mano.
 *
 * ── ARCHIVAR, NO BORRAR ────────────────────────────────────────────
 *
 * Mismo criterio que la pantalla hermana de manuales, y por el mismo
 * motivo: ver «ARCHIVAR: LA ÚNICA BAJA QUE EXISTE» en
 * `@shared/eva/comun/aprendizaje.js`. Un caso archivado deja de alimentar
 * el diagnóstico —el índice no lo mira— pero su texto, su fecha y su
 * resultado siguen intactos en el archivo, y el botón de devolver está a un
 * clic. Es lo que permite podar sin miedo.
 *
 * ── LO QUE ESTA VISTA SE NIEGA A CONFUNDIR ─────────────────────────
 *
 * `resuelto` y `diagnosticoCorrecto` son cosas distintas y se pintan
 * distinto. El primero dice si la avería se arregló; el segundo, si la
 * causa que propuso el sistema era la buena. Un caso puede estar resuelto
 * con el diagnóstico equivocado —el técnico encontró otra cosa— y ése es
 * justamente el caso más valioso de la bitácora. Mezclarlos en un solo
 * semáforo borraría la única señal que mide si el motor acierta.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive, ArchiveRestore, RefreshCw, Search } from "lucide-react";

import { useFormato } from "@/i18n/formato.js";
import { AlertBanner, Panel, SectionLabel } from "@/components/ui/index.js";
import { fieldStyle } from "@/components/ui/Input.jsx";
import { archivarCaso, listarCasos } from "@/lib/api/casosApi.js";
import { useDominio } from "@/i18n/useDominio.js";
import { useTheme } from "@/theme";

import { MONO, SANS } from "../../components/base.jsx";

/*
 * Los tres filtros, por su id. El rótulo NO está aquí: sale de
 * `assistant:rag.cases.filter` por ese mismo id, igual que el estado de una
 * fila sale de su clave. El id es lo que el código compara; el rótulo es lo
 * que se lee, y son dos cosas distintas.
 */
const FILTROS = ["activos", "archivados", "todos"];

/** `null` si la fecha no se puede leer; `useFormato` devuelve "" ahí. */
function fechaValida(iso) {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/* ── Piezas ──────────────────────────────────────────────────────────── */

function Chip({ tono, t, children }) {
  const colores = {
    ok: { fg: t.success, bg: `${t.success}18`, bd: t.success },
    mal: { fg: t.coral, bg: `${t.coral}18`, bd: t.coral },
    neutro: { fg: t.textSoft, bg: "transparent", bd: t.border },
    aviso: { fg: t.accent, bg: t.accentSoft, bd: t.accent },
  }[tono] ?? { fg: t.textSoft, bg: "transparent", bd: t.border };

  return (
    <span
      style={{
        fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em",
        textTransform: "uppercase", padding: "3px 8px", borderRadius: 4,
        whiteSpace: "nowrap", color: colores.fg, background: colores.bg,
        border: `1px solid ${colores.bd}`,
      }}
    >
      {children}
    </span>
  );
}

/** Un par etiqueta/valor del detalle. `valor` vacío no se pinta: un campo
 *  ausente y uno vacío se leen igual, y aquí «no se preguntó» es información. */
function Campo({ t, rotulo, children }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: ".12em",
          textTransform: "uppercase", color: t.textFaint, marginBottom: 3,
        }}
      >
        {rotulo}
      </div>
      <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5, wordBreak: "break-word" }}>
        {children}
      </div>
    </div>
  );
}

function FilaCaso({ caso, t, nombreDeSistema, onArchivar, ocupado }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("assistant");
  const { fechaHora } = useFormato();
  const [abierto, setAbierto] = useState(false);
  const archivado = caso.archivado === true;

  /*
   * `diagnosticoCorrecto` sólo se afirma cuando hubo con qué comparar: un
   * riesgo sin causas candidatas no tiene «acierto» que evaluar, y
   * `CierreDiagnostico.jsx` omite el campo en ese caso. `undefined` aquí es
   * «no aplica», no «falló» — pintarlo como fallo sería inventar un dato.
   */
  const tieneVeredicto = typeof caso.diagnosticoCorrecto === "boolean";

  return (
    <div
      style={{
        borderBottom: `1px solid ${t.border}`,
        padding: "12px 0",
        opacity: archivado ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          style={{
            flex: "1 1 260px", minWidth: 0, textAlign: "left", cursor: "pointer",
            background: "transparent", border: "none", padding: 0, color: "inherit",
          }}
        >
          <div style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: t.text }}>
            {caso.sintoma}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: t.textFaint, marginTop: 3 }}>
            {fechaHora(fechaValida(caso.fecha)) || "—"} · {nombreDeSistema(caso.sistema)} · {caso.origen ?? "—"}
            {caso.disparador?.riesgoId ? ` · ${caso.disparador.riesgoId}` : ""}
          </div>
        </button>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {archivado && (
            <Chip tono="neutro" t={t}>{traducir("rag.cases.chip.archived")}</Chip>
          )}
          <Chip tono={caso.resuelto === false ? "mal" : "ok"} t={t}>
            {traducir(caso.resuelto === false ? "rag.cases.chip.unsolved" : "rag.cases.chip.solved")}
          </Chip>
          {tieneVeredicto && (
            <Chip tono={caso.diagnosticoCorrecto ? "ok" : "aviso"} t={t}>
              {traducir(caso.diagnosticoCorrecto
                ? "rag.cases.chip.diagnosisRight"
                : "rag.cases.chip.diagnosisCorrected")}
            </Chip>
          )}
        </div>

        <button
          type="button"
          disabled={ocupado}
          onClick={() => onArchivar(caso, !archivado)}
          title={traducir(archivado ? "rag.cases.restoreTip" : "rag.cases.archiveTip")}
          style={{
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
            padding: "6px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600,
            fontFamily: SANS, cursor: ocupado ? "default" : "pointer",
            opacity: ocupado ? 0.5 : 1,
            border: `1px solid ${archivado ? t.accent : t.border}`,
            background: archivado ? t.accentSoft : "transparent",
            color: archivado ? t.accent : t.textSoft,
          }}
        >
          {archivado ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          {traducir(archivado ? "rag.cases.restore" : "rag.cases.archive")}
        </button>
      </div>

      {abierto && (
        <div
          style={{
            display: "grid", gap: 14, marginTop: 12, padding: "12px 14px",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            borderRadius: 10, background: t.panelAlt ?? t.panel,
            border: `1px solid ${t.border}`,
          }}
        >
          {/*
            El CONTENIDO de estos campos —la causa, la solución, lo que
            escribió el técnico— va tal cual y no se traduce: es texto de
            planta, escrito por una persona, y traducirlo sería reescribir su
            parte del expediente. Lo que se traduce es el rótulo.
          */}
          <Campo t={t} rotulo={traducir("rag.cases.field.recordedCause")}>{caso.causa}</Campo>
          <Campo t={t} rotulo={traducir("rag.cases.field.solution")}>{caso.solucion}</Campo>
          <Campo t={t} rotulo={traducir("rag.cases.field.confirmedCause")}>
            {caso.causaReal?.tipo}
            {caso.causaReal?.componente ? ` · ${caso.causaReal.componente}` : ""}
          </Campo>
          <Campo t={t} rotulo={traducir("rag.cases.field.systemProposed")}>
            {caso.diagnostico?.propuesta
              ? (caso.diagnostico.respaldo
                ? traducir("rag.cases.backing", {
                  propuesta: caso.diagnostico.propuesta,
                  respaldo: caso.diagnostico.respaldo,
                })
                : caso.diagnostico.propuesta)
              : null}
          </Campo>
          <Campo t={t} rotulo={traducir("rag.cases.field.notes")}>{caso.resultado?.observaciones}</Campo>
          <Campo t={t} rotulo={traducir("rag.cases.field.citedManual")}>
            {caso.diagnostico?.manualCitado?.length
              ? caso.diagnostico.manualCitado
                .map((m) => traducir("rag.cases.page", { archivo: m.archivo, pagina: m.pagina }))
                .join(" · ")
              : null}
          </Campo>
          {caso.muestraSensores && Object.keys(caso.muestraSensores).length > 0 && (
            <div style={{ gridColumn: "1 / -1" }}>
              <Campo t={t} rotulo={traducir("rag.cases.field.sensorSample")}>
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: t.textSoft }}>
                  {Object.entries(caso.muestraSensores)
                    .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(2) : String(v)}`)
                    .join("  ")}
                </span>
              </Campo>
            </div>
          )}
          <div style={{ gridColumn: "1 / -1", fontFamily: MONO, fontSize: 10.5, color: t.textFaint }}>
            {caso.id}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Vista ───────────────────────────────────────────────────────────── */

export default function CasosRag() {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["assistant", "navigation", "common", "errors"]);
  const { theme: t } = useTheme();
  const [estado, setEstado] = useState({ loading: true, error: null, casos: [] });
  const [filtro, setFiltro] = useState("activos");
  const [busqueda, setBusqueda] = useState("");
  const [ocupado, setOcupado] = useState(null);
  const [aviso, setAviso] = useState(null);

  /*
   * El nombre de la máquina se pide al puente del dominio y no a
   * `resumenDeSistemas()`: el dominio lo declara en español —es `shared/`, y
   * ahí no entra i18next (CLAUDE.md §2.7)—, así que leerlo directo dejaba
   * «Sistema de vibraciones» dentro de un tablero en inglés.
   */
  const { sistema: nombreSistema } = useDominio();
  const sistemas = useMemo(() => {
    const planta = traducir("assistant:rag.docs.wholePlant");
    return (id) => (id ? nombreSistema(id) : planta);
  }, [traducir, nombreSistema]);

  const cargar = useCallback(async (signal) => {
    setEstado((e) => ({ ...e, loading: true, error: null }));
    try {
      const data = await listarCasos({ signal });
      setEstado({ loading: false, error: null, casos: data.casos ?? [] });
    } catch (e) {
      if (e.name === "AbortError") return;
      setEstado({ loading: false, error: e.message, casos: [] });
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    cargar(ac.signal);
    return () => ac.abort();
  }, [cargar]);

  const onArchivar = useCallback(async (caso, archivado) => {
    setOcupado(caso.id);
    setAviso(null);
    try {
      await archivarCaso({ id: caso.id, archivado });
      /*
       * Se recarga del servidor en vez de tocar el estado local: el archivo
       * es la verdad, y dos pestañas abiertas sobre la misma bitácora es un
       * escenario real. Cuesta una petición sobre unos kilobytes.
       */
      await cargar();
      setAviso(traducir(
        archivado ? "assistant:rag.cases.archivedNotice" : "assistant:rag.cases.restoredNotice"
      ));
    } catch (e) {
      setAviso(null);
      setEstado((s) => ({ ...s, error: e.message }));
    } finally {
      setOcupado(null);
    }
  }, [cargar, traducir]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return estado.casos
      .filter((c) => {
        if (filtro === "activos") return c.archivado !== true;
        if (filtro === "archivados") return c.archivado === true;
        return true;
      })
      .filter((c) => {
        if (!texto) return true;
        return [c.sintoma, c.causa, c.solucion, c.causaReal?.tipo, c.disparador?.riesgoId]
          .filter(Boolean)
          .some((campo) => String(campo).toLowerCase().includes(texto));
      });
  }, [estado.casos, filtro, busqueda]);

  const activos = estado.casos.filter((c) => c.archivado !== true).length;
  const archivados = estado.casos.length - activos;

  return (
    <>
      {/*
        El título y el subtítulo salen de `navigation`, que es de donde los
        toma también el Topbar: eran dos sitios diciendo casi lo mismo con
        palabras distintas y nada los ataba. Mismo criterio que la pantalla
        hermana de manuales.
      */}
      <SectionLabel sub={traducir("navigation:routes.rag-casos.sub")}>
        {traducir("navigation:routes.rag-casos.title")}
      </SectionLabel>

      <Panel style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {FILTROS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
                style={{
                  padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                  fontFamily: SANS, cursor: "pointer",
                  border: `1px solid ${filtro === f ? t.accent : t.border}`,
                  background: filtro === f ? t.accentSoft : "transparent",
                  color: filtro === f ? t.accent : t.textSoft,
                }}
              >
                {traducir(`assistant:rag.cases.filter.${f}`)}
                {f === "activos" ? ` (${activos})` : f === "archivados" ? ` (${archivados})` : ""}
              </button>
            ))}
          </div>

          <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
            <Search
              size={14}
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: t.textFaint }}
            />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={traducir("assistant:rag.cases.searchPlaceholder")}
              style={{ ...fieldStyle(t), paddingLeft: 30, width: "100%" }}
            />
          </div>

          <button
            type="button"
            onClick={() => cargar()}
            disabled={estado.loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              fontFamily: SANS, cursor: estado.loading ? "default" : "pointer",
              border: `1px solid ${t.border}`, background: "transparent", color: t.textSoft,
            }}
          >
            <RefreshCw size={14} />
            {traducir("common:actions.refresh")}
          </button>
        </div>

        {aviso && <AlertBanner type="info" message={aviso} />}
        {estado.error && (
          <AlertBanner
            type="error"
            title={traducir("errors:titles.logbookReadFailed")}
            message={estado.error}
          />
        )}

        {estado.loading && estado.casos.length === 0 ? (
          <div style={{ fontSize: 13, color: t.textSoft, padding: "18px 0" }}>
            {traducir("assistant:rag.cases.loading")}
          </div>
        ) : visibles.length === 0 ? (
          <div
            style={{
              padding: 18, borderRadius: 10, border: `1px dashed ${t.border}`,
              fontSize: 13, color: t.textSoft, maxWidth: "68ch",
            }}
          >
            {traducir(estado.casos.length === 0
              ? "assistant:rag.cases.empty"
              : "assistant:rag.cases.noMatch")}
          </div>
        ) : (
          <div>
            {visibles.map((caso) => (
              <FilaCaso
                key={caso.id}
                caso={caso}
                t={t}
                nombreDeSistema={sistemas}
                onArchivar={onArchivar}
                ocupado={ocupado === caso.id}
              />
            ))}
          </div>
        )}

        <p style={{ margin: 0, fontSize: 12, color: t.textFaint, maxWidth: "72ch", lineHeight: 1.55 }}>
          {traducir("assistant:rag.cases.footnote")}
        </p>
      </Panel>
    </>
  );
}
