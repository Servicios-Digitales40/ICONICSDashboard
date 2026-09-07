// @vitest-environment jsdom
/**
 * detalle-exportar.test.jsx
 * ------------------------------------------------------------------
 * El botón «Exportar todo» de `views/tanque/DetalleActivo.jsx`: exporta las cinco
 * señales historizadas del catálogo completo —no las del activo/pestaña
 * abierta—, con el rango ya elegido en la vista.
 *
 * Va en un archivo aparte de `detalle-activo-simulada.test.jsx` porque ese
 * bloquea `fetch` a propósito para probar el origen simulado SIN red — aquí
 * hace falta un rango histórico real (`?rango=ayer`) para que el botón
 * aparezca.
 *
 * Se mockean las dos piezas del camino de salida —`armarCSVGeneral` para
 * poder mirar QUÉ se exporta, y `descargarCSV` porque jsdom no implementa
 * `URL.createObjectURL`—. Lo que arma el texto tiene sus propias pruebas en
 * `exportarTodo.test.js`; aquí se comprueba el cableado de la vista.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/comunes/EvaProvider.jsx";
import DetalleActivo from "@/Demo-EVA/views/tanque/DetalleActivo.jsx";
import { historizadas } from "@/Demo-EVA/domain/senales.js";
import * as exportar from "@/Demo-EVA/lib/exportar.js";
import * as exportarTodo from "@/Demo-EVA/lib/exportarTodo.js";

vi.mock("@/Demo-EVA/lib/exportarTodo.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, armarCSVGeneral: vi.fn(() => "csv-de-mentira") };
});

vi.mock("@/Demo-EVA/lib/exportar.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, descargarCSV: vi.fn() };
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
        <EvaProvider>
          <DetalleActivo params={params} onNavigate={() => {}} />
        </EvaProvider>
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

  it("el clic arma el CSV con las señales historizadas del catálogo completo, usando el rango de la vista", async () => {
    montar({ activo: "tanque", rango: "ayer" });

    const boton = await screen.findByRole("button", { name: /Exportar todo/ }, { timeout: 4_000 });
    fireEvent.click(boton);

    await waitFor(() => expect(exportar.descargarCSV).toHaveBeenCalledTimes(1));

    const [series] = exportarTodo.armarCSVGeneral.mock.calls[0];
    expect(series.map((s) => s.senal.key).sort()).toEqual([...historizadas()].sort());
  });

  it("la cobertura de cada señal llega hasta el exportador: sin ella el archivo no puede declarar lo que falta", async () => {
    // Es el cableado que el .xlsx no tenía (Plan 22 F1): `leerSerie` ya
    // devolvía `cobertura`, y la exportación general la tiraba.
    montar({ activo: "tanque", rango: "ayer" });

    const boton = await screen.findByRole("button", { name: /Exportar todo/ }, { timeout: 4_000 });
    fireEvent.click(boton);

    await waitFor(() => expect(exportar.descargarCSV).toHaveBeenCalledTimes(1));

    const [series] = exportarTodo.armarCSVGeneral.mock.calls[0];
    expect(series.every((s) => "cobertura" in s)).toBe(true);
  });

  it("el archivo descargado es el .csv que nombra el rango, y lleva el texto que se armó", async () => {
    montar({ activo: "tanque", rango: "ayer" });

    const boton = await screen.findByRole("button", { name: /Exportar todo/ }, { timeout: 4_000 });
    fireEvent.click(boton);

    await waitFor(() => expect(exportar.descargarCSV).toHaveBeenCalledTimes(1));

    const [nombre, contenido] = exportar.descargarCSV.mock.calls[0];
    expect(nombre).toMatch(/^historico-general_.+\.csv$/);
    expect(contenido).toBe("csv-de-mentira");
  });

  it("tras exportar, el botón vuelve a estar disponible (no se queda bloqueado)", async () => {
    montar({ activo: "tanque", rango: "ayer" });

    const boton = await screen.findByRole("button", { name: /Exportar todo/ }, { timeout: 4_000 });
    fireEvent.click(boton);

    await waitFor(() => expect(exportar.descargarCSV).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Exportar todo/ }).disabled).toBe(false);
  });
});
