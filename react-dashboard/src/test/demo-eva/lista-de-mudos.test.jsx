// @vitest-environment jsdom
/**
 * `ListaDeMudos` (Plan 42.5 F6, D17): los puntos sin lectura, listados por
 * motivo bajo la cifra, con su rótulo y su tag. La cifra sola era «80 / 86» y
 * nadie sabía cuáles eran las seis.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider, useTheme } from "@/theme";
import { ListaDeMudos } from "@/Demo-EVA/components/maquina/ListaDeMudos.jsx";

function ConTema({ children }) {
  const { theme } = useTheme();
  return children(theme);
}
const montar = (props) => render(<ThemeProvider><ConTema>{(t) => <ListaDeMudos t={t} {...props} />}</ConTema></ThemeProvider>);

afterEach(cleanup);

const DETALLE = [
  { punto: "ac:M/S1/vRMS", motivo: { codigo: "sin_entrega" } },
  { punto: "ac:M/S2/vRMS", motivo: { codigo: "sin_entrega" } },
  { punto: "ac:M/S3/vRMS", motivo: { codigo: "sin_entrega" } },
  { punto: "ac:M/V20/rpm", motivo: { codigo: "mala" } },
  { punto: "ac:M/S1/QC_vRMS", motivo: null },
  { punto: "ac:M/S1/aRMS", motivo: { codigo: "algo-nuevo" } },
];

describe("la lista de puntos sin lectura", () => {
  it("dice cuántos son, plegada, y al abrirla los agrupa por motivo con su rótulo y su tag", () => {
    montar({ detalle: DETALLE, rotuloDe: (p) => (p.endsWith("/vRMS") ? `Velocidad eficaz ${p.split("/")[1]}` : null) });

    expect(screen.getByText("Ver las 6 variables sin lectura")).toBeTruthy();
    /* Tres grupos con motivo conocido, uno sin motivo, uno desconocido. */
    expect(screen.getByText(/El punto existe pero dejó de entregar valor · 3/)).toBeTruthy();
    expect(screen.getByText(/El servidor marcó la lectura como mala · 1/)).toBeTruthy();
    /* Sin motivo: no se afirma «mala», se dice que no llegó. Un código desconocido
       sale tal cual, para poder buscarlo, no disfrazado de otro. */
    expect(screen.getByText(/Todavía no ha llegado ninguna · 1/)).toBeTruthy();
    expect(screen.getByText(/algo-nuevo · 1/)).toBeTruthy();
    /* Cada punto sale con su tag; los que tienen rótulo, con él delante. */
    for (const d of DETALLE) expect(screen.getByText(d.punto)).toBeTruthy();
    expect(screen.getByText("Velocidad eficaz S1")).toBeTruthy();
    expect(screen.getAllByRole("listitem").length).toBe(DETALLE.length);
  });

  it("en singular, singular", () => {
    montar({ detalle: DETALLE.slice(0, 1) });
    expect(screen.getByText("Ver la variable sin lectura")).toBeTruthy();
  });

  it("sin ningún mudo no pinta nada: una lista vacía bajo «86 / 86» sólo estorba", () => {
    const { container } = montar({ detalle: [] });
    expect(container.textContent).toBe("");
    expect(montar({ detalle: undefined }).container.textContent).toBe("");
  });
});
