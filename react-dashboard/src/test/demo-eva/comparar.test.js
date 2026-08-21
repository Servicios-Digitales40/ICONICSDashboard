/**
 * comparar.test.js
 * ------------------------------------------------------------------
 * Plan 13, Fase 6 (F3): cruzar varias señales históricas en una sola
 * rejilla de filas, con tolerancia — no con la igualdad exacta de
 * `unir()`, que nunca se había ejercitado con más de una señal a la vez.
 */
import { describe, expect, it } from "vitest";

import { combinarPorTolerancia, normalizarAEscala } from "@/Demo-EVA/lib/comparar.js";

const t0 = new Date("2026-08-20T10:00:00Z").getTime();
const punto = (msOffset, valor) => ({ t: new Date(t0 + msOffset), valor });

describe("combinarPorTolerancia: filas por instante de referencia, no por igualdad exacta", () => {
  it("dos señales con marcas de tiempo IDÉNTICAS se combinan en la misma fila", () => {
    const filas = combinarPorTolerancia({
      nivelTanque: [punto(0, 50), punto(60_000, 55)],
      presionRelativa: [punto(0, 1.2), punto(60_000, 1.4)],
    });
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ nivelTanque: 50, presionRelativa: 1.2 });
    expect(filas[1]).toMatchObject({ nivelTanque: 55, presionRelativa: 1.4 });
  });

  it("marcas de tiempo CERCANAS pero no idénticas también se combinan — es justo lo que unir() no hacía", () => {
    // Separación real entre muestras de nivelTanque: 900 000 ms. La
    // tolerancia (mitad de la mediana) es 450 000 ms, y presionRelativa
    // llega 30 s tarde en cada punto — bien dentro de esa tolerancia.
    const filas = combinarPorTolerancia({
      nivelTanque: [punto(0, 50), punto(900_000, 55), punto(1_800_000, 60)],
      presionRelativa: [punto(30_000, 1.2), punto(930_000, 1.4), punto(1_830_000, 1.6)],
    });
    expect(filas).toHaveLength(3);
    expect(filas.every((f) => f.presionRelativa !== undefined)).toBe(true);
  });

  it("una muestra fuera de tolerancia se queda sin pareja: la fila existe, esa clave no", () => {
    const filas = combinarPorTolerancia({
      nivelTanque: [punto(0, 50), punto(900_000, 55)],
      // Sólo una muestra de presión, lejísimos de las dos de nivel.
      presionRelativa: [punto(10_000_000, 9.9)],
    });
    expect(filas).toHaveLength(2);
    expect(filas[0].presionRelativa).toBeUndefined();
    expect(filas[1].presionRelativa).toBeUndefined();
  });

  it("la PRIMERA clave del objeto es la línea de tiempo de referencia", () => {
    // Si presionRelativa manda, hay 3 filas (sus 3 instantes); si nivelTanque
    // manda, hay 2. El orden de las claves en el objeto decide cuál gana.
    const porClave = {
      presionRelativa: [punto(0, 1.0), punto(500_000, 1.1), punto(1_000_000, 1.2)],
      nivelTanque: [punto(0, 50), punto(1_000_000, 60)],
    };
    expect(combinarPorTolerancia(porClave)).toHaveLength(3);
  });

  it("sin ninguna señal con datos, no hay filas — y no revienta", () => {
    expect(combinarPorTolerancia({})).toEqual([]);
    expect(combinarPorTolerancia({ nivelTanque: [], presionRelativa: [] })).toEqual([]);
  });

  it("con un solo punto en la referencia, no hay distancia que medir y aun así combina", () => {
    const filas = combinarPorTolerancia({
      nivelTanque: [punto(0, 50)],
      presionRelativa: [punto(1_000, 1.2)],
    });
    expect(filas).toHaveLength(1);
    expect(filas[0].presionRelativa).toBe(1.2);
  });
});

describe("normalizarAEscala: 0-100 sobre la escala DECLARADA, no sobre lo observado", () => {
  const ESCALA = { min: 0, max: 60 }; // temperaturaTanque

  it("el mínimo de la escala es 0, el máximo es 100", () => {
    expect(normalizarAEscala(0, ESCALA)).toBe(0);
    expect(normalizarAEscala(60, ESCALA)).toBe(100);
  });

  it("un valor a mitad de escala da 50, aunque los datos observados nunca se muevan tanto", () => {
    // La temperatura real oscila 22.9-25.1 sobre una escala de 0-60: normalizar
    // contra lo OBSERVADO la haría parecer tan volátil como una señal que sí
    // ocupa toda su escala. Contra la escala declarada, sigue leyéndose casi plana.
    expect(normalizarAEscala(30, ESCALA)).toBe(50);
    expect(normalizarAEscala(24, ESCALA)).toBeCloseTo(40, 5);
  });

  it("sin escala declarada, devuelve el valor tal cual — no inventa un 0-100 de la nada", () => {
    expect(normalizarAEscala(42, null)).toBe(42);
  });

  it("un valor ausente (undefined/null) se queda ausente, no se convierte en 0", () => {
    expect(normalizarAEscala(undefined, ESCALA)).toBeUndefined();
    expect(normalizarAEscala(null, ESCALA)).toBeNull();
  });

  it("una escala sin rango (min === max) no divide entre cero", () => {
    expect(normalizarAEscala(5, { min: 5, max: 5 })).toBe(0);
  });
});
