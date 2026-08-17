/**
 * tagCatalog.test.js
 * ------------------------------------------------------------------
 * El contrato con ICONICS: qué máquinas existen y cómo se llaman.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * `tagCatalog.js` es la fuente de verdad de la planta entera: de él salen las
 * vistas de área, el rollup del dashboard, la maqueta 3D y los nombres de
 * punto que se piden al servidor. Un error aquí no se manifiesta como un
 * fallo, sino como una máquina que **falta** en todas las pantallas a la vez,
 * o como una máquina fantasma que infla los agregados de planta.
 *
 * Estas aserciones vivían en `demoSource.test.js`, que se borró con el modo
 * demo en el Plan 5. No eran sobre la fuente de datos —comprobaban el
 * catálogo a través de ella—, así que aquí es donde debían estar.
 *
 * Los dos hechos que fijan son los que la cabecera de `tagCatalog.js`
 * documenta como trampas reales:
 *
 *  - `RESONAC_` (con guión bajo) es un árbol paralelo de navegación que
 *    duplica los nombres con nodos vacíos; recorrer el árbol en vez de usar
 *    esta lista produce máquinas fantasma.
 *  - La numeración de rectificadoras tiene HUECOS reales: son la 10, la 11 y
 *    la 13. Un bucle de 10 a 13 inventaría una máquina 12.
 */
import { describe, expect, it } from "vitest";

import { AREAS, listMachines, machineKey, pointName, historyPointName } from "@shared/tagCatalog.js";

describe("las 10 máquinas reales", () => {
  it("son exactamente éstas, en este orden", () => {
    expect(listMachines().map((m) => m.id)).toEqual([
      "LIN/1", "LIN/2", "LIN/3", "LIN/4", "LIN/5", "LIN/6", "LIN/7",
      "REC/10", "REC/11", "REC/13",
    ]);
  });

  it("la numeración de rectificadoras salta la 12, que no existe", () => {
    expect(AREAS.REC.machineIds).toEqual(["10", "11", "13"]);
    expect(listMachines().map((m) => m.id)).not.toContain("REC/12");
  });

  it("cada una lleva la etiqueta con la que se conoce en planta", () => {
    const porId = Object.fromEntries(listMachines().map((m) => [m.id, m.equipo]));

    expect(porId["LIN/1"]).toBe("Lineal 1");
    expect(porId["LIN/7"]).toBe("Lineal 7");
    expect(porId["REC/10"]).toBe("Multi 10");
    expect(porId["REC/13"]).toBe("Multi 13");
  });

  it("no hay ids repetidos ni máquinas sin área", () => {
    const maquinas = listMachines();

    expect(new Set(maquinas.map((m) => m.id)).size).toBe(maquinas.length);
    for (const m of maquinas) {
      expect(AREAS[m.areaId], `${m.id} apunta a un área inexistente`).toBeDefined();
      expect(m.id).toBe(machineKey(m.areaId, m.machineId));
    }
  });
});

describe("nombres de punto", () => {
  it("el de tiempo real usa el espacio de nombres de AssetWorX", () => {
    expect(pointName("LIN", "1", "oee")).toBe("ac:RESONAC/LIN/1/OEE");
  });

  it("el histórico NO se deriva del de tiempo real", () => {
    // Otro prefijo y otra sintaxis —contrabarras y dos puntos—, así que un
    // reemplazo sobre el nombre de tiempo real daría un punto inválido.
    expect(historyPointName("REC", "13", "oee")).toBe("hda:\\Configuration\\RESONAC\\REC\\13:OEE");
  });
});
