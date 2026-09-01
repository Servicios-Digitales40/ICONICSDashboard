/**
 * Las piezas que pintan un riesgo de VIBRACIÓN.
 *
 * ── POR QUÉ VIVEN AQUÍ Y NO EN LA VISTA ────────────────────────────
 *
 * Porque las usan dos: «Vibraciones», que enseña las medidas, y «Riesgos» del
 * mismo sistema, que enseña lo que se deduce de ellas. Antes eran una sola
 * pantalla y estas piezas eran privadas suyas; al separarlas, dejarlas
 * duplicadas habría sido dejar dos tarjetas que se parecen hoy y divergen en
 * cuanto alguien toque una.
 *
 * NO son las piezas de los riesgos del TANQUE, que viven en `RiesgosEva.jsx`
 * y tienen otra forma: un riesgo de vibración cuelga de un APOYO —de ahí
 * `canalLabel`— y cita una norma, y ninguna de las dos cosas existe allí.
 * Unificarlas obligaría a una tarjeta con campos opcionales que se lee peor
 * que las dos por separado.
 */
import { AlertTriangle, ClipboardCheck, Info, MessageSquareText } from "lucide-react";

import { pedirAlAsistente } from "@/features/asistente";

import { preguntaSobreRiesgoVibracion } from "../domain/riesgosVibracion.js";

/**
 * Cada nivel con su token de color y su icono.
 *
 * `informativo` usa el acento y no el ámbar a propósito: «la máquina gira sin
 * carga» no es un problema, es un hecho que cambia lo que significan las demás
 * medidas. Pintarlo de ámbar junto a un riesgo real enseña a ignorar el ámbar.
 */
export const NIVELES = {
  critico: { label: "Puede romper algo", token: "coral", suave: "coralSoft", Icono: AlertTriangle },
  atencion: { label: "Conviene mirarlo", token: "amber", suave: "amberSoft", Icono: AlertTriangle },
  informativo: { label: "Para tenerlo en cuenta", token: "accent", suave: "accentSoft", Icono: Info },
};

export const nivelInfo = (key) => NIVELES[key] ?? NIVELES.informativo;

/** Una línea rotulada dentro de una tarjeta. */
export function Campo({ t, rotulo, destacado = false, children }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          textTransform: "uppercase", color: t.textFaint, marginBottom: 3,
        }}
      >
        {rotulo}
      </div>
      <p
        style={{
          margin: 0, fontSize: 13, lineHeight: 1.5,
          color: destacado ? t.text : t.textSoft,
          fontWeight: destacado ? 600 : 400,
        }}
      >
        {children}
      </p>
    </div>
  );
}

/** Una tarjeta de riesgo. Evidencia primero: el hecho antes que la deducción. */
export function TarjetaRiesgo({ riesgo, t, onNavigate }) {
  const nivel = nivelInfo(riesgo.nivel);
  const { Icono } = nivel;

  return (
    <article
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderLeft: `4px solid ${t[nivel.token]}`,
        borderRadius: 12, padding: 16,
        display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <header style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Icono size={18} color={t[nivel.token]} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>
            {riesgo.titulo}
          </h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            <span
              style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                color: t[nivel.token], background: t[nivel.suave],
              }}
            >
              {nivel.label}
            </span>
            {riesgo.canalLabel && (
              <span
                style={{
                  padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  color: t.textSoft, background: t.hover,
                }}
              >
                {riesgo.canalLabel}
              </span>
            )}
          </div>
        </div>
      </header>

      <Campo t={t} rotulo="Medido" destacado>{riesgo.evidencia}</Campo>
      <Campo t={t} rotulo="Puede ocurrir">{riesgo.consecuencia}</Campo>
      <Campo t={t} rotulo="Qué revisar">{riesgo.accion}</Campo>

      {riesgo.norma && (
        <p style={{ margin: 0, fontSize: 11, color: t.textFaint, fontStyle: "italic" }}>
          Criterio: {riesgo.norma}
        </p>
      )}

      {/*
        Advertencia sobre la LECTURA del dato, no sobre la máquina. Va dentro de
        la tarjeta y con su propio color: un veredicto apoyado en un estado que
        hemos deducido y no confirmado se lee con más autoridad de la que tiene
        si esto se queda en un comentario del código.
      */}
      {riesgo.nota && (
        <p
          style={{
            margin: 0, fontSize: 11, lineHeight: 1.5, color: t.amber,
            background: t.amberSoft, borderRadius: 6, padding: "6px 10px",
          }}
        >
          {riesgo.nota}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => pedirAlAsistente(preguntaSobreRiesgoVibracion(riesgo))}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${t.border}`, background: t.hover,
            color: t.text, fontSize: 13, fontWeight: 600,
          }}
        >
          <MessageSquareText size={15} />
          Preguntarle a Tdconcito
        </button>

        {/* Plan 16 Fase 5 (UI A) — mismo criterio que la tarjeta del tanque
            en `RiesgosEva.jsx`. `canalLabel` viaja en los parámetros porque
            SÍ sobrevive el viaje por la URL —es texto—, y sin él, si el
            riesgo ya dejó de estar activo para cuando se abre el
            formulario, no habría forma de saber de qué apoyo se hablaba. */}
        <button
          type="button"
          onClick={() => onNavigate?.("cierre-diagnostico", {
            sistema: "vibraciones", riesgoId: riesgo.id, canalLabel: riesgo.canalLabel ?? "",
          })}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${t.accent}`, background: t.accentSoft,
            color: t.accent, fontSize: 13, fontWeight: 600,
          }}
        >
          <ClipboardCheck size={15} />
          Cerrar diagnóstico
        </button>
      </div>
    </article>
  );
}
