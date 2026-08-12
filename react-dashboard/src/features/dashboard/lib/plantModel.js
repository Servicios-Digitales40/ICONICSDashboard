/**
 * Rollup de máquina → planta. Funciones puras, sin React y sin tema.
 *
 * Aquí se decide cómo se agrega, que es la parte con criterio y la que hay que
 * poder revisar de un vistazo.
 *
 * Recibe las máquinas por parámetro y no sabe si vienen de ICONICS o del modo
 * demo. La prueba `plantModel.golden.test.js` fija los números contra una
 * referencia congelada.
 *
 * Cualquier factor puede llegar como `null` (mala calidad, tag ausente,
 * división por cero en el servidor). `media` y `suma` descartan esos huecos en
 * vez de tratarlos como ceros, que hundirían la media de toda la planta sin
 * que nadie lo notara.
 */
import { AREAS, AREA_IDS } from "@shared/tagCatalog.js";
import { ESTADOS_ORDEN, calcOEE, estaOperando, estadoInfo, hasValue } from "@/lib/domain/index.js";
import { getMachineHistory } from "@/lib/machines.js";
import { tiemposTurno } from "@/lib/shiftModel.js";

export { AREA_IDS };

/** Etiqueta legible de cada área, tomada del catálogo de ICONICS. */
export const AREA_LABELS = Object.fromEntries(
  AREA_IDS.map((id) => [id, AREAS[id].label])
);

const finitos = (xs) => xs.filter((x) => hasValue(x) && Number.isFinite(x));

/**
 * Media y suma que ignoran los huecos y devuelven `null`, no 0, cuando no
 * queda ninguna medición.
 *
 * Un 0 subiría intacto hasta la banda de KPIs, y con el servidor caído el
 * dashboard mostraría «OEE 0.00 %» y «0 piezas producidas», que no se lee como
 * ausencia de datos sino como una planta parada. `null` significa lo mismo que
 * en el dominio y los tiles ya lo pintan como hueco vía lib/format.
 */
const media = (xs) => {
  const v = finitos(xs);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

const suma = (xs) => {
  const v = finitos(xs);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

export { ESTADOS_ORDEN };

/**
 * Agrega la planta entera. El criterio de agregación no es trivial:
 *
 *  - Disponibilidad, Rendimiento y Calidad se promedian sin ponderar. No todas
 *    las máquinas hacen la misma pieza, así que ponderar por producción
 *    mezclaría magnitudes distintas; con tiempos reales por máquina lo
 *    correcto sería ponderar por tiempo planificado.
 *
 *  - El OEE de planta no es la media de los OEE, sino D × R × C de los
 *    agregados, para que el número grande y los tres gauges que lo acompañan
 *    cuenten la misma historia.
 *
 *  - El FTY sí es un cociente de piezas reales (aceptadas ÷ producidas), y por
 *    eso difiere ligeramente de la Calidad media: esta dice cómo va cada
 *    máquina en promedio, el FTY dice cuánto sirve de todo lo que salió.
 */
export function buildPlantSummary(machines = []) {
  const disponibilidad = media(machines.map((m) => m.disponibilidad));
  const rendimiento = media(machines.map((m) => m.rendimiento));
  const calidad = media(machines.map((m) => m.calidad));

  const aceptadas = suma(machines.map((m) => m.aprobadas));
  const rechazadas = suma(machines.map((m) => m.rechazadas));
  // Con un solo conteo presente la suma es parcial pero válida; con los dos
  // ausentes no hay producción que afirmar.
  const producidas =
    hasValue(aceptadas) || hasValue(rechazadas) ? (aceptadas ?? 0) + (rechazadas ?? 0) : null;

  // Tiempos muertos del turno, sumados sobre todas las máquinas.
  const tiempos = machines.map(tiemposTurno);
  const paroPlanificado = suma(tiempos.map((T) => T.paroPlanificado));
  const paroNoPlanificado = suma(tiempos.map((T) => T.paroNoPlanificado));

  // Conteo por estado, respetando ESTADOS_ORDEN y omitiendo los vacíos.
  const porEstado = ESTADOS_ORDEN.map((estado) => ({
    estado,
    label: estadoInfo(estado).label,
    valor: machines.filter((m) => m.estado === estado).length,
  })).filter((e) => e.valor > 0);

  return {
    totalMaquinas: machines.length,
    operando: machines.filter((m) => estaOperando(m.estado)).length,
    // Cuántas máquinas no han dicho nada. La banda de KPIs lo usa para no
    // afirmar «10 detenidas» cuando en realidad son «10 sin leer».
    sinDato: machines.filter((m) => m.estado === "unknown").length,

    disponibilidad,
    rendimiento,
    calidad,
    // Sin `?? 0`: calcOEE ya devuelve null cuando falta un factor, y ese null
    // tiene que llegar hasta el gauge en vez de disfrazarse de planta parada.
    oee: calcOEE({ disponibilidad, rendimiento, calidad }),

    producidas,
    aceptadas,
    rechazadas,
    // `producidas` en 0 real (turno recién empezado) tampoco da un yield: 0/0
    // no es una medición, es la ausencia de piezas que medir.
    fty: producidas ? ((aceptadas ?? 0) / producidas) * 100 : null,

    paroPlanificado,
    paroNoPlanificado,
    porEstado,
  };
}

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

/** Resumen por área, para la tira de contexto bajo los KPIs. */
export function summaryByArea(machines = []) {
  return AREA_IDS.map((areaId) => ({
    areaId,
    label: AREA_LABELS[areaId],
    ...buildPlantSummary(machines.filter((m) => m.areaId === areaId)),
  }));
}
