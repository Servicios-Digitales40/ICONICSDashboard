/**
 * valores.test.js
 * ------------------------------------------------------------------
 * La frontera de saneamiento: lo que separa una lectura cruda de ICONICS de
 * un número que las vistas pueden agregar.
 *
 * ── POR QUÉ SE PRUEBA ALGO TAN PEQUEÑO ─────────────────────────────
 *
 * Porque su modo de fallo no se ve. Un `NaN` que se cuela no rompe nada: se
 * propaga por las sumas y las medias y sale por el otro lado como un hueco en
 * un sitio que no tiene nada que ver con el sensor que lo produjo. Y un
 * `Infinity` convertido a cero es peor todavía, porque un cero se lee como una
 * medición.
 *
 * El caso que lo motivó: el servidor calcula divisiones sin proteger el
 * denominador, así que con el sistema recién arrancado devuelve `Infinity` de
 * verdad. Estas tres funciones son lo único que impide que eso llegue al
 * modelo. Ver `shared/eva/sistema.js`, que las usa al construir cada señal.
 */
import { describe, expect, it } from "vitest";
import { hasValue, toNumber, toText } from "@shared/valores.js";

describe("toNumber · saneamiento", () => {
  it("descarta los valores que romperían los agregados", () => {
    expect(toNumber(NaN)).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
    expect(toNumber(-Infinity)).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber("")).toBeNull();
    expect(toNumber("no soy un número")).toBeNull();
  });

  it("conserva los valores legítimos, incluido el cero", () => {
    // El cero es una medición y tiene que sobrevivir: un caudal de 0 l/min con
    // la bomba parada es el dato correcto, no la ausencia de dato.
    expect(toNumber(0)).toBe(0);
    expect(toNumber(-3.5)).toBe(-3.5);
    expect(toNumber("84.5")).toBe(84.5);
  });
});

describe("toText · saneamiento", () => {
  it("una cadena en blanco es ausencia de texto, no texto vacío", () => {
    expect(toText("   ")).toBeNull();
    expect(toText("")).toBeNull();
    expect(toText(null)).toBeNull();
    expect(toText(undefined)).toBeNull();
  });

  it("recorta pero no interpreta", () => {
    expect(toText("  Bomba 1 ")).toBe("Bomba 1");
    expect(toText(0)).toBe("0");
  });
});

describe("hasValue", () => {
  it("distingue «no hay dato» de un dato que resulta ser falso o cero", () => {
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
    // Los tres siguientes son datos. Un `if (valor)` los perdería, y ése es
    // exactamente el error que esta función existe para no cometer.
    expect(hasValue(0)).toBe(true);
    expect(hasValue(false)).toBe(true);
    expect(hasValue("")).toBe(true);
  });
});
