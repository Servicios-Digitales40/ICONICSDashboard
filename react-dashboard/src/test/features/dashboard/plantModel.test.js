/**
 * plantModel.test.js
 * ------------------------------------------------------------------
 * Comportamiento del rollup ANTE HUECOS.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Esta prueba nació de un fallo real en pantalla: `plantTrend` pasaba
 * las máquinas al generador de historia, que hace `valor.toFixed(1)`, y
 * reventaba en cuanto un factor llegaba como `null`. La aplicación no
 * cargaba.
 *
 * Lo revelador es POR QUÉ no se detectó antes. Existía el transporte
 * falso adversarial, existía el saneamiento del dominio y existía la
 * referencia numérica congelada — pero las tres pruebas que había
 * ejercitaban `plantModel` únicamente con datos COMPLETOS: la
 * referencia usa el mock, y el mock nunca tiene huecos. El caos vivía en
 * la capa de transporte y nunca llegaba al rollup.
 *
 * Es exactamente el riesgo R-04 del Plan 1 («UI construida sobre datos
 * demasiado limpios») manifestándose una capa más arriba de donde se
 * había mitigado. De ahí que estas pruebas construyan las máquinas a
 * mano con huecos deliberados en vez de partir del mock.
 */
import { describe, expect, it } from "vitest";
import { createMachine } from "@/lib/domain/index.js";
import {
  buildPlantSummary,
  plantTrend,
  productionByMachine,
  productionTrend,
  summaryByArea,
} from "@/features/dashboard/lib/plantModel.js";

const maquina = (id, areaId, readings) =>
  createMachine({ id, areaId, machineId: id.split("/")[1], equipo: id, readings });

/** Una máquina medida y otra completamente a oscuras. */
const mixtas = () => [
  maquina("LIN/1", "LIN", {
    disponibilidad: 80, rendimiento: 90, calidad: 95,
    aprobadas: 900, rechazadas: 100, estado: 1,
  }),
  maquina("LIN/2", "LIN", {}), // sin ninguna lectura
];

describe("plantTrend · tolerancia a huecos", () => {
  it("no revienta cuando una máquina no tiene factores", () => {
    expect(() => plantTrend(mixtas())).not.toThrow();
  });

  it("excluye del promedio a las máquinas sin medición", () => {
    const soloUna = plantTrend([mixtas()[0]]);
    const conHueco = plantTrend(mixtas());

    // La máquina a oscuras no aporta nada: la serie es la misma que si
    // no existiera. Si entrara como ceros, hundiría la media a la mitad.
    expect(conHueco).toEqual(soloUna);
  });

  it("devuelve serie vacía si NINGUNA máquina tiene datos", () => {
    const aOscuras = [maquina("LIN/1", "LIN", {}), maquina("REC/10", "REC", {})];

    expect(plantTrend(aOscuras)).toEqual([]);
    expect(productionTrend(aOscuras)).toEqual([]);
  });

  it("aguanta un factor parcial: tiene disponibilidad pero no calidad", () => {
    const parcial = [maquina("LIN/1", "LIN", { disponibilidad: 80, rendimiento: 90 })];

    // Sin los tres factores no se puede componer un punto de tendencia.
    expect(() => plantTrend(parcial)).not.toThrow();
    expect(plantTrend(parcial)).toEqual([]);
  });
});

describe("buildPlantSummary · tolerancia a huecos", () => {
  it("promedia solo sobre las mediciones existentes", () => {
    const s = buildPlantSummary(mixtas());

    // 80, no 40: el hueco se descarta, no se cuenta como cero.
    expect(s.disponibilidad).toBe(80);
    expect(s.rendimiento).toBe(90);
    expect(s.calidad).toBe(95);
  });

  it("cuenta las máquinas totales aunque no todas midan", () => {
    const s = buildPlantSummary(mixtas());

    expect(s.totalMaquinas).toBe(2);
    expect(s.operando).toBe(1);
  });

  it("con todas las máquinas a oscuras los agregados son NULL, no 0", () => {
    // El caso «servidor caído». Un 0 aquí subía hasta la banda de KPIs y
    // se leía como una planta parada que no produjo nada en el turno; un
    // null baja hasta lib/format y se pinta como «—».
    const s = buildPlantSummary([maquina("LIN/1", "LIN", {}), maquina("REC/10", "REC", {})]);

    for (const clave of ["disponibilidad", "rendimiento", "calidad", "oee", "fty", "producidas", "aceptadas", "rechazadas", "paroNoPlanificado"]) {
      expect(s[clave], clave).toBeNull();
    }

    // Lo que sí se sabe, se dice: cuántas máquinas hay y que ninguna habló.
    expect(s.totalMaquinas).toBe(2);
    expect(s.operando).toBe(0);
    expect(s.sinDato).toBe(2);
    expect(s.porEstado).toEqual([{ estado: "unknown", label: "Sin dato", valor: 2 }]);
  });

  it("un Infinity del servidor no contamina el resumen", () => {
    // Lo que devuelve ICONICS con Prod_Real_Total = 0.
    const roto = [
      maquina("LIN/1", "LIN", { disponibilidad: 80, rendimiento: 90, calidad: Infinity }),
      maquina("LIN/2", "LIN", { disponibilidad: 70, rendimiento: 85, calidad: 90 }),
    ];
    const s = buildPlantSummary(roto);

    // La calidad de la primera se descarta: queda la de la segunda, no NaN.
    expect(s.calidad).toBe(90);
    expect(Number.isFinite(s.oee)).toBe(true);
  });
});

describe("otras derivaciones · tolerancia a huecos", () => {
  it("productionByMachine no revienta sin conteos", () => {
    const reparto = productionByMachine(mixtas());

    expect(reparto).toHaveLength(2);
    expect(reparto.every((p) => Number.isFinite(p.valor))).toBe(true);
  });

  it("summaryByArea funciona con un área entera sin datos", () => {
    const areas = summaryByArea(mixtas());

    expect(areas.map((a) => a.areaId)).toEqual(["LIN", "REC"]);
    // REC no tiene ninguna máquina en esta muestra: su OEE es un hueco,
    // no un cero — la tira de áreas lo pinta como «—».
    const rec = areas.find((a) => a.areaId === "REC");
    expect(rec.totalMaquinas).toBe(0);
    expect(rec.oee).toBeNull();
  });
});
