// @vitest-environment jsdom
/**
 * dominio-vibracion-hook.test.jsx
 * ------------------------------------------------------------------
 * `useDominioVibracion()` con una máquina configurada, ANTES de la primera
 * lectura. Plan 37 F2 · defecto del 21-09-2026.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 * El primer render devuelve el estado vacío, y con una máquina configurada
 * ese estado no traía `maquina`: Inicio hacía `maquina.configurada` sobre
 * `undefined` y la vista entera caía en «No se pudo mostrar esta sección». La
 * meta de la máquina tiene que estar desde el primer render, con o sin
 * lectura.
 *
 * Y SIN máquina delante (Plan 40 F2, retirada la escrita a mano) el hook no
 * abre ninguna fuente: devuelve la forma vacía con `maquina: null` y
 * `loading: false`, para que una vista de planta sepa que no hay nada que
 * esperar. Hasta entonces «sin configurada» significaba la escrita a mano, con
 * sus tres apoyos; esa rama ya no existe.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let configurada = null;
vi.mock("@/Demo-EVA/data/comunes/MaquinaContext.jsx", () => ({
  useMaquina: () => ({ id: configurada?.id ?? null, configurada, registro: null, enServicio: Boolean(configurada) }),
}));
vi.mock("@/lib/datasource", () => ({
  useDataSource: () => ({ transporte: "real" }),
}));
/* Fuentes que NUNCA contestan: es el primer render lo que se prueba. Y se
   cuenta cuántas se abren, para afirmar que sin máquina no se abre ninguna. */
const fuenteDeMaquinaConfigurada = vi.fn(() => ({ subscribeVibracion: () => () => {} }));
vi.mock("@/Demo-EVA/data/comunes/fuenteDeMaquina.js", () => ({
  fuenteDeMaquinaConfigurada: (...a) => fuenteDeMaquinaConfigurada(...a),
}));

import { useDominioVibracion } from "@/Demo-EVA/data/vibraciones/vibracion.js";

afterEach(() => {
  configurada = null;
  vi.clearAllMocks();
});

describe("useDominioVibracion antes de la primera lectura", () => {
  it("con una máquina configurada trae su meta desde el primer render", () => {
    configurada = {
      id: "vib-motor-03", nombre: "Nuevo-Modor", tipo: "vibraciones",
      arboles: { enVivo: "ac:X/", historico: null, alarmas: "ae:/AREA" }, variables: [],
    };
    const { result } = renderHook(() => useDominioVibracion());

    expect(result.current.loading).toBe(true);
    expect(result.current.maquina).toEqual({
      id: "vib-motor-03", nombre: "Nuevo-Modor", configurada: true, area: "ae:/AREA",
    });
    expect(result.current.canalesMeta).toEqual([]);
    expect(fuenteDeMaquinaConfigurada).toHaveBeenCalledWith(configurada, "real");
  });

  it("sin máquina delante devuelve la forma vacía, con `maquina: null`, y no abre ninguna fuente", () => {
    const { result } = renderHook(() => useDominioVibracion());

    expect(result.current.maquina).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.canalesMeta).toEqual([]);
    expect(result.current.canales).toEqual({});
    expect(fuenteDeMaquinaConfigurada).not.toHaveBeenCalled();
  });
});
