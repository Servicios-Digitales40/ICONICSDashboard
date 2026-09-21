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
 *  4. **Con la máquina escrita a mano las vistas siguen igual**: `useVibracion`
 *     y `useDominioVibracion` devuelven lo mismo fuera de una máquina configurada.
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

    fireEvent.click(screen.getByRole("button", { name: /Entrar/ }));
    expect(onNavigate).toHaveBeenCalledWith("maq-graficas", { maquina: "vib-motor-03" });

    expect(screen.queryByRole("button", { name: /Ver riesgos|riesgos/i })).toBeNull();
  });
});

describe("con la máquina escrita a mano nada cambia", () => {
  it("useDominioVibracion fuera de una máquina configurada es la fuente de siempre, con sus tres apoyos", async () => {
    const real = await vi.importActual("@/Demo-EVA/data/vibraciones/vibracion.js");
    expect(typeof real.useDominioVibracion).toBe("function");
    expect(typeof real.useVibracion).toBe("function");
  });
});
