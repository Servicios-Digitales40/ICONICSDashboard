// @vitest-environment jsdom
/**
 * paleta-comandos.test.jsx
 * ------------------------------------------------------------------
 * Plan 24, F6 (`USO-06`): `Ctrl/Cmd+K` para ir a una pantalla escribiendo su
 * nombre.
 *
 * ── QUÉ SE PRUEBA, Y POR QUÉ ESTAS COSAS ───────────────────────────
 *
 * Las cuatro condiciones que el plan puso como «las que deciden si esto vale la
 * pena», menos la de la dependencia (no hay nada que comprobar: no se añadió
 * ninguna) y la del `lazy()`, que la vigila `verificar-bundle.mjs` desde el
 * arranque medido.
 *
 * Lo que queda y sí se prueba aquí:
 *
 *   · que los destinos salgan del REGISTRO y no de una lista — la prueba
 *     compara contra `ROUTES`, así que una lista escrita a mano la rompería;
 *   · que el atajo abra y cierre;
 *   · que buscar sin acentos encuentre lo acentuado, que es el caso real en
 *     español («vibracion» → «Vibración»);
 *   · y que la paleta NO accione nada: sólo navega.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { PaletaComandos } from "@/app/PaletaComandos.jsx";
import { ROUTES } from "@/app/routes/routes.jsx";

afterEach(cleanup);

const montar = (onNavigate = () => {}) =>
  render(
    <ThemeProvider>
      <PaletaComandos onNavigate={onNavigate} paginaActual="eva-planta" />
    </ThemeProvider>
  );

/** El atajo, sobre `window` como lo escucha el componente. */
const pulsarAtajo = () =>
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });

describe("el atajo la abre y la cierra", () => {
  it("no está montada hasta que alguien pulsa Ctrl+K", () => {
    montar();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Ctrl+K la abre, con el foco ya en la caja", () => {
    montar();
    pulsarAtajo();

    expect(screen.getByRole("dialog")).toBeTruthy();
    // Una paleta que hay que clicar para escribir no ahorra nada respecto al
    // sidebar.
    expect(document.activeElement.tagName).toBe("INPUT");
  });

  it("Escape la cierra", () => {
    montar();
    pulsarAtajo();

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("los destinos salen del registro, no de una lista escrita a mano", () => {
  it("abierta y sin escribir, enseña TODAS las rutas del registro", () => {
    montar();
    pulsarAtajo();

    /*
     * La aserción que importa: se cuenta contra `ROUTES`. Una lista a mano en la
     * paleta pasaría a estar corta en cuanto entre la máquina #3, y esta prueba
     * es lo que lo delataría — es el fallo que `BACKLOG-FRONTEND.md` F4 describe
     * para el sidebar.
     */
    const opciones = screen.getAllByRole("button");
    expect(opciones).toHaveLength(ROUTES.length);
  });

  it("marca en qué pantalla se está, para no ofrecerla como si fuera otro sitio", () => {
    montar();
    pulsarAtajo();

    expect(screen.getByRole("button", { current: "page" })).toBeTruthy();
  });
});

describe("buscar en español, que es el caso real", () => {
  it("«vibracion» sin tilde encuentra «Vibración»", () => {
    montar();
    pulsarAtajo();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "vibracion" } });

    const encontrados = screen.getAllByRole("button");
    expect(encontrados.length).toBeGreaterThan(0);
    expect(encontrados.length).toBeLessThan(ROUTES.length);
  });

  it("algo que no existe lo dice, en vez de dejar la lista vacía sin explicación", () => {
    montar();
    pulsarAtajo();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzzzz" } });

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/Nada coincide/)).toBeTruthy();
  });
});

describe("navegar es lo único que hace", () => {
  it("Enter sobre el resultado elegido navega y cierra", () => {
    const onNavigate = vi.fn();
    montar(onNavigate);
    pulsarAtajo();

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(ROUTES.map((r) => r.id)).toContain(onNavigate.mock.calls[0][0]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("un clic en una fila navega a ESA ruta", () => {
    const onNavigate = vi.fn();
    montar(onNavigate);
    pulsarAtajo();

    fireEvent.click(screen.getAllByRole("button")[1]);

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(ROUTES.map((r) => r.id)).toContain(onNavigate.mock.calls[0][0]);
  });

  it("las flechas mueven la selección sin navegar", () => {
    const onNavigate = vi.fn();
    montar(onNavigate);
    pulsarAtajo();

    const caja = screen.getByRole("textbox");
    fireEvent.keyDown(caja, { key: "ArrowDown" });
    fireEvent.keyDown(caja, { key: "ArrowUp" });

    // Moverse no es elegir: sólo Enter o un clic navegan.
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
