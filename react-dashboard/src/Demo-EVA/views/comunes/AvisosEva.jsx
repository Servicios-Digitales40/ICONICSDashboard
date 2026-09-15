/**
 * Vista «Avisos» — los hallazgos del momento, diagnosticados y narrados
 * (Plan 31 F2).
 *
 * ── POR QUÉ ES UNA VISTA NUEVA Y NO UNA PESTAÑA DE LA BANDEJA ───────
 *
 * Porque el tono es distinto y mezclarlos estropea los dos. La Bandeja es un
 * INVENTARIO —«esto está pendiente de mirar», una lista que puede ser larga y
 * que se repasa—; esto es un AVISO —«oye, mira esto»—. Juntos, o la lista larga
 * se lee con la urgencia del aviso, o el aviso se pierde en una lista.
 *
 * ── EL MODELO NARRA, NO DIAGNOSTICA (§2.3) ──────────────────────────
 *
 * Esta pantalla no le pide al modelo que averigüe nada. El motor ya decidió las
 * causas, su orden y su banda; el modelo sólo las pone en una frase. La
 * diferencia no es de estilo: el 03-09-2026 el modelo escribió «3 casos
 * previos» sobre un diagnóstico con `respaldo.casos` en 0 **en el mismo
 * objeto**. Si se le deja presentar la conclusión como suya, la inventa cuando
 * no la tiene.
 *
 * Por eso la narración va SIEMPRE acompañada del diagnóstico determinista —la
 * causa, su banda— y nunca sola. Si el párrafo y la ficha se contradijeran, la
 * ficha es la que vale, y quien mira puede verlo.
 *
 * ── SIN SERVIDOR DE IA, LA VISTA SIGUE SIRVIENDO ────────────────────
 *
 * Es la condición que hace aceptable meter un modelo aquí. Sin `IA_BASE`, con
 * el servidor caído o con una respuesta vacía, se enseña el diagnóstico sin
 * narrar y se dice por qué. La narración es el adorno; el diagnóstico es el
 * dato. Lo contrario —una pantalla en blanco porque el modelo no contestó—
 * convertiría una mejora en una fragilidad nueva.
 *
 * ── UN AVISO NO ACCIONA PLANTA (§2.2 del plan) ──────────────────────
 *
 * Mismo criterio que ya defiende `BandejaEva`: se NAVEGA a donde se puede
 * actuar, no hay botón propio de maniobra. Y el texto tampoco manda accionar —
 * la instrucción del narrador lo prohíbe explícitamente.
 *
 * ── POR QUÉ SE DIAGNOSTICA AL ABRIR, Y NO AL ACTIVARSE EL RIESGO ────
 *
 * Porque cada aviso cuesta una llamada al modelo (30-90 s con el 4B), y aquí
 * hay alguien delante esperándola. Generar en cada flanco lo pagaría siempre,
 * mire alguien o no, y un riesgo que parpadea lo multiplicaría — que es por lo
 * que el contador de alarmas del Topbar está retirado desde el 31-08-2026. Ver
 * Plan 31 §2.3.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Info, MessageSquareText, ShieldAlert } from "lucide-react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { useProsa } from "@/i18n/useProsa.js";
import { useDominio } from "@/i18n/useDominio.js";
import { useTheme } from "@/theme";
import { obtenerDiagnosticoNarrado } from "@/lib/api/casosApi.js";

import { useSistemaAgua } from "../../data/comunes/hooks.js";
import { useVibracion } from "../../data/vibraciones/vibracion.js";
import { evaluarRiesgos } from "../../domain/riesgos.js";
import { evaluarRiesgosVibracion } from "../../domain/riesgosVibracion.js";

const SEVERIDAD_TOKEN = {
  critico: { token: "coral", suave: "coralSoft", Icono: AlertTriangle },
  atencion: { token: "amber", suave: "amberSoft", Icono: AlertTriangle },
  informativo: { token: "accent", suave: "accentSoft", Icono: Info },
};
const SEVERIDAD_DEFECTO = { token: "accent", suave: "accentSoft", Icono: ShieldAlert };

/* Mismo mapa y mismos rótulos que `CierreDiagnostico` y `BandejaEva`. */
const BANDA_TOKEN = { alto: "coral", medio: "amber", bajo: "textFaint" };

/**
 * Pide el diagnóstico narrado de cada riesgo activo, AL MONTAR.
 *
 * ── DE UNO EN UNO, NO EN PARALELO ───────────────────────────────────
 *
 * Al revés que la Bandeja, que lanza sus diagnósticos con `Promise.all`. La
 * diferencia es que allí son llamadas deterministas de milisegundos y aquí cada
 * una ocupa el modelo durante decenas de segundos. Cuatro en paralelo contra un
 * llama-server que atiende de una en una no van más rápido: hacen cola igual
 * —ver `ia/conversacion/cola.mjs`— y además dejarían la pantalla entera vacía
 * hasta que terminara la última.
 *
 * De una en una, el primer aviso aparece en cuanto está listo y los demás van
 * cayendo. Con alguien mirando, eso es lo que importa.
 *
 * ── SE PIDE UNA VEZ POR MONTAJE, NO EN CADA SONDEO ──────────────────
 *
 * La lista de riesgos activos cambia de identidad en cada lectura de ICONICS
 * (cada pocos segundos), pero lo que importa es QUÉ riesgos son. La dependencia
 * es la lista de ids en texto; si fueran los objetos, cada sondeo relanzaría
 * todas las narraciones y la pantalla no terminaría nunca.
 */
function useAvisosNarrados(riesgosPorSistema, idioma) {
  const [avisos, setAvisos] = useState([]);
  const [cargando, setCargando] = useState(true);

  /* La clave de identidad: qué riesgos, no qué objetos. */
  const clave = useMemo(
    () =>
      riesgosPorSistema
        .flatMap(({ sistema, activos }) => activos.map((r) => `${sistema}:${r.id}`))
        .join("|"),
    [riesgosPorSistema]
  );

  /*
   * Los riesgos se leen por referencia y NO son dependencia del efecto: su
   * identidad cambia en cada sondeo aunque sean los mismos riesgos, y meterlos
   * relanzaría todas las narraciones cada pocos segundos. `clave` es la
   * dependencia real.
   */
  const refRiesgos = useRef(riesgosPorSistema);
  refRiesgos.current = riesgosPorSistema;

  useEffect(() => {
    if (!clave) {
      setAvisos([]);
      setCargando(false);
      return undefined;
    }

    const control = new AbortController();
    let vivo = true;
    setCargando(true);
    setAvisos([]);

    (async () => {
      for (const { sistema, activos } of refRiesgos.current) {
        for (const riesgo of activos) {
          if (!vivo) return;
          try {
            const data = await obtenerDiagnosticoNarrado({
              sistema, riesgoId: riesgo.id, idioma, signal: control.signal,
            });
            if (!vivo) return;
            setAvisos((previos) => [...previos, { sistema, riesgo, diagnostico: data, error: null }]);
          } catch (error) {
            if (!vivo || error.name === "AbortError") return;
            /*
             * Un riesgo que falló se enseña IGUAL, con su evidencia y sin
             * diagnóstico. Saltárselo escondería un riesgo activo por un fallo
             * de red — exactamente al revés de lo que tiene que hacer una
             * pantalla de avisos.
             */
            setAvisos((previos) => [...previos, { sistema, riesgo, diagnostico: null, error }]);
          }
        }
      }
      if (vivo) setCargando(false);
    })();

    return () => {
      vivo = false;
      control.abort();
    };
  }, [clave, idioma]);

  return { avisos, cargando };
}

/** Un aviso: el riesgo, su narración y la ficha determinista debajo. */
function Aviso({ aviso, t, traducir, traducirCausa, nombreSistema, textoDeRiesgo, onNavigate }) {
  const { sistema, riesgo, diagnostico } = aviso;
  const sev = SEVERIDAD_TOKEN[riesgo.severidad] ?? SEVERIDAD_DEFECTO;
  const { Icono } = sev;

  const causa = diagnostico?.causas?.[0] ?? null;
  const banda = BANDA_TOKEN[causa?.banda] ?? BANDA_TOKEN.bajo;

  return (
    <li
      style={{
        background: t.panel, border: `1px solid ${t.border}`,
        borderLeft: `4px solid ${t[sev.token]}`,
        borderRadius: 12, padding: 16,
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Icono size={18} color={t[sev.token]} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.textFaint, textTransform: "uppercase" }}>
              {nombreSistema(sistema)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>{textoDeRiesgo.titulo}</p>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: t.textSoft }}>{textoDeRiesgo.evidencia}</p>
        </div>
      </div>

      {/*
        LA NARRACIÓN. Va marcada como tal —icono y fondo propio— para que nunca
        se confunda con el dato: lo de arriba lo midió la planta, esto lo
        escribió un modelo sobre lo que el motor decidió.
      */}
      {diagnostico?.narracion && (
        <div
          style={{
            display: "flex", gap: 9, alignItems: "flex-start",
            background: t.hover, borderRadius: 10, padding: "11px 13px",
          }}
        >
          <MessageSquareText size={15} color={t.textFaint} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: t.text }}>
            {diagnostico.narracion}
          </p>
        </div>
      )}

      {/*
        LA FICHA DETERMINISTA, siempre que haya causa — también cuando hay
        narración. No es redundancia: es lo que permite comprobar que el párrafo
        dice lo que el motor decidió. Si se contradijeran, esto es lo que vale.
      */}
      {causa && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
          <span
            style={{
              fontSize: 9.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
              color: t[banda], background: `${t[banda]}22`, flexShrink: 0,
            }}
          >
            {traducir(`maintenance:close.band.${causa.banda ?? "bajo"}`)}
          </span>
          <span style={{ color: t.textSoft }}>
            {traducir("maintenance:findings.likelyCause")}{" "}
            <strong style={{ color: t.text, fontWeight: 600 }}>{traducirCausa(causa).titulo}</strong>
          </span>
        </div>
      )}

      {/* Plan 28 F3: un diagnóstico al que le faltó una fuente no se pinta
          como uno completo. */}
      {diagnostico?.estado && diagnostico.estado !== "completo" && (
        <p style={{ margin: 0, fontSize: 11.5, color: t.amber }}>
          {traducir(`maintenance:findings.state.${diagnostico.estado}`)}
        </p>
      )}

      {/* Por qué no hay párrafo, cuando no lo hay. Callarlo dejaría creer que
          el sistema no tenía nada que decir. */}
      {diagnostico && !diagnostico.narracion && causa && (
        <p style={{ margin: 0, fontSize: 11.5, color: t.textFaint }}>
          {traducir("maintenance:notices.notNarrated")}
        </p>
      )}

      {/* Un huérfano: se dice, no se rellena con una causa inventada. */}
      {diagnostico && !causa && (
        <p style={{ margin: 0, fontSize: 12, color: t.textFaint }}>
          {diagnostico.aviso ?? traducir("maintenance:notices.noCauses")}
        </p>
      )}

      {aviso.error && (
        <p style={{ margin: 0, fontSize: 11.5, color: t.textFaint }}>
          {traducir("maintenance:notices.notDiagnosed")}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => onNavigate?.("cierre-diagnostico", { sistema, riesgoId: riesgo.id })}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 13px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${t.accent}`, background: t.accentSoft,
            color: t.accent, fontSize: 12.5, fontWeight: 600, minHeight: 44,
          }}
        >
          {traducir("maintenance:notices.detail")}
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.(sistema === "tanque" ? "eva-riesgos" : "eva-riesgos-vibracion")}
          style={{
            padding: "9px 13px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${t.border}`, background: t.hover,
            color: t.textSoft, fontSize: 12.5, fontWeight: 600, minHeight: 44,
          }}
        >
          {traducir("maintenance:notices.seeRisks")}
        </button>
      </div>
    </li>
  );
}

export default function AvisosEva({ onNavigate }) {
  const { theme: t } = useTheme();
  const { t: traducir, i18n } = useTranslation(["maintenance", "diagnostics", "common"]);
  const { riesgo: traducirRiesgo, riesgoVibracion: traducirRiesgoVibracion, causa: traducirCausa } = useProsa();
  const { sistema: nombreSistema } = useDominio();

  const { sistema: sistemaTanque } = useSistemaAgua();
  const { canales, variador, alarmas } = useVibracion();

  const { activos: activosTanque } = useMemo(() => evaluarRiesgos(sistemaTanque), [sistemaTanque]);
  const { activos: activosVibracion } = useMemo(
    () => evaluarRiesgosVibracion({ canales, variador, alarmas }),
    [canales, variador, alarmas]
  );

  const riesgosPorSistema = useMemo(
    () => [
      { sistema: "tanque", activos: activosTanque },
      { sistema: "vibraciones", activos: activosVibracion },
    ],
    [activosTanque, activosVibracion]
  );

  const idioma = i18n.language?.startsWith("en") ? "en" : "es";
  const { avisos, cargando } = useAvisosNarrados(riesgosPorSistema, idioma);

  const hayRiesgos = activosTanque.length + activosVibracion.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text }}>
          {traducir("maintenance:notices.title")}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: t.textSoft }}>
          {traducir("maintenance:notices.subtitle")}
        </p>
      </header>

      {!hayRiesgos ? (
        <p style={{ margin: 0, fontSize: 13, color: t.textSoft, textAlign: "center", padding: "24px 0" }}>
          {traducir("maintenance:notices.empty")}
        </p>
      ) : (
        <>
          <SectionLabel>{traducir("maintenance:notices.list")}</SectionLabel>

          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
            {avisos.map((aviso) => (
              <Aviso
                key={`${aviso.sistema}:${aviso.riesgo.id}`}
                aviso={aviso}
                t={t}
                traducir={traducir}
                traducirCausa={traducirCausa}
                nombreSistema={nombreSistema}
                textoDeRiesgo={
                  aviso.sistema === "tanque"
                    ? traducirRiesgo(aviso.riesgo)
                    : traducirRiesgoVibracion(aviso.riesgo)
                }
                onNavigate={onNavigate}
              />
            ))}
          </ul>

          {/*
            La espera se DICE, y se dice cuánto puede tardar. Con el 4B una
            narración son decenas de segundos, y una pantalla que sólo pone
            «cargando» durante ese rato se lee como colgada — el mismo síntoma
            que la cola del asistente ya resuelve diciendo cuántos hay delante.
          */}
          {cargando && (
            <AlertBanner
              type="info"
              title={traducir("maintenance:notices.narratingTitle")}
              message={traducir("maintenance:notices.narrating", {
                hechos: avisos.length,
                total: activosTanque.length + activosVibracion.length,
              })}
            />
          )}
        </>
      )}
    </div>
  );
}
