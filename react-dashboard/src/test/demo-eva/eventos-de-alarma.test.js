/**
 * eventos-de-alarma.test.js
 * ------------------------------------------------------------------
 * `shared/eva/comun/eventosDeAlarma.js`: de una serie 0/1 del historiador a una
 * lista de eventos.
 *
 * ── POR QUÉ ESTE MÓDULO EXISTE, EN UNA LÍNEA ───────────────────────
 *
 * Porque esta instalación no tiene Alarm Historian —`/AlarmHistory` da 500,
 * medido contra `bms-server` el 12-09-2026— pero sí tiene las nueve alarmas
 * historizadas como booleanos en Hyper Historian.
 *
 * Lo que más se prueba aquí son los BORDES de la ventana, que es donde un
 * derivador de flancos inventa datos si se hace mal: una alarma que ya estaba
 * activa al empezar, y otra que sigue activa al terminar. Las dos son el caso
 * real —la alarma que importa suele ser la que sigue sonando— y las dos tienen
 * la tentación de rellenarse con la hora del borde, que sería una hora falsa.
 */
import { describe, expect, it } from "vitest";

import { eventosDeAlarma, idDeEvento } from "@shared/eva/comun/eventosDeAlarma.js";
import { normalizar } from "@shared/eva/comun/historia.js";

/** Atajo: minutos desde una base fija, para que las pruebas se lean. */
const T0 = new Date("2026-09-11T02:00:00.000Z");
const min = (n) => new Date(T0.getTime() + n * 60_000);
const m = (n, valor) => ({ t: min(n), valor });

describe("lo básico: un flanco de subida y uno de bajada son un evento", () => {
  it("una alarma que entra y sale da UN evento, con su duración", () => {
    const eventos = eventosDeAlarma([m(0, 0), m(5, 1), m(9, 0), m(20, 0)]);

    expect(eventos).toHaveLength(1);
    expect(eventos[0].inicio).toEqual(min(5));
    expect(eventos[0].fin).toEqual(min(9));
    expect(eventos[0].duracionMs).toBe(4 * 60_000);
    expect(eventos[0].activa).toBe(false);
  });

  it("dos entradas y dos salidas dan dos eventos, en orden", () => {
    const eventos = eventosDeAlarma([m(0, 0), m(2, 1), m(4, 0), m(8, 1), m(10, 0)]);

    expect(eventos).toHaveLength(2);
    expect(eventos[0].inicio).toEqual(min(2));
    expect(eventos[1].inicio).toEqual(min(8));
  });

  it("una serie que nunca se activa no tiene eventos — no un evento vacío", () => {
    expect(eventosDeAlarma([m(0, 0), m(5, 0), m(10, 0)])).toEqual([]);
  });

  it("muestras repetidas del mismo valor no son flancos", () => {
    // El historiador entrega a intervalo fijo, así que la mayoría de las
    // muestras repiten el estado anterior. Contarlas sería un evento por muestra.
    const eventos = eventosDeAlarma([m(0, 0), m(1, 1), m(2, 1), m(3, 1), m(4, 0)]);
    expect(eventos).toHaveLength(1);
  });
});

describe("los bordes de la ventana, que es donde se inventan datos", () => {
  it("la primera muestra NO es un evento sólo por ser la primera", () => {
    /*
     * Si la serie empieza en 0, no ha pasado nada en ese instante: es el estado
     * de partida. Contarlo como entrada pondría un evento en el borde del rango
     * cada vez que alguien abre la pantalla.
     */
    expect(eventosDeAlarma([m(0, 0), m(5, 0)])).toEqual([]);
  });

  it("una alarma YA activa al empezar sí sale, pero marcada `desdeAntes`", () => {
    /*
     * Es el caso que más importa —la alarma que ya venía sonando— y ocultarla
     * porque su flanco cae fuera de la ventana sería perderla. Lo que no se
     * puede hacer es fingir que entró en el borde: por eso la marca.
     */
    const eventos = eventosDeAlarma([m(0, 1), m(6, 0)]);

    expect(eventos).toHaveLength(1);
    expect(eventos[0].desdeAntes).toBe(true);
    expect(eventos[0].inicio).toEqual(min(0));
    expect(eventos[0].fin).toEqual(min(6));
  });

  it("una que entra DENTRO de la ventana no lleva esa marca", () => {
    const eventos = eventosDeAlarma([m(0, 0), m(3, 1), m(7, 0)]);
    expect(eventos[0].desdeAntes).toBe(false);
  });

  it("la que sigue activa al final no tiene fin ni duración inventados", () => {
    /*
     * La aserción que de verdad protege §2.4: poner `fin` en la última muestra
     * afirmaría que terminó, y no ha terminado. `null` dice «sigue».
     */
    const eventos = eventosDeAlarma([m(0, 0), m(4, 1), m(10, 1)]);

    expect(eventos).toHaveLength(1);
    expect(eventos[0].activa).toBe(true);
    expect(eventos[0].fin).toBeNull();
    expect(eventos[0].duracionMs).toBeNull();
  });

  it("activa de principio a fin: un solo evento abierto, no cero ni dos", () => {
    const eventos = eventosDeAlarma([m(0, 1), m(5, 1), m(10, 1)]);

    expect(eventos).toHaveLength(1);
    expect(eventos[0].desdeAntes).toBe(true);
    expect(eventos[0].activa).toBe(true);
  });
});

describe("robustez frente a lo que el historiador puede devolver", () => {
  it("muestras desordenadas se ordenan antes de buscar flancos", () => {
    /*
     * Pasa al recomponer una ventana larga de varias peticiones. Un flanco
     * calculado sobre muestras fuera de orden es un evento falso.
     */
    const eventos = eventosDeAlarma([m(9, 0), m(0, 0), m(5, 1)]);

    expect(eventos).toHaveLength(1);
    expect(eventos[0].inicio).toEqual(min(5));
    expect(eventos[0].fin).toEqual(min(9));
  });

  it("sin muestras, sin eventos — y no revienta", () => {
    expect(eventosDeAlarma([])).toEqual([]);
    expect(eventosDeAlarma(null)).toEqual([]);
    expect(eventosDeAlarma(undefined)).toEqual([]);
  });

  it("encaja con lo que `normalizar()` produce a partir del servidor REAL", () => {
    /*
     * La forma exacta medida el 12-09-2026: `value` es un BOOLEANO, no 0/1.
     * `normalizar` lo convierte, y esta prueba fija esa cadena entera para que
     * un cambio en cualquiera de los dos lados se note aquí.
     */
    const delServidor = [
      { timestamp: "2026-09-11T02:00:00.000Z", quality: 0, value: false },
      { timestamp: "2026-09-11T02:05:00.000Z", quality: 0, value: true },
      { timestamp: "2026-09-11T02:09:00.000Z", quality: 0, value: false },
    ];

    const eventos = eventosDeAlarma(normalizar(delServidor));

    expect(eventos).toHaveLength(1);
    expect(eventos[0].duracionMs).toBe(4 * 60_000);
  });

  it("la mala calidad ya viene descartada por `normalizar`, no se filtra dos veces", () => {
    // Filtrar en dos sitios es cómo las dos copias acaban discrepando.
    const conMala = [
      { timestamp: "2026-09-11T02:00:00.000Z", quality: 0, value: false },
      { timestamp: "2026-09-11T02:03:00.000Z", quality: 0x80000000, value: true },
      { timestamp: "2026-09-11T02:05:00.000Z", quality: 0, value: true },
    ];

    expect(normalizar(conMala)).toHaveLength(2);
    expect(eventosDeAlarma(normalizar(conMala))).toHaveLength(1);
  });
});

describe("idDeEvento: estable, y nunca confundible con uno del Alarm Server", () => {
  it("el mismo evento da el mismo id entre recargas", () => {
    const [e] = eventosDeAlarma([m(0, 0), m(5, 1), m(9, 0)]);

    expect(idDeEvento("presionAlta", e)).toBe(idDeEvento("presionAlta", e));
  });

  it("lleva el prefijo `hist:` — no es un eventId y no se puede reconocer", () => {
    const [e] = eventosDeAlarma([m(0, 0), m(5, 1)]);
    expect(idDeEvento("presionAlta", e)).toMatch(/^hist:/);
  });

  it("dos alarmas distintas en el mismo instante no comparten id", () => {
    const [a] = eventosDeAlarma([m(0, 0), m(5, 1)]);
    const [b] = eventosDeAlarma([m(0, 0), m(5, 1)]);

    expect(idDeEvento("presionAlta", a)).not.toBe(idDeEvento("bajoFlujo", b));
  });
});
