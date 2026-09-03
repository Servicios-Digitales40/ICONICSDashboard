/**
 * La portada del módulo de Predicción: qué máquina es, de dónde viene su dato
 * y qué se puede preguntar hoy.
 *
 * ── POR QUÉ ESTA PANTALLA EXISTE ANTES QUE LAS DEMÁS ────────────────
 *
 * Porque este módulo tiene una propiedad que Monitoreo no tiene, y hay que
 * decirla antes de enseñar ninguna curva: **su dato no viene de ICONICS**. Un
 * técnico que llega a la aplicación por el sidebar da por hecho que todo lo
 * que ve sale del mismo sitio, y aquí eso es falso.
 *
 * Es el mismo trabajo que hace el campo `limitaciones` de
 * `shared/eva/comun/sistemas.js` para las dos máquinas de planta: lo que hay
 * que confesar al hablar de este sistema, dicho en voz alta y no enterrado en
 * una nota al pie.
 *
 * ── LO ÚNICO REAL QUE PUEDE ENSEÑAR HOY ─────────────────────────────
 *
 * La salud del backend. No es poco: es la diferencia entre «no hay dato» y «el
 * servicio no responde», que es exactamente la distinción que el módulo de
 * Monitoreo perdió el 03-09-2026 cuando el historiador devolvió un 500 y la
 * respuesta al técnico lo narró como si la señal no se historizara.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Cpu, Server } from "lucide-react";

import { Panel, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";
import { MONO, SANS } from "@/Demo-EVA/components/base.jsx";

import { fetchPredictionHealth, PREDICTION_API_BASE } from "../data/predictionApi.js";

/** Lo que hay que confesar al hablar de este módulo. Ver la cabecera. */
const LIMITACIONES = [
  "El dato NO viene de ICONICS: lo sirve otro backend, en otra máquina. Nada de lo que se ve aquí se puede cruzar con el tanque ni con el sistema de vibraciones.",
  "El histórico se alimenta de una hoja de cálculo cuyo contenido exacto todavía no está inventariado: no sabemos aún qué variables hay ni con qué unidad.",
  "No hay lectura en vivo de esta máquina. Todo lo que se consulta es pasado.",
  "El modelo predictivo no tiene todavía un error validado publicado, así que ninguna proyección se puede citar como fiable.",
];

export default function InicioCompresor() {
  const { theme: t } = useTheme();

  const health = useQuery({
    queryKey: ["prediction-health"],
    queryFn: ({ signal }) => fetchPredictionHealth({ signal }),
  });

  const responde = health.isSuccess;
  const cargando = health.isLoading;

  const colorEstado = cargando ? t.textFaint : responde ? t.success : t.coral;
  const fondoEstado = cargando ? t.hover : responde ? t.successSoft : t.coralSoft;
  const textoEstado = cargando
    ? "Consultando…"
    : responde
      ? "El backend predictivo responde"
      : "El backend predictivo no responde";

  return (
    <div style={{ display: "grid", gap: 4, maxWidth: 920 }}>
      <Panel>
        <div style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontFamily: SANS, fontSize: 18, fontWeight: 700, color: t.text }}>
            Compresor
          </h2>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: t.textSoft }}>
            Una máquina real, con histórico de datos reales, servida por un backend propio. Es el
            segundo módulo de la demo y el único que no lee el servidor ICONICS de esta planta.
          </p>
        </div>
      </Panel>

      <SectionLabel sub="Lo único que este módulo puede comprobar hoy por sí mismo">
        Estado del servicio
      </SectionLabel>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(17rem, 1fr))" }}>
        <Panel title="Conexión">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 34,
                height: 34,
                borderRadius: 9,
                background: fondoEstado,
                color: colorEstado,
                flexShrink: 0,
              }}
            >
              {responde ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            </span>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: t.text }}>
                {textoEstado}
              </span>
              {health.isError && (
                <span style={{ fontSize: 12, color: t.textFaint }}>{health.error?.message}</span>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Dónde corre">
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Server size={15} color={t.textFaint} />
              <span style={{ fontFamily: MONO, fontSize: 12.5, color: t.text, wordBreak: "break-all" }}>
                {PREDICTION_API_BASE}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Cpu size={15} color={t.textFaint} />
              <span style={{ fontSize: 12.5, color: t.textSoft }}>
                Su propia máquina, distinta del servidor de ICONICS y del de IA
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <SectionLabel sub="Lo que hay que decir en voz alta antes de enseñar cualquier curva de este módulo">
        Limitaciones
      </SectionLabel>

      <Panel>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
          {LIMITACIONES.map((texto) => (
            <li key={texto} style={{ fontSize: 13.5, lineHeight: 1.55, color: t.textSoft }}>
              {texto}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
