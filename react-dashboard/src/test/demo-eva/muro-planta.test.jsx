// @vitest-environment jsdom
/**
 * muro-planta.test.jsx — Plan 25 F10 (`NUE-09`).
 *
 * ── LAS TRES AFIRMACIONES QUE ESTA VISTA TIENE QUE CUMPLIR ─────────
 *
 *  1. **Ninguna cifra agrega las máquinas.** `NO_COMPARTEN`: un «3 alarmas»
 *     que sumara tanque y vibraciones ya rompería la regla, aunque el número
 *     saliera bien.
 *  2. **La frescura es por máquina.** Si el tanque va al día y una configurada
 *     lleva media hora sin dato, se dice de ésa — no un latido común que
 *     promedie.
 *  3. **Una máquina caída no oculta la otra.** Ningún panel depende del otro
 *     para renderizarse.
 *
 * ── UN PANEL POR CONFIGURADA (Plan 40 F2) ──────────────────────────
 *
 * Hasta el 21-09-2026 el muro tenía un panel fijo para la máquina de
 * vibraciones escrita a mano, sobre `useVibracion()`. Ese panel ya no existe:
 * el muro pinta el tanque más un panel por cada entrada de
 * `useMaquinasEnVivo()`, con el NOMBRE que le puso quien la configuró. Aquí se
 * finge ese hook —y el provider de configuradas, de donde `useDominio()` saca
 * el nombre— con una configurada de vibraciones, `Nuevo-Modor`.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { tipoDe } from "@shared/eva/tipos/index.js";

const { evaluarRiesgos, useSistemaAgua, useMaquinasEnVivo, useMaquinasConfiguradas } = vi.hoisted(() => ({
  evaluarRiesgos: vi.fn(),
  useSistemaAgua: vi.fn(),
  useMaquinasEnVivo: vi.fn(),
  useMaquinasConfiguradas: vi.fn(),
}));

vi.mock("@/Demo-EVA/domain/riesgos.js", async (importOriginal) => ({
  ...(await importOriginal()),
  evaluarRiesgos,
}));
vi.mock("@/Demo-EVA/data/comunes/hooks.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useSistemaAgua,
}));
vi.mock("@/Demo-EVA/data/comunes/maquinasEnVivo.js", () => ({ useMaquinasEnVivo }));
vi.mock("@/Demo-EVA/data/comunes/MaquinasConfiguradas.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useMaquinasConfiguradas,
}));

import MuroPlanta from "@/Demo-EVA/views/comunes/MuroPlanta.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const montar = () => render(<ThemeProvider><MuroPlanta /></ThemeProvider>);

const HORA = new Date("2026-09-12T10:00:00Z");

const MAQUINA = { id: "vib-motor-03", nombre: "Nuevo-Modor", tipo: "vibraciones", activa: true, variables: [], assets: [] };
const TIPO = tipoDe("vibraciones");

/** La entrada de `useMaquinasEnVivo()` de la configurada, con lo que se le pida. */
function configuradaEnVivo({ lastUpdated = new Date(), activos = [], canales = {} } = {}) {
  useMaquinasConfiguradas.mockReturnValue({ maquinas: [MAQUINA], cargando: false, error: null, recargar: () => {} });
  useMaquinasEnVivo.mockReturnValue([
    {
      maquina: MAQUINA,
      tipo: TIPO,
      estado: { canales, variador: {}, alarmas: {}, loading: false, error: null, lastUpdated, puntosSinDato: [] },
      riesgos: { activos, noEvaluables: [], evaluadas: activos.length, normaAplicable: null },
    },
  ]);
}

function enCalma({ tanqueFresco = true, configuradaFresca = true } = {}) {
  useSistemaAgua.mockReturnValue({
    sistema: { activos: [] },
    lastUpdated: tanqueFresco ? new Date() : HORA, // HORA = hace mucho, congelado
  });
  evaluarRiesgos.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });
  configuradaEnVivo({ lastUpdated: configuradaFresca ? new Date() : HORA });
}

describe("las máquinas se ven a la vez, cada una con su nombre", () => {
  it("hay un panel del tanque y uno por configurada, con el nombre que le pusieron", async () => {
    enCalma();
    montar();

    await waitFor(() => expect(screen.getByText("Sistema de agua industrial")).toBeTruthy());
    expect(screen.getByText("Nuevo-Modor")).toBeTruthy();
  });

  it("sin ninguna configurada, sólo está el tanque: no se inventa un panel", async () => {
    enCalma();
    useMaquinasConfiguradas.mockReturnValue({ maquinas: [], cargando: false, error: null, recargar: () => {} });
    useMaquinasEnVivo.mockReturnValue([]);

    montar();

    await waitFor(() => expect(screen.getByText("Sistema de agua industrial")).toBeTruthy());
    expect(screen.queryByText("Nuevo-Modor")).toBeNull();
    expect(screen.queryByText(/no tiene alarmas declaradas/i)).toBeNull();
  });
});

describe("ninguna cifra agrega las máquinas (NO_COMPARTEN)", () => {
  it("las alarmas activas del tanque no incluyen nada de la configurada", async () => {
    enCalma();
    useSistemaAgua.mockReturnValue({
      sistema: { activos: [{ id: "a1", alarmas: { activas: 2 } }, { id: "a2", alarmas: { activas: 1 } }] },
      lastUpdated: new Date(),
    });

    montar();

    // 3 = 2+1 del TANQUE solamente. Si sumara algo de la otra sería otro número.
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
    // El panel de la configurada no repite el título del riesgo del tanque.
    const panel = screen.getByText("Nuevo-Modor").closest("section");
    expect(panel.textContent).not.toContain("Riesgo de derrame");
  });

  it("el peor riesgo de la configurada se pinta en SU panel, con las reglas de su tipo", async () => {
    /*
     * Los riesgos vienen ya evaluados por el tipo (`useMaquinasEnVivo`), y el
     * muro sólo enseña el primero —vienen ordenados— con la prosa de
     * vibraciones. El del tanque, ninguno.
     */
    enCalma();
    configuradaEnVivo({
      activos: [{ id: "vibracion-en-alarma", titulo: "Vibración en alarma", nivel: "critico", evidencia: "E", valores: {} }],
    });

    montar();

    await waitFor(() => expect(screen.getByText("Nuevo-Modor")).toBeTruthy());
    const panel = screen.getByText("Nuevo-Modor").closest("section");
    expect(panel.textContent).toMatch(/alarma/i);
    const tanque = screen.getByText("Sistema de agua industrial").closest("section");
    expect(tanque.textContent).toContain("Sin riesgos activos");
  });
});

describe("las alarmas del PLC sólo existen para el tanque", () => {
  it("la configurada dice que NO APLICA, no «0 alarmas»", async () => {
    /*
     * Las nueve alarmas del catálogo son del tanque (F3). Un «0» en la otra
     * afirmaría que se miró y no había ninguna — se dice que no hay ninguna
     * declarada, con las mismas palabras que la línea de tiempo.
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
  it("si la fuente de la configurada no ha contestado nunca, el panel del tanque no se cae con ella", async () => {
    enCalma();
    // Una máquina "caída": sin lastUpdated y sin datos, no un error de React.
    configuradaEnVivo({ lastUpdated: null });

    montar();

    await waitFor(() => expect(screen.getByText("Sistema de agua industrial")).toBeTruthy());
    const panel = screen.getByText("Nuevo-Modor").closest("section");
    // Y SU frescura dice que no hay lectura; la del tanque, que va en vivo.
    expect(panel.textContent).toMatch(/Sin lectura/i);
    expect(screen.getByText("Sistema de agua industrial").closest("section").textContent).toMatch(/En vivo/);
  });
});

describe("sin ningún riesgo activo, se dice explícitamente", () => {
  it("«Sin riesgos activos» en vez de un panel vacío mudo", async () => {
    enCalma();
    montar();

    await waitFor(() => expect(screen.getAllByText(/Sin riesgos activos/).length).toBeGreaterThanOrEqual(1));
  });
});
