// @vitest-environment jsdom
/**
 * inicio-simulada.test.jsx
 * ------------------------------------------------------------------
 * La landing «Inicio» (`views/tanque/InicioTanque.jsx`), con el origen **Simulado**:
 * mismo criterio que el resto de las pruebas `*-simulada` — montar la vista
 * real sobre el provider real, sin red, y comprobar lo que de verdad importa
 * para la puerta de la demo: que la cifra en vivo llega, que las cuatro
 * vistas están todas presentes como entradas, y que cada una navega a donde
 * dice que navega.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/EvaProvider.jsx";
import InicioTanque from "@/Demo-EVA/views/tanque/InicioTanque.jsx";

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

const montar = (onNavigate = () => {}) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <EvaProvider>
          <InicioTanque onNavigate={onNavigate} />
        </EvaProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("Inicio (landing) en modo simulado", () => {
  it("llega a 8/8 señales con lectura, sin tocar la red", async () => {
    const fetchTrampa = cortarLaRed();

    montar();

    await waitFor(() => expect(screen.getByText("/ 8")).toBeTruthy(), { timeout: 4_000 });
    expect(fetchTrampa).not.toHaveBeenCalled();
  });

  it("las tres vistas están presentes como tarjetas, ya desde el primer render", () => {
    cortarLaRed();

    montar();

    // «Máquina 3D» se retiró y las otras dos se renombraron —«Planta» pasó a
    // «Gráficas» y «Maqueta 3D» a «Vista 3D»— cuando el sidebar se partió por
    // sistema. Los ids NO cambiaron: lo que se toca aquí es cómo se llaman en
    // pantalla, no a dónde llevan.
    for (const nombre of ["Gráficas", "Vista 3D", "Assets"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${nombre}`) })).toBeTruthy();
    }
  });

  it("el CTA entra a Gráficas, y cada tarjeta navega a su propia vista", () => {
    cortarLaRed();
    const onNavigate = vi.fn();

    montar(onNavigate);

    fireEvent.click(screen.getByRole("button", { name: /Entrar a Gráficas/ }));
    expect(onNavigate).toHaveBeenCalledWith("eva-planta");

    fireEvent.click(screen.getByRole("button", { name: /^Assets/ }));
    expect(onNavigate).toHaveBeenCalledWith("eva-assets");

    fireEvent.click(screen.getByRole("button", { name: /^Vista 3D/ }));
    expect(onNavigate).toHaveBeenCalledWith("eva-maqueta");
  });
});
