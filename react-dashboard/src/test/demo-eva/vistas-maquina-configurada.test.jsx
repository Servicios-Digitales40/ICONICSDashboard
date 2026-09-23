// @vitest-environment jsdom
/**
 * vistas-maquina-configurada.test.jsx
 * ------------------------------------------------------------------
 * Las vistas de vibraciones pintando una máquina CONFIGURADA. Plan 37 F3.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 *  1. **Gráficas enseña los apoyos DE LA MÁQUINA**, con su id como rótulo:
 *     `S1` y `S2`, ni «Lado acople» (es dónde está el S1 de la escrita a
 *     mano) ni un `S3` que esta máquina no tiene.
 *  2. **Inicio navega a las rutas de la máquina**, con su parámetro: la
 *     tarjeta de Gráficas lleva a `maq-graficas?maquina=…`, y Riesgos —que no
 *     existe para una configurada— no se ofrece.
 *  3. **El contexto del asistente declara la máquina real**, no `vibraciones`.
 *  4. **Sólo queda un hook de lectura**: `useDominioVibracion`. `useVibracion`
 *     —la máquina de vibraciones escrita a mano, montada en el chrome— se
 *     retiró en el Plan 40 F2, y una vista que lo importara tendría que caer
 *     en una máquina que ya no existe. Hasta esa fase este punto afirmaba lo
 *     contrario: que los dos hooks devolvían lo mismo fuera de una configurada.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const contexto = vi.fn();
vi.mock("@/features/asistente/lib/contextoDeVista.js", () => ({
  declararContextoDeVista: (ctx) => {
    contexto(ctx);
    return () => {};
  },
}));

let dominio = null;
vi.mock("@/Demo-EVA/data/vibraciones/vibracion.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useDominioVibracion: () => dominio,
}));

import { ThemeProvider } from "@/theme";
import Vibraciones from "@/Demo-EVA/views/vibraciones/Vibraciones.jsx";
import InicioVibraciones from "@/Demo-EVA/views/vibraciones/InicioVibraciones.jsx";

const apoyo = (vRMS) => ({
  vRMS, aRMS: 0.4, aPeak: 1.1, DKW: 1.0,
  alarma: 0, aviso: 0, offset: 0,
  vigilancias: {}, calidades: {}, sensor: null,
});

const CONFIGURADA = {
  canales: { S1: apoyo(1.2), S2: apoyo(0.6) },
  variador: { velocidad: 1480 },
  alarmas: {},
  loading: false,
  error: null,
  lastUpdated: new Date("2026-09-21T20:00:00Z"),
  puntosSinDato: [],
  puntosPedidos: 9,
  canalesMeta: [
    { id: "S1", sufijo: "S1", label: "S1", sensibilidad: null, rodamiento: null },
    { id: "S2", sufijo: "S2", label: "S2", sensibilidad: null, rodamiento: null },
  ],
  maquina: { id: "vib-motor-03", nombre: "Nuevo-Modor", configurada: true, area: "ae:/OTRA AREA" },
};

const montar = (Vista, props = {}) =>
  render(
    <ThemeProvider>
      <Vista {...props} />
    </ThemeProvider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Gráficas con una máquina configurada", () => {
  it("enseña los apoyos de LA MÁQUINA, con su id, y no los de la escrita a mano", () => {
    dominio = CONFIGURADA;
    montar(Vibraciones);

    expect(screen.getAllByRole("heading", { name: "S1" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "S2" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Lado acople")).toBeNull();
    expect(screen.queryByRole("heading", { name: "S3" })).toBeNull();
    /* El rótulo no afirma tres apoyos sobre una máquina de dos. */
    expect(screen.queryByText("Los tres apoyos")).toBeNull();
    expect(screen.getByText("Los apoyos")).toBeTruthy();
  });

  it("declara al asistente la máquina real y nombra SU área de alarmas", () => {
    dominio = CONFIGURADA;
    montar(Vibraciones);

    expect(contexto).toHaveBeenCalledWith({ sistema: "vib-motor-03" });
    expect(screen.getByText(/ae:\/OTRA AREA/)).toBeTruthy();
  });
});

describe("Inicio con una máquina configurada", () => {
  it("navega a las rutas de la máquina con su parámetro, y no ofrece Riesgos", () => {
    dominio = CONFIGURADA;
    const onNavigate = vi.fn();
    montar(InicioVibraciones, { onNavigate });

    /* Hay dos «Entrar a …» desde el Plan 42.5 F1 (Estado mecánico y Planta); el
       CTA principal sigue siendo el primero. */
    fireEvent.click(screen.getByRole("button", { name: /Entrar a Estado mecánico/ }));
    expect(onNavigate).toHaveBeenCalledWith("maq-graficas", { maquina: "vib-motor-03" });

    expect(screen.queryByRole("button", { name: /Ver riesgos|riesgos/i })).toBeNull();
  });
});

describe("la máquina escrita a mano ya no tiene hook", () => {
  it("el módulo exporta useDominioVibracion y NO useVibracion (Plan 40 F2)", async () => {
    const real = await vi.importActual("@/Demo-EVA/data/vibraciones/vibracion.js");
    expect(typeof real.useDominioVibracion).toBe("function");
    /* Si esto vuelve a ser una función, alguien ha revivido la escrita a mano
       fuera del registro de configuradas: es lo que el Plan 40 retira. */
    expect(real.useVibracion).toBeUndefined();
  });
});

describe("Inicio: los puntos que no llegan se listan, no sólo se cuentan (F6, D17)", () => {
  it("bajo la cifra, un desplegable dice cuáles son y por qué, con el rótulo de la forma común", () => {
    dominio = {
      ...CONFIGURADA,
      puntosSinDato: ["ac:M/S1/vRMS", "ac:M/V20/rpm"],
      detalleSinDato: [
        { punto: "ac:M/S1/vRMS", motivo: { codigo: "sin_entrega" } },
        { punto: "ac:M/V20/rpm", motivo: null },
      ],
      estado: { senales: [{ clave: "vRMS_S1", tag: "ac:M/S1/vRMS", label: "Velocidad eficaz · S1" }] },
    };
    montar(InicioVibraciones, { onNavigate: vi.fn() });

    expect(screen.getByText("Ver las 2 variables sin lectura")).toBeTruthy();
    expect(screen.getByText(/El punto existe pero dejó de entregar valor · 1/)).toBeTruthy();
    expect(screen.getByText(/Todavía no ha llegado ninguna · 1/)).toBeTruthy();
    expect(screen.getByText("Velocidad eficaz · S1")).toBeTruthy();
    expect(screen.getByText("ac:M/V20/rpm")).toBeTruthy();
  });

  it("con todos los puntos contestando no hay desplegable", () => {
    dominio = { ...CONFIGURADA, detalleSinDato: [] };
    montar(InicioVibraciones, { onNavigate: vi.fn() });
    expect(screen.queryByText(/variables? sin lectura/)).toBeNull();
  });
});
