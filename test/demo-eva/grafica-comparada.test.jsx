// @vitest-environment jsdom
/**
 * grafica-comparada.test.jsx
 * ------------------------------------------------------------------
 * Plan 13, Fase 6 (F3): «¿la presión cayó cuando cayó el caudal?», mirable
 * directamente en el Detalle. Se prueba contra el transporte SIMULADO real
 * —mismo criterio que `detalle-activo-simulada.test.jsx`— porque lo que
 * importa aquí es el cableado completo (selección → `useSeriesHistoricas` →
 * `combinarPorTolerancia`), no sólo la lógica pura, que ya tiene su propia
 * suite en `comparar.test.js`.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/EvaProvider.jsx";
import { GraficaComparada } from "@/Demo-EVA/components/detalle/GraficaComparada.jsx";
import { rangoSemana } from "@/Demo-EVA/data/historia.js";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function ConTema({ children }) {
  const { theme: t, dark } = useTheme();
  return children(t, dark);
}

const montar = (rango) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <EvaProvider>
          <ConTema>{(t, dark) => <GraficaComparada rango={rango} t={t} dark={dark} />}</ConTema>
        </EvaProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("selección de señales: los chips conmutan, con un techo según el modo", () => {
  it("arranca con Nivel y Presión activos, y las demás disponibles", () => {
    montar(rangoSemana());
    expect(screen.getByRole("button", { name: /Nivel/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Presión/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Temperatura/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("sin normalizar, un tercer chip no se activa: el techo es dos", () => {
    montar(rangoSemana());
    fireEvent.click(screen.getByRole("button", { name: /Temperatura/ }));
    expect(screen.getByRole("button", { name: /Temperatura/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("con «normalizar» activo, se pueden seleccionar hasta cuatro", () => {
    montar(rangoSemana());
    fireEvent.click(screen.getByLabelText("Normalizar a % de escala"));
    fireEvent.click(screen.getByRole("button", { name: /Temperatura/ }));
    fireEvent.click(screen.getByRole("button", { name: /Caudal/ }));
    expect(screen.getByRole("button", { name: /Temperatura/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Caudal/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("bajar de dos señales muestra el mensaje de mínimo, no una gráfica vacía", () => {
    montar(rangoSemana());
    fireEvent.click(screen.getByRole("button", { name: /Nivel/ }));
    fireEvent.click(screen.getByRole("button", { name: /Presión/ }));
    expect(screen.getByText("Elige al menos dos señales para comparar.")).toBeTruthy();
  });

  it("desactivar «normalizar» con tres seleccionadas recorta a dos automáticamente al elegir de nuevo", () => {
    // No hace falta forzar el recorte retroactivo: basta con que, vuelto a
    // dos, el techo vuelva a aplicar. Lo que se protege es que el techo
    // (`maxSeleccion`) reacciona al modo actual, no al de cuando se eligió.
    montar(rangoSemana());
    fireEvent.click(screen.getByLabelText("Normalizar a % de escala"));
    fireEvent.click(screen.getByRole("button", { name: /Temperatura/ }));
    fireEvent.click(screen.getByLabelText("Normalizar a % de escala")); // vuelve a desactivar
    fireEvent.click(screen.getByRole("button", { name: /Caudal/ }));
    // Con 3 ya seleccionadas (Nivel, Presión, Temperatura) y el techo en 2,
    // Caudal no entra.
    expect(screen.getByRole("button", { name: /Caudal/ }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("los mensajes de estado, antes de que exista una gráfica que mostrar", () => {
  it("sin rango (modo vivo), pide elegir uno — no intenta leer el búfer en vivo", () => {
    montar(null);
    expect(screen.getByText(/Elige un rango de tiempo/)).toBeTruthy();
  });

  it("con rango, la leyenda eventualmente dice qué señal va en qué eje", () => {
    // "Nivel" ya está probado por el chip (arriba); aquí lo específico de la
    // leyenda es la etiqueta de eje, que sólo aparece una vez montada la
    // gráfica de verdad — antes de eso sólo están los chips y el mensaje de carga.
    montar(rangoSemana());
    return waitFor(
      () => {
        expect(screen.getByText(/eje izquierdo/)).toBeTruthy();
        expect(screen.getByText(/eje derecho/)).toBeTruthy();
      },
      { timeout: 4_000 }
    );
  });
});
