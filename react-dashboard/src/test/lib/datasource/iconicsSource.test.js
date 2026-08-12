/**
 * iconicsSource.test.js
 * ------------------------------------------------------------------
 * Comprueba que la fuente real pide lo justo y traduce bien.
 *
 * La prueba del presupuesto de red es la que da sentido a todo el motor:
 * sin ella, «una petición por ciclo» sería una intención y no un hecho.
 */
import { describe, expect, it, vi } from "vitest";

import { QUALITY_GOOD } from "@shared/quality.js";
import { SIN_CAOS, createFakeTransport } from "@/lib/iconics/fakeTransport.js";
import { createIconicsSource } from "@/lib/datasource/iconicsSource.js";

/** Transporte espía: registra cada lote pedido y responde siempre bien. */
function transporteEspia() {
  const lotes = [];
  return {
    lotes,
    read: vi.fn(async (points) => {
      lotes.push(points);
      return new Map(points.map((p) => [p, { value: 50, quality: QUALITY_GOOD }]));
    }),
  };
}

/** Todos los puntos pedidos hasta ahora, sin repetir. */
const puntosPedidos = (t) => new Set(t.lotes.flat());

describe("iconicsSource · forma de los datos", () => {
  it("entrega las 10 máquinas con la nomenclatura de ICONICS", async () => {
    const source = createIconicsSource({ transport: createFakeTransport({ chaos: SIN_CAOS }) });
    let snapshot = null;

    const baja = source.subscribePlant((s) => { snapshot = s; });

    expect(snapshot.machines).toHaveLength(10);
    expect(snapshot.machines.map((m) => m.id)).toContain("REC/13");
    expect(snapshot.machines.find((m) => m.id === "LIN/1").equipo).toBe("Lineal 1");

    baja();
    source.stop();
  });

  it("una máquina desconocida no revienta: informa del error", () => {
    const source = createIconicsSource({ transport: transporteEspia() });
    let snapshot = null;

    source.subscribeMachine("NOPE/99", (s) => { snapshot = s; });

    expect(snapshot.machines).toHaveLength(0);
    expect(snapshot.error).toMatch(/desconocida/i);

    source.stop();
  });
});

describe("iconicsSource · presupuesto de red", () => {
  it("la vista de planta NO pide los tags que solo usa el detalle", async () => {
    const transporte = transporteEspia();
    const source = createIconicsSource({ transport: transporte });

    const baja = source.subscribePlant(() => {});
    await new Promise((r) => setTimeout(r, 320));

    const puntos = [...puntosPedidos(transporte)];

    // Sí pide el resumen: OEE, sus factores, piezas, estado y tiempo muerto.
    expect(puntos).toContain("ac:RESONAC/LIN/1/OEE");
    expect(puntos).toContain("ac:RESONAC/REC/13/Estado");

    // Y NO los tiempos de ciclo, que solo hacen falta al abrir una máquina.
    // Aquí está la mitad del presupuesto de red: son 6 tags × 10 máquinas
    // que no se piden mientras nadie los mira.
    expect(puntos.some((p) => p.endsWith("/T_Ciclo"))).toBe(false);
    expect(puntos.some((p) => p.endsWith("/T_Ciclo_Teo"))).toBe(false);
    expect(puntos.some((p) => p.endsWith("/T_Ciclo_Calc"))).toBe(false);

    baja();
    source.stop();
  });

  it("no pide T_Ciclo_Calc en las rectificadoras, que no lo tienen", async () => {
    const transporte = transporteEspia();
    const source = createIconicsSource({ transport: transporte });

    const baja = source.subscribeMachine("REC/11", () => {});
    // El alta agrupa las peticiones; se espera a que salgan.
    await new Promise((r) => setTimeout(r, 320));

    const puntos = [...puntosPedidos(transporte)];
    expect(puntos.length).toBeGreaterThan(0);
    expect(puntos.some((p) => p.includes("/REC/11/"))).toBe(true);
    expect(puntos.some((p) => p.endsWith("T_Ciclo_Calc"))).toBe(false);

    baja();
    source.stop();
  });

  it("sí pide T_Ciclo_Calc en las líneas", async () => {
    const transporte = transporteEspia();
    const source = createIconicsSource({ transport: transporte });

    const baja = source.subscribeMachine("LIN/3", () => {});
    await new Promise((r) => setTimeout(r, 320));

    const puntos = [...puntosPedidos(transporte)];
    expect(puntos.some((p) => p === "ac:RESONAC/LIN/3/T_Ciclo_Calc")).toBe(true);

    baja();
    source.stop();
  });

  it("agrupa el alta de puntos en una sola tanda (riesgo R-08)", async () => {
    const transporte = transporteEspia();
    const source = createIconicsSource({ transport: transporte });

    // Navegación rápida: cinco altas seguidas antes de que salga nada.
    const bajas = ["LIN/1", "LIN/2", "LIN/3", "LIN/4", "LIN/5"].map((id) =>
      source.subscribeMachine(id, () => {})
    );

    await new Promise((r) => setTimeout(r, 320));

    // Dos motores implicados (detalle y estático) → como mucho una tanda
    // de cada uno, no una petición por cada alta.
    expect(transporte.read.mock.calls.length).toBeLessThanOrEqual(2);

    bajas.forEach((b) => b());
    source.stop();
  });
});

describe("iconicsSource · instrumentación", () => {
  it("expone peticiones por minuto y puntos activos", async () => {
    const source = createIconicsSource({ transport: transporteEspia() });
    const baja = source.subscribeMachine("LIN/1", () => {});

    await new Promise((r) => setTimeout(r, 320));

    const stats = source.stats();
    expect(stats.motores).toHaveLength(3);
    expect(stats.puntos).toBeGreaterThan(0);
    expect(stats.peticionesPorMinuto).toBeGreaterThan(0);

    baja();
    source.stop();
  });
});
