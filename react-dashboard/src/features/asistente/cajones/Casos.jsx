/**
 * El cajón «Casos» — la bitácora de intervenciones, para revisarla y podarla.
 *
 * ── POR QUÉ ES UN CAJÓN Y NO UNA PANTALLA (PLAN 20 FASE 3) ─────────
 *
 * Fue la vista «RAG · Casos previos», y la rama `Asistente` no tiene rutas:
 * hay una sola vista, el chat, y lo que haya que enseñar se enseña dentro.
 * Pero esto NO se borró con las otras dieciocho pantallas, y el criterio es
 * el de `docs/PLAN-20-ASISTENTE.md` §1: **lo que alimenta al asistente se
 * queda; lo que sólo lo pinta, se va.**
 *
 * Aquí se alimenta. Los casos previos son la Fuente #3 del diagnóstico (ver
 * `backend/ia/motor/casos.mjs`), y sin esta pantalla un caso escrito por voz,
 * por chat o al cerrar un diagnóstico sólo existía dentro de una búsqueda por
 * parecido que nadie podía inspeccionar.
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
 * Mismo criterio que el cajón hermano de manuales, y por el mismo motivo: ver «ARCHIVAR: LA ÚNICA BAJA QUE EXISTE» en
 * `@shared/eva/comun/aprendizaje.js`. Un caso archivado deja de alimentar
 * el diagnóstico —el índice no lo mira— pero su texto, su fecha y su
 * resultado siguen intactos en el archivo, y el botón de devolver está a un
 * clic. Es lo que permite podar sin miedo.
 *
 * ── LO QUE ESTE CAJÓN SE NIEGA A CONFUNDIR ─────────────────────────
 *
 * `resuelto` y `diagnosticoCorrecto` son cosas distintas y se pintan
 * distinto. El primero dice si la avería se arregló; el segundo, si la
 * causa que propuso el sistema era la buena. Un caso puede estar resuelto
 * con el diagnóstico equivocado —el técnico encontró otra cosa— y ése es
 * justamente el caso más valioso de la bitácora. Mezclarlos en un solo
 * semáforo borraría la única señal que mide si el motor acierta.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, RefreshCw, Search } from "lucide-react";

import { AlertBanner, Panel, SectionLabel } from "@/components/ui/index.js";
import { fieldStyle } from "@/components/ui/Input.jsx";
import { archivarCaso, listarCasos } from "@/lib/api/casosApi.js";
import { useTheme } from "@/theme";
import { resumenDeSistemas } from "@shared/eva/comun/sistemas.js";

import { MONO, SANS } from "@/theme/tipografia.js";

const FILTROS = [
  { id: "activos", label: "Activos" },
  { id: "archivados", label: "Archivados" },
  { id: "todos", label: "Todos" },
];

function formatoFecha(iso) {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "—" : fecha.toLocaleString("es-MX");
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
            {formatoFecha(caso.fecha)} · {nombreDeSistema(caso.sistema)} · {caso.origen ?? "—"}
            {caso.disparador?.riesgoId ? ` · ${caso.disparador.riesgoId}` : ""}
          </div>
        </button>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {archivado && <Chip tono="neutro" t={t}>Archivado</Chip>}
          <Chip tono={caso.resuelto === false ? "mal" : "ok"} t={t}>
            {caso.resuelto === false ? "No resuelto" : "Resuelto"}
          </Chip>
          {tieneVeredicto && (
            <Chip tono={caso.diagnosticoCorrecto ? "ok" : "aviso"} t={t}>
              {caso.diagnosticoCorrecto ? "Diagnóstico acertado" : "Diagnóstico corregido"}
            </Chip>
          )}
        </div>

        <button
          type="button"
          disabled={ocupado}
          onClick={() => onArchivar(caso, !archivado)}
          title={archivado ? "Devolver a la bitácora activa" : "Archivar: deja de alimentar el diagnóstico"}
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
          {archivado ? "Devolver" : "Archivar"}
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
          <Campo t={t} rotulo="Causa registrada">{caso.causa}</Campo>
          <Campo t={t} rotulo="Solución">{caso.solucion}</Campo>
          <Campo t={t} rotulo="Causa real confirmada">
            {caso.causaReal?.tipo}
            {caso.causaReal?.componente ? ` · ${caso.causaReal.componente}` : ""}
          </Campo>
          <Campo t={t} rotulo="Propuso el sistema">
            {caso.diagnostico?.propuesta
              ? `${caso.diagnostico.propuesta}${caso.diagnostico.respaldo ? ` (respaldo ${caso.diagnostico.respaldo})` : ""}`
              : null}
          </Campo>
          <Campo t={t} rotulo="Observaciones">{caso.resultado?.observaciones}</Campo>
          <Campo t={t} rotulo="Manual citado">
            {caso.diagnostico?.manualCitado?.length
              ? caso.diagnostico.manualCitado.map((m) => `${m.archivo} p.${m.pagina}`).join(" · ")
              : null}
          </Campo>
          {caso.muestraSensores && Object.keys(caso.muestraSensores).length > 0 && (
            <div style={{ gridColumn: "1 / -1" }}>
              <Campo t={t} rotulo="Muestra de sensores en el momento del cierre">
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

export default function CajonCasos() {
  const { theme: t } = useTheme();
  const [estado, setEstado] = useState({ loading: true, error: null, casos: [] });
  const [filtro, setFiltro] = useState("activos");
  const [busqueda, setBusqueda] = useState("");
  const [ocupado, setOcupado] = useState(null);
  const [aviso, setAviso] = useState(null);

  const sistemas = useMemo(() => {
    const mapa = new Map(resumenDeSistemas().map((s) => [s.id, s.nombre]));
    return (id) => (id ? mapa.get(id) ?? id : "toda la planta");
  }, []);

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
      setAviso(
        archivado
          ? "Archivado. Deja de respaldar diagnósticos, pero sigue en el archivo."
          : "Devuelto. Vuelve a contar como caso previo."
      );
    } catch (e) {
      setAviso(null);
      setEstado((s) => ({ ...s, error: e.message }));
    } finally {
      setOcupado(null);
    }
  }, [cargar]);

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
      <SectionLabel sub="Lo que el asistente recuerda de intervenciones anteriores, y qué de eso sigue contando">
        Casos previos
      </SectionLabel>

      <Panel style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filtro === f.id}
                onClick={() => setFiltro(f.id)}
                style={{
                  padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                  fontFamily: SANS, cursor: "pointer",
                  border: `1px solid ${filtro === f.id ? t.accent : t.border}`,
                  background: filtro === f.id ? t.accentSoft : "transparent",
                  color: filtro === f.id ? t.accent : t.textSoft,
                }}
              >
                {f.label}
                {f.id === "activos" ? ` (${activos})` : f.id === "archivados" ? ` (${archivados})` : ""}
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
              placeholder="Buscar por síntoma, causa o riesgo…"
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
            Actualizar
          </button>
        </div>

        {aviso && <AlertBanner type="info" message={aviso} />}
        {estado.error && <AlertBanner type="error" title="No se pudo leer la bitácora" message={estado.error} />}

        {estado.loading && estado.casos.length === 0 ? (
          <div style={{ fontSize: 13, color: t.textSoft, padding: "18px 0" }}>Leyendo la bitácora…</div>
        ) : visibles.length === 0 ? (
          <div
            style={{
              padding: 18, borderRadius: 10, border: `1px dashed ${t.border}`,
              fontSize: 13, color: t.textSoft, maxWidth: "68ch",
            }}
          >
            {estado.casos.length === 0
              ? "Todavía no hay ninguna intervención registrada. Se llenan solas al cerrar un diagnóstico desde Riesgos, o contándole una reparación al asistente por voz o por chat."
              : "Ningún caso encaja con este filtro."}
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
          Archivar no borra: el caso queda en el archivo con su texto y su fecha intactos, y deja de
          contar como respaldo en los diagnósticos. Se puede devolver cuando se quiera.
        </p>
      </Panel>
    </>
  );
}
