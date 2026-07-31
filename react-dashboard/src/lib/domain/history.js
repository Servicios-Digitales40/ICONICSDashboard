/**
 * lib/domain/history.js
 * ------------------------------------------------------------------
 * Cómo se lee un DÍA de historia. Reduce una serie del historiador a la
 * misma forma que ya tiene una máquina en vivo, para que el comparativo
 * no tenga que hablar dos vocabularios distintos.
 *
 * ── POR QUÉ NO BASTA CON PROMEDIARLO TODO ──────────────────────────
 *
 * Los tags de este servidor son de dos naturalezas y agregarlos igual
 * produce números sin sentido:
 *
 *   · FACTORES (`OEE`, `OEE_Disp`, `OEE_Rend`, `OEE_Cal`) son porcentajes
 *     instantáneos. El resumen del día es su MEDIA.
 *   · CONTADORES (`Pz_OK`, `Pz_NOK`, `T_Muerto_Ico`) se acumulan y se
 *     reinician con el día. El resumen del día es su ÚLTIMO valor, no la
 *     media: promediar un contador da "la mitad de lo producido".
 *
 * Las dos salen de la MISMA lectura del historiador —24 puntos por tag—;
 * lo que cambia es cómo se reducen, y por eso el `cierre` llega ya
 * resuelto por el transporte.
 *
 * ── HUECOS ─────────────────────────────────────────────────────────
 *
 * Una hora sin muestra NO cuenta como cero: se ignora en la media y se
 * refleja en `muestras`. Con cero muestras el resumen entero es `null`,
 * porque un día sin historizar y un día con OEE 0 son noticias opuestas
 * y la vista debe poder distinguirlas.
 */
import { calcOEE, hasValue, toNumber } from "./machine.js";

/** Media de los valores utilizables de un campo, o `null` si no hay ninguno. */
function media(filas, campo) {
  const nums = filas.map((f) => toNumber(f?.[campo])).filter(hasValue);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Redondeo a un decimal conservando el `null`. */
const red1 = (v) => (hasValue(v) ? +v.toFixed(1) : null);

/**
 * Resumen de un día a partir de lo leído del historiador.
 *
 * @param {object[]} serie  filas horarias { t, disponibilidad, rendimiento, calidad, oee }
 * @param {object} cierre   valores de cierre del día { aprobadas, rechazadas, tMuerto }
 * @returns {object|null}   misma forma que una `Machine` en vivo, o `null` sin datos
 */
export function daySummary(serie = [], cierre = {}) {
  const filas = Array.isArray(serie) ? serie : [];

  const disponibilidad = media(filas, "disponibilidad");
  const rendimiento = media(filas, "rendimiento");
  const calidad = media(filas, "calidad");

  // El OEE del día se toma del propio tag `OEE` cuando el historiador lo
  // tiene: es el que calcula el servidor y el que ve el operador en la
  // pantalla de ICONICS. Solo si falta se deriva de los tres factores,
  // para no inventar una cifra que discrepe de la del servidor.
  const oeeLeido = media(filas, "oee");
  const oee = hasValue(oeeLeido) ? oeeLeido : calcOEE({ disponibilidad, rendimiento, calidad });

  const aprobadas = toNumber(cierre?.aprobadas);
  const rechazadas = toNumber(cierre?.rechazadas);
  const tMuerto = toNumber(cierre?.tMuerto);

  const muestras = filas.filter((f) => hasValue(toNumber(f?.oee)) || hasValue(toNumber(f?.disponibilidad))).length;

  // Sin una sola muestra ni un solo contador no hay día que resumir.
  if (!muestras && !hasValue(aprobadas) && !hasValue(rechazadas) && !hasValue(tMuerto)) {
    return null;
  }

  return {
    disponibilidad: red1(disponibilidad),
    rendimiento: red1(rendimiento),
    calidad: red1(calidad),
    oee: red1(oee),

    aprobadas,
    rechazadas,
    producidas: hasValue(aprobadas) && hasValue(rechazadas) ? aprobadas + rechazadas : null,

    // Segundos, como los entrega ICONICS. La UI del comparativo trabaja
    // en minutos, y la conversión la hace quien pinta.
    tMuerto,

    muestras,
  };
}
