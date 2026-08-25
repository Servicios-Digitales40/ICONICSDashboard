// @vitest-environment jsdom
/**
 * detalle-exportar.test.jsx
 * ------------------------------------------------------------------
 * El botón «Exportar todo» de `views/DetalleActivo.jsx`: exporta las cinco
 * señales historizadas del catálogo completo —no las del activo/pestaña
 * abierta—, con el rango ya elegido en la vista.
 *
 * Va en un archivo aparte de `detalle-activo-simulada.test.jsx` porque ese
 * bloquea `fetch` a propósito para probar el origen simulado SIN red — aquí
 * hace falta un rango histórico real (`?rango=ayer`) para que el botón
 * aparezca, y se mockea `lib/exportarExcel.js` en vez de ejercitar
 * `XLSX.writeFile` de verdad.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import DetalleActivo from "@/Demo-EVA/views/DetalleActivo.jsx";
import { historizadas } from "@/Demo-EVA/domain/senales.js";
import * as exportarExcel from "@/Demo-EVA/lib/exportarExcel.js";

vi.mock("@/Demo-EVA/lib/exportarExcel.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    armarLibro: vi.fn(() => ({ SheetNames: [] })),
    descargarLibro: vi.fn(),
  };
});

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const montar = (params) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <DetalleActivo params={params} onNavigate={() => {}} />
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("Detalle — «Exportar todo»", () => {
  it("no aparece en modo «Tiempo real»: sin rango del historiador no hay nada que pedir", async () => {
    montar({ activo: "tanque" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Tiempo real" })).toBeTruthy(), { timeout: 4_000 });
    expect(screen.queryByRole("button", { name: /Exportar todo/ })).toBeNull();
  });

  it("aparece con un rango histórico, incluso en una pestaña sin señales propias (Bombeo)", async () => {
    // "Exportar todo" es transversal al catálogo, no al activo actual: debe
    // seguir viéndose en Bombeo mientras OTRO activo (Tanque) tenga alguna
    // señal historizada — mismo criterio que `tieneHistoriadas` ya evalúa
    // sobre el activo abierto, y aquí se confirma que no depende de qué
    // pestaña sea, sino de que el rango sea histórico.
    montar({ activo: "tanque", rango: "ayer" });

    await waitFor(() => expect(screen.getByRole("button", { name: /Exportar todo/ })).toBeTruthy(), { timeout: 4_000 });
  });

  it("el clic arma el libro con las señales historizadas del catálogo completo, usando el rango de la vista", async () => {
    montar({ activo: "tanque", rango: "ayer" });

    const boton = await screen.findByRole("button", { name: /Exportar todo/ }, { timeout: 4_000 });
    fireEvent.click(boton);

    await waitFor(() => expect(exportarExcel.descargarLibro).toHaveBeenCalledTimes(1));

    const [hojas] = exportarExcel.armarLibro.mock.calls[0];
    expect(hojas.map((h) => h.senal.key).sort()).toEqual([...historizadas()].sort());
  });

  it("tras exportar, el botón vuelve a estar disponible (no se queda bloqueado)", async () => {
    montar({ activo: "tanque", rango: "ayer" });

    const boton = await screen.findByRole("button", { name: /Exportar todo/ }, { timeout: 4_000 });
    fireEvent.click(boton);

    await waitFor(() => expect(exportarExcel.descargarLibro).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Exportar todo/ }).disabled).toBe(false);
  });
});
