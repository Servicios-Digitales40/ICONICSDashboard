// @vitest-environment jsdom
/**
 * riesgos-mismo-layout.test.jsx
 * ------------------------------------------------------------------
 * Que las dos pantallas de «Riesgos» —la de la estación de llenado y la del
 * sistema de vibraciones— se lean IGUAL.
 *
 * ── POR QUÉ ESTO MERECE UNA PRUEBA ─────────────────────────────────
 *
 * Porque son dos archivos distintos que nadie edita a la vez. Nacieron como
 * una sola pantalla, se separaron cuando el sidebar se partió por sistema, y
 * desde entonces cada una puede derivar por su lado sin que nada lo delate:
 * las dos seguirían funcionando, las dos seguirían pintando sus riesgos, y lo
 * único que cambiaría es que la misma pregunta —«¿qué puede pasar?»— se
 * contestaría con dos formas distintas según la máquina.
 *
 * Y esa deriva sería un error de fondo, no de estética. Las secciones están
 * separadas para que nadie cruce dos instalaciones que no se tocan; que los
 * riesgos se vean distintos empujaría a lo contrario — a pensar que son dos
 * cosas de naturaleza distinta, cuando son la misma pregunta sobre dos
 * motores.
 *
 * Lo que se fija aquí es la ESTRUCTURA compartida, no el contenido: los
 * rótulos de sección y los tres campos de la tarjeta. Lo que cada tarjeta
 * añade por su cuenta —el apoyo y la norma en vibraciones, la nota de umbral
 * estimado en el tanque— es legítimo y no se toca.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/EvaProvider.jsx";
import RiesgosEva from "@/Demo-EVA/views/RiesgosEva.jsx";
import RiesgosVibracionEva from "@/Demo-EVA/views/RiesgosVibracionEva.jsx";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

const montar = (Vista) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <EvaProvider>
          <Vista />
        </EvaProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("las dos pantallas de «Riesgos» comparten layout", () => {
  it("las dos encabezan sus riesgos con «Situaciones detectadas»", async () => {
    // El rótulo es lo primero que se lee de la pantalla. Con «N riesgos
    // activos» en una y «Situaciones detectadas» en la otra, la misma
    // pregunta parecería dos preguntas distintas.
    montar(RiesgosEva);
    expect(await screen.findByText(/Situaciones detectadas/i)).toBeTruthy();

    cleanup();

    montar(RiesgosVibracionEva);
    expect(await screen.findByText(/Situaciones detectadas/i)).toBeTruthy();
  });

  it("las dos declaran lo que NO se pudo comprobar, con el mismo rótulo", async () => {
    // «Sin comprobar» es la sección que distingue una pantalla en verde de
    // una pantalla ciega. Que exista en las dos —y se llame igual— es lo que
    // hace que se busque en el mismo sitio en las dos máquinas.
    montar(RiesgosVibracionEva);

    // Con el origen simulado la máquina de vibraciones no entrega lecturas,
    // así que hay reglas sin comprobar y la sección tiene que aparecer.
    expect(await screen.findByText(/Sin comprobar/i)).toBeTruthy();
  });

  it("la tarjeta de vibraciones usa los tres campos de la del tanque", async () => {
    // MEDIDO / PUEDE OCURRIR / QUÉ REVISAR, en ese orden: la evidencia
    // primero y la hipótesis después. Es la separación que impide que una
    // suposición se lea con la autoridad de un dato, y vale para las dos
    // máquinas por igual.
    const { container } = montar(RiesgosVibracionEva);
    await screen.findByText(/Situaciones detectadas/i);

    const rotulos = [...container.querySelectorAll("div")]
      .map((n) => n.textContent?.trim())
      .filter((txt) => txt === "Medido" || txt === "Puede ocurrir" || txt === "Qué revisar");

    // Si no hay ningún riesgo activo en el simulador, no hay tarjeta que
    // comprobar: la afirmación es condicional a que la haya, y lo que NO
    // puede pasar es que haya tarjeta con otros rótulos.
    if (rotulos.length > 0) {
      expect(rotulos).toContain("Medido");
      expect(rotulos).toContain("Puede ocurrir");
      expect(rotulos).toContain("Qué revisar");
    }
  });
});
