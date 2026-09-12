// @vitest-environment jsdom
/**
 * cuaderno-eva.test.jsx — Plan 25 F8 (`NUE-10`).
 *
 * ── LAS CUATRO AFIRMACIONES QUE ESTA PANTALLA TIENE QUE CUMPLIR ────
 *
 *  1. **No hay campo de autor.** La persona no puede firmar su propia nota —
 *     eso lo pone el servidor, y esta pantalla ni siquiera lo intenta pedir.
 *  2. **Una nota vacía o de sólo espacios no se envía.**
 *  3. **Un fallo al guardar se dice, y el texto NO se pierde**, para que
 *     reintentar no obligue a reescribirlo.
 *  4. **Sin notas, la pantalla lo dice** en vez de una lista muda.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";

const { leerCuaderno, escribirEnCuaderno } = vi.hoisted(() => ({
  leerCuaderno: vi.fn(),
  escribirEnCuaderno: vi.fn(),
}));

vi.mock("@/lib/api/cuadernoApi.js", () => ({ leerCuaderno, escribirEnCuaderno }));

import CuadernoEva from "@/Demo-EVA/views/comunes/CuadernoEva.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const montar = () => render(<ThemeProvider><CuadernoEva /></ThemeProvider>);

describe("no hay ningún campo para firmar la nota", () => {
  it("el formulario no ofrece escribir un nombre o autor", async () => {
    leerCuaderno.mockResolvedValue({ entradas: [] });
    montar();

    await waitFor(() => expect(screen.getByText(/Todavía no hay ninguna nota/)).toBeTruthy());
    // Ni un campo de texto, ni un `input` que pudiera llamarse "autor".
    expect(screen.queryByLabelText(/autor/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/tu nombre/i)).toBeNull();
  });
});

describe("una nota vacía no se envía", () => {
  it("el botón de guardar está deshabilitado sin texto", async () => {
    leerCuaderno.mockResolvedValue({ entradas: [] });
    montar();

    await waitFor(() => expect(screen.getByRole("button", { name: /Guardar nota/i })).toBeTruthy());
    expect(screen.getByRole("button", { name: /Guardar nota/i }).disabled).toBe(true);
  });

  it("escribir sólo espacios tampoco habilita el envío", async () => {
    leerCuaderno.mockResolvedValue({ entradas: [] });
    montar();

    await waitFor(() => expect(screen.getByPlaceholderText(/Cambié el filtro/)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/Cambié el filtro/), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: /Guardar nota/i }).disabled).toBe(true);
  });
});

describe("guardar una nota", () => {
  it("con texto, el botón se habilita y al pulsar se envía sólo el texto y el sistema", async () => {
    leerCuaderno.mockResolvedValue({ entradas: [] });
    escribirEnCuaderno.mockResolvedValue({ ok: true });
    montar();

    await waitFor(() => expect(screen.getByPlaceholderText(/Cambié el filtro/)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/Cambié el filtro/), { target: { value: "Cambié el filtro" } });

    const boton = screen.getByRole("button", { name: /Guardar nota/i });
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);

    await waitFor(() => expect(escribirEnCuaderno).toHaveBeenCalled());
    // Ni autor ni instante: sólo lo que la persona controla.
    expect(escribirEnCuaderno.mock.calls[0][0]).toEqual({ texto: "Cambié el filtro", sistema: undefined });
  });

  it("tras guardar, el campo se vacía", async () => {
    leerCuaderno.mockResolvedValue({ entradas: [] });
    escribirEnCuaderno.mockResolvedValue({ ok: true });
    montar();

    await waitFor(() => expect(screen.getByPlaceholderText(/Cambié el filtro/)).toBeTruthy());
    const campo = screen.getByPlaceholderText(/Cambié el filtro/);
    fireEvent.change(campo, { target: { value: "Nota de prueba" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar nota/i }));

    await waitFor(() => expect(campo.value).toBe(""));
  });

  it("si falla al guardar, se dice el error y el texto NO se pierde", async () => {
    /*
     * La aserción central: al revés que un accionamiento sobre planta, aquí no
     * hay «ya pasó» que proteger. Perder el texto obligaría a reescribir la
     * nota entera para reintentar.
     */
    leerCuaderno.mockResolvedValue({ entradas: [] });
    escribirEnCuaderno.mockRejectedValue(new Error("ECONNREFUSED"));
    montar();

    await waitFor(() => expect(screen.getByPlaceholderText(/Cambié el filtro/)).toBeTruthy());
    const campo = screen.getByPlaceholderText(/Cambié el filtro/);
    fireEvent.change(campo, { target: { value: "Se perdería si fallara" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar nota/i }));

    await waitFor(() => expect(screen.getByText(/No se pudo guardar la nota/)).toBeTruthy());
    expect(campo.value).toBe("Se perdería si fallara");
  });
});

describe("sin notas, la pantalla lo dice", () => {
  it("una lista vacía se anuncia, no queda muda", async () => {
    leerCuaderno.mockResolvedValue({ entradas: [] });
    montar();

    await waitFor(() => expect(screen.getByText(/Todavía no hay ninguna nota/)).toBeTruthy());
  });

  it("con notas, se pintan con su instante y su autor — puestos por el servidor", async () => {
    leerCuaderno.mockResolvedValue({
      entradas: [{ texto: "Cambié el filtro", instante: "2026-09-12T08:00:00Z", autor: "ana" }],
    });
    montar();

    await waitFor(() => expect(screen.getByText("Cambié el filtro")).toBeTruthy());
    expect(screen.getByText(/ana/)).toBeTruthy();
  });

  it("un fallo al leer las notas se dice, no se confunde con «sin notas»", async () => {
    leerCuaderno.mockRejectedValue(new Error("ECONNREFUSED"));
    montar();

    await waitFor(() => expect(screen.getByText(/No se pudieron leer las notas/)).toBeTruthy());
    expect(screen.queryByText(/Todavía no hay ninguna nota/)).toBeNull();
  });
});
