// @vitest-environment jsdom
/**
 * riesgos-vocabulario.test.jsx
 * ------------------------------------------------------------------
 * Que las DOS tarjetas de riesgo digan lo mismo con las mismas palabras, y
 * que el énfasis de un párrafo sobreviva a la traducción.
 *
 * ── POR QUÉ ESTA PRUEBA, HABIENDO YA `riesgos-mismo-layout` ────────
 *
 * Porque aquélla monta las dos PANTALLAS con el transporte falso, y con una
 * instalación sana ninguna de las dos tiene riesgos activos: la rejilla de
 * tarjetas sale vacía y `TarjetaRiesgo` no llega a pintarse nunca. Todo lo
 * que vive dentro de la tarjeta —la etiqueta de severidad, los tres rótulos,
 * los dos botones— estaba sin cubrir, y es justo la mitad que ahora sale de
 * `diagnostics`. Dicho de otro modo: ese código sólo se ejecutaba de verdad
 * el día que hay un problema en planta.
 *
 * No es una precaución teórica. Al traducir `AlarmasEva.jsx` escribí una
 * llamada a `activo(...)` sin cablear su hook: las 589 pruebas siguieron en
 * verde porque ninguna pinta esa vista, y sólo lo destapó abrirla a mano.
 *
 * ── LO QUE FIJA, Y POR QUÉ ASÍ ─────────────────────────────────────
 *
 * Que las dos tarjetas resuelven la MISMA clave. Los rótulos eran idénticos
 * palabra por palabra en los dos archivos desde antes de existir i18n —dos
 * copias de «Puede romper algo» que nadie iba a editar a la vez—, y el
 * arreglo fue una sola clave en `diagnostics:severity` con dos tablas de
 * color, una por pantalla. La comparación se hace ENTRE las dos tarjetas y no
 * contra un texto escrito aquí, así que la prueba sigue valiendo el día que
 * alguien reescriba la traducción — que es lo que la hace útil y no un
 * duplicado más del diccionario.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n, { Enfasis } from "@/i18n";
import { ThemeProvider, useTheme } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/comunes/EvaProvider.jsx";
import { TarjetaRiesgo as TarjetaVibracion } from "@/Demo-EVA/components/riesgoVibracion.jsx";
import RiesgosTanque, { TarjetaRiesgo as TarjetaTanque } from "@/Demo-EVA/views/tanque/RiesgosTanque.jsx";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

/* La forma mínima que cada tarjeta necesita. El dato da igual: se miran las palabras. */
const RIESGO_TANQUE = {
  id: "prueba-tanque",
  severidad: "critico",
  titulo: "Riesgo de prueba",
  evidencia: "Nivel 12 %",
  consecuencia: "La bomba puede cavitar",
  accion: "Revisar la aspiración",
};

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

describe("las dos tarjetas de riesgo comparten vocabulario", () => {
  it("la severidad, los tres campos y los botones se escriben IGUAL en las dos", () => {
    const vib = pintar((t) => <TarjetaVibracion riesgo={RIESGO_VIBRACION} t={t} />);
    const textoVibracion = vib.container.textContent;
    cleanup();

    const tanque = pintar((t) => <TarjetaTanque riesgo={RIESGO_TANQUE} t={t} />);
    const textoTanque = tanque.container.textContent;

    /*
     * No se comprueba QUÉ dice cada rótulo —eso es el diccionario— sino que
     * las dos digan lo mismo. Escribir aquí «Puede romper algo» convertiría
     * esta prueba en una tercera copia del texto, que es el problema que se
     * estaba arreglando.
     */
    for (const clave of ["severity.critico", "field.measured", "field.mayHappen",
      "field.toCheck", "action.ask", "action.closeCase"]) {
      const esperado = traducirDirecto(clave);
      expect(textoVibracion, `vibración: ${clave}`).toContain(esperado);
      expect(textoTanque, `tanque: ${clave}`).toContain(esperado);
    }
  });

  it("ninguna tarjeta deja una clave sin resolver", () => {
    const vib = pintar((t) => <TarjetaVibracion riesgo={RIESGO_VIBRACION} t={t} />);
    expect(vib.container.textContent).not.toMatch(/diagnostics[:.]/);
    cleanup();

    const tanque = pintar((t) => <TarjetaTanque riesgo={RIESGO_TANQUE} t={t} />);
    expect(tanque.container.textContent).not.toMatch(/diagnostics[:.]/);
  });

  it("la norma se cita por su clave, no concatenada a mano", () => {
    const vib = pintar((t) => <TarjetaVibracion riesgo={RIESGO_VIBRACION} t={t} />);
    /* El código de norma es un identificador: se interpola, no se traduce. */
    expect(vib.container.textContent).toContain("ISO 10816-3");
  });

  it("la pantalla entera se pinta con todas sus claves resueltas", async () => {
    render(
      <ThemeProvider>
        <DataSourceProvider>
          <EvaProvider>
            <RiesgosTanque />
          </EvaProvider>
        </DataSourceProvider>
      </ThemeProvider>
    );

    await screen.findByText(/Situaciones detectadas/);
    expect(document.body.textContent).not.toMatch(/diagnostics[:.][a-z]/i);
    expect(document.body.textContent).not.toMatch(/common[:.]period/i);
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
 * misma que usan las dos tarjetas. Así la prueba no repite ningún texto.
 */
const traducirDirecto = (clave) => i18n.t(`diagnostics:${clave}`);
