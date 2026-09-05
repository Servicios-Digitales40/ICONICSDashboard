// @vitest-environment jsdom
/**
 * Audita los paneles de Casos y Manuales con axe-core.
 * Esta suite cubre violaciones graves; no sustituye una revisión visual
 * de contraste ni la comprobación de teclado en un navegador real.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { auditarAccesibilidad } from "../../a11y.js";

import CajonCasos from "@/features/asistente/cajones/Casos.jsx";
import CajonManuales from "@/features/asistente/cajones/Manuales.jsx";

/** Los dos cajones piden su lista al montarse; se les da una vacía. */
function fetchVacio(url) {
  const cuerpo = String(url).includes("/api/casos")
    ? { ok: true, total: 0, casos: [] }
    : { ok: true, manuales: [], indice: { estado: "vacio", fragmentos: 0 } };

  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(fetchVacio));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("los cajones no tienen violaciones graves", () => {
  it.each([
    ["Casos", CajonCasos],
    ["Manuales", CajonManuales],
  ])("cajón %s", async (_nombre, Componente) => {
    const { container } = render(
      <ThemeProvider>
        <Componente />
      </ThemeProvider>
    );

    // Los dos pintan un estado de carga antes de tener datos; auditar ese
    // primer fotograma no diría nada del cajón de verdad.
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    /*
     * El arnés LANZA con el detalle de cada violación; no devuelve una lista.
     * Se le deja propagar a propósito: el mensaje que construye —regla, nodo y
     * enlace a la documentación— es mucho más útil que un `toEqual([])`
     * fallido, que sólo diría «esperaba vacío».
     */
    await auditarAccesibilidad(container);
  });
});
