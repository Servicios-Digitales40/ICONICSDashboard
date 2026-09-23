/**
 * El lector del historiador es de CUALQUIER máquina del registro (Plan 42.5
 * F1, D2): resuelve el punto con `sistema.series.punto` y se niega con
 * `SIN_SERIE` si `sistema.esHistorizada` dice que no, sin salir a la red.
 *
 * Se prueba con la fixture espejo de una configurada —`scripts/lib/
 * vibraciones-espejo.json`, 73 variables— en sus dos modos: con las series
 * del catálogo verificadas y con ninguna. Y se comprueba, antes de fiarse de
 * la puerta `data/tanque/historia.js`, que el registro del tanque dice lo
 * mismo que su catálogo para las 52 claves: si esto falla, la puerta cambia
 * el comportamiento del tanque sin que ninguna otra prueba lo note.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchIconicsHistory, fetchIconicsHistoryBatch } = vi.hoisted(() => ({
  fetchIconicsHistory: vi.fn(async () => ({ data: [] })),
  fetchIconicsHistoryBatch: vi.fn(async () => ({ ok: true, payload: { series: {} } })),
}));

vi.mock("@/lib/iconics", () => ({ fetchIconicsHistory, fetchIconicsHistoryBatch }));

import {
  SIN_SERIE,
  leerSerie,
  leerSeries,
  motivoSinSerie,
} from "@/Demo-EVA/data/comunes/historia.js";
import { SISTEMA } from "@shared/eva/comun/sistemas.js";
import { construirSistema } from "@shared/eva/comun/construirSistema.js";
import { tipoDe } from "@shared/eva/tipos/index.js";
import { SENAL_KEYS, esHistorizada, puntoHistorico } from "@shared/eva/tanque/senales.js";

import { configuracionEspejo } from "../../../../scripts/lib/configuracionEspejo.mjs";

const TIPO = tipoDe("vibraciones");

function espejo({ verificadas }) {
  const { configurada, verificadas: conSerie } = configuracionEspejo({ verificadasDelCatalogo: verificadas });
  const sistema = construirSistema(configurada, TIPO);
  const conHistoria = configurada.variables.filter((v) => conSerie.has(v.id) && v.historyPointName);
  const sinHistoria = configurada.variables.filter((v) => !conSerie.has(v.id));
  return { configurada, sistema, unaVerificable: conHistoria[0], unaSinSerie: sinHistoria[0] };
}

beforeEach(() => {
  fetchIconicsHistory.mockClear();
  fetchIconicsHistoryBatch.mockClear();
});

describe("el registro del tanque dice lo mismo que su catálogo (la puerta no cambia nada)", () => {
  it("para las 52 claves, `series.punto` y `esHistorizada` coinciden con `puntoHistorico` y `esHistorizada`", () => {
    const t = SISTEMA.tanque;
    const diferencias = [];
    for (const clave of SENAL_KEYS) {
      if (t.esHistorizada(clave) !== esHistorizada(clave)) diferencias.push(`${clave}: historizada`);
      if (esHistorizada(clave) && t.series.punto(clave) !== puntoHistorico(clave)) diferencias.push(`${clave}: punto`);
    }
    expect(SENAL_KEYS.length).toBe(52);
    expect(diferencias).toEqual([]);
  });
});

describe("leerSerie(sistema, clave) con una máquina configurada", () => {
  it("una clave verificada pide EXACTAMENTE su `series.punto` (el hda: literal, no derivado)", async () => {
    const { sistema, unaVerificable } = espejo({ verificadas: true });
    expect(unaVerificable).toBeDefined();

    const r = await leerSerie(sistema, unaVerificable.id);

    expect(r.motivo).toBeNull();
    expect(fetchIconicsHistory).toHaveBeenCalledTimes(1);
    const [punto, params] = fetchIconicsHistory.mock.calls[0];
    expect(punto).toBe(sistema.series.punto(unaVerificable.id));
    expect(punto).toBe(unaVerificable.historyPointName);
    expect(punto.startsWith("hda:")).toBe(true);
    expect(params.aggregate).toBe("Average");
  });

  it("una clave SIN serie verificada vuelve con SIN_SERIE y no toca la red", async () => {
    const { sistema, unaSinSerie } = espejo({ verificadas: true });
    expect(unaSinSerie).toBeDefined();

    const r = await leerSerie(sistema, unaSinSerie.id);

    expect(r).toEqual({ datos: [], motivo: SIN_SERIE, hasMore: false });
    expect(fetchIconicsHistory).not.toHaveBeenCalled();
  });

  it("con NINGUNA verificada, hasta la clave del catálogo vuelve con SIN_SERIE", async () => {
    const { sistema, configurada } = espejo({ verificadas: false });
    const conNombre = configurada.variables.find((v) => v.historyPointName);

    const r = await leerSerie(sistema, conNombre.id);

    expect(r.motivo).toBe(SIN_SERIE);
    expect(fetchIconicsHistory).not.toHaveBeenCalled();
  });

  it("una clave que el sistema no conoce se dice como desconocida, no como sin serie", async () => {
    const { sistema } = espejo({ verificadas: true });

    const r = await leerSerie(sistema, "esta-no-existe");

    expect(r.motivo).toBe("Señal desconocida: esta-no-existe");
    expect(motivoSinSerie(sistema, "esta-no-existe")).toMatch(/desconocida/);
    expect(fetchIconicsHistory).not.toHaveBeenCalled();
  });

  it("en crudo descarta la muestra que el servidor cuela fuera del rango", async () => {
    const { sistema, unaVerificable } = espejo({ verificadas: true });
    const inicio = new Date("2026-08-17T00:00:00Z");
    const fin = new Date("2026-08-17T06:00:00Z");
    fetchIconicsHistory.mockResolvedValueOnce({
      data: [
        { timestamp: "2026-05-01T00:00:00Z", value: 1, quality: 0 }, // la muestra límite, meses antes
        { timestamp: "2026-08-17T01:00:00Z", value: 1, quality: 0 },
      ],
    });

    const r = await leerSerie(sistema, unaVerificable.id, { inicio, fin }, { crudo: true });

    expect(r.datos).toHaveLength(1);
    expect(r.datos[0].t.toISOString()).toBe("2026-08-17T01:00:00.000Z");
    expect(fetchIconicsHistory.mock.calls[0][1].aggregate).toBeUndefined();
  });
});

describe("leerSeries(sistema, claves) mezcla verificadas y no verificadas sin pedir las segundas", () => {
  it("las sin serie se resuelven en local y sólo viajan las verificadas, por su hda:", async () => {
    const { sistema, unaVerificable, unaSinSerie } = espejo({ verificadas: true });
    const punto = sistema.series.punto(unaVerificable.id);
    fetchIconicsHistoryBatch.mockResolvedValueOnce({
      ok: true,
      payload: {
        series: {
          [punto]: {
            data: [{ timestamp: "2026-08-17T01:00:00Z", value: 2.5, quality: 0 }],
            hasMore: false,
            tramos: 3,
            tramosConDato: 1,
          },
        },
      },
    });

    const r = await leerSeries(sistema, [unaVerificable.id, unaSinSerie.id]);

    expect(fetchIconicsHistoryBatch).toHaveBeenCalledTimes(1);
    expect(fetchIconicsHistoryBatch.mock.calls[0][0]).toEqual([punto]);
    expect(r[unaSinSerie.id].motivo).toBe(SIN_SERIE);
    expect(r[unaVerificable.id].datos.map((p) => p.valor)).toEqual([2.5]);
    expect(r[unaVerificable.id].cobertura).toMatchObject({ tramos: 3, tramosConDato: 1, completa: false });
  });

  it("con todas sin serie, no hay petición", async () => {
    const { sistema, configurada } = espejo({ verificadas: false });

    const r = await leerSeries(sistema, configurada.variables.slice(0, 3).map((v) => v.id));

    expect(fetchIconicsHistoryBatch).not.toHaveBeenCalled();
    expect(Object.values(r).every((s) => s.motivo === SIN_SERIE)).toBe(true);
  });
});

describe("sin un `sistema` del registro, el lector se niega y dice qué falta", () => {
  it("lanza con un mensaje que nombra `claves()`, `esHistorizada()` y `series.punto()`", async () => {
    await expect(leerSerie(null, "x")).rejects.toThrow(/claves\(\).*esHistorizada\(\).*series\.punto\(\)/);
    await expect(leerSeries({ esHistorizada: () => true }, ["x"])).rejects.toThrow(/sistema/);
  });
});
