// @vitest-environment jsdom
/**
 * topbar-estado-maquina.test.jsx
 * ------------------------------------------------------------------
 * Que el indicador de encendido del Topbar sólo salga en las pestañas de
 * SU máquina.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 * `EstadoMaquinaBanner` lee `ac:TDCON/DEMO/SENSORES/CONTROL`, que es el tag
 * de la bomba del TANQUE. Nació cuando toda la aplicación era la estación de
 * llenado y «la máquina» no era ambiguo; desde que la planta se partió en dos
 * sistemas, el mismo indicador junto al título de una pantalla de vibraciones
 * afirma «Encendida» sobre una instalación que no es la que se está mirando.
 *
 * Es el cruce que la separación en secciones existe para impedir, y el Topbar
 * es el peor sitio para cometerlo: se lee como contexto de todo lo que hay
 * debajo. La regresión además es silenciosa —el indicador funciona, el dato
 * es real, sólo es de otra máquina—, así que no hay nada que la delate
 * mirando la pantalla.
 *
 * La condición vive en el Topbar y sale del registro de rutas
 * (`SECCION_DE_PAGINA`), no de una lista de ids escrita a mano: por eso el
 * último caso comprueba que una pantalla NUEVA de vibraciones heredaría la
 * respuesta correcta sin tocar nada.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { Topbar } from "@/app/layout/Topbar.jsx";
import { SECCION_DE_PAGINA } from "@/app/routes/index.js";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
  // El indicador lee su punto por `fetch`; se le da la bomba ENCENDIDA para
  // que, de pintarse, sea inconfundible.
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, payload: { value: true, quality: 0 } }),
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const montar = (page) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <Topbar page={page} onAbrirMenu={() => {}} onAbrirAlarmas={() => {}} />
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("Topbar: el indicador de encendido es de UNA máquina", () => {
  it("en las pantallas de la estación de llenado, se ve", async () => {
    montar("eva-planta");
    await waitFor(() => {
      expect(screen.getByText(/Encendida|Apagada/i)).toBeTruthy();
    });
  });

  it("en las pantallas de vibraciones, NO se ve", async () => {
    montar("eva-vibraciones");

    // Se espera a que el Topbar termine de pintar antes de afirmar la
    // ausencia: comprobarla sobre un árbol a medio montar la daría por buena
    // aunque el indicador entrara un instante después.
    await screen.findByText(/Gráficas/i);
    expect(screen.queryByText(/Encendida|Apagada/i)).toBeNull();
  });

  it("tampoco en «Riesgos» de vibraciones, que es donde se vio el fallo", async () => {
    montar("eva-riesgos-vibracion");
    await screen.findByText(/Riesgos/i);
    expect(screen.queryByText(/Encendida|Apagada/i)).toBeNull();
  });

  it("en las pantallas generales tampoco: Alarmas y Assets son de las dos", async () => {
    // Un indicador de «la máquina» junto al título de una pantalla que habla
    // de las dos elegiría una sin decirlo.
    montar("eva-alarmas");
    await screen.findByText(/Alarmas/i);
    expect(screen.queryByText(/Encendida|Apagada/i)).toBeNull();
  });

  it("la sección sale del registro, así que una vista nueva no hereda la respuesta del tanque", () => {
    // Si esta condición se implementara con una lista de ids escrita a mano,
    // una pantalla añadida a vibraciones caería fuera de la lista y el
    // indicador volvería a aparecer donde no debe.
    expect(SECCION_DE_PAGINA["eva-planta"]).toBe("sec-llenado");
    expect(SECCION_DE_PAGINA["eva-vibraciones"]).toBe("sec-vibraciones");
    expect(SECCION_DE_PAGINA["eva-riesgos-vibracion"]).toBe("sec-vibraciones");
    expect(SECCION_DE_PAGINA["eva-alarmas"]).toBe("sec-general");

    // `eva-detalle` no está en el sidebar: sin `nav` no tiene sección, y el
    // indicador tampoco debe darla por supuesta.
    expect(SECCION_DE_PAGINA["eva-detalle"]).toBeNull();
  });
});
