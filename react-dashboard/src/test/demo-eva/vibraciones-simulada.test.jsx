// @vitest-environment jsdom
/**
 * vibraciones-simulada.test.jsx
 * ------------------------------------------------------------------
 * Las pantallas del SISTEMA DE VIBRACIONES con el origen **Simulado**, de punta
 * a punta y con la red cortada.
 *
 * ── POR QUÉ ESTA PRUEBA, Y NO SÓLO LAS DEL SIMULADOR ───────────────
 *
 * Es la misma prueba que `planta-simulada.test.jsx` hace para el tanque, y por
 * el mismo motivo — sólo que aquí el fallo que tapa era peor. `useVibracion`
 * salía SIEMPRE a `fetchIconicsBatch` sin mirar el interruptor de origen, así
 * que con «Simulado» puesto la sección entera quedaba muda: setenta y tres
 * puntos sin lectura, todas las reglas sin comprobar y una cinta de «la máquina
 * no está contestando» encendida para siempre.
 *
 * Ninguna prueba de unidad podía verlo. `simulador-vibraciones.test.js` habría
 * seguido en verde con el hook sin enchufar, porque el modelo estaba bien; lo
 * que faltaba era el cable.
 *
 * ── `fetch` SE SUSTITUYE POR UNA TRAMPA, NO POR UN DOBLE ───────────
 *
 * No devuelve una respuesta de mentira: lanza. El compromiso del origen
 * simulado es que se pueda trabajar la interfaz sin servidor y sin red, y un
 * doble silencioso dejaría pasar una pantalla que sigue saliendo a pedir.
 *
 * ── POR QUÉ NO SE FIJA UN INSTANTE ─────────────────────────────────
 *
 * Porque las dos afirmaciones de aquí valen en CUALQUIER punto del ciclo, a
 * propósito. La máquina simulada se para dos minutos de cada diez y entonces se
 * callan treinta de sus setenta y tres puntos —el variador entero y todos los
 * `vRMS`, tal y como se midió el 26-08-2026—, pero los acelerómetros siguen
 * midiendo. Una prueba que sólo pasara con el motor en marcha no distinguiría
 * «la sección lee del simulador» de «la sección tuvo suerte con el reloj».
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import Vibraciones from "@/Demo-EVA/views/vibraciones/Vibraciones.jsx";
import RiesgosVibracion from "@/Demo-EVA/views/vibraciones/RiesgosVibracion.jsx";

/** Cualquier salida a la red es un fallo de esta prueba, no un caso a doblar. */
function cortarLaRed() {
  const trampa = vi.fn(() => {
    throw new Error("el origen simulado no debe salir a la red");
  });
  globalThis.fetch = trampa;
  return trampa;
}

beforeEach(() => {
  // El transporte inicial sale del build; se pide el simulado.
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  // Sin caos: con `soft` habría huecos y mala calidad a propósito, y el conteo
  // de puntos con lectura dejaría de ser determinista.
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

const montar = (Vista) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <Vista />
      </DataSourceProvider>
    </ThemeProvider>
  );

/**
 * La sección de vibraciones NO cuelga de `EvaProvider`: `useVibracion` monta su
 * propio sondeo porque es otra máquina, con otro PLC (ver la cabecera de
 * `data/vibraciones/vibracion.js`). Que aquí no haya que envolverla en ese provider no es
 * un descuido de la prueba — es la separación entre las dos instalaciones,
 * puesta por escrito.
 */

describe("el sistema de vibraciones en modo simulado", () => {
  it("los tres apoyos entregan lectura, sin tocar la red", async () => {
    const fetchTrampa = cortarLaRed();

    const { container } = montar(Vibraciones);

    // Las tres tarjetas de apoyo son los tres `<article>` de la vista. Un
    // apoyo sin lectura pinta guiones en sus cuatro medidas; con el simulador
    // enchufado, la aceleración y el pico tienen número en cualquier fase del
    // ciclo, porque se miden sin conocer la velocidad.
    await waitFor(
      () => {
        const tarjetas = [...container.querySelectorAll("article")];
        expect(tarjetas.length).toBe(3);
        for (const t of tarjetas) expect(t.textContent).toMatch(/\d+[.,]\d+/);
      },
      { timeout: 4_000 }
    );

    expect(fetchTrampa).not.toHaveBeenCalled();
  });

  it("no aparece la cinta de «la máquina no está contestando»", async () => {
    /*
     * Es la aserción que de verdad describe el fallo que esto arregla. Esa
     * cinta se enciende cuando más de la mitad de los puntos no entregan, y
     * era lo único que se veía en modo simulado. Con el simulador sirviendo la
     * máquina, el peor momento —el motor parado— deja treinta puntos mudos de
     * setenta y tres, así que la cinta no debe salir NUNCA.
     */
    cortarLaRed();

    const { container } = montar(Vibraciones);

    // Primero se espera a que haya lectura: antes de la primera respuesta la
    // cinta tampoco está —`loading` la mantiene apagada— y comprobarlo
    // entonces no probaría nada.
    await waitFor(
      () => expect(container.querySelector("article")?.textContent).toMatch(/\d+[.,]\d+/),
      { timeout: 4_000 }
    );

    expect(screen.queryByText(/La máquina no está contestando/)).toBeNull();
  });

  it("«Riesgos» evalúa reglas de verdad en vez de declararlas todas sin comprobar", async () => {
    const fetchTrampa = cortarLaRed();

    montar(RiesgosVibracion);

    /*
     * Con la sección muda, `evaluarRiesgosVibracion` no podía evaluar ninguna
     * regla que necesitara un número y la pantalla se quedaba en «no hay
     * lecturas con las que evaluar». Que haya riesgos ACTIVOS o una cuenta de
     * reglas comprobadas —las dos formas de la misma cosa— es lo que dice que
     * el simulador está entregando.
     */
    await waitFor(
      () => {
        const activos = screen.queryByText(/Situaciones detectadas · \d+/);
        const comprobadas = screen.queryByText(/reglas? comprobadas? con las lecturas actuales/);
        expect(activos ?? comprobadas).toBeTruthy();
      },
      { timeout: 4_000 }
    );

    expect(fetchTrampa).not.toHaveBeenCalled();
  });
});
