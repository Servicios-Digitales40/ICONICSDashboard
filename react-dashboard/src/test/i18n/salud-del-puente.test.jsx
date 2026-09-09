// @vitest-environment jsdom
/**
 * salud-del-puente.test.jsx
 * ------------------------------------------------------------------
 * Que los `detalle` de `/api/health` se lean en el idioma del tablero — y que
 * el nombre de cada servicio se traduzca por su CLAVE, no por su texto.
 *
 * ── POR QUÉ HACE FALTA UNA PRUEBA ───────────────────────────────────
 *
 * `backend/test/rutas/salud.test.mjs` comprueba el lado del backend: que cada
 * rama de `estadoDeLosDatos`/`servicio()` siga trayendo su `detalle` español.
 * Lo que no puede comprobar es que el PUENTE sepa reconstruir cada `plantilla`
 * — y ése es el hueco por el que un `detalle` en español se cuela dentro de un
 * tablero en inglés sin que nada avise: no hay clave cruda en pantalla, no
 * falla ninguna prueba del lado del backend, sólo sale la frase equivocada.
 * Es el mismo modo de fallo que ya obligó a escribir
 * `test/i18n/evidencia-del-motor.test.jsx` para el motor de diagnóstico.
 *
 * ── LO QUE SE ESCRIBE AQUÍ, Y LO QUE NO ────────────────────────────
 *
 * No se escriben las frases: se piden al mismo diccionario que usa la
 * pantalla. Lo que sí se escribe es el ESPAÑOL que manda el backend en
 * `detalle`, porque es justo lo que NO tiene que quedar a la vista en inglés.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { useSalud } from "@/i18n/useSalud.js";

afterEach(async () => {
  await i18n.changeLanguage("es");
});

const puente = () => renderHook(() => useSalud()).result.current;

describe("el detalle de un servicio habla el idioma del tablero", () => {
  it("[es] sin plantilla, sale el detalle tal cual", () => {
    const { detalleDeServicio } = puente();
    expect(detalleDeServicio({ detalle: "Un texto cualquiera que no viene de una regla." })).toBe(
      "Un texto cualquiera que no viene de una regla."
    );
  });

  it("[es] con plantilla, sale la MISMA frase que compuso el backend", () => {
    const { detalleDeServicio } = puente();
    const servicio = {
      detalle: "Se alcanza ICONICS y el token es válido. Todavía no se ha pedido ninguna lectura en vivo desde que arrancó el puente.",
      plantilla: { clave: "neverRead", donde: "ICONICS" },
    };
    expect(detalleDeServicio(servicio)).toBe(servicio.detalle);
  });

  it("[en] reescribe la frase con las mismas cifras, y ya no queda español", async () => {
    await i18n.changeLanguage("en");
    const { detalleDeServicio } = puente();

    const servicio = {
      detalle: "Lecturas reales de ICONICS. La última, hace 4 s: 8/8 puntos con valor y calidad buena.",
      plantilla: { clave: "complete", donde: "ICONICS", segundos: 4, conValor: 8, puntosPedidos: 8 },
    };
    const frase = detalleDeServicio(servicio);

    expect(frase).toContain("ICONICS");
    expect(frase).toContain("4 s ago");
    expect(frase).toContain("8/8");
    expect(frase).not.toContain("Lecturas reales");
    expect(frase).not.toMatch(/\{\{/);
  });

  it("[en] el motivo opcional elige la forma de la frase, no un hueco vacío", async () => {
    /*
     * El caso real que motivó `plantilla`: `bms-server` devolviendo 500 sin
     * cuerpo — connectivity.reason llega null y, con la forma equivocada, la
     * frase inglesa diría «ICONICS is unreachable: .» con dos puntos colgando.
     */
    await i18n.changeLanguage("en");
    const { detalleDeServicio } = puente();

    const sinMotivo = detalleDeServicio({
      detalle: "No se alcanza ICONICS.",
      plantilla: { clave: "noReachable", donde: "ICONICS", motivo: null },
    });
    expect(sinMotivo).toBe("ICONICS is unreachable.");

    const conMotivo = detalleDeServicio({
      detalle: "No se alcanza ICONICS: timeout.",
      plantilla: { clave: "noReachable", donde: "ICONICS", motivo: "timeout" },
    });
    expect(conMotivo).toBe("ICONICS is unreachable: timeout.");
  });

  it("[en] «1 punto pedido» y «N puntos pedidos» no comparten frase", async () => {
    await i18n.changeLanguage("en");
    const { detalleDeServicio } = puente();

    const uno = detalleDeServicio({
      detalle: "x",
      plantilla: { clave: "noValues", donde: "ICONICS", segundos: 2, puntosPedidos: 1 },
    });
    const varios = detalleDeServicio({
      detalle: "x",
      plantilla: { clave: "noValues", donde: "ICONICS", segundos: 2, puntosPedidos: 8 },
    });

    expect(uno).toContain("1 point requested");
    expect(uno).not.toContain("1 points");
    expect(varios).toContain("8 points requested");
  });

  it("[en] una clave que el diccionario no conoce cae en el ESPAÑOL del backend", async () => {
    /*
     * Es la propiedad que hace segura una `plantilla` nueva: si el backend
     * declara una clave y nadie la traduce todavía, la pantalla no enseña
     * `health.detail.loQueSea` en crudo — enseña la frase que el backend ya
     * sabía componer.
     */
    await i18n.changeLanguage("en");
    const { detalleDeServicio } = puente();

    const servicio = {
      detalle: "Una frase que el diccionario en inglés todavía no tiene.",
      plantilla: { clave: "unaClaveInventada" },
    };
    expect(detalleDeServicio(servicio)).toBe(servicio.detalle);
  });

  it("[es] sin servicio o sin detalle, no revienta", () => {
    const { detalleDeServicio } = puente();
    expect(detalleDeServicio(null)).toBeNull();
    expect(detalleDeServicio({})).toBeNull();
  });
});

describe("el nombre de un servicio se traduce por su clave, no por su texto", () => {
  it("[es] con la traducción puesta, sale ésa", () => {
    const { nombreDeServicio } = puente();
    expect(nombreDeServicio("datos", "Origen de datos")).toBe("Origen de datos");
  });

  it("[en] las cuatro claves conocidas tienen su nombre en inglés", async () => {
    await i18n.changeLanguage("en");
    const { nombreDeServicio } = puente();

    expect(nombreDeServicio("datos")).toBe("Data source");
    expect(nombreDeServicio("asistente")).toBe("Assistant");
    expect(nombreDeServicio("dictado")).toBe("Voice dictation");
    expect(nombreDeServicio("documentacion")).toBe("Plant manuals");
  });

  it("[en] una clave desconocida cae en el nombre que trajo el backend", async () => {
    await i18n.changeLanguage("en");
    const { nombreDeServicio } = puente();
    expect(nombreDeServicio("otraCosa", "Nombre del backend")).toBe("Nombre del backend");
  });
});
