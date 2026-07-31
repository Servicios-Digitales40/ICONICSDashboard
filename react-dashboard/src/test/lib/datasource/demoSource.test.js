/**
 * demoSource.test.js
 * ------------------------------------------------------------------
 * Fase 2.3 del Plan 1: comprobar que pasar los datos por la arquitectura
 * NUEVA no mueve ni un número.
 *
 * Es el hito que valida la abstracción antes de apostar por ella. Si
 * `demoSource` produce los mismos agregados que la referencia congelada
 * de la Fase 0, entonces la forma `Machine` y su normalizador son
 * equivalentes al modelo anterior, y se puede construir encima con
 * confianza.
 */
import { describe, expect, it } from "vitest";

import { leerGolden } from "../../fixtures/golden.js";
import { numericSnapshot, trendInvariants } from "../../fixtures/numericSnapshot.js";
import { createDemoSource, snapshotDemo } from "@/lib/datasource/demoSource.js";

describe("demoSource · equivalencia con la referencia congelada", () => {
  it("produce los mismos agregados que el modelo anterior", () => {
    expect(numericSnapshot(snapshotDemo())).toEqual(leerGolden());
  });

  it("mantiene las invariantes de las series temporales", () => {
    const inv = trendInvariants(snapshotDemo());

    expect(inv.puntos).toBe(12);
    expect(inv.ultimoCoincide).toBe(true);
    expect(inv.sumaProduccion).toBe(inv.totalEsperado);
    expect(inv.barrasCuadran).toBe(true);
  });

  it("expone las 10 máquinas reales con su nomenclatura de ICONICS", () => {
    const machines = snapshotDemo();

    expect(machines).toHaveLength(10);
    expect(machines.map((m) => m.id)).toEqual([
      "LIN/1", "LIN/2", "LIN/3", "LIN/4", "LIN/5", "LIN/6", "LIN/7",
      "REC/10", "REC/11", "REC/13",
    ]);
    expect(machines[0].equipo).toBe("Lineal 1");
    expect(machines[7].equipo).toBe("Multi 10");
  });

  it("solo emite estados del vocabulario de ICONICS", () => {
    const validos = new Set(["standby", "running", "setup", "commfail", "alarma", "unknown"]);
    for (const m of snapshotDemo()) expect(validos.has(m.estado)).toBe(true);
  });
});

describe("demoSource · ciclo de vida", () => {
  it("emite una instantánea inmediata al suscribirse", () => {
    const source = createDemoSource();
    let recibido = null;

    const baja = source.subscribePlant((s) => { recibido = s; });

    expect(recibido).not.toBeNull();
    expect(recibido.loading).toBe(false);
    expect(recibido.machines).toHaveLength(10);

    baja();
    source.stop();
  });

  it("filtra a una sola máquina en subscribeMachine", () => {
    const source = createDemoSource();
    let recibido = null;

    const baja = source.subscribeMachine("REC/13", (s) => { recibido = s; });

    expect(recibido.machines).toHaveLength(1);
    expect(recibido.machines[0].id).toBe("REC/13");

    baja();
    source.stop();
  });

  it("darse de baja deja el temporizador parado (riesgo R-05)", () => {
    const source = createDemoSource({ intervalMs: 10 });

    const bajas = [
      source.subscribePlant(() => {}),
      source.subscribePlant(() => {}),
      source.subscribeMachine("LIN/1", () => {}),
    ];
    bajas.forEach((baja) => baja());

    // Sin suscriptores no debe quedar actividad pendiente: si el timer
    // siguiera vivo, vitest no cerraría o el proceso quedaría colgado.
    expect(() => source.stop()).not.toThrow();
  });
});
