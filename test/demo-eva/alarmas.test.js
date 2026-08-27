/**
 * alarmas.test.js
 * ------------------------------------------------------------------
 * Plan 13, Fase 9 (F1): el historial de alarmas y el filtro por activo,
 * probado sin dar por hecho un campo que no está confirmado — ver la
 * cabecera de `data/alarmas.js`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { etiquetaDePunto, leerAlarmas, perteneceAlActivo } from "@/Demo-EVA/data/alarmas.js";

afterEach(() => vi.unstubAllGlobals());

const EVENTO_NIVEL = { eventId: "e1", startDate: "2026-08-20 10:00:00", pointName: "ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE" };
const EVENTO_CAUDAL = { eventId: "e2", startDate: "2026-08-20 10:05:00", pointName: "ac:TDCON/DEMO/SENSORES/SFLUJO_INSTANTANEO" };
const EVENTO_SIN_PUNTO = { eventId: "e3", startDate: "2026-08-20 10:10:00" };

describe("perteneceAlActivo: el filtro, sin dar el campo del punto por garantizado", () => {
  it("sin activoId (sin filtro elegido), todo pasa", () => {
    expect(perteneceAlActivo(EVENTO_NIVEL, "")).toBe(true);
    expect(perteneceAlActivo(EVENTO_NIVEL, null)).toBe(true);
  });

  it("un evento de Tanque pasa el filtro «tanque» y no el de «distribucion»", () => {
    expect(perteneceAlActivo(EVENTO_NIVEL, "tanque")).toBe(true);
    expect(perteneceAlActivo(EVENTO_NIVEL, "distribucion")).toBe(false);
  });

  it("un evento de Distribución (caudal) pasa «distribucion», no «tanque»", () => {
    expect(perteneceAlActivo(EVENTO_CAUDAL, "distribucion")).toBe(true);
    expect(perteneceAlActivo(EVENTO_CAUDAL, "tanque")).toBe(false);
  });

  it("un evento sin ningún campo de punto reconocible PASA el filtro — no se esconde en silencio", () => {
    expect(perteneceAlActivo(EVENTO_SIN_PUNTO, "tanque")).toBe(true);
  });

  it("reconoce el punto aunque venga en PascalCase (PointName)", () => {
    const evento = { eventId: "e4", PointName: "ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE" };
    expect(perteneceAlActivo(evento, "tanque")).toBe(true);
    expect(perteneceAlActivo(evento, "distribucion")).toBe(false);
  });
});

describe("etiquetaDePunto: el nombre corto del catálogo, no el tag crudo, cuando se puede", () => {
  it("un punto reconocido del catálogo se muestra con su corto", () => {
    expect(etiquetaDePunto(EVENTO_NIVEL)).toBe("Nivel");
  });

  it("un punto que no está en el catálogo de esta demo se muestra tal cual llegó", () => {
    const evento = { eventId: "e5", pointName: "ac:OTRA_PLANTA/ALGO" };
    expect(etiquetaDePunto(evento)).toBe("ac:OTRA_PLANTA/ALGO");
  });

  it("sin ningún campo de punto, no hay etiqueta que mostrar", () => {
    expect(etiquetaDePunto(EVENTO_SIN_PUNTO)).toBeNull();
  });
});

describe("leerAlarmas: delgado sobre fetchIconicsAlarms", () => {
  it("devuelve el arreglo de alarmas tal cual", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ alarms: [EVENTO_NIVEL] }),
    })));
    expect(await leerAlarmas(6)).toEqual([EVENTO_NIVEL]);
  });

  it("si el servidor no manda alarms (forma inesperada), no revienta — devuelve []", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({}),
    })));
    expect(await leerAlarmas()).toEqual([]);
  });
});
