/**
 * Salud del sistema — una fila por servicio, y qué falta cuando falta.
 *
 * ── POR QUÉ ESTA PANTALLA ──────────────────────────────────────────
 *
 * Porque `/api/health` ya sabía casi todo esto y no lo miraba nadie. Cuando
 * alguien dice «va raro», el primer paso era entrar por SSH y leer logs — y lo
 * que se busca ahí son cuatro cosas: si se llega a ICONICS, si el token vale,
 * si el asistente está montado y con qué modelo, y si el índice de manuales
 * llegó a cargarse.
 *
 * ── LA FILA MÁS IMPORTANTE ES LA PRIMERA ───────────────────────────
 *
 * `ICONICS_FAKE=true` es el estado en el que NINGÚN dato es real. Va arriba,
 * en ámbar y con la frase entera, no como una etiqueta discreta: una pantalla
 * de planta con datos simulados y sin avisar es peor que una pantalla apagada.
 *
 * ── «NO CONFIGURADO» NO SE PINTA EN ROJO ───────────────────────────
 *
 * Una instalación mínima —sin asistente, sin dictado, sin manuales— es
 * legítima y permanente (`CLAUDE.md` §2.5: un servidor sin una pieza montada se
 * niega y explica qué falta). Pintarla en rojo enseñaría a ignorar el rojo. Se
 * pinta en gris y con la variable de entorno que lo encendería, que es lo único
 * accionable.
 *
 * ── ESTA VISTA NO SABE DE MÁQUINAS ─────────────────────────────────
 *
 * Va en `comunes/` porque no pertenece a ninguna instalación: habla del PUENTE,
 * no del tanque ni de vibraciones. Es el mismo criterio por el que Documentación
 * y Casos viven ahí (ver `CLAUDE.md` §4.4).
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, AlertTriangle, CheckCircle2, FlaskConical, MinusCircle, RefreshCw, XCircle } from "lucide-react";

import { AlertBanner, Panel, SectionLabel } from "@/components/ui/index.js";
import { fetchHealth } from "@/lib/iconics/apiClient.js";
import { useTheme } from "@/theme";

import { MONO, SANS } from "../../components/base.jsx";

/** Cada cuánto se relee. Es una pantalla de diagnóstico: se mira y se cierra. */
const CADENCIA_MS = 10_000;

/**
 * Cómo se pinta cada estado.
 *
 * `simulado` tiene su propio tratamiento y no reutiliza el de aviso: no es que
 * algo vaya mal, es que lo que se ve no es la planta.
 */
function aspectoDe(estado, t) {
  switch (estado) {
    case "ok":
      return { color: t.success, fondo: t.successSoft, Icono: CheckCircle2, clave: "ok" };
    case "simulado":
      return { color: t.amber, fondo: t.amberSoft, Icono: FlaskConical, clave: "simulado" };
    case "degraded":
      return { color: t.amber, fondo: t.amberSoft, Icono: AlertTriangle, clave: "degraded" };
    case "no_responde":
      /*
       * Rojo, y con texto propio. «No responde» y «Con problemas» no son lo
       * mismo: el primero se arregla levantando ese servicio y el segundo hay
       * que investigarlo. Antes este estado no existía y estos servicios se
       * pintaban en VERDE —bastaba con tener su variable de entorno puesta—,
       * así que el panel daba por funcionando un llama-server caído mientras
       * el chat, en la misma pantalla, decía que no podía contactarlo.
       */
      return { color: t.coral, fondo: t.coralSoft, Icono: XCircle, clave: "noResponse" };
    case "no_configurado":
      return { color: t.textFaint, fondo: t.hover, Icono: MinusCircle, clave: "notConfigured" };
    default:
      return { color: t.coral, fondo: t.coralSoft, Icono: AlertTriangle, clave: "problems" };
  }
}

/** Una línea de dato dentro de la fila de un servicio. */
function Dato({ etiqueta, valor, t }) {
  if (valor === null || valor === undefined || valor === "") return null;
  return (
    <span style={{ fontSize: 12, color: t.textSoft }}>
      <span style={{ color: t.textFaint }}>{etiqueta}: </span>
      <span style={{ fontFamily: MONO, color: t.text }}>{String(valor)}</span>
    </span>
  );
}

function FilaServicio({ servicio, t, children }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("settings");
  const { color, fondo, Icono, clave } = aspectoDe(servicio.estado, t);
  const texto = traducir(`health.state.${clave}`);

  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        padding: "14px 0",
        borderBottom: `1px solid ${t.border}`,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 9,
          background: fondo,
          color,
          flexShrink: 0,
        }}
      >
        <Icono size={17} strokeWidth={2} />
      </span>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: t.text, fontFamily: SANS }}>
            {servicio.nombre}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color }}>{texto}</span>
        </div>

        {servicio.detalle && (
          <p style={{ margin: 0, fontSize: 12.5, color: t.textSoft, lineHeight: 1.5 }}>
            {servicio.detalle}
          </p>
        )}

        {/* La variable que lo encendería. Es lo único accionable de un servicio
            que no está configurado, así que se enseña con su nombre exacto. */}
        {servicio.variable && (
          <p style={{ margin: 0, fontSize: 12, color: t.textFaint }}>
            {traducir("health.enabledWith")}{" "}
            <code style={{ fontFamily: MONO, color: t.text }}>{servicio.variable}</code>{" "}
            {traducir("health.inServerEnv")}
          </p>
        )}

        {children && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 2 }}>{children}</div>
        )}
      </div>
    </div>
  );
}

function SaludSistema() {
  const { theme: t } = useTheme();
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["settings", "errors"]);
  const [salud, setSalud] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const leer = useCallback(async () => {
    try {
      const respuesta = await fetchHealth();
      setSalud(respuesta);
      setError(null);
    } catch (e) {
      /*
       * Que ESTA pantalla no cargue es en sí mismo el diagnóstico: si
       * `/api/health` no contesta, el puente no está en pie. Se dice con esas
       * palabras en vez de con un «error al cargar» genérico.
       */
      /*
       * Se guarda el ERROR entero, no su `.message`: aplanarlo aquí tiraba el
       * `codigo` que manda el puente y con él la única forma de traducir el fallo.
       * Quien lo pinta pasa por `useMensajeDeError`.
       */
      setError(e);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    leer();
    const id = setInterval(leer, CADENCIA_MS);
    return () => clearInterval(id);
  }, [leer]);

  const servicios = salud?.servicios ?? {};
  const asistente = servicios.asistente;
  const documentacion = servicios.documentacion;

  /** El estado del puente contra ICONICS, en la misma forma que los demás. */
  const puente = salud && {
    nombre: traducir("settings:health.bridge.name"),
    estado: salud.status === "ok" ? "ok" : salud.status,
    detalle:
      salud.status === "ok"
        ? traducir("settings:health.bridge.ok")
        : salud.status === "degraded"
          ? traducir("settings:health.bridge.degraded")
          : traducir("settings:health.bridge.unreachable", { motivo: salud.reason ? `: ${salud.reason}` : "" }),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <SectionLabel sub={traducir("settings:health.sub")}>
        Salud del sistema
      </SectionLabel>

      {error && (
        <AlertBanner
          type="error"
          title={traducir("errors:titles.bridgeDown")}
          message={
            `${error}. Si esta pantalla no carga, el problema no es de una vista: es el propio ` +
            "servidor. Comprueba que el backend esté arrancado y que se le llegue por red."
          }
        />
      )}

      {cargando && !salud && (
        <p style={{ fontSize: 13, color: t.textFaint }}>{traducir("settings:health.loading")}</p>
      )}

      {salud && (
        <>
          <Panel
            title={traducir("settings:health.services")}
            right={
              <button
                type="button"
                onClick={leer}
                aria-label={traducir("settings:health.refresh")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 11px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid ${t.border}`,
                  background: t.hover,
                  color: t.textSoft,
                }}
              >
                <RefreshCw size={13} />
                Actualizar
              </button>
            }
          >
            {servicios.datos && (
              <FilaServicio servicio={servicios.datos} t={t}>
                <Dato
                  etiqueta={traducir("settings:health.fields.write")}
                  valor={traducir(servicios.datos.soloLectura ? "settings:health.values.blocked" : "settings:health.values.enabled")}
                  t={t}
                />
              </FilaServicio>
            )}

            {puente && (
              <FilaServicio servicio={puente} t={t}>
                <Dato etiqueta={traducir("settings:health.fields.reachable")} valor={traducir(salud.iconicsReachable ? "settings:health.values.yes" : "settings:health.values.no")} t={t} />
                <Dato etiqueta={traducir("settings:health.fields.token")} valor={traducir(salud.tokenValid ? "settings:health.values.valid" : "settings:health.values.invalid")} t={t} />
              </FilaServicio>
            )}

            {asistente && (
              <FilaServicio servicio={asistente} t={t}>
                <Dato etiqueta={traducir("settings:health.fields.model")} valor={asistente.modelo} t={t} />
                <Dato etiqueta={traducir("settings:health.fields.maxSteps")} valor={asistente.maxPasos} t={t} />
                {asistente.cola && (
                  <>
                    <Dato
                      etiqueta={traducir("settings:health.fields.serving")}
                      valor={traducir(asistente.cola.atendiendo ? "settings:health.values.oneQuery" : "settings:health.values.nothing")}
                      t={t}
                    />
                    <Dato etiqueta={traducir("settings:health.fields.queued")} valor={asistente.cola.enEspera} t={t} />
                  </>
                )}
              </FilaServicio>
            )}

            {servicios.dictado && (
              <FilaServicio servicio={servicios.dictado} t={t}>
                <Dato etiqueta="Idioma" valor={servicios.dictado.idioma} t={t} />
              </FilaServicio>
            )}

            {documentacion && (
              <FilaServicio servicio={documentacion} t={t}>
                <Dato etiqueta="Manuales" valor={documentacion.documentos} t={t} />
                <Dato etiqueta="Fragmentos" valor={documentacion.fragmentos} t={t} />
                <Dato etiqueta="Búsqueda" valor={documentacion.modo} t={t} />
                {documentacion.ilegibles > 0 && (
                  <Dato etiqueta="Ilegibles" valor={documentacion.ilegibles} t={t} />
                )}
                {documentacion.indexando && <Dato etiqueta="Estado" valor="indexando…" t={t} />}
              </FilaServicio>
            )}
          </Panel>

          <Panel title="Este servidor" style={{ marginTop: 14 }}>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              {/* La versión es lo primero que hace falta cuando alguien reporta
                  que un número está mal: saber si esa pantalla ya tiene el
                  arreglo. Ver `config.version`. */}
              <Dato etiqueta="Versión" valor={salud.version} t={t} />
              <Dato etiqueta="En marcha desde hace" valor={enPalabras(salud.uptimeSeconds)} t={t} />
              <Dato
                etiqueta="Última consulta"
                valor={new Date(salud.timestamp).toLocaleTimeString("es")}
                t={t}
              />
            </div>
          </Panel>

          <p
            style={{
              margin: "14px 2px 0",
              fontSize: 11.5,
              color: t.textFaint,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Activity size={12} />
            Se relee cada {CADENCIA_MS / 1000} s. Un servicio «no configurado» no es una avería:
            es una instalación que no lo tiene montado.
          </p>
        </>
      )}
    </div>
  );
}

/** Segundos → «3 h 12 min». Sin decimales: nadie los lee en un uptime. */
function enPalabras(segundos) {
  if (!Number.isFinite(segundos)) return null;
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);

  if (dias) return `${dias} d ${horas} h`;
  if (horas) return `${horas} h ${minutos} min`;
  return `${minutos} min`;
}

export default SaludSistema;
