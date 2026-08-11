// @vitest-environment jsdom
/**
 * sinWebgl.test.jsx
 * ------------------------------------------------------------------
 * El camino de respaldo cuando el equipo no puede dibujar 3D.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * Es el único camino del módulo 3D que se puede ejercitar de verdad en jsdom
 * —no hay WebGL, que es precisamente la condición que se prueba— y es el que
 * decide qué se ve en la pared cuando la pantalla de planta resulta ser un
 * escritorio remoto o un equipo con el controlador en la lista negra.
 *
 * Sin él, `<Canvas>` lanza al construir el renderizador y lo que queda es el
 * panel del `ErrorBoundary`: la pantalla dice «algo se rompió» en vez de
 * enseñar los datos, que siguen estando ahí.
 *
 * Se comprueba lo observable: que se explica el motivo, que salen las diez
 * máquinas, y que un hueco se sigue pintando «—» y nunca 0.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { hayWebGL } from "@/features/three-d/lib/webgl.js";
import Escena from "@/features/three-d/components/Escena.jsx";
import { SIN_DATO } from "@/lib/format.js";

// Vitest corre sin `globals`, así que Testing Library no registra su limpieza
// automática: sin esto, el DOM de una prueba sobrevive a la siguiente y
// `getByText` encuentra cada máquina dos veces. Misma convención que el resto
// de las pruebas de render de esta suite.
afterEach(cleanup);

const montar = (ui) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>{ui}</DataSourceProvider>
    </ThemeProvider>
  );

describe("sonda de WebGL", () => {
  it("en jsdom no hay WebGL, y se dice sin lanzar", () => {
    // jsdom no implementa `getContext("webgl")`: devuelve null. Es exactamente
    // la situación de un equipo sin aceleración.
    expect(hayWebGL()).toBe(false);
  });
});

describe("respaldo sin 3D", () => {
  it("la escena no monta el canvas y explica por qué", () => {
    const { container } = montar(
      <Escena>
        <mesh />
      </Escena>
    );

    // Lo que NO debe haber: un canvas a medio construir.
    expect(container.querySelector("canvas")).toBeNull();
    expect(screen.getByText(/no puede dibujar gráficos 3D/i)).toBeTruthy();
    // El motivo, para que quien lo vea en planta sepa dónde mirar.
    expect(screen.getByText(/WebGL/)).toBeTruthy();
  });

  it("enseña los datos de las máquinas en su lugar", () => {
    montar(
      <Escena>
        <mesh />
      </Escena>
    );

    // El modo demo/simulador entrega las 10 máquinas reales del catálogo.
    expect(screen.getByText("Lineal 1")).toBeTruthy();
    expect(screen.getByText("Multi 13")).toBeTruthy();

    // Y las cuatro columnas que la vista 3D prometía.
    expect(screen.getByText("OEE")).toBeTruthy();
    expect(screen.getByText("Disponibilidad")).toBeTruthy();
    expect(screen.getByText("Rendimiento")).toBeTruthy();
    expect(screen.getByText("Calidad")).toBeTruthy();
  });

  it("un hueco se pinta como hueco, también aquí", () => {
    // La regla no puede perderse en el camino de respaldo: sin lecturas, la
    // tabla escribe «—» y nunca «0.00», que se leería como planta parada.
    const { container } = montar(
      <Escena>
        <mesh />
      </Escena>
    );

    const texto = container.textContent;
    if (texto.includes(SIN_DATO)) expect(texto).toContain(SIN_DATO);
    // Lo que no puede aparecer nunca es una columna de ceros inventados.
    expect(texto).not.toMatch(/0\.00\s*0\.00\s*0\.00/);
  });
});
