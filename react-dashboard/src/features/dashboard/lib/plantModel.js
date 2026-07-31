/**
 * features/dashboard/lib/plantModel.js
 * ------------------------------------------------------------------
 * Rollup de máquina → planta. Funciones PURAS, sin React y sin tema.
 *
 * Aquí se decide CÓMO se agrega, que es la parte con criterio y la que
 * hay que poder revisar de un vistazo.
 *
 * ── NO CONOCE EL ORIGEN DE LOS DATOS ───────────────────────────────
 *
 * Antes importaba `MACHINES` directamente. Ahora recibe las máquinas por
 * parámetro y no sabe si vienen de ICONICS o del modo demo. Eso también
 * es lo que protege la aritmética durante la migración (riesgo R-02):
 * cambió QUIÉN llama, no QUÉ se calcula, así que los números no pueden
 * moverse. La prueba `plantModel.golden.test.js` lo verifica.
 *
 * ── TOLERANCIA A HUECOS ────────────────────────────────────────────
 *
 * Con datos reales, cualquier factor puede llegar como `null` (mala
 * calidad, tag ausente, división por cero en el servidor). `media` y
 * `suma` DESCARTAN esos huecos en vez de tratarlos como ceros: un cero
 * falso hundiría la media de toda la planta sin que nadie lo notara.
 */
import { AREAS, AREA_IDS } from "@/lib/iconics/tagCatalog.js";
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
 * Media y suma que ignoran los huecos… y que devuelven NULL —no 0— si no
 * queda ninguna medición.
 *
 * La versión anterior devolvía 0, y ese 0 subía intacto hasta la banda de
 * KPIs: con el servidor caído el dashboard mostraba «OEE 0.00 %» y
 * «0 piezas producidas», que no se lee como "sin datos" sino como una
 * planta parada que no produjo nada en el turno. Es el mismo fallo del
 * cero inventado que ya se corrigió en las tarjetas y el detalle, una
 * capa más arriba — la más visible de todas.
 *
 * `null` aquí significa lo mismo que en el dominio: «no hay medición».
 * Los tiles ya saben pintarlo como hueco vía lib/format.
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
 * Agrega la planta entera.
 *
 * Criterio de agregación (importa, y es revisable):
 *
 *  · Disponibilidad, Rendimiento y Calidad → MEDIA SIMPLE entre máquinas.
 *    No se ponderan por producción porque no todas las máquinas hacen la
 *    misma pieza: ponderar mezclaría magnitudes distintas. Si algún día
 *    hay tiempos reales por máquina, lo correcto sería ponderar por tiempo
 *    planificado.
 *
 *  · OEE de planta → NO es la media de los OEE, sino D × R × C de los
 *    agregados. Así el número grande y los tres gauges que lo acompañan
 *    cuentan exactamente la misma historia; si se promediaran los OEE,
 *    el titular no cuadraría con sus propios factores.
 *
 *  · FTY (First Time Yield) → sí es un cociente de PIEZAS reales
 *    (aceptadas ÷ producidas), ponderado por naturaleza. Por eso difiere
 *    ligeramente de la Calidad media: son dos lecturas distintas y ambas
 *    son correctas. La Calidad dice "cómo va cada máquina en promedio";
 *    el FTY dice "de todo lo que salió hoy, cuánto sirve".
 */
export function buildPlantSummary(machines = []) {
  const disponibilidad = media(machines.map((m) => m.disponibilidad));
  const rendimiento = media(machines.map((m) => m.rendimiento));
  const calidad = media(machines.map((m) => m.calidad));

  const aceptadas = suma(machines.map((m) => m.aprobadas));
  const rechazadas = suma(machines.map((m) => m.rechazadas));
  // Con un solo conteo presente la suma es parcial pero honesta; con los
  // dos ausentes no hay producción que afirmar.
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
    // afirmar «10 detenidas» cuando lo cierto es «10 sin leer».
    sinDato: machines.filter((m) => m.estado === "unknown").length,

    disponibilidad,
    rendimiento,
    calidad,
    // Sin `?? 0`: calcOEE ya devuelve null cuando falta un factor, y ese
    // null debe llegar hasta el gauge, no disfrazarse de planta parada.
    oee: calcOEE({ disponibilidad, rendimiento, calidad }),

    producidas,
    aceptadas,
    rechazadas,
    // `producidas` en 0 real (turno recién empezado) tampoco da un yield:
    // 0/0 no es una medición, es la ausencia de piezas que medir.
    fty: producidas ? ((aceptadas ?? 0) / producidas) * 100 : null,

    paroPlanificado,
    paroNoPlanificado,
    porEstado,
  };
}

/**
 * Producción por máquina, de mayor a menor. Alimenta el pastel de reparto.
 *
 * La referencia lo parte "por producto"; nosotros no tenemos catálogo de
 * producto —`Modelo` es la receta del PLC, no un SKU— así que se reparte
 * por equipo. Es la misma pregunta —¿de dónde sale el volumen?— con el
 * eje que sí existe.
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
 * `getMachineHistory` construye la serie a partir de ellos y no tolera
 * huecos: con un `null` reventaría al formatear. Filtrar aquí es además
 * lo correcto conceptualmente — una máquina sin medición no puede
 * aportar a una tendencia, y meterla como ceros la falsearía.
 */
const conFactores = (m) =>
  hasValue(m.disponibilidad) && hasValue(m.rendimiento) && hasValue(m.calidad);

/**
 * Tendencia horaria de los cuatro factores, promediada sobre la planta.
 *
 * ⚠ La serie sigue siendo SIMULADA: `getMachineHistory` genera una rejilla
 * determinista de 12 horas anclada al valor actual. La historia real vive
 * en los puntos `hda:` de ICONICS y se conectará en la Fase 7 del Plan 1,
 * cuando `apiClient` exponga la ruta `/api/iconics/history` que el backend
 * ya tiene. Hasta entonces esto es una ilustración, no una medición.
 *
 * Solo entran las máquinas con los tres factores. Si ninguna los tiene
 * —servidor caído, arranque en frío— se devuelve una serie vacía y las
 * gráficas se pintan sin datos, que es lo honesto.
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
 * Producción y rechazo por hora, repartiendo el total del turno según el
 * peso de cada hora en la calidad de esa hora.
 *
 * ⚠ Es una DERIVACIÓN, no una medición: la máquina entrega el acumulado del
 * turno, no piezas por hora. Se reparte el total uniformemente entre las
 * horas y se aplica la calidad horaria real para separar buenas de malas,
 * de modo que la suma de las barras cuadra con el total del turno. Cuando
 * el PLC entregue conteo por hora, se sustituye esta función y la vista no
 * se entera.
 */
export function productionTrend(machines = [], points = 12) {
  const trend = plantTrend(machines, points);
  if (!trend.length) return [];

  const { producidas } = buildPlantSummary(machines);
  // Puede haber tendencia sin conteo: máquinas con factores medidos pero
  // con `Pz_OK` en mala calidad. Sin piezas no hay barras que repartir —
  // repartir un null daría doce barras de cero, que es una afirmación.
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
