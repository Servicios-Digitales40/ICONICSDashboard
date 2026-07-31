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
 * originales. La prueba hermana, `datasource/demoSource.test.js`,
 * comprueba que la arquitectura nueva sigue produciendo lo mismo.
 *
 * Qué se congela y qué no: ver `../../fixtures/numericSnapshot.js`.
 * Cómo regenerar la referencia: ver `../../fixtures/golden.js`.
 */
import { describe, expect, it } from "vitest";

import { MACHINES, AREA_LABELS } from "@/lib/machines.js";
import { debeActualizar, escribirGolden, leerGolden } from "../../fixtures/golden.js";
import { numericSnapshot } from "../../fixtures/numericSnapshot.js";

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
