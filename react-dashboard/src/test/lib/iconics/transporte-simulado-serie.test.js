/**
 * El transporte simulado tiene historia (Plan 42.5 F1, D10): `readSerie`
 * muestrea el mismo `modelo` hacia atrás sobre la rejilla del rango, con la
 * forma del lector real. Sin esto, una máquina configurada en «Simulado»
 * tendría valor en vivo y ninguna gráfica.
 */
import { describe, expect, it, vi } from "vitest";

import { createTransporteSimulado, SIN_CAOS } from "@/lib/iconics";
import { MAX_PUNTOS, VENTANA } from "@shared/eva/comun/historia.js";

const T = Date.UTC(2026, 8, 22, 12, 0, 0);

/** Un modelo con tres puntos: uno con curva, uno sin valor y el resto ajenos. */
const modelo = (nombre, ms) => {
  if (nombre === "ac:M/curva") return 10 + Math.sin(ms / 1_000_000);
  if (nombre === "ac:M/mudo") return null;
  return undefined;
};

const transporte = (extra = {}) =>
  createTransporteSimulado({ modelo, chaos: SIN_CAOS, ahora: () => T, rnd: () => 0.5, ...extra });

describe("readSerie sobre la ventana relativa", () => {
  it("devuelve VENTANA.puntos muestras crecientes en t, la última en `ahora`", async () => {
    const { datos, motivo, hasMore, cobertura } = await transporte().readSerie("ac:M/curva");

    expect(motivo).toBeNull();
    expect(hasMore).toBe(false);
    expect(datos).toHaveLength(VENTANA.puntos);
    expect(datos.at(-1).t.getTime()).toBe(T);
    expect(datos[0].t.getTime()).toBe(T - (VENTANA.horas * 3_600_000 * (VENTANA.puntos - 1)) / VENTANA.puntos);
    for (let i = 1; i < datos.length; i++) expect(datos[i].t > datos[i - 1].t).toBe(true);
    expect(datos.every((p) => Number.isFinite(p.valor))).toBe(true);
    expect(cobertura).toMatchObject({ tramos: 1, tramosConDato: 1, completa: true });
  });

  it("cada muestra es el modelo evaluado en su instante, no un valor inventado", async () => {
    const { datos } = await transporte().readSerie("ac:M/curva", { horas: 1, puntos: 4 });

    expect(datos).toHaveLength(4);
    for (const p of datos) expect(p.valor).toBe(modelo("ac:M/curva", p.t.getTime()));
  });
});

describe("readSerie sobre un rango absoluto", () => {
  it("pide MAX_PUNTOS dentro de [inicio, fin], como el lector real", async () => {
    const inicio = new Date(T - 2 * 24 * 3_600_000);
    const fin = new Date(T - 24 * 3_600_000);

    const { datos } = await transporte().readSerie("ac:M/curva", { inicio, fin });

    expect(datos).toHaveLength(MAX_PUNTOS);
    expect(datos[0].t.getTime()).toBeGreaterThan(inicio.getTime());
    expect(datos.at(-1).t.getTime()).toBe(fin.getTime());
  });
});

describe("lo que el simulador NO inventa", () => {
  it("un punto que no es de esta máquina vuelve con motivo y sin muestras", async () => {
    const r = await transporte().readSerie("ac:OTRA/cosa");

    expect(r.datos).toEqual([]);
    expect(r.motivo).toMatch(/no es de esta máquina/);
    expect(r.cobertura).toBeNull();
  });

  it("un punto suyo sin valor es una serie vacía con cobertura incompleta, no una recta a cero", async () => {
    const r = await transporte().readSerie("ac:M/mudo");

    expect(r.datos).toEqual([]);
    expect(r.motivo).toBeNull();
    expect(r.cobertura).toMatchObject({ tramos: 1, tramosConDato: 0, completa: false });
  });

  it("el caos `ausente` deja huecos en la rejilla, igual que el historiador real", async () => {
    // Alterna: la primera tirada es el fallo de petición (no dispara), y de
    // ahí en adelante una de cada dos muestras cae como ausente.
    let tirada = 0;
    const rnd = vi.fn(() => (tirada++ % 2 ? 0.9 : 0.1));
    const { datos } = await createTransporteSimulado({
      modelo, chaos: { ...SIN_CAOS, ausente: 0.5 }, ahora: () => T, rnd,
    }).readSerie("ac:M/curva");

    expect(datos.length).toBeGreaterThan(0);
    expect(datos.length).toBeLessThan(VENTANA.puntos);
  });

  it("el fallo de petición del caos también alcanza al historiador simulado", async () => {
    await expect(
      transporte({ chaos: { ...SIN_CAOS, errorPeticion: 1 } }).readSerie("ac:M/curva"),
    ).rejects.toThrow(/historiador/);
  });
});
