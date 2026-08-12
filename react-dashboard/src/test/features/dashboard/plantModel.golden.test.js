/**
 * plantModel.golden.test.js
 * ------------------------------------------------------------------
 * RED DE SEGURIDAD del Plan 1 (riesgo R-01: regresión numérica silenciosa).
 *
 * El respaldo del proyecto se hace por copia manual de la carpeta. Eso
 * permite volver atrás, pero NO detecta el fallo más caro de esta
 * migración: que el código nuevo compile, arranque, se vea bien y
 * calcule distinto. Un panel de planta con números equivocados es peor
 * que un panel caído, porque nadie se entera.
 *
 * Esta prueba congela el esqueleto numérico partiendo de los datos mock
 * originales. Su prueba hermana, `datasource/demoSource.test.js`, comprobaba
 * que la arquitectura nueva no movía ningún número; se borró con el modo demo
 * en el Plan 5, y sus invariantes de series viven ahora al final de este
 * archivo.
 *
 * Qué se congela y qué no: ver `../../fixtures/numericSnapshot.js`.
 * Cómo regenerar la referencia: ver `../../fixtures/golden.js`.
 */
import { describe, expect, it } from "vitest";

import { MACHINES, AREA_LABELS } from "@/lib/machines.js";
import { debeActualizar, escribirGolden, leerGolden } from "../../fixtures/golden.js";
import { numericSnapshot, trendInvariants } from "../../fixtures/numericSnapshot.js";

/**
 * Las máquinas de referencia, tomadas de AREA_LABELS y no de
 * Object.keys(MACHINES) por el mismo motivo que `plantModel.allMachines`:
 * la clave "sandbox" no es un área y duplicaría una máquina.
 */
function machinesMock() {
  return Object.keys(AREA_LABELS).flatMap((areaId) =>
    (MACHINES[areaId] ?? []).map((m) => ({ ...m, areaId }))
  );
}

describe("plantModel · referencia numérica congelada", () => {
  it("produce exactamente los mismos números que antes de la migración", () => {
    const actual = numericSnapshot(machinesMock());

    if (debeActualizar()) {
      escribirGolden(actual);
      return;
    }

    expect(actual).toEqual(leerGolden());
  });
});

/*
 * Estas invariantes vivían en `demoSource.test.js`, que se borró en el Plan 5
 * junto con el modo demo. No son sobre la fuente sino sobre `plantModel`, así
 * que su sitio natural era éste desde el principio: son las dos promesas que
 * el propio módulo hace en sus comentarios, y que ninguna otra prueba fijaba.
 */
describe("plantModel · invariantes de las series", () => {
  it("la gráfica y los gauges cuentan lo mismo", () => {
    const inv = trendInvariants(machinesMock());

    expect(inv.puntos).toBe(12);
    // El extremo derecho de la tendencia ancla a los agregados actuales. Sin
    // esto, la curva y el número grande de la misma pantalla pueden discrepar
    // sin que nada falle.
    expect(inv.ultimoCoincide).toBe(true);
  });

  it("las barras reparten el turno sin perder ni inventar piezas", () => {
    const inv = trendInvariants(machinesMock());

    expect(inv.sumaProduccion).toBe(inv.totalEsperado);
    expect(inv.barrasCuadran).toBe(true);
  });
});
