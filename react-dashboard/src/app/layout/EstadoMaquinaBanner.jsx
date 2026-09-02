/**
 * Indicador permanente de si la bomba está encendida o apagada, visible en la
 * esquina superior izquierda del Topbar en las pestañas de LA ESTACIÓN DE
 * LLENADO.
 *
 * ── POR QUÉ NO EN TODAS LAS PESTAÑAS ───────────────────────────────
 *
 * Porque la bomba es de UNA máquina. Nació cuando toda la aplicación era la
 * estación de llenado y «la máquina» no era ambiguo; desde que la planta se
 * partió en dos sistemas, el mismo indicador junto al título de una pantalla
 * de vibraciones dice «Encendida» sobre una instalación que no es la que se
 * está mirando — y el Topbar es el peor sitio para ese cruce, porque se lee
 * como contexto de lo que hay debajo.
 *
 * Quién lo enseña y quién no lo decide el Topbar a partir de la sección de la
 * página (`SECCION_DE_PAGINA`), no este archivo: el componente sigue sabiendo
 * sólo de su tag. Cuando la máquina de vibraciones tenga su propio control,
 * lo que hará falta es OTRO indicador con su propio tag —«encendida» no
 * significa lo mismo en las dos—, no una condición más aquí.
 *
 * ── POR QUÉ HACE FALTA, SI YA HAY UN INDICADOR EN CONTROLES ────────
 *
 * `ControlesTanque` ya sabe encender y apagar la bomba, pero su confirmación
 * («Bomba encendida») desaparece con el resultado de la acción — no dice
 * nada de si, media hora después, sigue encendida o alguien la apagó desde
 * otro lado. Sin un estado permanente, la única forma de saberlo era mirar
 * `cargaMotor`/`flujoInstantaneo` e inferirlo, que es justo lo que un
 * operador sin ese contexto no puede hacer a simple vista.
 *
 * ── QUÉ TAG LEE, Y POR QUÉ NO ES UNA SEÑAL DEL CATÁLOGO ────────────
 *
 * Lee `ac:TDCON/DEMO/SENSORES/CONTROL` directamente — el mismo punto que
 * escribe `controlar_bomba` (`backend/ia/conversacion/herramientas.mjs`) y confirma tras
 * cada accionamiento. No es una de las ocho señales de
 * `shared/eva/tanque/senales.js` (vive aparte a propósito, ver la cabecera de
 * `ControlesTanque.jsx`), así que no pasa por `useSistemaAgua`: se sondea suelto
 * con `useIconicsPoint`, igual que hace `IconicsLiveCard` para cualquier
 * punto fuera del catálogo.
 *
 * ── LA CADENCIA ──────────────────────────────────────────────────
 *
 * 5 s, la que trae `useIconicsPoint` por defecto — un interruptor de
 * encendido no cambia con la urgencia de un valor analógico, y no vale la
 * pena una segunda cadencia sólo para este punto.
 */
import { Power, PowerOff, AlertTriangle } from "lucide-react";

import { useTheme } from "@/theme";
import { useIconicsPoint } from "@/lib/iconics";
import { HoverTip } from "@/components/ui/HoverTip.jsx";
import { RAIZ } from "@shared/eva/tanque/senales.js";

const TAG_CONTROL = `${RAIZ}CONTROL`;

// La REST API de FrameWorX devuelve quality como StatusCode de OPC UA
// (0 = Good); se acepta también la convención clásica de OPC DA (192) y sus
// variantes en texto — mismo criterio que `IconicsLiveCard.jsx`.
const QUALITY_GOOD = new Set([0, 192, "Good", "good"]);

function normalizar(payload) {
  const item = Array.isArray(payload) ? payload[0] : payload;
  if (!item || typeof item !== "object") return null;
  const valor = item.value ?? item.Value;
  const calidad = item.quality ?? item.Quality;
  return {
    encendida: valor === true || valor === 1 || valor === "1" || valor === "true",
    buena: calidad === undefined || QUALITY_GOOD.has(calidad),
  };
}

export function EstadoMaquinaBanner() {
  const { theme: t } = useTheme();
  const { point, error, loading } = useIconicsPoint(TAG_CONTROL, 5000);
  const dato = normalizar(point);

  // Sin dato todavía (primer ciclo) o con error de lectura: ni «encendida» ni
  // «apagada» son ciertas, así que se dice explícitamente en vez de adivinar
  // con el último estado conocido — la razón de ser de este banner es no
  // dejar al operador sin saber, y un color equivocado sería peor que nada.
  if ((loading && !dato) || error || !dato || !dato.buena) {
    return (
      <HoverTip label={error ? `No se pudo leer ${TAG_CONTROL}: ${error}` : "Estado de la bomba: sin dato"}>
        <span
          role="status"
          aria-label="Estado de la máquina: sin dato"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 11px", borderRadius: 999,
            background: t.panel, border: `1px solid ${t.border}`,
            color: t.textFaint, fontSize: 11.5, fontWeight: 700, fontFamily: "inherit",
          }}
        >
          <AlertTriangle size={12} strokeWidth={2.5} />
          Sin dato
        </span>
      </HoverTip>
    );
  }

  const { encendida } = dato;
  const color = encendida ? t.success : t.textSoft;
  const fondo = encendida ? t.successSoft ?? `${t.success}22` : t.hover;
  const Icono = encendida ? Power : PowerOff;

  return (
    <HoverTip label={`Máquina ${encendida ? "encendida" : "apagada"} · ${TAG_CONTROL}`}>
      <span
        role="status"
        aria-label={`Estado de la máquina: ${encendida ? "encendida" : "apagada"}`}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 11px", borderRadius: 999,
          background: fondo, border: `1px solid ${encendida ? color : t.border}`,
          color, fontSize: 11.5, fontWeight: 700, fontFamily: "inherit",
        }}
      >
        <Icono size={12} strokeWidth={2.5} />
        {encendida ? "Encendida" : "Apagada"}
      </span>
    </HoverTip>
  );
}
