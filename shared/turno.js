/**
 * Aritmética del turno y metas de planta.
 *
 * Es la parte de `shiftModel.js` que **no** es presentación: constantes de
 * tiempo, metas por factor y el desglose de tiempos de una máquina. Vive aquí
 * desde el Plan 7 porque `buildPlantSummary` la necesita, y ese resumen lo
 * calculan ahora los dos lados —el tablero y las herramientas del asistente—.
 *
 * El formateo (`fmtHM`, `bandColor`, `clampPct`) se queda en el frontend: es
 * presentación, depende del tema y no tiene nada que hacer en el backend.
 */
import { hasValue } from './domain/machine.js'

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
 * cuando no hay lectura.
 */
export const TURNO_S = 8 * 3600;          // 28 800 s
export const PARO_PLANIFICADO_S = 3600;   // 3 600 s

/*
 * Metas por factor (%). Fuente única.
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
