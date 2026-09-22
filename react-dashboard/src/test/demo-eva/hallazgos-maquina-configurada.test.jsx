// @vitest-environment jsdom
/**
 * hallazgos-maquina-configurada.test.jsx
 * ------------------------------------------------------------------
 * Hallazgos y Avisos con una máquina CONFIGURADA delante. Plan 38 F2.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 *  1. **El diagnóstico se pide con el id de LA máquina**, no con
 *     `vibraciones`: es lo que el backend registra desde el Plan 38 F1 y lo
 *     que sus rutas ahora aceptan.
 *  2. **Navegar desde un hallazgo lleva el parámetro de máquina**: la vista de
 *     Riesgos es genérica (`maq-riesgos`) y sin él no hablaría de ninguna.
 *  3. **Los avisos se narran por la máquina de la pantalla.**
 *
 * ── LA MÁQUINA VIENE DEL CONTEXTO, NO DE LA PLANTA ─────────────────
 *
 * Es la ruta `maq-hallazgos` / `maq-avisos` con `?maquina=<id>`: la vista lee
 * la suya por `useDominioVibracion()` y NO agrega las demás. Por eso aquí
 * `useMaquinasEnVivo()` se finge vacío: si la vista lo mirara con una máquina
 * delante, mezclaría la pantalla de una máquina con las de todas (Plan 40 F2).
 *
 * ── LA NARRACIÓN, CON EL HOOK DE PLANTA REAL, NO ARRANCA ───────────
 *
 * Con el `useMaquinasEnVivo` REAL, «narra los riesgos de LA máquina» fallaba:
 * `obtenerDiagnosticoNarrado` no se llamaba nunca aunque la lista se pintara.
 * `useAvisosNarrados` saca los pendientes de DENTRO del actualizador de
 * `setAvisos`, y eso sólo funciona si React lo ejecuta en el acto; basta un
 * `setState` anterior en el mismo efecto de montaje —`setEstados({})` de
 * `useMaquinasEnVivo`, o la primera instantánea de la fuente en
 * `useDominioVibracion`— para que lo difiera, `pendientes` quede vacío y no
 * se narre nada. Está reportado como defecto de `AvisosEva.jsx` en el Plan 40
 * F2; esta prueba lo deja fuera fingiendo el hook de planta, que es lo que
 * de todos modos corresponde a esta pantalla.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let dominio = null;
vi.mock("@/Demo-EVA/data/vibraciones/vibracion.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useDominioVibracion: () => dominio,
}));
vi.mock("@/Demo-EVA/data/comunes/maquinasEnVivo.js", () => ({
  useMaquinasEnVivo: () => [],
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

    /* El primer botón de la primera tarjeta es «ir a mirarlo»: la vista de
       Riesgos genérica, con la máquina en el parámetro. */
    const botones = await screen.findAllByRole("button");
    fireEvent.click(botones[0]);
    expect(onNavigate).toHaveBeenCalledWith("maq-riesgos", { maquina: "vib-motor-03" });
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
