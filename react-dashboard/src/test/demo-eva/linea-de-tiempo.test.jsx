// @vitest-environment jsdom
/**
 * linea-de-tiempo.test.jsx — Plan 25 F3 (`NUE-02`).
 *
 * ── LAS TRES COSAS QUE UN EJE TEMPORAL HACE MAL ────────────────────
 *
 *  1. **Tapar hechos simultáneos.** Dos marcas en el mismo instante que se
 *     dibujan una encima de otra hacen desaparecer información sin avisar.
 *  2. **Confundir «sin hechos» con «no consultado».** Un eje en blanco se lee
 *     como calma, y puede ser una fuente caída (§2.4).
 *  3. **Cruzar máquinas.** Dos marcas alineadas en la misma vertical se leen
 *     como relacionadas aunque nadie lo diga — y `NO_COMPARTEN` prohíbe
 *     exactamente eso entre tanque y vibraciones.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@/theme";
import { LineaDeTiempo } from "@/Demo-EVA/components/LineaDeTiempo.jsx";

afterEach(cleanup);

const INICIO = new Date("2026-09-12T06:00:00");
const FIN = new Date("2026-09-12T14:00:00");

const montar = (carriles) =>
  render(
    <ThemeProvider>
      <LineaDeTiempo sistema="tanque" inicio={INICIO} fin={FIN} carriles={carriles} />
    </ThemeProvider>
  );

/** Un carril con lo mínimo, para no repetirlo en cada prueba. */
const carril = (extra = {}) => ({
  id: "acciones",
  etiqueta: "Accionamientos",
  color: "#4477ff",
  hechos: [],
  ...extra,
});

const enHora = (h, m = 0) => new Date(2026, 8, 12, h, m, 0, 0);

describe("los hechos se sitúan en su instante", () => {
  it("un hecho a mitad de la ventana cae a mitad del eje", () => {
    const { container } = montar([
      carril({ hechos: [{ t: enHora(10), titulo: "encender" }] }),
    ]);

    const marca = container.querySelector('[title*="encender"]');
    expect(marca).toBeTruthy();
    // 06:00 → 14:00 son 8 h; las 10:00 son exactamente el 50 %.
    expect(marca.style.left).toBe("50%");
  });

  it("dos hechos simultáneos se dibujan los DOS, no uno tapando al otro", () => {
    const { container } = montar([
      carril({
        hechos: [
          { t: enHora(10), titulo: "encender" },
          { t: enHora(10), titulo: "apagar" },
        ],
      }),
    ]);

    // Los dos existen y cada uno dice lo suyo al pasar por encima: sin esto,
    // una pulsación doble en el mismo minuto sería indistinguible de una.
    expect(container.querySelector('[title*="encender"]')).toBeTruthy();
    expect(container.querySelector('[title*="apagar"]')).toBeTruthy();
  });

  it("un hecho FUERA de la ventana no se dibuja pegado al borde", () => {
    /*
     * Pintarlo en 0 % o en 100 % sería situarlo en una hora que no es la suya,
     * dentro de un rango al que no pertenece. Se omite.
     */
    const { container } = montar([
      carril({ hechos: [{ t: enHora(3), titulo: "fuera" }] }),
    ]);

    expect(container.querySelector('[title*="fuera"]')).toBeNull();
  });
});

describe("vacío, incompleto y «no aplica» se pintan distinto", () => {
  it("un carril sin hechos lo DICE", () => {
    montar([carril()]);
    expect(screen.getByText(/sin hechos/i)).toBeTruthy();
  });

  it("un carril cuya fuente falló dice que está incompleto, no que está vacío", () => {
    /*
     * La distinción de §2.4 llevada al eje: sin esto, un historiador caído se
     * dibuja igual que ocho horas tranquilas.
     */
    montar([carril({ incompleto: true })]);

    expect(screen.getByText(/incompleto/i)).toBeTruthy();
    expect(screen.queryByText(/sin hechos/i)).toBeNull();
  });

  it("un carril que NO APLICA a esta máquina lo dice con esas palabras", () => {
    /*
     * Vibraciones no tiene alarmas declaradas: su carril no está vacío porque
     * no haya saltado ninguna, sino porque no hay ninguna que consultar. Decir
     * «sin hechos» ahí afirmaría que se miró y no había nada.
     */
    montar([carril({ id: "alarmas", etiqueta: "Alarmas", noAplica: true })]);

    expect(screen.getByText(/no hay alarmas declaradas/i)).toBeTruthy();
    expect(screen.queryByText(/sin hechos/i)).toBeNull();
  });

  it("un carril que no aplica no dibuja marcas aunque le pasen hechos", () => {
    const { container } = montar([
      carril({ noAplica: true, hechos: [{ t: enHora(10), titulo: "no debería salir" }] }),
    ]);

    expect(container.querySelector('[title*="no debería salir"]')).toBeNull();
  });
});

describe("el eje se rotula en horas redondas", () => {
  it("las marcas de hora no arrancan en un minuto cualquiera", () => {
    /*
     * Un eje rotulado 06:13, 07:13, 08:13 es correcto y es ilegible. Se empieza
     * en la primera frontera redonda DENTRO del rango.
     */
    const inicio = new Date("2026-09-12T06:13:00");
    const fin = new Date("2026-09-12T14:13:00");

    render(
      <ThemeProvider>
        <LineaDeTiempo sistema="tanque" inicio={inicio} fin={fin} carriles={[carril()]} />
      </ThemeProvider>
    );

    expect(screen.queryByText(/:13/)).toBeNull();
    expect(screen.getByText(/07:00/)).toBeTruthy();
  });
});
