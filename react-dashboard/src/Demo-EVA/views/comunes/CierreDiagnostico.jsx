/**
 * Cierre de diagnóstico — Plan 16 Fase 5, UI A.
 *
 * ── QUIÉN LA ABRE, Y POR QUÉ IMPORTA ────────────────────────────────
 *
 * El técnico que ACABA de intervenir sobre un riesgo, con prisa, quizá en
 * tablet. Se llega con el botón «Cerrar diagnóstico» de una tarjeta de
 * riesgo (`RiesgosTanque.jsx` / `riesgoVibracion.jsx`), nunca del sidebar en
 * frío — por eso esta ruta no tiene `nav` en `routes.jsx`, igual que
 * `eva-detalle`.
 *
 * ── DOS ZONAS SEPARADAS POR AUTORIDAD ───────────────────────────────
 *
 * Arriba, hundida y en monoespaciado: lo que el sistema YA SABE — el
 * riesgo, la muestra de sensores, las causas candidatas ya puntuadas por
 * `motorDiagnostico` (`GET /api/diagnostico`, el mismo motor que narra
 * `diagnosticar_falla` en el chat). Nada de esto se edita aquí: es un
 * hecho, no una pregunta.
 *
 * Abajo, elevada: lo único que aporta la persona. El momento focal es
 * «Causa encontrada» — confirmar cuál de las candidatas fue, o corregirla
 * — no un «¿diagnóstico correcto? Sí/No» que nadie necesita ver: se
 * calcula solo comparando la causa elegida con la que el sistema proponía
 * primero (`diagnosticoCorrecto`).
 *
 * «No funcionó» es un resultado de primera clase (`resuelto: false`), con
 * el mismo peso visual que «Funcionó» — no un estado de error.
 *
 * ── SIN MODAL, A PROPÓSITO ──────────────────────────────────────────
 *
 * Es una página completa, no un diálogo: un modal invita a cerrarlo sin
 * completar el cierre, y esto es exactamente lo que no debe perderse.
 *
 * ── DE DÓNDE SALE CADA DATO, SI EL RIESGO YA NO ESTÁ ACTIVO ─────────
 *
 * El título/evidencia/qué-revisar de un riesgo ya resuelto por la propia
 * intervención puede haber DESAPARECIDO de `evaluarRiesgos()` — es el
 * resultado correcto de haberlo arreglado. Por eso el título y el texto
 * fijo salen de `REGLAS` (la declaración estática, siempre presente); sólo
 * la EVIDENCIA medida —la cifra— necesita que el riesgo siga activo ahora
 * mismo, y su ausencia se explica en pantalla, no se esconde.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ChevronLeft, ClipboardCheck, Loader2, XCircle } from "lucide-react";

import { AlertBanner, Button, Panel, SectionLabel } from "@/components/ui/index.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { fieldStyle } from "@/components/ui/Input.jsx";
import { obtenerDiagnostico, registrarCaso } from "@/lib/api/casosApi.js";
import { useDominio } from "@/i18n/useDominio.js";
import { useEvidencia } from "@/i18n/useEvidencia.js";
import { useProsa } from "@/i18n/useProsa.js";
import { useTheme } from "@/theme";

import { MONO, SANS } from "../../components/base.jsx";
import { useSistemaAgua } from "../../data/comunes/hooks.js";
import { useDominioVibracion } from "../../data/vibraciones/vibracion.js";
import { evaluarRiesgos, REGLAS as REGLAS_TANQUE } from "../../domain/riesgos.js";
import { evaluarRiesgosVibracion, REGLAS as REGLAS_VIBRACION } from "../../domain/riesgosVibracion.js";

/*
 * Cada banda con su color. El rótulo NO está aquí: sale de
 * `maintenance:close.band` por la propia clave, igual que la severidad de un
 * riesgo sale de `diagnostics:severity`. Aquí se decide de qué color, no cómo
 * se escribe.
 */
const BANDA_INFO = {
  alto: { clave: "alto", token: "coral" },
  medio: { clave: "medio", token: "amber" },
  bajo: { clave: "bajo", token: "textFaint" },
};

/** "Otra causa" no es un id real de `causas.js`: es la señal de que la
 *  persona escribió una causa que el sistema no tenía transcrita. */
const OTRA_CAUSA = "__otra__";

/** Lista vacía estable, para que «no hay causas» no cambie de identidad en
 *  cada render — ver el memo de `causasCandidatas`. Congelada porque nadie
 *  debe empujar nada dentro de un valor compartido por todos los renders. */
const SIN_CAUSAS = Object.freeze([]);

/**
 * El título y el subtítulo de la pantalla, que se pintaban TRES veces —sin
 * riesgo, caso cerrado y el caso normal— con las mismas dos frases copiadas.
 *
 * Recibe `traducir` por prop en vez de pedir el suyo: esta pieza es de esta
 * vista y no tiene sentido fuera, así que un hook propio sólo sería un
 * segundo sitio donde equivocarse de namespace.
 */
function Cabecera({ traducir }) {
  return (
    <SectionLabel sub={traducir("maintenance:close.sub")}>
      {traducir("maintenance:close.title")}
    </SectionLabel>
  );
}

function Rotulo({ t, children }) {
  return (
    <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.textFaint, marginBottom: 4 }}>
      {children}
    </div>
  );
}

/* ── Zona superior: lo que el sistema ya sabe, hundido y no editable ──── */

function ZonaSistema({ t, sistemaNombre, tituloRiesgo, canalLabel, evidencia, activo, muestraSensores, diagnostico }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("maintenance");
  /* El título de cada causa candidata. Ver la cabecera de `useProsa`. */
  const { causa: traducirCausa } = useProsa();
  /*
   * Y las frases con las que el motor respalda cada causa. Las redacta el
   * backend en español —es lo que lee el modelo—; aquí se rehacen. Ver la
   * cabecera de `useEvidencia`.
   */
  const { fuente: fuenteDeEvidencia, texto: textoDeEvidencia } = useEvidencia();

  return (
    <div
      style={{
        // `page`, no `panel`: es el mismo fondo que hay DETRÁS de las
        // tarjetas, así que esta caja se lee hundida respecto al resto de la
        // pantalla — el efecto contrario al de `Panel`, que está elevado.
        background: t.page, border: `1px solid ${t.border}`, borderRadius: 12,
        padding: 18, boxShadow: `inset 0 1px 3px ${t.border}66`,
        display: "flex", flexDirection: "column", gap: 16, fontFamily: MONO,
      }}
    >
      <div>
        <Rotulo t={t}>{traducir("close.system.riskOf", { sistema: sistemaNombre })}</Rotulo>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.text, fontFamily: SANS }}>
          {tituloRiesgo ?? traducir("close.system.risk")}
          {canalLabel && <span style={{ fontWeight: 400, color: t.textSoft }}> — {canalLabel}</span>}
        </div>
        {evidencia ? (
          <div style={{ fontSize: 13, color: t.textSoft, marginTop: 4 }}>{evidencia}</div>
        ) : (
          <div style={{ fontSize: 12.5, color: t.textFaint, marginTop: 4, fontStyle: "italic" }}>
            {traducir(activo === false
              ? "close.system.noLongerActive"
              : "close.system.noEvidence")}
          </div>
        )}
      </div>

      {muestraSensores && Object.keys(muestraSensores).length > 0 && (
        <div>
          <Rotulo t={t}>{traducir("close.system.sensorSample")}</Rotulo>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 }}>
            {Object.entries(muestraSensores).map(([clave, valor]) => (
              <div key={clave} style={{ fontSize: 12.5, color: t.text }}>
                <span style={{ color: t.textFaint }}>{clave}:</span>{" "}
                {typeof valor === "number" ? valor.toFixed(2) : String(valor)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <Rotulo t={t}>{traducir("close.system.computed")}</Rotulo>
        {diagnostico.loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: t.textFaint }}>
            <Loader2 size={13} className="spin" /> {traducir("close.system.crossing")}
          </div>
        )}
        {diagnostico.error && (
          <div style={{ fontSize: 12.5, color: t.coral }}>{diagnostico.error}</div>
        )}
        {!diagnostico.loading && !diagnostico.error && diagnostico.data?.huerfano && (
          <div style={{ fontSize: 12.5, color: t.textFaint, fontStyle: "italic" }}>
            {traducir("close.system.orphan")}
          </div>
        )}
        {!diagnostico.loading && !diagnostico.error && diagnostico.data?.causas?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/*
              Plan 17 Fase 4 (G9): las fuentes se suman en un número, pero
              un desacuerdo entre ellas —el manual apunta a una causa, el
              histórico a otra— es información que vale la pena enseñar, no
              esconder detrás de la suma. El sistema no elige un ganador
              aquí tampoco.
            */}
            {diagnostico.data.conflicto && (
              <AlertBanner
                type="warning"
                title={traducir("close.system.conflict.title")}
                message={traducir("close.system.conflict.message")}
              />
            )}
            {/*
              Plan 28 F3: un diagnóstico al que le faltó una fuente se pintaba
              idéntico a uno completo, con la misma banda. Aquí eso importa más
              que en el chat: el técnico está cerrando un caso y va a confirmar
              o corregir la causa que el sistema propone — si esa propuesta se
              calculó sin los manuales, tiene que saberlo ANTES de elegir.

              `insuficiente` es el caso duro y se pinta como error, no como
              aviso: con las tres fuentes caídas el orden de las causas es el
              del catálogo, no un ranking, así que «la primera» no significa
              «la más probable».
            */}
            {diagnostico.data.estado && diagnostico.data.estado !== "completo" && (
              <AlertBanner
                type={diagnostico.data.estado === "insuficiente" ? "error" : "warning"}
                title={traducir(`close.system.sources.${diagnostico.data.estado}.title`)}
                message={traducir(`close.system.sources.${diagnostico.data.estado}.message`, {
                  fuentes: (diagnostico.data.snapshot?.fuentesCaidas ?? [])
                    .map((f) => traducir(`close.system.sources.name.${f}`))
                    .join(", "),
                })}
              />
            )}
            {diagnostico.data.causas.map((c, i) => {
              const banda = BANDA_INFO[c.banda] ?? BANDA_INFO.bajo;
              const tieneEvidencia = (c.evidenciaAFavor?.length > 0) || (c.evidenciaEnContra?.length > 0);
              return (
                <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 12.5 }}>
                    <span
                      style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                        color: t[banda.token], background: `${t[banda.token]}22`, flexShrink: 0,
                      }}
                    >
                      {traducir(`close.band.${banda.clave}`)}
                    </span>
                    <span style={{ color: t.text }}>
                      {i === 0 && <strong>{traducirCausa(c).titulo} </strong>}
                      {i !== 0 && traducirCausa(c).titulo}
                      {i === 0 && (
                        <span style={{ color: t.textFaint }}>{traducir("close.system.proposed")}</span>
                      )}
                    </span>
                    <span style={{ color: t.textFaint, marginLeft: "auto", whiteSpace: "nowrap" }}>
                      {traducir("close.system.backing", {
                        datos: c.respaldo.datos,
                        manual: c.respaldo.manual,
                        casos: c.respaldo.casos,
                      })}
                      {typeof c.respaldo.temporal === "number"
                        && traducir("close.system.backingTemporal", { temporal: c.respaldo.temporal })}
                    </span>
                  </div>
                  {/*
                    Frases, no sólo el entero de arriba (Plan 17 Fase 4,
                    G6): "datos 2, manual 2, casos 2" no dice QUÉ dice cada
                    fuente. La evidencia EN CONTRA es tan visible como la
                    de a favor — no es un descargo, es parte de por qué la
                    causa quedó donde quedó.
                  */}
                  {tieneEvidencia && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 46 }}>
                      {c.evidenciaAFavor?.map((e, j) => (
                        <div key={`favor-${j}`} style={{ fontSize: 11.5, color: t.textSoft }}>
                          <span style={{ color: t.success }}>+</span>{" "}
                          [{fuenteDeEvidencia(e.fuente)}] {textoDeEvidencia(e)}
                          {e.referencia && <span style={{ color: t.textFaint }}> — {e.referencia}</span>}
                        </div>
                      ))}
                      {c.evidenciaEnContra?.map((e, j) => (
                        <div key={`contra-${j}`} style={{ fontSize: 11.5, color: t.coral }}>
                          <span>−</span>{" "}
                          [{fuenteDeEvidencia(e.fuente)}] {textoDeEvidencia(e)}
                          {e.referencia && <span style={{ color: t.textFaint }}> — {e.referencia}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Zona inferior: lo único que aporta la persona, elevada ───────────── */

function ZonaPersona({
  t, causas, causaId, setCausaId, causaLibre, setCausaLibre, componenteLibre, setComponenteLibre,
  solucion, setSolucion, resuelto, setResuelto, observaciones, setObservaciones,
}) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("maintenance");
  /* El título de cada causa candidata. Ver la cabecera de `useProsa`. */
  const { causa: traducirCausa } = useProsa();

  return (
    <Panel title={traducir("close.person.title")} code={traducir("close.person.code")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {causas.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCausaId(c.id)}
              style={{
                textAlign: "left", padding: "10px 14px", borderRadius: 9, cursor: "pointer",
                border: `1.5px solid ${causaId === c.id ? t.accent : t.border}`,
                background: causaId === c.id ? t.accentSoft : "transparent",
                fontFamily: SANS, fontSize: 13, color: t.text,
              }}
            >
              {traducirCausa(c).titulo}
              {i === 0 && (
                <span style={{ marginLeft: 8, fontSize: 11, color: t.textFaint }}>
                  {traducir("close.person.proposedTag")}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCausaId(OTRA_CAUSA)}
            style={{
              textAlign: "left", padding: "10px 14px", borderRadius: 9, cursor: "pointer",
              border: `1.5px solid ${causaId === OTRA_CAUSA ? t.accent : t.border}`,
              background: causaId === OTRA_CAUSA ? t.accentSoft : "transparent",
              fontFamily: SANS, fontSize: 13, color: t.text,
            }}
          >
            {traducir("close.person.otherCause")}
          </button>
        </div>

        {causaId === OTRA_CAUSA && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.textSoft, marginBottom: 4 }}>
                {traducir("close.person.cause")}
              </label>
              <input
                value={causaLibre}
                onChange={(e) => setCausaLibre(e.target.value)}
                style={fieldStyle(t)}
                placeholder={traducir("close.person.causePlaceholder")}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.textSoft, marginBottom: 4 }}>
                {traducir("close.person.component")}
              </label>
              <input
                value={componenteLibre}
                onChange={(e) => setComponenteLibre(e.target.value)}
                style={fieldStyle(t)}
                placeholder={traducir("close.person.componentPlaceholder")}
              />
            </div>
          </div>
        )}

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.textSoft, marginBottom: 4 }}>
            {traducir("close.person.whatWasDone")}
          </label>
          <textarea
            value={solucion}
            onChange={(e) => setSolucion(e.target.value)}
            style={{ ...fieldStyle(t), minHeight: 72, resize: "vertical", fontFamily: "'Inter', sans-serif" }}
            placeholder={traducir("close.person.whatWasDonePlaceholder")}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.textSoft, marginBottom: 8 }}>
            {traducir("close.person.result")}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setResuelto(true)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "10px 14px", borderRadius: 9, cursor: "pointer", fontFamily: SANS,
                fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${resuelto === true ? t.success : t.border}`,
                background: resuelto === true ? `${t.success}18` : "transparent",
                color: resuelto === true ? t.success : t.textSoft,
              }}
            >
              <CheckCircle2 size={15} /> {traducir("close.person.worked")}
            </button>
            <button
              type="button"
              onClick={() => setResuelto(false)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "10px 14px", borderRadius: 9, cursor: "pointer", fontFamily: SANS,
                fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${resuelto === false ? t.coral : t.border}`,
                background: resuelto === false ? `${t.coral}18` : "transparent",
                color: resuelto === false ? t.coral : t.textSoft,
              }}
            >
              <XCircle size={15} /> {traducir("close.person.didNotWork")}
            </button>
          </div>
          {resuelto === false && (
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: t.textFaint, lineHeight: 1.5 }}>
              {traducir("close.person.didNotWorkNote")}
            </p>
          )}
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: t.textSoft, marginBottom: 4 }}>
            {traducir("close.person.notes")}
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            style={{ ...fieldStyle(t), minHeight: 56, resize: "vertical", fontFamily: "'Inter', sans-serif" }}
            placeholder={traducir("close.person.notesPlaceholder")}
          />
        </div>
      </div>
    </Panel>
  );
}

/* ── La vista ──────────────────────────────────────────────────────────── */

export default function CierreDiagnostico({ params, onNavigate }) {
  /* El código del puente elige la frase; el detalle va debajo. Ver `@/i18n`. */
  const mensajeDeError = useMensajeDeError();
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["maintenance", "navigation", "common", "errors"]);
  /* El nombre de la máquina, traducido: `shared/` lo declara en español. */
  const { sistema: nombreSistema, canal } = useDominio();
  /*
   * El riesgo del que se abrió el caso, en el idioma de la pantalla. Se
   * traduce por catálogo porque son dos: las reglas del tanque y las de
   * vibración las escriben dos evaluadores distintos. Ver `useProsa`.
   */
  const { riesgo: traducirRiesgo, riesgoVibracion: traducirRiesgoVibracion,
    noEvaluable: tituloDeRegla, noEvaluableVibracion: tituloDeReglaVibracion } = useProsa();
  const { theme: t } = useTheme();
  /* El id de la máquina de la URL. Lo que no es el tanque es una máquina
     CONFIGURADA (Plan 38 F2, Plan 40 F2), que llega con `?maquina=<id>` para
     que `useDominioVibracion` lea la suya. */
  const sistemaId = params?.sistema ?? "tanque";
  const esConfigurada = sistemaId !== "tanque";
  const paramsRiesgos = esConfigurada ? { maquina: sistemaId } : {};
  const riesgoId = params?.riesgoId ?? "";

  /*
   * La ruta a la que se vuelve, y su nombre. El botón dice el nombre de la
   * pantalla destino tal y como lo pinta el sidebar, en vez de un «Riesgos»
   * escrito aquí que puede dejar de coincidir.
   */
  /* El tanque perdió su pantalla de Riesgos en el Plan 42.5 F4; entrará por
     configuración (Plan 43) y usará la genérica como las demás. */
  const rutaRiesgos = "maq-riesgos";
  const nombreRiesgos = traducir(`navigation:routes.${rutaRiesgos}.nav`);

  // Sólo se suscribe a la máquina que corresponde: un caso de vibraciones no
  // necesita sondear el tanque mientras se rellena este formulario, y
  // viceversa.
  const agua = useSistemaAgua();
  const vibracion = useDominioVibracion();

  const activosTanque = useMemo(
    () => (sistemaId === "tanque" ? evaluarRiesgos(agua.sistema).activos : []),
    [sistemaId, agua.sistema]
  );
  const activosVibracion = useMemo(
    () => (sistemaId !== "tanque"
      ? evaluarRiesgosVibracion({ canales: vibracion.canales, variador: vibracion.variador, alarmas: vibracion.alarmas }).activos
      : []),
    [sistemaId, vibracion.canales, vibracion.variador, vibracion.alarmas]
  );

  const definicion = useMemo(() => {
    const reglas = sistemaId === "tanque" ? REGLAS_TANQUE : REGLAS_VIBRACION;
    return reglas.find((r) => r.id === riesgoId) ?? null;
  }, [sistemaId, riesgoId]);

  /*
   * En vibraciones el MISMO `riesgoId` puede estar activo en varios apoyos a
   * la vez (`vibracion-en-alarma` en S1 y en S3, por ejemplo) — sin filtrar
   * por `canalLabel` se podría coger el apoyo equivocado, uno que no es del
   * que se acaba de intervenir. `canalLabel` viaja en los parámetros de
   * navegación desde la tarjeta que abrió esta pantalla porque, a
   * diferencia de la muestra de sensores, es texto y sí sobrevive el viaje
   * por la URL.
   */
  const activo = sistemaId === "tanque"
    ? activosTanque.find((r) => r.id === riesgoId)
    : activosVibracion.find((r) => r.id === riesgoId && (!params?.canalLabel || r.canalLabel === params.canalLabel));

  /*
   * El mismo riesgo, ya dicho en el idioma de la pantalla. `definicion` y
   * `activo` se quedan en español y no se sustituyen: de ellos salen la
   * severidad y el título que se ARCHIVAN en la bitácora, y eso tiene que
   * seguir siendo español para que el motor lo vuelva a encontrar después.
   */
  const tituloDelRiesgo = definicion
    ? (sistemaId === "tanque" ? tituloDeRegla(definicion) : tituloDeReglaVibracion(definicion)).titulo
    : null;
  const riesgoTraducido =
    sistemaId === "tanque" ? traducirRiesgo(activo) : traducirRiesgoVibracion(activo);

  const muestraSensores = useMemo(() => {
    if (sistemaId === "tanque") {
      return Object.fromEntries(
        Object.entries(agua.sistema?.senales ?? {})
          .filter(([, s]) => s.valor !== null && s.valor !== undefined)
          .map(([clave, s]) => [clave, s.valor])
      );
    }
    const snapshot = {};
    for (const [canalId, c] of Object.entries(vibracion.canales ?? {})) {
      if (typeof c?.aRMS === "number") snapshot[`${canalId}_aRMS`] = c.aRMS;
      if (typeof c?.vRMS === "number") snapshot[`${canalId}_vRMS`] = c.vRMS;
    }
    if (typeof vibracion.variador?.velocidad === "number") snapshot.velocidad = vibracion.variador.velocidad;
    return snapshot;
  }, [sistemaId, agua.sistema, vibracion.canales, vibracion.variador]);

  /**
   * La misma muestra, pero CON la calidad de cada señal — Plan 28 F4.
   *
   * ── POR QUÉ DOS Y NO UNA ────────────────────────────────────────────
   *
   * `muestraSensores` viaja al CERRAR el caso y se archiva en
   * `aprendizaje.json` con la forma plana `{clave: número}` que tiene desde el
   * Plan 16 F5. Cambiarla rompería todo lo que ya la lee — es el mismo
   * criterio por el que `solucion` siguió siendo texto y no un objeto.
   *
   * Ésta viaja al PEDIR el diagnóstico, y lleva `motivo` además del valor
   * porque el motor lo necesita para vetar: una señal cuya calidad no es buena
   * no respalda nada (§2.4 — un sensor inválido es ausencia de evidencia, no
   * evidencia débil). `createSenal` ya resolvió esa calidad al recibir el
   * valor, así que aquí sólo hay que dejar de tirarla al aplanar.
   *
   * Sólo para el tanque: `useVibracion` no expone la calidad por canal, así
   * que inventarle un `motivo: null` afirmaría que es buena sin haberlo
   * medido. Sin el campo, el motor la trata como «no consta» y no veta, que es
   * lo honesto.
   */
  const muestraConCalidad = useMemo(() => {
    if (sistemaId !== "tanque") return null;
    return Object.fromEntries(
      Object.entries(agua.sistema?.senales ?? {})
        .filter(([, s]) => s.valor !== null && s.valor !== undefined)
        .map(([clave, s]) => [clave, { valor: s.valor, motivo: s.motivo ?? null }])
    );
  }, [sistemaId, agua.sistema]);

  /* ── El diagnóstico calculado (GET /api/diagnostico) ────────────────── */

  const [diagnostico, setDiagnostico] = useState({ loading: true, error: null, data: null });

  // Ver el comentario de `valoresSensores` en el efecto de abajo: la muestra
  // se lee por ref para que el sondeo no relance el diagnóstico.
  const muestraRef = useRef(muestraConCalidad);
  muestraRef.current = muestraConCalidad;

  useEffect(() => {
    if (!riesgoId) {
      setDiagnostico({ loading: false, error: traducir("maintenance:close.missingRisk.error"), data: null });
      return undefined;
    }
    const control = new AbortController();
    setDiagnostico((d) => ({ ...d, loading: true, error: null }));
    obtenerDiagnostico({
      sistema: sistemaId,
      riesgoId,
      /*
       * La muestra se lee de una REF y no de la dependencia del efecto, y es
       * deliberado: `muestraConCalidad` cambia con cada sondeo —cada tres
       * segundos en el tanque—, así que ponerla en el array de dependencias
       * relanzaría el diagnóstico continuamente. Lo que se quiere es la
       * muestra del INSTANTE en que se abrió la pantalla, que es la que
       * acompaña a este diagnóstico concreto.
       */
      valoresSensores: muestraRef.current,
      signal: control.signal,
    })
      .then((data) => setDiagnostico({ loading: false, error: null, data }))
      .catch((e) => {
        if (e.name === "AbortError") return;
        /*
         * Se guarda el ERROR entero, no su `.message`: aplanarlo aquí tiraba el
         * `codigo` que manda el puente y con él la única forma de traducir el fallo.
         * Quien lo pinta pasa por `useMensajeDeError`.
         */
        setDiagnostico({ loading: false, error: e, data: null });
      });
    return () => control.abort();
  }, [sistemaId, riesgoId, traducir]);

  /*
   * ── POR QUÉ ESTO ES UN MEMO Y NO UN `?? []` SUELTO ───────────────────
   *
   * `?? []` construye un array NUEVO en cada render, y esta lista viaja como
   * dependencia de un efecto (la preselección de más abajo) y de un
   * `useCallback` (el envío). Con una identidad distinta cada vez, los dos se
   * rehacían en cada render en lugar de cuando cambia el diagnóstico — que es
   * lo que ESLint venía avisando.
   *
   * No era un fallo visible: el efecto está guardado por `!causaId`, así que
   * preselecciona una vez y las repeticiones no hacen nada. Pero deja el
   * efecto corriendo en cada pulsación de tecla del formulario, y basta con
   * que alguien le quite esa guarda para que empiece a pisar lo que el técnico
   * eligió a mano.
   *
   * El array vacío se saca a una constante de módulo por lo mismo: un literal
   * aquí volvería a cambiar de identidad cuando no hay causas.
   */
  const causasCandidatas = useMemo(
    () => diagnostico.data?.causas ?? SIN_CAUSAS,
    [diagnostico.data]
  );
  const diagnosticEventId = diagnostico.data?.diagnosticEventId ?? null;

  /* ── Lo que aporta la persona ────────────────────────────────────────── */

  const [causaId, setCausaId] = useState("");
  const [causaLibre, setCausaLibre] = useState("");
  const [componenteLibre, setComponenteLibre] = useState("");
  const [solucion, setSolucion] = useState("");
  const [resuelto, setResuelto] = useState(true);
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const [cerrado, setCerrado] = useState(false);

  /*
   * En cuanto llega la propuesta, se pre-selecciona la primera — «nadie teclea
   * el diagnóstico»: confirmarlo es un caso de no tocar nada.
   *
   * ── POR QUÉ UNA MARCA Y NO `!causaId` (15-09-2026) ───────────────────
   *
   * La guarda era `!causaId`, y se apoyaba sin saberlo en un defecto: la lista
   * de candidatas cambiaba de identidad en CADA render, así que este efecto se
   * re-ejecutaba continuamente y siempre llegaba antes de que nadie pudiera
   * tocar nada. Al memoizar la lista, el efecto pasó a correr una sola vez —y
   * apareció la carrera que el defecto tapaba—: si el efecto se ejecuta DESPUÉS
   * de que la persona ya eligió, `causaId` vale «__otra__», `!causaId` es falso
   * y no pisa nada... pero sólo por suerte. El orden lo decidía el temporizado,
   * y CI lo destapó en `cierre-diagnostico.test.jsx` mientras en local pasaba.
   *
   * La marca hace la intención explícita: preseleccionar es algo que ocurre UNA
   * vez por diagnóstico cargado, no «mientras no haya nada elegido». Se reinicia
   * con el `diagnosticEventId`, que es lo que identifica una carga concreta:
   * pedir otro riesgo vuelve a proponer, y eso sí se quiere.
   */
  const yaPreseleccionado = useRef(null);
  useEffect(() => {
    if (!causasCandidatas.length) return;
    if (yaPreseleccionado.current === diagnosticEventId) return;
    yaPreseleccionado.current = diagnosticEventId;
    setCausaId(causasCandidatas[0].id);
  }, [causasCandidatas, diagnosticEventId]);

  const causaSeleccionada = causasCandidatas.find((c) => c.id === causaId) ?? null;

  const puedeEnviar = solucion.trim().length >= 8
    && (causaId === OTRA_CAUSA ? causaLibre.trim().length > 0 : Boolean(causaId));

  const enviar = useCallback(async () => {
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const canalLabel = activo?.canalLabel || params?.canalLabel || "";
      const titulo = `${definicion?.titulo ?? traducir("maintenance:close.system.risk")}${canalLabel ? ` — ${canalLabel}` : ""}`;
      const sintoma = activo?.evidencia ? `${titulo}. ${activo.evidencia}` : titulo;
      const propuestaSistema = causasCandidatas[0] ?? null;

      await registrarCaso({
        sistema: sistemaId,
        sintoma,
        /*
         * El título SIN traducir. Lo que se guarda en la bitácora lo vuelve a
         * leer el motor para respaldar causas futuras, y ese índice está
         * construido sobre el corpus en español: guardar el título traducido
         * rompería la coincidencia. Lo que ve la persona sí va traducido —es
         * la pantalla—; lo que se archiva es el dato.
         */
        causa: causaId === OTRA_CAUSA ? causaLibre.trim() : causaSeleccionada?.titulo,
        solucion: solucion.trim(),
        resuelto,
        disparador: { tipo: "riesgo", riesgoId, severidad: definicion?.severidad ?? definicion?.nivel ?? null },
        ...(Object.keys(muestraSensores).length > 0 ? { muestraSensores } : {}),
        ...(propuestaSistema
          ? {
            diagnostico: {
              propuesta: propuestaSistema.id,
              respaldo: propuestaSistema.banda,
              manualCitado: propuestaSistema.manualCitado ?? [],
              // Plan 17 Fase 5 (G10): antes se perdía al cerrar el caso —
              // "qué casos se citaron" era irrecuperable pasado el momento
              // del diagnóstico. `casosCitados` ya trae el resumen, no sólo
              // el id.
              casosCitados: propuestaSistema.casosCitados ?? [],
              // Correlaciona este cierre con el momento exacto en que se
              // pidió el diagnóstico, aunque el contenido sea determinista.
              ...(diagnosticEventId ? { diagnosticEventId } : {}),
              // El top-N completo con sus puntuaciones, no sólo la
              // ganadora: antes de esta fase, un diagnóstico con varias
              // candidatas cercanas sólo dejaba rastro de la primera.
              candidatas: causasCandidatas.map((c) => ({
                id: c.id, banda: c.banda, respaldo: c.respaldo,
              })),
            },
          }
          : {}),
        /*
         * ── `tipo` MÁS LA SEPARACIÓN `id`/`texto` (PLAN 28 F6) ───────
         *
         * Ésta es la pantalla donde la distinción es CIERTA: o la persona
         * eligió una candidata del catálogo, o escribió la suya en «Otra
         * causa». Perderla aquí obligaba a cada consumidor a adivinar después
         * si `tipo` era un id o texto libre — y `respaldoDeCasos()`, que
         * compara `causaReal.id === causa.id` para CONFIRMAR una causa, con
         * texto libre no fallaba: simplemente no acertaba nunca.
         *
         * `tipo` se sigue mandando para los lectores que no pasan por
         * `causaRealDe()`. `id: null` dice «no era ninguna de las candidatas»,
         * que es distinto de «no se declaró».
         */
        causaReal: causaId === OTRA_CAUSA
          ? {
            tipo: causaLibre.trim(),
            id: null,
            texto: causaLibre.trim(),
            ...(componenteLibre.trim() ? { componente: componenteLibre.trim() } : {}),
          }
          : {
            tipo: causaSeleccionada?.id,
            id: causaSeleccionada?.id ?? null,
            texto: causaSeleccionada?.titulo ?? causaSeleccionada?.id ?? null,
            componente: causaSeleccionada?.componente,
          },
        /*
         * El componente sube también al nivel de la intervención (no sólo
         * dentro de `causaReal`): es lo que `textoDeRecuperacion` indexa, y lo
         * que hace que buscar «el filtro de la línea» encuentre este caso
         * aunque su síntoma se pareciera poco.
         */
        ...(causaId === OTRA_CAUSA
          ? (componenteLibre.trim() ? { componente: componenteLibre.trim() } : {})
          : (causaSeleccionada?.componente ? { componente: causaSeleccionada.componente } : {})),
        resultado: observaciones.trim() ? { observaciones: observaciones.trim() } : undefined,
        // Sólo se afirma cuando hay con qué comparar: sin propuesta del
        // sistema —riesgo huérfano de causas—, no hay «correcto» que evaluar.
        ...(propuestaSistema ? { diagnosticoCorrecto: causaId === propuestaSistema.id } : {}),
      });
      setCerrado(true);
    } catch (e) {
      setErrorEnvio(e);
    } finally {
      setEnviando(false);
    }
  }, [
    sistemaId, riesgoId, definicion, activo, params, causasCandidatas, diagnosticEventId, causaId, causaLibre,
    componenteLibre, causaSeleccionada, solucion, resuelto, observaciones, muestraSensores, traducir,
  ]);

  if (!riesgoId) {
    return (
      <>
        <Cabecera traducir={traducir} />
        <AlertBanner
          type="error"
          title={traducir("maintenance:close.missingRisk.title")}
          message={traducir("maintenance:close.missingRisk.message")}
        />
      </>
    );
  }

  if (cerrado) {
    return (
      <>
        <Cabecera traducir={traducir} />
        <Panel>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <CheckCircle2 size={22} color={t.success} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>
                {traducir("maintenance:close.done.title")}
              </div>
              <div style={{ fontSize: 12.5, color: t.textSoft, marginTop: 2 }}>
                {traducir("maintenance:close.done.message")}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <Button
              variant="secondary"
              icon={<ChevronLeft size={14} />}
              onClick={() => onNavigate?.(rutaRiesgos, paramsRiesgos)}
            >
              {traducir("maintenance:close.done.back", { pantalla: nombreRiesgos })}
            </Button>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      <Cabecera traducir={traducir} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ZonaSistema
          t={t}
          sistemaNombre={nombreSistema(sistemaId)}
          tituloRiesgo={tituloDelRiesgo}
          /*
            Cuando el riesgo ya no está activo sólo queda el rótulo que viajó
            por la URL, que es español: no hay id del que sacar el nombre del
            apoyo, y echarlo de menos sería peor que enseñarlo tal cual.
          */
          canalLabel={activo?.canal ? canal(activo.canal) : (params?.canalLabel || "")}
          evidencia={riesgoTraducido?.evidencia ?? null}
          activo={Boolean(activo)}
          muestraSensores={muestraSensores}
          diagnostico={diagnostico}
        />

        <ZonaPersona
          t={t}
          causas={causasCandidatas}
          causaId={causaId}
          setCausaId={setCausaId}
          causaLibre={causaLibre}
          setCausaLibre={setCausaLibre}
          componenteLibre={componenteLibre}
          setComponenteLibre={setComponenteLibre}
          solucion={solucion}
          setSolucion={setSolucion}
          resuelto={resuelto}
          setResuelto={setResuelto}
          observaciones={observaciones}
          setObservaciones={setObservaciones}
        />

        {errorEnvio && (
          <AlertBanner
            type="error"
            title={traducir("errors:titles.caseCloseFailed")}
            message={mensajeDeError(errorEnvio).titulo}
            detalle={mensajeDeError(errorEnvio).detalle}
            accion={mensajeDeError(errorEnvio).accion}
          />
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" icon={<ClipboardCheck size={14} />} loading={enviando} disabled={!puedeEnviar} onClick={enviar}>
            {traducir("maintenance:close.submit")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => onNavigate?.(rutaRiesgos, paramsRiesgos)}
          >
            {traducir("common:actions.cancel")}
          </Button>
        </div>
      </div>
    </>
  );
}
