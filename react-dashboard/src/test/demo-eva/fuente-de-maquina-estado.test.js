/**
 * La fuente de una máquina configurada entrega, además del dominio de
 * vibraciones, lo que una vista GENÉRICA necesita (Plan 42.5 F1, D8): la forma
 * común con una señal por variable, la lectura por clave con su fecha, el
 * búfer de sesión y un lector del historiador que sabe de ESTA máquina.
 *
 * Y decide una sola vez quién lee el pasado: el `readSerie` del transporte si
 * lo trae (simulado), el historiador por HTTP si no. En los dos caminos la
 * guarda «tiene serie verificada» va primero.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchIconicsHistory, fetchIconicsHistoryBatch } = vi.hoisted(() => ({
  fetchIconicsHistory: vi.fn(async () => ({ data: [] })),
  fetchIconicsHistoryBatch: vi.fn(async () => ({ ok: true, payload: { series: {} } })),
}));
vi.mock("@/lib/iconics/apiClient.js", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchIconicsHistory,
  fetchIconicsHistoryBatch,
}));

import { createFuenteDeMaquina, olvidarFuentesDeMaquina } from "@/Demo-EVA/data/comunes/fuenteDeMaquina.js";
import { SIN_SERIE } from "@shared/eva/comun/historia.js";

const RAIZ = "ac:TDCON/DEMO_VIBRACIONES/Vibraciones/";
const HDA = "hda:\\Configuration\\DEMO 3\\S1:vRMS_S1";

const variable = (id, pointName, rol, assetId, historia = null) => ({
  id, pointName, rol, assetId, acceso: "read",
  historyPointName: historia, historyVerified: Boolean(historia),
});

const maquina = () => ({
  id: "vib-prueba",
  nombre: "Motor de prueba",
  tipo: "vibraciones",
  plc: "PLC_2 · ua:DEMO3",
  cadenciaMs: 5000,
  revisada: null,
  assets: [
    { id: "Vibraciones", pointName: RAIZ, rol: "raiz" },
    { id: "S1", pointName: `${RAIZ}S1/`, rol: "secundario" },
    { id: "V20", pointName: `${RAIZ}V20/`, rol: "secundario" },
  ],
  variables: [
    variable("vRMS_S1", `${RAIZ}S1/vRMS_S1`, "medida:vRMS", "S1", HDA),
    variable("aRMS_S1", `${RAIZ}S1/aRMS_S1`, "medida:aRMS", "S1"),
    variable("SPEED_BMS", `${RAIZ}V20/SPEED_BMS`, "variador:velocidad", "V20"),
  ],
});

function transporteFalso(valores, { readSerie = undefined } = {}) {
  const t = {
    async read(puntos) {
      const salida = new Map();
      for (const p of puntos) if (p in valores) salida.set(p, { value: valores[p], quality: 0 });
      return salida;
    },
  };
  if (readSerie) t.readSerie = readSerie;
  return t;
}

const LECTURAS = { [`${RAIZ}S1/vRMS_S1`]: 1.23, [`${RAIZ}S1/aRMS_S1`]: 0.5, [`${RAIZ}V20/SPEED_BMS`]: 1480 };

const primeraLectura = (fuente) =>
  new Promise((resolver) => {
    const off = fuente.subscribe((s) => {
      if (s.lastUpdated) {
        off();
        resolver(s);
      }
    });
  });

afterEach(() => {
  olvidarFuentesDeMaquina();
  fetchIconicsHistory.mockClear();
  fetchIconicsHistoryBatch.mockClear();
});

describe("la forma común viaja en la misma instantánea", () => {
  it("`estado.senales` trae una señal por variable con su valor, y `historia` sólo en la verificada", async () => {
    const fuente = createFuenteDeMaquina({ maquina: maquina(), transport: transporteFalso(LECTURAS), intervalMs: 60_000 });
    const s = await primeraLectura(fuente);
    fuente.stop();

    expect(fuente.sistema.id).toBe("vib-prueba");
    expect(s.canales.S1.vRMS).toBe(1.23); // el dominio de vibraciones sigue igual
    const porClave = Object.fromEntries(s.estado.senales.map((x) => [x.clave, x]));
    expect(Object.keys(porClave).sort()).toEqual(["SPEED_BMS", "aRMS_S1", "vRMS_S1"]);
    expect(porClave.vRMS_S1.valor).toBe(1.23);
    expect(porClave.vRMS_S1.historia).toBe(true);
    expect(porClave.aRMS_S1.historia).toBe(false);
    expect(s.estado.leidoA).toEqual(s.lastUpdated);
    expect(s.estado.sistema).toBe("vib-prueba");
  });

  it("`lecturaDe(clave)` trae valor y fecha mientras hay suscriptor; una clave ajena es `null`, no otra señal", async () => {
    const fuente = createFuenteDeMaquina({ maquina: maquina(), transport: transporteFalso(LECTURAS), intervalMs: 60_000 });
    // Se lee DENTRO de la suscripción: al soltar el último suscriptor el motor
    // libera los puntos y la lectura vuelve a «sin dato», que es lo correcto
    // (ver `motor-por-sistema.test.js`: volver a entrar no finge una máquina muda).
    const l = await new Promise((resolver) => {
      const off = fuente.subscribe((s) => {
        if (!s.lastUpdated) return;
        const lectura = fuente.lecturaDe("vRMS_S1");
        const ajena = fuente.lecturaDe("noExiste");
        off();
        resolver({ lectura, ajena });
      });
    });
    fuente.stop();

    expect(l.lectura.valor).toBe(1.23);
    expect(l.lectura.receivedAt).toBeInstanceOf(Date);
    expect(l.lectura.stale).toBe(false);
    expect(l.ajena).toBeNull();
  });

  it("el búfer de sesión crece con cada lectura, por clave", async () => {
    const fuente = createFuenteDeMaquina({ maquina: maquina(), transport: transporteFalso(LECTURAS), intervalMs: 60_000 });
    await primeraLectura(fuente);
    fuente.stop();

    const puntos = fuente.buffer.puntosDe("vRMS_S1");
    expect(puntos).toHaveLength(1);
    expect(puntos[0].valor).toBe(1.23);
    expect(puntos[0].t).toBeInstanceOf(Date);
    expect(fuente.buffer.puntosDe("noExiste")).toEqual([]);
  });
});

describe("quién lee el pasado se decide por transporte, con la guarda primero", () => {
  it("sin `readSerie`, la verificada va al historiador por su hda: y la no verificada ni sale", async () => {
    const fuente = createFuenteDeMaquina({ maquina: maquina(), transport: transporteFalso(LECTURAS), intervalMs: 60_000 });

    const conSerie = await fuente.leerSerie("vRMS_S1");
    const sinSerie = await fuente.leerSerie("aRMS_S1");
    fuente.stop();

    expect(conSerie.motivo).toBeNull();
    expect(fetchIconicsHistory).toHaveBeenCalledTimes(1);
    expect(fetchIconicsHistory.mock.calls[0][0]).toBe(HDA);
    expect(sinSerie.motivo).toBe(SIN_SERIE);
  });

  it("con `readSerie` (simulado), la verificada se pide por su punto EN VIVO y la no verificada tampoco sale", async () => {
    const readSerie = vi.fn(async () => ({
      datos: [{ t: new Date(), valor: 1 }], motivo: null, hasMore: false, cobertura: null,
    }));
    const fuente = createFuenteDeMaquina({
      maquina: maquina(), transport: transporteFalso(LECTURAS, { readSerie }), intervalMs: 60_000,
    });

    const conSerie = await fuente.leerSerie("vRMS_S1");
    const sinSerie = await fuente.leerSerie("aRMS_S1");
    const varias = await fuente.leerSeries(["vRMS_S1", "aRMS_S1"]);
    fuente.stop();

    expect(conSerie.datos).toHaveLength(1);
    expect(readSerie).toHaveBeenCalledTimes(2); // una por leerSerie, una por leerSeries
    expect(readSerie.mock.calls[0][0]).toBe(`${RAIZ}S1/vRMS_S1`);
    expect(sinSerie.motivo).toBe(SIN_SERIE);
    expect(varias.vRMS_S1.datos).toHaveLength(1);
    expect(varias.aRMS_S1.motivo).toBe(SIN_SERIE);
    expect(fetchIconicsHistory).not.toHaveBeenCalled();
  });
});
