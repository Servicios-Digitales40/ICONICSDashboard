// @vitest-environment jsdom
/**
 * login.test.jsx
 * ------------------------------------------------------------------
 * La primera pantalla que ve nadie (Plan 20 Fase 4).
 *
 * ── LO QUE IMPORTA PROTEGER ────────────────────────────────────────
 *
 *  - Que el error del servidor se enseñe **tal cual**. `sesionRoutes.mjs`
 *    distingue credenciales rechazadas de servidor sin plazas, y fundirlas en
 *    un «no se pudo entrar» mandaría al técnico a revisar una contraseña que
 *    está bien. Es CLAUDE.md §4.6 en la pantalla donde más cuesta un mensaje
 *    genérico.
 *  - Que la contraseña se mande **sin recortar**. El usuario sí se recorta —un
 *    espacio al pegarlo es un descuido—, pero una contraseña que empieza o
 *    acaba en espacio es una contraseña válida, y recortarla produce el peor
 *    fallo posible: uno que sólo le pasa a algunas personas y que ellas no
 *    pueden explicar.
 *  - Que un rechazo devuelva el formulario, no lo deje bloqueado. Quien se
 *    equivoca al teclear tiene que poder reintentar sin recargar.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { SesionProvider } from "@/auth/SesionProvider.jsx";
import App from "@/app/App.jsx";

/** Respuesta mínima con la forma que `pedirJson` sabe leer. */
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

/** `GET /api/sesion` dice que no hay; lo demás lo decide cada prueba. */
function servidor({ alEntrar }) {
  return vi.fn((_ruta, opciones = {}) =>
    Promise.resolve(opciones.method === "POST" ? alEntrar() : SIN_SESION)
  );
}

function montar() {
  return render(
    <ThemeProvider>
      <SesionProvider>
        <App />
      </SesionProvider>
    </ThemeProvider>
  );
}

async function rellenarYEnviar({ usuario = "ana.tecnica", contrasena = "secreta" } = {}) {
  fireEvent.change(screen.getByLabelText(/usuario/i), { target: { value: usuario } });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: contrasena } });
  fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("el formulario de login", () => {
  it("se enseña cuando no hay sesión, y no antes", async () => {
    vi.stubGlobal("fetch", servidor({ alEntrar: () => SIN_SESION }));
    montar();

    /*
     * Mientras se pregunta al servidor no se pinta el login: enseñarlo y
     * sustituirlo medio segundo después es el parpadeo que hace que una
     * aplicación parezca rota nada más abrirla.
     */
    expect(screen.queryByRole("button", { name: /entrar/i })).toBeNull();

    await waitFor(() => expect(screen.getByRole("button", { name: /entrar/i })).toBeTruthy());
  });

  it("dice que las credenciales son las de ICONICS", async () => {
    vi.stubGlobal("fetch", servidor({ alEntrar: () => SIN_SESION }));
    montar();

    const texto = await screen.findByText(/de ICONICS/i);
    expect(texto).toBeTruthy();
  });

  it("manda el usuario recortado y la contraseña intacta", async () => {
    const espia = servidor({ alEntrar: () => responde({ ok: true, usuario: "ana.tecnica" }) });
    vi.stubGlobal("fetch", espia);
    montar();

    await screen.findByRole("button", { name: /entrar/i });
    await rellenarYEnviar({ usuario: "  ana.tecnica  ", contrasena: " con espacios " });

    await waitFor(() => {
      const envio = espia.mock.calls.find(([, o]) => o?.method === "POST");
      expect(envio).toBeTruthy();
      expect(JSON.parse(envio[1].body)).toEqual({
        usuario: "ana.tecnica",
        contrasena: " con espacios ",
      });
    });
  });

  it("enseña el mensaje del servidor tal cual, y deja reintentar", async () => {
    vi.stubGlobal(
      "fetch",
      servidor({
        alEntrar: () =>
          responde(
            { ok: false, error: "Usuario o contraseña incorrectos para el servidor de ICONICS." },
            { status: 401 }
          ),
      })
    );
    montar();

    await screen.findByRole("button", { name: /entrar/i });
    await rellenarYEnviar();

    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toContain("Usuario o contraseña incorrectos");

    // El formulario vuelve, no se queda en «Comprobando…».
    await waitFor(() => expect(screen.getByRole("button", { name: /entrar/i })).toBeTruthy());
  });

  it("un 503 de capacidad NO se disfraza de contraseña equivocada", async () => {
    /*
     * Las credenciales eran buenas: el puente está lleno. Traducirlo a
     * «incorrectos» mandaría a revisar lo único que no está mal.
     */
    vi.stubGlobal(
      "fetch",
      servidor({
        alEntrar: () =>
          responde(
            { ok: false, error: "El puente ya tiene 32 sesiones abiertas (SESION_MAX=32)." },
            { status: 503 }
          ),
      })
    );
    montar();

    await screen.findByRole("button", { name: /entrar/i });
    await rellenarYEnviar();

    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toContain("SESION_MAX");
    expect(aviso.textContent).not.toMatch(/incorrect/i);
  });
});
