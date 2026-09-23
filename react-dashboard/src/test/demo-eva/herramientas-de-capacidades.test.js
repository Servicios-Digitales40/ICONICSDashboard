/**
 * `herramientasDeCapacidades` (Plan 42.5 F6, D18): qué herramientas del
 * asistente puede llamar una máquina según sus capacidades. Es la regla que
 * vivía dentro de `construirSistema` y que la pantalla de configuración enseña
 * ahora; aquí se afirma que el registro y la pantalla dicen lo mismo.
 */
import { describe, expect, it } from "vitest";

import { construirSistema } from "@shared/eva/comun/construirSistema.js";
import { capacidadesDe, herramientasDeCapacidades } from "@shared/eva/comun/configuracionMaquina.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { configuracionEspejo } from "../../../../scripts/lib/configuracionEspejo.mjs";

const TIPO = tipoDe("vibraciones");

describe("herramientasDeCapacidades", () => {
  it("siempre el estado; riesgos con DIAGNOSTICS; historia sólo con HISTORICAL_DATA", () => {
    expect(herramientasDeCapacidades([])).toEqual(["estado_del_sistema"]);
    expect(herramientasDeCapacidades(["CURRENT_DATA"])).toEqual(["estado_del_sistema"]);
    expect(herramientasDeCapacidades(["CURRENT_DATA", "DIAGNOSTICS"])).toEqual(["estado_del_sistema", "riesgos_activos"]);
    expect(herramientasDeCapacidades(["CURRENT_DATA", "DIAGNOSTICS", "HISTORICAL_DATA"])).toEqual([
      "estado_del_sistema", "riesgos_activos", "historia_de_senal",
    ]);
    expect(herramientasDeCapacidades(undefined)).toEqual(["estado_del_sistema"]);
  });

  it("el registro de una configurada ofrece EXACTAMENTE esa lista, con y sin series verificadas", () => {
    for (const verificadas of [true, false]) {
      const { configurada } = configuracionEspejo({ verificadasDelCatalogo: verificadas });
      const sistema = construirSistema(configurada, TIPO);
      expect(sistema.herramientas).toEqual(herramientasDeCapacidades(capacidadesDe(configurada, TIPO)));
      expect(sistema.herramientas.includes("historia_de_senal")).toBe(verificadas);
    }
  });
});
