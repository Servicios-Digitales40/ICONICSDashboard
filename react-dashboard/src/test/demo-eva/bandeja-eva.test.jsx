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
  /* La vista lee la máquina de la pantalla por `useDominioVibracion` (Plan 38
     F2). Aquí es la escrita a mano, con el mismo dominio de mentira. */
  useDominioVibracion: () => ({
    ...useVibracion(),
    canalesMeta: [],
    maquina: { id: "vibraciones", nombre: null, configurada: false, area: null },
  }),
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

/**
 * Riesgos activos de LA máquina en servicio.
 *
 * ── POR QUÉ EXISTE ESTE HELPER (rama `Vibraciones1.0`) ─────────────
 *
 * Doce comprobaciones de este archivo montaban su escenario llamando a
 * `evaluarRiesgos` —el del tanque— directamente. Con la estación de llenado
 * cerrada, `BandejaEva` ya no lo evalúa, así que todas se quedaban sin nada
 * que enseñar.
 *
 * Se adapta en UN sitio en vez de reescribir doce: lo que esas pruebas afirman
 * —descartar es local, navegar también descarta, la severidad ordena, los
 * casos similares aparecen— no depende de qué máquina sea el riesgo.
 *
 * El nombre dice «en servicio» y no «vibraciones» a propósito: al reabrir el
 * tanque, esto vuelve a ser `evaluarRiesgos` y las doce siguen sirviendo sin
 * tocarlas otra vez.
 */
function conRiesgos(activos) {
  evaluarRiesgosVibracion.mockReturnValue({
    activos, noEvaluables: [], evaluadas: activos.length,
  });
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
  /*
   * ── OMITIDO: HACEN FALTA DOS MÁQUINAS (rama `Vibraciones1.0`) ──────
   *
   * Comprueba `NO_COMPARTEN`: que un riesgo del tanque y uno de vibraciones no
   * se confunden en la misma bandeja. Con la estación de llenado cerrada sólo
   * hay una, así que no queda con qué contrastar — no porque la regla haya
   * dejado de valer.
   *
   * Es de las primeras que hay que reactivar al reabrir: vigila un no
   * negociable (§2.1). Para reabrir: quitar el `.skip` y devolver el primer
   * `conRiesgos` a `evaluarRiesgos`.
   */
  it.skip("un riesgo del tanque y uno de vibraciones NO se confunden", async () => {
    enCalma();
    conRiesgos([{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "Nivel al 98%" }]);
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
    conRiesgos([
        { id: "leve", titulo: "Riesgo leve", severidad: "atencion", evidencia: "X" },
        { id: "grave", titulo: "Riesgo grave", severidad: "critico", evidencia: "Y" },
      ]);

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
    conRiesgos([{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "E" }]);

    montar();
    await waitFor(() => expect(screen.getByText("Riesgo de derrame")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Descartar/i }));

    await waitFor(() => expect(screen.getByText(/No hay hallazgos pendientes/)).toBeTruthy());
  });

  it("un hallazgo descartado sigue descartado tras remontar la pantalla", async () => {
    // Persiste entre visitas — el mismo criterio que "vistos" en Alarmas.
    enCalma();
    conRiesgos([{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "E" }]);

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
    conRiesgos([{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "E" }]);

    const onNavigate = vi.fn();
    montar(onNavigate);
    await waitFor(() => expect(screen.getByText("Riesgo de derrame")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Ver/i }));

    expect(onNavigate).toHaveBeenCalledWith("eva-riesgos-vibracion");
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
    conRiesgos([{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "E" }]);
    obtenerDiagnostico.mockResolvedValue({
      causas: [{ id: "derrame", casosCitados: [{ id: "c1", fecha: "2026-08-01", resuelto: true, resumen: "La válvula no cerró" }] }],
    });

    const onNavigate = vi.fn();
    montar(onNavigate);

    await waitFor(() => expect(screen.getByText(/Caso previo/)).toBeTruthy());

    const botones = screen.getAllByRole("button", { name: /Ver/i });
    fireEvent.click(botones[botones.length - 1]);

    expect(onNavigate).toHaveBeenCalledWith("cierre-diagnostico", { sistema: "vibraciones", riesgoId: "derrame" });
  });

  it("un caso similar NO lleva severidad inventada: no se pinta crítico ni atención por su cuenta", async () => {
    enCalma();
    conRiesgos([{ id: "derrame", titulo: "Riesgo de derrame", severidad: "informativo", evidencia: "E" }]);
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

/**
 * ── LA CUARTA PREGUNTA (PLAN 31 F1) ────────────────────────────────
 *
 * La tarjeta ya contestaba qué pasa, qué puede pasar y qué mirar. El «por qué
 * está pasando» lo calculaba el motor en esta misma pantalla desde hacía meses
 * —`obtenerDiagnostico` ya se llamaba— y se tiraba todo menos `casosCitados`.
 *
 * Lo que estas pruebas defienden no es que la línea exista, sino que dice la
 * verdad: la banda SIEMPRE con el título, un estado incompleto dicho en voz
 * alta, y silencio —no una causa inventada— cuando no hay diagnóstico.
 */
describe("la causa más respaldada se enseña, con su banda", () => {
  const conDiagnostico = (diagnostico) => {
    enCalma();
    conRiesgos([{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "E" }]);
    obtenerDiagnostico.mockResolvedValue(diagnostico);
  };

  it("la primera causa se pinta con su título y su banda", async () => {
    conDiagnostico({
      estado: "completo",
      causas: [
        { id: "fuga-red", titulo: "Fuga o rotura en la red", banda: "alto", casosCitados: [] },
        { id: "otra", titulo: "Otra cosa", banda: "bajo", casosCitados: [] },
      ],
    });

    montar();

    await waitFor(() => expect(screen.getByText("Fuga o rotura en la red")).toBeTruthy());
    expect(screen.getByText(/ALTO/i)).toBeTruthy();
    // Sólo la PRIMERA: la lista entera con su respaldo vive en Cierre de
    // diagnóstico, que es donde alguien va a elegir una.
    expect(screen.queryByText("Otra cosa")).toBeNull();
  });

  it("un diagnóstico PARCIAL lo dice: la banda sola se leería como completa", async () => {
    /*
     * Plan 28 F3. Es el defecto que esa fase arregló en el cierre de
     * diagnóstico, y aquí se repetiría igual: «ALTO» calculado sin los
     * manuales y «ALTO» con las cuatro fuentes se pintaban idénticos.
     */
    conDiagnostico({
      estado: "parcial",
      causas: [{ id: "fuga-red", titulo: "Fuga o rotura en la red", banda: "alto", casosCitados: [] }],
    });

    montar();

    await waitFor(() => expect(screen.getByText(/diagnóstico parcial/i)).toBeTruthy());
  });

  it("un diagnóstico COMPLETO no añade ninguna advertencia", async () => {
    conDiagnostico({
      estado: "completo",
      causas: [{ id: "fuga-red", titulo: "Fuga o rotura en la red", banda: "alto", casosCitados: [] }],
    });

    montar();

    await waitFor(() => expect(screen.getByText("Fuga o rotura en la red")).toBeTruthy());
    expect(screen.queryByText(/diagnóstico parcial|sin respaldo suficiente/i)).toBeNull();
  });

  it("un riesgo HUÉRFANO no inventa una causa: se calla y la tarjeta sigue sirviendo", async () => {
    // `causas: []` es un HECHO —se diagnosticó y no hay causas transcritas—,
    // no un fallo. La tarjeta sigue contestando las otras tres preguntas.
    conDiagnostico({ estado: "insuficiente", huerfano: true, causas: [] });

    montar();

    await waitFor(() => expect(screen.getByText("Riesgo de derrame")).toBeTruthy());
    expect(screen.queryByText(/Causa más respaldada/i)).toBeNull();
  });

  it("si el diagnóstico NO se pudo pedir, tampoco se inventa nada", async () => {
    enCalma();
    conRiesgos([{ id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "E" }]);
    obtenerDiagnostico.mockRejectedValue(new Error("el puente no contesta"));

    montar();

    await waitFor(() => expect(screen.getByText("Riesgo de derrame")).toBeTruthy());
    expect(screen.queryByText(/Causa más respaldada/i)).toBeNull();
  });
});

describe("ninguna petición de más: la llamada al motor ya se hacía", () => {
  it("se pide UNA vez por riesgo activo, no una por riesgo y otra por sus casos", async () => {
    /*
     * La afirmación de F1 que más fácil sería romper sin darse cuenta: el
     * diagnóstico y los casos citados salen de la MISMA respuesta, así que
     * enseñar la causa no puede costar una segunda llamada. Si alguien añade
     * un `obtenerDiagnostico` para la causa, esto lo atrapa.
     */
    enCalma();
    conRiesgos([
        { id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "E" },
        { id: "cavitacion", titulo: "Cavitación", severidad: "atencion", evidencia: "E" },
      ]);
    obtenerDiagnostico.mockResolvedValue({
      estado: "completo",
      causas: [{ id: "fuga-red", titulo: "Fuga o rotura en la red", banda: "alto", casosCitados: [] }],
    });

    montar();

    await waitFor(() => expect(screen.getAllByText("Fuga o rotura en la red").length).toBe(2));
    expect(obtenerDiagnostico).toHaveBeenCalledTimes(2);
  });
});

