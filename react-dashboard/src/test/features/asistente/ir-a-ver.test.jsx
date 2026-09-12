// @vitest-environment jsdom
/**
 * ir-a-ver.test.jsx — Plan 25 F7 (`NUE-08`, la vuelta).
 *
 * ── QUÉ SE PRUEBA ────────────────────────────────────────────────────
 *
 * El botón «Ver en pantalla» que aparece bajo una respuesta cuando el
 * asistente llamó a una herramienta con destino conocido
 * (`navegacionDelAsistente.js`).
 *
 * Lo que más importa: el botón NO navega solo. Aparece, y la persona decide.
 * Mismo criterio que `pedirAlAsistente()` no manda nada hasta que alguien lo
 * llama desde una vista.
 */
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { Asistente } from "@/features/asistente";
import { EVENTO_NAVEGAR } from "@/features/asistente/lib/navegarDesdeAsistente.js";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const montar = () => render(<ThemeProvider><Asistente /></ThemeProvider>);

function flujo(eventos) {
  const cuerpo = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const e of eventos) controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      controller.close();
    },
  });
  return new Response(cuerpo, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function backend({ habilitado = true, eventos = [] }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    if (!init || init.method !== "POST") {
      return Promise.resolve(new Response(JSON.stringify({ ok: true, habilitado }), { status: 200 }));
    }
    return Promise.resolve(flujo(eventos));
  });
}

async function preguntar(texto = "¿cuál es la causa del derrame?") {
  if (!screen.queryByRole("dialog")) {
    fireEvent.click(await screen.findByLabelText("Abrir Tdconcito"));
  }
  fireEvent.change(screen.getByLabelText("Escribe tu pregunta"), { target: { value: texto } });
  fireEvent.click(screen.getByLabelText("Enviar la pregunta"));
}

describe("«Ver en pantalla» aparece con un destino conocido", () => {
  it("tras diagnosticar_falla(sistema, riesgoId), aparece el botón", async () => {
    backend({
      eventos: [
        { tipo: "herramienta", nombre: "diagnosticar_falla", argumentos: { sistema: "tanque", riesgoId: "derrame" } },
        { tipo: "texto", delta: "La causa más probable es una válvula atascada." },
        { tipo: "fin", herramienta: "diagnosticar_falla", bloqueada: false },
      ],
    });
    montar();
    await preguntar();

    await waitFor(() => expect(screen.getByText(/válvula atascada/)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Ver en pantalla/i })).toBeTruthy();
  });

  it("el botón NO navega solo: hace falta pulsarlo", async () => {
    /*
     * La aserción central de esta fase. Si el botón disparara el evento al
     * aparecer, sorprendería a media conversación — la persona podría seguir
     * preguntando sin que la pantalla cambiara debajo de ella.
     */
    backend({
      eventos: [
        { tipo: "herramienta", nombre: "diagnosticar_falla", argumentos: { sistema: "tanque", riesgoId: "derrame" } },
        { tipo: "texto", delta: "La causa es X." },
        { tipo: "fin", herramienta: "diagnosticar_falla", bloqueada: false },
      ],
    });

    const escuchado = vi.fn();
    window.addEventListener(EVENTO_NAVEGAR, escuchado);

    montar();
    await preguntar();
    await waitFor(() => expect(screen.getByRole("button", { name: /Ver en pantalla/i })).toBeTruthy());

    expect(escuchado).not.toHaveBeenCalled();
    window.removeEventListener(EVENTO_NAVEGAR, escuchado);
  });

  it("al pulsarlo, despacha el evento con la ruta y el riesgoId correctos", async () => {
    backend({
      eventos: [
        { tipo: "herramienta", nombre: "diagnosticar_falla", argumentos: { sistema: "tanque", riesgoId: "derrame" } },
        { tipo: "texto", delta: "La causa es X." },
        { tipo: "fin", herramienta: "diagnosticar_falla", bloqueada: false },
      ],
    });

    const escuchado = vi.fn();
    window.addEventListener(EVENTO_NAVEGAR, escuchado);

    montar();
    await preguntar();
    await waitFor(() => expect(screen.getByRole("button", { name: /Ver en pantalla/i })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Ver en pantalla/i }));

    expect(escuchado).toHaveBeenCalledTimes(1);
    expect(escuchado.mock.calls[0][0].detail).toEqual({
      ruta: "cierre-diagnostico",
      params: { sistema: "tanque", riesgoId: "derrame" },
    });

    window.removeEventListener(EVENTO_NAVEGAR, escuchado);
  });
});

describe("sin destino conocido, no hay botón que ofrecer", () => {
  it("una herramienta sin destino registrado no muestra «Ver en pantalla»", async () => {
    backend({
      eventos: [
        { tipo: "herramienta", nombre: "analisis_de_senal", argumentos: { senal: "nivel" } },
        { tipo: "texto", delta: "El análisis dice X." },
        { tipo: "fin", herramienta: "analisis_de_senal", bloqueada: false },
      ],
    });
    montar();
    await preguntar();

    await waitFor(() => expect(screen.getByText(/El análisis dice X/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Ver en pantalla/i })).toBeNull();
  });

  it("mientras la respuesta está en curso, tampoco aparece el botón", async () => {
    /*
     * `ocupado` fuerza `destino: null` explícitamente: mostrarlo a mitad de
     * respuesta invitaría a navegar antes de que el asistente termine de
     * decir con qué riesgo se quedó.
     */
    const enc = new TextEncoder();
    let mando;
    const cuerpo = new ReadableStream({ start(c) { mando = c; } });
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (!init || init.method !== "POST") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, habilitado: true }), { status: 200 }));
      }
      return Promise.resolve(
        new Response(cuerpo, { status: 200, headers: { "Content-Type": "text/event-stream" } })
      );
    });

    montar();
    await preguntar();
    mando.enqueue(
      enc.encode(
        `data: ${JSON.stringify({ tipo: "herramienta", nombre: "diagnosticar_falla", argumentos: { sistema: "tanque", riesgoId: "derrame" } })}\n\n`
      )
    );

    // La consulta ya llegó y se pinta en la traza — sin traducción registrada
    // para esta herramienta, aparece con su nombre crudo.
    await waitFor(() => expect(screen.getByText(/diagnosticar_falla/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Ver en pantalla/i })).toBeNull();

    mando.close();
  });
});
