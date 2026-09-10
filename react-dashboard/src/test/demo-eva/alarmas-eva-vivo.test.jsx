// @vitest-environment jsdom
/**
 * alarmas-eva-vivo.test.jsx
 * ------------------------------------------------------------------
 * La pestaña «En vivo» de Alarmas (Plan 27): el estado ahora mismo de las
 * ocho señales `naturaleza: "alarma"`, leído del sistema simulado — no de
 * `@/lib/iconics` como el Historial.
 *
 * Archivo APARTE de `alarmas-eva.test.jsx` a propósito: ese archivo mockea
 * el módulo entero `@/lib/iconics` (`fetchIconicsAlarms`, `fetchHealth`,
 * `acknowledgeIconicsAlarms`) para probar el Historial, y ese mock sustituye
 * TODO el módulo — incluido lo que necesita el transporte simulado
 * (`VITE_ICONICS_FAKE=true`) para esta pestaña. Montar aquí con
 * `params={{ tab: "vivo" }}` evita el conflicto: `HistorialAlarmas` nunca
 * llega a montarse, así que sus llamadas no entran en juego.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/comunes/EvaProvider.jsx";
import AlarmasEva from "@/Demo-EVA/views/comunes/AlarmasEva.jsx";

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
        <EvaProvider>
          <AlarmasEva params={params} onNavigate={onNavigate} />
        </EvaProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("Alarmas → En vivo: agrupado por activo, sin red", () => {
  it("abre en la pestaña En vivo con ?tab=vivo, y agrupa por activo", async () => {
    const fetchTrampa = cortarLaRed();
    montar({ tab: "vivo" });

    // Tanque tiene cuatro alarmas declaradas (nivel alto-alto/alto/bajo/bajo-bajo).
    await waitFor(() => expect(screen.getByText("NIVEL_ALTO_ALTO")).toBeTruthy());
    expect(screen.getByText("NIVEL_ALTO")).toBeTruthy();
    expect(screen.getByText("NIVEL_BAJO_BAJO")).toBeTruthy();
    expect(screen.getByText("NIVEL_BAJO")).toBeTruthy();
    // Distribución: presión alta, falta de presión, bajo flujo.
    expect(screen.getByText("PRESION_ALTA")).toBeTruthy();
    // Bombeo: falla del variador.
    expect(screen.getByText("FALLA_VARIADOR_DE_FRECUENCIA")).toBeTruthy();

    expect(fetchTrampa).not.toHaveBeenCalled();
  });

  it("un activo sin ninguna alarma en su catálogo (Eléctrico) no aparece en la lista", async () => {
    cortarLaRed();
    montar({ tab: "vivo" });

    await waitFor(() => expect(screen.getByText("NIVEL_ALTO_ALTO")).toBeTruthy());
    // «Eléctrico» aparece UNA sola vez: el chip de filtro. No tiene ninguna
    // señal `naturaleza: "alarma"` en el catálogo (a diferencia de Tanque,
    // Distribución y Bombeo), así que no debería llevar además un grupo
    // propio en la lista de abajo.
    expect(screen.getAllByText("Eléctrico")).toHaveLength(1);
  });

  it("?tab=vivo&activo=tanque filtra a un solo activo", async () => {
    cortarLaRed();
    montar({ tab: "vivo", activo: "tanque" });

    await waitFor(() => expect(screen.getByText("NIVEL_ALTO_ALTO")).toBeTruthy());
    // Filtrado a Tanque: ninguna alarma de Distribución o Bombeo debería verse.
    expect(screen.queryByText("PRESION_ALTA")).toBeNull();
    expect(screen.queryByText("FALLA_VARIADOR_DE_FRECUENCIA")).toBeNull();
  });

  it("el tab Historial sigue siendo el que arranca por defecto, sin params", async () => {
    cortarLaRed();
    montar(undefined);

    await waitFor(() => expect(screen.getByRole("tab", { name: /Historial/i })).toBeTruthy());
    expect(screen.getByRole("tab", { name: /Historial/i }).getAttribute("aria-selected")).toBe("true");
  });
});
