/**
 * machine.test.js
 * ------------------------------------------------------------------
 * Prueba la frontera de saneamiento (riesgo R-07 del Plan 1).
 *
 * El caso que importa de verdad es `Prod_Real_Total = 0` al inicio del
 * turno: el Excel calcula OEE_Cal como (Pz_OK / Prod_Real_Total) × 100
 * sin protección, así que el servidor puede devolver Infinity o NaN. Si
 * eso llega a `buildPlantSummary`, contamina el resumen de toda la planta.
 */
import { describe, expect, it } from "vitest";
import { calcOEE, createMachine, hasValue, toNumber } from "@/lib/domain/machine.js";

const base = { id: "LIN/1", areaId: "LIN", machineId: "1", equipo: "Lineal 1" };

describe("toNumber · saneamiento", () => {
  it("descarta los valores que romperían los agregados", () => {
    expect(toNumber(NaN)).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
    expect(toNumber(-Infinity)).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber("")).toBeNull();
    expect(toNumber("no soy un número")).toBeNull();
  });

  it("conserva los valores legítimos, incluido el cero", () => {
    expect(toNumber(0)).toBe(0);
    expect(toNumber(-3.5)).toBe(-3.5);
    expect(toNumber("84.5")).toBe(84.5);
  });
});

describe("createMachine · ausencia de dato", () => {
  it("convierte Infinity en hueco y no en un número plausible", () => {
    // Lo que devuelve el servidor con Prod_Real_Total = 0.
    const m = createMachine({ ...base, readings: { calidad: Infinity, disponibilidad: 90, rendimiento: 80 } });

    expect(m.calidad).toBeNull();
    // Y el OEE derivado tampoco se inventa: falta un factor.
    expect(m.oee).toBeNull();
  });

  it("sin lecturas deja todo en null y el estado en unknown", () => {
    const m = createMachine({ ...base, readings: {} });

    expect(m.oee).toBeNull();
    expect(m.aprobadas).toBeNull();
    expect(m.estado).toBe("unknown");
  });

  it("mapea los códigos de estado de ICONICS", () => {
    expect(createMachine({ ...base, readings: { estado: 1 } }).estado).toBe("running");
    expect(createMachine({ ...base, readings: { estado: 0 } }).estado).toBe("standby");
    expect(createMachine({ ...base, readings: { estado: 3 } }).estado).toBe("commfail");
    // Un código que el servidor no debería emitir no puede colarse como otro estado.
    expect(createMachine({ ...base, readings: { estado: 99 } }).estado).toBe("unknown");
  });
});

describe("createMachine · derivaciones conservadoras", () => {
  it("deriva producidas solo si tiene ambas piezas", () => {
    expect(createMachine({ ...base, readings: { aprobadas: 80, rechazadas: 20 } }).producidas).toBe(100);
    expect(createMachine({ ...base, readings: { aprobadas: 80 } }).producidas).toBeNull();
  });

  it("prefiere el OEE del servidor sobre el recalculado", () => {
    const m = createMachine({
      ...base,
      readings: { oee: 42, disponibilidad: 90, rendimiento: 80, calidad: 70 },
    });
    expect(m.oee).toBe(42);
  });
});

describe("calcOEE", () => {
  it("compone los tres factores", () => {
    expect(calcOEE({ disponibilidad: 100, rendimiento: 100, calidad: 100 })).toBe(100);
    expect(calcOEE({ disponibilidad: 50, rendimiento: 50, calidad: 100 })).toBe(25);
  });

  it("devuelve null si falta cualquier factor", () => {
    expect(calcOEE({ disponibilidad: 90, rendimiento: null, calidad: 95 })).toBeNull();
  });
});

describe("hasValue", () => {
  it("distingue el cero real de la ausencia de dato", () => {
    expect(hasValue(0)).toBe(true);
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
  });
});
