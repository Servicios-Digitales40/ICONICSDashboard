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
  /*
   * El hilo se persiste en `localStorage` desde que la conversación sobrevive a
   * cerrar el panel. Sin limpiarlo, cada prueba arranca con lo que dejó la
   * anterior y las consultas del DOM encuentran dos coincidencias del mismo
   * texto — que es exactamente cómo se detectó este acoplamiento.
   */
  window.localStorage.clear();
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
 * Un flujo SSE que se queda ABIERTO, con el mando para ir soltando eventos.
 *
 * Es el estado que dura entre 30 y 90 segundos en planta —el modelo pensando
 * y escribiendo— y el único desde el que se puede probar lo que pasa si el
 * usuario cancela o cierra el panel a mitad de la respuesta.
 */
function flujoAbierto() {
  const enc = new TextEncoder();
  let mando;

  const cuerpo = new ReadableStream({ start(c) { mando = c; } });
  const respuesta = new Response(cuerpo, { status: 200, headers: { "Content-Type": "text/event-stream" } });

  return {
    respuesta,
    emitir: (evento) => mando.enqueue(enc.encode(`data: ${JSON.stringify(evento)}\n\n`)),
    cerrar: () => mando.close(),
  };
}

/**
 * Backend cuyo POST responde distinto en cada llamada, para encadenar «esta
 * consulta se quedó a medias» con «la siguiente sí contestó».
 */
function backendPorTurnos(respuestas) {
  enviados = [];
  return vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    if (!init || init.method !== "POST") {
      return Promise.resolve(new Response(JSON.stringify({ ok: true, habilitado: true }), { status: 200 }));
    }
    enviados.push(JSON.parse(init.body));
    return Promise.resolve(respuestas[enviados.length - 1]);
  });
}

/**
 * Simula el backend: el GET dice si hay asistente, el POST devuelve el flujo.
 * @param {object} opciones
 * @param {boolean} opciones.habilitado
 * @param {object[]} [opciones.eventos]
 * @param {object} [opciones.fallo]  { status, error } para el POST
 */
/** Cuerpos de los POST que hizo el panel, para inspeccionar el historial. */
let enviados = [];

function backend({ habilitado, eventos = [], fallo }) {
  enviados = [];
  return vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    if (!init || init.method !== "POST") {
      return Promise.resolve(new Response(JSON.stringify({ ok: true, habilitado }), { status: 200 }));
    }
    enviados.push(JSON.parse(init.body));
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
  // Solo hay que abrirlo la primera vez; en las siguientes ya está abierto y
  // el botón flotante no existe.
  if (!screen.queryByRole("dialog")) {
    fireEvent.click(await screen.findByLabelText("Abrir Tdconcito"));
  }
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
    expect(screen.queryByLabelText("Abrir Tdconcito")).toBeNull();
  });

  it("si el backend no conoce la ruta, tampoco: el tablero sigue igual", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("404"));
    montar();

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByLabelText("Abrir Tdconcito")).toBeNull();
  });

  it("con modelo configurado aparece el botón, y abre el panel", async () => {
    backend({ habilitado: true });
    montar();

    fireEvent.click(await screen.findByLabelText("Abrir Tdconcito"));
    expect(screen.getByRole("dialog", { name: "Tdconcito" })).toBeTruthy();
    expect(screen.getByLabelText("Escribe tu pregunta")).toBeTruthy();
  });
});

describe("una respuesta", () => {
  it("pinta el texto que llega por el flujo", async () => {
    backend({
      habilitado: true,
      eventos: [
        { tipo: "estado", valor: "Consultando ICONICS…" },
        { tipo: "herramienta", nombre: "historia_de_senal" },
        { tipo: "texto", delta: "El OEE fue del " },
        { tipo: "texto", delta: "62,4 %." },
        { tipo: "fin", herramienta: "historia_de_senal", bloqueada: false },
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
        { tipo: "herramienta", nombre: "historia_de_senal" },
        { tipo: "texto", delta: "62,4 %." },
        { tipo: "fin", herramienta: "historia_de_senal", bloqueada: false },
      ],
    });
    montar();
    await preguntar();

    // Sin esta línea no hubo consulta a ICONICS, y esa es justo la señal que
    // permite detectar una respuesta recitada de memoria.
    await waitFor(() => expect(screen.getByText("Leyó el historiador")).toBeTruthy());
  });

  it("dice también CON QUÉ se consultó: señal y período", async () => {
    backend({
      habilitado: true,
      eventos: [
        {
          tipo: "herramienta",
          nombre: "historia_de_senal",
          argumentos: { senal: "nivel del tanque", periodo: "ayer" },
        },
        { tipo: "texto", delta: "62,4 %." },
        { tipo: "fin", herramienta: "historia_de_senal", bloqueada: false },
      ],
    });
    montar();
    await preguntar("¿OEE de la Línea 1 ayer?");

    // Saber que leyó el historiador no distingue una respuesta correcta de
    // una en la que el modelo entendió otra máquina u otro día. Los
    // argumentos con los que llamó a la herramienta sí.
    await waitFor(() =>
      expect(screen.getByText("Leyó el historiador · nivel del tanque · ayer")).toBeTruthy()
    );
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

  it("esperar turno se cuenta como espera, no como error", async () => {
    /*
     * El servidor ya no rechaza la segunda consulta con un 409: la encola y
     * anuncia el puesto en la fila. Eso NO es un fallo y no puede pintarse como
     * tal — un triángulo rojo por estar el segundo haría que la gente dejara de
     * preguntar cuando hay otra pantalla abierta, que es el caso normal.
     */
    backend({
      habilitado: true,
      eventos: [
        { tipo: "cola", porDelante: 2 },
        { tipo: "estado", valor: "Pensando…" },
        { tipo: "texto", delta: "El tanque está al 62 %." },
        { tipo: "fin", herramientas: ["estado_del_sistema"] },
      ],
    });
    montar();
    await preguntar();

    // La respuesta llega igual, sin rastro de error.
    await waitFor(() => expect(screen.getByText(/El tanque está al 62 %/)).toBeTruthy());
    expect(screen.queryByText(/otra consulta en curso/i)).toBeNull();
  });

  it("un error del servidor SÍ se enseña con su motivo", async () => {
    // El 503 se reserva para cuando la fila es tan larga que esperar deja de
    // tener sentido. Eso sí hay que contarlo.
    backend({
      habilitado: true,
      fallo: { status: 503, error: "Hay 8 consultas esperando. Inténtalo en un par de minutos." },
    });
    montar();
    await preguntar();

    await waitFor(() => expect(screen.getByText(/8 consultas esperando/i)).toBeTruthy());
  });

  it("la segunda pregunta lleva el hilo anterior", async () => {
    backend({
      habilitado: true,
      eventos: [
        { tipo: "herramienta", nombre: "historia_de_senal" },
        { tipo: "texto", delta: "Fue del 61,9 %." },
        { tipo: "fin", herramienta: "historia_de_senal", bloqueada: false },
      ],
    });
    montar();

    await preguntar("¿OEE de la Línea 1 el 30 de julio?");
    await waitFor(() => expect(screen.getByText(/61,9/)).toBeTruthy());

    // Sin esto, «¿y el día anterior?» llega al modelo sin contexto.
    await preguntar("¿y el día anterior?");
    await waitFor(() => expect(enviados.length).toBe(2));

    const { historial } = enviados[1];
    expect(historial).toEqual([
      { rol: "usuario", texto: "¿OEE de la Línea 1 el 30 de julio?" },
      { rol: "asistente", texto: "Fue del 61,9 %." },
    ]);
  });

  it("un turno BLOQUEADO no entra en el hilo", async () => {
    backend({
      habilitado: true,
      eventos: [
        { tipo: "texto", delta: "No he podido consultar los datos." },
        { tipo: "fin", herramienta: null, bloqueada: true },
      ],
    });
    montar();

    await preguntar("¿OEE de la Línea 1?");
    await waitFor(() => expect(screen.getByText(/no consultó los datos/i)).toBeTruthy());

    await preguntar("¿y la Línea 2?");
    await waitFor(() => expect(enviados.length).toBe(2));

    // Recordar como respuesta un turno en el que decidimos NO responder sería
    // contradecirse: la pregunta del usuario sí queda, la no-respuesta no.
    const roles = enviados[1].historial.map((t) => t.rol);
    expect(roles).toEqual(["usuario"]);
  });

  it("una respuesta cancelada a medias NO entra en el hilo", async () => {
    const enCurso = flujoAbierto();
    backendPorTurnos([
      enCurso.respuesta,
      flujo([
        { tipo: "herramienta", nombre: "historia_de_senal" },
        { tipo: "texto", delta: "Fue del 58,1 %." },
        { tipo: "fin", herramienta: "historia_de_senal", bloqueada: false },
      ]),
    ]);
    montar();

    await preguntar("¿OEE de la Línea 1 ayer?");
    enCurso.emitir({ tipo: "texto", delta: "El OEE fue del 6" });
    await waitFor(() => expect(screen.getByText(/El OEE fue del 6/)).toBeTruthy());

    fireEvent.click(screen.getByText("Cancelar"));
    await waitFor(() => expect(screen.getByText(/quedó a medias/i)).toBeTruthy());

    await preguntar("¿y anteayer?");
    await waitFor(() => expect(enviados.length).toBe(2));

    // «El OEE fue del 6» es media cifra. Recordarla como respuesta es
    // ofrecerle al modelo un 6 para que lo cite en el turno siguiente.
    const roles = enviados[1].historial.map((t) => t.rol);
    expect(roles).toEqual(["usuario"]);
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

describe("cuando la espera se tuerce", () => {
  it("cancelar no se cuenta como fallo, y deja repetir la pregunta", async () => {
    const enCurso = flujoAbierto();
    backendPorTurnos([
      enCurso.respuesta,
      flujo([
        { tipo: "herramienta", nombre: "historia_de_senal" },
        { tipo: "texto", delta: "Fue del 61,9 %." },
        { tipo: "fin", herramienta: "historia_de_senal", bloqueada: false },
      ]),
    ]);
    montar();

    await preguntar("¿OEE de la Línea 1 ayer?");
    await waitFor(() => expect(screen.getByText("Cancelar")).toBeTruthy());
    fireEvent.click(screen.getByText("Cancelar"));

    // Es una decisión del usuario: se cuenta en gris y sin triángulo de
    // aviso, que es el lenguaje de «algo se ha roto».
    await waitFor(() => expect(screen.getByText("Cancelaste la consulta.")).toBeTruthy());

    // Y los tres finales malos —cancelar, un 503 de cola llena, el corte
    // por tiempo— se arreglan repitiendo, no reescribiendo a mano.
    fireEvent.click(screen.getByText("Reintentar"));
    await waitFor(() => expect(enviados.length).toBe(2));

    expect(enviados[1].pregunta).toBe("¿OEE de la Línea 1 ayer?");
    expect(screen.getAllByText("¿OEE de la Línea 1 ayer?").length).toBe(1);
    await waitFor(() => expect(screen.getByText(/61,9/)).toBeTruthy());
  });

  it("si la respuesta llega con el panel cerrado, el botón lo avisa", async () => {
    const enCurso = flujoAbierto();
    backendPorTurnos([enCurso.respuesta]);
    montar();

    await preguntar();
    await waitFor(() => expect(screen.getByText("Cancelar")).toBeTruthy());

    // Cerrar y volver al tablero durante minuto y medio de espera es lo
    // natural; sin aviso, la respuesta se queda ahí sin que nadie la lea.
    fireEvent.click(screen.getByLabelText("Cerrar Tdconcito"));
    enCurso.emitir({ tipo: "texto", delta: "62,4 %." });
    enCurso.emitir({ tipo: "fin", herramienta: "historia_de_senal", bloqueada: false });
    enCurso.cerrar();

    expect(await screen.findByLabelText(/La respuesta está lista/)).toBeTruthy();
  });
});

describe("los ejemplos", () => {
  it("pulsar uno manda esa pregunta", async () => {
    backend({
      habilitado: true,
      eventos: [
        { tipo: "herramienta", nombre: "estado_del_sistema" },
        { tipo: "texto", delta: "La instalación está en banda, al 58 %." },
        { tipo: "fin", herramienta: "estado_del_sistema", bloqueada: false },
      ],
    });
    montar();
    fireEvent.click(await screen.findByLabelText("Abrir Tdconcito"));

    // Parece un botón de preguntar: pedir un segundo gesto para lo que ya se
    // había pulsado sobra.
    fireEvent.click(screen.getByText("¿Cómo va la instalación ahora mismo?"));

    await waitFor(() => expect(enviados.length).toBe(1));
    expect(enviados[0].pregunta).toBe("¿Cómo va la instalación ahora mismo?");
    await waitFor(() => expect(screen.getByText(/58 %/)).toBeTruthy());
  });

  it("no tira lo que estuvieras escribiendo", async () => {
    backend({ habilitado: true, eventos: [{ tipo: "fin", herramienta: null, bloqueada: false }] });
    montar();
    fireEvent.click(await screen.findByLabelText("Abrir Tdconcito"));

    const campo = screen.getByLabelText("Escribe tu pregunta");
    fireEvent.change(campo, { target: { value: "¿qué presión tiene la re" } });
    fireEvent.click(screen.getByText("¿Qué nivel tiene el tanque?"));

    await waitFor(() => expect(enviados.length).toBe(1));
    expect(enviados[0].pregunta).toBe("¿Qué nivel tiene el tanque?");
    // La pregunta que va es la del ejemplo, pero tirar lo que alguien estaba
    // escribiendo no es asunto de un botón de ayuda.
    expect(campo.value).toBe("¿qué presión tiene la re");
  });
});
