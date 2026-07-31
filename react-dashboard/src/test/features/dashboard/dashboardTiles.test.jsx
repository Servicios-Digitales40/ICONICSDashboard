// @vitest-environment jsdom
/**
 * dashboardTiles.test.jsx
 * ------------------------------------------------------------------
 * Los tiles del dashboard renderizados con el resumen de un SERVIDOR
 * CAÍDO: el que produce `buildPlantSummary` cuando ninguna máquina ha
 * entregado una sola lectura.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────
 *
 * Es la cuarta aparición del mismo patrón en este proyecto: se arregla
 * una capa (aquí, el rollup devolviendo null en vez de 0) y se da por
 * cubierta la de encima. Las tres anteriores llegaron a pantalla. Esta
 * prueba cierra la costura rollup → tiles ANTES de que la vea nadie:
 * comprueba que un resumen de nulls se pinta como huecos «—» y avisos,
 * nunca como «OEE 0.00 %» y «0 piezas producidas» — que se leen como una
 * planta parada, no como una planta sin conexión.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createMachine } from "@/lib/domain/index.js";
import { listMachines } from "@/lib/iconics/tagCatalog.js";
import { ThemeProvider } from "@/theme";
import { THEMES } from "@/theme/themes.js";
import { buildPlantSummary } from "@/features/dashboard/lib/plantModel.js";
import { DowntimeTiles, FactorGauges, KpiBand } from "@/features/dashboard/components/dashboardTiles.jsx";

afterEach(cleanup);

const t = THEMES.light;

/** El resumen exacto que ve el Dashboard con el servidor caído. */
const resumenMuerto = () =>
  buildPlantSummary(listMachines().map((m) => createMachine({ ...m, readings: {} })));

const pintar = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe("dashboard con servidor caído", () => {
  it("la banda de KPIs no afirma cero piezas ni cero por ciento", () => {
    pintar(<KpiBand s={resumenMuerto()} t={t} />);

    // Huecos visibles…
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    // …y ni un solo cero disfrazado de medición.
    expect(screen.queryByText("0.0 %")).toBeNull();
    expect(screen.queryByText("0.00 %")).toBeNull();

    // Tampoco el complemento fantasma: 100 − null es 100 en JavaScript, y
    // el tile de rechazadas llegó a poder decir «100.0 % del total».
    expect(screen.queryByText(/100\.0 %/)).toBeNull();
  });

  it("dice «sin dato», no «detenidas», de las máquinas que no hablaron", () => {
    pintar(<KpiBand s={resumenMuerto()} t={t} />);

    expect(screen.getByText("10 sin dato")).toBeTruthy();
    expect(screen.queryByText(/detenidas/)).toBeNull();
  });

  it("los cuatro gauges marcan hueco, sin aguja en el cero", () => {
    pintar(<FactorGauges s={resumenMuerto()} t={t} />);

    // Un «—» por gauge: OEE, disponibilidad, rendimiento y calidad.
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryByText("0.00")).toBeNull();
  });

  it("el tiempo muerto avisa en vez de repartir un porcentaje inventado", () => {
    pintar(<DowntimeTiles s={resumenMuerto()} t={t} />);

    expect(screen.getByText(/sin lecturas de tiempo muerto/i)).toBeTruthy();
    expect(screen.queryByText(/0 %/)).toBeNull();
  });

  it("con datos parciales sí muestra lo medido y calla lo demás", () => {
    // Una máquina habló, nueve no: el promedio es el de la que habló.
    const maquinas = listMachines().map((m, i) =>
      createMachine({
        ...m,
        readings: i === 0
          ? { disponibilidad: 80, rendimiento: 90, calidad: 95, aprobadas: 500, rechazadas: 50, estado: 1 }
          : {},
      })
    );

    pintar(<KpiBand s={buildPlantSummary(maquinas)} t={t} />);

    expect(screen.getByText("9 sin dato")).toBeTruthy();
    // Las 550 piezas de la única máquina medida sí se afirman.
    expect(screen.getByText("550")).toBeTruthy();
  });
});
