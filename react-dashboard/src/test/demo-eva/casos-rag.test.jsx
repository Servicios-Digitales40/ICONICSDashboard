// @vitest-environment jsdom
/**
 * casos-rag.test.jsx
 * ------------------------------------------------------------------
 * La vista «RAG · Casos previos» (`views/comunes/CasosRag.jsx`), montada de
 * verdad sobre un `fetch` de mentira — mismo criterio que
 * `documentacion-rag.test.jsx`: es una vista sin dominio EVA detrás, así que
 * no hay origen simulado que aprovechar.
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

/* La vista enseña los casos de LA máquina en contexto (Plan 33 F10): se le
   pone delante una configurada, como hacen las demás pruebas de vistas. */
const ID_MAQUINA = "vib-motor-03";
vi.mock("@/Demo-EVA/data/comunes/MaquinaContext.jsx", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useMaquina: () => ({ ...original.useMaquina(), id: ID_MAQUINA, enServicioIds: [ID_MAQUINA] }),
  };
});

import { ThemeProvider } from "@/theme";
import CasosRag from "@/Demo-EVA/views/comunes/CasosRag.jsx";

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
  sistema: ID_MAQUINA,
  sintoma: "Vibración en zona de daño en S1",
  causa: "Desalineación del acoplamiento",
  solucion: "Se alineó el acoplamiento",
  resuelto: true,
  origen: "Técnico de turno",
  disparador: { tipo: "riesgo", riesgoId: "vibracion-en-alarma" },
  diagnostico: { propuesta: "rodamiento-desgastado", respaldo: "alto" },
  causaReal: { tipo: "desalineacion", componente: "Acoplamiento" },
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
        <CasosRag />
      </ThemeProvider>
    </StrictMode>
  );
}

/*
 * ── REABIERTA CON UNA MÁQUINA CONFIGURADA (Plan 42.5 F3) ──────────────
 *
 * Estuvo omitida desde la rama `Vibraciones1.0`: montaba casos del tanque y
 * la vista había pasado a filtrar por la máquina en servicio. No se
 * reescribió entonces con casos de vibraciones «para no tapar el hecho» de
 * que la bitácora real no tenía ninguno. Ese hecho dejó de ser lo que la rama
 * quiere resolver —el despliegue puede vaciar la bitácora y llenarla con lo
 * que cierre sobre configuradas—, así que los casos de prueba son ahora de
 * una configurada y la suite vuelve a correr entera. El filtro por máquina
 * sigue cubierto en `casos-solo-en-servicio.test.jsx`.
 */
describe("RAG · Casos previos", () => {
  it("lista los casos activos y esconde los archivados", async () => {
    globalThis.fetch = vi.fn(() =>
      respuestaJson({ ok: true, total: 2, casos: [CASO_ACTIVO, CASO_ARCHIVADO] })
    );

    montar();

    await waitFor(() => expect(screen.getByText("Vibración en zona de daño en S1")).toBeTruthy());
    // El ruido de pruebas está archivado: no puede aparecer entre lo que hoy
    // respalda un diagnóstico.
    expect(screen.queryByText("La bomba falla")).toBeNull();
  });

  it("el filtro «Archivados» enseña lo que el diagnóstico ya no mira", async () => {
    globalThis.fetch = vi.fn(() =>
      respuestaJson({ ok: true, total: 2, casos: [CASO_ACTIVO, CASO_ARCHIVADO] })
    );

    montar();
    await waitFor(() => expect(screen.getByText("Vibración en zona de daño en S1")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Archivados/ }));

    expect(screen.getByText("La bomba falla")).toBeTruthy();
    expect(screen.queryByText("Vibración en zona de daño en S1")).toBeNull();
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
    await waitFor(() => expect(screen.getByText("Vibración en zona de daño en S1")).toBeTruthy());

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
