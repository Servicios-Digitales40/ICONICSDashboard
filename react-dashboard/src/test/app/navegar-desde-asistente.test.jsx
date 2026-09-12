// @vitest-environment jsdom
/**
 * navegar-desde-asistente.test.jsx — Plan 25 F7 (`NUE-08`, la vuelta).
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 * Que el evento `EVENTO_NAVEGAR` —despachado por `navegarDesdeAsistente()`—
 * de verdad mueva la pantalla, y sobre todo, que un id de ruta que no existe
 * (el modelo alucinó, o el registro se desincronizó) NO rompa la aplicación:
 * se ignora en silencio, el mismo criterio que un evento de
 * `preguntaExterna.js` sin nadie escuchando.
 *
 * `navegacion-del-asistente.test.js` prueba el DOMINIO (qué ruta le
 * corresponde a qué herramienta) de forma aislada. Esto prueba el TRANSPORTE:
 * que el evento llega hasta `navigate()` de verdad.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { act } from "react-dom/test-utils";

import App from "@/app/App.jsx";
import { EVENTO_NAVEGAR, navegarDesdeAsistente } from "@/features/asistente/lib/navegarDesdeAsistente.js";

const irA = (url) => globalThis.history.replaceState(null, "", url);

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  irA("/");
});

describe("una navegación con ruta VÁLIDA mueve la pantalla", () => {
  it("navegarDesdeAsistente(...) hace que App muestre la pantalla pedida", async () => {
    irA("/eva-inicio");
    render(<App />);
    await screen.findByRole("heading", { level: 1 });

    act(() => {
      navegarDesdeAsistente("eva-riesgos");
    });

    await waitFor(() => {
      expect(globalThis.location.pathname).toContain("eva-riesgos");
    });
  });

  it("los params viajan a la URL — el cierre de diagnóstico recibe su riesgoId", async () => {
    irA("/eva-inicio");
    render(<App />);
    await screen.findByRole("heading", { level: 1 });

    act(() => {
      navegarDesdeAsistente("cierre-diagnostico", { sistema: "tanque", riesgoId: "derrame" });
    });

    await waitFor(() => {
      expect(globalThis.location.search).toContain("riesgoId=derrame");
    });
  });
});

describe("una ruta que NO EXISTE no rompe la aplicación", () => {
  it("un id inventado se ignora: la pantalla se queda donde estaba", async () => {
    irA("/eva-inicio");
    render(<App />);
    await screen.findByRole("heading", { level: 1 });

    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_NAVEGAR, { detail: { ruta: "esto-no-existe" } }));
    });

    // Nada revienta, y la URL sigue siendo la de antes.
    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.location.pathname).toContain("eva-inicio");
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("un evento sin `ruta` (detail vacío) tampoco revienta", async () => {
    irA("/eva-inicio");
    render(<App />);
    await screen.findByRole("heading", { level: 1 });

    expect(() => {
      act(() => {
        window.dispatchEvent(new CustomEvent(EVENTO_NAVEGAR, { detail: {} }));
      });
    }).not.toThrow();
  });
});
