// @vitest-environment jsdom
/**
 * cierre-diagnostico.test.jsx
 * ------------------------------------------------------------------
 * `CierreDiagnostico.jsx` (Plan 16 Fase 5, UI A), montada de verdad sobre
 * un origen de datos simulado (`VITE_ICONICS_FAKE`, mismo criterio que
 * `riesgos-mismo-layout.test.jsx`) y un `fetch` de mentira para
 * `/api/diagnostico` y `/api/casos` — las dos rutas nuevas de esta fase,
 * que no tienen equivalente en el origen simulado.
 *
 * Lo que importa proteger: el título del riesgo sale de `REGLAS` aunque el
 * riesgo ya no esté activo (por eso no depende del simulador para
 * aparecer), las causas candidatas que devuelve `/api/diagnostico` se
 * pintan y se pueden elegir, y el cierre manda un cuerpo con la forma que
 * espera `CrearCasoSchema`.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/EvaProvider.jsx";
import CierreDiagnostico from "@/Demo-EVA/views/CierreDiagnostico.jsx";

const DIAGNOSTICO_RESPUESTA = {
  ok: true,
  sistema: "tanque",
  riesgoId: "bomba-sin-salida",
  diagnosticEventId: "diag-test-0001",
  huerfano: false,
  causas: [
    {
      id: "valvula-impulsion-cerrada",
      titulo: "Válvula de impulsión cerrada o agarrotada",
      componente: "Válvula de impulsión",
      banda: "alto",
      respaldo: { datos: 3, manual: 0, casos: 0, total: 3 },
      origen: "riesgos.js · accion",
      manualCitado: [],
      casosCitados: [
        { id: "interv-anterior", fecha: "2026-01-01", resuelto: true, resumen: "La válvula estaba agarrotada." },
      ],
    },
    {
      id: "sin-recirculacion-minima",
      titulo: "Sin línea de recirculación mínima",
      componente: "Línea de recirculación",
      banda: "bajo",
      respaldo: { datos: 3, manual: 0, casos: 0, total: 3 },
      origen: "riesgos.js · accion",
      manualCitado: [],
      casosCitados: [],
    },
  ],
};

function respuestaJson(cuerpo, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(cuerpo)),
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

function montar(params, { casoRespuesta } = {}) {
  const fetchMock = vi.fn((url, opciones = {}) => {
    const u = String(url);
    if (u.includes("/api/diagnostico")) return respuestaJson(DIAGNOSTICO_RESPUESTA);
    if (u.includes("/api/casos") && opciones.method === "POST") {
      return respuestaJson(casoRespuesta ?? { ok: true, caso: { id: "interv-x" } }, casoRespuesta?.ok === false ? 400 : 201);
    }
    return respuestaJson({ ok: true });
  });
  globalThis.fetch = fetchMock;

  const utils = render(
    <ThemeProvider>
      <DataSourceProvider>
        <EvaProvider>
          <CierreDiagnostico params={params} onNavigate={vi.fn()} />
        </EvaProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );
  return { ...utils, fetchMock };
}

describe("CierreDiagnostico", () => {
  it("sin riesgoId, dice que falta el riesgo en vez de mostrar un formulario roto", () => {
    montar({});
    expect(screen.getByText(/Falta el riesgo/i)).toBeTruthy();
  });

  it("el título del riesgo sale de REGLAS aunque no esté activo en el simulador", async () => {
    montar({ sistema: "tanque", riesgoId: "bomba-sin-salida" });
    // "La bomba gira contra una salida cerrada" es el título estático de la
    // regla — tiene que aparecer YA, sin esperar a que `/api/diagnostico`
    // resuelva ni a que el riesgo esté activo.
    expect(await screen.findByText(/La bomba gira contra una salida cerrada/i)).toBeTruthy();
  });

  it("las causas candidatas de /api/diagnostico se pintan y se preseleccionan", async () => {
    montar({ sistema: "tanque", riesgoId: "bomba-sin-salida" });

    // El título aparece DOS veces a propósito: una en la zona hundida (lo
    // que el sistema ya calculó, no editable) y otra en el selector de la
    // zona elevada (lo que la persona confirma o corrige) — de ahí
    // `findAllByText` en vez de `findByText`.
    expect(await screen.findAllByText(/Sin línea de recirculación mínima/i)).not.toHaveLength(0);
    // La primera (más respaldo) queda pre-elegida — "nadie teclea el
    // diagnóstico" — visible por su marca "(propuesta por el sistema)".
    expect(screen.getAllByText(/propuesta por el sistema/i).length).toBeGreaterThan(0);
  });

  it("«Otra causa» habilita el campo libre, y el cierre manda causaReal.tipo con lo escrito", async () => {
    const { fetchMock } = montar({ sistema: "tanque", riesgoId: "bomba-sin-salida" });
    await screen.findAllByText(/Sin línea de recirculación mínima/i);

    fireEvent.click(screen.getByText("Otra causa"));
    fireEvent.change(screen.getByPlaceholderText(/Qué falló de verdad/i), {
      target: { value: "Sello mecánico roto" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Se liberó la válvula/i), {
      target: { value: "Se sustituyó el sello mecánico completo." },
    });

    const boton = screen.getByText("Cerrar caso").closest("button");
    expect(boton.disabled).toBe(false);

    fireEvent.click(boton);

    await waitFor(() => expect(screen.getByText(/Caso registrado/i)).toBeTruthy());

    const llamadaCasos = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/casos"));
    expect(llamadaCasos).toBeTruthy();
    const cuerpo = JSON.parse(llamadaCasos[1].body);
    expect(cuerpo.sistema).toBe("tanque");
    expect(cuerpo.causaReal.tipo).toBe("Sello mecánico roto");
    expect(cuerpo.solucion).toMatch(/sello mecánico/i);
    expect(cuerpo.resuelto).toBe(true);
    expect(cuerpo.disparador).toEqual({ tipo: "riesgo", riesgoId: "bomba-sin-salida", severidad: "critico" });
    // No coincide con la propuesta del sistema (el primer id de la lista):
    // diagnosticoCorrecto tiene que decir que no, no quedarse sin decidir.
    expect(cuerpo.diagnosticoCorrecto).toBe(false);
  });

  it("el cierre manda casosCitados, diagnosticEventId y el top-N completo (Plan 17 Fase 5)", async () => {
    const { fetchMock } = montar({ sistema: "tanque", riesgoId: "bomba-sin-salida" });
    await screen.findAllByText(/Sin línea de recirculación mínima/i);

    fireEvent.change(screen.getByPlaceholderText(/Se liberó la válvula/i), {
      target: { value: "Se liberó la válvula de impulsión." },
    });
    fireEvent.click(screen.getByText("Cerrar caso"));

    await waitFor(() => expect(screen.getByText(/Caso registrado/i)).toBeTruthy());

    const llamadaCasos = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/casos"));
    const cuerpo = JSON.parse(llamadaCasos[1].body);

    // Antes de esta fase, esto se perdía al cerrar el caso: "qué casos se
    // citaron" era irrecuperable pasado el momento del diagnóstico.
    expect(cuerpo.diagnostico.casosCitados).toEqual([
      { id: "interv-anterior", fecha: "2026-01-01", resuelto: true, resumen: "La válvula estaba agarrotada." },
    ]);
    expect(cuerpo.diagnostico.diagnosticEventId).toBe("diag-test-0001");
    // El top-N completo, no sólo la ganadora: las DOS causas del fixture.
    expect(cuerpo.diagnostico.candidatas).toEqual([
      { id: "valvula-impulsion-cerrada", banda: "alto", respaldo: { datos: 3, manual: 0, casos: 0, total: 3 } },
      { id: "sin-recirculacion-minima", banda: "bajo", respaldo: { datos: 3, manual: 0, casos: 0, total: 3 } },
    ]);
  });

  it("«No funcionó» viaja como resuelto:false, sin bloquear el envío", async () => {
    const { fetchMock } = montar({ sistema: "tanque", riesgoId: "bomba-sin-salida" });
    await screen.findAllByText(/Sin línea de recirculación mínima/i);

    fireEvent.change(screen.getByPlaceholderText(/Se liberó la válvula/i), {
      target: { value: "Se intentó liberar la válvula, sin éxito." },
    });
    fireEvent.click(screen.getByText("No funcionó"));
    fireEvent.click(screen.getByText("Cerrar caso"));

    await waitFor(() => expect(screen.getByText(/Caso registrado/i)).toBeTruthy());

    const llamadaCasos = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/casos"));
    const cuerpo = JSON.parse(llamadaCasos[1].body);
    expect(cuerpo.resuelto).toBe(false);
    // La primera causa (la que trae el fetch) queda pre-elegida por
    // defecto: coincide con la propuesta, así que sí es "correcto".
    expect(cuerpo.diagnosticoCorrecto).toBe(true);
  });
});
