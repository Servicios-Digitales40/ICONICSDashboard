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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, CheckCircle2, Info, MessageSquareText, ShieldAlert } from "lucide-react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { useProsa } from "@/i18n/useProsa.js";
import { useDominio } from "@/i18n/useDominio.js";
import { useTheme } from "@/theme";
import { obtenerDiagnosticoNarrado } from "@/lib/api/casosApi.js";
import { ESTADO_AVISO, marcarVisto, reconciliarAvisos } from "@shared/eva/comun/avisos.js";

/* Cerrado con la estación de llenado (rama `Vibraciones1.0`):
   import { useSistemaAgua } from "../../data/comunes/hooks.js"; */
import { useVibracion } from "../../data/vibraciones/vibracion.js";
/* Cerrado con la estación de llenado (rama `Vibraciones1.0`):
   import { evaluarRiesgos } from "../../domain/riesgos.js"; */
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
 * ── EL CICLO DE VIDA NO SE DECIDE AQUÍ (PLAN 31 F3) ─────────────────
 *
 * Quién sobrevive, quién se marca resuelto y quién merece otra narración lo
 * decide `shared/eva/comun/avisos.js`, que es dominio puro y se prueba sin
 * React. Este hook sólo conecta ese dominio con la red y con el estado de
 * React — `CLAUDE.md` §4.3: la presentación no decide reglas.
 *
 * En F2 esto vaciaba la lista cada vez que cambiaba el conjunto de riesgos
 * (`setAvisos([])`), que era correcto mientras un aviso no sobrevivía a su
 * riesgo. Con F3 sobrevive, así que reconciliar sustituye a reiniciar: lo que
 * ya estaba se conserva, se le actualiza el estado y sólo se narra lo que hace
 * falta narrar.
 */
function useAvisosNarrados(riesgosPorSistema, idioma) {
  const [avisos, setAvisos] = useState([]);
  const [narrando, setNarrando] = useState(0);

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
    const control = new AbortController();
    let vivo = true;

    /*
     * La reconciliación se hace DENTRO del actualizador de estado, no fuera:
     * así se parte siempre de la lista vigente aunque una narración anterior
     * haya terminado entre medias. Calcularla fuera con `avisos` obligaría a
     * meterlo en las dependencias, y cada narración que llega relanzaría el
     * efecto entero.
     */
    let pendientes = [];
    setAvisos((previos) => {
      const activos = refRiesgos.current.flatMap(({ sistema, activos: lista }) =>
        lista.map((riesgo) => ({ sistema, riesgo }))
      );
      const { avisos: siguientes, aNarrar } = reconciliarAvisos({ previos, activos });
      pendientes = aNarrar;
      return siguientes;
    });

    if (!pendientes.length) {
      setNarrando(0);
      return () => {
        vivo = false;
        control.abort();
      };
    }

    setNarrando(pendientes.length);

    (async () => {
      for (const aviso of pendientes) {
        if (!vivo) return;

        /*
         * Un riesgo que falló se enseña IGUAL, con su evidencia y sin
         * diagnóstico. Saltárselo escondería un riesgo activo por un fallo de
         * red — exactamente al revés de lo que debe hacer una pantalla de
         * avisos.
         */
        let resultado;
        try {
          const data = await obtenerDiagnosticoNarrado({
            sistema: aviso.sistema, riesgoId: aviso.riesgo.id, idioma, signal: control.signal,
          });
          resultado = { diagnostico: data, narracion: data?.narracion ?? null, error: null };
        } catch (error) {
          if (!vivo || error.name === "AbortError") return;
          resultado = { diagnostico: null, narracion: null, error };
        }

        if (!vivo) return;
        setAvisos((previos) =>
          previos.map((a) =>
            a.id === aviso.id
              ? {
                ...a,
                ...resultado,
                /*
                 * `narradoEn` se sella aunque la narración haya salido null: lo
                 * que el cooldown protege es la LLAMADA, no el texto. Sin esto,
                 * un servidor de IA caído haría que cada sondeo reintentara
                 * todas las narraciones — justo el bucle que esta fase evita.
                 */
                narradoEn: Date.now(),
              }
              : a
          )
        );
        setNarrando((n) => Math.max(n - 1, 0));
      }
      if (vivo) setNarrando(0);
    })();

    return () => {
      vivo = false;
      control.abort();
    };
  }, [clave, idioma]);

  const marcarLeido = useCallback((id) => {
    setAvisos((previos) => marcarVisto(previos, id));
  }, []);

  return { avisos, narrando, marcarLeido };
}

/** Un aviso: el riesgo, su narración y la ficha determinista debajo. */
function Aviso({ aviso, t, traducir, traducirCausa, nombreSistema, textoDeRiesgo, onNavigate, onLeido }) {
  const { sistema, riesgo, diagnostico } = aviso;
  const resuelto = aviso.estado === ESTADO_AVISO.RESUELTO;

  /*
   * ── UN AVISO RESUELTO SE VE DISTINTO, Y ES LA MITAD DE F3 ───────────
   *
   * Si un aviso sobrevive a su riesgo —la decisión del 15-09-2026— la vista
   * mezcla presente y pasado. Dos tarjetas idénticas, una de un riesgo activo
   * AHORA y otra de uno que se apagó hace una hora, es la forma de que se deje
   * de mirar la pantalla: si no se distingue lo urgente de lo histórico de un
   * vistazo, todo se lee como histórico.
   *
   * El resuelto pierde el color de severidad —ya no hay severidad que
   * comunicar— y baja de contraste. No se oculta ni se tacha: sigue habiendo
   * algo que leer, y el que nadie haya confirmado que se arregló es justamente
   * el motivo por el que sigue ahí.
   */
  const sev = resuelto ? null : SEVERIDAD_TOKEN[riesgo.severidad] ?? SEVERIDAD_DEFECTO;
  const Icono = resuelto ? CheckCircle2 : sev.Icono;
  const colorIcono = resuelto ? t.textFaint : t[sev.token];

  const causa = diagnostico?.causas?.[0] ?? null;
  const banda = BANDA_TOKEN[causa?.banda] ?? BANDA_TOKEN.bajo;

  return (
    <li
      style={{
        background: t.panel, border: `1px solid ${t.border}`,
        borderLeft: `4px solid ${resuelto ? t.border : t[sev.token]}`,
        borderRadius: 12, padding: 16,
        display: "flex", flexDirection: "column", gap: 10,
        opacity: resuelto ? 0.72 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Icono size={18} color={colorIcono} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.textFaint, textTransform: "uppercase" }}>
              {nombreSistema(sistema)}
            </span>
            {/*
              El rótulo, además del color: un indicador que sólo sea cromático
              no lo lee quien no distingue ese par de tonos (DESIGN.md), y aquí
              la diferencia entre «está pasando» y «pasó» es la información
              principal de la tarjeta.

              Dice «ya no está activo» y NO «resuelto» a secas: nadie ha
              confirmado que se arreglara. Pudo pararse la bomba, o el sensor
              pudo dejar de dar dato (§2.5).
            */}
            {resuelto && (
              <span
                style={{
                  fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                  color: t.textSoft, background: t.hover,
                }}
              >
                {traducir("maintenance:notices.noLongerActive")}
              </span>
            )}
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

        {/*
          ── «LEÍDO», Y POR QUÉ NO SE LLAMA «DESCARTAR» ────────────────────

          Porque no descarta nada: un aviso VIGENTE marcado como leído se queda
          en la lista, porque su riesgo sigue ahí y «visto» no apaga un riesgo.
          Lo que hace es dejar constancia de que esta persona ya lo miró, para
          que cuando el riesgo se apague el aviso se vaya solo en vez de
          acumularse.

          Es de ESTA persona en ESTE dispositivo, como en Alarmas y Hallazgos:
          un aviso leído en el taller sigue visible en la sala de control, que
          es correcto — son dos personas distintas. Ver `lib/vistoPorMi.js`
          sobre por qué «visto» nunca se manda al servidor.
        */}
        {!aviso.vistoEn && (
          <button
            type="button"
            onClick={() => onLeido?.(aviso.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 13px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${t.border}`, background: "transparent",
              color: t.textFaint, fontSize: 12.5, fontWeight: 600, minHeight: 44,
            }}
          >
            <Check size={14} />
            {traducir("maintenance:notices.markRead")}
          </button>
        )}
      </div>
    </li>
  );
}

export default function AvisosEva({ onNavigate }) {
  const { theme: t } = useTheme();
  const { t: traducir, i18n } = useTranslation(["maintenance", "diagnostics", "common"]);
  const { riesgo: traducirRiesgo, riesgoVibracion: traducirRiesgoVibracion, causa: traducirCausa } = useProsa();
  const { sistema: nombreSistema } = useDominio();

  /*
   * ── SÓLO VIBRACIONES (rama `Vibraciones1.0`, 17-09-2026) ───────────
   *
   * Con la estación de llenado cerrada por mantenimiento, avisar de sus
   * riesgos sería avisar de una máquina que nadie está mirando — y cada aviso
   * cuesta una llamada al modelo de 30-90 s, así que el coste no es teórico.
   *
   * Para reabrir: devolver `useSistemaAgua()`, su `evaluarRiesgos` y la
   * entrada `tanque` de `riesgosPorSistema`.
   */
  const { canales, variador, alarmas } = useVibracion();

  const { activos: activosVibracion } = useMemo(
    () => evaluarRiesgosVibracion({ canales, variador, alarmas }),
    [canales, variador, alarmas]
  );

  const riesgosPorSistema = useMemo(
    () => [{ sistema: "vibraciones", activos: activosVibracion }],
    [activosVibracion]
  );

  const idioma = i18n.language?.startsWith("en") ? "en" : "es";
  const { avisos, narrando, marcarLeido } = useAvisosNarrados(riesgosPorSistema, idioma);

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

      {/*
        La lista vacía se decide por los AVISOS, no por los riesgos activos: un
        aviso resuelto y sin leer sigue siendo algo que enseñar aunque ya no
        haya ningún riesgo activo. Mirar los riesgos aquí —como en F2— habría
        escondido exactamente el caso que F3 existe para conservar.
      */}
      {avisos.length === 0 ? (
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
                onLeido={marcarLeido}
              />
            ))}
          </ul>

          {/*
            La espera se DICE, y se dice cuánto puede tardar. Con el 4B una
            narración son decenas de segundos, y una pantalla que sólo pone
            «cargando» durante ese rato se lee como colgada — el mismo síntoma
            que la cola del asistente ya resuelve diciendo cuántos hay delante.
          */}
          {narrando > 0 && (
            <AlertBanner
              type="info"
              title={traducir("maintenance:notices.narratingTitle")}
              message={traducir("maintenance:notices.narrating", { pendientes: narrando })}
            />
          )}
        </>
      )}
    </div>
  );
}
