/**
 * prototypes/dashboard-v2/model.js
 * ------------------------------------------------------------------
 * Derivaciones EXTRA que necesita la propuesta v2 del dashboard de planta.
 * Funciones puras, sin React y sin tema — mismo criterio que `plantModel.js`.
 *
 * ── UNA SOLA FUENTE DE VERDAD ──────────────────────────────────────
 *
 * Las máquinas LLEGAN POR PARÁMETRO desde `usePlantData()`, igual que en
 * el dashboard de producción. Este archivo no sabe si vienen de ICONICS,
 * del simulador o del modo demo — y esa ignorancia es el requisito: el
 * subtítulo de la vista promete «mismos datos», y durante un tiempo fue
 * mentira, porque la v2 quedó anclada al mock heredado y seguía enseñando
 * cifras con el servidor desconectado mientras producción mostraba huecos.
 *
 * ⚠ Deliberadamente NO reimplementa la agregación: importa
 * `buildPlantSummary`, `plantTrend` y `productionTrend` del modelo REAL.
 * Si las dos vistas se comparan, tienen que estar contando exactamente lo
 * mismo; la única diferencia entre ellas debe ser el diseño.
 *
 * Lo que se añade aquí son cuatro lecturas que la vista actual no ofrece:
 *   · `atencion`        — qué equipos piden acción ahora mismo
 *   · `porArea`         — el área CON sus máquinas dentro
 *   · `paretoRechazos`  — el scrap ordenado y acumulado
 *   · `scrapPorArea`    — el titular que el pastel esconde
 *
 * Todo sale de datos que la máquina ya entrega, ya en la forma `Machine`
 * del dominio: estados canónicos (`running`, `alarma`, …), áreas LIN/REC
 * y cualquier métrica posiblemente `null`. Ni una cifra inventada — y un
 * hueco jamás se cuenta como cero.
 */
import { calcOEE, hasValue } from "@/lib/domain/index.js";
import { AREAS, AREA_IDS } from "@shared/tagCatalog.js";
import {
  buildPlantSummary, plantTrend, productionTrend,
} from "@/features/dashboard/lib/plantModel.js";

/** Suma que ignora los huecos: `null` no es un cero. */
const suma = (xs) => xs.reduce((a, b) => a + (hasValue(b) ? b : 0), 0);

/**
 * Estados que piden acción AHORA, de peor a mejor, en el vocabulario del
 * dominio (ver lib/domain/estado.js).
 *
 * No es todo el catálogo: stand-by y set-up son situaciones esperables —
 * salen en la rejilla de máquinas, pero no en la franja de atención. Una
 * franja que se enciende siempre deja de leerse. `unknown` tampoco entra:
 * «sin dato» ya tiene su propio tratamiento en cada tile, y con el
 * servidor caído encendería la franja entera de forma permanente.
 */
const ESTADOS_ATENCION = ["alarma", "commfail"];

/** Severidad de cada estado accionable, para elegir el tono de la franja. */
export const SEVERIDAD = {
  alarma: "critico",
  commfail: "aviso",
};

/**
 * Equipos que piden acción, agrupados por estado y de peor a mejor.
 * Devuelve `[]` cuando no hay nada — la franja entonces NO se pinta.
 */
export function atencion(machines) {
  return ESTADOS_ATENCION
    .map((estado) => ({
      estado,
      severidad: SEVERIDAD[estado],
      maquinas: machines
        .filter((m) => m.estado === estado)
        .map((m) => ({ id: m.id, equipo: m.equipo, areaId: m.areaId })),
    }))
    .filter((a) => a.maquinas.length > 0);
}

/**
 * Resumen por área CON sus máquinas anidadas.
 *
 * `summaryByArea()` del modelo real devuelve solo los agregados, porque la
 * vista actual solo pinta el agregado. La v2 necesita bajar un nivel: la
 * rejilla de máquinas agrupada por área ES la tira de áreas y el mapa de
 * planta a la vez, así que se ahorra una banda entera.
 */
export function porArea(machines) {
  return AREA_IDS.map((areaId) => {
    const equipos = machines.filter((m) => m.areaId === areaId);
    const s = buildPlantSummary(equipos);
    return {
      areaId,
      label: AREAS[areaId].label,
      // Id de RUTA del monitor de área, para la cabecera clickeable.
      ruta: `area-${areaId}`,
      oee: s.oee,
      operando: s.operando,
      sinDato: s.sinDato,
      totalMaquinas: s.totalMaquinas,
      producidas: s.producidas,
      maquinas: equipos.map((m) => ({
        id: m.id,
        equipo: m.equipo,
        estado: m.estado,
        areaId,
        // Se prefiere el OEE del servidor; si falta, se compone de los
        // factores. `calcOEE` del dominio devuelve null ante huecos.
        oee: hasValue(m.oee) ? m.oee : calcOEE(m),
        rechazadas: m.rechazadas,
      })),
    };
  });
}

/**
 * Pareto de rechazos: las `top` máquinas que más scrap generan, de mayor a
 * menor, con su porcentaje y el ACUMULADO. La cola se pliega en una fila
 * "Otras (n)".
 *
 * Solo entran máquinas con rechazo MEDIDO y positivo: un `null` no es un
 * cero, es una máquina que no ha dicho cuánto tira.
 */
export function paretoRechazos(machines, top = 5) {
  const conRechazo = machines
    .filter((m) => hasValue(m.rechazadas) && m.rechazadas > 0)
    .map((m) => ({ id: m.id, nombre: m.equipo, areaId: m.areaId, valor: m.rechazadas }))
    .sort((a, b) => b.valor - a.valor);

  const total = suma(conRechazo.map((m) => m.valor));
  const cabeza = conRechazo.slice(0, top);
  const cola = conRechazo.slice(top);

  const filas = [...cabeza];
  if (cola.length) {
    filas.push({ id: "otras", nombre: `Otras (${cola.length})`, valor: suma(cola.map((m) => m.valor)), resto: true });
  }

  let acumulado = 0;
  return {
    total,
    max: filas.length ? filas[0].valor : 0,
    filas: filas.map((f) => {
      acumulado += f.valor;
      return {
        ...f,
        pct: total ? (f.valor / total) * 100 : 0,
        acum: total ? (acumulado / total) * 100 : 0,
      };
    }),
  };
}

/**
 * Reparto del scrap por área. Una sola frase de salida, y es el titular que
 * el pastel escondía.
 */
export function scrapPorArea(machines) {
  const total = suma(machines.map((m) => m.rechazadas));
  return AREA_IDS
    .map((areaId) => {
      const equipos = machines.filter((m) => m.areaId === areaId);
      const rechazadas = suma(equipos.map((m) => m.rechazadas));
      return {
        areaId,
        label: AREAS[areaId].label,
        rechazadas,
        equipos: equipos.length,
        pct: total ? (rechazadas / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.rechazadas - a.rechazadas);
}

/**
 * FTY por hora, derivado de la producción horaria.
 *
 * No es un dato nuevo: es el mismo cociente aceptadas ÷ producidas que ya
 * calcula el resumen, aplicado punto a punto. Alimenta el sparkline del KPI.
 */
export function ftyTrend(produccion) {
  return produccion.map((p) => (p.producidas ? (p.aceptadas / p.producidas) * 100 : 0));
}

/** Extrae una serie plana de un trend (para los sparklines). */
export const serieDe = (trend, key) => trend.map((p) => p[key]);

/** Variación entre el último punto y el anterior. `null` si no hay dos. */
export const delta = (serie) => (serie.length >= 2 ? serie.at(-1) - serie.at(-2) : null);

/**
 * Punto de entrada único: todo lo que la vista necesita, en una llamada
 * memoizable sobre las máquinas de la fuente activa.
 */
export function buildV2Model(machines) {
  const resumen = buildPlantSummary(machines);
  const tendencia = plantTrend(machines);
  const produccion = productionTrend(machines);

  return {
    resumen,
    tendencia,
    produccion,
    atencion: atencion(machines),
    areas: porArea(machines),
    pareto: paretoRechazos(machines),
    scrapArea: scrapPorArea(machines),
    series: {
      oee: serieDe(tendencia, "oee"),
      disponibilidad: serieDe(tendencia, "disponibilidad"),
      rendimiento: serieDe(tendencia, "rendimiento"),
      calidad: serieDe(tendencia, "calidad"),
      fty: ftyTrend(produccion),
      producidas: serieDe(produccion, "producidas"),
      rechazadas: serieDe(produccion, "rechazadas"),
    },
  };
}
