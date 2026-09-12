// @vitest-environment jsdom
/**
 * alarmas-eva.test.jsx
 * ------------------------------------------------------------------
 * Plan 13, Fase 9 (F1): la vista completa — lista, filtro por activo, y el
 * botón de reconocer que sólo aparece cuando `/api/health` confirma que el
 * puente NO está en modo solo lectura. Se mockea `@/lib/iconics` porque lo
 * que importa aquí es el cableado de la vista, no la red — el contrato de
 * cada función del cliente ya lo prueba `apiClient.test.js`.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";

const { fetchIconicsAlarms, fetchHealth, acknowledgeIconicsAlarms } = vi.hoisted(() => ({
  fetchIconicsAlarms: vi.fn(async () => ({ alarms: [] })),
  fetchHealth: vi.fn(async () => ({ readOnly: true })),
  acknowledgeIconicsAlarms: vi.fn(async () => ({ result: {} })),
}));

vi.mock("@/lib/iconics", () => ({ fetchIconicsAlarms, fetchHealth, acknowledgeIconicsAlarms }));

import AlarmasEva from "@/Demo-EVA/views/comunes/AlarmasEva.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const montar = () => render(<ThemeProvider><AlarmasEva /></ThemeProvider>);

const EVENTO_NIVEL = { eventId: "e1", startDate: "2026-08-20 10:00:00", pointName: "ac:TDCON/DEMO/INSTRUMENTACION_DE_PROCESO/NIVEL_TANQUE" };
const EVENTO_CAUDAL = { eventId: "e2", startDate: "2026-08-20 09:00:00", pointName: "ac:TDCON/DEMO/INSTRUMENTACION_DE_PROCESO/FLUJO_INSTANTANEO" };

describe("AlarmasEva: la lista, y lo que dice cuando está vacía o falla", () => {
  it("sin eventos en la ventana, lo dice — no una tabla vacía muda", async () => {
    montar();
    await waitFor(() => expect(screen.getByText(/Sin eventos en esta ventana/)).toBeTruthy());
  });

  it("con eventos, se listan ordenados del más reciente al más antiguo", async () => {
    fetchIconicsAlarms.mockResolvedValueOnce({ alarms: [EVENTO_CAUDAL, EVENTO_NIVEL] });
    montar();

    await waitFor(() => expect(screen.getByText("e1")).toBeTruthy());
    const filas = screen.getAllByText(/^e[12]$/).map((n) => n.textContent);
    expect(filas).toEqual(["e1", "e2"]); // e1 es 10:00, e2 es 09:00 — e1 primero
  });

  it("un fallo de red se cuenta como fallo, no como «sin eventos»", async () => {
    fetchIconicsAlarms.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    montar();

    await waitFor(() => expect(screen.getByText(/No se pudo leer el historial/)).toBeTruthy());
    expect(screen.queryByText(/Sin eventos/)).toBeNull();
  });

  it("«Actualizar» vuelve a pedir la ventana actual", async () => {
    montar();
    await waitFor(() => expect(fetchIconicsAlarms).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Actualizar/ }));
    await waitFor(() => expect(fetchIconicsAlarms).toHaveBeenCalledTimes(2));
  });

  it("cambiar de ventana (6 horas) vuelve a pedir con las horas nuevas", async () => {
    montar();
    await waitFor(() => expect(fetchIconicsAlarms).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "6 horas" }));
    await waitFor(() => expect(fetchIconicsAlarms).toHaveBeenCalledTimes(2));
    expect(fetchIconicsAlarms.mock.calls[1]).toEqual([undefined, 6]);
  });
});

describe("AlarmasEva: el filtro por activo, contra los eventos ya traídos", () => {
  it("filtrar por «Tanque» esconde el evento de Distribución, sin volver a pedir al servidor", async () => {
    fetchIconicsAlarms.mockResolvedValueOnce({ alarms: [EVENTO_NIVEL, EVENTO_CAUDAL] });
    montar();
    await waitFor(() => expect(screen.getByText("e1")).toBeTruthy());
    expect(screen.getByText("e2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Tanque" }));

    expect(screen.getByText("e1")).toBeTruthy();
    expect(screen.queryByText("e2")).toBeNull();
    expect(fetchIconicsAlarms).toHaveBeenCalledTimes(1); // el filtro es local, no una nueva petición
  });
});

describe("AlarmasEva: reconocer, sólo cuando el puente no está en solo lectura", () => {
  it("con el puente en solo lectura (por defecto y confirmado), no hay botón ni casillas", async () => {
    fetchIconicsAlarms.mockResolvedValueOnce({ alarms: [EVENTO_NIVEL] });
    montar();
    await waitFor(() => expect(screen.getByText("e1")).toBeTruthy());

    expect(screen.queryByRole("button", { name: /Reconocer/ })).toBeNull();
    expect(screen.queryByLabelText(/Seleccionar evento/)).toBeNull();
  });

  /*
   * ── DOS CLICS, NO UNO (Plan 24 F5 · USO-05) ────────────────────────
   *
   * Esta prueba hacía UN clic y esperaba el acuse. Falló al añadirse la
   * confirmación de dos pasos, y falló con razón: reconocer es una escritura
   * sobre la instalación —el acuse viaja al Alarm Server y allí queda— y la
   * casilla de cabecera puede seleccionar la ventana entera, así que un clic
   * accidental tapaba de una vez avisos que nadie había leído.
   *
   * Se actualiza a dos clics Y se añade la prueba de que UNO solo no basta, que
   * es la mitad que de verdad protege: sin ella, quitar la confirmación mañana
   * dejaría esta suite en verde.
   */
  it("con el puente en escritura, aparecen las casillas y el botón, y dos clics reconocen los eventIds elegidos", async () => {
    fetchHealth.mockResolvedValueOnce({ readOnly: false });
    fetchIconicsAlarms.mockResolvedValue({ alarms: [EVENTO_NIVEL] });
    montar();

    await waitFor(() => expect(screen.getByRole("button", { name: /Reconocer/ })).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Seleccionar evento e1"));

    // Primer clic: pide confirmar y NO manda nada.
    fireEvent.click(screen.getByRole("button", { name: /Reconocer/ }));
    expect(acknowledgeIconicsAlarms).not.toHaveBeenCalled();

    // El botón lo dice, en vez de quedarse igual y no hacer nada.
    const confirmar = await screen.findByRole("button", { name: /Pulsa otra vez/ });
    fireEvent.click(confirmar);

    await waitFor(() => expect(acknowledgeIconicsAlarms).toHaveBeenCalledWith(["e1"]));
  });

  it("un solo clic no acciona nada: es una escritura sobre la instalación", async () => {
    fetchHealth.mockResolvedValueOnce({ readOnly: false });
    fetchIconicsAlarms.mockResolvedValue({ alarms: [EVENTO_NIVEL] });
    montar();

    await waitFor(() => expect(screen.getByRole("button", { name: /Reconocer/ })).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Seleccionar evento e1"));
    fireEvent.click(screen.getByRole("button", { name: /Reconocer/ }));

    // Se espera de verdad, en vez de comprobar en el mismo tick: un acuse que
    // saliera con un retardo de una promesa pasaría una aserción inmediata.
    await new Promise((r) => setTimeout(r, 50));
    expect(acknowledgeIconicsAlarms).not.toHaveBeenCalled();
  });

  it("si /api/health no responde, se queda en modo solo lectura — el lado seguro", async () => {
    fetchHealth.mockRejectedValueOnce(new Error("no disponible"));
    fetchIconicsAlarms.mockResolvedValueOnce({ alarms: [EVENTO_NIVEL] });
    montar();

    await waitFor(() => expect(screen.getByText("e1")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Reconocer/ })).toBeNull();
  });
});
