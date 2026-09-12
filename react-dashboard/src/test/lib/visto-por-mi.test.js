// @vitest-environment jsdom
/**
 * visto-por-mi.test.js
 * ------------------------------------------------------------------
 * `crearVistoPorMi` — extraído de `AlarmasEva.jsx` (Plan 24 F5) al Plan 25 F6,
 * cuando la bandeja de hallazgos necesitó el mismo mecanismo sobre otro
 * conjunto de ids. Antes sólo se probaba indirectamente a través de esa vista;
 * esto prueba el módulo en sí.
 *
 * Lo más importante: dos namespaces distintos no pueden compartir memoria —
 * si la compartieran, marcar como visto un evento de Alarmas marcaría también
 * como visto un hallazgo con el mismo id por casualidad.
 */
import { afterEach, describe, expect, it } from "vitest";
import { crearVistoPorMi } from "@/lib/vistoPorMi.js";

afterEach(() => {
  window.localStorage.clear();
});

describe("lo no marcado se ve como nuevo", () => {
  it("sin nada guardado, ningún id está visto", () => {
    const v = crearVistoPorMi("test:a");
    expect(v.leer().has("x")).toBe(false);
  });

  it("marcar añade a lo ya visto, no lo reemplaza", () => {
    const v = crearVistoPorMi("test:b");
    v.marcar(["a"]);
    v.marcar(["b"]);

    const vistos = v.leer();
    expect(vistos.has("a")).toBe(true);
    expect(vistos.has("b")).toBe(true);
  });
});

describe("namespaces distintos no comparten memoria", () => {
  it("marcar en un namespace no afecta a otro", () => {
    /*
     * La razón de ser de la parametrización por clave: alarmas y la bandeja de
     * hallazgos usan la MISMA mecánica sobre conjuntos de ids DISTINTOS, y un
     * id "e1" de una alarma no puede colisionar con un "e1" de un hallazgo.
     */
    const alarmas = crearVistoPorMi("test:alarmas");
    const hallazgos = crearVistoPorMi("test:hallazgos");

    alarmas.marcar(["e1"]);

    expect(alarmas.leer().has("e1")).toBe(true);
    expect(hallazgos.leer().has("e1")).toBe(false);
  });
});

describe("el tope evita crecer sin límite", () => {
  it("con tope bajo, sólo se recuerdan los últimos N", () => {
    const v = crearVistoPorMi("test:tope", 3);
    v.marcar(["a", "b", "c", "d", "e"]);

    const vistos = v.leer();
    expect(vistos.size).toBe(3);
    // Los últimos tres, no los primeros: lo que importa es no volver a marcar
    // como nuevo algo RECIENTE.
    expect(vistos.has("e")).toBe(true);
    expect(vistos.has("a")).toBe(false);
  });
});

describe("un almacenamiento roto no tira la pantalla", () => {
  it("si localStorage.getItem lanza, leer() devuelve vacío en vez de propagar", () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error("almacenamiento bloqueado");
    };

    const v = crearVistoPorMi("test:roto");
    // Sin memoria de lo visto se ve todo como nuevo: el lado seguro.
    expect(() => v.leer()).not.toThrow();
    expect(v.leer().size).toBe(0);

    window.localStorage.getItem = original;
  });

  it("si localStorage.setItem lanza, marcar() no tira la pantalla", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("almacenamiento bloqueado");
    };

    const v = crearVistoPorMi("test:roto2");
    expect(() => v.marcar(["a"])).not.toThrow();

    window.localStorage.setItem = original;
  });

  it("un valor corrupto en el almacenamiento no revienta la lectura", () => {
    window.localStorage.setItem("test:corrupto:vistos", "{no es json valido");

    const v = crearVistoPorMi("test:corrupto");
    expect(() => v.leer()).not.toThrow();
    expect(v.leer().size).toBe(0);
  });
});
