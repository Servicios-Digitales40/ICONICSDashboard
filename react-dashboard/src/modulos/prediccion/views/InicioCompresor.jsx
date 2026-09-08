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
/* Carga el diccionario de este modulo. Ver `modulos/prediccion/i18n.js`. */
import "../i18n.js";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Cpu, Server } from "lucide-react";

import { Panel, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";
import { MONO, SANS } from "@/Demo-EVA/components/base.jsx";

import { fetchPredictionHealth, PREDICTION_API_BASE } from "../data/predictionApi.js";


/*
 * Lo que hay que confesar al hablar de este módulo vive en
 * `prediction:home.limits.items`. Ver la cabecera de este archivo para el
 * porqué de que se diga en pantalla y no sólo en un comentario.
 */

export default function InicioCompresor() {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("prediction");
  const { theme: t } = useTheme();

  const health = useQuery({
    queryKey: ["prediction-health"],
    queryFn: ({ signal }) => fetchPredictionHealth({ signal }),
  });

  const responde = health.isSuccess;
  const cargando = health.isLoading;

  const colorEstado = cargando ? t.textFaint : responde ? t.success : t.coral;
  const fondoEstado = cargando ? t.hover : responde ? t.successSoft : t.coralSoft;
  const textoEstado = traducir(
    cargando ? "home.service.checking"
      : responde ? "home.service.up"
        : "home.service.down",
  );

  return (
    <div style={{ display: "grid", gap: 4, maxWidth: 920 }}>
      <Panel>
        <div style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontFamily: SANS, fontSize: 18, fontWeight: 700, color: t.text }}>
            {traducir("home.title")}
          </h2>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: t.textSoft }}>
            {traducir("home.lead")}
          </p>
        </div>
      </Panel>

      <SectionLabel sub={traducir("home.service.sub")}>
        {traducir("home.service.title")}
      </SectionLabel>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(17rem, 1fr))" }}>
        <Panel title={traducir("home.service.connection")}>
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

        <Panel title={traducir("home.service.whereItRuns")}>
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
                {traducir("home.service.ownMachine")}
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <SectionLabel sub={traducir("home.limits.sub")}>
        {traducir("home.limits.title")}
      </SectionLabel>

      <Panel>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
          {traducir("home.limits.items", { returnObjects: true }).map((texto) => (
            <li key={texto} style={{ fontSize: 13.5, lineHeight: 1.55, color: t.textSoft }}>
              {texto}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
