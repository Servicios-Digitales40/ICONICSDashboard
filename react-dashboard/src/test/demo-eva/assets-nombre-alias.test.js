/**
 * Nombre y alias por asset (Plan 42.5 F6, D15): el usuario rotula un apoyo
 * («Lado acople») y le da sinónimos («acople chiquito»), y eso llega al
 * apoyo de las vistas, a los alias de TODAS sus variables —que es lo que el
 * asistente resuelve— y sobrevive al viaje por el editor. Dominio puro.
 */
import { describe, expect, it } from "vitest";

import { construirSistema } from "@shared/eva/comun/construirSistema.js";
import { aliasLimpios, crearAsset, crearMaquina } from "@shared/eva/comun/configuracionMaquina.js";
import { configuracionDesdeMarcas, detallesDeAssets } from "@shared/eva/comun/configurarDesdeArbol.js";
import { canalesDeMaquina } from "@shared/eva/comun/vistaDeMaquina.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { configuracionEspejo } from "../../../../scripts/lib/configuracionEspejo.mjs";

const TIPO = tipoDe("vibraciones");

describe("crearAsset y aliasLimpios", () => {
  it("un asset lleva `alias` limpio: sin vacíos, sin repetidos, sin espacios; por defecto ninguno", () => {
    expect(crearAsset({ id: "S1", pointName: "ac:x/S1/" })).toEqual({ id: "S1", pointName: "ac:x/S1/", rol: "secundario", nombre: null, alias: [] });
    expect(crearAsset({ id: "S1", pointName: "ac:x/S1/", nombre: "Lado acople", alias: [" acople chiquito ", "", "acople chiquito", "lado del motor"] }).alias)
      .toEqual(["acople chiquito", "lado del motor"]);
  });

  it("aliasLimpios acepta lista o texto separado por comas o líneas", () => {
    expect(aliasLimpios("acople chiquito, lado del motor\n\n motor ")).toEqual(["acople chiquito", "lado del motor", "motor"]);
    expect(aliasLimpios(null)).toEqual([]);
    expect(aliasLimpios(["a", null, "a"])).toEqual(["a"]);
  });

  it("crearMaquina conserva nombre y alias de cada asset", () => {
    const m = crearMaquina({
      id: "m", nombre: "M", tipo: "vibraciones",
      assets: [{ id: "S1", pointName: "ac:x/S1/", nombre: "Lado acople", alias: ["acople chiquito"] }],
      variables: [],
    });
    expect(m.assets[0]).toMatchObject({ nombre: "Lado acople", alias: ["acople chiquito"] });
  });
});

describe("el tipo sugiere, no aplica", () => {
  it("cada apoyo del tipo trae una `sugerencia` de nombre, y `canalesDeMaquina` no la usa sola", () => {
    expect(TIPO.canales.map((c) => c.sugerencia)).toEqual(["Lado acople", "Rodamiento intermedio", "Lado libre"]);
    const sinNombres = { assets: [{ id: "S1", nombre: null }], variables: [{ id: "v", pointName: "p", assetId: "S1" }] };
    expect(canalesDeMaquina(sinNombres, TIPO)[0].label).toBe("S1");
  });
});

describe("el alias del asset llega al apoyo y a todas sus variables", () => {
  it("`canalesDeMaquina` expone `alias`, y `aliasDe(clave)` compone «DKW acople chiquito»", () => {
    const { configurada } = configuracionEspejo({ verificadasDelCatalogo: true });
    const conAlias = {
      ...configurada,
      assets: configurada.assets.map((a) => (a.id === "S1" ? { ...a, alias: ["acople chiquito"] } : a)),
    };
    const apoyos = canalesDeMaquina(conAlias, TIPO);
    expect(apoyos.find((c) => c.id === "S1")).toMatchObject({ label: "Lado acople", alias: ["acople chiquito"] });
    expect(apoyos.find((c) => c.id === "S2").alias).toEqual([]);

    const sistema = construirSistema(conAlias, TIPO);
    const deS1 = conAlias.variables.filter((v) => v.assetId === "S1" && v.rol);
    expect(deS1.length).toBeGreaterThan(0);
    for (const v of deS1) {
      const alias = sistema.aliasDe(v.id).map((a) => a.toLowerCase());
      expect(alias.some((a) => a.endsWith(" acople chiquito")), v.id).toBe(true);
    }
    expect(sistema.aliasDe("DKW_S1")).toContain("DKW acople chiquito");
    /* Y las de otro apoyo no lo heredan. */
    expect(sistema.aliasDe("DKW_S2").some((a) => /acople chiquito/i.test(a))).toBe(false);
  });
});

describe("el editor conserva nombre y alias al editar", () => {
  it("`detallesDeAssets` siembra lo guardado y `configuracionDesdeMarcas` lo vuelve a poner en cada asset", () => {
    const guardada = {
      assets: [
        { id: "Vibraciones", pointName: "ac:R/", rol: "raiz", nombre: null, alias: [] },
        { id: "S1", pointName: "ac:R/S1/", rol: "secundario", nombre: "Lado acople", alias: ["acople chiquito", "lado del motor"] },
      ],
    };
    const detalles = detallesDeAssets(guardada);
    expect(detalles).toEqual({ S1: { nombre: "Lado acople", alias: "acople chiquito, lado del motor" } });

    const payload = configuracionDesdeMarcas({
      formulario: { id: "m", nombre: "M", tipo: "vibraciones", limitaciones: "" },
      arboles: { enVivo: "ac:R/", historico: null, alarmas: null },
      variables: [{ id: "vRMS_S1", pointName: "ac:R/S1/vRMS_S1", assetId: "S1", rol: "medida:vRMS" }],
      detallesDeAsset: { ...detalles, S1: { ...detalles.S1, alias: "acople chiquito, lado del motor, " } },
    });
    expect(payload.assets.find((a) => a.id === "S1")).toEqual({
      id: "S1", pointName: "ac:R/S1/", rol: "secundario", nombre: "Lado acople", alias: ["acople chiquito", "lado del motor"],
    });
    /* Sin detalle, el asset va como antes: sin campos que no se pidieron. */
    expect(payload.assets[0]).toMatchObject({ pointName: "ac:R/", rol: "raiz" });
    expect(payload.assets[0]).not.toHaveProperty("nombre");
    expect(payload.assets[0]).not.toHaveProperty("alias");
  });
});
