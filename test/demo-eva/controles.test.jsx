// @vitest-environment jsdom
/**
 * controles.test.jsx
 * ------------------------------------------------------------------
 * La vista «Controles» (`views/ControlesEva.jsx`): confirmación de dos
 * pasos en el propio botón, y el mapeo de la respuesta del backend a un
 * mensaje de éxito/error.
 *
 * El origen de datos va SIMULADO (`VITE_ICONICS_FAKE`, igual que
 * `detalle-activo-simulada.test.jsx`): el simulador no usa `fetch`, así que
 * el único `fetch` que se mockea aquí es el de `POST /api/control/bomba`.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/EvaProvider.jsx";
import ControlesEva from "@/Demo-EVA/views/ControlesEva.jsx";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  delete globalThis.fetch;
});

const montar = () =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <EvaProvider>
          <ControlesEva />
        </EvaProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );

function mockFetch(respuesta) {
  const llamada = vi.fn().mockResolvedValue({
    ok: respuesta.ok !== false,
    status: respuesta.status ?? (respuesta.ok !== false ? 200 : 409),
    json: async () => respuesta.cuerpo,
  });
  globalThis.fetch = llamada;
  return llamada;
}

describe("Controles — confirmación de dos pasos", () => {
  it("el primer clic no llama a fetch y cambia el botón a modo confirmación", () => {
    const fetchMock = mockFetch({ cuerpo: { ok: true, accion: "encendida" } });
    montar();

    fireEvent.click(screen.getByRole("button", { name: /Encender bomba/ }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Confirmar encendido/ })).toBeTruthy();
  });

  it("el segundo clic, dentro de la ventana, sí llama a fetch con {encender:true}", async () => {
    const fetchMock = mockFetch({ cuerpo: { ok: true, accion: "encendida", tag: "ac:TDCON/DEMO/SENSORES/CONTROL" } });
    montar();

    const boton = screen.getByRole("button", { name: /Encender bomba/ });
    fireEvent.click(boton);
    fireEvent.click(screen.getByRole("button", { name: /Confirmar encendido/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/control/bomba",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ encender: true }),
      })
    );

    await waitFor(() => expect(screen.getByText(/Bomba encendida/)).toBeTruthy());
  });

  it("pasado el timeout sin segundo clic, el botón vuelve a su estado original", () => {
    mockFetch({ cuerpo: { ok: true, accion: "apagada" } });
    montar();

    fireEvent.click(screen.getByRole("button", { name: /Apagar bomba/ }));
    expect(screen.getByRole("button", { name: /Confirmar apagado/ })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(4001);
    });

    expect(screen.getByRole("button", { name: /^Apagar bomba$/ })).toBeTruthy();
  });

  it("una respuesta de error del backend se pinta con el mensaje tal cual", async () => {
    mockFetch({ ok: false, status: 409, cuerpo: { ok: false, error: "No enciendo la bomba: el tanque está al 91.2 %." } });
    montar();

    fireEvent.click(screen.getByRole("button", { name: /Encender bomba/ }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar encendido/ }));

    await waitFor(() => expect(screen.getByText(/No enciendo la bomba: el tanque está al 91.2 %\./)).toBeTruthy());
  });

  it("mientras hay una petición en curso, ambos botones quedan inactivos", async () => {
    let resolver;
    const promesa = new Promise((resolve) => { resolver = resolve; });
    globalThis.fetch = vi.fn().mockReturnValue(promesa);
    montar();

    fireEvent.click(screen.getByRole("button", { name: /Encender bomba/ }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar encendido/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Apagar bomba/ }).disabled).toBe(true);
    });

    resolver({ ok: true, status: 200, json: async () => ({ ok: true, accion: "encendida" }) });
  });
});
