/**
 * `clavesConTendencia` (Plan 42.5 F1, la respuesta al «[?]» de D5): qué series
 * de una máquina configurada llevan tendencia en Planta y en qué orden. Es
 * dominio puro; se prueba en Node con la fixture espejo.
 */
import { describe, expect, it } from "vitest";

import { construirSistema } from "@shared/eva/comun/construirSistema.js";
import { clavesConTendencia } from "@shared/eva/comun/vistaDeMaquina.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { configuracionEspejo } from "../../../../scripts/lib/configuracionEspejo.mjs";

const TIPO = tipoDe("vibraciones");

function espejo(verificadas) {
  const { configurada } = configuracionEspejo({ verificadasDelCatalogo: verificadas });
  return { configurada, sistema: construirSistema(configurada, TIPO) };
}

describe("qué lleva tendencia", () => {
  it("sólo las series VERIFICADAS que además son una medida", () => {
    const { configurada, sistema } = espejo(true);
    const claves = clavesConTendencia(sistema, configurada, TIPO);

    expect(claves.length).toBeGreaterThan(0);
    for (const c of claves) {
      expect(sistema.esHistorizada(c)).toBe(true);
      expect(sistema.metaDe(c).naturaleza).toBe("medida");
    }
    /* Ninguna alarma, aunque tenga serie: su tendencia es un flanco, no una curva. */
    const alarmas = sistema.series.historizadas().filter((c) => sistema.metaDe(c)?.naturaleza === "alarma");
    for (const a of alarmas) expect(claves).not.toContain(a);
  });

  it("sin ninguna verificada, ninguna: no se promete una curva que el sondeo no confirmó", () => {
    const { configurada, sistema } = espejo(false);
    expect(clavesConTendencia(sistema, configurada, TIPO)).toEqual([]);
  });

  it("con un sistema que no sabe de series, vacío y sin lanzar", () => {
    expect(clavesConTendencia(null, null, TIPO)).toEqual([]);
    expect(clavesConTendencia({ series: {} }, { variables: [] }, TIPO)).toEqual([]);
  });
});

describe("en qué orden", () => {
  it("por apoyo en el orden del tipo, dentro por rol en el orden del tipo, y lo suelto al final", () => {
    const { configurada, sistema } = espejo(true);
    const claves = clavesConTendencia(sistema, configurada, TIPO);
    const variable = new Map(configurada.variables.map((v) => [v.id, v]));
    const posApoyo = new Map(TIPO.canales.map((c, i) => [c.id, i]));
    const posRol = new Map(Object.keys(TIPO.roles).map((r, i) => [r, i]));

    const apoyoDe = (c) => posApoyo.get(variable.get(c)?.assetId) ?? Infinity;
    const rolDe = (c) => posRol.get(variable.get(c)?.rol) ?? Infinity;

    /* La primera es del primer apoyo del tipo, con su primer rol. */
    expect(variable.get(claves[0]).assetId).toBe(TIPO.canales[0].id);
    expect(variable.get(claves[0]).rol).toBe(Object.keys(TIPO.roles)[0]);

    /* Los apoyos no retroceden; dentro de un apoyo, los roles tampoco. */
    for (let i = 1; i < claves.length; i++) {
      const [a, b] = [claves[i - 1], claves[i]];
      expect(apoyoDe(b)).toBeGreaterThanOrEqual(apoyoDe(a));
      if (apoyoDe(a) === apoyoDe(b)) expect(rolDe(b)).toBeGreaterThanOrEqual(rolDe(a));
    }

    /* Lo que no cuelga de un apoyo va al final, todo junto. */
    const primeraSuelta = claves.findIndex((c) => apoyoDe(c) === Infinity);
    if (primeraSuelta >= 0) {
      for (const c of claves.slice(primeraSuelta)) expect(apoyoDe(c)).toBe(Infinity);
    }
  });

  it("un tipo sin apoyos ni roles deja el orden de la configuración", () => {
    const { configurada, sistema } = espejo(true);
    const claves = clavesConTendencia(sistema, configurada, { canales: [], roles: {} });
    const posicion = new Map(configurada.variables.map((v, i) => [v.id, i]));

    for (let i = 1; i < claves.length; i++) {
      expect(posicion.get(claves[i])).toBeGreaterThan(posicion.get(claves[i - 1]));
    }
  });
});
