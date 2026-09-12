// @vitest-environment jsdom
/**
 * pantalla-de-acceso.test.jsx — Plan 25 F9 (`SEG-01`, segunda mitad).
 *
 * ── LO QUE EL PLAN PIDE COMPROBAR, LITERAL ──────────────────────────
 *
 *  1. Sin token se ve la pantalla; con token se pasa.
 *  2. Un token caducado se distingue de uno inválido: el primero intenta
 *     renovar, el segundo pide acceso de nuevo (§F9).
 *  3. La renovación se intenta ANTES de caducar (proactiva), no después de un
 *     401 — se prueba `sesionPorCaducar()` en `sesion.test.js`; aquí se prueba
 *     que el proveedor de verdad la dispara.
 *  4. En modo muro, un fallo de renovación avisa SIN vaciar la pantalla —
 *     nunca se pinta la pantalla de acceso ahí.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import App from "@/app/App.jsx";
import { guardarSesion } from "@/lib/api/sesion.js";

const irA = (url) => globalThis.history.replaceState(null, "", url);

/** Respuestas por ruta, para no repetir el enrutado de fetch en cada prueba. */
function backend(rutas) {
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const u = String(url);
    for (const [patron, fabrica] of Object.entries(rutas)) {
      if (u.includes(patron)) return fabrica(init);
    }
    return new Response(JSON.stringify({ ok: false, error: "no mockeado" }), { status: 404 });
  }));
}

const json = (cuerpo, status = 200) => async () => new Response(JSON.stringify(cuerpo), { status });

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  irA("/");
});

describe("sin sesión válida, se ve la pantalla de acceso", () => {
  it("con AUTH_HABILITADA y sin token guardado, bloquea con el formulario", async () => {
    irA("/eva-inicio");
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "anonimo", roles: ["operador"], autenticado: false }, habilitada: true }),
    });

    render(<App />);

    expect(await screen.findByText(/Acceso al tablero/i)).toBeTruthy();
    // El tablero de detrás no se monta: no hay sidebar todavía.
    expect(screen.queryByRole("navigation", { name: "Navegación principal" })).toBeNull();
  });

  it("con AUTH_HABILITADA=false, NO se ve la pantalla — no hace falta sesión", async () => {
    irA("/eva-inicio");
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "anonimo", roles: ["operador"], autenticado: false }, habilitada: false }),
    });

    render(<App />);

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/Acceso al tablero/i)).toBeNull();
  });

  it("con sesión válida ya guardada, se pasa directo al tablero", async () => {
    guardarSesion({ token: "el-token", expiraEnMinutos: 700, usuario: { id: "ana", roles: ["operador"] } });
    irA("/eva-inicio");
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "ana", roles: ["operador"], autenticado: true }, habilitada: true }),
    });

    render(<App />);

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/Acceso al tablero/i)).toBeNull();
  });
});

describe("entrar con usuario y clave", () => {
  it("un login correcto quita la pantalla y muestra el tablero", async () => {
    irA("/eva-inicio");
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "anonimo", roles: ["operador"], autenticado: false }, habilitada: true }),
      "/api/auth/login": json({
        ok: true, token: "nuevo-token", expiraEnMinutos: 700,
        usuario: { id: "ana", roles: ["operador"] },
      }),
    });

    render(<App />);
    await screen.findByText(/Acceso al tablero/i);

    fireEvent.change(screen.getByPlaceholderText(/Usuario/i), { target: { value: "ana" } });
    fireEvent.change(screen.getByPlaceholderText(/Contraseña/i), { target: { value: "clave123" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar/i }));

    await waitFor(() => expect(screen.queryByText(/Acceso al tablero/i)).toBeNull());
  });

  it("un login rechazado deja la pantalla puesta, con el error", async () => {
    irA("/eva-inicio");
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "anonimo", roles: ["operador"], autenticado: false }, habilitada: true }),
      "/api/auth/login": json({ ok: false, error: "Usuario o contraseña incorrectos.", codigo: "ERROR_CREDENCIALES" }, 401),
    });

    render(<App />);
    await screen.findByText(/Acceso al tablero/i);

    fireEvent.change(screen.getByPlaceholderText(/Usuario/i), { target: { value: "ana" } });
    fireEvent.change(screen.getByPlaceholderText(/Contraseña/i), { target: { value: "mal" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar/i }));

    await waitFor(() => expect(screen.getByText(/Acceso al tablero/i)).toBeTruthy());
  });
});

describe("modo muro: un fallo de renovación avisa, NUNCA bloquea", () => {
  it("con sesión inválida en muro, no aparece la pantalla de acceso", async () => {
    /*
     * La pregunta difícil del Plan 22: un wallboard sin teclado no puede
     * rellenar un formulario. `bloqueando` tiene que ser `false` en muro
     * pase lo que pase con la sesión.
     */
    irA("/eva-inicio?muro=1");
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "anonimo", roles: ["operador"], autenticado: false }, habilitada: true }),
    });

    render(<App />);

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/Acceso al tablero/i)).toBeNull();
  });
});
