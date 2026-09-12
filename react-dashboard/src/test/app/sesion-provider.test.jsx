// @vitest-environment jsdom
/**
 * sesion-provider.test.jsx — Plan 25 F9 (`SEG-01`, segunda mitad).
 *
 * Prueba `SesionProvider` aislado, sin montar `<App/>` completo — más fácil de
 * controlar con temporizadores falsos para el ciclo de renovación proactiva.
 * `pantalla-de-acceso.test.jsx` prueba la integración con la app real.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import { SesionProvider, useSesion } from "@/app/providers/SesionProvider.jsx";
import { EVENTO_SESION_INVALIDA } from "@/lib/api/sesionInvalida.js";
import { guardarSesion } from "@/lib/api/sesion.js";

/** Expone el estado del provider en el DOM, para afirmarlo desde la prueba. */
function SondaDeSesion() {
  const { fase, usuario, avisoFalloRenovacion } = useSesion();
  return (
    <div>
      <span data-testid="fase">{fase}</span>
      <span data-testid="usuario">{usuario?.id ?? "—"}</span>
      <span data-testid="aviso">{String(avisoFalloRenovacion)}</span>
    </div>
  );
}

const json = (cuerpo, status = 200) => async () => new Response(JSON.stringify(cuerpo), { status });

function backend(rutas) {
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const u = String(url);
    for (const [patron, fabrica] of Object.entries(rutas)) {
      if (u.includes(patron)) return fabrica();
    }
    return new Response(JSON.stringify({ ok: false }), { status: 404 });
  }));
}

const montar = (enMuro = false) =>
  render(
    <SesionProvider enMuro={enMuro}>
      <SondaDeSesion />
    </SesionProvider>
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("verificación inicial", () => {
  it("mientras se pregunta a /api/auth/yo, la fase es «verificando»", () => {
    backend({ "/api/auth/yo": () => new Promise(() => {}) }); // nunca resuelve
    montar();
    expect(screen.getByTestId("fase").textContent).toBe("verificando");
  });

  it("sin AUTH_HABILITADA, la fase pasa a «resuelta» sin pedir nada", async () => {
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "anonimo", roles: ["operador"], autenticado: false }, habilitada: false }),
    });
    montar();
    await waitFor(() => expect(screen.getByTestId("fase").textContent).toBe("resuelta"));
  });

  it("con AUTH_HABILITADA y sin sesión, la fase es «pendiente»", async () => {
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "anonimo", roles: ["operador"], autenticado: false }, habilitada: true }),
    });
    montar();
    await waitFor(() => expect(screen.getByTestId("fase").textContent).toBe("pendiente"));
  });

  it("si /api/auth/yo falla del todo, se asume que hace falta acceso — el lado seguro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("red caída"); }));
    montar();
    await waitFor(() => expect(screen.getByTestId("fase").textContent).toBe("pendiente"));
  });
});

describe("un 401 CADUCADO intenta renovar; uno INVÁLIDO pide acceso", () => {
  it("caducado: dispara una renovación, y si sale bien vuelve a «resuelta»", async () => {
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "ana", roles: ["operador"], autenticado: true }, habilitada: true }),
      "/api/auth/renovar": json({ ok: true, token: "renovado", expiraEnMinutos: 700, usuario: { id: "ana", roles: ["operador"] } }),
    });
    guardarSesion({ token: "viejo", expiraEnMinutos: 700, usuario: { id: "ana" } });
    montar();
    await waitFor(() => expect(screen.getByTestId("fase").textContent).toBe("resuelta"));

    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_SESION_INVALIDA, { detail: { caducado: true } }));
    });

    await waitFor(() => expect(screen.getByTestId("usuario").textContent).toBe("ana"));
    // Sigue resuelta: la renovación funcionó, no hace falta pedir acceso.
    expect(screen.getByTestId("fase").textContent).toBe("resuelta");
  });

  it("inválido (no caducado): borra la sesión y pide acceso — NO intenta renovar", async () => {
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "ana", roles: ["operador"], autenticado: true }, habilitada: true }),
    });
    guardarSesion({ token: "manipulado", expiraEnMinutos: 700, usuario: { id: "ana" } });
    montar();
    await waitFor(() => expect(screen.getByTestId("fase").textContent).toBe("resuelta"));

    const renovarSpy = vi.fn();
    // Si intentara renovar, llamaría a fetch con /api/auth/renovar; se
    // comprueba que NO ocurre.
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/auth/renovar")) renovarSpy();
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });

    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_SESION_INVALIDA, { detail: { caducado: false } }));
    });

    await waitFor(() => expect(screen.getByTestId("fase").textContent).toBe("pendiente"));
    expect(renovarSpy).not.toHaveBeenCalled();
  });
});

describe("renovación proactiva: antes de caducar, no después", () => {
  it("con la sesión a punto de caducar, renueva SOLA sin que nadie la fuerce", async () => {
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "ana", roles: ["operador"], autenticado: true }, habilitada: true }),
      "/api/auth/renovar": json({ ok: true, token: "renovado", expiraEnMinutos: 700, usuario: { id: "ana", roles: ["operador"] } }),
    });
    // A 20 min de caducar — por debajo del umbral de 30.
    guardarSesion({ token: "por-caducar", expiraEnMinutos: 20, usuario: { id: "ana" } });

    montar();
    await waitFor(() => expect(screen.getByTestId("fase").textContent).toBe("resuelta"));

    // La revisión corre al llegar a «resuelta», sin esperar al intervalo:
    // el usuario tiene que quedar renovado sin que nadie dispare nada más.
    await waitFor(() => expect(screen.getByTestId("usuario").textContent).toBe("ana"));
  });

  it("con toda la vida por delante, NO renueva", async () => {
    const renovarSpy = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("/api/auth/yo")) {
        return new Response(JSON.stringify({ ok: true, usuario: { id: "ana", roles: ["operador"], autenticado: true }, habilitada: true }), { status: 200 });
      }
      if (u.includes("/api/auth/renovar")) {
        renovarSpy();
        return new Response(JSON.stringify({ ok: true, token: "x", expiraEnMinutos: 700, usuario: {} }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }));
    guardarSesion({ token: "fresco", expiraEnMinutos: 700, usuario: { id: "ana" } });

    montar();
    await waitFor(() => expect(screen.getByTestId("fase").textContent).toBe("resuelta"));

    expect(renovarSpy).not.toHaveBeenCalled();
  });
});

describe("modo muro: un fallo de renovación se avisa, nunca bloquea", () => {
  it("`bloqueando` es false en muro aunque la fase sea «pendiente»", async () => {
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "anonimo", roles: ["operador"], autenticado: false }, habilitada: true }),
    });

    function SondaBloqueando() {
      const { bloqueando } = useSesion();
      return <span data-testid="bloqueando">{String(bloqueando)}</span>;
    }
    render(
      <SesionProvider enMuro={true}>
        <SondaBloqueando />
      </SesionProvider>
    );

    await waitFor(() => expect(screen.getByTestId("bloqueando").textContent).toBe("false"));
  });

  it("fuera de muro, `bloqueando` SÍ es true con sesión pendiente", async () => {
    backend({
      "/api/auth/yo": json({ ok: true, usuario: { id: "anonimo", roles: ["operador"], autenticado: false }, habilitada: true }),
    });

    function SondaBloqueando() {
      const { bloqueando } = useSesion();
      return <span data-testid="bloqueando">{String(bloqueando)}</span>;
    }
    render(
      <SesionProvider enMuro={false}>
        <SondaBloqueando />
      </SesionProvider>
    );

    await waitFor(() => expect(screen.getByTestId("bloqueando").textContent).toBe("true"));
  });
});
