// @vitest-environment jsdom
/**
 * cajon-casos.test.jsx
 * ------------------------------------------------------------------
 * El cajón «Casos» (`features/asistente/cajones/Casos.jsx`), montado de
 * verdad sobre un `fetch` de mentira — mismo criterio que
 * `cajon-manuales.test.jsx`: no tiene dominio de planta detrás, así que no
 * hay origen simulado que aprovechar.
 *
 * Se monta el COMPONENTE, no una ruta: en esta rama no hay rutas (Plan 20
 * §2.12). Por eso la Fase 3 pudo mudarlo de vista a cajón sin tocar una sola
 * aserción — lo que se probaba ya era el componente.
 *
 * ── LO QUE IMPORTA PROTEGER ────────────────────────────────────────
 *
 *  - Que un caso archivado NO salga en la lista por defecto. Es el punto
 *    entero de la pantalla: archivar significa «deja de contar», y si
 *    siguiera a la vista mezclado con los activos no habría forma de saber
 *    qué respalda hoy un diagnóstico.
 *  - Que `resuelto` y `diagnosticoCorrecto` se pinten SEPARADOS. La
 *    auditoría del 01-09-2026 encontró que el motor usaba el primero donde
 *    hacía falta el segundo; una pantalla que los fundiera en un semáforo
 *    repetiría el error de lectura que costó ese hallazgo.
 *  - Que archivar mande `archivado: true` por PATCH y vuelva a leer la
 *    lista, en vez de tocar el estado local y creerse el resultado.
 */
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import CajonCasos from "@/features/asistente/cajones/Casos.jsx";

afterEach(() => {
  cleanup();
  delete globalThis.fetch;
});

function respuestaJson(cuerpo) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(cuerpo)),
  });
}

const CASO_ACTIVO = {
  id: "interv-aaa-1111",
  fecha: "2026-09-01T19:14:39.038Z",
  sistema: "tanque",
  sintoma: "Sobrepresión en la red",
  causa: "La válvula de alivio no está actuando",
  solucion: "Se liberó la válvula",
  resuelto: true,
  origen: "Técnico de turno",
  disparador: { tipo: "riesgo", riesgoId: "sobrepresion" },
  diagnostico: { propuesta: "consigna-variador-alta", respaldo: "alto" },
  causaReal: { tipo: "valvula-alivio-no-actua", componente: "Válvula de alivio" },
  diagnosticoCorrecto: false,
};

const CASO_ARCHIVADO = {
  id: "interv-bbb-2222",
  fecha: "2026-09-01T17:00:04.893Z",
  sistema: null,
  sintoma: "La bomba falla",
  causa: "Por investigarse",
  solucion: "Por investigarse",
  resuelto: false,
  origen: "el usuario",
  archivado: true,
};

function montar() {
  return render(
    <StrictMode>
      <ThemeProvider>
        <CajonCasos />
      </ThemeProvider>
    </StrictMode>
  );
}

describe("RAG · Casos previos", () => {
  it("lista los casos activos y esconde los archivados", async () => {
    globalThis.fetch = vi.fn(() =>
      respuestaJson({ ok: true, total: 2, casos: [CASO_ACTIVO, CASO_ARCHIVADO] })
    );

    montar();

    await waitFor(() => expect(screen.getByText("Sobrepresión en la red")).toBeTruthy());
    // El ruido de pruebas está archivado: no puede aparecer entre lo que hoy
    // respalda un diagnóstico.
    expect(screen.queryByText("La bomba falla")).toBeNull();
  });

  it("el filtro «Archivados» enseña lo que el diagnóstico ya no mira", async () => {
    globalThis.fetch = vi.fn(() =>
      respuestaJson({ ok: true, total: 2, casos: [CASO_ACTIVO, CASO_ARCHIVADO] })
    );

    montar();
    await waitFor(() => expect(screen.getByText("Sobrepresión en la red")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Archivados/ }));

    expect(screen.getByText("La bomba falla")).toBeTruthy();
    expect(screen.queryByText("Sobrepresión en la red")).toBeNull();
  });

  it("«resuelto» y «diagnóstico acertado» son dos señales distintas", async () => {
    // El caso de sonda salió BIEN (la avería se arregló) y el diagnóstico
    // del sistema estaba MAL (propuso el variador, era la válvula). Las dos
    // cosas tienen que verse a la vez, porque son la lección del caso.
    globalThis.fetch = vi.fn(() => respuestaJson({ ok: true, total: 1, casos: [CASO_ACTIVO] }));

    montar();

    await waitFor(() => expect(screen.getByText("Resuelto")).toBeTruthy());
    expect(screen.getByText("Diagnóstico corregido")).toBeTruthy();
  });

  it("archivar manda PATCH con `archivado: true` y relee la lista", async () => {
    const llamadas = [];
    globalThis.fetch = vi.fn((url, opciones) => {
      llamadas.push({ url: String(url), metodo: opciones?.method ?? "GET", cuerpo: opciones?.body });
      return respuestaJson({ ok: true, total: 1, casos: [CASO_ACTIVO] });
    });

    montar();
    await waitFor(() => expect(screen.getByText("Sobrepresión en la red")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Archivar/ }));

    await waitFor(() => expect(llamadas.some((l) => l.metodo === "PATCH")).toBe(true));

    const patch = llamadas.find((l) => l.metodo === "PATCH");
    expect(patch.url).toContain("/api/casos/interv-aaa-1111");
    expect(JSON.parse(patch.cuerpo)).toEqual({ archivado: true });

    // Y después vuelve a leer: el archivo es la verdad, no el estado local.
    const lecturasTrasPatch = llamadas.slice(llamadas.indexOf(patch) + 1).filter((l) => l.metodo === "GET");
    expect(lecturasTrasPatch.length).toBeGreaterThan(0);
  });

  it("sin casos, lo dice y explica de dónde salen", async () => {
    globalThis.fetch = vi.fn(() => respuestaJson({ ok: true, total: 0, casos: [] }));

    montar();

    await waitFor(() =>
      expect(screen.getByText(/Todavía no hay ninguna intervención registrada/)).toBeTruthy()
    );
  });
});
