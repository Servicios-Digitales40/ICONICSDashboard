/**
 * apiClient.test.js
 * ------------------------------------------------------------------
 * Plan 13, Fase 9 (F1): las tres funciones nuevas del cliente —
 * `fetchIconicsAlarms`, `acknowledgeIconicsAlarms`, `fetchHealth`—, que
 * hasta ahora no tenían ni un contrato comprobado: `apiClient.js` entero
 * llegaba a esta fase sin una sola prueba.
 *
 * Se mockea `fetch` global: lo que importa aquí es que cada función arme la
 * URL y el verbo correctos y respete el contrato de error del resto del
 * archivo (`ok: false` o HTTP no-2xx → excepción), no la red real.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { acknowledgeIconicsAlarms, fetchHealth, fetchIconicsAlarms } from "@/lib/iconics/apiClient.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(status, body) {
  const llamada = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", llamada);
  return llamada;
}

describe("fetchIconicsAlarms", () => {
  it("pide /api/iconics/alarms con las horas pedidas, sin pointName si no se da", async () => {
    const llamada = mockFetch(200, { alarms: [{ eventId: "e1", startDate: "2026-08-20 10:00:00" }] });
    const r = await fetchIconicsAlarms(undefined, 6);

    const url = new URL(llamada.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/api/iconics/alarms");
    expect(url.searchParams.get("hours")).toBe("6");
    expect(url.searchParams.has("pointName")).toBe(false);
    expect(r.alarms).toHaveLength(1);
  });

  it("con pointName, lo añade a la query", async () => {
    const llamada = mockFetch(200, { alarms: [] });
    await fetchIconicsAlarms("ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE", 1);

    const url = new URL(llamada.mock.calls[0][0], "http://x");
    expect(url.searchParams.get("pointName")).toBe("ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE");
  });

  it("sin horas explícitas, pide 1 — la misma hora por defecto que ya documenta el backend", async () => {
    const llamada = mockFetch(200, { alarms: [] });
    await fetchIconicsAlarms();
    const url = new URL(llamada.mock.calls[0][0], "http://x");
    expect(url.searchParams.get("hours")).toBe("1");
  });

  it("un ok:false del servidor se propaga como excepción, con el motivo si lo trae", async () => {
    mockFetch(200, { ok: false, error: "ICONICS_API_BASE is not configured." });
    await expect(fetchIconicsAlarms()).rejects.toThrow("ICONICS_API_BASE is not configured.");
  });

  it("un 500 sin ok:false también se propaga, con un mensaje genérico si no trae error", async () => {
    mockFetch(500, {});
    await expect(fetchIconicsAlarms()).rejects.toThrow(/Error 500/);
  });
});

describe("acknowledgeIconicsAlarms", () => {
  it("llama con PUT, y manda eventIds + comment en el cuerpo", async () => {
    const llamada = mockFetch(200, { ok: true, result: { acknowledged: 1 } });
    const r = await acknowledgeIconicsAlarms(["e1", "e2"], "revisado en turno");

    const [url, opciones] = llamada.mock.calls[0];
    expect(String(url)).toContain("/api/iconics/alarms/acknowledge");
    expect(opciones.method).toBe("PUT");
    expect(JSON.parse(opciones.body)).toEqual({ eventIds: ["e1", "e2"], comment: "revisado en turno" });
    expect(r.result.acknowledged).toBe(1);
  });

  it("sin comment, manda cadena vacía — no undefined, que rompería JSON.stringify en el servidor", async () => {
    const llamada = mockFetch(200, { ok: true, result: {} });
    await acknowledgeIconicsAlarms(["e1"]);
    expect(JSON.parse(llamada.mock.calls[0][1].body).comment).toBe("");
  });

  it("un 403 (modo solo lectura) se propaga como excepción, no como un ok:false silencioso", async () => {
    mockFetch(403, { ok: false, error: "El servidor está en modo solo lectura (ICONICS_READ_ONLY=true)." });
    await expect(acknowledgeIconicsAlarms(["e1"])).rejects.toThrow(/solo lectura/);
  });
});

describe("fetchHealth", () => {
  it("lee /api/health y devuelve el cuerpo tal cual, incluido readOnly", async () => {
    mockFetch(200, { status: "ok", readOnly: true, iconicsReachable: true, tokenValid: true });
    const r = await fetchHealth();
    expect(r.readOnly).toBe(true);
  });

  it("no exige un campo ok explícito: /api/health nunca lo trae, y no debe fallar por eso", async () => {
    // Confirmado en el propio backend (routes/systemRoutes.mjs): la
    // respuesta de /api/health no tiene `ok`, sólo `status`. Si getJson()
    // exigiera `ok === true` en vez de sólo comprobar que no sea `false`,
    // esta llamada fallaría siempre y ninguna vista de salud funcionaría.
    mockFetch(200, { status: "ok", readOnly: false });
    await expect(fetchHealth()).resolves.toMatchObject({ readOnly: false });
  });
});
