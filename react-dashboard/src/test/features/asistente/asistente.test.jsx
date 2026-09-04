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
  /*
   * Ya no hay que abrir nada: desde la Fase 5 del Plan 20 el asistente ES la
   * pantalla, no un panel que se despliega desde un botón flotante. Se espera
   * al campo, que sólo aparece cuando el servidor ha dicho que hay modelo.
   */
  const campo = await screen.findByLabelText("Escribe tu pregunta");
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.click(screen.getByLabelText("Enviar la pregunta"));
}

describe("cuándo existe el asistente", () => {
  /*
   * Sigue decidiendo el servidor, y sigue importando: sin `IA_BASE` esta
   * aplicación no tiene NADA que enseñar —es una sola vista y esa vista es el
   * chat—, así que pintar un campo de preguntas inerte sería prometer algo que
   * el backend no puede cumplir.
   */
  it("sin modelo configurado en el servidor, no se pinta nada", async () => {
    backend({ habilitado: false });
    montar();

    // Se espera a que la comprobación termine para no confundir «aún no
    // sabemos» con «no hay».
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByLabelText("Escribe tu pregunta")).toBeNull();
  });

  it("si el backend no conoce la ruta, tampoco", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("404"));
    montar();

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByLabelText("Escribe tu pregunta")).toBeNull();
  });

  it("con modelo configurado, la pantalla ES la conversación", async () => {
    backend({ habilitado: true });
    montar();

    /*
     * No hay botón que pulsar ni diálogo que abrir. El campo está ahí desde el
     * primer fotograma útil, que es la diferencia entre un panel y una
     * aplicación.
     */
    expect(await screen.findByLabelText("Escribe tu pregunta")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("los seis ejemplos se ofrecen antes de la primera pregunta", async () => {
    /*
     * Detrás hay veintidós herramientas y el técnico no puede adivinarlas. El
     * quinto es el que más trabajo hace: es el único que enseña que al
     * asistente se le puede CONTAR algo, no sólo preguntarle.
     */
    backend({ habilitado: true });
    montar();

    await screen.findByLabelText("Escribe tu pregunta");
    expect(screen.getByText("Ya cambié la histéresis, apúntalo")).toBeTruthy();
    expect(screen.getByText("¿Por qué se disparó el riesgo de cavitación?")).toBeTruthy();
  });

  it("la cabecera enseña quién está dentro y cómo salir", async () => {
    backend({ habilitado: true });
    const salir = vi.fn();
    render(
      <ThemeProvider>
        <Asistente usuario="ana.tecnica" salir={salir} />
      </ThemeProvider>
    );

    await screen.findByLabelText("Escribe tu pregunta");
    expect(screen.getByText("ana.tecnica")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Cerrar sesión"));
    expect(salir).toHaveBeenCalledOnce();
  });

  it("sin usuario, la cabecera no finge uno anónimo", async () => {
    /*
     * `features/asistente/` no sabe que existe la autenticación: recibe el
     * usuario por props. Sin él no pinta el bloque — no inventa un «invitado».
     */
    backend({ habilitado: true });
    montar();

    await screen.findByLabelText("Escribe tu pregunta");
    expect(screen.queryByLabelText("Cerrar sesión")).toBeNull();
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

  it("si la respuesta llega con un cajón tapando el hilo, el cajón lo avisa", async () => {
    /*
     * El panel ya no se cierra —es la aplicación— pero el problema sobrevive
     * con otro disfraz: consultar un manual mientras se espera es exactamente
     * lo que alguien hace durante minuto y medio de espera, y sin aviso la
     * respuesta se queda ahí sin que nadie la lea.
     *
     * El cajón NO se cierra solo al llegar: eso sería arrancarle de las manos
     * a alguien lo que estaba leyendo. Ofrece el camino de vuelta.
     */
    const enCurso = flujoAbierto();
    backendPorTurnos([enCurso.respuesta]);
    montar();

    await preguntar();
    await waitFor(() => expect(screen.getByText("Cancelar")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Manuales (panel lateral)"));
    expect(screen.getByRole("dialog", { name: "Manuales" })).toBeTruthy();

    enCurso.emitir({ tipo: "texto", delta: "62,4 %." });
    enCurso.emitir({ tipo: "fin", herramienta: "historia_de_senal", bloqueada: false });
    enCurso.cerrar();

    const volver = await screen.findByText("Respuesta lista");
    fireEvent.click(volver);
    expect(screen.queryByRole("dialog")).toBeNull();
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
    await screen.findByLabelText("Escribe tu pregunta");

    // Parece un botón de preguntar: pedir un segundo gesto para lo que ya se
    // había pulsado sobra.
    fireEvent.click(screen.getByText("¿Cómo está el tanque ahora mismo?"));

    await waitFor(() => expect(enviados.length).toBe(1));
    expect(enviados[0].pregunta).toBe("¿Cómo está el tanque ahora mismo?");
    await waitFor(() => expect(screen.getByText(/58 %/)).toBeTruthy());
  });

  it("no tira lo que estuvieras escribiendo", async () => {
    backend({ habilitado: true, eventos: [{ tipo: "fin", herramienta: null, bloqueada: false }] });
    montar();

    const campo = await screen.findByLabelText("Escribe tu pregunta");
    fireEvent.change(campo, { target: { value: "¿qué presión tiene la re" } });
    fireEvent.click(screen.getByText("¿Cuánto subió la temperatura esta semana?"));

    await waitFor(() => expect(enviados.length).toBe(1));
    expect(enviados[0].pregunta).toBe("¿Cuánto subió la temperatura esta semana?");
    // La pregunta que va es la del ejemplo, pero tirar lo que alguien estaba
    // escribiendo no es asunto de un botón de ayuda.
    expect(campo.value).toBe("¿qué presión tiene la re");
  });
});

/**
 * ── EL SELECTOR DE MODELO ──────────────────────────────────────────
 *
 * Lo que estas pruebas fijan no es que el desplegable se pinte, sino las dos
 * cosas que lo hacen honesto:
 *
 *  1. Que sólo aparece cuando de verdad HAY elección. El servidor puede estar
 *     arrancado con un solo modelo (`-m ruta.gguf`), y ahí el campo `model` de
 *     la petición se ignora: un selector prometería un cambio que no ocurre.
 *  2. Que enseña el modelo que CONFIRMA el servidor, no el que se pulsó. Como
 *     el modelo es uno solo para todo el servidor, un cambio puede fallar
 *     —otra pantalla tiene una consulta en curso— y entonces el rótulo tiene
 *     que seguir diciendo cuál responde de verdad.
 */
describe("el selector de modelo", () => {
  /** Backend con catálogo de modelos y un PUT que puede aceptar o rechazar. */
  function backendConModelos({ modelos, activo, rechazo }) {
    const puestos = [];
    const espia = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (init?.method === "PUT") {
        puestos.push(JSON.parse(init.body).modelo);
        if (rechazo) {
          return Promise.resolve(
            new Response(JSON.stringify({ ok: false, error: rechazo }), { status: 409 })
          );
        }
        const pedido = puestos[puestos.length - 1];
        return Promise.resolve(new Response(JSON.stringify({ ok: true, modelo: pedido }), { status: 200 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, habilitado: true, modelo: activo, modelos }), { status: 200 })
      );
    });
    return { espia, puestos };
  }

  const abrir = async () => { await screen.findByLabelText("Escribe tu pregunta"); };
  const selector = () => screen.queryByLabelText(/Modelo de IA/);

  it("con un solo modelo servido no se ofrece ninguna elección", async () => {
    // El caso de `llama-server -m ruta.gguf`: el backend manda `modelos: []`.
    backendConModelos({ modelos: [], activo: "local" });
    montar();
    await abrir();

    expect(selector()).toBeNull();
  });

  it("un backend anterior a esta función no rompe el panel", async () => {
    // `modelos` no viaja en la respuesta. Antes de esto el panel hacía
    // `.length` sobre `undefined` y se caía entero, que es mucho peor que no
    // tener selector.
    backend({ habilitado: true });
    montar();
    await abrir();

    expect(selector()).toBeNull();
    expect(screen.getByLabelText("Escribe tu pregunta")).toBeTruthy();
  });

  it("con varios modelos aparece el desplegable con el activo elegido", async () => {
    backendConModelos({ modelos: ["qwen-3.5-4B", "qwen-3.5-9B"], activo: "qwen-3.5-4B" });
    montar();
    await abrir();

    await waitFor(() => expect(selector()).toBeTruthy());
    expect(selector().value).toBe("qwen-3.5-4B");
    expect([...selector().options].map((o) => o.value)).toEqual(["qwen-3.5-4B", "qwen-3.5-9B"]);
  });

  it("elegir otro lo manda al servidor y enseña el que él confirma", async () => {
    const { puestos } = backendConModelos({ modelos: ["qwen-3.5-4B", "qwen-3.5-9B"], activo: "qwen-3.5-4B" });
    montar();
    await abrir();

    await waitFor(() => expect(selector()).toBeTruthy());
    fireEvent.change(selector(), { target: { value: "qwen-3.5-9B" } });

    await waitFor(() => expect(puestos).toEqual(["qwen-3.5-9B"]));
    await waitFor(() => expect(selector().value).toBe("qwen-3.5-9B"));
  });

  it("si el servidor lo rechaza, dice por qué y NO miente sobre cuál responde", async () => {
    const rechazo = "Hay una consulta en curso. El modelo se cambia para todas las pantallas.";
    backendConModelos({ modelos: ["qwen-3.5-4B", "qwen-3.5-9B"], activo: "qwen-3.5-4B", rechazo });
    montar();
    await abrir();

    await waitFor(() => expect(selector()).toBeTruthy());
    fireEvent.change(selector(), { target: { value: "qwen-3.5-9B" } });

    // El motivo se enseña tal cual lo manda el backend: «hay una consulta en
    // curso» y «ese modelo no existe» se arreglan de formas distintas.
    await waitFor(() => expect(screen.getByText(rechazo)).toBeTruthy());
    // Y el rótulo vuelve al que de verdad va a contestar. Dejarlo en el que se
    // pulsó sería el fallo que este selector existe para no cometer.
    expect(selector().value).toBe("qwen-3.5-4B");
  });

  it("no se puede cambiar de modelo con una consulta en curso", async () => {
    // Cambiarlo a mitad de turno parte el bucle por dentro: la pasada de
    // herramientas iría con un modelo y la de redactar con otro.
    const abierto = flujoAbierto();
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (init?.method === "POST") return Promise.resolve(abierto.respuesta);
      return Promise.resolve(new Response(JSON.stringify({
        ok: true, habilitado: true, modelo: "qwen-3.5-4B", modelos: ["qwen-3.5-4B", "qwen-3.5-9B"],
      }), { status: 200 }));
    });
    montar();
    await abrir();

    await waitFor(() => expect(selector()).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Escribe tu pregunta"), { target: { value: "hola" } });
    fireEvent.click(screen.getByLabelText("Enviar la pregunta"));

    await waitFor(() => expect(selector().disabled).toBe(true));
    abierto.cerrar();
  });
});

/**
 * ── EXPORTAR LA CONVERSACIÓN A PDF ──────────────────────────────────
 *
 * `POST /api/chat/exportar` es JSON simple, no el flujo SSE de `/api/chat`:
 * el mock de `fetch` de este bloque distingue las dos rutas por la URL, algo
 * que `backend()` no necesita hacer porque nunca la ejercita.
 */
describe("exportar la conversación a PDF", () => {
  /** @param {{url?:string, status?:number, error?:string}} [opciones] */
  function backendConExportar(opciones = {}) {
    return vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (typeof url === "string" && url.includes("/api/chat/exportar")) {
        if (opciones.error) {
          return Promise.resolve(
            new Response(JSON.stringify({ ok: false, error: opciones.error }), { status: opciones.status ?? 400 })
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, url: opciones.url ?? "/api/reportes?id=abc" }), { status: 200 })
        );
      }
      if (!init || init.method !== "POST") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, habilitado: true }), { status: 200 }));
      }
      return Promise.resolve(flujo([{ tipo: "fin", herramienta: null, bloqueada: false }]));
    });
  }

  it("está deshabilitado sin mensajes", async () => {
    backendConExportar();
    montar();
    await screen.findByLabelText("Escribe tu pregunta");

    expect(screen.getByLabelText("Exportar la conversación a PDF").disabled).toBe(true);
  });

  it("con mensajes, el clic llama a POST /api/chat/exportar con el historial", async () => {
    backendConExportar();
    montar();
    await preguntar("hola");
    await waitFor(() => expect(screen.getByLabelText("Exportar la conversación a PDF").disabled).toBe(false));

    fireEvent.click(screen.getByLabelText("Exportar la conversación a PDF"));

    await waitFor(() => {
      const llamada = globalThis.fetch.mock.calls.find(([u]) => String(u).includes("/api/chat/exportar"));
      expect(llamada).toBeTruthy();
      expect(llamada[1].method).toBe("POST");
      const cuerpo = JSON.parse(llamada[1].body);
      expect(cuerpo.historial.some((t) => t.rol === "usuario" && t.texto === "hola")).toBe(true);
    });
  });

  it("una respuesta {ok:true, url} abre esa URL", async () => {
    backendConExportar({ url: "/api/reportes?id=xyz" });
    const abrir = vi.spyOn(window, "open").mockImplementation(() => {});
    montar();
    await preguntar("hola");
    await waitFor(() => expect(screen.getByLabelText("Exportar la conversación a PDF").disabled).toBe(false));

    fireEvent.click(screen.getByLabelText("Exportar la conversación a PDF"));

    await waitFor(() => expect(abrir).toHaveBeenCalledWith("/api/reportes?id=xyz", "_blank"));
  });

  it("un error del backend se pinta tal cual", async () => {
    backendConExportar({ error: "No hay conversación que exportar.", status: 400 });
    montar();
    await preguntar("hola");
    await waitFor(() => expect(screen.getByLabelText("Exportar la conversación a PDF").disabled).toBe(false));

    fireEvent.click(screen.getByLabelText("Exportar la conversación a PDF"));

    await waitFor(() => expect(screen.getByText(/No hay conversación que exportar\./)).toBeTruthy());
  });

  it("mientras exporta, el botón muestra el spinner y queda deshabilitado", async () => {
    let resolver;
    const promesa = new Promise((resolve) => { resolver = resolve; });
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (typeof url === "string" && url.includes("/api/chat/exportar")) return promesa;
      if (!init || init.method !== "POST") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, habilitado: true }), { status: 200 }));
      }
      return Promise.resolve(flujo([{ tipo: "fin", herramienta: null, bloqueada: false }]));
    });
    montar();
    await preguntar("hola");
    await waitFor(() => expect(screen.getByLabelText("Exportar la conversación a PDF").disabled).toBe(false));

    fireEvent.click(screen.getByLabelText("Exportar la conversación a PDF"));

    await waitFor(() => expect(screen.getByLabelText("Exportar la conversación a PDF").disabled).toBe(true));

    resolver(new Response(JSON.stringify({ ok: true, url: "/api/reportes?id=abc" }), { status: 200 }));
  });
});
