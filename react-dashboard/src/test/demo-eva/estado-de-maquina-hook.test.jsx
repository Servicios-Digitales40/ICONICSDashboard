// @vitest-environment jsdom
/**
 * `useEstadoDeMaquina` y `useSeriesDeMaquina` (Plan 42.5 F1): la forma común
 * de la máquina en contexto, sin abrir un motor propio —piden la fuente a la
 * misma caché que las vistas de vibraciones— y la forma vacía sin máquina.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let configurada = null;
vi.mock("@/Demo-EVA/data/comunes/MaquinaContext.jsx", () => ({
  useMaquina: () => ({ id: configurada?.id ?? null, configurada, registro: null, enServicio: Boolean(configurada) }),
}));
vi.mock("@/lib/datasource", () => ({
  useDataSource: () => ({ transporte: "real" }),
}));

/* Una fuente falsa con la superficie que los hooks usan, y un contador de
   cuántas se piden: la caché real es lo que garantiza «un motor por máquina»,
   así que aquí sólo se afirma que el hook NO construye nada por su cuenta. */
let suscriptor = null;
const fuenteFalsa = {
  sistema: { id: "vib-motor-03" },
  buffer: { puntosDe: () => [] },
  subscribe: vi.fn((cb) => {
    suscriptor = cb;
    cb({ estado: null, lastUpdated: null, loading: true, error: null });
    return () => {
      suscriptor = null;
    };
  }),
  leerSeries: vi.fn(async (claves) =>
    Object.fromEntries(claves.map((c) => [c, { datos: [{ t: new Date(0), valor: 1 }], motivo: null, hasMore: false, cobertura: null }])),
  ),
};
const fuenteDeMaquinaConfigurada = vi.fn(() => fuenteFalsa);
vi.mock("@/Demo-EVA/data/comunes/fuenteDeMaquina.js", () => ({
  fuenteDeMaquinaConfigurada: (...a) => fuenteDeMaquinaConfigurada(...a),
}));

import { useEstadoDeMaquina, useSeriesDeMaquina } from "@/Demo-EVA/data/comunes/useEstadoDeMaquina.js";

const MAQUINA = { id: "vib-motor-03", nombre: "Nuevo-Modor", tipo: "vibraciones", variables: [], assets: [] };

afterEach(() => {
  configurada = null;
  suscriptor = null;
  vi.clearAllMocks();
});

describe("useEstadoDeMaquina", () => {
  it("con máquina delante pide la fuente de la caché y publica la forma común cuando llega", async () => {
    configurada = MAQUINA;
    const { result } = renderHook(() => useEstadoDeMaquina());

    expect(fuenteDeMaquinaConfigurada).toHaveBeenCalledWith(MAQUINA, "real");
    expect(result.current.loading).toBe(true);
    expect(result.current.estado).toBeNull();
    expect(result.current.sistema).toEqual({ id: "vib-motor-03" });
    expect(result.current.maquina).toBe(MAQUINA);

    const leidoA = new Date("2026-09-22T20:00:00Z");
    act(() => {
      suscriptor({
        estado: { sistema: "vib-motor-03", senales: [{ clave: "vRMS_S1", valor: 1.2 }] },
        lastUpdated: leidoA,
        loading: false,
        error: null,
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.estado.senales[0].clave).toBe("vRMS_S1");
    expect(result.current.lastUpdated).toBe(leidoA);
    expect(result.current.buffer).toBe(fuenteFalsa.buffer);
  });

  it("sin máquina delante devuelve la forma vacía, sin `loading` y sin pedir ninguna fuente", () => {
    const { result } = renderHook(() => useEstadoDeMaquina());

    expect(result.current.maquina).toBeNull();
    expect(result.current.sistema).toBeNull();
    expect(result.current.estado).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(fuenteDeMaquinaConfigurada).not.toHaveBeenCalled();
  });

  it("una fuente que no se puede construir no tumba el render: viaja en `error`", () => {
    configurada = { ...MAQUINA, tipo: "prensa" };
    fuenteDeMaquinaConfigurada.mockImplementationOnce(() => {
      throw new Error("tipo «prensa» desconocido");
    });

    const { result } = renderHook(() => useEstadoDeMaquina());

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toMatch(/prensa/);
    expect(result.current.maquina).toEqual(configurada);
    expect(result.current.fuente).toBeNull();
  });

  it("se da de baja al desmontar", () => {
    configurada = MAQUINA;
    const { unmount } = renderHook(() => useEstadoDeMaquina());
    expect(suscriptor).toBeTypeOf("function");

    unmount();

    expect(suscriptor).toBeNull();
  });
});

describe("useSeriesDeMaquina", () => {
  it("pide las claves a la fuente de la máquina, en una llamada, y devuelve el contrato de useSeriesHistoricas", async () => {
    configurada = MAQUINA;
    const { result } = renderHook(() => useSeriesDeMaquina(["vRMS_S1", "aRMS_S1"], { horas: 6, puntos: 24 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fuenteFalsa.leerSeries).toHaveBeenCalledTimes(1);
    expect(fuenteFalsa.leerSeries.mock.calls[0][0]).toEqual(["vRMS_S1", "aRMS_S1"]);
    expect(Object.keys(result.current.porClave)).toEqual(["vRMS_S1", "aRMS_S1"]);
    expect(result.current.metaPorClave.vRMS_S1).toEqual({ motivo: null, error: null });
    expect(result.current.filas).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("sin máquina resuelve vacío y sin `loading`, sin pedir nada", async () => {
    const { result } = renderHook(() => useSeriesDeMaquina(["vRMS_S1"]));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.porClave).toEqual({});
    expect(fuenteFalsa.leerSeries).not.toHaveBeenCalled();
  });

  it("un fallo de la petición llega en `error` y en `metaPorClave`, no como rango vacío", async () => {
    configurada = MAQUINA;
    fuenteFalsa.leerSeries.mockRejectedValueOnce(new Error("el puente no responde"));
    const { result } = renderHook(() => useSeriesDeMaquina(["vRMS_S1"]));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.metaPorClave.vRMS_S1.error).toMatch(/puente/);
    expect(result.current.porClave).toEqual({});
  });
});
