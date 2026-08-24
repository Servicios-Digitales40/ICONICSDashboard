// @vitest-environment jsdom
/**
 * manosLibres.test.jsx
 * ------------------------------------------------------------------
 * El modo manos libres se queda ENCENDIDO cuando se pulsa el botón.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * `useDictado` devuelve un objeto literal nuevo en cada render, así que todo
 * callback que dependa de él —`apagar` entre ellos— cambia de identidad
 * continuamente. El efecto que apaga el micrófono al desmontar llegó a
 * depender de `[apagar]`, y eso lo convertía en un efecto que se rehacía en
 * CADA render: su limpieza llamaba a `apagar()` cada vez.
 *
 * El resultado no se ve leyendo el componente, que está bien: pulsar
 * «manos libres» encendía el modo y el render siguiente lo apagaba solo,
 * cortando además la grabación recién abierta. El botón no se quedaba pulsado
 * y el modo no funcionaba en absoluto.
 *
 * Por eso la prueba mira el ciclo desde fuera —encender y comprobar que sigue
 * encendido tras varios renders— en vez de fijar la lista de dependencias:
 * lo que hay que preservar es que el modo dure, no cómo se consiga.
 */
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useManosLibres } from "@/features/asistente/lib/useAsistente.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/*
 * jsdom no trae micrófono ni voz. `disponible` exige las dos cosas, y sin
 * ellas `encender()` sale por la primera guarda y la prueba pasaría sin
 * ejercitar nada.
 */
beforeEach(() => {
  /*
   * `puedeGrabar()` exige contexto seguro: `navigator.mediaDevices` sólo existe
   * en HTTPS o localhost, y jsdom no marca la página como segura por su cuenta.
   */
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });

  navigator.mediaDevices = { getUserMedia: vi.fn(() => Promise.resolve({ getTracks: () => [] })) };
  window.MediaRecorder = class {};
  window.speechSynthesis = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] };

  // `useDictado` pregunta al backend si hay transcripción antes de ofrecerse.
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ habilitado: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }),
  );
});

const montar = (props = {}) =>
  renderHook(() => useManosLibres({
    preguntar: vi.fn(),
    ocupado: false,
    ultimaRespuesta: null,
    ...props,
  }));

describe("useManosLibres", () => {
  it("sigue encendido después de encenderlo", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.disponible).toBe(true));

    await act(async () => { result.current.encender(); });

    expect(result.current.activo).toBe(true);
  });

  /*
   * La prueba de verdad: el fallo no estaba en encender, sino en sobrevivir al
   * render siguiente. Un re-render que no toca el modo no puede apagarlo.
   */
  it("sobrevive a renders que no tienen nada que ver con él", async () => {
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.disponible).toBe(true));

    await act(async () => { result.current.encender(); });
    expect(result.current.activo).toBe(true);

    await act(async () => { rerender(); rerender(); rerender(); });

    expect(result.current.activo).toBe(true);
    expect(result.current.fase).not.toBe("parado");
  });

  it("se apaga cuando se cuelga a propósito", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.disponible).toBe(true));

    await act(async () => { result.current.encender(); });
    await act(async () => { result.current.apagar(); });

    expect(result.current.activo).toBe(false);
    expect(result.current.fase).toBe("parado");
  });
});
