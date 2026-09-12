/**
 * alarmas.test.js
 * ------------------------------------------------------------------
 * Plan 13, Fase 9 (F1): el historial de alarmas y el filtro por activo,
 * probado sin dar por hecho un campo que no está confirmado — ver la
 * cabecera de `data/comunes/alarmas.js`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { etiquetaDePunto, leerAlarmas, perteneceAlActivo } from "@/Demo-EVA/data/comunes/alarmas.js";

afterEach(() => vi.unstubAllGlobals());

const EVENTO_NIVEL = { eventId: "e1", startDate: "2026-08-20 10:00:00", pointName: "ac:TDCON/DEMO/INSTRUMENTACION_DE_PROCESO/NIVEL_TANQUE" };
const EVENTO_CAUDAL = { eventId: "e2", startDate: "2026-08-20 10:05:00", pointName: "ac:TDCON/DEMO/INSTRUMENTACION_DE_PROCESO/FLUJO_INSTANTANEO" };
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
    const evento = { eventId: "e4", PointName: "ac:TDCON/DEMO/INSTRUMENTACION_DE_PROCESO/NIVEL_TANQUE" };
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

/**
 * ── `leerAlarmas` YA NO LLAMA A `/AlarmHistory` (12-09-2026) ─────────
 *
 * Estas dos pruebas mockeaban `fetch` para devolver `{ alarms: [...] }` y
 * afirmaban que la función pasaba eso tal cual. Fijaban un contrato que el
 * servidor real no cumple: medido con `scripts/sondear-alarmas.mjs` contra
 * `bms-server`, `/AlarmHistory` devuelve **500** en esta instalación porque no
 * hay Alarm Historian montado.
 *
 * Ahora los eventos se DERIVAN de la serie del historiador —que sí responde— y
 * la función devuelve `{ eventos, clave, hasMore }`. Se mockea `/History`, que
 * es a donde va de verdad la petición.
 */
describe("leerAlarmas: deriva los eventos de la serie del historiador", () => {
  /*
   * La forma que devuelve EL PUENTE, no la de ICONICS: `{ data, hasMore }`, ya
   * aplanada por `backend/iconics/client.mjs`. Lo que sí es de ICONICS y hay que
   * respetar es que `value` viene BOOLEANO, no 0/1 — medido el 12-09-2026.
   */
  const serieDelServidor = (muestras) =>
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ ok: true, data: muestras, hasMore: false }),
    })));

  const T0 = new Date("2026-09-11T02:00:00.000Z");
  const muestra = (min, value) => ({
    timestamp: new Date(T0.getTime() + min * 60_000).toISOString(),
    quality: 0,
    value,
  });

  it("un flanco de subida y otro de bajada son un evento con su duración", async () => {
    serieDelServidor([muestra(0, false), muestra(5, true), muestra(9, false)]);

    const { eventos } = await leerAlarmas(6, "nivelAltoAlto");

    expect(eventos).toHaveLength(1);
    expect(eventos[0].duracionMs).toBe(4 * 60_000);
    expect(eventos[0].activa).toBe(false);
  });

  it("una serie sin flancos no inventa eventos", async () => {
    serieDelServidor([muestra(0, false), muestra(5, false)]);

    const { eventos } = await leerAlarmas(6, "nivelAltoAlto");
    expect(eventos).toEqual([]);
  });

  it("devuelve también QUÉ alarma se leyó, para que la vista no lo suponga", async () => {
    serieDelServidor([muestra(0, false)]);

    const { clave } = await leerAlarmas(6, "presionAlta");
    expect(clave).toBe("presionAlta");
  });

  it("sin alarma que consultar no pregunta, y lo dice con una lista vacía", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { eventos, clave } = await leerAlarmas(6, null);

    expect(eventos).toEqual([]);
    expect(clave).toBeNull();
    // La diferencia entre «no ha pasado nada» y un error del servidor: no se
    // pregunta en vez de provocar el fallo que esta función existe para evitar.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("una respuesta con forma inesperada no revienta — devuelve una lista vacía", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({}),
    })));

    const { eventos } = await leerAlarmas(6, "nivelAltoAlto");
    expect(eventos).toEqual([]);
  });
});
