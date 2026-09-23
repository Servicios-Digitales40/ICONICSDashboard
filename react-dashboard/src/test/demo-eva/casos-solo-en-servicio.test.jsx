// @vitest-environment jsdom
/**
 * casos-solo-en-servicio.test.jsx — rama `Vibraciones1.0`, F1.
 *
 * ── LA DECISIÓN QUE FIJA ────────────────────────────────────────────
 *
 * «Casos previos» no mencionaba el tanque: pintaba el `sistema` de cada caso
 * GUARDADO, y la bitácora real TENÍA entonces 13 —once del tanque y dos de un
 * «grupo de bombeo» que ya no existe como id— y ninguno de vibraciones. (El
 * Plan 42.5 F3 dio al despliegue un guion para vaciarla; lo que esta prueba
 * fija no depende de cuántos haya.)
 *
 * Así que el arreglo no podía ser quitar una referencia: había que decidir qué
 * hacer con historia real. Se filtra la VISTA y no se toca el archivo.
 *
 * ── Y POR QUÉ EL VACÍO TIENE QUE EXPLICARSE ─────────────────────────
 *
 * Porque con el filtro puesto la pantalla queda vacía, y el mensaje que ya
 * había —«todavía no hay ninguna intervención registrada»— pasaría a ser
 * FALSO: los hay, de una máquina que no se está mirando. Es exactamente lo
 * que §2.4 prohíbe —disfrazar «no se muestra» de «no existe»— y es la parte de
 * este cambio que más fácil sería perder en una refactorización.
 *
 * ── LA MÁQUINA EN SERVICIO ES UNA CONFIGURADA (Plan 40 F3) ──────────
 *
 * La entrada `vibraciones` escrita a mano se retiró del registro: hoy toda
 * máquina de vibraciones es una CONFIGURADA, y la vista sabe cuáles están en
 * servicio por `useMaquina().enServicioIds`, que suma las configuradas a las
 * del registro. Aquí se simula ese contexto con una configurada de id
 * `vibraciones-configurada` —el de la espejo de pruebas—, que es lo que el
 * `MaquinaProvider` real daría con esa máquina en `maquinas.json`. El tanque
 * sigue cerrado y sigue sin aparecer en la lista, así que las dos mitades de
 * la prueba —se oculta lo cerrado, se enseña lo en servicio— siguen midiendo
 * lo mismo.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";

const { listarCasos, ID_CONFIGURADA } = vi.hoisted(() => ({
  listarCasos: vi.fn(),
  ID_CONFIGURADA: "vibraciones-configurada",
}));

vi.mock("@/lib/api/casosApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  listarCasos,
}));

/* Lo que daría el `MaquinaProvider` en una vista de planta (sin máquina en la
   ruta) con la espejo configurada: el registro no aporta ninguna en servicio
   —el tanque está cerrado— y la configurada se suma detrás. */
vi.mock("@/Demo-EVA/data/comunes/MaquinaContext.jsx", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useMaquina: () => ({ ...original.useMaquina(), enServicioIds: [ID_CONFIGURADA] }),
  };
});

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

  it("un caso de una máquina de vibraciones CONFIGURADA sí se pinta", async () => {
    /* Es la mitad que el Plan 40 F2 arregló en la vista: filtrando sólo por
       `SISTEMA_IDS_EN_SERVICIO`, el caso de una configurada desaparecía. */
    listarCasos.mockResolvedValue({ casos: [caso("c2", ID_CONFIGURADA)] });

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

    await waitFor(() => expect(screen.getByText(/de otras máquinas/i)).toBeTruthy());
    /* Dice CUÁNTOS hay guardados, no sólo que hay algunos. */
    expect(screen.getByText(/3 casos/)).toBeTruthy();
    /* Y nombra lo que de verdad falta, que es el objetivo de esta rama. */
    expect(screen.getByText(/para esta máquina/i)).toBeTruthy();
  });

  it("sin NINGÚN caso guardado, sí dice que la bitácora está vacía", async () => {
    // El otro lado: aquí «no hay ninguna intervención» es verdad y se dice.
    listarCasos.mockResolvedValue({ casos: [] });

    montar();

    await waitFor(() => expect(screen.getByText(/Todavía no hay ninguna intervención/i)).toBeTruthy());
    expect(screen.queryByText(/de otras máquinas/i)).toBeNull();
  });
});
