/**
 * Vista «Inicio» del SISTEMA DE VIBRACIONES — la landing del segundo sistema.
 *
 * ── POR QUÉ ESTE SISTEMA TIENE SU PROPIA PORTADA ───────────────────
 *
 * Porque es OTRA MÁQUINA. Otro motor, otro variador, otro PLC. La portada de
 * la estación de llenado presenta un tanque con su grupo de bombeo, y colgar
 * de ella una entrada a las vibraciones invitaría a leerlas como una sección
 * más de esa instalación: la primera correlación que alguien sacara entre el
 * caudal de allí y la vibración de aquí uniría dos plantas que no comparten
 * ni un tornillo.
 *
 * ── QUÉ ENSEÑA, Y POR QUÉ NO ES UN HERO ────────────────────────────
 *
 * La portada del tanque abre con una cifra grande en vivo, porque su trabajo
 * es convencer de que el dato es real. Aquí ese recurso sería falso: hoy la
 * mayoría de los puntos de esta máquina NO entregan lectura —cuando el
 * variador se apaga deja de publicar la velocidad, y sin velocidad el módulo
 * no calcula la velocidad eficaz—, así que una cifra enorme presidiendo la
 * pantalla estaría casi siempre vacía o mostrando el único canal que hable.
 *
 * Lo que sí es honesto, y es lo que se enseña: CUÁNTOS de los puntos pedidos
 * han contestado. Una máquina callada y una máquina tranquila se ven igual en
 * un panel que sólo cuenta alarmas, y esa confusión es el modo de fallo caro
 * de todo este módulo — el mismo que motivó la zona «sin comprobar» de las
 * otras pantallas.
 */
import { useMemo } from "react";
import { ArrowRight, HelpCircle, ShieldAlert, Waves } from "lucide-react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { UltimaLectura } from "../components/base.jsx";
import { useVibracion } from "../data/vibracion.js";
import { evaluarRiesgosVibracion } from "../domain/riesgosVibracion.js";
import { bandaISO, CANALES, LIMITES_ISO, VIGILANCIAS } from "../domain/vibraciones.js";

/**
 * Las entradas a las otras vistas del sistema. Van con una frase de qué
 * enseñan y no sólo con su nombre: una tarjeta que sólo promete se lee como
 * un menú, y el menú ya está en el sidebar.
 */
const VISTAS = [
  {
    id: "eva-vibraciones",
    label: "Vibraciones",
    Icono: Waves,
    que: "Los tres apoyos, sus cuatro medidas y qué vigilancias tiene encendidas el módulo.",
  },
  {
    id: "eva-riesgos-vibracion",
    label: "Riesgos",
    Icono: ShieldAlert,
    que: "Qué se deduce de esas medidas, con la evidencia separada de la hipótesis.",
  },
];

/** Una cifra con su rótulo, del tamaño de un dato de interfaz y no de un hero. */
function Dato({ t, valor, rotulo, tono }) {
  return (
    <div
      style={{
        flex: "1 1 160px", minWidth: 150, padding: 16, borderRadius: 12,
        background: t.panel, border: `1px solid ${t.border}`,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, color: tono ?? t.text, lineHeight: 1.1 }}>
        {valor}
      </div>
      <div style={{ fontSize: 12, color: t.textSoft, marginTop: 4 }}>{rotulo}</div>
    </div>
  );
}

function InicioVibraciones({ onNavigate }) {
  const { theme: t } = useTheme();
  const { canales, variador, alarmas, lastUpdated, puntosSinDato, puntosPedidos } =
    useVibracion();

  const res = useMemo(
    () => evaluarRiesgosVibracion({ canales, variador, alarmas }),
    [canales, variador, alarmas],
  );

  const mudos = puntosSinDato?.length ?? 0;
  const total = puntosPedidos ?? 0;
  const contestan = Math.max(0, total - mudos);

  /*
   * `puntosPedidos` sólo lo escribe el camino de éxito del hook: mientras no
   * haya llegado una lectura completa vale 0, y también vale 0 si la petición
   * falló. Por eso la guarda mira `lastUpdated` —hubo o no hubo lectura— y no
   * `total`: con `!total` la cifra se quedaba en un guión para siempre en
   * cuanto el módulo no contestara, que es justo cuando este dato importa.
   */
  const hayLectura = Boolean(lastUpdated);

  /*
   * El diagnóstico de rodamiento —BPFO, BPFI, FTF— es el único que distingue
   * un rodamiento picado de una máquina que vibra un poco más. Se cuenta
   * cuántos apoyos lo tienen APAGADO porque es el hallazgo que motivó media
   * pantalla: estaba apagado en los tres, y nada lo delataba.
   */
  const clavesRodamiento = VIGILANCIAS.filter((v) => v.grupo === "rodamiento").map((v) => v.key);
  const sinVigilar = CANALES.filter((c) =>
    clavesRodamiento.some((k) => canales?.[c.id]?.vigilancias?.[k]?.id === "apagado")
  ).length;

  /*
   * El PEOR veredicto que se pueda afirmar ahora mismo, o ninguno. Se toma el
   * peor y no un promedio: una media entre un apoyo en zona A y otro en zona D
   * daría un número tranquilizador que no describe a ninguno de los dos.
   */
  const veredictos = CANALES
    .map((c) => bandaISO(canales?.[c.id]?.vRMS, res.normaAplicable))
    .filter(Boolean);
  const peor = veredictos.length
    ? veredictos.reduce((a, b) => (b.zona > a.zona ? b : a))
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <AlertBanner
        type="info"
        title="Este es el sistema de vibraciones, no la estación de llenado"
        message={
          "Otro motor, otro variador y otro PLC. No comparte nada con el tanque más que " +
          "estar en la misma planta y en el mismo servidor, así que ninguna lectura de " +
          "aquí explica una de allí. Del historiador todavía no se usan sus series: en " +
          "estas pantallas sólo se ve el instante."
        }
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <SectionLabel>Qué se sabe ahora mismo</SectionLabel>
        <UltimaLectura fecha={lastUpdated} t={t} />
      </div>

      {/*
        El primer dato es cuántos puntos contestan, y va PRIMERO a propósito:
        todo lo que se lea debajo vale lo que valga esa fracción. Con la mitad
        de la máquina muda, un «sin riesgos activos» no significa que no los
        haya, significa que no se pudo mirar.
      */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Dato
          t={t}
          valor={hayLectura ? `${contestan}/${total}` : "—"}
          rotulo="puntos que entregan lectura"
          tono={total > 0 && contestan < total / 2 ? t.warning : undefined}
        />
        <Dato
          t={t}
          valor={peor ? peor.zona : "—"}
          rotulo={peor ? `ISO 10816-1 · ${peor.label.replace(/^zona \w+ · /, "")}` : "sin veredicto ISO que dar"}
          tono={peor?.nivel === "critico" ? t.coral : peor?.nivel === "atencion" ? t.warning : undefined}
        />
        <Dato
          t={t}
          valor={String(res.activos.length)}
          rotulo={`riesgo${res.activos.length === 1 ? "" : "s"} activo${res.activos.length === 1 ? "" : "s"}`}
          tono={res.activos.length > 0 ? t.coral : undefined}
        />
        <Dato
          t={t}
          valor={`${sinVigilar}/${CANALES.length}`}
          rotulo="apoyos con el diagnóstico de rodamiento APAGADO"
          tono={sinVigilar > 0 ? t.warning : undefined}
        />
      </div>

      {sinVigilar > 0 && (
        <AlertBanner
          type="warning"
          title="Nadie está vigilando los rodamientos"
          message={
            `En ${sinVigilar} de los ${CANALES.length} apoyos, las frecuencias de defecto ` +
            "(BPFO, BPFI, FTF) están apagadas en el módulo. Son el único diagnóstico que " +
            "distingue un rodamiento picándose de una máquina que vibra un poco más: sin " +
            "ellas, un rodamiento en mal estado sólo se verá cuando ya haya movido el " +
            "valor eficaz, que es bastante más tarde."
          }
        />
      )}

      {res.noEvaluables.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: t.textSoft, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <HelpCircle size={15} color={t.textFaint} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {res.noEvaluables.length} regla{res.noEvaluables.length === 1 ? "" : "s"} no se
            {res.noEvaluables.length === 1 ? " pudo" : " pudieron"} comprobar por falta de
            lecturas. El detalle está en <strong>Riesgos</strong>.
          </span>
        </p>
      )}

      <SectionLabel>Por dónde entrar</SectionLabel>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {VISTAS.map(({ id, label, Icono, que }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate?.(id)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8,
              padding: 18, borderRadius: 12, cursor: "pointer", textAlign: "left",
              background: t.panel, border: `1px solid ${t.border}`, color: t.text,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Icono size={18} color={t.accent} />
              <span style={{ fontSize: 15, fontWeight: 700 }}>{label}</span>
            </div>
            <span style={{ fontSize: 12.5, color: t.textSoft, lineHeight: 1.5 }}>{que}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: t.accent, marginTop: 2 }}>
              Abrir <ArrowRight size={13} />
            </span>
          </button>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 11, color: t.textFaint, lineHeight: 1.6 }}>
        La banda de ISO 10816-1 Clase I —{LIMITES_ISO.nueva} / {LIMITES_ISO.aviso} / {LIMITES_ISO.alarma} mm/s—
        es la que aplica a este motor por su potencia (1,5 kW), no la de 10816-3 que se usa
        a partir de 15 kW. Con aquélla el aviso caería en 4,5 mm/s y se perdería la mitad
        del margen.
      </p>
    </div>
  );
}

export default InicioVibraciones;
