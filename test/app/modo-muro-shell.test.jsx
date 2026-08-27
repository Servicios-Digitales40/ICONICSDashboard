// @vitest-environment jsdom
/**
 * modo-muro-shell.test.jsx
 * ------------------------------------------------------------------
 * Plan 13, Fase 8 (F8): que `?muro=1` de verdad cambie lo que se ve —
 * `modo-muro.test.js` prueba la lógica de `leerModoMuro`/`useRotacionMuro`
 * aislada; esto prueba que `Shell` (`app/App.jsx`) la aplica: sin barra
 * lateral, sin los controles pulsables del Topbar, con el tema activo
 * seguro sin importar cuál.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import App from "@/app/App.jsx";

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

describe("modo muro, aplicado por Shell", () => {
  it("sin ?muro=1: la barra lateral y los controles del Topbar están, como siempre", async () => {
    irA("/eva-inicio");
    render(<App />);

    expect(await screen.findByRole("navigation", { name: "Navegación principal" })).toBeTruthy();
    expect(screen.getByLabelText(/^Tema:/)).toBeTruthy();
  });

  it("con ?muro=1: no hay barra lateral ni controles pulsables en el Topbar", async () => {
    irA("/eva-inicio?muro=1");
    render(<App />);

    // Algo de la página tiene que haber montado antes de afirmar la ausencia
    // — si no, "no hay sidebar" podría ser "nada ha montado todavía".
    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByRole("navigation", { name: "Navegación principal" })).toBeNull();
    expect(screen.queryByLabelText(/^Tema:/)).toBeNull();
    expect(screen.queryByLabelText(/^Origen de datos:/)).toBeNull();
  });

  it("con ?muro=1, el contenedor raíz lleva la escala pedida", async () => {
    // `container.firstChild` no es el nodo del propio Shell — ErrorBoundary
    // envuelve con un `<div style="display: contents">` que no aporta nada
    // que buscar; se localiza por el estilo en vez de por posición.
    irA("/eva-inicio?muro=1&escala=2");
    const { container } = render(<App />);
    await screen.findByRole("heading", { level: 1 });

    const raiz = container.querySelector('[style*="zoom"]');
    expect(raiz).toBeTruthy();
    expect(raiz.style.zoom).toBe("2");
  });

  it("sin ?muro=1, ningún elemento lleva zoom", async () => {
    irA("/eva-inicio");
    const { container } = render(<App />);
    await screen.findByRole("heading", { level: 1 });

    expect(container.querySelector('[style*="zoom"]')).toBeNull();
  });

  it("un ?muro= que no sea exactamente «1» no activa nada — la barra sigue ahí", async () => {
    irA("/eva-inicio?muro=true");
    render(<App />);

    expect(await screen.findByRole("navigation", { name: "Navegación principal" })).toBeTruthy();
  });
});
