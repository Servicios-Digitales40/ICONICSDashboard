/**
 * Vista «Hallazgos» — lo que el sistema ya calculó y aún no ha visto nadie
 * (Plan 25 F6 · `NUE-03`).
 *
 * ── POR QUÉ «HALLAZGOS» Y NO «PROPUESTAS» ───────────────────────────
 *
 * Porque «propuesta» ya significa algo concreto y distinto en este proyecto:
 * una regla de riesgo que el asistente sugiere y que se aprueba escribiendo
 * código y su prueba, fuera del tablero (`scripts/revisar-propuestas.mjs`, ver
 * la cabecera de `shared/eva/comun/aprendizaje.js`). Esta bandeja no aprueba
 * nada de eso, así que usar el mismo nombre habría hecho creer que las dos se
 * tratan igual. El dominio de esta vista vive en
 * `shared/eva/comun/hallazgos.js` — léela primero para el porqué completo.
 *
 * ── LA FRONTERA QUE IMPORTA: UN HALLAZGO NO ES UNA ORDEN ────────────
 *
 * Esta bandeja no acciona planta por sí sola. «Descartar» es una preferencia
 * de esta persona en este dispositivo — mismo mecanismo que «leído» en
 * Alarmas (`lib/vistoPorMi.js`) — y NO escribe en el diario de accionamientos:
 * no se ha accionado nada, sólo se ha dejado de mirar. Lo único que acciona
 * planta es la ruta de control que ya existe (`ControlesTanque`), y a ella se
 * llega NAVEGANDO desde aquí, nunca con un botón propio de esta pantalla.
 *
 * ── QUÉ FUENTES ENTRAN, Y CUÁL SE QUEDÓ FUERA ───────────────────────
 *
 * Riesgos activos de las dos máquinas y casos similares proactivos (F0). Los
 * «diagnósticos sin cerrar» de la especificación original de `NUE-03` no
 * entran: no hay ningún registro de qué diagnósticos se calcularon y quedaron
 * sin cerrar (`diagnosticEventId` es de un solo momento y no se persiste), y
 * construirlo sería inventar un dato que no existe (§2.5). Ver la cabecera de
 * `hallazgos.js` para la investigación completa.
 *
 * ── POR QUÉ NO HAY UN «ACEPTAR» GENÉRICO ────────────────────────────
 *
 * Porque «aceptar un hallazgo» no significa lo mismo para las dos fuentes: un
 * riesgo se acepta yendo a mirarlo (Riesgos) o cerrando el caso (Cierre de
 * diagnóstico); un caso similar se acepta yéndolo a leer. No hay una acción
 * común de un solo botón que sirva para las dos sin fingir que la hay, así que
 * cada tarjeta navega a donde de verdad se puede actuar sobre ella.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, History, Info, X } from "lucide-react";

import { SectionLabel } from "@/components/ui/index.js";
import { useProsa } from "@/i18n/useProsa.js";
import { useDominio } from "@/i18n/useDominio.js";
import { crearVistoPorMi } from "@/lib/vistoPorMi.js";
import { useTheme } from "@/theme";
import { hallazgoDeCaso, hallazgoDeRiesgo, ordenarHallazgos } from "@shared/eva/comun/hallazgos.js";
import { obtenerDiagnostico } from "@/lib/api/casosApi.js";

/* Cerrados con la estación de llenado (rama `Vibraciones1.0`) — ver el bloque
   de `useConteoHallazgos` en el cuerpo del componente:
   import { useSistemaAgua } from "../../data/comunes/hooks.js";
   import { evaluarRiesgos } from "../../domain/riesgos.js"; */
import { useMaquinasEnVivo } from "../../data/comunes/maquinasEnVivo.js";
import { useDominioVibracion } from "../../data/vibraciones/vibracion.js";
import { evaluarRiesgosVibracion } from "../../domain/riesgosVibracion.js";

const SEVERIDAD_TOKEN = {
  critico: { token: "coral", suave: "coralSoft", Icono: AlertTriangle },
  atencion: { token: "amber", suave: "amberSoft", Icono: AlertTriangle },
  informativo: { token: "accent", suave: "accentSoft", Icono: Info },
};
const SEVERIDAD_DEFECTO = { token: "accent", suave: "accentSoft", Icono: History };

const vistoPorMi = crearVistoPorMi("eva:hallazgos");

/**
 * El diagnóstico de LOS riesgos activos de un sistema.
 *
 * Se pide sólo para los riesgos que ya están activos: pedirlo para los que no
 * lo están sería preguntar por hallazgos que no van a aparecer, y es
 * exactamente el mismo criterio de "no preguntar sin necesidad" que
 * `leerAlarmas` aplica sin `clave`.
 *
 * ── ESTA LLAMADA YA SE HACÍA; LO QUE SE TIRABA ERA LA RESPUESTA ─────
 *
 * Hasta el Plan 31 F1 esto se llamaba `useCasosDeRiesgosActivos` y se quedaba
 * con `data?.causas?.[0]?.casosCitados`: pedía el diagnóstico entero —causas
 * puntuadas, bandas, respaldo de las cuatro fuentes, estado— y conservaba los
 * casos citados de la primera causa. Todo lo demás se descartaba en el mismo
 * `.then`.
 *
 * Así que la cuarta pregunta —«por qué está pasando»— llevaba meses calculada
 * y pagada en esta pantalla, y sin enseñarse. Guardar el resultado entero no
 * añade ni una petición: es la misma llamada, sin el `?.[0]?.casosCitados`.
 *
 * ── POR QUÉ MONTAR LA VISTA Y NO ACTIVARSE EL RIESGO ────────────────
 *
 * Porque esto cuesta una petición por riesgo activo, y se paga sólo cuando hay
 * alguien delante. Diagnosticar en el flanco de activación lo pagaría siempre,
 * mire alguien o no — que es por lo que el contador de la campana del Topbar
 * está retirado desde el 31-08-2026. Ver Plan 31 §2.3.
 */
function useDiagnosticoDeRiesgosActivos(fuentes) {
  /*
   * Por MÁQUINA, varias a la vez (Plan 40 F2): la bandeja de planta enseña
   * todas las configuradas. Devuelve `porSistema[sistema][riesgoId]`.
   *
   * La clave del efecto es una sola cadena —qué riesgos de qué máquinas—
   * para que no se rehaga por identidad de arrays.
   */
  const [porSistema, setPorSistema] = useState({});

  const clave = fuentes
    .filter((f) => f.activos.length)
    .map((f) => `${f.sistema}:${f.activos.map((r) => r.id).join(",")}`)
    .join("|");

  useEffect(() => {
    if (!clave) {
      setPorSistema({});
      return undefined;
    }
    const control = new AbortController();
    let vivo = true;

    const pedidos = clave.split("|").flatMap((trozo) => {
      const [sistema, ids] = trozo.split(":");
      return ids.split(",").map((riesgoId) =>
        obtenerDiagnostico({ sistema, riesgoId, signal: control.signal })
          .then((data) => ({ sistema, riesgoId, diagnostico: data ?? null }))
          .catch(() => ({ sistema, riesgoId, diagnostico: null }))
      );
    });

    Promise.all(pedidos).then((resultados) => {
      if (!vivo) return;
      const salida = {};
      for (const { sistema, riesgoId, diagnostico } of resultados) {
        (salida[sistema] ??= {})[riesgoId] = diagnostico;
      }
      setPorSistema(salida);
    });

    return () => {
      vivo = false;
      control.abort();
    };
  }, [clave]);

  return porSistema;
}

/*
 * Cada banda con su color — mismo mapa y mismos rótulos que
 * `CierreDiagnostico`: el rótulo sale de `maintenance:close.band` por la
 * propia clave, aquí sólo se decide de qué color. Duplicar el vocabulario
 * habría dejado dos formas de escribir «ALTO» en dos pantallas que hablan del
 * mismo diagnóstico.
 */
const BANDA_TOKEN = { alto: "coral", medio: "amber", bajo: "textFaint" };

/**
 * La causa más respaldada de un hallazgo de riesgo — Plan 31 F1.
 *
 * ── LO QUE ESTA LÍNEA CONTESTA ──────────────────────────────────────
 *
 * La cuarta pregunta. La tarjeta ya decía qué pasa (`evidencia`), qué puede
 * pasar (`consecuencia`) y qué mirar (`accion`); faltaba POR QUÉ está pasando,
 * y el motor llevaba meses calculándolo en esta misma pantalla sin que nadie lo
 * enseñara. Ver la cabecera de `useDiagnosticoDeRiesgosActivos`.
 *
 * ── SÓLO LA PRIMERA CAUSA, Y CON SU BANDA ───────────────────────────
 *
 * Una tarjeta de bandeja es un resumen: la lista entera de causas con su
 * respaldo ya vive en Cierre de diagnóstico, que es donde alguien va a
 * ELEGIR una. Aquí sólo hace falta lo suficiente para decidir si merece la
 * pena abrirlo.
 *
 * La banda va SIEMPRE con el título, nunca el título solo. Sin ella la
 * primera causa se lee como «la causa», y es lo que el motor no dice: dice
 * cuál está mejor respaldada y CON CUÁNTO. «BAJO» delante cambia por completo
 * lo que la frase promete.
 *
 * ── LOS TRES CASOS QUE NO SON UNA CAUSA ─────────────────────────────
 *
 * `null` (no se pudo diagnosticar), huérfano (no hay causas transcritas
 * debajo) y todavía cargando se distinguen entre sí y del caso normal. Los
 * tres se callan en vez de inventar una línea: la Bandeja sigue siendo útil
 * sin diagnóstico —ya contesta las otras tres preguntas—, así que un hueco no
 * rompe la tarjeta. Lo que sí la rompería es un «sin causa» que se leyera como
 * «no hay causa».
 */
function CausaMasRespaldada({ hallazgo, t, traducir }) {
  const { causa: traducirCausa } = useProsa();

  if (hallazgo.origen !== "riesgo") return null;

  const primera = hallazgo.diagnostico?.causas?.[0];
  if (!primera) return null;

  const token = BANDA_TOKEN[primera.banda] ?? BANDA_TOKEN.bajo;

  return (
    <p style={{ margin: "2px 0 0", display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap", fontSize: 12.5 }}>
      <span
        style={{
          fontSize: 9.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
          color: t[token], background: `${t[token]}22`, flexShrink: 0,
        }}
      >
        {traducir(`maintenance:close.band.${primera.banda ?? "bajo"}`)}
      </span>
      <span style={{ color: t.textSoft }}>
        {traducir("maintenance:findings.likelyCause")}{" "}
        <strong style={{ color: t.text, fontWeight: 600 }}>{traducirCausa(primera).titulo}</strong>
      </span>
      {/*
        Plan 28 F3: un diagnóstico al que le faltó una fuente se pintaba idéntico
        a uno completo. Aquí se dice, aunque sea corto — quien lea «ALTO» sin
        saber que se calculó sin los manuales está leyendo otra cosa.
      */}
      {hallazgo.diagnostico.estado && hallazgo.diagnostico.estado !== "completo" && (
        <span style={{ fontSize: 11, color: t.amber }}>
          {traducir(`maintenance:findings.state.${hallazgo.diagnostico.estado}`)}
        </span>
      )}
    </p>
  );
}

export default function BandejaEva({ onNavigate }) {
  const { theme: t } = useTheme();
  const { t: traducir } = useTranslation(["maintenance", "diagnostics", "common"]);
  /* `riesgo` (el del tanque) sale al reabrir la estación de llenado. */
  const { riesgoVibracion: traducirRiesgoVibracion } = useProsa();
  const { sistema: nombreSistema } = useDominio();

  const [descartados, setDescartados] = useState(() => vistoPorMi.leer());

  /*
   * ── SÓLO VIBRACIONES (rama `Vibraciones1.0`, 17-09-2026) ───────────
   *
   * Con la estación de llenado cerrada, sus hallazgos serían pendientes de una
   * máquina que nadie va a mirar. Y no es sólo ruido visual: cada riesgo
   * activo cuesta una llamada a `/api/diagnostico` al abrir esta vista.
   *
   * Para reabrir: devolver `useSistemaAgua()`, su `evaluarRiesgos`, el
   * `useDiagnosticoDeRiesgosActivos("tanque", …)` y su `agregar(...)` de abajo.
   */
  /* La máquina DE LA PANTALLA (Plan 38 F2): la escrita a mano en su sección,
     una configurada en la suya (`?maquina=<id>`). El hook elige la fuente. */
  /*
   * Con máquina delante (`maq-hallazgos`), la suya; sin ella (`eva-bandeja`,
   * la bandeja de planta), TODAS las configuradas activas (Plan 40 F2). Hasta
   * entonces «sin máquina» significaba la máquina escrita a mano.
   */
  const { canales, variador, alarmas, maquina } = useDominioVibracion();
  const planta = useMaquinasEnVivo();

  const { activos: activosVibracion } = useMemo(
    () => evaluarRiesgosVibracion({ canales, variador, alarmas }),
    [canales, variador, alarmas]
  );

  const fuentes = useMemo(
    () => (maquina
      ? [{ sistema: maquina.id, activos: activosVibracion }]
      : planta.map((e) => ({ sistema: e.maquina.id, activos: e.riesgos.activos }))),
    [maquina, activosVibracion, planta]
  );

  const diagnosticoPorSistema = useDiagnosticoDeRiesgosActivos(fuentes);

  const hallazgos = useMemo(() => {
    const salida = [];

    const agregar = (sistema, riesgos, traducirlo, porRiesgo) => {
      for (const riesgo of riesgos) {
        const traducido = traducirlo(riesgo);
        const diagnostico = porRiesgo[riesgo.id] ?? null;

        salida.push({
          ...hallazgoDeRiesgo(sistema, { ...riesgo, titulo: traducido.titulo, evidencia: traducido.evidencia }),
          /*
           * El diagnóstico viaja PEGADO al hallazgo, no fusionado con él:
           * `hallazgoDeRiesgo` es dominio compartido y no sabe de diagnósticos
           * (su cabecera dice, literalmente, que ese módulo no calcula nada).
           * Meterlo dentro obligaría a `shared/` a conocer la forma del motor.
           */
          diagnostico,
        });

        for (const caso of diagnostico?.causas?.[0]?.casosCitados ?? []) {
          salida.push(hallazgoDeCaso(sistema, riesgo.id, caso));
        }
      }
    };

    /* La estación de llenado, cerrada — ver el bloque de arriba:
       agregar("tanque", activosTanque, traducirRiesgo, diagnosticoTanque); */
    for (const f of fuentes) {
      agregar(f.sistema, f.activos, traducirRiesgoVibracion, diagnosticoPorSistema[f.sistema] ?? {});
    }

    return ordenarHallazgos(salida);
  }, [fuentes, diagnosticoPorSistema, traducirRiesgoVibracion]);

  const visibles = hallazgos.filter((h) => !descartados.has(h.id));

  const descartar = (id) => {
    vistoPorMi.marcar([id]);
    setDescartados((prev) => new Set([...prev, id]));
  };

  const irA = (h) => {
    /*
     * Marcar como descartado AL NAVEGAR, no antes: si alguien pulsa la
     * tarjeta para mirarla, ya la ha visto, y quedaría raro que siguiera
     * apareciendo la próxima vez que abra esta bandeja. Descartar por
     * navegación y descartar con la X hacen lo mismo por debajo — la
     * diferencia es la intención con la que la persona se fue.
     */
    vistoPorMi.marcar([h.id]);
    setDescartados((prev) => new Set([...prev, h.id]));

    /* Una máquina configurada viaja como `?maquina=`: es lo que lee
       `MaquinaProvider` en las rutas que no son de ninguna (Plan 38 F2). El
       tanque dejó de tener pantalla propia en el Plan 42.5 F4 y entrará por
       configuración (Plan 43), así que ya no hay un caso aparte. */
    const deMaquina = { maquina: h.sistema };
    if (h.origen === "riesgo") onNavigate?.("maq-riesgos", deMaquina);
    else onNavigate?.("cierre-diagnostico", { sistema: h.sistema, riesgoId: h.referencia.riesgoId, ...deMaquina });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text }}>
          {traducir("maintenance:findings.title")}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: t.textSoft }}>
          {traducir("maintenance:findings.subtitle")}
        </p>
      </header>

      <SectionLabel>{traducir("maintenance:findings.list")}</SectionLabel>

      {visibles.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: t.textSoft, textAlign: "center", padding: "24px 0" }}>
          {traducir("maintenance:findings.empty")}
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {visibles.map((h) => {
            const sev = h.severidad ? SEVERIDAD_TOKEN[h.severidad] ?? SEVERIDAD_DEFECTO : SEVERIDAD_DEFECTO;
            const { Icono } = sev;

            return (
              <li
                key={h.id}
                style={{
                  background: t.panel, border: `1px solid ${t.border}`,
                  borderLeft: `4px solid ${t[sev.token]}`,
                  borderRadius: 12, padding: 14,
                  display: "flex", alignItems: "flex-start", gap: 12,
                }}
              >
                <Icono size={17} color={t[sev.token]} style={{ flexShrink: 0, marginTop: 2 }} />

                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.textFaint, textTransform: "uppercase" }}>
                      {nombreSistema(h.sistema)}
                    </span>
                    <span
                      style={{
                        fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                        color: t[sev.token], background: t[sev.suave],
                      }}
                    >
                      {traducir(`maintenance:findings.origin.${h.origen}`)}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text }}>{h.titulo}</p>
                  <p style={{ margin: 0, fontSize: 12.5, color: t.textSoft }}>{h.resumen}</p>
                  <CausaMasRespaldada hallazgo={h} t={t} traducir={traducir} />
                </div>

                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => irA(h)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                      border: `1px solid ${t.accent}`, background: t.accentSoft,
                      color: t.accent, fontSize: 12.5, fontWeight: 600,
                      minHeight: 44,
                    }}
                  >
                    <CheckCircle2 size={14} />
                    {traducir("maintenance:findings.view")}
                  </button>
                  <button
                    type="button"
                    onClick={() => descartar(h.id)}
                    aria-label={traducir("maintenance:findings.dismiss")}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 44, height: 44, borderRadius: 8, cursor: "pointer",
                      border: `1px solid ${t.border}`, background: t.hover, color: t.textSoft,
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
