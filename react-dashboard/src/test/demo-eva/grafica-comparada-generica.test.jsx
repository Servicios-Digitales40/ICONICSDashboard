// @vitest-environment jsdom
/**
 * `GraficaComparada` y `SelectorRango` sirven a dos máquinas (Plan 42.5 D12):
 * reciben las comparables y el lector por props, y sólo caen a la fuente del
 * tanque cuando nadie les pasa uno. Aquí se montan SIN `EvaProvider`: si
 * alguno volviera a exigir la fuente del tanque por dentro, esta prueba
 * lanza al montar.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "@/theme";
import { GraficaComparada } from "@/Demo-EVA/components/detalle/GraficaComparada.jsx";
import { SelectorRango } from "@/Demo-EVA/components/detalle/SelectorRango.jsx";

const COMPARABLES = [
  { clave: "vRMS_S1", label: "Velocidad eficaz · S1", escala: { min: 0, max: 7.1 } },
  { clave: "vRMS_S2", label: "Velocidad eficaz · S2", escala: { min: 0, max: 7.1 } },
  { clave: "aRMS_S1", label: "Aceleración eficaz · S1", escala: null },
];

const T0 = Date.UTC(2026, 8, 21, 12, 0, 0);
const puntos = (base) => Array.from({ length: 6 }, (_, i) => ({ t: new Date(T0 + i * 60_000), valor: base + i }));

function ConTema({ children }) {
  const { theme, dark } = useTheme();
  return typeof children === "function" ? children({ t: theme, dark }) : children;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GraficaComparada con comparables y lector por props", () => {
  it("rotula los chips con `label`, arranca con las dos primeras y pide las series al lector que le pasan", async () => {
    const leerSeries = vi.fn(async (claves) =>
      Object.fromEntries(claves.map((c) => [c, { datos: puntos(1), motivo: null, hasMore: false, cobertura: null }])),
    );
    const rango = { inicio: new Date(T0), fin: new Date(T0 + 3_600_000) };

    render(
      <ThemeProvider>
        <ConTema>{({ t, dark }) => <GraficaComparada rango={rango} t={t} dark={dark} comparables={COMPARABLES} leerSeries={leerSeries} />}</ConTema>
      </ThemeProvider>,
    );

    for (const c of COMPARABLES) expect(screen.getAllByText(c.label).length).toBeGreaterThan(0);
    await waitFor(() => expect(leerSeries).toHaveBeenCalledTimes(1));
    expect(leerSeries.mock.calls[0][0]).toEqual(["vRMS_S1", "vRMS_S2"]);
    expect(screen.getByRole("button", { name: /Velocidad eficaz · S1/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Aceleración eficaz · S1/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("sin rango del historiador («Tiempo real») pide elegir uno y no llama al lector", () => {
    const leerSeries = vi.fn();
    render(
      <ThemeProvider>
        <ConTema>{({ t, dark }) => <GraficaComparada rango={null} t={t} dark={dark} comparables={COMPARABLES} leerSeries={leerSeries} />}</ConTema>
      </ThemeProvider>,
    );
    expect(screen.getByText(/Elige un rango de tiempo/)).toBeTruthy();
    expect(leerSeries).not.toHaveBeenCalled();
  });

  it("alternar un chip cambia la selección y vuelve a pedir", async () => {
    const leerSeries = vi.fn(async (claves) =>
      Object.fromEntries(claves.map((c) => [c, { datos: puntos(1), motivo: null, hasMore: false, cobertura: null }])),
    );
    const rango = { inicio: new Date(T0), fin: new Date(T0 + 3_600_000) };
    render(
      <ThemeProvider>
        <ConTema>{({ t, dark }) => <GraficaComparada rango={rango} t={t} dark={dark} comparables={COMPARABLES} leerSeries={leerSeries} />}</ConTema>
      </ThemeProvider>,
    );
    await waitFor(() => expect(leerSeries).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Velocidad eficaz · S2/ }));

    await waitFor(() => expect(leerSeries).toHaveBeenCalledTimes(2));
    expect(leerSeries.mock.calls[1][0]).toEqual(["vRMS_S1"]);
    expect(screen.getByText(/Elige al menos dos/)).toBeTruthy();
  });
});

describe("SelectorRango con el lector por props", () => {
  it("se monta sin la fuente del tanque y consulta los días con dato al lector que le pasan", async () => {
    const leerSerie = vi.fn(async () => ({ datos: puntos(1), motivo: null, hasMore: false, cobertura: null }));
    render(
      <ThemeProvider>
        <ConTema>
          {({ t }) => (
            <SelectorRango activo="vivo" onPreset={vi.fn()} onPersonalizado={vi.fn()} t={t} claveSonda="vRMS_S1" leerSerie={leerSerie} />
          )}
        </ConTema>
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Personalizado/i }));

    await waitFor(() => expect(leerSerie).toHaveBeenCalled());
    expect(leerSerie.mock.calls[0][0]).toBe("vRMS_S1");
    expect(leerSerie.mock.calls[0][1].inicio).toBeInstanceOf(Date);
  });
});
