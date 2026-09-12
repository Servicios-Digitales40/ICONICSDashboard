// @vitest-environment jsdom
/**
 * sidebar-modulos.test.jsx — Plan 25 F5 (`NUE-07`).
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 * Que el sidebar enseñe la frontera entre MÓDULOS, que es la frontera entre
 * FUENTES DE DATOS (`CLAUDE.md` §2.1 y §4.7): Monitoreo entra por ICONICS,
 * Predicción es un compresor real servido por otro backend.
 *
 * Hasta el 12-09-2026 el menú eran cinco secciones planas y esa separación
 * vivía sólo en un comentario de `NAV_GROUPS`. El fallo que eso permite ya
 * ocurrió: Predicción colgó de «General» hasta el 03-09-2026, archivada junto a
 * Alarmas y Assets como si leyera el mismo servidor.
 *
 * `routes.test.jsx` comprueba que el campo `modulo` está DECLARADO y que
 * `buildNav` lo exige. Esto comprueba que además se VE.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/comunes/EvaProvider.jsx";
import { Sidebar } from "@/app/layout/Sidebar.jsx";

afterEach(cleanup);

/* El Sidebar pinta el punto de estado de Planta: necesita la fuente, que en
   pruebas es la simulada y no sale a ninguna red. */
const montar = (props = {}) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <EvaProvider>
          <Sidebar page="eva-inicio" onNavigate={() => {}} {...props} />
        </EvaProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("el menú agrupa por módulo, no sólo por sección", () => {
  it("los dos módulos tienen su cabecera", () => {
    montar();

    expect(screen.getByText("Monitoreo y Diagnóstico")).toBeTruthy();
    expect(screen.getByText("Predicción", { selector: "h2" })).toBeTruthy();
  });

  it("cada cabecera aparece UNA sola vez, aunque el módulo tenga varias secciones", () => {
    /*
     * Monitoreo tiene cuatro secciones (llenado, vibraciones, general, RAG).
     * La cabecera se pinta al CAMBIAR de módulo, no por sección: si se repitiera
     * en cada una, el menú diría que son cuatro módulos distintos.
     */
    montar();
    expect(screen.getAllByText("Monitoreo y Diagnóstico")).toHaveLength(1);
  });

  it("la cabecera de Predicción va DESPUÉS de las secciones de Monitoreo", () => {
    /*
     * El orden no es cosmético: separa lo que entra por ICONICS de lo que no.
     * Si Predicción volviera a colarse entre las secciones de Monitoreo, su
     * cabecera quedaría en medio y este orden fallaría.
     */
    const { container } = montar();
    const cabeceras = [...container.querySelectorAll("h2")].map((h) => h.textContent);

    expect(cabeceras).toEqual(["Monitoreo y Diagnóstico", "Predicción"]);
  });

  it("las cabeceras son <h2>: el menú tiene estructura, no sólo estilo", () => {
    // Un lector de pantalla recorre encabezados. Un `div` con letra pequeña
    // separa visualmente y no dice nada a quien no ve la pantalla.
    const { container } = montar();
    expect(container.querySelectorAll("h2").length).toBeGreaterThan(0);
  });
});

describe("con la barra plegada no se pintan las cabeceras", () => {
  it("plegada, no hay rótulos de módulo", () => {
    /*
     * Plegada no hay sitio para un rótulo, y lo que quedaría es una raya que
     * separa sin decir por qué. Los iconos siguen agrupados por sección, que es
     * lo que sí cabe.
     *
     * El plegado NO es una prop: es una preferencia que el Sidebar lee de
     * `localStorage` al montarse. Se escribe ahí, que es como llega en la
     * aplicación real — pasarle una prop inventada habría hecho pasar la prueba
     * sin ejercitar nada.
     */
    window.localStorage.setItem("sidebar:collapsed", "1");

    const { container } = montar();
    expect(container.querySelectorAll("h2")).toHaveLength(0);

    window.localStorage.removeItem("sidebar:collapsed");
  });
});
