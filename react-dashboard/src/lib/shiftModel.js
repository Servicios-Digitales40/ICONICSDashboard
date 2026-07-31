/**
 * Modelo de tiempo del turno, metas de planta y utilidades de formato y banda
 * de color.
 *
 * Es JS puro (`bandColor` recibe el tema por argumento) para que la aritmética
 * del turno sea comprobable en node. Vive en `lib/` porque lo consumen tanto
 * `features/machines` como `features/dashboard`.
 */
import { hasValue } from "./domain/index.js";
import { SIN_DATO, pctSeguro } from "./format.js";

/*
 * Modelo de tiempo del turno.
 *
 * La disponibilidad es un cociente de tiempos, y el desglose (potencia
 * disponible → planificado → ejecución real) se apoya en dos magnitudes que
 * ICONICS entrega por máquina:
 *
 *   T_Disp_pot   → machine.tDispPot    tiempo disponible potencial
 *   T_Inac_plan  → machine.tInacPlan   inactividad planificada
 *
 * Estas constantes asumen un turno de 8 h, mientras que ICONICS calcula sobre
 * 24 h restando un `T_Inac_plan` que viene de una consulta SQL externa: son
 * dos definiciones distintas de disponibilidad y dan números distintos. Por
 * eso `tiemposTurno` prefiere siempre el dato del servidor y solo cae aquí
 * cuando no hay lectura, que en la práctica es el modo demo.
 */
export const TURNO_S = 8 * 3600;          // 28 800 s
export const PARO_PLANIFICADO_S = 3600;   // 3 600 s

/*
 * Metas por factor (%). Fuente única; `compare.js` reexporta estas.
 *
 * Los cuatro valores son coherentes entre sí: 90 × 95 × 99 / 10000 = 84,65,
 * que redondea al 85 % de OEE de clase mundial. Al cambiar un factor conviene
 * revisar que el producto siga cuadrando con la meta de OEE.
 *
 * Rendimiento (95) y OEE (85) son el estándar de la industria, no un dato de
 * planta: pendiente de confirmar.
 */
export const METAS = {
  disponibilidad: 90,
  rendimiento: 95,
  calidad: 99,
  oee: 85,
};

// Alias por comodidad para las subvistas de factor, que leen una sola meta.
export const META_DISPONIBILIDAD = METAS.disponibilidad;
export const META_CALIDAD = METAS.calidad;

/**
 * Desglose de tiempos de una máquina, en segundos.
 *
 * `ejecucion` y `paroNoPlanificado` valen `null` si no hay disponibilidad
 * medida. Un 0 se sumaría a los totales de planta como si la máquina hubiese
 * estado parada todo el turno.
 */
export function tiemposTurno(machine) {
  const potencia = hasValue(machine?.tDispPot) ? machine.tDispPot : TURNO_S;
  const paroPlanificado = hasValue(machine?.tInacPlan) ? machine.tInacPlan : PARO_PLANIFICADO_S;
  const planificado = potencia - paroPlanificado;

  if (!hasValue(machine?.disponibilidad)) {
    return { potencia, paroPlanificado, planificado, ejecucion: null, paroNoPlanificado: null };
  }

  const ejecucion = Math.round((planificado * machine.disponibilidad) / 100);
  return { potencia, paroPlanificado, planificado, ejecucion, paroNoPlanificado: planificado - ejecucion };
}

/*
 * Formateo. Los tres toleran huecos porque `tiemposTurno` devuelve `null`
 * cuando falta la disponibilidad, y `Math.round(null)` vale 0 en JavaScript:
 * sin la comprobación la vista pintaría «0 s» donde no hubo medición.
 */

/** 18000 → "18 000 s" · null → "—" */
export const fmtSeg = (s) => (hasValue(s) ? `${Math.round(s).toLocaleString("es-MX")} s` : SIN_DATO);

/** 18000 → "5 h 00 m" · 3600 → "1 h 00 m" · 900 → "15 m" · null → "—" */
export function fmtHM(s) {
  if (!hasValue(s)) return SIN_DATO;
  const total = Math.round(s / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")} m` : `${m} m`;
}

/**
 * Acota a 0–100 para geometría (anchos de barra, arcos, offsets).
 *
 * Devuelve 0 ante un hueco, así que no sirve para producir texto: para eso
 * están `fmtNum`/`fmtPct` de lib/format.js, que distinguen la ausencia de
 * dato y escriben «—».
 */
export const clampPct = (v) => pctSeguro(v);

/**
 * Color por banda, con los mismos cortes que usa el resto de la app. Sin
 * medición devuelve el tono apagado, para no marcar en rojo un factor que
 * simplemente no se ha leído.
 */
export const bandColor = (t, v) =>
  !hasValue(v) ? t.textFaint : v < 50 ? t.viz.coral : v < 75 ? t.viz.ambar : t.viz.verde;
