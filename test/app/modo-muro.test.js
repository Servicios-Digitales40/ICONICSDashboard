// @vitest-environment jsdom
/**
 * modo-muro.test.js
 * ------------------------------------------------------------------
 * Plan 13, Fase 8 (F8): el modo muro se activa por parámetro de URL y, si
 * se le dan dos o más vistas y un intervalo, rota entre ellas solo.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { leerModoMuro, useRotacionMuro } from "@/app/modoMuro.js";

describe("leerModoMuro: qué dice la URL", () => {
  it("sin ?muro=1, está apagado — el resto de parámetros da igual", () => {
    expect(leerModoMuro({ vistas: "eva-inicio,eva-planta", rotarCada: "30" }).activo).toBe(false);
  });

  it("con ?muro=1 y nada más, está activo pero sin rotación", () => {
    const r = leerModoMuro({ muro: "1" });
    expect(r.activo).toBe(true);
    expect(r.vistas).toEqual([]);
    expect(r.intervaloS).toBe(0);
  });

  it("un valor de muro que no sea exactamente «1» no activa el modo", () => {
    expect(leerModoMuro({ muro: "true" }).activo).toBe(false);
    expect(leerModoMuro({ muro: "yes" }).activo).toBe(false);
  });

  it("vistas se separa por comas y descarta espacios y vacíos", () => {
    const r = leerModoMuro({ muro: "1", vistas: "eva-inicio, eva-planta,, eva-maqueta " });
    expect(r.vistas).toEqual(["eva-inicio", "eva-planta", "eva-maqueta"]);
  });

  it("un rotarCada inválido o negativo cae en 0, no en NaN ni en negativo", () => {
    expect(leerModoMuro({ muro: "1", rotarCada: "no-es-numero" }).intervaloS).toBe(0);
    expect(leerModoMuro({ muro: "1", rotarCada: "-30" }).intervaloS).toBe(0);
  });

  it("sin params en absoluto, no revienta", () => {
    expect(leerModoMuro(undefined)).toEqual({ activo: false, vistas: [], intervaloS: 0, escala: 1.6 });
  });

  it("sin escala pedida, usa el valor por defecto", () => {
    expect(leerModoMuro({ muro: "1" }).escala).toBe(1.6);
  });

  it("una escala dentro de rango se respeta", () => {
    expect(leerModoMuro({ muro: "1", escala: "2.2" }).escala).toBe(2.2);
  });

  it("una escala absurda (de sobra o de menos) se recorta, no se ignora", () => {
    expect(leerModoMuro({ muro: "1", escala: "100" }).escala).toBe(3);
    expect(leerModoMuro({ muro: "1", escala: "0.1" }).escala).toBe(1);
  });

  it("una escala que no es un número cae en el valor por defecto", () => {
    expect(leerModoMuro({ muro: "1", escala: "enorme" }).escala).toBe(1.6);
  });
});

describe("useRotacionMuro: cicla entre vistas, sin quedarse oscilando entre las dos primeras", () => {
  it("sin activar, nunca llama a navigate", () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    renderHook(() =>
      useRotacionMuro({ activo: false, vistas: ["a", "b", "c"], intervaloS: 10, paginaActual: "a", navigate })
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(navigate).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("con una sola vista, no rota — no hay a dónde ir", () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    renderHook(() =>
      useRotacionMuro({ activo: true, vistas: ["a"], intervaloS: 10, paginaActual: "a", navigate })
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(navigate).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("avanza por las TRES vistas en orden, no sólo entre las dos primeras", () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    renderHook(() =>
      useRotacionMuro({ activo: true, vistas: ["a", "b", "c"], intervaloS: 10, paginaActual: "a", navigate })
    );

    act(() => vi.advanceTimersByTime(10_000));
    expect(navigate).toHaveBeenNthCalledWith(1, "b");

    act(() => vi.advanceTimersByTime(10_000));
    expect(navigate).toHaveBeenNthCalledWith(2, "c");

    act(() => vi.advanceTimersByTime(10_000));
    expect(navigate).toHaveBeenNthCalledWith(3, "a"); // da la vuelta, no se cuelga en "c"

    vi.useRealTimers();
  });

  it("arranca desde la página actual, no siempre desde el principio de la lista", () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    renderHook(() =>
      useRotacionMuro({ activo: true, vistas: ["a", "b", "c"], intervaloS: 10, paginaActual: "b", navigate })
    );
    act(() => vi.advanceTimersByTime(10_000));
    expect(navigate).toHaveBeenCalledWith("c");
    vi.useRealTimers();
  });

  it("se detiene al desactivar: desmontar limpia el temporizador", () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    const { unmount } = renderHook(() =>
      useRotacionMuro({ activo: true, vistas: ["a", "b"], intervaloS: 10, paginaActual: "a", navigate })
    );
    unmount();
    act(() => vi.advanceTimersByTime(60_000));
    expect(navigate).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
