// @vitest-environment jsdom
/**
 * topbar-alarmas.test.jsx
 * ------------------------------------------------------------------
 * Plan 13, Fase 9: el badge de eventos recientes del Topbar
 * (`app/layout/Topbar.jsx`), y que pulsarlo navegue a la vista de alarmas.
 * El conteo en sí (`useAlarmCount`) ya está probado en
 * `test/lib/iconics/use-alarm-count.test.jsx`; aquí sólo el cableado: qué se
 * pinta con cada valor, y que `onAbrirAlarmas` se dispare al pulsar.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { Topbar } from "@/app/layout/Topbar.jsx";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubAlarmas(alarms) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ alarms }) })));
}

const montar = (onAbrirAlarmas = () => {}) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <Topbar page="eva-inicio" onAbrirMenu={() => {}} onAbrirAlarmas={onAbrirAlarmas} />
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("Topbar: el badge de eventos recientes", () => {
  it("con eventos en la última hora, el número se ve", async () => {
    stubAlarmas([{ eventId: "e1" }, { eventId: "e2" }, { eventId: "e3" }]);
    montar();

    await waitFor(() => expect(screen.getByText("3")).toBeTruthy());
  });

  it("sin eventos, no hay número — el botón sigue ahí, pero sin badge", async () => {
    stubAlarmas([]);
    montar();

    await waitFor(() => expect(screen.getByRole("button", { name: "Ver alarmas" })).toBeTruthy());
    expect(screen.queryByText("0")).toBeNull();
  });

  it("si falla la lectura, tampoco hay badge — nunca un 0 fabricado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: "caído" }) })));
    montar();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Ver alarmas" })).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("pulsar el botón llama a onAbrirAlarmas", async () => {
    stubAlarmas([{ eventId: "e1" }]);
    const onAbrir = vi.fn();
    montar(onAbrir);

    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Ver alarmas/ }));

    expect(onAbrir).toHaveBeenCalledTimes(1);
  });
});
