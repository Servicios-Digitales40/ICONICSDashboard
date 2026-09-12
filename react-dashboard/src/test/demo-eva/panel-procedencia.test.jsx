// @vitest-environment jsdom
/**
 * panel-procedencia.test.jsx
 * ------------------------------------------------------------------
 * Plan 24, F1 (`USO-03`): el panel de procedencia CABLEADO en la tarjeta de
 * Detalle. Hermano de `procedencia.test.js`, que prueba el dominio puro.
 *
 * El reparto es el mismo que ya usan `estado-dato.test.js` (lógica) y
 * `edad-dato.test.jsx` (cableado): allí se comprueba que `procedenciaDe()`
 * recoge bien; aquí, que lo recogido llega a la pantalla y que el panel no
 * enseña de más.
 *
 * Lo que más importa de esta suite son los dos últimos bloques: que el panel
 * CALLE cuando no sabe algo, en vez de rellenarlo con un valor plausible
 * (`CLAUDE.md` §2.4). Es lo que un panel de procedencia no se puede permitir —
 * si miente sobre de dónde viene un dato, es peor que no existir.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@/theme";
import { createSenal } from "@/Demo-EVA/domain/sistema.js";
import { pointName } from "@/Demo-EVA/domain/senales.js";
import { PanelProcedencia } from "@/Demo-EVA/components/detalle/PanelProcedencia.jsx";
import { SISTEMA } from "@shared/eva/comun/sistemas.js";
import { MOTIVO } from "@shared/quality.js";

afterEach(cleanup);

const AHORA = new Date("2026-09-11T12:00:00Z");

const montar = (props) =>
  render(
    <ThemeProvider>
      <PanelProcedencia ahora={AHORA} {...props} />
    </ThemeProvider>
  );

const senalViva = () =>
  createSenal({ key: "nivelTanque", valor: 62.5, receivedAt: new Date(AHORA.getTime() - 2_000) });

describe("el panel enseña la cadena real, no una versión bonita", () => {
  it("el tag de ICONICS aparece entero", () => {
    const punto = pointName("nivelTanque");
    montar({ senal: senalViva(), punto });

    expect(screen.getByText(punto)).toBeTruthy();
  });

  it("la máquina y su PLC salen del registro", () => {
    montar({ senal: senalViva(), punto: pointName("nivelTanque") });

    // Se busca el PLC declarado, no un literal: si alguien lo cambia en
    // `sistemas.js`, el panel tiene que seguir diciendo la verdad.
    expect(screen.getByText(new RegExp(SISTEMA.tanque.plc.replace(/[·|]/g, ".")))).toBeTruthy();
  });

  it("una señal historizada dice con qué agregado y por qué ruta", () => {
    montar({ senal: senalViva(), punto: pointName("nivelTanque") });

    expect(screen.getByText(new RegExp(SISTEMA.tanque.series.agregado))).toBeTruthy();
  });
});

describe("lo que el panel NO enseña, que es la mitad del trabajo", () => {
  it("una lectura buena no arrastra nota de calidad: se leería como advertencia", () => {
    montar({ senal: senalViva(), punto: pointName("nivelTanque") });

    expect(screen.queryByText(/marcó la lectura/)).toBeNull();
  });

  it("sin hueco en el rango no se dice nada de cobertura: «48 de 48» es ruido", () => {
    montar({
      senal: senalViva(), punto: pointName("nivelTanque"),
      cobertura: { tramosConDato: 48, tramosPosibles: 48 },
    });

    expect(screen.queryByText(/48 de 48/)).toBeNull();
  });

  it("con hueco sí, y con las dos cuentas", () => {
    montar({
      senal: senalViva(), punto: pointName("nivelTanque"),
      cobertura: { tramosConDato: 40, tramosPosibles: 48 },
    });

    expect(screen.getByText(/40 de 48/)).toBeTruthy();
  });
});

describe("cuando no se sabe, se dice que no se sabe (CLAUDE.md §2.4)", () => {
  it("sin punto no se inventa máquina: sale «No se puede determinar»", () => {
    // Deducir la máquina de la clave es el cruce que el Plan 23 corrigió en
    // `98fe465`. El panel prefiere callar.
    montar({ senal: senalViva(), punto: null });

    expect(screen.getAllByText(/No se puede determinar/).length).toBeGreaterThan(0);
  });

  it("un punto sin lectura lo dice, y no finge una edad", () => {
    montar({ senal: createSenal({ key: "nivelTanque", valor: null }), punto: pointName("nivelTanque") });

    expect(screen.getByText(/Todavía no ha llegado/)).toBeTruthy();
    expect(screen.queryByText(/hace/)).toBeNull();
  });

  it("un hueco por mala calidad dice cuál fue el motivo", () => {
    montar({
      senal: createSenal({ key: "nivelTanque", valor: null, motivo: MOTIVO.SIN_ENTREGA }),
      punto: pointName("nivelTanque"),
    });

    expect(screen.getByText(/dejó de entregar/)).toBeTruthy();
  });

  it("sin señal el panel no se pinta, en vez de pintarse vacío", () => {
    const { container } = montar({ senal: null });
    expect(container.querySelector("details")).toBeNull();
  });
});

describe("accesibilidad: se abre con teclado porque es un <details> nativo", () => {
  it("es un <details> con su <summary>, no un div con onClick", () => {
    const { container } = montar({ senal: senalViva(), punto: pointName("nivelTanque") });

    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    expect(details.querySelector("summary")).toBeTruthy();
  });
});
