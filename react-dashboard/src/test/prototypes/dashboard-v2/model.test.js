/**
 * model.test.js
 * ------------------------------------------------------------------
 * El modelo de la propuesta v2 sobre la FUENTE ÚNICA, en sus dos
 * extremos: servidor caído y datos completos.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────
 *
 * La v2 estuvo un tiempo anclada al mock heredado: con el servidor
 * desconectado seguía enseñando 9 900 piezas y estados inventados
 * mientras «Planta» —a una pestaña de distancia— mostraba huecos. Dos
 * verdades distintas para la misma pregunta. Esta suite fija el
 * requisito que motivó la migración: la v2 cuenta EXACTAMENTE lo que le
 * entrega la fuente activa, huecos incluidos.
 */
import { describe, expect, it } from "vitest";

import { createMachine } from "@/lib/domain/index.js";
import { listMachines } from "@/lib/iconics/tagCatalog.js";
import { machinesDemo } from "../../fixtures/machinesDemo.js";
import { atencion, buildV2Model, paretoRechazos, porArea } from "@/prototypes/dashboard-v2/model.js";

const muertas = () => listMachines().map((m) => createMachine({ ...m, readings: {} }));

describe("v2 · servidor caído", () => {
  it("no inventa ni una cifra: agregados null, pareto vacío, sin atención", () => {
    const m = buildV2Model(muertas());

    expect(m.resumen.oee).toBeNull();
    expect(m.resumen.producidas).toBeNull();
    expect(m.tendencia).toEqual([]);
    expect(m.pareto.total).toBe(0);
    expect(m.pareto.filas).toEqual([]);

    // `unknown` NO enciende la franja de atención: con el servidor caído
    // las 10 máquinas están «sin dato», y una franja roja permanente por
    // falta de conexión taparía las alarmas reales cuando vuelvan.
    expect(m.atencion).toEqual([]);
  });

  it("las áreas reportan sus máquinas con OEE null, no cero", () => {
    const areas = porArea(muertas());

    expect(areas.map((a) => a.areaId)).toEqual(["LIN", "REC"]);
    for (const a of areas) {
      expect(a.oee).toBeNull();
      expect(a.sinDato).toBe(a.totalMaquinas);
      for (const maquina of a.maquinas) expect(maquina.oee).toBeNull();
    }
  });

  it("cada cabecera de área lleva a una ruta que existe", () => {
    // El fallo original en pantalla: «Área 1 ›» navegaba a "area1", ruta
    // retirada, y la app quedaba en blanco.
    expect(porArea(muertas()).map((a) => a.ruta)).toEqual(["area-LIN", "area-REC"]);
  });
});

describe("v2 · con la fuente demo (misma verdad que producción)", () => {
  it("consume las 10 máquinas reales con ids de ICONICS", () => {
    const m = buildV2Model(machinesDemo());
    const ids = m.areas.flatMap((a) => a.maquinas.map((x) => x.id));

    expect(ids).toHaveLength(10);
    expect(ids).toContain("LIN/7");
    expect(ids).toContain("REC/13");
  });

  it("la franja de atención habla el vocabulario del dominio", () => {
    const filas = atencion(machinesDemo());

    // La demo reparte estados a propósito: alarma y commfail existen.
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) {
      expect(["alarma", "commfail"]).toContain(f.estado);
      expect(["critico", "aviso"]).toContain(f.severidad);
    }
  });

  it("el pareto ignora los null pero cuenta los rechazos medidos", () => {
    const conHueco = [
      ...machinesDemo().slice(0, 3),
      createMachine({ id: "REC/13", areaId: "REC", machineId: "13", equipo: "Multi 13", readings: {} }),
    ];
    const p = paretoRechazos(conHueco);

    expect(p.total).toBeGreaterThan(0);
    expect(p.filas.every((f) => Number.isFinite(f.valor) && f.valor > 0)).toBe(true);
  });
});
