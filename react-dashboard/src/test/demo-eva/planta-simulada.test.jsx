// @vitest-environment jsdom
/**
 * planta-simulada.test.jsx
 * ------------------------------------------------------------------
 * La vista de Planta de Demo EVA con el origen **Simulado**, de punta a punta y
 * con la red cortada.
 *
 * ── POR QUÉ ESTA PRUEBA, Y NO SÓLO LAS DEL SIMULADOR ───────────────
 *
 * `simulador.test.js` comprueba el modelo y `fuente.test.js` el camino de datos,
 * pero los dos se saltan lo que de verdad falló durante meses: que la pantalla
 * quedaba **entera sin dato** al pulsar «Simulado», porque el transporte falso
 * sólo conocía el árbol de Resonac. Ninguna prueba de unidad podía verlo, porque
 * cada pieza por separado estaba bien.
 *
 * Así que aquí se monta la vista real sobre el provider real, con el interruptor
 * en simulado, y se comprueba lo único que importa: **que se ven las ocho
 * señales**.
 *
 * ── `fetch` SE SUSTITUYE POR UNA TRAMPA, NO POR UN DOBLE ───────────
 *
 * No devuelve una respuesta de mentira: lanza. El compromiso del origen simulado
 * es que se pueda trabajar la interfaz sin servidor y sin red, y un doble
 * silencioso dejaría pasar una gráfica que sigue saliendo a pedir el histórico
 * — que es exactamente el segundo agujero que tapó el Plan 9.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import PlantaEva from "@/Demo-EVA/views/PlantaEva.jsx";

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
  // de señales con lectura dejaría de ser determinista. Que `none` sea de verdad
  // cero fallos lo prueba `lib/iconics/caos.test.js`.
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

const montar = () =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <PlantaEva onNavigate={() => {}} />
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("Demo EVA en modo simulado", () => {
  it("pinta las ocho señales con lectura, sin tocar la red", async () => {
    const fetchTrampa = cortarLaRed();

    montar();

    // «8 señales · 8 con lectura» es el rótulo de la tarjeta de estado. Si el
    // simulador no conociera este árbol, serían 8 y 0.
    await waitFor(
      () => expect(screen.getByText(/8 señales · 8 con lectura/)).toBeTruthy(),
      { timeout: 4_000 }
    );

    expect(fetchTrampa).not.toHaveBeenCalled();
  });

  it("el histórico lo sirve el simulador, no una petición que falla en silencio", async () => {
    /*
     * El histórico no pasa por el transporte en modo real —vive en
     * `data/historia.js`— así que es la pieza que más fácil se queda atada al
     * servidor, y la que se quedaba: `useSeriesHistoricas` traga el fallo de red
     * (`.catch(() => ({ datos: [] }))`) para que una gráfica caída no tumbe la
     * página. El rótulo desaparecería igual con la petición reventando.
     *
     * De ahí que la aserción que cuenta sea la de la trampa: no basta con que la
     * gráfica deje de decir «leyendo», hace falta que NADIE haya llamado.
     */
    const fetchTrampa = cortarLaRed();

    montar();

    await waitFor(
      () => expect(screen.queryByText(/Leyendo el historiador/)).toBeNull(),
      { timeout: 4_000 }
    );

    expect(fetchTrampa).not.toHaveBeenCalled();
  });
});
