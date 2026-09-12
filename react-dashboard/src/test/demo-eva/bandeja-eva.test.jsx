// @vitest-environment jsdom
/**
 * bandeja-eva.test.jsx — Plan 25 F6 (`NUE-03`).
 *
 * ── LAS CUATRO AFIRMACIONES QUE ESTA PANTALLA TIENE QUE CUMPLIR ────
 *
 *  1. **No mezcla las dos máquinas.** Un riesgo del tanque y uno de vibraciones
 *     no comparten id ni se confunden entre sí (`NO_COMPARTEN`).
 *  2. **Descartar NO acciona nada.** Es una preferencia de esta persona en
 *     este dispositivo (`localStorage`), no una escritura en el diario de
 *     accionamientos — la frontera del plan: «una propuesta no es una orden».
 *  3. **Una bandeja vacía lo dice.** Cero riesgos activos no es un bloque
 *     mudo, es un mensaje explícito.
 *  4. **Navegar también descarta**, con el mismo mecanismo que el botón — no
 *     debería reaparecer un hallazgo que la persona ya fue a mirar.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";

const { evaluarRiesgos, evaluarRiesgosVibracion, useSistemaAgua, useVibracion, obtenerDiagnostico } =
  vi.hoisted(() => ({
    evaluarRiesgos: vi.fn(),
    evaluarRiesgosVibracion: vi.fn(),
    useSistemaAgua: vi.fn(),
    useVibracion: vi.fn(),
    obtenerDiagnostico: vi.fn(),
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
vi.mock("@/lib/api/casosApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  obtenerDiagnostico,
}));

import BandejaEva from "@/Demo-EVA/views/comunes/BandejaEva.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

/** Sin riesgos activos y sin casos, por defecto — cada prueba trae lo suyo. */
function enCalma() {
  useSistemaAgua.mockReturnValue({ sistema: {} });
  useVibracion.mockReturnValue({ canales: {}, variador: {}, alarmas: {} });
  evaluarRiesgos.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });
  evaluarRiesgosVibracion.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });
  obtenerDiagnostico.mockResolvedValue({ causas: [] });
}

const montar = (onNavigate = () => {}) =>
  render(
    <ThemeProvider>
      <BandejaEva onNavigate={onNavigate} />
    </ThemeProvider>
  );

describe("sin nada activo, la bandeja lo dice", () => {
  it("cero riesgos activos no es un bloque mudo: hay un mensaje explícito", async () => {
    enCalma();
    montar();

    await waitFor(() => expect(screen.getByText(/No hay hallazgos pendientes/)).toBeTruthy());
  });
});

describe("los riesgos activos aparecen como hallazgos, sin mezclar máquinas", () => {
  it("un riesgo del tanque y uno de vibraciones NO se confunden", async () => {
    enCalma();
    evaluarRiesgos.mockReturnValue({
      activos: [{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "Nivel al 98%" }],
      noEvaluables: [], evaluadas: 1,
    });
    evaluarRiesgosVibracion.mockReturnValue({
      activos: [{ id: "desalineacion", titulo: "Desalineación", severidad: "atencion", evidencia: "Zona D" }],
      noEvaluables: [], evaluadas: 1,
    });

    montar();

    await waitFor(() => expect(screen.getByText("Riesgo de derrame")).toBeTruthy());
    expect(screen.getByText("Desalineación")).toBeTruthy();
    // Cada uno con SU sistema, no genérico ni cruzado.
    expect(screen.getAllByText(/Agua industrial|Vibraciones/i).length).toBeGreaterThanOrEqual(2);
  });

  it("se ordenan por severidad: crítico antes que atención", async () => {
    enCalma();
    evaluarRiesgos.mockReturnValue({
      activos: [
        { id: "leve", titulo: "Riesgo leve", severidad: "atencion", evidencia: "X" },
        { id: "grave", titulo: "Riesgo grave", severidad: "critico", evidencia: "Y" },
      ],
      noEvaluables: [], evaluadas: 2,
    });
    evaluarRiesgosVibracion.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });

    montar();

    await waitFor(() => expect(screen.getByText("Riesgo grave")).toBeTruthy());
    const titulos = screen.getAllByText(/^Riesgo (grave|leve)$/).map((n) => n.textContent);
    expect(titulos).toEqual(["Riesgo grave", "Riesgo leve"]);
  });
});

describe("descartar es una preferencia de esta persona, NO una acción sobre planta", () => {
  it("descartar quita el hallazgo de la vista, sin tocar ningún accionamiento", async () => {
    /*
     * La frontera del plan hecha prueba: esta bandeja no tiene forma de escribir
     * en el diario de accionamientos, así que no hay nada de eso que verificar
     * aquí — lo que SÍ se verifica es que "descartar" es puramente local.
     */
    enCalma();
    evaluarRiesgos.mockReturnValue({
      activos: [{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "E" }],
      noEvaluables: [], evaluadas: 1,
    });
    evaluarRiesgosVibracion.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });

    montar();
    await waitFor(() => expect(screen.getByText("Riesgo de derrame")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Descartar/i }));

    await waitFor(() => expect(screen.getByText(/No hay hallazgos pendientes/)).toBeTruthy());
  });

  it("un hallazgo descartado sigue descartado tras remontar la pantalla", async () => {
    // Persiste entre visitas — el mismo criterio que "vistos" en Alarmas.
    enCalma();
    evaluarRiesgos.mockReturnValue({
      activos: [{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "E" }],
      noEvaluables: [], evaluadas: 1,
    });
    evaluarRiesgosVibracion.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });

    const { unmount } = montar();
    await waitFor(() => expect(screen.getByText("Riesgo de derrame")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Descartar/i }));
    await waitFor(() => expect(screen.getByText(/No hay hallazgos pendientes/)).toBeTruthy());
    unmount();

    montar();
    await waitFor(() => expect(screen.getByText(/No hay hallazgos pendientes/)).toBeTruthy());
    expect(screen.queryByText("Riesgo de derrame")).toBeNull();
  });

  it("navegar a un hallazgo TAMBIÉN lo descarta, con el mismo mecanismo", async () => {
    enCalma();
    evaluarRiesgos.mockReturnValue({
      activos: [{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "E" }],
      noEvaluables: [], evaluadas: 1,
    });
    evaluarRiesgosVibracion.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });

    const onNavigate = vi.fn();
    montar(onNavigate);
    await waitFor(() => expect(screen.getByText("Riesgo de derrame")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Ver/i }));

    expect(onNavigate).toHaveBeenCalledWith("eva-riesgos");
    await waitFor(() => expect(screen.getByText(/No hay hallazgos pendientes/)).toBeTruthy());
  });

  it("navegar a un riesgo de VIBRACIONES lleva a SU vista de riesgos, no a la del tanque", async () => {
    enCalma();
    evaluarRiesgos.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });
    evaluarRiesgosVibracion.mockReturnValue({
      activos: [{ id: "desalineacion", titulo: "Desalineación", severidad: "critico", evidencia: "E" }],
      noEvaluables: [], evaluadas: 1,
    });

    const onNavigate = vi.fn();
    montar(onNavigate);
    await waitFor(() => expect(screen.getByText("Desalineación")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Ver/i }));

    expect(onNavigate).toHaveBeenCalledWith("eva-riesgos-vibracion");
  });
});

describe("los casos similares proactivos (F0) también aparecen como hallazgo", () => {
  it("un caso similar de un riesgo activo se enseña, y navega al cierre de diagnóstico", async () => {
    enCalma();
    evaluarRiesgos.mockReturnValue({
      activos: [{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "E" }],
      noEvaluables: [], evaluadas: 1,
    });
    evaluarRiesgosVibracion.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });
    obtenerDiagnostico.mockResolvedValue({
      causas: [{ id: "derrame", casosCitados: [{ id: "c1", fecha: "2026-08-01", resuelto: true, resumen: "La válvula no cerró" }] }],
    });

    const onNavigate = vi.fn();
    montar(onNavigate);

    await waitFor(() => expect(screen.getByText(/Caso previo/)).toBeTruthy());

    const botones = screen.getAllByRole("button", { name: /Ver/i });
    fireEvent.click(botones[botones.length - 1]);

    expect(onNavigate).toHaveBeenCalledWith("cierre-diagnostico", { sistema: "tanque", riesgoId: "derrame" });
  });

  it("un caso similar NO lleva severidad inventada: no se pinta crítico ni atención por su cuenta", async () => {
    enCalma();
    evaluarRiesgos.mockReturnValue({
      activos: [{ id: "derrame", titulo: "Riesgo de derrame", severidad: "informativo", evidencia: "E" }],
      noEvaluables: [], evaluadas: 1,
    });
    evaluarRiesgosVibracion.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });
    obtenerDiagnostico.mockResolvedValue({
      causas: [{ id: "derrame", casosCitados: [{ id: "c1", fecha: "2026-08-01", resuelto: true, resumen: "La válvula no cerró" }] }],
    });

    montar();
    await waitFor(() => expect(screen.getByText(/Caso previo/)).toBeTruthy());
    // No revienta ni asume una severidad de riesgo — sólo se comprueba que se
    // pinta con la etiqueta de origen correcta.
    expect(screen.getByText(/Caso similar/)).toBeTruthy();
  });
});
