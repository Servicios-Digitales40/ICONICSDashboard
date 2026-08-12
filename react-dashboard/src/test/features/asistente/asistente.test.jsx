// @vitest-environment jsdom
/**
 * asistente.test.jsx
 * ------------------------------------------------------------------
 * El panel del asistente: cuándo aparece, qué enseña mientras espera y qué
 * hace cuando la respuesta no es de fiar.
 *
 * ── POR QUÉ ESTAS PRUEBAS ──────────────────────────────────────────
 *
 * Tres de ellas fijan invariantes del Plan 6 que no se ven mirando la
 * pantalla en un día normal:
 *
 *  1. Sin modelo configurado en el servidor, el asistente NO EXISTE. Es lo
 *     que garantiza que el mismo bundle sirva para una planta con asistente y
 *     para otra sin él, y que el tablero no dependa de que llama-server viva.
 *  2. Debajo de cada respuesta se dice de dónde salió el dato. Sin esa línea
 *     no hubo consulta, y es lo único que delata una respuesta recitada.
 *  3. Una respuesta bloqueada —el modelo contestó sin consultar— se anuncia
 *     como tal. Es el fallo de arrancar llama-server sin `--jinja`.
 */
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { Asistente } from "@/features/asistente";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom no implementa scrollIntoView, y el panel lo llama al llegar texto.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const montar = () => render(<ThemeProvider><Asistente /></ThemeProvider>);

/** Respuesta SSE con los eventos indicados, como la que emite /api/chat. */
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

/**
 * Simula el backend: el GET dice si hay asistente, el POST devuelve el flujo.
 * @param {object} opciones
 * @param {boolean} opciones.habilitado
 * @param {object[]} [opciones.eventos]
 * @param {object} [opciones.fallo]  { status, error } para el POST
 */
function backend({ habilitado, eventos = [], fallo }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    if (!init || init.method !== "POST") {
      return Promise.resolve(new Response(JSON.stringify({ ok: true, habilitado }), { status: 200 }));
    }
    if (fallo) {
      return Promise.resolve(
        new Response(JSON.stringify({ ok: false, error: fallo.error }), { status: fallo.status })
      );
    }
    return Promise.resolve(flujo(eventos));
  });
}

/**
 * Abre el panel y envía una pregunta.
 *
 * Con `fireEvent` y no con `user-event`: la suite no trae esa dependencia y
 * aquí no hace falta: no se prueba ningún comportamiento que dependa de la
 * secuencia real de teclas, solo el efecto de enviar.
 */
async function preguntar(texto = "¿OEE de la Línea 1?") {
  fireEvent.click(await screen.findByLabelText("Abrir el asistente"));
  fireEvent.change(screen.getByLabelText("Escribe tu pregunta"), { target: { value: texto } });
  fireEvent.click(screen.getByLabelText("Enviar la pregunta"));
}

describe("cuándo existe el asistente", () => {
  it("sin modelo configurado en el servidor, no se pinta nada", async () => {
    backend({ habilitado: false });
    montar();

    // Se espera a que la comprobación termine para no confundir «aún no
    // sabemos» con «no hay».
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByLabelText("Abrir el asistente")).toBeNull();
  });

  it("si el backend no conoce la ruta, tampoco: el tablero sigue igual", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("404"));
    montar();

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByLabelText("Abrir el asistente")).toBeNull();
  });

  it("con modelo configurado aparece el botón, y abre el panel", async () => {
    backend({ habilitado: true });
    montar();

    fireEvent.click(await screen.findByLabelText("Abrir el asistente"));
    expect(screen.getByRole("dialog", { name: "Asistente de planta" })).toBeTruthy();
    expect(screen.getByLabelText("Escribe tu pregunta")).toBeTruthy();
  });
});

describe("una respuesta", () => {
  it("pinta el texto que llega por el flujo", async () => {
    backend({
      habilitado: true,
      eventos: [
        { tipo: "estado", valor: "Consultando ICONICS…" },
        { tipo: "herramienta", nombre: "oee_de_maquina" },
        { tipo: "texto", delta: "El OEE fue del " },
        { tipo: "texto", delta: "62,4 %." },
        { tipo: "fin", herramienta: "oee_de_maquina", bloqueada: false },
      ],
    });
    montar();
    await preguntar();

    await waitFor(() => expect(screen.getByText(/62,4 %/)).toBeTruthy());
  });

  it("dice DE DÓNDE salió el dato", async () => {
    backend({
      habilitado: true,
      eventos: [
        { tipo: "herramienta", nombre: "oee_de_maquina" },
        { tipo: "texto", delta: "62,4 %." },
        { tipo: "fin", herramienta: "oee_de_maquina", bloqueada: false },
      ],
    });
    montar();
    await preguntar();

    // Sin esta línea no hubo consulta a ICONICS, y esa es justo la señal que
    // permite detectar una respuesta recitada de memoria.
    await waitFor(() => expect(screen.getByText("Leyó el historiador")).toBeTruthy());
  });

  it("una respuesta BLOQUEADA se anuncia (llama-server sin --jinja)", async () => {
    backend({
      habilitado: true,
      eventos: [
        { tipo: "texto", delta: "No he podido consultar los datos de la planta." },
        { tipo: "fin", herramienta: null, bloqueada: true },
      ],
    });
    montar();
    await preguntar();

    await waitFor(() =>
      expect(screen.getByText(/no consultó los datos de la planta/i)).toBeTruthy()
    );
  });

  it("un 409 se enseña con su motivo, no como un fallo genérico", async () => {
    backend({
      habilitado: true,
      fallo: { status: 409, error: "Hay otra consulta en curso. El asistente atiende una cada vez." },
    });
    montar();
    await preguntar();

    await waitFor(() => expect(screen.getByText(/otra consulta en curso/i)).toBeTruthy());
  });

  it("mientras espera ofrece cancelar, no una barra muda", async () => {
    // Un POST que no resuelve: es el estado «esperando al modelo», que con
    // este hardware dura entre 30 y 90 segundos.
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (!init || init.method !== "POST") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, habilitado: true }), { status: 200 }));
      }
      return new Promise(() => {});
    });

    montar();
    await preguntar();

    await waitFor(() => expect(screen.getByText("Cancelar")).toBeTruthy());
    expect(screen.getByText("Enviando…")).toBeTruthy();
  });
});
