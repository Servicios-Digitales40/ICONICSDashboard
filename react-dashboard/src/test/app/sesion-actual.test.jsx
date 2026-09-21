// @vitest-environment jsdom
/**
 * La pastilla de sesión del Topbar. Plan 35 F5.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 * Que el tablero diga **quién está dentro**, y que se pueda salir. Hasta el
 * 21-09-2026 no hacía ninguna de las dos cosas: para cambiar de rol había que
 * vaciar `localStorage` desde la consola del navegador.
 *
 * Y sobre todo que **no aparezca cuando no hay sesión que mostrar**. Con la
 * autenticación apagada, un «Salir» que no lleva a ninguna parte o un rol
 * inventado dirían algo falso sobre cómo está configurado el tablero — que es
 * el mismo error, en pequeño, que tenía `/api/auth/yo` contestando 401 a
 * quien preguntaba si hacía falta entrar.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * `vi.hoisted` y no constantes sueltas: `vi.mock` se iza al principio del
 * archivo, así que una variable declarada arriba todavía no existe cuando la
 * fábrica corre. Lo cazó el propio vitest con ese mensaje.
 */
const { borrarSesion, sesion, permisos } = vi.hoisted(() => ({
  borrarSesion: vi.fn(),
  sesion: { habilitada: true, usuario: null },
  permisos: { rol: "operador" },
}));

vi.mock("@/lib/api/sesion.js", () => ({
  borrarSesion,
  /* `authHeaders` lo importan otros módulos del árbol; sin él, el mock deja
     el barril incompleto y falla el import, no la prueba. */
  authHeaders: () => ({}),
}));

/* El componente lee el CONTEXTO y no `useSesion()` —para no reventar cuando
   el Topbar se monta sin proveedor—, así que el doble tiene que ser un
   contexto de verdad con el valor por defecto puesto: así `useContext` lo
   devuelve sin necesidad de envolver nada. */
vi.mock("@/app/providers/SesionProvider.jsx", async () => {
  const { createContext } = await import("react");
  return { CtxSesion: createContext(sesion), useSesion: () => sesion };
});

vi.mock("@/app/providers/usePermisos.js", () => ({
  usePermisos: () => permisos,
}));

import { ThemeProvider } from "@/theme";
import { SesionActual } from "@/app/layout/SesionActual.jsx";

const montar = () =>
  render(
    <ThemeProvider>
      <SesionActual />
    </ThemeProvider>,
  );

afterEach(() => {
  cleanup();
  borrarSesion.mockClear();
});

describe("la pastilla de sesión", () => {
  it("dice el usuario y su rol", () => {
    sesion.habilitada = true;
    sesion.usuario = { id: "Moises", roles: ["operador"], autenticado: true };
    permisos.rol = "operador";

    montar();

    expect(screen.getByText("Moises")).toBeTruthy();
    expect(screen.getByText("Operador")).toBeTruthy();
  });

  it("al salir borra la sesión de ESTE navegador", () => {
    sesion.habilitada = true;
    sesion.usuario = { id: "MyUser", roles: ["administrador"], autenticado: true };
    permisos.rol = "administrador";

    /* `location.reload` no existe en jsdom como función espiable sin esto, y
       sin sustituirla la prueba fallaría por el entorno, no por el código. */
    const recargar = vi.fn();
    const original = globalThis.location;
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { ...original, reload: recargar },
    });

    montar();
    fireEvent.click(screen.getByRole("button", { name: /Salir de la sesión de MyUser/i }));

    expect(borrarSesion).toHaveBeenCalledTimes(1);
    expect(recargar).toHaveBeenCalledTimes(1);

    Object.defineProperty(globalThis, "location", { configurable: true, value: original });
  });

  /*
   * Los dos casos en los que NO hay sesión que enseñar. Pintar algo aquí
   * diría que el tablero está protegido cuando no lo está.
   */
  it("con la autenticación APAGADA no se pinta", () => {
    sesion.habilitada = false;
    sesion.usuario = { id: "anonimo", roles: ["operador"], autenticado: false };

    const { container } = montar();

    expect(container.textContent).toBe("");
  });

  it("con la autenticación encendida pero SIN entrar tampoco", () => {
    /* El estado en el que arranca el tablero antes del login. */
    sesion.habilitada = true;
    sesion.usuario = { id: null, roles: [], autenticado: false };

    const { container } = montar();

    expect(container.textContent).toBe("");
  });
});
