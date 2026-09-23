// @vitest-environment jsdom
/**
 * riesgos-vocabulario.test.jsx
 * ------------------------------------------------------------------
 * Que la tarjeta de riesgo saque su vocabulario del diccionario, y que el
 * énfasis de un párrafo sobreviva a la traducción.
 *
 * ── POR QUÉ ESTA PRUEBA ─────────────────────────────────────────────
 *
 * Porque todo lo que vive dentro de la tarjeta —la etiqueta de severidad, los
 * tres rótulos, los dos botones— sólo se pinta el día que hay un problema en
 * planta: con el transporte falso la instalación está sana y ninguna pantalla
 * llega a montarla. Un rótulo sin clave, o una clave sin traducción, no lo
 * cazaría nadie hasta ese día.
 *
 * No es una precaución teórica. Al traducir la vista de Alarmas del tanque
 * escribí una llamada a `activo(...)` sin cablear su hook: las 589 pruebas
 * siguieron en verde porque ninguna pintaba esa vista, y sólo lo destapó
 * abrirla a mano.
 *
 * ── LO QUE FIJA, Y POR QUÉ ASÍ ─────────────────────────────────────
 *
 * Que la tarjeta resuelve las claves de `diagnostics`, comparando contra el
 * diccionario y no contra un texto escrito aquí: escribir «Puede romper algo»
 * convertiría esta prueba en otra copia del texto, que es justo lo que las
 * claves compartidas vinieron a evitar. Hasta el 23-09-2026 comparaba ADEMÁS
 * las dos tarjetas —la del tanque y la de vibración— entre sí; la del tanque
 * se borró en el Plan 42.5 F4, y una máquina configurada pinta siempre la
 * misma tarjeta, así que compartir vocabulario ya no es algo que probar sino
 * la construcción.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import i18n, { Enfasis } from "@/i18n";
import { ThemeProvider, useTheme } from "@/theme";
import { TarjetaRiesgo as TarjetaVibracion } from "@/Demo-EVA/components/riesgoVibracion.jsx";

afterEach(() => {
  cleanup();
});

/* La forma mínima que la tarjeta necesita. El dato da igual: se miran las palabras. */
const RIESGO_VIBRACION = {
  id: "prueba-vibracion",
  nivel: "critico",
  titulo: "Riesgo de prueba",
  evidencia: "vRMS 7,1 mm/s",
  consecuencia: "El rodamiento puede romper",
  accion: "Revisar el apoyo",
  canalLabel: "Apoyo 1 · horizontal",
  norma: "ISO 10816-3",
};

/*
 * Las tarjetas reciben el tema por prop (`t`), no por contexto: son piezas de
 * presentación puras. Este ayudante lo saca del proveedor de verdad en vez de
 * inventarse un objeto de colores, para que un token que se renombre rompa
 * aquí también.
 */
function ConTema({ children }) {
  const { theme } = useTheme();
  return children(theme);
}

const pintar = (fn) =>
  render(
    <ThemeProvider>
      <ConTema>{fn}</ConTema>
    </ThemeProvider>
  );

describe("la tarjeta de riesgo saca su vocabulario del diccionario", () => {
  it("la severidad, los tres campos y los botones resuelven su clave de `diagnostics`", () => {
    const vib = pintar((t) => <TarjetaVibracion riesgo={RIESGO_VIBRACION} t={t} />);
    const texto = vib.container.textContent;

    for (const clave of ["severity.critico", "field.measured", "field.mayHappen",
      "field.toCheck", "action.ask", "action.closeCase"]) {
      expect(texto, clave).toContain(traducirDirecto(clave));
    }
  });

  it("no deja una clave sin resolver", () => {
    const vib = pintar((t) => <TarjetaVibracion riesgo={RIESGO_VIBRACION} t={t} />);
    expect(vib.container.textContent).not.toMatch(/diagnostics[:.]/);
  });

  it("la norma se cita por su clave, no concatenada a mano", () => {
    const vib = pintar((t) => <TarjetaVibracion riesgo={RIESGO_VIBRACION} t={t} />);
    /* El código de norma es un identificador: se interpola, no se traduce. */
    expect(vib.container.textContent).toContain("ISO 10816-3");
  });
});

describe("Enfasis", () => {
  /*
   * Doce líneas que sustituyen a `<Trans>` y ahorran 11 KB en el chunk de
   * arranque —medido: `vendor` pasó de 264,01 a 275,05 KB al importarlo, y
   * volvió al bajarlo—. Merecen prueba propia justamente porque son nuestras:
   * el modo de fallo peligroso es que se coma la cola de la frase, y eso no
   * lo grita nadie.
   */
  it("pone en negrita lo marcado y CONSERVA lo que va después", () => {
    const { container } = render(
      <Enfasis>{"Las <b>alarmas mandan</b>: sus límites los puso otro."}</Enfasis>
    );
    expect(container.querySelector("strong").textContent).toBe("alarmas mandan");
    expect(container.textContent).toBe("Las alarmas mandan: sus límites los puso otro.");
  });

  it("una frase sin marcado se pinta tal cual", () => {
    const { container } = render(<Enfasis>{"Sin nada que destacar."}</Enfasis>);
    expect(container.textContent).toBe("Sin nada que destacar.");
    expect(container.querySelector("strong")).toBeNull();
  });

  it("varios tramos en negrita en la misma frase", () => {
    const { container } = render(
      <Enfasis>{"Son <b>estimadas</b>, no <b>contadas</b>."}</Enfasis>
    );
    expect([...container.querySelectorAll("strong")].map((e) => e.textContent))
      .toEqual(["estimadas", "contadas"]);
    expect(container.textContent).toBe("Son estimadas, no contadas.");
  });
});

/* ── Ayudante ──────────────────────────────────────────────────────── */

/**
 * El texto de una clave de `diagnostics`, leído del diccionario.
 *
 * No usa `useTranslation` porque esto no es un componente: va directo contra
 * la instancia que `test/setup.js` ya inicializó y fijó en español, que es la
 * misma que usa la tarjeta. Así la prueba no repite ningún texto.
 */
const traducirDirecto = (clave) => i18n.t(`diagnostics:${clave}`);
