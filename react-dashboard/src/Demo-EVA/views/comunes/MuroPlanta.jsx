/**
 * Vista «Muro de planta»: todas las máquinas configuradas a la vez, cada una
 * con lo suyo (Plan 25 F10 · `NUE-09`; un panel por configurada desde el Plan
 * 40 F2). Es la pantalla de entrada (`DEFAULT_ROUTE`).
 *
 * ── QUÉ HABÍA, Y QUÉ FALTABA ─────────────────────────────────────────
 *
 * `modoMuro.js` (Plan 13 F8) resuelve CÓMO se pinta un muro: sin cromo, con
 * zoom, con rotación opcional entre `?vistas=a,b,c`. Pero rotar entre vistas
 * es enseñar UNA máquina cada vez — nunca varias a la vez en la misma
 * pantalla. Esta vista es la que faltaba: un panel por máquina, montados
 * juntos, cada uno con su propio latido, su propio peor veredicto y su
 * propia frescura.
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
 * Cada panel recibe SU entrada de `useMaquinasEnVivo()`, calcula SU frescura
 * y SU peor veredicto, y NINGUNA cifra se suma entre paneles. Un «3 alarmas»
 * que sumara dos máquinas ya rompería la regla, aunque el número saliera
 * bien — cada máquina tiene su PLC y no comparte nada con las demás
 * (`shared/eva/comun/sistemas.js`).
 *
 * ── EL PEOR VEREDICTO ES EL DE CADA TIPO ──────────────────────────────
 *
 * Los riesgos vienen ya evaluados con las reglas de su tipo; si no hay
 * ninguno activo y el tipo sabe de zonas (ISO en vibraciones), se enseña la
 * peor zona. Forzar el mismo cálculo en tipos distintos sería inventar una
 * equivalencia que no existe.
 *
 * ── HASTA EL 23-09-2026 HABÍA UN PANEL FIJO DEL TANQUE ────────────────
 *
 * Con `useSistemaAgua()` y el `evaluarRiesgos` del tanque, y con su conteo
 * de alarmas del PLC (las nueve del catálogo eran suyas). Se retiró en el
 * Plan 42.5 F4 con el resto de las vistas del tanque: cuando el tanque entre
 * como máquina configurada (Plan 43) tendrá aquí su panel como cualquier
 * otra, sin una rama aparte. Sus alarmas del PLC serán entonces cosa de su
 * tipo; mientras un tipo no las declare, el panel dice que no aplican, no
 * «0». Sin ninguna configurada en servicio la pantalla lo dice, en vez de
 * quedarse en blanco.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Power } from "lucide-react";

import { useTheme } from "@/theme";
import { useAhora } from "../../lib/useAhora.js";
import { FRESCURA, frescuraDe } from "../../data/comunes/estadoDelDato.js";
import { fmtAntiguedad } from "@/lib/format.js";
import { useMaquinasEnVivo } from "../../data/comunes/maquinasEnVivo.js";
import { useProsa } from "@/i18n/useProsa.js";
import { useDominio } from "@/i18n/useDominio.js";

const SEVERIDAD_TOKEN = { critico: "coral", atencion: "amber", informativo: "accent" };

export default function MuroPlanta() {
  const { theme: t } = useTheme();
  const { t: traducir } = useTranslation(["maintenance", "machines", "common"]);
  const { sistema: nombreSistema } = useDominio();
  /* Todas las configuradas activas, en vivo, una suscripción por máquina. */
  const maquinas = useMaquinasEnVivo();

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
        Un panel por máquina. NO un grid que sugiera que se puede comparar
        celda a celda: cada uno es una tarjeta cerrada, con su nombre, y nada
        cruza de una a otra.
      */}
      {maquinas.length === 0 && <VeredictoVacio t={t} texto={traducir("maintenance:wall.empty")} />}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {maquinas.map((entrada) => (
          <PanelConfigurada
            key={entrada.maquina.id}
            entrada={entrada}
            nombreSistema={nombreSistema}
            t={t}
            traducir={traducir}
          />
        ))}
      </div>
    </div>
  );
}

/** La pastilla de frescura, IGUAL en todos los paneles — es el mismo criterio de `LatidoMuro`, por máquina. */
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

/**
 * Un panel por máquina CONFIGURADA (Plan 40 F2). Recibe su entrada de
 * `useMaquinasEnVivo()` —estado en vivo y riesgos ya evaluados con las reglas
 * de su tipo— y no abre motor propio: el muro se suscribe una vez a todas.
 * Hasta el 21-09-2026 aquí había un panel fijo para la máquina de vibraciones
 * escrita a mano, con `useVibracion()`.
 */
function PanelConfigurada({ entrada, nombreSistema, t, traducir }) {
  const { riesgoVibracion: traducirRiesgoVibracion } = useProsa();
  const { maquina, tipo, estado, riesgos } = entrada;

  const peorRiesgo = riesgos.activos[0] ?? null;
  const normaAplicable = riesgos.normaAplicable ?? null;
  const peorZona = useMemo(
    () => (tipo?.peorZona ? tipo.peorZona(estado.canales, normaAplicable) : null),
    [tipo, estado.canales, normaAplicable]
  );
  const esVibraciones = tipo?.id === "vibraciones";

  return (
    <Panel
      titulo={nombreSistema(maquina.id)}
      t={t}
      frescura={<Frescura receivedAt={estado.lastUpdated} t={t} traducir={traducir} />}
    >
      {peorRiesgo ? (
        <Veredicto
          t={t}
          token={SEVERIDAD_TOKEN[peorRiesgo.nivel] ?? "accent"}
          texto={esVibraciones ? traducirRiesgoVibracion(peorRiesgo).titulo : peorRiesgo.titulo}
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
        cero, es que no hay ninguna declarada. Decirlo con las mismas palabras
        que ya usa la línea de tiempo evita que un «0» se lea como «se miró y
        no había ninguna».
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
