// @vitest-environment jsdom
/**
 * La conversación guardada.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 * Lo que se rompe en silencio al persistir un hilo:
 *
 *  - Que un turno a medias —cerrar la pestaña mientras el modelo escribe— se
 *    restaure como si fuera una respuesta. Media frase suele cortarse dentro
 *    de una cifra, y esa cifra a medias es lo peor que puede reaparecer en la
 *    pantalla de un operador.
 *  - Que un `localStorage` lleno o bloqueado tumbe el chat entero. En
 *    navegación privada, escribir puede lanzar; el chat tiene que seguir
 *    funcionando sin memoria.
 *  - Que lo guardado con una forma vieja se pinte con el código nuevo.
 *  - Que restaurar pierda la procedencia del dato. Sin la línea de «de dónde
 *    salió esto», una cifra recuperada es menos fiable que la original.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { borrar, cargar, guardar } from "@/features/asistente/lib/persistencia.js";

const turnoUsuario = (texto) => ({ rol: "usuario", texto });

const turnoAsistente = (texto, extra = {}) => ({
  rol: "asistente",
  texto,
  consultas: [],
  adjuntos: [],
  bloqueada: false,
  sinRespuesta: false,
  cancelado: false,
  error: null,
  ...extra,
});

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("guardar y recuperar", () => {
  it("un intercambio completo vuelve entero", () => {
    guardar([
      turnoUsuario("¿qué nivel tiene el tanque?"),
      turnoAsistente("El tanque está al 62 %."),
    ]);

    const recuperado = cargar();
    expect(recuperado).toHaveLength(2);
    expect(recuperado[0]).toMatchObject({ rol: "usuario", texto: "¿qué nivel tiene el tanque?" });
    expect(recuperado[1]).toMatchObject({ rol: "asistente", texto: "El tanque está al 62 %." });
  });

  it("la procedencia del dato sobrevive", () => {
    // Es la línea que permite creerse una cifra. Un hilo restaurado sin ella
    // sería menos fiable que el original, y sin manera de saberlo.
    const consultas = [{ nombre: "historia_de_senal", argumentos: { senal: "nivel", periodo: "ayer" } }];
    guardar([turnoUsuario("¿y ayer?"), turnoAsistente("Estuvo entre 52 y 68.", { consultas })]);

    expect(cargar()[1].consultas).toEqual(consultas);
  });

  it("los gráficos adjuntos también", () => {
    const adjuntos = [{ tipo: "grafico", formato: "svg", contenido: "<svg/>", titulo: "Nivel" }];
    guardar([turnoUsuario("dibuja el nivel"), turnoAsistente("Aquí lo tienes.", { adjuntos })]);

    expect(cargar()[1].adjuntos).toEqual(adjuntos);
  });

  it("un turno restaurado nunca queda marcado como cancelado", () => {
    // Si volviera como cancelado, el panel ofrecería «Reintentar» sobre una
    // pregunta que ya no está en vuelo: un botón que promete lo que no puede.
    guardar([turnoUsuario("algo"), turnoAsistente("Respuesta completa.")]);
    expect(cargar()[1].cancelado).toBe(false);
  });
});

describe("lo que NO se guarda", () => {
  it("un turno del asistente vacío se descarta", () => {
    // Es el turno que queda al cerrar la pestaña antes de que empiece a
    // escribir. Restaurarlo pintaría una burbuja vacía indistinguible de una
    // avería.
    guardar([turnoUsuario("pregunta"), turnoAsistente("")]);

    const recuperado = cargar();
    expect(recuperado).toHaveLength(1);
    expect(recuperado[0].rol).toBe("usuario");
  });

  it("un turno cancelado se descarta aunque llegara a escribir", () => {
    // Una respuesta cortada acaba a menudo dentro de una cifra («el nivel
    // llegó a 6»), y esa cifra a medias no puede reaparecer como un dato.
    guardar([turnoUsuario("pregunta"), turnoAsistente("El nivel llegó a 6", { cancelado: true })]);

    expect(cargar()).toHaveLength(1);
  });

  it("un hilo sin nada aprovechable no deja rastro", () => {
    window.localStorage.setItem("tdconcito.conversacion.v1", "[]");
    guardar([turnoAsistente("")]);
    expect(cargar()).toEqual([]);
  });
});

describe("cuando el almacenamiento falla", () => {
  it("guardar no lanza si está lleno o bloqueado", () => {
    // Navegación privada, cuota agotada, cookies de terceros bloqueadas dentro
    // de un iframe. El chat tiene que seguir: perder la memoria es un
    // inconveniente, tumbar una consulta en curso es una avería.
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    expect(() => guardar([turnoUsuario("hola"), turnoAsistente("qué tal")])).not.toThrow();
  });

  it("un JSON corrupto devuelve un hilo vacío, no revienta", () => {
    // Pasa con una escritura cortada a la mitad al cerrar el navegador.
    window.localStorage.setItem("tdconcito.conversacion.v1", '[{"rol":"usuario","tex');
    expect(cargar()).toEqual([]);
  });

  it("algo que no es una lista se ignora", () => {
    window.localStorage.setItem("tdconcito.conversacion.v1", '{"rol":"usuario"}');
    expect(cargar()).toEqual([]);
  });

  it("un turno guardado sin los campos que el panel recorre no lo rompe", () => {
    // El componente recorre `consultas` y `adjuntos` sin comprobar, así que
    // restaurar sin ellos reventaría al pintar.
    window.localStorage.setItem(
      "tdconcito.conversacion.v1",
      JSON.stringify([{ rol: "asistente", texto: "sin campos" }])
    );

    const [turno] = cargar();
    expect(turno.consultas).toEqual([]);
    expect(turno.adjuntos).toEqual([]);
  });
});

describe("el tope", () => {
  it("un hilo larguísimo se recorta por el final, que es lo reciente", () => {
    const largos = [];
    for (let i = 0; i < 60; i++) largos.push(turnoUsuario(`pregunta ${i}`));
    guardar(largos);

    const recuperado = cargar();
    expect(recuperado.length).toBeLessThanOrEqual(40);
    // Lo que sobrevive es el final: nadie repasa sesenta turnos hacia atrás, y
    // el servidor sólo recuerda los ocho últimos de todos modos.
    expect(recuperado.at(-1).texto).toBe("pregunta 59");
  });
});

describe("borrar", () => {
  it("deja el hilo vacío de verdad", () => {
    // Sin esto, el botón de la papelera vaciaba la pantalla y la conversación
    // reaparecía al recargar.
    guardar([turnoUsuario("hola"), turnoAsistente("qué tal")]);
    borrar();
    expect(cargar()).toEqual([]);
  });
});
