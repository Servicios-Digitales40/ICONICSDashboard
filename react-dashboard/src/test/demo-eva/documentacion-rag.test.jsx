// @vitest-environment jsdom
/**
 * documentacion-rag.test.jsx
 * ------------------------------------------------------------------
 * La vista «RAG · Documentación» (`views/DocumentacionRag.jsx`, Plan 16
 * Fase 1/2), montada de verdad sobre un `fetch` de mentira que contesta lo
 * que cada prueba necesita — no hay origen simulado para esto, es una vista
 * nueva sin dominio EVA detrás.
 *
 * Lo que importa proteger: el estado «sin configurar» no confunde al que lo
 * lee con una carpeta vacía, un manual roto se ve roto y no como uno con
 * cero fragmentos a secas, y archivar no dispara sin el segundo clic de
 * confirmación.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import DocumentacionRag from "@/Demo-EVA/views/DocumentacionRag.jsx";

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

const BASE_RESPUESTA = {
  ok: true,
  configurado: true,
  cargaHabilitada: true,
  modo: "BM25",
  indexando: false,
  progreso: null,
  manuales: [],
};

function montarCon(respuestaInicial) {
  const fetchMock = vi.fn(() => respuestaJson(respuestaInicial));
  globalThis.fetch = fetchMock;
  const utils = render(
    <ThemeProvider>
      <DocumentacionRag />
    </ThemeProvider>
  );
  return { ...utils, fetchMock };
}

describe("RAG · Documentación — estados de carga", () => {
  it("sin IA_DOCS_DIR, lo dice en vez de enseñar una carpeta vacía", async () => {
    montarCon({ ...BASE_RESPUESTA, configurado: false, manuales: [] });

    await waitFor(() =>
      expect(screen.getByText(/Sin documentación configurada/i)).toBeTruthy()
    );
    expect(screen.queryByText(/Arrastra un manual/i)).toBeNull();
  });

  it("con la carga desactivada, no enseña la zona de subida", async () => {
    montarCon({ ...BASE_RESPUESTA, cargaHabilitada: false });

    await waitFor(() =>
      expect(screen.getByText(/carga de manuales está desactivada/i)).toBeTruthy()
    );
    expect(screen.queryByText(/Arrastra un manual/i)).toBeNull();
  });

  it("con la carga activada, la zona de subida está disponible", async () => {
    montarCon(BASE_RESPUESTA);

    await waitFor(() => expect(screen.getByText(/Arrastra un manual/i)).toBeTruthy());
  });
});

describe("RAG · Documentación — el catálogo", () => {
  const CON_MANUALES = {
    ...BASE_RESPUESTA,
    manuales: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        archivo: "manual.pdf",
        sistema: null,
        titulo: "Manual indexado",
        version: 1,
        estado: "activo",
        subidoPor: "anonimo",
        fecha: "2026-09-01T09:00:00.000Z",
        fragmentos: 42,
        motivoIlegible: null,
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        archivo: "roto.pdf",
        sistema: null,
        titulo: "roto.pdf",
        version: 1,
        estado: "activo",
        subidoPor: "anonimo",
        fecha: "2026-09-01T09:05:00.000Z",
        fragmentos: 0,
        motivoIlegible: "no contiene texto extraíble (probablemente es un escaneo); haría falta OCR",
      },
      {
        id: "33333333-3333-3333-3333-333333333333",
        archivo: "viejo.txt",
        sistema: "tanque",
        titulo: "Manual archivado",
        version: 2,
        estado: "archivado",
        subidoPor: "anonimo",
        fecha: "2026-08-01T09:00:00.000Z",
        fragmentos: null,
        motivoIlegible: null,
      },
    ],
  };

  it("un manual indexado enseña sus fragmentos", async () => {
    montarCon(CON_MANUALES);

    await waitFor(() => expect(screen.getByText("Manual indexado")).toBeTruthy());
    expect(screen.getByText(/42 fragmentos/)).toBeTruthy();
    expect(screen.getByText("indexado")).toBeTruthy();
  });

  it("un manual que no se pudo leer se ve roto, no como uno vacío", async () => {
    montarCon(CON_MANUALES);

    await waitFor(() => expect(screen.getByText("no se pudo leer")).toBeTruthy());
    expect(screen.getByText(/probablemente es un escaneo/)).toBeTruthy();
  });

  it("un manual archivado no cuenta en las estadísticas de cabecera", async () => {
    montarCon(CON_MANUALES);

    await waitFor(() => expect(screen.getByText("Manual archivado")).toBeTruthy());
    // Dos activos (indexado + roto), el archivado queda fuera del recuento.
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("archivado")).toBeTruthy();
  });

  it("archivar exige un segundo clic de confirmación", async () => {
    const fetchMock = vi.fn((url, opciones) => {
      if (opciones?.method === "PATCH") return respuestaJson({ ok: true, manual: CON_MANUALES.manuales[0] });
      return respuestaJson(CON_MANUALES);
    });
    globalThis.fetch = fetchMock;

    render(
      <ThemeProvider>
        <DocumentacionRag />
      </ThemeProvider>
    );

    await waitFor(() => expect(screen.getByText("Manual indexado")).toBeTruthy());

    const botonesArchivar = screen.getAllByTitle("Archivar (no borra el archivo)");
    fireEvent.click(botonesArchivar[0]);

    const confirmar = await screen.findByText("Confirmar");
    // Un solo clic no debe haber llamado a PATCH todavía.
    expect(fetchMock.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);

    fireEvent.click(confirmar);

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(true)
    );
  });
});
