/**
 * prototypes/machine-cards/cardShared.js
 * ------------------------------------------------------------------
 * SOLO lógica de datos/semántica compartida por las tarjetas de máquina
 * en evaluación (NO estilos: cada propuesta define su propia piel visual;
 * la única excepción documentada es _neonSkin.js, que comparten las dos
 * variantes Neon por ser la misma piel en dos formatos).
 *
 * Centraliza el mapeo estado → color/ícono y el color por umbral de OEE
 * para que las cinco propuestas coincidan en "qué significa cada color",
 * aunque lo dibujen de maneras completamente distintas.
 *
 * Carpeta temporal: cuando se elija una propuesta, se promueve al kit
 * definitivo y esta carpeta se elimina.
 */
import { useEffect, useRef, useState } from "react";
import { CircleCheck, Wrench, ShieldCheck, Sparkles, Coffee, OctagonAlert, CircleSlash, PauseCircle, PlugZap, Settings2, Clock, Gauge, BadgeCheck, Activity } from "lucide-react";

/**
 * Acepta DOS vocabularios: las claves canónicas del dominio (las que
 * entregan `usePlantData`/`useAreaData` tras la migración a ICONICS) y las
 * cadenas viejas en español, que siguen usando el Sandbox y los datos de
 * `lib/machines.js`. Así las tarjetas funcionan con ambas fuentes sin un
 * adaptador de estados en cada consumidor.
 */
const ESTADO_MAP = {
  // Vocabulario canónico del dominio (lib/domain/estado.js)
  running: { token: "success", Icon: CircleCheck, label: "Operando" },
  standby: { token: "textSoft", Icon: PauseCircle, label: "Stand By" },
  setup: { token: "accent", Icon: Settings2, label: "Set-Up" },
  commfail: { token: "amber", Icon: PlugZap, label: "Sin comunicación" },
  alarma: { token: "coral", Icon: OctagonAlert, critical: true, label: "Alarma" },
  unknown: { token: "textFaint", Icon: CircleSlash, label: "Sin dato" },

  // Vocabulario heredado (mock de lib/machines.js, Sandbox)
  "Operando": { token: "success", Icon: CircleCheck },
  "Mantenimiento Correctivo": { token: "amber", Icon: Wrench },
  "Mantenimiento Preventivo": { token: "accent", Icon: ShieldCheck },
  "Limpieza": { token: "violet", Icon: Sparkles },
  "Receso": { token: "textSoft", Icon: Coffee },
  "Paro de Emergencia": { token: "coral", Icon: OctagonAlert, critical: true },
};

/** Devuelve { color, Icon, label, critical } para un estado dado. */
export function estadoInfo(theme, estado) {
  // Fallback a `unknown`, no a Operando: un estado que el mapa no conoce
  // no puede pintarse verde — sería afirmar que la máquina produce.
  const cfg = ESTADO_MAP[estado] ?? ESTADO_MAP.unknown;
  return { color: theme[cfg.token], Icon: cfg.Icon, label: cfg.label ?? estado, critical: !!cfg.critical };
}

/** Color semántico por umbral (rojo < 50 ≤ ámbar < 75 ≤ verde). */
export function oeeColor(theme, v) {
  if (v < 50) return theme.coral;
  if (v < 75) return theme.amber;
  return theme.success;
}

/** Etiqueta cualitativa de "clase mundial" para un valor de OEE. */
export function oeeBandLabel(v) {
  if (v < 40) return "Muy bajo";
  if (v < 50) return "Bajo";
  if (v < 60) return "Regular";
  if (v < 75) return "Bueno";
  if (v < 85) return "Alt. eficiente";
  return "Clase mundial";
}

/** OEE (%) a partir de los 3 factores (D × R × C / 10000). */
export function oee(d, r, c) {
  return (d * r * c) / 10000;
}

export const clampPct = (v) => Math.max(0, Math.min(100, v));

/** Iconos por factor + OEE (para las versiones "Pro"). */
export const FACTOR_ICONS = {
  disponibilidad: Clock,
  rendimiento: Gauge,
  calidad: BadgeCheck,
  oee: Activity,
};

/** Metas por defecto de cada factor (marcadores). */
export const METAS = { disponibilidad: 90, rendimiento: 85, calidad: 99, oee: 85 };

/**
 * Conteo animado hacia `target` con easing (ease-out cubic). Devuelve el
 * valor intermedio para animar números al montar/actualizar.
 */
export function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const raf = useRef();
  useEffect(() => {
    let start;
    const from = 0;
    const tick = (ts) => {
      if (start == null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

/** Genera una mini-serie determinista alrededor de un valor (sparkline). */
export function miniTrend(value, id = "", points = 14) {
  let h = 2166136261 ^ id.length;
  for (let i = 0; i < id.length; i++) { h = Math.imul(h ^ id.charCodeAt(i), 16777619); }
  const out = [];
  for (let i = 0; i < points; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    const rnd = ((h >>> 0) / 4294967296 - 0.5) * 14;
    const wave = Math.sin(i / 2.2) * 4;
    out.push(clampPct(value + rnd + wave));
  }
  out[points - 1] = clampPct(value); // ancla al valor real
  return out;
}
