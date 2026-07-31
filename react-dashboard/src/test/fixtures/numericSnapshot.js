/**
 * fixtures/numericSnapshot.js
 * ------------------------------------------------------------------
 * Ayudante de pruebas (no se empaqueta: solo lo importan los `*.test.js`).
 *
 * Reduce un conjunto de máquinas a su ESQUELETO NUMÉRICO, que es lo que
 * debe permanecer invariante a lo largo de toda la migración del Plan 1.
 *
 * ── QUÉ SE CONGELA ─────────────────────────────────────────────────
 *
 * Los agregados de planta, las tuplas por máquina y el reparto de
 * producción. Todo ello se calcula solo a partir de los números, así que
 * el renombrado de máquinas y áreas no puede moverlo.
 *
 * ── QUÉ NO, Y POR QUÉ ──────────────────────────────────────────────
 *
 * · Ids, nombres y estados: cambian a propósito en la Fase 4
 *   (area1 → LIN, "Rectif 1" → "Multi 10", estados en español →
 *   vocabulario de ICONICS).
 *
 * · Las SERIES de tendencia. `getMachineHistory` genera un historial
 *   pseudoaleatorio pero determinista SEMBRADO CON `machine.id`. Al
 *   pasar de "a1-1" a "LIN/1" la semilla cambia y con ella toda la
 *   serie. No es una regresión: es la consecuencia buscada del cambio
 *   de identificadores, y solo afecta al modo demo — la historia real
 *   vendrá de ICONICS.
 *
 *   Congelar esa serie ataría el proyecto a unos ids heredados para
 *   siempre. En su lugar se comprueba la INVARIANTE que el propio
 *   `plantModel` documenta y que sí debe cumplirse pase lo que pase:
 *   el último punto de la tendencia coincide con los agregados
 *   actuales, de modo que la gráfica y los gauges cuentan lo mismo.
 *
 * Las máquinas se comparan como TUPLAS ORDENADAS para que el renombrado
 * no las mueva pero cualquier deriva aritmética sí.
 */
import {
  buildPlantSummary,
  productionByMachine,
  plantTrend,
  productionTrend,
} from "@/features/dashboard/lib/plantModel.js";

/** Redondeo estable: el ruido del último bit no debe hacer fallar la comparación. */
const r = (n) => (typeof n === "number" && Number.isFinite(n) ? +n.toFixed(6) : n);

const porTupla = (a, b) => a.join().localeCompare(b.join());

export function numericSnapshot(machines) {
  const resumen = buildPlantSummary(machines);

  return {
    resumen: {
      totalMaquinas: resumen.totalMaquinas,
      disponibilidad: r(resumen.disponibilidad),
      rendimiento: r(resumen.rendimiento),
      calidad: r(resumen.calidad),
      oee: r(resumen.oee),
      producidas: resumen.producidas,
      aceptadas: resumen.aceptadas,
      rechazadas: resumen.rechazadas,
      fty: r(resumen.fty),
      paroPlanificado: resumen.paroPlanificado,
      paroNoPlanificado: resumen.paroNoPlanificado,
    },

    maquinas: machines
      .map((m) => [r(m.disponibilidad), r(m.rendimiento), r(m.calidad), m.aprobadas, m.rechazadas])
      .sort(porTupla),

    reparto: productionByMachine(machines)
      .map((p) => [p.valor, p.rechazadas])
      .sort(porTupla),
  };
}

/**
 * Invariantes de las series temporales, independientes de la semilla.
 *
 * Son las dos promesas que `plantModel` hace en sus comentarios:
 *   · el extremo derecho de la tendencia coincide con los gauges;
 *   · las barras de producción suman el total del turno.
 */
export function trendInvariants(machines) {
  const resumen = buildPlantSummary(machines);
  const tendencia = plantTrend(machines);
  const produccion = productionTrend(machines);
  const ultimo = tendencia.at(-1);

  return {
    puntos: tendencia.length,
    // El último punto ancla a los agregados actuales (tolerancia: 1 decimal).
    ultimoCoincide:
      Math.abs(ultimo.disponibilidad - resumen.disponibilidad) < 0.05 &&
      Math.abs(ultimo.rendimiento - resumen.rendimiento) < 0.05 &&
      Math.abs(ultimo.calidad - resumen.calidad) < 0.05,
    // Las barras reparten el total del turno sin perder ni inventar piezas.
    sumaProduccion: produccion.reduce((a, p) => a + p.producidas, 0),
    totalEsperado: Math.round(resumen.producidas / tendencia.length) * tendencia.length,
    // Aceptadas + rechazadas cuadra en cada barra.
    barrasCuadran: produccion.every((p) => p.aceptadas + p.rechazadas === p.producidas),
  };
}
