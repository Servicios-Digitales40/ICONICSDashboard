// @vitest-environment jsdom
/**
 * contexto-de-maquina.test.jsx — Plan 25 F4 (`NUE-06`).
 *
 * ── QUÉ PROTEGE, Y ES LO MISMO QUE PROTEGÍA ANTES ──────────────────
 *
 * `topbar-estado-maquina.test.jsx` ya vigila que el indicador de la bomba no
 * salga en vibraciones. Esto lo complementa por el otro lado: que la barra
 * **por sección** no haya reintroducido el cruce al generalizarse, y que cada
 * máquina enseñe lo SUYO.
 *
 * Y una que no existía y ahora importa: que una máquina que no contesta se vea
 * distinta de una máquina tranquila, **desde el Topbar**. Es el incidente del
 * 26-08-2026 que cita `estadoMaquina.js` —quince de veintiún puntos apagados a
 * la vez— llevado al sitio que está siempre a la vista.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { ContextoDeMaquina } from "@/app/layout/ContextoDeMaquina.jsx";

const { useSistemaAgua, useVibracion } = vi.hoisted(() => ({
  useSistemaAgua: vi.fn(),
  useVibracion: vi.fn(),
}));

vi.mock("@/Demo-EVA/data/comunes/hooks.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useSistemaAgua,
}));
vi.mock("@/Demo-EVA/data/vibraciones/vibracion.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useVibracion,
}));
/* Hay fuente montada: lo contrario tiene su propia prueba abajo. */
vi.mock("@/Demo-EVA/data/comunes/EvaProvider.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useHayFuenteEva: () => true,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** El tag de la bomba se lee por `fetch`; encendida para que sea inconfundible. */
const conBombaEncendida = () =>
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, payload: { value: true, quality: 0 } }),
  })));

const montar = (seccion) =>
  render(
    <ThemeProvider>
      <ContextoDeMaquina seccion={seccion} />
    </ThemeProvider>
  );

const tanque = (extra = {}) =>
  useSistemaAgua.mockReturnValue({
    sistema: { sinLectura: [], puntosPedidos: 8, ...extra },
  });

const vibracion = (extra = {}) =>
  useVibracion.mockReturnValue({ canales: {}, puntosSinDato: [], ...extra });

describe("cada máquina enseña lo suyo, y sólo lo suyo", () => {
  it("en vibraciones NO aparece el estado de la bomba del tanque", async () => {
    /*
     * El cruce que la separación por secciones existe para impedir. La
     * regresión es silenciosa: el indicador funciona y el dato es real, sólo
     * que es de la otra instalación.
     */
    conBombaEncendida();
    tanque();
    vibracion({ canales: { c1: { zona: "B", nivel: "nominal" } } });

    montar("sec-vibraciones");

    await waitFor(() => expect(screen.getByText(/Zona B/)).toBeTruthy());
    expect(screen.queryByText(/Encendida|Apagada/i)).toBeNull();
  });

  it("en el tanque aparece su bomba", async () => {
    conBombaEncendida();
    tanque();
    vibracion();

    montar("sec-llenado");

    await waitFor(() => expect(screen.getByText(/Encendida/i)).toBeTruthy());
  });

  it("en vibraciones se enseña la PEOR zona de las que contestan", () => {
    conBombaEncendida();
    tanque();
    vibracion({
      canales: {
        c1: { zona: "A", nivel: "nominal" },
        c2: { zona: "D", nivel: "critico" },
        c3: { zona: "B", nivel: "atencion" },
      },
    });

    montar("sec-vibraciones");
    expect(screen.getByText(/Zona D/)).toBeTruthy();
  });

  it("sin ninguna zona evaluable no se pinta «todo bien»: no se pinta nada", () => {
    /*
     * §2.4. No haber podido evaluar ninguna zona no es un veredicto favorable,
     * y una pastilla verde ahí lo afirmaría.
     */
    conBombaEncendida();
    tanque();
    vibracion({ canales: { c1: { zona: null, nivel: null } } });

    montar("sec-vibraciones");
    expect(screen.queryByText(/Zona/)).toBeNull();
  });

  it("fuera de las dos máquinas no hay barra de contexto", () => {
    // «Alarmas», «Assets» o «Salud» hablan del servidor, no de una instalación.
    conBombaEncendida();
    tanque();
    vibracion();

    const { container } = montar("sec-general");
    expect(container.textContent).toBe("");
  });
});

describe("una máquina muda se ve distinta de una máquina tranquila", () => {
  it("el tanque avisa de cuántos puntos no contestan, con su total", () => {
    conBombaEncendida();
    tanque({ sinLectura: ["a", "b", "c"], puntosPedidos: 8 });
    vibracion();

    montar("sec-llenado");
    expect(screen.getByText(/3 de 8 sin dato/)).toBeTruthy();
  });

  it("vibraciones avisa sin inventarse un total que no publica", () => {
    // «3 de 0» sería peor que no dar denominador.
    conBombaEncendida();
    tanque();
    vibracion({ puntosSinDato: ["x", "y", "z"] });

    montar("sec-vibraciones");
    expect(screen.getByText(/3 sin dato/)).toBeTruthy();
    expect(screen.queryByText(/de 0/)).toBeNull();
  });

  it("sin puntos mudos NO hay pastilla: un «0 sin dato» permanente sería ruido", () => {
    conBombaEncendida();
    tanque({ sinLectura: [], puntosPedidos: 8 });
    vibracion();

    montar("sec-llenado");
    expect(screen.queryByText(/sin dato/)).toBeNull();
  });
});
