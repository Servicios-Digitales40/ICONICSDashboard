/**
 * La barra de contexto de la máquina que se está mirando (Plan 25 F4 · `NUE-06`).
 *
 * ── QUÉ SUSTITUYE, Y POR QUÉ NO ES UN `if` CON DOS RAMAS ───────────
 *
 * `EstadoMaquinaBanner` enseña si la bomba está encendida, y sólo en las
 * pestañas de la estación de llenado. El Topbar lo filtra con
 * `SECCION_DE_PAGINA[page] === "sec-llenado"`, y su propio comentario dice a
 * dónde tenía que ir esto:
 *
 *   «Cuando la máquina de vibraciones tenga su propio control, esto no será un
 *    `if` con dos ramas sino un indicador por sección — su tag es otro, su
 *    estado es otro, y "encendida" no significa lo mismo en las dos.»
 *
 * Esto es ese indicador por sección. La sección decide qué se enseña, y cada
 * máquina trae lo suyo.
 *
 * ── LO QUE ESTA FASE ENCONTRÓ, Y CAMBIA LA ENTREGA ─────────────────
 *
 * **La máquina de vibraciones no tiene tag de control.** No es que no se haya
 * cableado: no está confirmado que exista, y sus guardas tampoco. Lo dice la
 * cabecera de `ControlesVibraciones.jsx`, que por eso es un placeholder sin un
 * solo botón — «el tag de escritura de este PLC, y confirmar que acepta la
 * orden […] viven en otro árbol y no están comprobados».
 *
 * Así que el `NUE-06` literal —«otro indicador con su propio tag»— **no se
 * puede construir hoy sin inventarse el tag** (§2.5). Lo que sí se puede, y es
 * lo que esta barra hace, es enseñar de cada máquina lo que de verdad se sabe:
 *
 *   · **Tanque** — si la bomba está encendida. Es un tag real, ya medido, y el
 *     mismo que escribe `controlar_bomba`.
 *   · **Vibraciones** — su peor zona ISO ahora mismo, que es el veredicto que
 *     esa máquina sí produce.
 *   · **Las dos** — cuántos de sus puntos no contestan. Es la mitad de la
 *     información que se pierde al normalizar (ver la cabecera de
 *     `estadoMaquina.js`) y la que separa «una máquina tranquila» de «una
 *     máquina de la que no sabemos nada».
 *
 * ── POR QUÉ EL SILENCIO VA EN LA BARRA Y NO SÓLO EN LA VISTA ───────
 *
 * Por el incidente del 26-08-2026 que cita `estadoMaquina.js`: quince de
 * veintiún puntos se apagaron a la vez, y una pantalla que contara sólo riesgos
 * activos habría estado en verde sobre una máquina de la que no sabía nada. La
 * barra de contexto está SIEMPRE visible; una vista concreta, no.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Activity } from "lucide-react";

import { HoverTip } from "@/components/ui/HoverTip.jsx";
import { useHayFuenteEva } from "@/Demo-EVA/data/comunes/EvaProvider.jsx";
import { useSistemaAgua } from "@/Demo-EVA/data/comunes/hooks.js";
import { useVibracion } from "@/Demo-EVA/data/vibraciones/vibracion.js";
import { useTheme } from "@/theme";
import { normaAplicableDe, peorZonaDe } from "@shared/eva/vibraciones/vibraciones.js";

import { EstadoMaquinaBanner } from "./EstadoMaquinaBanner.jsx";

/**
 * ── POR QUÉ CADA MÁQUINA SE SUSCRIBE EN SU PROPIO COMPONENTE ───────
 *
 * Porque el Topbar no puede pedir las dos. Suscribirse a tanque y a vibraciones
 * ahí arriba sondearía la máquina que NO se está mirando durante toda la sesión
 * — y el motivo por el que `eva-alarmas` estuvo escondida un tiempo fue
 * exactamente ése: un botón del Topbar sondeando en toda la aplicación.
 *
 * Así que el despacho es por sección y cada rama monta su propio suscriptor.
 * Montar un componente distinto por máquina es lo que permite que el hook de
 * vibraciones no exista siquiera mientras se mira el tanque.
 *
 * @param {object} props
 * @param {"sec-llenado"|"sec-vibraciones"|string} props.seccion
 */
export function ContextoDeMaquina({ seccion }) {
  /*
   * Sin `EvaProvider` no se pide nada. Esta barra es un añadido sobre un título
   * que ya se lee bien sin ella, y `useSistemaAgua`/`useVibracion` LANZAN fuera
   * del proveedor —a propósito, para que una vista de planta sin fuente falle
   * ruidosamente en vez de enseñar una pantalla muda—. Aquí eso convertiría el
   * Topbar en algo que no se puede montar suelto. Mismo criterio que
   * `useEsSimulado()` en F0: «no lo sé» cae del lado que no consulta.
   */
  const hayFuente = useHayFuenteEva();

  /*
   * Fuera de las dos máquinas no hay contexto de máquina que dar. «Alarmas»,
   * «Assets» o «Salud» hablan del servidor, y una pastilla de estado ahí diría
   * algo de una instalación que no es la que se está mirando — exactamente el
   * cruce que el filtro por sección existe para impedir.
   */
  if (seccion === "sec-llenado") {
    // El indicador de la bomba NO depende de la fuente: lee su tag suelto con
    // `useIconicsPoint`, así que sigue saliendo aunque no haya proveedor.
    return hayFuente ? <ContextoDelTanque /> : <Pastillas><EstadoMaquinaBanner /></Pastillas>;
  }
  if (seccion === "sec-vibraciones") return hayFuente ? <ContextoDeVibraciones /> : null;
  return null;
}

/** El tanque: su bomba (tag real) y su silencio. */
function ContextoDelTanque() {
  const { sistema } = useSistemaAgua();
  const sinLectura = sistema?.sinLectura?.length ?? 0;
  const puntosPedidos = sistema?.puntosPedidos ?? 0;

  return (
    <Pastillas>
      {/* Conserva su indicador: es un tag real y no hay nada mejor que enseñar. */}
      <EstadoMaquinaBanner />
      <Silencio sinLectura={sinLectura} puntosPedidos={puntosPedidos} />
    </Pastillas>
  );
}

/** Vibraciones: su peor zona ISO (no tiene tag de control) y su silencio. */
function ContextoDeVibraciones() {
  const { t: traducir } = useTranslation(["machines", "common"]);
  const { theme: t } = useTheme();
  const { canales, variador, puntosSinDato } = useVibracion();

  /*
   * `peorZonaDe()` — Plan 25 F10. Un primer intento de esta fase filtraba
   * `canal.zona && canal.nivel` directamente sobre `canales`, y SIEMPRE daba
   * vacío: ese campo no existe ahí, `bandaISO()` se calcula aparte con
   * `normaAplicable`. Este indicador no mostraba nada en producción real
   * desde que se escribió en F4 — se descubrió al construir F10, que
   * necesita el mismo dato.
   *
   * `normaAplicableDe()` y no `evaluarRiesgosVibracion()` completo: ese motor
   * trae 900+ líneas de reglas que no hacen falta aquí, y metía todo ese
   * archivo en el chunk de ARRANQUE —este componente se monta SIEMPRE, en el
   * Topbar—. Medido: +19 KB. Ver su cabecera en
   * `shared/eva/vibraciones/vibraciones.js`.
   */
  const normaAplicable = useMemo(() => normaAplicableDe(variador?.velocidad), [variador]);
  const peorZona = useMemo(() => peorZonaDe(canales, normaAplicable), [canales, normaAplicable]);

  return (
    <Pastillas>
      {peorZona && (
        <HoverTip texto={traducir("machines:context.worstZoneTip")}>
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 999,
              fontSize: 12, fontWeight: 700,
              color: t[tokenDeNivel(peorZona.nivel)],
              background: `${t[tokenDeNivel(peorZona.nivel)]}22`,
              border: `1px solid ${t[tokenDeNivel(peorZona.nivel)]}`,
            }}
          >
            <Activity size={14} />
            {traducir("machines:context.worstZone", { zona: peorZona.zona })}
          </span>
        </HoverTip>
      )}
      <Silencio sinLectura={puntosSinDato?.length ?? 0} puntosPedidos={0} />
    </Pastillas>
  );
}

/** El contenedor común, para que las dos ramas no puedan derivar en estilo. */
function Pastillas({ children }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>{children}</div>;
}

/**
 * Cuántos puntos no contestan.
 *
 * Sólo aparece si hay alguno: una pastilla «0 sin dato» permanente sería ruido,
 * y este aviso tiene que significar algo el día que aparezca.
 */
function Silencio({ sinLectura, puntosPedidos }) {
  const { t: traducir } = useTranslation(["machines", "common"]);
  const { theme: t } = useTheme();

  if (!sinLectura) return null;

  return (
    <HoverTip texto={traducir("machines:context.silentTip")}>
      <span
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "7px 12px", borderRadius: 999,
          fontSize: 12, fontWeight: 700,
          color: t.amber, background: t.amberSoft,
          border: `1px solid ${t.amber}`,
        }}
      >
        <AlertTriangle size={14} />
        {/*
          Con `puntosPedidos` a 0 se dice sólo cuántos callan, sin el «de N»:
          vibraciones no publica ese total, y escribir «3 de 0» sería peor que
          no dar el denominador.
        */}
        {puntosPedidos > 0
          ? traducir("machines:context.silent", { n: sinLectura, total: puntosPedidos })
          : traducir("machines:context.silentSinTotal", { n: sinLectura })}
      </span>
    </HoverTip>
  );
}

/** El token de color de un nivel de vibración. Mismo vocabulario que las tarjetas. */
function tokenDeNivel(nivel) {
  if (nivel === "critico") return "coral";
  if (nivel === "atencion") return "amber";
  return "success";
}
