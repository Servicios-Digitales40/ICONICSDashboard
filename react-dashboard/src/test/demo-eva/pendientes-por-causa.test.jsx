// @vitest-environment jsdom
/**
 * `PendientesPorCausa` y `pendientesDeVariables` (Plan 42.5 F6, D17): las
 * series sin verificar de una máquina, por causa, desde lo persistido en su
 * configuración o desde un sondeo recién hecho; y las constantes registradas
 * aparte, plegadas.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider, useTheme } from "@/theme";
import { PendientesPorCausa, agruparCompartidas, pendientesDeVariables } from "@/Demo-EVA/components/configuracion/PendientesPorCausa.jsx";

function ConTema({ children }) {
  const { theme } = useTheme();
  return children(theme);
}
const montar = (props) => render(<ThemeProvider><ConTema>{(t) => <PendientesPorCausa t={t} {...props} />}</ConTema></ThemeProvider>);

afterEach(cleanup);

const VARIABLES = [
  { id: "vRMS_S1", historyPointName: "hda:a", historyVerified: true, historyVerifiedComo: "serie-propia" },
  { id: "Alarma_S1", historyPointName: "hda:b", historyVerified: true, historyVerifiedComo: "registrada-constante" },
  { id: "Warning_S1", historyPointName: "hda:c", historyVerified: true, historyVerifiedComo: "registrada-constante" },
  { id: "aPeak_S1", historyPointName: "hda:d", historyVerified: false, historyCausa: "serie-compartida", historyCompartidaCon: ["aRMS_S1"] },
  { id: "aRMS_S1", historyPointName: "hda:d", historyVerified: false, historyCausa: "serie-compartida", historyCompartidaCon: ["aPeak_S1"] },
  { id: "DKW_S1", historyPointName: "hda:e", historyVerified: false, historyCausa: "no-se-pudo-leer" },
  { id: "par", historyPointName: "hda:f", historyVerified: false }, // nunca sondeada
  { id: "QC_vRMS_S1" }, // sin punto histórico: no hay serie que verificar
];

describe("pendientesDeVariables", () => {
  it("separa pendientes por causa (sin sondear cuando no hay causa) y constantes registradas; ignora lo sin punto histórico", () => {
    const { pendientes, constantes } = pendientesDeVariables(VARIABLES);

    expect(pendientes).toEqual([
      { id: "aPeak_S1", causa: "serie-compartida", compartidaCon: ["aRMS_S1"] },
      { id: "aRMS_S1", causa: "serie-compartida", compartidaCon: ["aPeak_S1"] },
      { id: "DKW_S1", causa: "no-se-pudo-leer", compartidaCon: [] },
      { id: "par", causa: "sin-sondear", compartidaCon: [] },
    ]);
    expect(constantes).toEqual(["Alarma_S1", "Warning_S1"]);
    expect(pendientesDeVariables(undefined)).toEqual({ pendientes: [], constantes: [] });
  });
});

describe("agruparCompartidas", () => {
  it("seis variables que se citan entre sí son UN grupo; dos parejas ajenas, dos grupos", () => {
    const seis = ["a1", "v1", "a2", "v2", "a3", "v3"];
    const pendientes = seis.map((id) => ({ id, compartidaCon: seis.filter((x) => x !== id) }));
    expect(agruparCompartidas(pendientes)).toEqual([seis]);
    expect(agruparCompartidas([
      { id: "p", compartidaCon: ["q"] }, { id: "q", compartidaCon: ["p"] },
      { id: "x", compartidaCon: ["y"] },
    ])).toEqual([["p", "q"], ["x", "y"]]);
    /* Una cadena indirecta (a↔b, b↔c) también es un grupo. */
    expect(agruparCompartidas([{ id: "a", compartidaCon: ["b"] }, { id: "c", compartidaCon: ["b"] }])).toEqual([["a", "b", "c"]]);
  });
});

describe("la lista por causa", () => {
  it("agrupa con el texto corto de cada causa, cuenta, y dice con quién se comparte una serie", () => {
    const { pendientes, constantes } = pendientesDeVariables(VARIABLES);
    montar({ pendientes, constantes });

    expect(screen.getByText(/Serie compartida con otra variable · 2/)).toBeTruthy();
    expect(screen.getByText(/No se pudo leer el historiador · 1/)).toBeTruthy();
    expect(screen.getByText(/Sin sondear · 1/)).toBeTruthy();
    /* Las dos que se comparten son UNA línea, no dos que se citan mutuamente. */
    expect(screen.getByText("aPeak_S1, aRMS_S1 · 2 comparten la misma serie")).toBeTruthy();
    expect(screen.queryByText(/→/)).toBeNull();
    expect(screen.getByText("par")).toBeTruthy();
    /* Las constantes, aparte y plegadas: se cuentan en el resumen, y sus ids están dentro. */
    expect(screen.getByText("2 verificadas como constante registrada")).toBeTruthy();
    expect(screen.getByText("Alarma_S1")).toBeTruthy();
  });

  it("una causa desconocida se pinta como «sin sondear», no se inventa un texto", () => {
    montar({ pendientes: [{ id: "x", causa: "rarisima" }] });
    expect(screen.getByText(/Sin sondear · 1/)).toBeTruthy();
  });

  it("sin pendientes ni constantes no pinta nada", () => {
    const { container } = montar({ pendientes: [], constantes: [] });
    expect(container.textContent).toBe("");
  });
});
