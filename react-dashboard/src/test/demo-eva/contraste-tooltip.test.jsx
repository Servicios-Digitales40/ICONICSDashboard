// @vitest-environment jsdom
/**
 * contraste-tooltip.test.jsx
 * ------------------------------------------------------------------
 * Dos fallos que sólo se ven mirando la pantalla, y por eso se fijan aquí.
 *
 *  1. **La cifra grande del detalle se leía mal en el tema oscuro.** El color
 *     iba `undefined` cuando el dato estaba fresco, así que heredaba el del
 *     documento: en los temas claros coincidía con el del texto y nadie lo
 *     notaba, pero en el oscuro dejaba el número —lo primero que se mira—
 *     en un tono oscuro sobre panel oscuro.
 *
 *  2. **El tooltip de «Comparar señales» enseñaba el epoch crudo.** Salía
 *     «1787609088000» donde la gráfica de detalle pone «24-ago, 02:24 p.m.».
 *     Recharts entrega el `label` sin formatear cuando el tooltip lleva un
 *     `content` propio; la de detalle ya lo envolvía, ésta no.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "@/theme";
import { TooltipHistoria } from "@/Demo-EVA/components/detalle/piezas.jsx";
import { DetalleGrid } from "@/Demo-EVA/components/detalle/DetalleGrid.jsx";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function ConTema({ children }) {
  const { theme: t, dark } = useTheme();
  return children(t, dark);
}

describe("el tooltip de las gráficas de historia", () => {
  /*
   * Se prueba el envoltorio directamente y no a través de la gráfica: hacer
   * que Recharts abra un tooltip en jsdom exige simular el ratón sobre un SVG
   * sin layout, y lo que aquí importa —que el epoch se formatee— es
   * exactamente lo que hace este componente.
   */
  it("formatea el epoch en fecha legible, no en milisegundos", () => {
    const ms = new Date(2026, 7, 24, 14, 24).getTime();

    render(
      <ThemeProvider>
        <TooltipHistoria
          active
          label={ms}
          payload={[{ name: "Tensión", value: 126.3, color: "#5C82F5" }]}
        />
      </ThemeProvider>
    );

    expect(screen.queryByText(String(ms))).toBeNull();
    // «24 ago, 02:24 p. m.» según el locale; se comprueba lo estable.
    expect(screen.getByText(/24/)).toBeTruthy();
    expect(screen.getByText(/ago/i)).toBeTruthy();
  });

  /*
   * Esta es la que de verdad cerraba el fallo.
   *
   * Las dos de arriba prueban `TooltipHistoria`, que nunca estuvo roto: lo que
   * fallaba era que «Comparar señales» montaba el `ChartTooltip` PELADO, y
   * entonces Recharts entregaba el epoch sin formatear.
   *
   * Se comprueba sobre el FUENTE y no renderizando: en jsdom el `<Tooltip>` de
   * Recharts no llega a montar su contenido sin layout ni ratón, así que un
   * render no distingue un tooltip del otro. Lo que no puede repetirse es que
   * esta gráfica use el crudo, y eso se lee directamente del cableado.
   */
  it("«Comparar señales» monta el tooltip que formatea la fecha", async () => {
    const fuente = await leerFuente(
      "src/Demo-EVA/components/detalle/GraficaComparada.jsx"
    );

    expect(fuente).toMatch(/<Tooltip\s+content=\{<TooltipHistoria\s*\/>\}/);
    expect(
      fuente,
      "el ChartTooltip pelado deja el epoch sin formatear"
    ).not.toMatch(/<Tooltip\s+content=\{<ChartTooltip\s*\/>\}/);
  });

  it("deja pasar un label que ya venía en texto", () => {
    render(
      <ThemeProvider>
        <TooltipHistoria
          active
          label="07:44 a.m."
          payload={[{ name: "Tensión", value: 119.8, color: "#5C82F5" }]}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("07:44 a.m.")).toBeTruthy();
  });
});

describe("la cifra grande del detalle", () => {
  const senalFalsa = {
    key: "tensionLinea",
    tag: "INDICE_DESVIACION_VOLTAJE",
    label: "Tensión de línea",
    unidad: "V",
    decimales: 1,
    tipo: "real",
    valor: 119.8,
    escala: { min: 90, max: 150 },
    subirEsBueno: null,
    historizado: true,
    bufferVivo: [],
    historia: [],
    deltaBuffer: null,
    receivedAt: new Date(),
    stale: false,
    nota: null,
  };

  /*
   * Se mira el color COMPUTADO del nodo que pinta la cifra, no el código
   * fuente: lo que no puede repetirse es que el número quede sin color propio
   * y herede el del documento, y eso sólo se ve en el estilo aplicado.
   */
  const colorDeLaCifra = (container) => {
    const nodo = [...container.querySelectorAll("span")]
      .find((n) => n.textContent.trim() === "119.8");
    return nodo ? nodo.style.color : null;
  };

  it("declara su color en el tema oscuro, y no lo hereda", async () => {
    let tema;
    const { container } = render(
      <ThemeProvider inicial="dark">
        <ConTema>
          {(t, dark) => {
            tema = t;
            return (
              <DetalleGrid variables={[senalFalsa]} t={t} dark={dark} ahora={new Date()} />
            );
          }}
        </ConTema>
      </ThemeProvider>
    );

    await waitFor(() => expect(colorDeLaCifra(container)).toBeTruthy());

    const color = colorDeLaCifra(container);
    expect(color, "la cifra tiene que llevar color propio").not.toBe("");
    // Y tiene que ser el del texto del tema, que es el que contrasta contra el
    // panel — no un heredado cualquiera.
    expect(normalizar(color)).toBe(normalizar(tema.text));
  });
});

/** `#E9ECF3` y `rgb(233, 236, 243)` son el mismo color; jsdom devuelve rgb(). */
function normalizar(color) {
  if (!color) return color;
  const m = color.match(/^#([0-9a-f]{6})$/i);
  if (!m) return color.replace(/ /g, "");
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}



/** Lee un archivo del proyecto, relativo a la raíz de `react-dashboard`. */
async function leerFuente(rel) {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  return readFile(path.resolve(aqui, "../../..", rel), "utf8");
}
