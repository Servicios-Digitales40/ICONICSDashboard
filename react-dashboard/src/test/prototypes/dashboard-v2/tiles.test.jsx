// @vitest-environment jsdom
/**
 * tiles.test.jsx
 * ------------------------------------------------------------------
 * Los tiles de la propuesta v2 RENDERIZADOS con el modelo de un servidor
 * caído, más el caso normal con la fuente demo.
 *
 * Mismo criterio que `dashboardTiles.test.jsx` de producción: la capa de
 * render nunca queda cubierta por las pruebas del modelo. Aquí, además,
 * cada tile tenía su propio `.toFixed()` sobre agregados que ahora pueden
 * ser null — el fallo habría sido una pantalla en blanco al abrir
 * «Planta · v2» sin conexión.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createMachine } from "@/lib/domain/index.js";
import { listMachines } from "@/lib/iconics/tagCatalog.js";
import { machinesDemo } from "../../fixtures/machinesDemo.js";
import { ThemeProvider } from "@/theme";
import { THEMES } from "@/theme/themes.js";
import { buildV2Model } from "@/prototypes/dashboard-v2/model.js";
import {
  BandaKpis, EstadoYParos, FranjaAtencion, HeroeOee, ParetoRechazos, RejillaMaquinas,
} from "@/prototypes/dashboard-v2/tiles.jsx";

afterEach(cleanup);

const t = THEMES.light;
const noop = () => {};

const modeloMuerto = () =>
  buildV2Model(listMachines().map((m) => createMachine({ ...m, readings: {} })));

const pintar = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe("v2 · tiles con servidor caído", () => {
  it("todos los tiles renderizan sin reventar", () => {
    const m = modeloMuerto();

    expect(() =>
      pintar(
        <>
          <FranjaAtencion atencion={m.atencion} t={t} dark={false} onNavigate={noop} />
          <BandaKpis s={m.resumen} series={m.series} areas={m.areas} t={t} dark={false} />
          <HeroeOee s={m.resumen} series={m.series} tendencia={m.tendencia} t={t} />
          <RejillaMaquinas areas={m.areas} t={t} dark={false} onNavigate={noop} />
          <EstadoYParos s={m.resumen} areas={m.areas} t={t} dark={false} />
          <ParetoRechazos pareto={m.pareto} scrapArea={m.scrapArea} t={t} />
        </>
      )
    ).not.toThrow();
  });

  it("enseña huecos y avisos, no ceros plausibles", () => {
    const m = modeloMuerto();
    pintar(
      <>
        <BandaKpis s={m.resumen} series={m.series} areas={m.areas} t={t} dark={false} />
        <HeroeOee s={m.resumen} series={m.series} tendencia={m.tendencia} t={t} />
        <EstadoYParos s={m.resumen} areas={m.areas} t={t} dark={false} />
        <ParetoRechazos pareto={m.pareto} scrapArea={m.scrapArea} t={t} />
      </>
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("10 sin dato")).toBeTruthy();
    expect(screen.getByText(/sin lecturas de tiempo muerto/i)).toBeTruthy();
    expect(screen.getByText(/sin rechazos registrados/i)).toBeTruthy();
    // Ni un «0.0 %» afirmado donde no hubo medición.
    expect(screen.queryByText("0.0 %")).toBeNull();
  });

  it("las celdas de máquina dicen «Sin dato», nunca «Operando» por defecto", () => {
    const m = modeloMuerto();
    pintar(<RejillaMaquinas areas={m.areas} t={t} dark={false} onNavigate={noop} />);

    expect(screen.getAllByText("Sin dato")).toHaveLength(10);
    expect(screen.queryByText("Operando")).toBeNull();
  });
});

describe("v2 · tiles con la fuente demo", () => {
  it("renderiza el caso normal completo", () => {
    const m = buildV2Model(machinesDemo());

    expect(() =>
      pintar(
        <>
          <FranjaAtencion atencion={m.atencion} t={t} dark={false} onNavigate={noop} />
          <BandaKpis s={m.resumen} series={m.series} areas={m.areas} t={t} dark={false} />
          <HeroeOee s={m.resumen} series={m.series} tendencia={m.tendencia} t={t} />
          <RejillaMaquinas areas={m.areas} t={t} dark={false} onNavigate={noop} />
          <EstadoYParos s={m.resumen} areas={m.areas} t={t} dark={false} />
          <ParetoRechazos pareto={m.pareto} scrapArea={m.scrapArea} t={t} />
        </>
      )
    ).not.toThrow();

    // La rejilla habla el idioma de planta: Lineales y Multis reales.
    // `getAllByText`: un mismo equipo puede salir en la rejilla Y en la
    // franja de atención a la vez, y eso es correcto.
    expect(screen.getAllByText("Lineal 7").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Multi 13").length).toBeGreaterThan(0);
  });
});
