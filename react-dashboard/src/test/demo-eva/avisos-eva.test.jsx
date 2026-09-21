// @vitest-environment jsdom
/**
 * avisos-eva.test.jsx — Plan 31 F2.
 *
 * ── LAS AFIRMACIONES QUE ESTA PANTALLA TIENE QUE CUMPLIR ────────────
 *
 *  1. **Sin servidor de IA la vista sigue sirviendo.** Es la condición que
 *     hace aceptable meter un modelo aquí: el diagnóstico determinista se
 *     enseña igual, y se dice que no se pudo redactar. Una pantalla en blanco
 *     porque el modelo no contestó convertiría una mejora en una fragilidad.
 *  2. **La narración no sustituye al dato, lo acompaña.** El párrafo del
 *     modelo y la ficha del motor se enseñan JUNTOS. Es lo que permite ver que
 *     el párrafo dice lo que el motor decidió — y el 03-09-2026 el modelo
 *     escribió «3 casos previos» sobre `respaldo.casos: 0`.
 *  3. **Ningún botón acciona planta.** Se navega a donde se puede actuar; no
 *     hay maniobra propia de esta pantalla.
 *  4. **Un riesgo que falló se sigue enseñando.** Saltárselo escondería un
 *     riesgo activo por un fallo de red, que es justo al revés de lo que debe
 *     hacer una pantalla de avisos.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";

const { evaluarRiesgos, evaluarRiesgosVibracion, useSistemaAgua, useVibracion, obtenerDiagnosticoNarrado } =
  vi.hoisted(() => ({
    evaluarRiesgos: vi.fn(),
    evaluarRiesgosVibracion: vi.fn(),
    useSistemaAgua: vi.fn(),
    useVibracion: vi.fn(),
    obtenerDiagnosticoNarrado: vi.fn(),
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
  obtenerDiagnosticoNarrado,
}));

import AvisosEva from "@/Demo-EVA/views/comunes/AvisosEva.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const RIESGO = { id: "fuga-en-red", titulo: "Posible fuga en la red", severidad: "critico", evidencia: "Caudal alto con presión baja" };

const DIAGNOSTICO = {
  ok: true,
  estado: "completo",
  causas: [{ id: "fuga-red", titulo: "Fuga o rotura en la red", banda: "alto" }],
};

/*
 * ── EL ESCENARIO ES DE VIBRACIONES (rama `Vibraciones1.0`) ──────────
 *
 * Estos helpers colocaban el riesgo en el TANQUE, y la vista ya no lo evalúa:
 * con la estación de llenado cerrada, `AvisosEva` sólo mira vibraciones. Doce
 * de las catorce comprobaciones de este archivo se quedaban sin nada que
 * enseñar.
 *
 * Se ADAPTA y no se omite: lo que prueban —que la narración acompaña al dato,
 * que sin LLM la vista sigue sirviendo, que un aviso sobrevive a su riesgo, que
 * ningún botón acciona planta— no depende de qué máquina sea. Cambia el
 * escenario, no la afirmación.
 *
 * Al reabrir, basta con devolver estos dos helpers al tanque.
 */
function conUnRiesgo() {
  useSistemaAgua.mockReturnValue({ sistema: {} });
  useVibracion.mockReturnValue({ canales: {}, variador: {}, alarmas: {} });
  evaluarRiesgos.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });
  evaluarRiesgosVibracion.mockReturnValue({ activos: [RIESGO], noEvaluables: [], evaluadas: 1 });
}

/**
 * Apaga el riesgo, como haría el siguiente sondeo.
 *
 * El snapshot tiene que cambiar de IDENTIDAD, no sólo de contenido: la vista
 * memoiza `evaluarRiesgosVibracion({canales, variador, alarmas})` con esos
 * objetos de dependencia —que es lo correcto, porque esa evaluación corre en
 * cada lectura de ICONICS— así que devolver siempre el mismo `{}` dejaría el
 * memo congelado y la prueba estaría midiendo el memo en vez del ciclo de vida.
 */
function apagarElRiesgo() {
  useVibracion.mockReturnValue({ canales: { t: Date.now() }, variador: {}, alarmas: {} });
  evaluarRiesgosVibracion.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 1 });
}

const remontar = (rerender, onNavigate = () => {}) =>
  rerender(
    <ThemeProvider>
      <AvisosEva onNavigate={onNavigate} />
    </ThemeProvider>
  );

const montar = (onNavigate = () => {}) =>
  render(
    <ThemeProvider>
      <AvisosEva onNavigate={onNavigate} />
    </ThemeProvider>
  );

describe("sin nada activo, la vista lo dice", () => {
  it("cero riesgos no es un bloque mudo, y no llama al modelo", async () => {
    useSistemaAgua.mockReturnValue({ sistema: {} });
    useVibracion.mockReturnValue({ canales: {}, variador: {}, alarmas: {} });
    evaluarRiesgos.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });
    evaluarRiesgosVibracion.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });

    montar();

    await waitFor(() => expect(screen.getByText(/Nada que avisar/i)).toBeTruthy());
    expect(obtenerDiagnosticoNarrado).not.toHaveBeenCalled();
  });
});

describe("la narración acompaña al dato, no lo sustituye", () => {
  it("se enseñan JUNTOS el párrafo del modelo y la causa del motor", async () => {
    /*
     * La afirmación central de §2.3 en esta pantalla. La ficha determinista es
     * lo que permite comprobar que el párrafo dice lo que el motor decidió: sin
     * ella, un «3 casos previos» inventado sería indistinguible de uno real.
     */
    conUnRiesgo();
    obtenerDiagnosticoNarrado.mockResolvedValue({
      ...DIAGNOSTICO,
      narracion: "Caudal alto con presión baja: lo más respaldado es una fuga en la red.",
    });

    montar();

    await waitFor(() => expect(screen.getByText(/lo más respaldado es una fuga/i)).toBeTruthy());
    // Y la ficha, con su banda, en la misma tarjeta. `^ALTO$` y no /ALTO/i: la
    // evidencia del riesgo dice «Caudal alto», y un aserto laxo pasaría por esa
    // palabra sin comprobar que la BANDA está.
    expect(screen.getByText("Fuga o rotura en la red")).toBeTruthy();
    expect(screen.getByText(/^ALTO$/i)).toBeTruthy();
  });
});

describe("sin servidor de IA, la vista sigue siendo útil", () => {
  it("sin narración se enseña el diagnóstico igual, y se dice que no se redactó", async () => {
    conUnRiesgo();
    obtenerDiagnosticoNarrado.mockResolvedValue({
      ...DIAGNOSTICO,
      narracion: null,
      sinNarracion: "sin_servidor",
    });

    montar();

    // El dato está.
    await waitFor(() => expect(screen.getByText("Fuga o rotura en la red")).toBeTruthy());
    expect(screen.getByText(/^ALTO$/i)).toBeTruthy();
    // Y la ausencia se dice, en vez de dejar creer que no había nada que contar.
    expect(screen.getByText(/No se pudo redactar el aviso/i)).toBeTruthy();
  });

  it("un riesgo cuyo diagnóstico FALLA se sigue enseñando, con su evidencia", async () => {
    // Saltárselo escondería un riesgo activo por un fallo de red.
    conUnRiesgo();
    obtenerDiagnosticoNarrado.mockRejectedValue(new Error("el puente no contesta"));

    montar();

    await waitFor(() => expect(screen.getByText("Posible fuga en la red")).toBeTruthy());
    expect(screen.getByText("Caudal alto con presión baja")).toBeTruthy();
    expect(screen.getByText(/No se pudo diagnosticar/i)).toBeTruthy();
  });

  it("un riesgo HUÉRFANO lo dice, sin inventar una causa", async () => {
    conUnRiesgo();
    obtenerDiagnosticoNarrado.mockResolvedValue({
      ok: true, causas: [], huerfano: true, narracion: null, sinNarracion: "sin_causas",
      aviso: "Este riesgo no tiene causas candidatas, y es correcto que no las tenga.",
    });

    montar();

    await waitFor(() => expect(screen.getByText(/no tiene causas candidatas/i)).toBeTruthy());
    expect(screen.queryByText(/Causa más respaldada/i)).toBeNull();
  });
});

describe("un diagnóstico incompleto no se pinta como completo", () => {
  it("un `estado` parcial se dice (Plan 28 F3)", async () => {
    conUnRiesgo();
    obtenerDiagnosticoNarrado.mockResolvedValue({
      ...DIAGNOSTICO, estado: "parcial", narracion: "Algo pasa.",
    });

    montar();

    await waitFor(() => expect(screen.getByText(/diagnóstico parcial/i)).toBeTruthy());
  });
});

describe("un aviso NO acciona planta", () => {
  it("los botones navegan, y ninguno es una maniobra", async () => {
    conUnRiesgo();
    obtenerDiagnosticoNarrado.mockResolvedValue({ ...DIAGNOSTICO, narracion: "x" });

    const onNavigate = vi.fn();
    montar(onNavigate);
    await waitFor(() => expect(screen.getByText("Fuga o rotura en la red")).toBeTruthy());

    /*
     * Plan 31 §2.2. No hay «encender», «apagar», «abrir» ni «cerrar» en ningún
     * botón: lo único que acciona planta es `ControlesTanque`, y a ella se
     * llega navegando.
     */
    for (const boton of screen.getAllByRole("button")) {
      expect(boton.textContent).not.toMatch(/encender|apagar|abrir|cerrar válvula/i);
    }

    fireEvent.click(screen.getByRole("button", { name: /Ver el diagnóstico/i }));
    expect(onNavigate).toHaveBeenCalledWith("cierre-diagnostico", {
      sistema: "vibraciones", riesgoId: "fuga-en-red",
    });
  });

  it("«Ver riesgos» lleva a la vista de LA MÁQUINA del aviso, no a la otra", async () => {
    useSistemaAgua.mockReturnValue({ sistema: {} });
    useVibracion.mockReturnValue({ canales: {}, variador: {}, alarmas: {} });
    evaluarRiesgos.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });
    evaluarRiesgosVibracion.mockReturnValue({
      activos: [{ id: "desalineacion", titulo: "Desalineación", severidad: "critico", evidencia: "Zona D" }],
      noEvaluables: [], evaluadas: 1,
    });
    obtenerDiagnosticoNarrado.mockResolvedValue({ ...DIAGNOSTICO, narracion: "x" });

    const onNavigate = vi.fn();
    montar(onNavigate);
    await waitFor(() => expect(screen.getByText("Desalineación")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Ver riesgos/i }));
    expect(onNavigate).toHaveBeenCalledWith("eva-riesgos-vibracion");
  });
});

/**
 * ── EL CICLO DE VIDA EN LA PANTALLA (PLAN 31 F3) ───────────────────
 *
 * El ciclo lo decide `shared/eva/comun/avisos.js` y se prueba aparte, sin React
 * (`avisos-ciclo.test.js`). Lo que se comprueba AQUÍ es lo que sólo se ve en la
 * pantalla: que un aviso resuelto se distingue de uno vigente, y que «leído» no
 * apaga un riesgo que sigue activo.
 */
describe("un aviso sobrevive a su riesgo, y se nota que es pasado", () => {
  it("el riesgo se apaga: el aviso sigue, marcado y sin color de severidad", async () => {
    conUnRiesgo();
    obtenerDiagnosticoNarrado.mockResolvedValue({ ...DIAGNOSTICO, narracion: "Hay una fuga." });

    const { rerender } = montar();
    await waitFor(() => expect(screen.getByText("Fuga o rotura en la red")).toBeTruthy());

    // Ahora el riesgo deja de estar activo.
    apagarElRiesgo();
    remontar(rerender);

    /*
     * Sigue ahí —es la decisión del 15-09-2026: un riesgo de veinte minutos de
     * madrugada no puede desaparecer sin dejar rastro— pero DICHO, porque si no
     * la vista mezclaría presente y pasado con el mismo aspecto.
     */
    await waitFor(() => expect(screen.getByText(/Ya no está activo/i)).toBeTruthy());
    expect(screen.getByText("Posible fuga en la red")).toBeTruthy();
  });

  it("«ya no está activo» NO dice «resuelto»: nadie ha confirmado nada", async () => {
    /*
     * El riesgo pudo dejar de cumplirse porque se arregló, porque se paró la
     * bomba o porque el sensor dejó de dar dato. El texto no promete cuál (§2.5).
     */
    conUnRiesgo();
    obtenerDiagnosticoNarrado.mockResolvedValue({ ...DIAGNOSTICO, narracion: "x" });

    const { rerender } = montar();
    await waitFor(() => expect(screen.getByText("Fuga o rotura en la red")).toBeTruthy());

    apagarElRiesgo();
    remontar(rerender);

    await waitFor(() => expect(screen.getByText(/Ya no está activo/i)).toBeTruthy());
    expect(screen.queryByText(/^Resuelto$|arreglad/i)).toBeNull();
  });
});

describe("«leído» no apaga un riesgo", () => {
  it("marcar leído un aviso VIGENTE lo deja en la lista", async () => {
    conUnRiesgo();
    obtenerDiagnosticoNarrado.mockResolvedValue({ ...DIAGNOSTICO, narracion: "x" });

    montar();
    await waitFor(() => expect(screen.getByText("Fuga o rotura en la red")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^Leído$/i }));

    // Sigue: su riesgo no ha desaparecido, y «visto» es de esta persona, no de
    // la planta.
    expect(screen.getByText("Posible fuga en la red")).toBeTruthy();
    // Pero el botón ya no se ofrece dos veces.
    expect(screen.queryByRole("button", { name: /^Leído$/i })).toBeNull();
  });

  it("un aviso leído Y apagado desaparece: ya no hay nada pendiente", async () => {
    conUnRiesgo();
    obtenerDiagnosticoNarrado.mockResolvedValue({ ...DIAGNOSTICO, narracion: "x" });

    const { rerender } = montar();
    await waitFor(() => expect(screen.getByText("Fuga o rotura en la red")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^Leído$/i }));

    apagarElRiesgo();
    remontar(rerender);

    await waitFor(() => expect(screen.getByText(/Nada que avisar/i)).toBeTruthy());
  });
});

describe("no se narra más de lo necesario", () => {
  it("se pide UNA vez por riesgo activo", async () => {
    useSistemaAgua.mockReturnValue({ sistema: {} });
    useVibracion.mockReturnValue({ canales: {}, variador: {}, alarmas: {} });
    evaluarRiesgos.mockReturnValue({ activos: [], noEvaluables: [], evaluadas: 0 });
    evaluarRiesgosVibracion.mockReturnValue({
      activos: [RIESGO, { ...RIESGO, id: "desbalance", titulo: "Desbalance" }],
      noEvaluables: [], evaluadas: 2,
    });
    obtenerDiagnosticoNarrado.mockResolvedValue({ ...DIAGNOSTICO, narracion: "x" });

    montar();

    await waitFor(() => expect(screen.getAllByText("Fuga o rotura en la red").length).toBe(2));
    expect(obtenerDiagnosticoNarrado).toHaveBeenCalledTimes(2);
  });

  it("el idioma de la pantalla viaja en la petición", async () => {
    // Un aviso en inglés bajo una interfaz en español es el defecto que
    // `verificar-i18n` persigue; aquí el idioma lo manda la pantalla.
    conUnRiesgo();
    obtenerDiagnosticoNarrado.mockResolvedValue({ ...DIAGNOSTICO, narracion: "x" });

    montar();

    await waitFor(() => expect(obtenerDiagnosticoNarrado).toHaveBeenCalled());
    expect(obtenerDiagnosticoNarrado.mock.calls[0][0]).toMatchObject({
      sistema: "vibraciones", riesgoId: "fuga-en-red", idioma: expect.stringMatching(/^(es|en)$/),
    });
  });
});
