// @vitest-environment jsdom
/**
 * use-alarm-count.test.jsx
 * ------------------------------------------------------------------
 * Plan 13, Fase 9: el hook detrás del badge del Topbar. Sólo el número —el
 * filtrado por activo y la etiqueta de cada evento son de
 * `Demo-EVA/data/comunes/alarmas.js`, ya cubierto en `alarmas.test.js`.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAlarmCount } from "@/lib/iconics";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubFetch(impl) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("useAlarmCount", () => {
  it("arranca en null, y pasa al número de eventos cuando responde", async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ alarms: [{ eventId: "e1" }, { eventId: "e2" }] }) }));

    const { result } = renderHook(() => useAlarmCount(30_000));
    expect(result.current).toBeNull();

    await waitFor(() => expect(result.current).toBe(2));
  });

  it("sin eventos, el número es 0 — no null", async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ alarms: [] }) }));

    const { result } = renderHook(() => useAlarmCount(30_000));
    await waitFor(() => expect(result.current).toBe(0));
  });

  it("si falla la petición, se queda en null — nunca en 0 (un 0 falso se lee como «todo en orden»)", async () => {
    stubFetch(async () => ({ ok: false, status: 500, json: async () => ({ error: "fallo simulado" }) }));

    const { result } = renderHook(() => useAlarmCount(30_000));
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    expect(result.current).toBeNull();
  });

  it("vuelve a preguntar al cabo del intervalo", async () => {
    vi.useFakeTimers();
    let llamadas = 0;
    stubFetch(async () => {
      llamadas += 1;
      return { ok: true, status: 200, json: async () => ({ alarms: [] }) };
    });

    renderHook(() => useAlarmCount(30_000));
    await act(async () => {}); // deja resolver la carga inicial
    expect(llamadas).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(llamadas).toBe(2);
  });

  it("pide sólo la última hora (hours=1), sin filtrar por punto", async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ alarms: [] }) }));

    renderHook(() => useAlarmCount(30_000));
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    const url = String(fetch.mock.calls[0][0]);
    expect(url).toContain("hours=1");
    expect(url).not.toContain("pointName");
  });
});
