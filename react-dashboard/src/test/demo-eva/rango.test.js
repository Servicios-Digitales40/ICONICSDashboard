/**
 * rango.test.js
 * ------------------------------------------------------------------
 * `planificar()`/`tramosDe()` de `@shared/eva/rango.js` (Plan 15 Fase 2): LA
 * regla de troceado, única para el frontend (`Demo-EVA/data/tanque/historia.js`) y
 * el backend (`ia/conversacion/herramientas.mjs`), que antes vivía duplicada con valores
 * distintos en cada uno.
 *
 * Lo que se fija aquí es la aritmética de calendario —tamaño de tramo según
 * lo largo del rango, sin huecos ni solapes, el `interval` calculado por
 * tramo— sin red y sin mockear nada: es JavaScript puro.
 */
import { describe, expect, it } from "vitest";
import { planificar, tramosDe } from "@shared/eva/rango.js";

describe("tramosDe · el tamaño de cada tramo escalona con lo largo del rango", () => {
  it("un rango de un día o menos no se trocea", () => {
    const inicio = new Date("2026-08-20T00:00:00Z");
    const fin = new Date("2026-08-20T06:00:00Z");
    const tramos = tramosDe(inicio, fin);

    expect(tramos).toEqual([{ desde: inicio, hasta: fin, dias: 1 }]);
  });

  it("hasta 14 días, un tramo por día", () => {
    const inicio = new Date("2026-08-01T00:00:00Z");
    const fin = new Date("2026-08-11T00:00:00Z"); // 10 días
    const tramos = tramosDe(inicio, fin);

    expect(tramos).toHaveLength(10);
    for (const t of tramos) expect(t.dias).toBe(1);
  });

  it("entre 14 y 60 días, tramos de 3 días", () => {
    const inicio = new Date("2026-01-01T00:00:00Z");
    const fin = new Date("2026-02-01T00:00:00Z"); // 31 días
    const tramos = tramosDe(inicio, fin);

    // 31 días / 3 por tramo = 11 tramos (los primeros diez de 3 días, el último de 1).
    expect(tramos).toHaveLength(11);
    expect(tramos.slice(0, -1).every((t) => t.dias === 3)).toBe(true);
    expect(tramos.at(-1).dias).toBe(1);
  });

  it("entre 60 y 180 días, tramos de 7 días", () => {
    const inicio = new Date("2026-01-01T00:00:00Z");
    const fin = new Date("2026-03-15T00:00:00Z"); // 73 días
    const tramos = tramosDe(inicio, fin);

    expect(tramos.slice(0, -1).every((t) => t.dias === 7)).toBe(true);
  });

  it("por encima de 180 días, tramos de 30 días como mucho", () => {
    const inicio = new Date("2025-01-01T00:00:00Z");
    const fin = new Date("2026-01-01T00:00:00Z"); // 365 días
    const tramos = tramosDe(inicio, fin);

    expect(tramos.every((t) => t.dias <= 30)).toBe(true);
    // Un año en tramos de 30 días son ~13, muy por debajo de "365 peticiones".
    expect(tramos.length).toBeLessThan(15);
  });

  it("los tramos cubren el rango entero, sin huecos ni solapes", () => {
    const inicio = new Date("2026-08-01T00:00:00Z");
    const fin = new Date("2026-09-15T00:00:00Z");
    const tramos = tramosDe(inicio, fin);

    expect(tramos[0].desde).toEqual(inicio);
    expect(tramos.at(-1).hasta).toEqual(fin);
    for (let i = 1; i < tramos.length; i++) {
      expect(tramos[i].desde).toEqual(tramos[i - 1].hasta);
    }
  });

  it("la suma de días de los tramos coincide con los días totales del rango", () => {
    const inicio = new Date("2026-08-01T00:00:00Z");
    const fin = new Date("2026-10-01T00:00:00Z"); // 61 días
    const tramos = tramosDe(inicio, fin);
    const sumaDias = tramos.reduce((acc, t) => acc + t.dias, 0);

    // La suma puede superar levemente los días totales en el redondeo del
    // último tramo (Math.round sobre una fracción de día) — nunca por mucho.
    const diasTotales = Math.ceil((fin - inicio) / 86_400_000);
    expect(Math.abs(sumaDias - diasTotales)).toBeLessThanOrEqual(1);
  });
});

describe("planificar · el interval de cada tramo, para la densidad pedida", () => {
  it("calcula un interval por tramo para la densidad objetivo", () => {
    const inicio = new Date("2026-08-01T00:00:00Z");
    const fin = new Date("2026-08-02T00:00:00Z"); // 1 día, sin trocear
    const { tramos, peticionesEstimadas } = planificar({ inicio, fin, puntosPorTramo: 96 });

    expect(tramos).toHaveLength(1);
    expect(peticionesEstimadas).toBe(1);
    // 86400 s / 96 puntos = 900 s = 00:15:00.
    expect(tramos[0].interval).toBe("00:15:00");
  });

  it("peticionesEstimadas es el número de tramos, para avisar antes de leer", () => {
    const inicio = new Date("2026-01-01T00:00:00Z");
    const fin = new Date("2026-04-01T00:00:00Z"); // 90 días
    const { tramos, peticionesEstimadas } = planificar({ inicio, fin, puntosPorTramo: 96 });

    expect(peticionesEstimadas).toBe(tramos.length);
    // Con el escalonado, 90 días son unos pocos tramos de 7 días — muy por
    // debajo de "90 peticiones", que era el comportamiento de antes de esta
    // unificación (siempre 1 día por tramo en el backend).
    expect(peticionesEstimadas).toBeLessThan(20);
  });

  it("segundosPorPunto refleja la densidad real del primer tramo", () => {
    const inicio = new Date("2026-08-01T00:00:00Z");
    const fin = new Date("2026-08-02T00:00:00Z");
    const { segundosPorPunto } = planificar({ inicio, fin, puntosPorTramo: 96 });

    expect(segundosPorPunto).toBe(900);
  });

  it("un puntosPorTramo distinto para el mismo rango cambia sólo el interval, no los tramos", () => {
    const inicio = new Date("2026-01-01T00:00:00Z");
    const fin = new Date("2026-02-01T00:00:00Z");
    const planA = planificar({ inicio, fin, puntosPorTramo: 96 });
    const planB = planificar({ inicio, fin, puntosPorTramo: 24 });

    expect(planA.tramos.length).toBe(planB.tramos.length);
    expect(planA.tramos[0].interval).not.toBe(planB.tramos[0].interval);
  });
});
