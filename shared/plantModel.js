/**
 * Rollup de máquina → planta. Funciones puras, sin React y sin tema.
 *
 * Aquí se decide cómo se agrega, que es la parte con criterio y la que hay que
 * poder revisar de un vistazo.
 *
 * ── POR QUÉ ESTÁ EN `shared/` DESDE EL PLAN 7 ──────────────────────
 *
 * Lo consultan dos programas: el tablero lo pinta y el asistente lo cuenta.
 * Recalcularlo en el backend daría **dos cifras de planta distintas**, y la
 * del chat contradiría la de la pantalla que el operador tiene delante. Eso no
 * es un bug menor: es lo que destruye la confianza en el asistente.
 *
 * `plantModel.golden.test.js` congela estos números contra una referencia.
 *
 * Cualquier factor puede llegar como `null` (mala calidad, tag ausente,
 * división por cero en el servidor). `media` y `suma` descartan esos huecos en
 * vez de tratarlos como ceros, que hundirían la media de toda la planta sin
 * que nadie lo notara.
 */
import { AREAS, AREA_IDS } from './tagCatalog.js'
import { ESTADOS_ORDEN, estadoInfo, estaOperando } from './domain/estado.js'
import { calcOEE, hasValue } from './domain/machine.js'
import { tiemposTurno } from './turno.js'

export { AREA_IDS, ESTADOS_ORDEN }

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

/** Resumen por área, para la tira de contexto bajo los KPIs. */
export function summaryByArea(machines = []) {
  return AREA_IDS.map((areaId) => ({
    areaId,
    label: AREA_LABELS[areaId],
    ...buildPlantSummary(machines.filter((m) => m.areaId === areaId)),
  }));
}
