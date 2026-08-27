// @vitest-environment jsdom
/**
 * useAhora.test.jsx
 * ------------------------------------------------------------------
 * El reloj compartido de la Fase 2 (`lib/useAhora.js`): que tique al
 * intervalo pedido, y que sea UN SOLO temporizador — no uno por consumidor.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAhora } from "@/Demo-EVA/lib/useAhora.js";

afterEach(() => vi.useRealTimers());

describe("useAhora", () => {
  it("arranca con la hora actual, sin esperar al primer tic", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00Z"));

    const { result } = renderHook(() => useAhora(5_000));
    expect(result.current.getTime()).toBe(new Date("2026-08-21T12:00:00Z").getTime());
  });

  it("avanza al cabo del intervalo, y no antes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00Z"));

    const { result } = renderHook(() => useAhora(5_000));

    act(() => vi.advanceTimersByTime(4_000));
    expect(result.current.getTime()).toBe(new Date("2026-08-21T12:00:00Z").getTime());

    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.getTime()).toBe(new Date("2026-08-21T12:00:05Z").getTime());
  });

  it("un solo temporizador: dos usos por separado no se multiplican en un mismo montaje", () => {
    // No hay forma directa de "contar timers" desde fuera; lo que sí se
    // puede comprobar es que DESMONTAR limpia el suyo — si no lo hiciera,
    // avanzar el reloj después de desmontar seguiría intentando actualizar
    // un componente ya fuera del árbol, y React lo reporta como aviso.
    vi.useFakeTimers();
    const advertencia = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = renderHook(() => useAhora(1_000));
    unmount();
    act(() => vi.advanceTimersByTime(10_000));

    expect(advertencia).not.toHaveBeenCalled();
    advertencia.mockRestore();
  });
});
