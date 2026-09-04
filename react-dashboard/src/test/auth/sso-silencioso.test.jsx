// @vitest-environment jsdom
/**
 * sso-silencioso.test.jsx
 * ------------------------------------------------------------------
 * El asistente empotrado como iframe en el HMI nativo de ICONICS entra sin
 * pedir usuario y contraseña otra vez — ver la cabecera de
 * `auth/SesionProvider.jsx` y `docs/PLAN-20-ASISTENTE.md`.
 *
 * ── LO QUE IMPORTA PROTEGER ────────────────────────────────────────
 *
 *  - Que el login NO aparezca cuando el SSO silencioso resuelve a tiempo: es
 *    la razón entera de que esto exista.
 *  - Que el login SÍ aparezca cuando ICONICS dice `login_required`, o cuando
 *    la función ni está habilitada — el respaldo tiene que respaldar de
 *    verdad, no colgarse.
 *  - Que un mensaje de otro origen, o sin la forma esperada, se ignore: el
 *    iframe oculto escucha `message` en una ventana compartida con
 *    cualquier otro script de la página.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "@/app/App.jsx";

function responde(cuerpo, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(cuerpo),
    text: () => Promise.resolve(JSON.stringify(cuerpo)),
    clone() {
      return this;
    },
  };
}

const SIN_SESION = responde({ ok: false, motivo: "sesion", error: "No hay sesión abierta." }, { status: 401 });

/**
 * Servidor de mentira que SÍ distingue rutas, a diferencia del de
 * `login.test.jsx`: aquí importa que `/api/sesion` y
 * `/api/sesion/silenciosa/iniciar` contesten cosas distintas.
 */
function servidor({ iniciar, silenciosa }) {
  return vi.fn((ruta, opciones = {}) => {
    if (ruta.endsWith("/api/sesion") && !opciones.method) return Promise.resolve(SIN_SESION);
    if (ruta.endsWith("/api/sesion/silenciosa/iniciar")) return Promise.resolve(iniciar());
    if (ruta.endsWith("/api/sesion/silenciosa") && opciones.method === "POST") {
      return Promise.resolve(silenciosa(JSON.parse(opciones.body)));
    }
    throw new Error(`Ruta no esperada en la prueba: ${ruta}`);
  });
}

/*
 * `<App/>` ya se envuelve a sí mismo en `<ThemeProvider><SesionProvider>`
 * (ver `app/App.jsx`) — envolverlo OTRA VEZ aquí montaría dos
 * `SesionProvider` independientes, cada uno con su propio iframe oculto y su
 * propio listener de `message`, y sólo el interior es el que de verdad
 * gobierna lo que se ve en pantalla.
 */
function montar() {
  return render(<App />);
}

/** El iframe oculto que crea `abrirIframeOculto`. Falla si no aparece. */
async function esperarIframeOculto() {
  return waitFor(() => {
    const iframe = document.querySelector("iframe");
    if (!iframe) throw new Error("El iframe oculto del SSO silencioso no se creó.");
    return iframe;
  });
}

/**
 * Espera a que termine el estado `comprobando` (la pantalla en blanco con
 * `aria-busy`). Sin esto, una aserción de «el login no está» es trivialmente
 * cierta DURANTE la comprobación y no demuestra nada — y peor: deja la
 * promesa del intento resolviéndose en segundo plano, después de que la
 * prueba ya haya terminado.
 */
async function esperarFinDeComprobacion() {
  await waitFor(() => {
    if (document.querySelector('[aria-busy="true"]')) {
      throw new Error("Sigue en «comprobando».");
    }
  });
}

/** Simula la respuesta de `/auth/silencioso.js`: un postMessage al padre. */
function responderComoIconics({ code = null, error = null } = {}) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { tipo: "sso-silencioso", code, error },
      origin: window.location.origin,
    })
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.querySelectorAll("iframe").forEach((n) => n.remove());
});

describe("SSO silencioso", () => {
  it("con código válido, entra directo y nunca enseña el login", async () => {
    vi.stubGlobal(
      "fetch",
      servidor({
        iniciar: () => responde({ habilitado: true, url: "https://bms-server/authorize?prompt=none", verificador: "v" }),
        silenciosa: (cuerpo) => {
          expect(cuerpo).toEqual({ code: "un-codigo", verificador: "v" });
          return responde({ ok: true, usuario: "ana.tecnica", expiraEn: new Date().toISOString() });
        },
      })
    );
    montar();

    await esperarIframeOculto();
    responderComoIconics({ code: "un-codigo" });

    // El asistente aparece — y el login, en ningún momento.
    await esperarFinDeComprobacion();
    expect(screen.queryByRole("button", { name: /entrar/i })).toBeNull();
    expect(screen.queryByLabelText(/usuario/i)).toBeNull();
  });

  it("con login_required, cae al formulario de login normal", async () => {
    vi.stubGlobal(
      "fetch",
      servidor({
        iniciar: () => responde({ habilitado: true, url: "https://bms-server/authorize?prompt=none", verificador: "v" }),
        silenciosa: () => {
          throw new Error("No debería llamarse: no hubo código.");
        },
      })
    );
    montar();

    await esperarIframeOculto();
    responderComoIconics({ error: "login_required" });

    await waitFor(() => expect(screen.getByRole("button", { name: /entrar/i })).toBeTruthy());
  });

  it("sin la función habilitada, no crea ningún iframe y va directo al login", async () => {
    vi.stubGlobal(
      "fetch",
      servidor({
        iniciar: () => responde({ habilitado: false }),
        silenciosa: () => {
          throw new Error("No debería llamarse: la función está apagada.");
        },
      })
    );
    montar();

    await waitFor(() => expect(screen.getByRole("button", { name: /entrar/i })).toBeTruthy());
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("ignora un mensaje de otro origen", async () => {
    vi.stubGlobal(
      "fetch",
      servidor({
        iniciar: () => responde({ habilitado: true, url: "https://bms-server/authorize?prompt=none", verificador: "v" }),
        silenciosa: () => {
          throw new Error("No debería llamarse: el mensaje era de otro origen.");
        },
      })
    );
    montar();

    await esperarIframeOculto();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { tipo: "sso-silencioso", code: "codigo-ajeno" },
        origin: "https://un-sitio-cualquiera.example",
      })
    );

    // No pasa nada visible: ni entra, ni revienta. Se resuelve por el
    // respaldo normal (login_required real, en esta prueba no llega) — lo
    // que importa es que el mensaje ajeno no disparó el canje.
    await new Promise((resuelve) => setTimeout(resuelve, 50));
    expect(screen.queryByRole("button", { name: /entrar/i })).toBeNull();
  });

  it("si el canje del código falla, cae al login en vez de quedarse colgado", async () => {
    vi.stubGlobal(
      "fetch",
      servidor({
        iniciar: () => responde({ habilitado: true, url: "https://bms-server/authorize?prompt=none", verificador: "v" }),
        silenciosa: () =>
          responde({ ok: false, error: "ICONICS rechazó el inicio de sesión único." }, { status: 401 }),
      })
    );
    montar();

    await esperarIframeOculto();
    responderComoIconics({ code: "un-codigo-que-icon-rechaza" });

    await waitFor(() => expect(screen.getByRole("button", { name: /entrar/i })).toBeTruthy());
  });
});

describe("SLO por sondeo (cerrar aquí cuando se cierra en ICONICS)", () => {
  /*
   * `INTERVALO_COMPROBACION_SESION_MS` no se exporta — es un detalle interno
   * — así que se repite aquí el mismo valor. Con timers reales la prueba
   * tardaría un minuto de verdad; con `vi.useFakeTimers()` se salta directo
   * al primer sondeo. `waitFor` usa temporizadores por dentro, así que se
   * evita mientras los timers están falseados: se sondea el DOM a mano y
   * sólo se vuelve a timers reales para la aserción final.
   */
  const INTERVALO_COMPROBACION_SESION_MS = 15_000;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("un login_required en el sondeo periódico cierra la sesión, no sólo el primer intento", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      servidor({
        iniciar: () => responde({ habilitado: true, url: "https://bms-server/authorize?prompt=none", verificador: "v" }),
        silenciosa: () => responde({ ok: true, usuario: "ana.tecnica", expiraEn: new Date().toISOString() }),
      })
    );
    montar();

    // Entra por SSO silencioso (igual que la primera prueba de este archivo).
    await vi.waitFor(() => {
      if (!document.querySelector("iframe")) throw new Error("sin iframe todavía");
    });
    responderComoIconics({ code: "un-codigo" });
    await vi.waitFor(() => {
      if (document.querySelector('[aria-busy="true"]')) throw new Error("sigue comprobando");
    });
    expect(screen.queryByRole("button", { name: /entrar/i })).toBeNull();

    // Salta al primer sondeo periódico: se abre un SEGUNDO iframe oculto.
    await vi.advanceTimersByTimeAsync(INTERVALO_COMPROBACION_SESION_MS);
    await vi.waitFor(() => {
      if (!document.querySelector("iframe")) throw new Error("sin iframe del sondeo todavía");
    });

    // ICONICS dice que ya no hay sesión.
    responderComoIconics({ error: "login_required" });
    await vi.advanceTimersByTimeAsync(0);

    vi.useRealTimers();
    await waitFor(() => expect(screen.getByRole("button", { name: /entrar/i })).toBeTruthy());
  });

  it("un timeout o un error en el sondeo NO cierra la sesión — sólo login_required lo hace", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      servidor({
        iniciar: () => responde({ habilitado: true, url: "https://bms-server/authorize?prompt=none", verificador: "v" }),
        silenciosa: () => responde({ ok: true, usuario: "ana.tecnica", expiraEn: new Date().toISOString() }),
      })
    );
    montar();

    await vi.waitFor(() => {
      if (!document.querySelector("iframe")) throw new Error("sin iframe todavía");
    });
    responderComoIconics({ code: "un-codigo" });
    await vi.waitFor(() => {
      if (document.querySelector('[aria-busy="true"]')) throw new Error("sigue comprobando");
    });

    // El sondeo se dispara y esta vez ICONICS nunca contesta (timeout).
    await vi.advanceTimersByTimeAsync(INTERVALO_COMPROBACION_SESION_MS);
    await vi.advanceTimersByTimeAsync(6000); // más que TIMEOUT_SSO_SILENCIOSO_MS

    vi.useRealTimers();
    // Sigue dentro: un timeout no es un "login_required" explícito.
    expect(screen.queryByRole("button", { name: /entrar/i })).toBeNull();
  });
});
