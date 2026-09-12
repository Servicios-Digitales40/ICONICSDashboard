// @vitest-environment jsdom
/**
 * latido-muro.test.jsx
 * ------------------------------------------------------------------
 * Plan 24, F9 (`USO-10`): que un wallboard congelado se distinga de uno que
 * funciona.
 *
 * ── LA PRUEBA QUE IMPORTA ES LA DE DEGRADACIÓN ──────────────────────
 *
 * Un latido que late siempre no vale nada: el fallo que esto existe para evitar
 * es precisamente una pantalla que parece viva estando parada. Es la forma exacta
 * del incidente del 07-09-2026, cuando el panel de salud daba dos servicios por
 * «Funcionando» sin haberlos contactado, porque el valor por defecto era el
 * optimista.
 *
 * Así que lo que más se prueba aquí es que degrada al estado PEOR: sin lectura y
 * con lectura vieja tienen que verse distintos de «en vivo», y distintos entre
 * sí.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@/theme";
import { LatidoMuro } from "@/app/LatidoMuro.jsx";

afterEach(cleanup);

const montar = (receivedAt) =>
  render(
    <ThemeProvider>
      <LatidoMuro receivedAt={receivedAt} />
    </ThemeProvider>
  );

describe("con el sondeo vivo, dice que está vivo", () => {
  it("una lectura de hace dos segundos se ve «En vivo»", () => {
    montar(new Date(Date.now() - 2_000));
    expect(screen.getByText("En vivo")).toBeTruthy();
  });
});

describe("degrada al estado PEOR, nunca al mejor", () => {
  it("sin ninguna lectura NO dice «En vivo»", () => {
    /*
     * La aserción central de esta suite. Un latido que late sin haber preguntado
     * es el bug del 07-09-2026 reimplementado: certifica que todo va bien
     * porque nadie le dijo lo contrario.
     */
    montar(null);

    expect(screen.queryByText("En vivo")).toBeNull();
    expect(screen.getByText("Sin lectura")).toBeTruthy();
  });

  it("una lectura congelada enseña su EDAD, no «En vivo»", () => {
    // Más de `UMBRAL_CONGELADO_MS` (60 s). El mismo umbral que las tarjetas:
    // un solo hecho, una sola fuente.
    montar(new Date(Date.now() - 300_000));

    expect(screen.queryByText("En vivo")).toBeNull();
    expect(screen.getByText(/hace/)).toBeTruthy();
  });

  it("«sin lectura» y «congelado» no se dicen igual: en una pared son dos averías", () => {
    const { container: sinNada } = montar(null);
    const textoSinNada = sinNada.textContent;
    cleanup();

    const { container: viejo } = montar(new Date(Date.now() - 300_000));
    expect(viejo.textContent).not.toBe(textoSinNada);
  });
});

describe("accesibilidad y movimiento", () => {
  it("es `aria-live`: en modo muro es la única señal de que los datos se pararon", () => {
    const { container } = montar(new Date());
    expect(container.querySelector("[aria-live]")).toBeTruthy();
  });

  /*
   * ── POR QUÉ AQUÍ SE COMPRUEBA LA AUSENCIA DE ANIMACIÓN ──────────────
   *
   * `src/test/setup.js` responde a `matchMedia` que SÍ hay preferencia de
   * movimiento reducido, a propósito y por un motivo ajeno a esta fase
   * (`useCountUp` en jsdom). Así que en esta suite el latido corre siempre en su
   * rama sin animación — y eso es lo que se puede comprobar de verdad.
   *
   * La primera versión de esta prueba buscaba `.pulso-lectura` y falló. Falló
   * con razón: el componente hacía lo correcto y la prueba daba por hecho un
   * entorno que no es el que hay. Se invierte en vez de forzar el mock, porque lo
   * que el proyecto necesita garantizado es la mitad accesible — que con
   * movimiento reducido el latido siga informando sin moverse.
   */
  it("con movimiento reducido no anima, pero sigue informando", () => {
    const { container } = montar(new Date());

    expect(container.querySelector(".pulso-lectura")).toBeNull();
    // El punto y el texto siguen ahí: es el color y la palabra lo que informa,
    // no el movimiento.
    expect(screen.getByText("En vivo")).toBeTruthy();
    expect(container.querySelector("span[style*='border-radius']")).toBeTruthy();
  });

  it("nunca lleva una clase de animación en BUCLE", () => {
    /*
     * `lib/motion.js` declara que la única animación en bucle de este sistema es
     * la de una señal en alarma, y un latido no es una alarma. Esto vale con o
     * sin movimiento reducido: ninguna de las dos ramas puede poner una clase
     * `infinite`.
     */
    const { container } = montar(new Date());
    expect(container.querySelector(".orbit-spin, .spin, .pulse-loop")).toBeNull();
  });
});
