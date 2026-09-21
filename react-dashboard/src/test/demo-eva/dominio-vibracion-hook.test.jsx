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
 * lectura; y con la escrita a mano, igual.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let configurada = null;
vi.mock("@/Demo-EVA/data/comunes/MaquinaContext.jsx", () => ({
  useMaquina: () => ({ id: configurada?.id ?? "vibraciones", configurada, registro: null, enServicio: true }),
}));
vi.mock("@/lib/datasource", () => ({
  useDataSource: () => ({ transporte: "real" }),
}));
/* Fuentes que NUNCA contestan: es el primer render lo que se prueba. */
vi.mock("@/Demo-EVA/data/comunes/fuenteDeMaquina.js", () => ({
  fuenteDeMaquinaConfigurada: () => ({ subscribeVibracion: () => () => {} }),
}));
vi.mock("@/Demo-EVA/data/vibraciones/vibracionSource.js", () => ({
  fuenteDeVibracion: () => ({ subscribeVibracion: () => () => {} }),
}));

import { useDominioVibracion } from "@/Demo-EVA/data/vibraciones/vibracion.js";

afterEach(() => {
  configurada = null;
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
  });

  it("con la máquina escrita a mano trae sus tres apoyos y su área", () => {
    const { result } = renderHook(() => useDominioVibracion());

    expect(result.current.maquina.id).toBe("vibraciones");
    expect(result.current.maquina.configurada).toBe(false);
    expect(result.current.canalesMeta.map((c) => c.id)).toEqual(["S1", "S2", "S3"]);
  });
});
