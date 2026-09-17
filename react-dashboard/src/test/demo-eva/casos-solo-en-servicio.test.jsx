// @vitest-environment jsdom
/**
 * casos-solo-en-servicio.test.jsx — rama `Vibraciones1.0`, F1.
 *
 * ── LA DECISIÓN QUE FIJA ────────────────────────────────────────────
 *
 * «Casos previos» no mencionaba el tanque: pintaba el `sistema` de cada caso
 * GUARDADO, y la bitácora real tiene 13 —once del tanque y dos de un
 * «grupo de bombeo» que ya no existe como id— y ninguno de vibraciones.
 *
 * Así que el arreglo no podía ser quitar una referencia: había que decidir qué
 * hacer con historia real. Se filtra la VISTA y no se toca el archivo.
 *
 * ── Y POR QUÉ EL VACÍO TIENE QUE EXPLICARSE ─────────────────────────
 *
 * Porque con el filtro puesto la pantalla queda vacía, y el mensaje que ya
 * había —«todavía no hay ninguna intervención registrada»— pasaría a ser
 * FALSO: hay trece, de una máquina que no se está mirando. Es exactamente lo
 * que §2.4 prohíbe —disfrazar «no se muestra» de «no existe»— y es la parte de
 * este cambio que más fácil sería perder en una refactorización.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";

const { listarCasos } = vi.hoisted(() => ({ listarCasos: vi.fn() }));

vi.mock("@/lib/api/casosApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  listarCasos,
}));

import CasosRag from "@/Demo-EVA/views/comunes/CasosRag.jsx";

const caso = (id, sistema) => ({
  id,
  sistema,
  fecha: "2026-09-01T10:00:00.000Z",
  sintoma: `Sintoma de ${id}`,
  causa: "Una causa",
  origen: "form",
  resuelto: true,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const montar = () =>
  render(
    <ThemeProvider>
      <CasosRag />
    </ThemeProvider>
  );

describe("sólo se enseñan los casos de máquinas EN SERVICIO", () => {
  it("un caso de la estación de llenado NO se pinta", async () => {
    listarCasos.mockResolvedValue({ casos: [caso("c1", "tanque")] });

    montar();

    await waitFor(() => expect(screen.queryByText(/Leyendo la bitácora/i)).toBeNull());
    expect(screen.queryByText("Sintoma de c1")).toBeNull();
  });

  it("un caso de vibraciones SÍ se pinta", async () => {
    listarCasos.mockResolvedValue({ casos: [caso("c2", "vibraciones")] });

    montar();

    await waitFor(() => expect(screen.getByText("Sintoma de c2")).toBeTruthy());
  });

  it("un caso SIN sistema se pinta: es de la planta, no de una máquina cerrada", async () => {
    listarCasos.mockResolvedValue({ casos: [caso("c3", null)] });

    montar();

    await waitFor(() => expect(screen.getByText("Sintoma de c3")).toBeTruthy());
  });

  it("un `sistema` que ya no existe en el registro tampoco se pinta", async () => {
    /*
     * Medido en la bitácora real: dos casos llevan `sistema: "grupo de bombeo"`,
     * un id de antes de que el registro de sistemas se cerrara. No está en
     * servicio porque no está en `SISTEMA_IDS` siquiera, y el filtro lo trata
     * igual que al tanque — que es lo correcto: no se sabe de qué máquina es.
     */
    listarCasos.mockResolvedValue({ casos: [caso("c4", "grupo de bombeo")] });

    montar();

    await waitFor(() => expect(screen.queryByText(/Leyendo la bitácora/i)).toBeNull());
    expect(screen.queryByText("Sintoma de c4")).toBeNull();
  });
});

describe("el vacío dice POR QUÉ está vacío", () => {
  it("con casos ocultos, NO dice «no hay ninguna intervención»", async () => {
    /*
     * La afirmación central. Con 13 guardados y 0 visibles, el mensaje de
     * siempre seria falso — y un vacio que miente es peor que una lista larga.
     */
    listarCasos.mockResolvedValue({
      casos: [caso("c1", "tanque"), caso("c2", "tanque"), caso("c3", "grupo de bombeo")],
    });

    montar();

    await waitFor(() => expect(screen.getByText(/estación de llenado/i)).toBeTruthy());
    /* Dice CUÁNTOS hay guardados, no sólo que hay algunos. */
    expect(screen.getByText(/3 casos/)).toBeTruthy();
    /* Y nombra lo que de verdad falta, que es el objetivo de esta rama. */
    expect(screen.getByText(/sistema de vibraciones/i)).toBeTruthy();
  });

  it("sin NINGÚN caso guardado, sí dice que la bitácora está vacía", async () => {
    // El otro lado: aquí «no hay ninguna intervención» es verdad y se dice.
    listarCasos.mockResolvedValue({ casos: [] });

    montar();

    await waitFor(() => expect(screen.getByText(/Todavía no hay ninguna intervención/i)).toBeTruthy());
    expect(screen.queryByText(/estación de llenado/i)).toBeNull();
  });
});
