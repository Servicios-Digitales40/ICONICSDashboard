/**
 * transporteSimulado.test.js
 * ------------------------------------------------------------------
 * La mecánica del transporte falso, aislada de toda instalación.
 *
 * ── POR QUÉ MERECE PRUEBA PROPIA ───────────────────────────────────
 *
 * Porque desde que se generalizó, **las dos máquinas leen por aquí**, y la
 * tercera lo hará sin escribir una línea de transporte. Un fallo en este
 * archivo no rompe una sección: rompe la planta entera en modo simulado.
 *
 * Y porque los tres estados del `modelo` —ajeno, sin dato, valor— son un
 * contrato fácil de romper sin notarlo. Colapsar los dos primeros parece una
 * simplificación inofensiva y es justo el fallo que este proyecto ya ha
 * cometido dos veces: una máquina que contesta `null` con calidad BUENA, que
 * la pantalla lee como «todo en orden».
 *
 * El `modelo` de aquí es de mentira a propósito. No hay agua ni acelerómetros
 * en estas pruebas: si los hubiera, dejarían de comprobar la mecánica y
 * pasarían a comprobar una física.
 */
import { describe, expect, it } from "vitest";

import { createTransporteSimulado } from "@/lib/iconics/transporteSimulado.js";
import { SIN_CAOS, isGoodQuality } from "@/lib/iconics";
import { QUALITY_SIN_DATO } from "@shared/quality.js";

/** Un modelo de tres puntos, uno por cada estado del contrato. */
const modelo = (nombre) => {
  if (nombre === "mio:conValor") return 42;
  if (nombre === "mio:sinDato") return null;
  return undefined;
};

const PUNTOS = ["mio:conValor", "mio:sinDato", "ajeno:loQueSea"];

const sinCaos = (extra = {}) =>
  createTransporteSimulado({ modelo, chaos: SIN_CAOS, rnd: () => 1, ...extra });

describe("el transporte simulado traduce los tres estados del modelo", () => {
  it("un valor llega con calidad buena", async () => {
    const mapa = await sinCaos().read(PUNTOS);
    expect(mapa.get("mio:conValor")).toEqual({ value: 42, quality: expect.any(Number) });
    expect(isGoodQuality(mapa.get("mio:conValor").quality)).toBe(true);
  });

  it("un punto sin dato llega SIN `value`, no como un cero", async () => {
    /*
     * La distinción que sostiene media interfaz. Un cero con calidad mala
     * sobrevive a un `?? 0` descuidado río abajo y se convierte en «vibración
     * nula, todo perfecto»; la ausencia del campo, no.
     */
    const entrada = (await sinCaos().read(PUNTOS)).get("mio:sinDato");

    expect(entrada).toBeTruthy();
    expect("value" in entrada).toBe(false);
    expect(entrada.quality).toBe(QUALITY_SIN_DATO);
    expect(isGoodQuality(entrada.quality)).toBe(false);
  });

  it("un punto ajeno no aparece en la respuesta", async () => {
    // Igual que hace el servidor real con lo que no tiene: para el motor es un
    // hueco, y un hueco es la falta de entrada en el mapa.
    const mapa = await sinCaos().read(PUNTOS);
    expect(mapa.has("ajeno:loQueSea")).toBe(false);
    expect(mapa.size).toBe(2);
  });
});

describe("el caos es del transporte, no del modelo", () => {
  it("con `errorPeticion` seguro, la lectura entera lanza", async () => {
    // Tiene que LANZAR y no devolver un mapa vacío: es lo que dispara el
    // backoff del motor de sondeo. Un mapa vacío se leería como «la máquina no
    // tiene nada que decir».
    const t = createTransporteSimulado({
      modelo,
      chaos: { ...SIN_CAOS, errorPeticion: 1 },
      rnd: () => 0,
    });
    await expect(t.read(PUNTOS)).rejects.toThrow(/fallo simulado/);
  });

  it("la etiqueta del error dice qué máquina falló", async () => {
    // Con dos sondeos en marcha, un error sin nombre obliga a adivinar cuál de
    // las dos secciones lo produjo.
    const t = createTransporteSimulado({
      modelo,
      chaos: { ...SIN_CAOS, errorPeticion: 1 },
      rnd: () => 0,
      etiqueta: "simulador · prensa",
    });
    await expect(t.read(PUNTOS)).rejects.toThrow(/simulador · prensa/);
  });

  it("con `ausente` seguro, los puntos propios desaparecen sin error", async () => {
    const t = createTransporteSimulado({
      modelo,
      chaos: { ...SIN_CAOS, ausente: 1 },
      rnd: () => 0,
    });
    // `rnd` a 0 dispararía también `errorPeticion` si fuera > 0; con `SIN_CAOS`
    // vale cero, así que sólo actúa `ausente`.
    expect((await t.read(PUNTOS)).size).toBe(0);
  });
});

describe("el transporte exige una física", () => {
  it("sin `modelo` no se construye", () => {
    // Falla al construir y no al leer: un transporte sin modelo devolvería
    // mapas vacíos para siempre, y eso en pantalla es una planta apagada.
    expect(() => createTransporteSimulado({})).toThrow(/modelo/);
  });
});
