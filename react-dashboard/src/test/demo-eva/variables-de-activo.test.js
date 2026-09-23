/**
 * `activosConVariables` y `variablesDeActivo` (Plan 42.5 F2, D3 y D9): las
 * pestañas del Detalle son los assets con variables, y cada variable llega a
 * la tarjeta en la forma que ésta espera, adaptada desde la forma común sin
 * inventar escala, historia ni sentido de mejora. Dominio puro, en Node, con
 * la fixture espejo.
 */
import { describe, expect, it } from "vitest";

import { construirSistema } from "@shared/eva/comun/construirSistema.js";
import { SIN_ACTIVO, activosConVariables, variablesDeActivo } from "@shared/eva/comun/vistaDeMaquina.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { configuracionEspejo } from "../../../../scripts/lib/configuracionEspejo.mjs";

const TIPO = tipoDe("vibraciones");
const LEIDO = new Date("2026-09-22T21:00:00Z");

function espejo({ verificadas = true, valor = 2.5 } = {}) {
  const { configurada } = configuracionEspejo({ verificadasDelCatalogo: verificadas });
  const sistema = construirSistema(configurada, TIPO);
  const estado = sistema.estado(() => valor, sistema, LEIDO);
  return { configurada, sistema, estado };
}

describe("activosConVariables: las pestañas", () => {
  it("son los assets con al menos una variable, en el orden de la configuración, y «Sin activo» al final", () => {
    const { configurada } = espejo();
    const activos = activosConVariables(configurada);

    expect(activos.map((a) => a.id)).toEqual(["S1", "S2", "S3", SIN_ACTIVO]);
    for (const a of activos) expect(a.variables).toBeGreaterThan(0);
    /* La raíz y el área no tienen variables colgadas: no son pestaña. */
    expect(activos.some((a) => a.id.startsWith("ac:") || a.id.startsWith("ae:"))).toBe(false);
    expect(activos.at(-1).nombre).toBeNull();
  });

  it("sin variables sin activo, no hay pestaña «Sin activo»", () => {
    const { configurada } = espejo();
    const soloConActivo = { ...configurada, variables: configurada.variables.filter((v) => v.assetId) };
    expect(activosConVariables(soloConActivo).some((a) => a.id === SIN_ACTIVO)).toBe(false);
  });

  it("un `assetId` que no está declarado en `assets` agrupa igual, con su id de rótulo", () => {
    const { configurada } = espejo();
    const conHuerfana = {
      ...configurada,
      variables: [...configurada.variables, { id: "x", pointName: "ac:x", assetId: "S9", rol: "medida:vRMS" }],
    };
    const s9 = activosConVariables(conHuerfana).find((a) => a.id === "S9");
    expect(s9).toEqual({ id: "S9", nombre: "S9", variables: 1 });
  });

  it("el nombre del asset es su rótulo cuando lo tiene", () => {
    const { configurada } = espejo();
    const conNombre = { ...configurada, assets: configurada.assets.map((a) => (a.id === "S1" ? { ...a, nombre: "Lado acople" } : a)) };
    expect(activosConVariables(conNombre).find((a) => a.id === "S1").nombre).toBe("Lado acople");
  });
});

describe("variablesDeActivo: la forma de la tarjeta", () => {
  it("trae cada variable del activo con rótulo, tag, valor y estado de la forma común", () => {
    const { configurada, sistema, estado } = espejo();
    const vars = variablesDeActivo(sistema, configurada, estado, "S1", TIPO);

    expect(vars.length).toBeGreaterThan(0);
    for (const v of vars) {
      expect(configurada.variables.find((x) => x.id === v.key).assetId).toBe("S1");
      expect(v.label).toBe(sistema.metaDe(v.key).label);
      expect(v.tag).toMatch(/^ac:/);
      expect(v.punto).toBe(v.tag);
      expect(v.valor).toBe(2.5);
      expect(typeof v.decimales).toBe("number");
      expect(v.tipo).toBe("numero");
      expect(v).not.toHaveProperty("subirEsBueno");
    }
  });

  it("`historizado` es la serie VERIFICADA, y viaja la causa persistida", () => {
    const { configurada, sistema, estado } = espejo();
    const conCausa = {
      ...configurada,
      variables: configurada.variables.map((v) =>
        v.historyVerified ? { ...v, historyCausa: "serie-propia" } : { ...v, historyCausa: "serie-compartida", historyCompartidaCon: ["otra"] },
      ),
    };
    const vars = variablesDeActivo(sistema, conCausa, estado, "S1", TIPO);
    const verificadas = vars.filter((v) => v.historizado);
    const sinSerie = vars.filter((v) => !v.historizado);

    expect(verificadas.length).toBeGreaterThan(0);
    expect(sinSerie.length).toBeGreaterThan(0);
    for (const v of verificadas) {
      expect(sistema.esHistorizada(v.key)).toBe(true);
      expect(v.historiaCausa).toBe("serie-propia");
    }
    for (const v of sinSerie) {
      expect(v.historiaCausa).toBe("serie-compartida");
      expect(v.historiaCompartidaCon).toEqual(["otra"]);
    }
  });

  it("sin ninguna verificada, ninguna es `historizado` aunque tenga hda:", () => {
    const { configurada, sistema, estado } = espejo({ verificadas: false });
    const vars = variablesDeActivo(sistema, configurada, estado, "S1", TIPO);
    expect(vars.every((v) => v.historizado === false)).toBe(true);
    expect(vars.every((v) => v.historiaCausa === null)).toBe(true);
  });

  it("la escala sólo existe donde el tipo declara banda para el rol; la `banda` de la tarjeta es el estado", () => {
    const { configurada, sistema, estado } = espejo();
    const vars = variablesDeActivo(sistema, configurada, estado, "S1", TIPO);
    const vRMS = vars.find((v) => v.rol === "medida:vRMS");
    const aRMS = vars.find((v) => v.rol === "medida:aRMS");

    expect(vRMS.escala).toEqual({ min: 0, max: TIPO.umbrales.iso.alarma });
    expect(aRMS.escala).toBeNull();
    /* 2,5 mm/s a régimen... sin velocidad en `estado` la banda ISO no aplica:
       el estado que venga es el que se pinta, no uno inventado. */
    expect(vRMS.banda).toBe(vRMS.estado);
  });

  it("sin lectura, la banda es null: un valor ausente no tiene color", () => {
    const { configurada, sistema } = espejo();
    const estadoVacio = sistema.estado(() => null, sistema, null);
    const vars = variablesDeActivo(sistema, configurada, estadoVacio, "S1", TIPO);
    for (const v of vars) {
      expect(v.valor).toBeNull();
      expect(v.banda).toBeNull();
    }
  });

  it("las de naturaleza alarma (banderas) NO son tarjeta: viven en su sección", () => {
    const { configurada, sistema, estado } = espejo();
    const vars = variablesDeActivo(sistema, configurada, estado, "S1", TIPO);
    expect(vars.some((v) => v.naturaleza === "alarma")).toBe(false);
    const banderasDeS1 = configurada.variables.filter((v) => v.assetId === "S1" && sistema.metaDe(v.id)?.naturaleza === "alarma");
    expect(banderasDeS1.length).toBeGreaterThan(0);
    for (const b of banderasDeS1) expect(vars.some((v) => v.key === b.id)).toBe(false);
  });

  it("«Sin activo» agrupa las variables sin `assetId`; un activo desconocido devuelve vacío", () => {
    const { configurada, sistema, estado } = espejo();
    const sueltas = variablesDeActivo(sistema, configurada, estado, SIN_ACTIVO, TIPO);
    expect(sueltas.length).toBeGreaterThan(0);
    for (const v of sueltas) expect(configurada.variables.find((x) => x.id === v.key).assetId).toBeNull();
    expect(variablesDeActivo(sistema, configurada, estado, "S9", TIPO)).toEqual([]);
  });

  it("una lectura booleana sale como tarjeta booleana con texto, no como cifra", () => {
    /* La Planta cayó en el navegador el 23-09-2026 por formatear un `true` como
       número; el Detalle pasa por aquí y cierra la misma trampa en dominio. */
    const { configurada, sistema } = espejo();
    const estado = sistema.estado((p) => (/alarma|aviso|offset|QC_|Count/i.test(p) ? true : 1.5), sistema, LEIDO);
    const vars = [...variablesDeActivo(sistema, configurada, estado, "S1", TIPO), ...variablesDeActivo(sistema, configurada, estado, SIN_ACTIVO, TIPO)];
    const booleanas = vars.filter((v) => typeof v.valor === "boolean");
    const numericas = vars.filter((v) => typeof v.valor === "number");

    expect(booleanas.length).toBeGreaterThan(0);
    for (const v of booleanas) {
      expect(v.tipo).toBe("booleano");
      expect(v.texto).toBe("activa");
      expect(v.escala).toBeNull();
    }
    for (const v of numericas) expect(v.tipo).toBe("numero");
  });

  it("sin sistema o sin máquina, vacío y sin lanzar", () => {
    expect(variablesDeActivo(null, null, null, "S1", TIPO)).toEqual([]);
  });
});
