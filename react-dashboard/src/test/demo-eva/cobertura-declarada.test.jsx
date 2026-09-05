// @vitest-environment jsdom
/**
 * La cobertura del rango llega hasta la gráfica (Plan 21 F7).
 *
 * ── QUÉ FALLO PERSIGUE ─────────────────────────────────────────────
 *
 * Un rango de diez días con cinco vacíos se dibuja como una curva CONTINUA
 * entre los días que sí tienen muestras. Quien la mira lee una señal que
 * evolucionó así; lo que hubo fue silencio.
 *
 * El dato existía —`useSeriesHistoricas` lo trae desde que el troceado vive en
 * el servidor— y la vista de Gráficas lo descartaba al desestructurar. Es el
 * peor modo de fallo de este proyecto: no falta información, se tira.
 *
 * ── LO QUE NO SE COMPRUEBA, PORQUE NO SE HACE ──────────────────────
 *
 * Que se sombree el tramo que faltó. La cobertura que viaja son CUENTAS y no
 * dice CUÁLES tramos vinieron vacíos, así que sombrear uno elegido a ojo sería
 * inventar dónde estuvo el hueco. Ver la cabecera de `TendenciaSenales`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ThemeProvider, useTheme } from "@/theme";
import { TendenciaSenales } from "@/Demo-EVA/components/tiles.jsx";
import { SENALES } from "@/Demo-EVA/domain/senales.js";

const SENAL = { ...SENALES.nivelTanque, key: "nivelTanque" };

const DATOS = Array.from({ length: 12 }, (_, i) => ({
  t: new Date(Date.UTC(2026, 8, 4, i)),
  valor: 50 + i,
}));

/*
 * `TendenciaSenales` recibe el tema por prop (`t`) y no del contexto, como el
 * resto de las piezas de esta demo: quien lo monta ya lo tiene. Este envoltorio
 * hace de vista.
 */
function ConTema({ cobertura }) {
  const { theme: t, dark } = useTheme();
  return (
    <TendenciaSenales
      senales={[SENAL]}
      porClave={{ nivelTanque: DATOS }}
      metaPorClave={{ nivelTanque: { motivo: null, error: null } }}
      cobertura={cobertura}
      horas={24}
      t={t}
      dark={dark}
    />
  );
}

function montar(cobertura) {
  return render(
    <ThemeProvider>
      <ConTema cobertura={cobertura} />
    </ThemeProvider>
  );
}

afterEach(cleanup);

describe("cobertura en la gráfica de tendencia", () => {
  it("con el rango incompleto lo DICE, con las dos cifras", async () => {
    montar({ tramos: 10, tramosConDato: 4, completa: false });

    expect(await screen.findByText("4/10 tramos con dato")).toBeTruthy();
  });

  it("explica que los huecos son silencio, no valores", async () => {
    // El número solo no basta: «4/10» no dice qué hacer con la curva que se
    // está mirando.
    montar({ tramos: 10, tramosConDato: 4, completa: false });

    const pastilla = await screen.findByText("4/10 tramos con dato");
    expect(pastilla.getAttribute("title")).toMatch(/silencio/i);
  });

  it("con el rango completo no dice nada: un aviso siempre visible se deja de leer", async () => {
    montar({ tramos: 10, tramosConDato: 10, completa: true });

    expect(screen.queryByText(/tramos con dato/)).toBeNull();
    expect(screen.getByText(/escala propia/)).toBeTruthy();
  });

  it("sin cobertura tampoco inventa un aviso", async () => {
    // `null` es «no se sabe», y eso no es lo mismo que «faltan tramos».
    montar(null);

    expect(screen.queryByText(/tramos con dato/)).toBeNull();
  });
});
