/**
 * `filtrarClaves`, `esRolDeMedida` y `contarPorActivo` (Plan 42.5 F6, D16):
 * el filtro de series por activo y por «sólo medidas» que comparten la Planta
 * y «Comparar señales». Dominio puro, en Node, con la fixture espejo: las
 * cifras se calculan desde la configuración, no se escriben aquí.
 */
import { describe, expect, it } from "vitest";

import { construirSistema } from "@shared/eva/comun/construirSistema.js";
import {
  SIN_ACTIVO, clavesConTendencia, contarPorActivo, esRolDeMedida, filtrarClaves,
} from "@shared/eva/comun/vistaDeMaquina.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { configuracionEspejo } from "../../../../scripts/lib/configuracionEspejo.mjs";

const TIPO = tipoDe("vibraciones");

function espejo() {
  const { configurada } = configuracionEspejo({ verificadasDelCatalogo: true });
  const sistema = construirSistema(configurada, TIPO);
  const claves = clavesConTendencia(sistema, configurada, TIPO);
  const porClave = new Map(configurada.variables.map((v) => [v.id ?? v.pointName, v]));
  return { configurada, sistema, claves, porClave };
}

describe("esRolDeMedida", () => {
  it("sólo la familia `medida` es una medida; una calidad, un variador o nada no lo son", () => {
    expect(esRolDeMedida("medida:vRMS")).toBe(true);
    expect(esRolDeMedida("calidad:qcVRMS")).toBe(false);
    expect(esRolDeMedida("variador:par")).toBe(false);
    expect(esRolDeMedida(null)).toBe(false);
    expect(esRolDeMedida(undefined)).toBe(false);
  });
});

describe("filtrarClaves", () => {
  it("sin filtro devuelve las mismas claves, en el mismo orden", () => {
    const { configurada, sistema, claves } = espejo();
    expect(filtrarClaves(sistema, configurada, claves)).toEqual(claves);
    expect(filtrarClaves(sistema, configurada, claves, {})).toEqual(claves);
  });

  it("«sólo medidas» deja exactamente las claves de rol `medida:*`, y son menos", () => {
    const { configurada, sistema, claves } = espejo();
    const medidas = filtrarClaves(sistema, configurada, claves, { soloMedidas: true });

    expect(medidas.length).toBeGreaterThan(0);
    expect(medidas.length).toBeLessThan(claves.length);
    for (const c of medidas) expect(sistema.metaDe(c).rol).toMatch(/^medida:/);
    /* Y ninguna medida se quedó fuera. */
    const fuera = claves.filter((c) => !medidas.includes(c));
    for (const c of fuera) expect(esRolDeMedida(sistema.metaDe(c).rol)).toBe(false);
  });

  it("por activo deja sólo las del `assetId`, conservando el orden", () => {
    const { configurada, sistema, claves, porClave } = espejo();
    const deS1 = filtrarClaves(sistema, configurada, claves, { activo: "S1" });

    expect(deS1.length).toBeGreaterThan(0);
    for (const c of deS1) expect(porClave.get(c).assetId).toBe("S1");
    expect(deS1).toEqual(claves.filter((c) => porClave.get(c).assetId === "S1"));
  });

  it("activo y «sólo medidas» se componen: las medidas de ese apoyo", () => {
    const { configurada, sistema, claves, porClave } = espejo();
    const medidasS2 = filtrarClaves(sistema, configurada, claves, { activo: "S2", soloMedidas: true });

    expect(medidasS2.length).toBeGreaterThan(0);
    for (const c of medidasS2) {
      expect(porClave.get(c).assetId).toBe("S2");
      expect(sistema.metaDe(c).rol).toMatch(/^medida:/);
    }
  });

  it("`SIN_ACTIVO` agrupa las variables sin `assetId`; un activo desconocido deja cero", () => {
    const { configurada, sistema, claves, porClave } = espejo();
    const sueltas = filtrarClaves(sistema, configurada, claves, { activo: SIN_ACTIVO });

    expect(sueltas.length).toBeGreaterThan(0);
    for (const c of sueltas) expect(porClave.get(c).assetId ?? null).toBeNull();
    expect(filtrarClaves(sistema, configurada, claves, { activo: "S9" })).toEqual([]);
  });

  it("una variable SIN rol no cuenta como medida: no se adivina", () => {
    const { configurada, sistema, claves } = espejo();
    const sinRol = { ...configurada, variables: configurada.variables.map((v) => ({ ...v, rol: null })) };
    const sistemaSinRol = construirSistema(sinRol, TIPO);
    expect(filtrarClaves(sistemaSinRol, sinRol, claves, { soloMedidas: true })).toEqual([]);
    /* Y sin sistema cae al rol de la configuración, no revienta. */
    expect(filtrarClaves(null, configurada, claves, { soloMedidas: true }).length).toBeGreaterThan(0);
    expect(filtrarClaves(sistema, configurada, null)).toEqual([]);
  });
});

describe("contarPorActivo", () => {
  it("cuenta las claves por activo y suma el total; las sueltas van a `SIN_ACTIVO`", () => {
    const { configurada, claves, porClave } = espejo();
    const cuenta = contarPorActivo(configurada, claves);

    expect(Object.values(cuenta).reduce((a, b) => a + b, 0)).toBe(claves.length);
    for (const [id, n] of Object.entries(cuenta)) {
      const esperadas = claves.filter((c) => (porClave.get(c).assetId ?? SIN_ACTIVO) === id);
      expect(n, id).toBe(esperadas.length);
    }
    expect(contarPorActivo(configurada, [])).toEqual({});
  });
});
