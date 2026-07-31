/**
 * lib/shiftModel.js
 * ------------------------------------------------------------------
 * Modelo de tiempo del turno, metas de planta y utilidades de formato y
 * banda de color.
 *
 * Es JS PURO: ni JSX ni React. `bandColor` recibe el tema por argumento.
 * Salió de `shared.jsx`, que mezclaba este modelo con las piezas de UI que
 * lo pintan; separarlos hace que la aritmética del turno sea ejecutable y
 * comprobable en node.
 *
 * Vive en `lib/` y no dentro de un feature —igual que `machines.js`— porque
 * lo consumen tanto `features/machines` (subvistas de factor) como
 * `features/dashboard` (tiempos muertos de planta). Meterlo en cualquiera
 * de los dos crearía una arista cruzada entre features.
 */
import { hasValue } from "./domain/index.js";
import { SIN_DATO, pctSeguro } from "./format.js";

/* ==================================================================
 * MODELO DE TIEMPO DEL TURNO
 * ==================================================================
 * La Disponibilidad es un cociente de TIEMPOS. Para representar el
 * desglose (potencia disponible → planificado → ejecución real) hacen
 * falta dos magnitudes que ICONICS SÍ entrega por máquina:
 *
 *   T_Disp_pot   → machine.tDispPot    tiempo disponible potencial
 *   T_Inac_plan  → machine.tInacPlan   inactividad planificada
 *
 * ⚠ OJO A LA DIFERENCIA DE VENTANA (Plan 1 §5.2)
 *
 * Estas constantes asumen un TURNO de 8 h. ICONICS calcula sobre
 * `T_Disp_pot = 86400`, es decir 24 h, restando un `T_Inac_plan` que
 * viene de una consulta SQL externa. Son dos definiciones distintas de
 * disponibilidad y dan números distintos.
 *
 * Por eso `tiemposTurno` PREFIERE siempre el dato del servidor y solo
 * cae a estas constantes cuando no hay lectura — que en la práctica es
 * el modo demo. Son la degradación, no la fuente.
 *
 * Siguen calibradas con el ejemplo de referencia (8 h de turno, 1 h de
 * paro previsto), que reproduce los 28 800 / 25 200 / 18 000 s del
 * mockup para una disponibilidad del 71.43 %.
 * ================================================================== */
export const TURNO_S = 8 * 3600;          // 28 800 s
export const PARO_PLANIFICADO_S = 3600;   // 3 600 s

/* ==================================================================
 * METAS POR FACTOR (%)
 * ==================================================================
 * Fuente única. Antes estaban duplicadas: `META_DISPONIBILIDAD` /
 * `META_CALIDAD` aquí y un `METAS` con otra forma en `compare.js`. Ahora
 * `compare.js` reexporta estas.
 *
 * Los cuatro valores son COHERENTES ENTRE SÍ: 90 × 95 × 99 / 10000 = 84,65,
 * que redondea al 85 % de OEE "clase mundial". Si cambias un factor, revisa
 * que el producto siga cuadrando con la meta de OEE.
 *
 * ⚠ Disponibilidad (90) y Calidad (99) venían del ejemplo de referencia.
 * Rendimiento (95) y OEE (85) son el estándar de la industria, no un dato
 * de Resonac — confirmar con planta.
 * ================================================================== */
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
 * medida. Devolver 0 sería peor: se sumaría a los totales de planta como
 * si la máquina hubiese estado parada todo el turno, cuando en realidad
 * no sabemos qué hizo.
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

/* ==================================================================
 * FORMATEO
 * ==================================================================
 * Los tres son TOLERANTES A HUECOS, y no por prudencia genérica: con
 * datos reales `tiemposTurno` devuelve `ejecucion` y `paroNoPlanificado`
 * en `null` cuando falta la disponibilidad.
 *
 * La versión anterior hacía `Math.round(null)`, que en JavaScript vale 0
 * —no NaN— así que la vista pintaba «0 s» con toda naturalidad. Un cero
 * plausible donde no hubo medición es el peor de los fallos: no rompe
 * nada, no avisa de nada, y se lee como una máquina parada.
 * ================================================================== */

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
 * Acota a 0–100 para GEOMETRÍA (anchos de barra, arcos, offsets).
 *
 * ⚠ Devuelve 0 ante un hueco, así que NUNCA debe usarse para producir
 * texto: para eso están `fmtNum`/`fmtPct` de lib/format.js, que
 * distinguen la ausencia de dato y escriben «—».
 */
export const clampPct = (v) => pctSeguro(v);

/**
 * Color por banda, con los mismos cortes que usa el resto de la app.
 * Sin medición devuelve el tono apagado: no se puede afirmar que un
 * factor sea malo (coral) cuando no se ha leído.
 */
export const bandColor = (t, v) =>
  !hasValue(v) ? t.textFaint : v < 50 ? t.viz.coral : v < 75 ? t.viz.ambar : t.viz.verde;
