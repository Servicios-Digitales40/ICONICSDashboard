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

import { useSistemaAgua } from "../../data/comunes/hooks.js";
import { useVibracion } from "../../data/vibraciones/vibracion.js";
import { evaluarRiesgos } from "../../domain/riesgos.js";
import { evaluarRiesgosVibracion } from "../../domain/riesgosVibracion.js";

const SEVERIDAD_TOKEN = {
  critico: { token: "coral", suave: "coralSoft", Icono: AlertTriangle },
  atencion: { token: "amber", suave: "amberSoft", Icono: AlertTriangle },
  informativo: { token: "accent", suave: "accentSoft", Icono: Info },
};
const SEVERIDAD_DEFECTO = { token: "accent", suave: "accentSoft", Icono: History };

const vistoPorMi = crearVistoPorMi("eva:hallazgos");

/**
 * Los casos similares de LOS riesgos activos de un sistema.
 *
 * Se pide sólo para las causas de riesgos que ya están activos: pedirlo para
 * los que no lo están sería preguntar por hallazgos que no van a aparecer, y
 * es exactamente el mismo criterio de "no preguntar sin necesidad" que
 * `leerAlarmas` aplica sin `clave`.
 */
function useCasosDeRiesgosActivos(sistema, activos) {
  const [porRiesgo, setPorRiesgo] = useState({});

  const riesgoIds = activos.map((r) => r.id).join(",");

  useEffect(() => {
    if (!riesgoIds) {
      setPorRiesgo({});
      return undefined;
    }
    const control = new AbortController();
    let vivo = true;

    Promise.all(
      riesgoIds.split(",").map((riesgoId) =>
        obtenerDiagnostico({ sistema, riesgoId, signal: control.signal })
          .then((data) => ({ riesgoId, casos: data?.causas?.[0]?.casosCitados ?? [] }))
          .catch(() => ({ riesgoId, casos: [] }))
      )
    ).then((resultados) => {
      if (!vivo) return;
      const salida = {};
      for (const { riesgoId, casos } of resultados) salida[riesgoId] = casos;
      setPorRiesgo(salida);
    });

    return () => {
      vivo = false;
      control.abort();
    };
  }, [sistema, riesgoIds]);

  return porRiesgo;
}

export default function BandejaEva({ onNavigate }) {
  const { theme: t } = useTheme();
  const { t: traducir } = useTranslation(["maintenance", "diagnostics", "common"]);
  const { riesgo: traducirRiesgo, riesgoVibracion: traducirRiesgoVibracion } = useProsa();
  const { sistema: nombreSistema } = useDominio();

  const [descartados, setDescartados] = useState(() => vistoPorMi.leer());

  const { sistema: sistemaTanque } = useSistemaAgua();
  const { canales, variador, alarmas } = useVibracion();

  const { activos: activosTanque } = useMemo(() => evaluarRiesgos(sistemaTanque), [sistemaTanque]);
  const { activos: activosVibracion } = useMemo(
    () => evaluarRiesgosVibracion({ canales, variador, alarmas }),
    [canales, variador, alarmas]
  );

  const casosTanque = useCasosDeRiesgosActivos("tanque", activosTanque);
  const casosVibracion = useCasosDeRiesgosActivos("vibraciones", activosVibracion);

  const hallazgos = useMemo(() => {
    const salida = [];

    for (const riesgo of activosTanque) {
      const traducido = traducirRiesgo(riesgo);
      salida.push(hallazgoDeRiesgo("tanque", { ...riesgo, titulo: traducido.titulo, evidencia: traducido.evidencia }));
      for (const caso of casosTanque[riesgo.id] ?? []) {
        salida.push(hallazgoDeCaso("tanque", riesgo.id, caso));
      }
    }

    for (const riesgo of activosVibracion) {
      const traducido = traducirRiesgoVibracion(riesgo);
      salida.push(hallazgoDeRiesgo("vibraciones", { ...riesgo, titulo: traducido.titulo, evidencia: traducido.evidencia }));
      for (const caso of casosVibracion[riesgo.id] ?? []) {
        salida.push(hallazgoDeCaso("vibraciones", riesgo.id, caso));
      }
    }

    return ordenarHallazgos(salida);
  }, [activosTanque, activosVibracion, casosTanque, casosVibracion, traducirRiesgo, traducirRiesgoVibracion]);

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

    if (h.origen === "riesgo") {
      onNavigate?.(h.sistema === "tanque" ? "eva-riesgos" : "eva-riesgos-vibracion");
    } else {
      onNavigate?.("cierre-diagnostico", { sistema: h.sistema, riesgoId: h.referencia.riesgoId });
    }
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
