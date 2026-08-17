/**
 * Derivaciones del dashboard que **no** son el rollup de planta.
 *
 * Desde el Plan 7 el rollup —`buildPlantSummary` y `summaryByArea`— vive en
 * [`shared/plantModel.js`](../../../../../shared/plantModel.js), porque lo
 * consultan dos programas: el tablero lo pinta y el asistente lo cuenta.
 * Tener dos implementaciones daría dos cifras de planta distintas, y la del
 * chat contradiría la de la pantalla que el operador tiene delante.
 *
 * Aquí se queda lo que es solo del tablero: el reparto de producción y las dos
 * tendencias, que son **series simuladas** y no tienen nada que hacer en una
 * respuesta del asistente.
 */
import { calcOEE, hasValue } from "@/lib/domain/index.js";
import { getMachineHistory } from "@/lib/machines.js";
import {
  AREA_IDS,
  AREA_LABELS,
  ESTADOS_ORDEN,
  buildPlantSummary,
  summaryByArea,
} from "@shared/plantModel.js";

/* El rollup se reexporta para que las vistas sigan importando de un solo sitio. */
export { AREA_IDS, AREA_LABELS, ESTADOS_ORDEN, buildPlantSummary, summaryByArea };

/** Media que ignora los huecos. La usan las tendencias de abajo. */
const media = (xs) => {
  const v = xs.filter((x) => hasValue(x) && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/**
 * Producción por máquina, de mayor a menor. Alimenta el pastel de reparto.
 *
 * Se reparte por equipo y no por producto porque no hay catálogo de producto:
 * `Modelo` es la receta del PLC, no un SKU. Responde la misma pregunta —de
 * dónde sale el volumen— con el eje que sí existe.
 */
export function productionByMachine(machines = []) {
  return machines
    .map((m) => ({
      id: m.id,
      nombre: m.equipo,
      areaId: m.areaId,
      valor: (m.aprobadas ?? 0) + (m.rechazadas ?? 0),
      rechazadas: m.rechazadas ?? 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

/**
 * ¿Tiene la máquina los tres factores medidos?
 *
 * `getMachineHistory` construye la serie a partir de ellos y no tolera huecos:
 * un `null` reventaría al formatear. Además, una máquina sin medición no puede
 * aportar a una tendencia, y meterla como ceros la falsearía.
 */
const conFactores = (m) =>
  hasValue(m.disponibilidad) && hasValue(m.rendimiento) && hasValue(m.calidad);

/**
 * Tendencia horaria de los cuatro factores, promediada sobre la planta.
 *
 * La serie es simulada: `getMachineHistory` genera una rejilla determinista
 * anclada al valor actual, así que es una ilustración y no una medición. La
 * historia real vive en los puntos `hda:` de ICONICS.
 *
 * Solo entran las máquinas con los tres factores. Si ninguna los tiene
 * (servidor caído, arranque en frío) se devuelve una serie vacía y las
 * gráficas se pintan sin datos.
 */
export function plantTrend(machines = [], points = 12) {
  const medidas = machines.filter(conFactores);
  if (!medidas.length) return [];
  const series = medidas.map((m) => getMachineHistory(m, points));

  return series[0].map((_, i) => {
    const disponibilidad = media(series.map((s) => s[i].disponibilidad));
    const rendimiento = media(series.map((s) => s[i].rendimiento));
    const calidad = media(series.map((s) => s[i].calidad));
    return {
      t: series[0][i].t,
      disponibilidad: +disponibilidad.toFixed(1),
      rendimiento: +rendimiento.toFixed(1),
      calidad: +calidad.toFixed(1),
      // Mismo criterio que en el resumen: el OEE se compone, no se promedia.
      oee: +(calcOEE({ disponibilidad, rendimiento, calidad }) ?? 0).toFixed(1),
    };
  });
}

/**
 * Producción y rechazo por hora.
 *
 * Es una derivación y no una medición: la máquina entrega el acumulado del
 * turno, no piezas por hora. Se reparte el total uniformemente entre las horas
 * y se aplica la calidad horaria para separar buenas de malas, de modo que la
 * suma de las barras cuadre con el total del turno. Con conteo por hora del
 * PLC se sustituye esta función y la vista no se entera.
 */
export function productionTrend(machines = [], points = 12) {
  const trend = plantTrend(machines, points);
  if (!trend.length) return [];

  const { producidas } = buildPlantSummary(machines);
  // Puede haber tendencia sin conteo: máquinas con factores medidos pero con
  // `Pz_OK` en mala calidad. Repartir un null daría doce barras de cero, que
  // es una afirmación.
  if (!hasValue(producidas)) return [];

  const porHora = producidas / trend.length;

  return trend.map((p) => {
    const aceptadas = Math.round((porHora * p.calidad) / 100);
    return {
      t: p.t,
      producidas: Math.round(porHora),
      aceptadas,
      rechazadas: Math.round(porHora) - aceptadas,
    };
  });
}
