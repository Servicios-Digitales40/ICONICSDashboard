// @vitest-environment jsdom
/**
 * muro-planta.test.jsx — Plan 25 F10 (`NUE-09`), un panel por configurada
 * desde el Plan 40 F2, y sin panel del tanque desde el Plan 42.5 F4.
 *
 * ── LAS TRES AFIRMACIONES QUE ESTA VISTA TIENE QUE CUMPLIR ─────────
 *
 *  1. **Ninguna cifra agrega las máquinas.** `NO_COMPARTEN`: el peor riesgo
 *     de una máquina no aparece en el panel de otra, y nada se suma.
 *  2. **La frescura es por máquina.** Si una va al día y otra lleva media
 *     hora sin dato, se dice de ésa — no un latido común que promedie.
 *  3. **Una máquina caída no oculta la otra.** Ningún panel depende del otro
 *     para renderizarse.
 *
 * ── SIN PANEL DEL TANQUE (Plan 42.5 F4, 23-09-2026) ────────────────
 *
 * Hasta el 23-09-2026 el muro pintaba un panel fijo del tanque —con
 * `useSistemaAgua()` y su `evaluarRiesgos`, y su conteo de alarmas del PLC—
 * más uno por configurada. Se retiró con el resto de las vistas del tanque,
 * que volverá como máquina configurada (Plan 43) y tendrá aquí su panel como
 * cualquier otra. Para que la regla `NO_COMPARTEN` siga teniendo dos máquinas
 * que no cruzar, aquí se finge `useMaquinasEnVivo()` con DOS configuradas, y
 * el provider de configuradas —de donde `useDominio()` saca el nombre—.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { tipoDe } from "@shared/eva/tipos/index.js";

const { useMaquinasEnVivo, useMaquinasConfiguradas } = vi.hoisted(() => ({
  useMaquinasEnVivo: vi.fn(),
  useMaquinasConfiguradas: vi.fn(),
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

const HORA = new Date("2026-09-12T10:00:00Z"); // hace mucho: congelado

const MOTOR = { id: "vib-motor-03", nombre: "Nuevo-Modor", tipo: "vibraciones", activa: true, variables: [], assets: [] };
const BOMBA = { id: "vib-bomba-07", nombre: "Bomba de recirculación", tipo: "vibraciones", activa: true, variables: [], assets: [] };
const TIPO = tipoDe("vibraciones");

/** Una entrada de `useMaquinasEnVivo()`, con lo que se le pida. */
function entrada(maquina, { lastUpdated = new Date(), activos = [], canales = {} } = {}) {
  return {
    maquina,
    tipo: TIPO,
    estado: { canales, variador: {}, alarmas: {}, loading: false, error: null, lastUpdated, puntosSinDato: [] },
    riesgos: { activos, noEvaluables: [], evaluadas: activos.length, normaAplicable: null },
  };
}

function enVivo(entradas) {
  useMaquinasConfiguradas.mockReturnValue({
    maquinas: entradas.map((e) => e.maquina), cargando: false, error: null, recargar: () => {},
  });
  useMaquinasEnVivo.mockReturnValue(entradas);
}

const panelDe = (nombre) => screen.getByText(nombre).closest("section");

describe("las máquinas se ven a la vez, cada una con su nombre", () => {
  it("hay un panel por configurada, con el nombre que le pusieron", async () => {
    enVivo([entrada(MOTOR), entrada(BOMBA)]);
    montar();

    await waitFor(() => expect(screen.getByText("Nuevo-Modor")).toBeTruthy());
    expect(screen.getByText("Bomba de recirculación")).toBeTruthy();
    expect(document.querySelectorAll("section")).toHaveLength(2);
  });

  it("sin ninguna configurada, la pantalla de entrada lo dice: no se inventa un panel ni se queda en blanco", async () => {
    enVivo([]);
    montar();

    await waitFor(() => expect(screen.getByText(/Ninguna máquina configurada en servicio/)).toBeTruthy());
    expect(document.querySelectorAll("section")).toHaveLength(0);
    expect(screen.queryByText(/no tiene alarmas declaradas/i)).toBeNull();
  });
});

describe("ninguna cifra agrega las máquinas (NO_COMPARTEN)", () => {
  it("el peor riesgo de una máquina no aparece en el panel de la otra", async () => {
    enVivo([
      entrada(MOTOR, { activos: [{ id: "vibracion-en-alarma", titulo: "Vibración en alarma", nivel: "critico", evidencia: "E", valores: {} }] }),
      entrada(BOMBA),
    ]);
    montar();

    await waitFor(() => expect(screen.getByText("Nuevo-Modor")).toBeTruthy());
    expect(panelDe("Nuevo-Modor").textContent).toMatch(/alarma/i);
    /* El otro panel no repite el riesgo del vecino: dice que no tiene ninguno. */
    expect(panelDe("Bomba de recirculación").textContent).toContain("Sin riesgos activos");
    expect(panelDe("Bomba de recirculación").textContent).not.toMatch(/Vibración en alarma/);
  });

  it("el peor riesgo se pinta en SU panel, con las reglas de su tipo", async () => {
    /*
     * Los riesgos vienen ya evaluados por el tipo (`useMaquinasEnVivo`), y el
     * muro sólo enseña el primero —vienen ordenados— con la prosa de
     * vibraciones.
     */
    enVivo([entrada(MOTOR, { activos: [{ id: "vibracion-en-alarma", titulo: "Vibración en alarma", nivel: "critico", evidencia: "E", valores: {} }] })]);
    montar();

    await waitFor(() => expect(screen.getByText("Nuevo-Modor")).toBeTruthy());
    expect(panelDe("Nuevo-Modor").textContent).toMatch(/alarma/i);
    expect(panelDe("Nuevo-Modor").textContent).not.toContain("Sin riesgos activos");
  });
});

describe("las alarmas del PLC no se inventan", () => {
  it("una máquina cuyo tipo no declara alarmas dice que NO APLICA, no «0 alarmas»", async () => {
    /*
     * Un «0» afirmaría que se miró y no había ninguna. Se dice que no hay
     * ninguna declarada, con las mismas palabras que la línea de tiempo.
     */
    enVivo([entrada(MOTOR), entrada(BOMBA)]);
    montar();

    await waitFor(() => expect(screen.getAllByText(/no tiene alarmas declaradas/i)).toHaveLength(2));
    expect(screen.queryByText(/0 alarmas/)).toBeNull();
  });
});

describe("con una máquina caída, la otra se sigue viendo", () => {
  it("si la fuente de una no ha contestado nunca, el panel de la otra no se cae con ella", async () => {
    // Una máquina "caída": sin lastUpdated y sin datos, no un error de React.
    enVivo([entrada(MOTOR, { lastUpdated: null }), entrada(BOMBA)]);
    montar();

    await waitFor(() => expect(screen.getByText("Bomba de recirculación")).toBeTruthy());
    // Y SU frescura dice que no hay lectura; la de la otra, que va en vivo.
    expect(panelDe("Nuevo-Modor").textContent).toMatch(/Sin lectura/i);
    expect(panelDe("Bomba de recirculación").textContent).toMatch(/En vivo/);
  });

  it("la frescura es por máquina: una congelada no arrastra a la que va al día", async () => {
    enVivo([entrada(MOTOR, { lastUpdated: HORA }), entrada(BOMBA)]);
    montar();

    await waitFor(() => expect(screen.getByText("Nuevo-Modor")).toBeTruthy());
    expect(panelDe("Nuevo-Modor").textContent).not.toMatch(/En vivo/);
    expect(panelDe("Bomba de recirculación").textContent).toMatch(/En vivo/);
  });
});

describe("sin ningún riesgo activo, se dice explícitamente", () => {
  it("«Sin riesgos activos» en vez de un panel vacío mudo", async () => {
    enVivo([entrada(MOTOR)]);
    montar();

    await waitFor(() => expect(screen.getAllByText(/Sin riesgos activos/).length).toBeGreaterThanOrEqual(1));
  });
});
