// @vitest-environment jsdom
/**
 * detalle-activo-simulada.test.jsx
 * ------------------------------------------------------------------
 * La vista «Detalle de activo» (`views/DetalleActivo.jsx`), con el origen
 * **Simulado**, para los cuatro activos.
 *
 * Mismo criterio que `planta-simulada.test.jsx`: montar la vista real sobre
 * el provider real, sin red, y comprobar que pinta para los cuatro activos, y
 * que un activo sin señal historizada (Bombeo, Eléctrico) lo dice en vez de
 * fingir un histórico que no tiene.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import DetalleActivo from "@/Demo-EVA/views/DetalleActivo.jsx";

function cortarLaRed() {
  const trampa = vi.fn(() => {
    throw new Error("el origen simulado no debe salir a la red");
  });
  globalThis.fetch = trampa;
  return trampa;
}

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

const montar = (params, onNavigate = () => {}) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <DetalleActivo params={params} onNavigate={onNavigate} />
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("Detalle de activo en modo simulado", () => {
  it.each(["tanque", "bombeo", "distribucion", "electrico"])(
    "pinta el activo «%s», sin tocar la red",
    async (activo) => {
      const fetchTrampa = cortarLaRed();

      montar({ activo });

      await waitFor(() => expect(screen.getByText(/^Detalle ·/)).toBeTruthy(), { timeout: 4_000 });
      expect(fetchTrampa).not.toHaveBeenCalled();
    }
  );

  it("Bombeo no afirma «Historiador»: ninguna de sus dos señales tiene serie propia", async () => {
    const fetchTrampa = cortarLaRed();

    montar({ activo: "bombeo" });

    await waitFor(() => expect(screen.getByText(/^Detalle ·/)).toBeTruthy(), { timeout: 4_000 });
    expect(screen.queryByText(/Historiador/)).toBeNull();

    expect(fetchTrampa).not.toHaveBeenCalled();
  });

  it("Tanque sí afirma «Historiador»: sus dos señales tienen serie propia", async () => {
    const fetchTrampa = cortarLaRed();

    montar({ activo: "tanque" });

    await waitFor(() => expect(screen.getAllByText(/Historiador/).length).toBeGreaterThan(0), { timeout: 4_000 });

    expect(fetchTrampa).not.toHaveBeenCalled();
  });

  it("las cuatro pestañas están presentes, y elegir una navega a ese activo", async () => {
    cortarLaRed();
    const onNavigate = vi.fn();

    montar({ activo: "tanque" }, onNavigate);

    await waitFor(() => expect(screen.getByRole("tablist")).toBeTruthy(), { timeout: 4_000 });

    const pestañas = screen.getAllByRole("tab");
    expect(pestañas.map((p) => p.textContent)).toEqual(["Tanque", "Bombeo", "Distribución", "Eléctrico"]);

    fireEvent.click(screen.getByRole("tab", { name: "Bombeo" }));
    expect(onNavigate).toHaveBeenCalledWith("eva-detalle", { activo: "bombeo" });
  });
});
