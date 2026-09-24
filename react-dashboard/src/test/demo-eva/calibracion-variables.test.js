/**
 * Calibración por variable (Plan 44 §6.1): quien configura anota cuándo se
 * calibró un sensor y cuándo toca; ICONICS no lo sabe. Dominio puro: la
 * forma limpia, el viaje por el editor, y cómo la lee el registro.
 */
import { describe, expect, it } from "vitest";

import { construirSistema } from "@shared/eva/comun/construirSistema.js";
import { calibracionLimpia, crearMaquina, crearVariable } from "@shared/eva/comun/configuracionMaquina.js";
import { calibracionesDeVariables, configuracionDesdeMarcas } from "@shared/eva/comun/configurarDesdeArbol.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { configuracionEspejo } from "../../../../scripts/lib/configuracionEspejo.mjs";

describe("calibracionLimpia y crearVariable", () => {
  it("dos fechas AAAA-MM-DD; una que no lo sea se descarta; sin ninguna, null y no {}", () => {
    expect(calibracionLimpia({ ultima: "2026-09-01", proxima: " 2027-03-01 " })).toEqual({ ultima: "2026-09-01", proxima: "2027-03-01" });
    expect(calibracionLimpia({ ultima: "01/09/2026", proxima: "2027-03-01" })).toEqual({ ultima: null, proxima: "2027-03-01" });
    expect(calibracionLimpia({ ultima: "hoy" })).toBeNull();
    expect(calibracionLimpia({})).toBeNull();
    expect(calibracionLimpia(null)).toBeNull();
    expect(calibracionLimpia("2026-09-01")).toBeNull();
  });

  it("una variable nace sin calibración (null) y la conserva limpia cuando la trae", () => {
    expect(crearVariable({ id: "a", pointName: "ac:x/a" }).calibracion).toBeNull();
    expect(crearVariable({ id: "a", pointName: "ac:x/a", calibracion: { ultima: "2026-09-01" } }).calibracion).toEqual({ ultima: "2026-09-01", proxima: null });
    /* Y por crearMaquina, que pasa toda variable por crearVariable. */
    const m = crearMaquina({ id: "m", nombre: "M", tipo: "vibraciones", arboles: { enVivo: "ac:x/" }, assets: [], variables: [{ id: "a", pointName: "ac:x/a", calibracion: { proxima: "2027-01-15" } }] });
    expect(m.variables[0].calibracion).toEqual({ ultima: null, proxima: "2027-01-15" });
  });
});

describe("el viaje por el editor", () => {
  const { configurada } = configuracionEspejo();

  it("calibracionesDeVariables siembra sólo las que tienen alguna fecha, en la forma del formulario", () => {
    const con = { ...configurada, variables: configurada.variables.map((v, i) => (i === 0 ? { ...v, calibracion: { ultima: "2026-08-20", proxima: null } } : v)) };
    expect(calibracionesDeVariables(con)).toEqual({ [configurada.variables[0].id]: { ultima: "2026-08-20", proxima: "" } });
    expect(calibracionesDeVariables(configurada)).toEqual({});
    expect(calibracionesDeVariables(null)).toEqual({});
  });

  it("configuracionDesdeMarcas pone la calibración en SU variable y no en las demás; vacía no viaja", () => {
    const variables = [
      { id: "vRMS_S1", pointName: "ac:TDCON/DEMO_VIBRACIONES/Vibraciones/S1/vRMS_S1", assetId: "S1", rol: "medida:vRMS" },
      { id: "aRMS_S1", pointName: "ac:TDCON/DEMO_VIBRACIONES/Vibraciones/S1/aRMS_S1", assetId: "S1", rol: "medida:aRMS" },
    ];
    const payload = configuracionDesdeMarcas({
      formulario: { id: "m", nombre: "M", tipo: "vibraciones" },
      arboles: { enVivo: "ac:TDCON/DEMO_VIBRACIONES/Vibraciones/" },
      variables,
      calibraciones: { vRMS_S1: { ultima: "2026-09-01", proxima: "" }, aRMS_S1: { ultima: "", proxima: "" } },
    });
    expect(payload.variables.find((v) => v.id === "vRMS_S1").calibracion).toEqual({ ultima: "2026-09-01", proxima: null });
    expect(payload.variables.find((v) => v.id === "aRMS_S1")).not.toHaveProperty("calibracion");
  });
});

describe("el registro la expone", () => {
  it("variableDe(clave) devuelve la variable configurada, congelada, con su calibración y cómo quedó verificada; null si no existe", () => {
    const { configurada } = configuracionEspejo({ verificadasDelCatalogo: true });
    const primera = configurada.variables[0];
    const con = { ...configurada, variables: configurada.variables.map((v, i) => (i === 0 ? { ...v, calibracion: { ultima: "2026-09-01", proxima: "2027-03-01" } } : v)) };
    const entrada = construirSistema(con, tipoDe("vibraciones"));
    const v = entrada.variableDe(primera.id);
    expect(v).toMatchObject({ id: primera.id, pointName: primera.pointName, calibracion: { ultima: "2026-09-01", proxima: "2027-03-01" } });
    expect(Object.isFrozen(v)).toBe(true);
    expect(entrada.variableDe("no-existe")).toBeNull();
  });
});
