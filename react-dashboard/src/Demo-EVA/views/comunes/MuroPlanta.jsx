/**
 * Vista «Muro de planta» — las dos máquinas a la vez, cada una con lo suyo
 * (Plan 25 F10 · `NUE-09`).
 *
 * ── QUÉ HABÍA, Y QUÉ FALTABA ─────────────────────────────────────────
 *
 * `modoMuro.js` (Plan 13 F8) resuelve CÓMO se pinta un muro: sin cromo, con
 * zoom, con rotación opcional entre `?vistas=a,b,c`. Pero rotar entre vistas
 * es enseñar UNA máquina cada vez — nunca las dos a la vez en la misma
 * pantalla. `LatidoMuro` (Plan 24 F9) demostró que un latido tiene que venir
 * de haber preguntado, pero es del TANQUE (`useSistemaAgua`), no genérico.
 *
 * Esta vista es la que faltaba: un panel por máquina, montados juntos, cada
 * uno con su propio latido, su propio peor veredicto y su propia frescura.
 *
 * ── ES UNA VISTA NORMAL, NAVEGABLE, NO «SÓLO MURO» ────────────────────
 *
 * `?muro=1` es una capa de presentación que le quita el cromo a CUALQUIER
 * ruta — no hay precedente de una vista que exista sólo para ese modo, y ésta
 * no rompe el patrón: es útil también fuera de muro, para tener el resumen
 * combinado en un vistazo antes de decidir a qué máquina entrar.
 *
 * ── LA REGLA QUE ESTA VISTA NO PUEDE ROMPER: `NO_COMPARTEN` ───────────
 *
 * Cada panel pide SU hook (`useSistemaAgua`/`useVibracion`), calcula SU
 * frescura y SU peor veredicto, y NINGUNA cifra se suma entre los dos. Un
 * «3 alarmas» que sumara las activas del tanque con las de vibraciones ya
 * rompería la regla, aunque el número saliera bien — las dos instalaciones
 * tienen distinto PLC y no comparten nada (`shared/eva/comun/sistemas.js`).
 *
 * ── POR QUÉ EL PEOR VEREDICTO NO ES EL MISMO CÁLCULO EN LAS DOS ───────
 *
 * Tanque: el peor riesgo ACTIVO (`evaluarRiesgos`, mismo motor que Riesgos y
 * la Bandeja de Hallazgos — F0/F6). Vibraciones: la peor zona ISO
 * (`peorZonaDe`, extraída en esta misma fase al descubrir que la copia de F4
 * estaba rota — ver su cabecera en `shared/eva/vibraciones/vibraciones.js`).
 * Son dos preguntas distintas porque son dos dominios distintos; forzar el
 * mismo cálculo en las dos sería inventar una equivalencia que no existe.
 *
 * ── LAS ALARMAS ACTIVAS SÓLO EXISTEN PARA EL TANQUE ───────────────────
 *
 * Las nueve alarmas del catálogo (`naturaleza: "alarma"`) son del tanque; ver
 * `AlarmasEva.jsx` y F3. El panel de vibraciones no dice «0 alarmas» —que
 * afirmaría que se miró y no había ninguna—, dice que no aplica, mismo
 * criterio que el carril «no aplica» de la línea de tiempo (F3).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Bell, Power } from "lucide-react";

import { useTheme } from "@/theme";
import { useAhora } from "../../lib/useAhora.js";
import { FRESCURA, frescuraDe } from "../../data/comunes/estadoDelDato.js";
import { fmtAntiguedad } from "@/lib/format.js";
import { useSistemaAgua } from "../../data/comunes/hooks.js";
import { useVibracion } from "../../data/vibraciones/vibracion.js";
import { useProsa } from "@/i18n/useProsa.js";
import { useDominio } from "@/i18n/useDominio.js";
import { evaluarRiesgos } from "../../domain/riesgos.js";
import { evaluarRiesgosVibracion } from "../../domain/riesgosVibracion.js";
import { peorZonaDe } from "@shared/eva/vibraciones/vibraciones.js";

const SEVERIDAD_TOKEN = { critico: "coral", atencion: "amber", informativo: "accent" };

export default function MuroPlanta() {
  const { theme: t } = useTheme();
  const { t: traducir } = useTranslation(["maintenance", "machines", "common"]);
  const { sistema: nombreSistema } = useDominio();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text }}>
          {traducir("maintenance:wall.title")}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: t.textSoft }}>
          {traducir("maintenance:wall.subtitle")}
        </p>
      </header>

      {/*
        Dos paneles, uno por máquina. NO un grid que sugiera que se puede
        comparar celda a celda: cada uno es una tarjeta cerrada, con su
        nombre, y nada cruza de una a otra.
      */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <PanelTanque nombreSistema={nombreSistema} t={t} traducir={traducir} />
        <PanelVibraciones nombreSistema={nombreSistema} t={t} traducir={traducir} />
      </div>
    </div>
  );
}

/** La pastilla de frescura, IGUAL en los dos paneles — es el mismo criterio de `LatidoMuro`, por máquina. */
function Frescura({ receivedAt, t, traducir }) {
  const ahora = useAhora();
  const frescura = frescuraDe({ receivedAt, ahora });
  const congelado = frescura === FRESCURA.CONGELADO;
  const sinDato = frescura === FRESCURA.SIN_DATO;
  const color = sinDato || congelado ? t.coral : t.success;

  const texto = sinDato
    ? traducir("common:time.noReading")
    : congelado
      ? fmtAntiguedad(receivedAt, ahora.getTime())
      : traducir("common:time.live");

  return (
    <span
      aria-live="polite"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 11.5, fontWeight: 700, color,
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {texto}
    </span>
  );
}

function PanelTanque({ nombreSistema, t, traducir }) {
  const { riesgo: traducirRiesgo } = useProsa();
  const { sistema, lastUpdated } = useSistemaAgua();

  const { activos } = useMemo(() => evaluarRiesgos(sistema), [sistema]);
  const peor = activos[0] ?? null; // ya vienen ordenados por severidad (riesgos.js)

  // Cuántas de las nueve alarmas del PLC están activas ahora — el mismo
  // conteo que ya usa `AlarmasEva.jsx` «En vivo», no uno recalculado aquí.
  const alarmasActivas = useMemo(
    () => (sistema?.activos ?? []).reduce((n, a) => n + (a.alarmas?.activas ?? 0), 0),
    [sistema]
  );

  return (
    <Panel
      titulo={nombreSistema("tanque")}
      t={t}
      frescura={<Frescura receivedAt={lastUpdated} t={t} traducir={traducir} />}
    >
      {peor ? (
        <Veredicto
          t={t}
          token={SEVERIDAD_TOKEN[peor.severidad] ?? "accent"}
          texto={traducirRiesgo(peor).titulo}
        />
      ) : (
        <VeredictoVacio t={t} texto={traducir("maintenance:wall.noRisk")} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.textSoft }}>
        <Bell size={13} />
        {alarmasActivas > 0
          ? traducir("maintenance:wall.alarmsActive", { count: alarmasActivas })
          : traducir("maintenance:wall.alarmsNone")}
      </div>
    </Panel>
  );
}

function PanelVibraciones({ nombreSistema, t, traducir }) {
  const { riesgoVibracion: traducirRiesgoVibracion } = useProsa();
  const { canales, variador, alarmas, lastUpdated } = useVibracion();

  const { activos, normaAplicable } = useMemo(
    () => evaluarRiesgosVibracion({ canales, variador, alarmas }),
    [canales, variador, alarmas]
  );
  const peorRiesgo = activos[0] ?? null;
  const peorZona = useMemo(() => peorZonaDe(canales, normaAplicable), [canales, normaAplicable]);

  return (
    <Panel
      titulo={nombreSistema("vibraciones")}
      t={t}
      frescura={<Frescura receivedAt={lastUpdated} t={t} traducir={traducir} />}
    >
      {peorRiesgo ? (
        <Veredicto
          t={t}
          token={SEVERIDAD_TOKEN[peorRiesgo.nivel] ?? "accent"}
          texto={traducirRiesgoVibracion(peorRiesgo).titulo}
        />
      ) : peorZona ? (
        <Veredicto
          t={t}
          token={SEVERIDAD_TOKEN[peorZona.nivel] ?? "success"}
          texto={traducir("maintenance:wall.zone", { zona: peorZona.zona })}
        />
      ) : (
        <VeredictoVacio t={t} texto={traducir("maintenance:wall.noRisk")} />
      )}

      {/*
        Las alarmas del PLC no existen para esta máquina — no es que estén en
        cero, es que no hay ninguna declarada (F3). Decirlo con las mismas
        palabras que ya usa la línea de tiempo evita que un «0» se lea como
        «se miró y no había ninguna».
      */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.textFaint }}>
        <AlertTriangle size={13} />
        {traducir("maintenance:wall.alarmsNotApplicable")}
      </div>
    </Panel>
  );
}

function Panel({ titulo, frescura, t, children }) {
  return (
    <section
      style={{
        flex: "1 1 320px", minWidth: 280,
        background: t.panel, border: `1px solid ${t.border}`,
        borderRadius: 14, padding: 18,
        display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>{titulo}</h3>
        {frescura}
      </div>
      {children}
    </section>
  );
}

function Veredicto({ t, token, texto }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 12px", borderRadius: 10,
        background: `${t[token]}18`, border: `1px solid ${t[token]}44`,
      }}
    >
      <Power size={15} color={t[token]} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{texto}</span>
    </div>
  );
}

function VeredictoVacio({ t, texto }) {
  return (
    <div
      style={{
        padding: "10px 12px", borderRadius: 10,
        background: t.hover, border: `1px solid ${t.border}`,
        fontSize: 13, color: t.textSoft,
      }}
    >
      {texto}
    </div>
  );
}
