// @vitest-environment jsdom
/**
 * casos-previos.test.jsx
 * ------------------------------------------------------------------
 * `CasosPrevios` — Plan 25 F0 (`NUE-04`).
 *
 * ── QUÉ SE PRUEBA AQUÍ, Y QUÉ NO ───────────────────────────────────
 *
 * NO se prueba que los casos similares se busquen bien: eso es del motor
 * (`ia/motor/casos.mjs`) y tiene su propio verificador. Aquí se prueba el
 * cableado —que se pide y se pinta— y sobre todo **lo que pasa cuando no hay
 * nada que pintar**, que es donde esta clase de componente miente.
 *
 * Las dos pruebas que de verdad importan son las de cero casos y la de error:
 * las dos tienen la tentación de escribir un «0», y un 0 aquí afirma «es la
 * primera vez que pasa» sobre un índice que puede estar vacío por tres motivos
 * distintos (§2.4).
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataSourceProvider } from "@/lib/datasource";
import { ThemeProvider } from "@/theme";

const { obtenerDiagnostico } = vi.hoisted(() => ({ obtenerDiagnostico: vi.fn() }));

vi.mock("@/lib/api/casosApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  obtenerDiagnostico,
}));

import { CasosPrevios } from "@/Demo-EVA/components/CasosPrevios.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const montar = (props = {}) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <CasosPrevios sistema="tanque" riesgoId="rebose" {...props} />
      </DataSourceProvider>
    </ThemeProvider>
  );

/** Un diagnóstico con `n` casos citados en su primera causa. */
const conCasos = (n) =>
  obtenerDiagnostico.mockResolvedValue({
    causas: [
      {
        id: "valvula-atascada",
        casosCitados: Array.from({ length: n }, (_, i) => ({
          id: `c${i}`,
          fecha: "2026-09-01",
          resuelto: true,
          resumen: "La válvula no cerró",
        })),
      },
    ],
  });

describe("cuando hay casos previos, se dicen", () => {
  it("un solo caso se cuenta en singular", async () => {
    conCasos(1);
    montar();

    await waitFor(() => expect(screen.getByText(/Ya pasó 1 vez antes/)).toBeTruthy());
  });

  it("varios casos se cuentan en plural", async () => {
    conCasos(3);
    montar();

    await waitFor(() => expect(screen.getByText(/Ya pasó 3 veces antes/)).toBeTruthy());
  });

  it("pide el diagnóstico del sistema y riesgo que se le dan, sin traducir", async () => {
    conCasos(2);
    montar({ sistema: "vibraciones", riesgoId: "desalineacion" });

    await waitFor(() => expect(obtenerDiagnostico).toHaveBeenCalled());
    const [args] = obtenerDiagnostico.mock.calls[0];
    expect(args.sistema).toBe("vibraciones");
    expect(args.riesgoId).toBe("desalineacion");
  });
});

describe("cuando NO hay casos, no se inventa un cero", () => {
  it("con cero casos no pinta nada — «0 veces» diría «es la primera vez»", async () => {
    /*
     * La prueba central de este componente. El índice de casos puede estar
     * vacío porque nunca pasó, porque nadie ha cerrado un caso, o porque no se
     * ha construido: son tres cosas y desde aquí se ven igual. Un contador a
     * cero elegiría una de las tres y la afirmaría.
     */
    conCasos(0);
    const { container } = montar();

    await waitFor(() => expect(obtenerDiagnostico).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    expect(screen.queryByText(/0/)).toBeNull();
  });

  it("un riesgo huérfano (sin causas) tampoco cuenta nada", async () => {
    // `huerfano: true` viene sin `causas`; el componente no puede reventar ahí.
    obtenerDiagnostico.mockResolvedValue({ huerfano: true, causas: [] });
    const { container } = montar();

    await waitFor(() => expect(obtenerDiagnostico).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("con el ORIGEN SIMULADO no pregunta siquiera", async () => {
    /*
     * El índice de casos vive en el servidor y no tiene versión simulada, así
     * que con el simulador encendido no hay a quién preguntar.
     *
     * Esta prueba existe porque el componente se escribió SIN la guarda y la
     * cazó `vibraciones-simulada.test.jsx`, que corta la red. El modo de fallo
     * era invisible —la tarjeta se pintaba igual, porque el error se traga a
     * propósito— y lo único que ocurría es que el tablero simulado llamaba a un
     * servidor que no estaba. Es el fallo que `DataSourceProvider` nombra en su
     * cabecera: «alguno pegando al servidor con el simulador encendido».
     */
    vi.stubEnv("VITE_ICONICS_FAKE", "true");
    conCasos(3);

    const { container } = montar();

    await waitFor(() => expect(container.textContent).toBe(""));
    expect(obtenerDiagnostico).not.toHaveBeenCalled();
  });

  it("montado SIN proveedor de origen tampoco pregunta: «no lo sé» no toca la red", async () => {
    /*
     * Las tarjetas de riesgo se montan sueltas en las pruebas de idioma y de
     * vocabulario, sin el árbol de contextos. `useEsSimulado()` responde
     * «simulado» sin proveedor a propósito: si el defecto fuera «real», un
     * tablero montado sin declarar su origen llamaría al servidor de planta.
     */
    conCasos(3);

    render(
      <ThemeProvider>
        <CasosPrevios sistema="tanque" riesgoId="rebose" />
      </ThemeProvider>
    );

    await waitFor(() => expect(obtenerDiagnostico).not.toHaveBeenCalled());
  });

  it("si el diagnóstico falla, calla — no tapa la tarjeta ni escribe un cero", async () => {
    /*
     * Es una consulta auxiliar sobre una tarjeta que ya es útil sin ella. Un
     * error aquí no puede impedir que se lea el riesgo. Lo que NO puede hacer
     * es escribir «0 casos», que sería fingir que la consulta salió bien.
     */
    obtenerDiagnostico.mockRejectedValue(new Error("ERROR_MOTOR_SIN_MONTAR"));
    const { container } = montar();

    await waitFor(() => expect(obtenerDiagnostico).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
