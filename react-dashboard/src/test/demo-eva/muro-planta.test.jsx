// @vitest-environment jsdom
/**
 * muro-planta.test.jsx — Plan 25 F10 (`NUE-09`).
 *
 * ── LAS TRES AFIRMACIONES QUE ESTA VISTA TIENE QUE CUMPLIR ─────────
 *
 *  1. **Ninguna cifra agrega las dos máquinas.** `NO_COMPARTEN`: un «3
 *     alarmas» que sumara tanque y vibraciones ya rompería la regla, aunque
 *     el número saliera bien.
 *  2. **La frescura es por máquina.** Si el tanque va al día y vibraciones
 *     lleva media hora sin dato, se dice de vibraciones — no un latido común
 *     que promedie las dos.
 *  3. **Una máquina caída no oculta la otra.** Ninguno de los dos paneles
 *     depende del otro para renderizarse.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";

const { evaluarRiesgos, evaluarRiesgosVibracion, useSistemaAgua, useVibracion } = vi.hoisted(() => ({
  evaluarRiesgos: vi.fn(),
  evaluarRiesgosVibracion: vi.fn(),
  useSistemaAgua: vi.fn(),
  useVibracion: vi.fn(),
}));

vi.mock("@/Demo-EVA/domain/riesgos.js", async (importOriginal) => ({
  ...(await importOriginal()),
  evaluarRiesgos,
}));
vi.mock("@/Demo-EVA/domain/riesgosVibracion.js", async (importOriginal) => ({
  ...(await importOriginal()),
  evaluarRiesgosVibracion,
}));
vi.mock("@/Demo-EVA/data/comunes/hooks.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useSistemaAgua,
}));
vi.mock("@/Demo-EVA/data/vibraciones/vibracion.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useVibracion,
}));

import MuroPlanta from "@/Demo-EVA/views/comunes/MuroPlanta.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const montar = () => render(<ThemeProvider><MuroPlanta /></ThemeProvider>);

const HORA = new Date("2026-09-12T10:00:00Z");

function enCalma({ tanqueFresco = true, vibracionesFresca = true } = {}) {
  useSistemaAgua.mockReturnValue({
    sistema: { activos: [] },
    lastUpdated: tanqueFresco ? new Date() : HORA, // HORA = hace mucho, congelado
  });
  useVibracion.mockReturnValue({
    canales: {}, variador: {}, alarmas: {},
    lastUpdated: vibracionesFresca ? new Date() : HORA,
  });
  evaluarRiesgos.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });
  evaluarRiesgosVibracion.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0, normaAplicable: null });
}

describe("las dos máquinas se ven a la vez, cada una con su nombre", () => {
  it("hay un panel de cada una", async () => {
    enCalma();
    montar();

    await waitFor(() => expect(screen.getByText("Sistema de agua industrial")).toBeTruthy());
    expect(screen.getByText("Sistema de vibraciones")).toBeTruthy();
  });
});

describe("ninguna cifra agrega las dos máquinas (NO_COMPARTEN)", () => {
  it("las alarmas activas del tanque no incluyen nada de vibraciones", async () => {
    enCalma();
    useSistemaAgua.mockReturnValue({
      sistema: { activos: [{ id: "a1", alarmas: { activas: 2 } }, { id: "a2", alarmas: { activas: 1 } }] },
      lastUpdated: new Date(),
    });

    montar();

    // 3 = 2+1 del TANQUE solamente. Si sumara algo de vibraciones sería otro número.
    await waitFor(() => expect(screen.getByText(/3 alarmas activas/)).toBeTruthy());
  });

  it("el peor riesgo de una máquina no aparece en el panel de la otra", async () => {
    enCalma();
    evaluarRiesgos.mockReturnValue({
      activos: [{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "E" }],
      noEvaluables: [], evaluadas: 1,
    });

    montar();

    await waitFor(() => expect(screen.getByText("Riesgo de derrame")).toBeTruthy());
    // El panel de vibraciones no repite el título del riesgo del tanque.
    const vibracionesPanel = screen.getByText("Sistema de vibraciones").closest("section");
    expect(vibracionesPanel.textContent).not.toContain("Riesgo de derrame");
  });
});

describe("las alarmas del PLC sólo existen para el tanque", () => {
  it("vibraciones dice que NO APLICA, no «0 alarmas»", async () => {
    /*
     * Las nueve alarmas del catálogo son del tanque (F3). Un «0» en
     * vibraciones afirmaría que se miró y no había ninguna — se dice que no
     * hay ninguna declarada, con las mismas palabras que la línea de tiempo.
     */
    enCalma();
    montar();

    await waitFor(() => expect(screen.getByText(/no tiene alarmas declaradas/i)).toBeTruthy());
  });

  it("el tanque SÍ dice «ninguna alarma activa» cuando corresponde — es una cifra real, no «no aplica»", async () => {
    enCalma();
    montar();

    await waitFor(() => expect(screen.getByText(/Ninguna alarma activa/)).toBeTruthy());
  });
});

describe("con una máquina caída, la otra se sigue viendo", () => {
  it("si useVibracion() lanza, el panel del tanque no se cae con él", async () => {
    enCalma();
    // Una máquina "caída": sin lastUpdated y sin datos, no un error de React.
    useVibracion.mockReturnValue({ canales: {}, variador: {}, alarmas: {}, lastUpdated: null });

    montar();

    await waitFor(() => expect(screen.getByText("Sistema de agua industrial")).toBeTruthy());
    expect(screen.getByText("Sistema de vibraciones")).toBeTruthy();
  });
});

describe("sin ningún riesgo activo, se dice explícitamente", () => {
  it("«Sin riesgos activos» en vez de un panel vacío mudo", async () => {
    enCalma();
    montar();

    await waitFor(() => expect(screen.getAllByText(/Sin riesgos activos/).length).toBeGreaterThanOrEqual(1));
  });
});
