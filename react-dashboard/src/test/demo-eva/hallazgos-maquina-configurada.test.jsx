// @vitest-environment jsdom
/**
 * hallazgos-maquina-configurada.test.jsx
 * ------------------------------------------------------------------
 * Hallazgos y Avisos con una máquina CONFIGURADA. Plan 38 F2.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 *  1. **El diagnóstico se pide con el id de LA máquina**, no con
 *     `vibraciones`: es lo que el backend registra desde el Plan 38 F1 y lo
 *     que sus rutas ahora aceptan.
 *  2. **Navegar desde un hallazgo lleva el parámetro de máquina**: la vista de
 *     Riesgos es genérica y sin él hablaría de la escrita a mano.
 *  3. **Los avisos se narran por la máquina de la pantalla.**
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let dominio = null;
vi.mock("@/Demo-EVA/data/vibraciones/vibracion.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useDominioVibracion: () => dominio,
}));

const obtenerDiagnostico = vi.fn(async () => null);
const obtenerDiagnosticoNarrado = vi.fn(async () => null);
vi.mock("@/lib/api/casosApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  obtenerDiagnostico: (...a) => obtenerDiagnostico(...a),
  obtenerDiagnosticoNarrado: (...a) => obtenerDiagnosticoNarrado(...a),
}));

import { ThemeProvider } from "@/theme";
import BandejaEva from "@/Demo-EVA/views/comunes/BandejaEva.jsx";
import AvisosEva from "@/Demo-EVA/views/comunes/AvisosEva.jsx";

/* Un apoyo en zona D: `vibracion-en-alarma` activo (medido con el motor real). */
const apoyo = (vRMS) => ({
  vRMS, aRMS: 0.4, aPeak: 1, DKW: 1, alarma: 0, aviso: 0, offset: 0,
  vigilancias: {}, calidades: {}, sensor: null,
});

const CONFIGURADA = {
  canales: { S1: apoyo(6.0), S2: apoyo(0.5) },
  variador: { velocidad: 1480 },
  alarmas: {},
  loading: false, error: null, lastUpdated: new Date(), puntosSinDato: [], puntosPedidos: 9,
  canalesMeta: [{ id: "S1", sufijo: "S1", label: "S1" }, { id: "S2", sufijo: "S2", label: "S2" }],
  maquina: { id: "vib-motor-03", nombre: "Nuevo-Modor", configurada: true, area: null },
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
  window.localStorage.clear();
});

describe("Hallazgos con una máquina configurada", () => {
  it("pide el diagnóstico con el id de LA máquina, y navega con su parámetro", async () => {
    dominio = CONFIGURADA;
    const onNavigate = vi.fn();
    montar(BandejaEva, { onNavigate });

    await waitFor(() => expect(obtenerDiagnostico).toHaveBeenCalled());
    expect(obtenerDiagnostico).toHaveBeenCalledWith(
      expect.objectContaining({ sistema: "vib-motor-03", riesgoId: "vibracion-en-alarma" }),
    );
    expect(obtenerDiagnostico).not.toHaveBeenCalledWith(expect.objectContaining({ sistema: "vibraciones" }));

    /* El primer botón de la primera tarjeta es «ir a mirarlo». */
    const botones = await screen.findAllByRole("button");
    fireEvent.click(botones[0]);
    expect(onNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/eva-riesgos-vibracion|cierre-diagnostico/),
      expect.objectContaining({ maquina: "vib-motor-03" }),
    );
  });
});

describe("Avisos con una máquina configurada", () => {
  it("narra los riesgos de LA máquina", async () => {
    dominio = CONFIGURADA;
    montar(AvisosEva, { onNavigate: vi.fn() });

    await waitFor(() => expect(obtenerDiagnosticoNarrado).toHaveBeenCalled());
    expect(obtenerDiagnosticoNarrado).toHaveBeenCalledWith(
      expect.objectContaining({ sistema: "vib-motor-03" }),
    );
  });
});
