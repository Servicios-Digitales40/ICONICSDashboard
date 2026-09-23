/**
 * `filtroEnUrl.js` (Plan 42.5 F6, D16): el filtro de series ida y vuelta por
 * la URL, con el activo por defecto de cada vista.
 */
import { describe, expect, it } from "vitest";

import { TODA_LA_MAQUINA, leerFiltroDeUrl, parametrosDeFiltro } from "@/Demo-EVA/data/comunes/filtroEnUrl.js";

describe("leerFiltroDeUrl", () => {
  it("sin nada en la URL: el activo por defecto y «sólo medidas» encendido", () => {
    expect(leerFiltroDeUrl({})).toEqual({ activo: null, soloMedidas: true });
    expect(leerFiltroDeUrl(undefined)).toEqual({ activo: null, soloMedidas: true });
    expect(leerFiltroDeUrl({}, { activoPorDefecto: "S2" })).toEqual({ activo: "S2", soloMedidas: true });
  });

  it("`filtro=todas` pide toda la máquina aunque la vista tenga activo por defecto", () => {
    expect(leerFiltroDeUrl({ filtro: TODA_LA_MAQUINA }, { activoPorDefecto: "S2" })).toEqual({ activo: null, soloMedidas: true });
  });

  it("`filtro=<id>` es ese activo, y `series=todas` apaga «sólo medidas»", () => {
    expect(leerFiltroDeUrl({ filtro: " S1 ", series: "todas" })).toEqual({ activo: "S1", soloMedidas: false });
  });

  it("un `series` desconocido deja el interruptor encendido: degrada al arranque", () => {
    expect(leerFiltroDeUrl({ series: "algunas" }).soloMedidas).toBe(true);
  });
});

describe("parametrosDeFiltro", () => {
  it("el estado por defecto no viaja: URL limpia", () => {
    expect(parametrosDeFiltro({ activo: null, soloMedidas: true })).toEqual({});
    expect(parametrosDeFiltro({ activo: "S2", soloMedidas: true }, { activoPorDefecto: "S2" })).toEqual({});
  });

  it("toda la máquina sólo se escribe cuando la vista tiene activo por defecto", () => {
    expect(parametrosDeFiltro({ activo: null, soloMedidas: true }, { activoPorDefecto: "S2" })).toEqual({ filtro: TODA_LA_MAQUINA });
  });

  it("otro activo y el interruptor apagado viajan", () => {
    expect(parametrosDeFiltro({ activo: "S3", soloMedidas: false }, { activoPorDefecto: "S2" })).toEqual({ filtro: "S3", series: TODA_LA_MAQUINA });
  });

  it("ida y vuelta: lo que se escribe se lee igual", () => {
    for (const filtro of [
      { activo: null, soloMedidas: true }, { activo: null, soloMedidas: false },
      { activo: "S1", soloMedidas: true }, { activo: "S3", soloMedidas: false },
    ]) {
      for (const activoPorDefecto of [null, "S1", "S2"]) {
        const params = parametrosDeFiltro(filtro, { activoPorDefecto });
        expect(leerFiltroDeUrl(params, { activoPorDefecto })).toEqual(filtro);
      }
    }
  });
});
