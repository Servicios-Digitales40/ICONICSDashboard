/**
 * La calidad OPC deja de ser un booleano (Plan 21 F3).
 *
 * ── QUÉ SE PROTEGE ─────────────────────────────────────────────────
 *
 * Que cuatro situaciones distintas no lleguen a la pantalla como la misma.
 * `isGoodQuality` seguía siendo la puerta —eso no cambia— pero al cruzarla, un
 * hueco perdía su causa, y las causas se arreglan en sitios distintos:
 *
 *   sensor DESCONECTADO           → se revisa el cableado
 *   módulo que DESCONFÍA          → se revisa la medida
 *   punto que DEJÓ DE ENTREGAR    → se revisa la máquina
 *   calidad que no sabemos leer   → se investiga el código
 *
 * La cuarta es la que más importa que exista por separado: declara que no
 * sabemos en vez de meterla en «mala» y afirmar algo que nadie ha medido.
 */
import { describe, expect, it } from "vitest";

import {
  MOTIVO,
  QUALITY_BAD_UA,
  QUALITY_GOOD,
  QUALITY_GOOD_UA,
  QUALITY_SIN_DATO,
  QUALITY_UNCERTAIN,
  isGoodQuality,
  motivoDeCalidad,
} from "@shared/quality.js";
import { createPollingEngine } from "@/lib/iconics";
import { createSistema } from "@/Demo-EVA/domain/sistema.js";

describe("motivoDeCalidad", () => {
  it("una calidad buena no tiene motivo, en las dos convenciones", () => {
    expect(motivoDeCalidad(QUALITY_GOOD_UA)).toBeNull();
    expect(motivoDeCalidad(QUALITY_GOOD)).toBeNull();
    // La ausencia de calidad se acepta como buena, igual que en `isGoodQuality`:
    // si el servidor no se pronuncia, el dato pasa y ya lo filtra el dominio.
    expect(motivoDeCalidad(undefined)).toBeNull();
    expect(motivoDeCalidad(null)).toBeNull();
  });

  it("los cuatro modos de fallo dan cuatro códigos distintos", () => {
    const codigos = [
      motivoDeCalidad(QUALITY_SIN_DATO).codigo,
      motivoDeCalidad(QUALITY_UNCERTAIN).codigo,
      motivoDeCalidad(QUALITY_BAD_UA).codigo,
      motivoDeCalidad(12345).codigo,
    ];

    expect(codigos).toEqual([
      MOTIVO.SIN_ENTREGA,
      MOTIVO.INCIERTA,
      MOTIVO.MALA,
      MOTIVO.DESCONOCIDA,
    ]);
    expect(new Set(codigos).size).toBe(4);
  });

  it("el que está MEDIDO se reconoce por sí mismo", () => {
    /*
     * `0x08000000` es el que devolvieron quince de veintiún puntos del sistema
     * de vibraciones el 26-08-2026, cuando se paró el variador. No es «mala
     * calidad»: el punto existe y dejó de entregar, que apunta a la máquina y
     * no al cableado.
     */
    const motivo = motivoDeCalidad(QUALITY_SIN_DATO);
    expect(motivo.codigo).toBe(MOTIVO.SIN_ENTREGA);
    expect(motivo.texto).toMatch(/dejado de entregar/i);
  });

  it("cualquier «bad» de OPC-UA cae en `mala`, no sólo el genérico", () => {
    // OPC-UA pone el bit alto en TODOS sus estados bad; comparar por igualdad
    // dejaría fuera cada subestado concreto de fallo.
    expect(motivoDeCalidad(QUALITY_BAD_UA + 0x123).codigo).toBe(MOTIVO.MALA);
  });

  it("una calidad desconocida lleva su código crudo en el texto", () => {
    // Para poder buscarla el día que aparezca en un registro de planta.
    expect(motivoDeCalidad(777).texto).toMatch(/777/);
  });

  it("no cambia quién pasa la puerta: `isGoodQuality` manda igual", () => {
    for (const q of [QUALITY_SIN_DATO, QUALITY_UNCERTAIN, QUALITY_BAD_UA, 777]) {
      expect(isGoodQuality(q)).toBe(false);
      expect(motivoDeCalidad(q)).not.toBeNull();
    }
  });
});

/** Un transporte que sirve una calidad elegida para todos los puntos. */
function conCalidad(quality) {
  return {
    read: async (puntos) =>
      new Map(puntos.map((p) => [p, quality === undefined ? { value: 1 } : { value: 1, quality }])),
  };
}

describe("el motivo llega desde el cable hasta la señal", () => {
  it("el motor de sondeo lo guarda junto al hueco", async () => {
    const motor = createPollingEngine({ read: conCalidad(QUALITY_SIN_DATO).read, intervalMs: 50 });
    const baja = motor.acquire(["ac:X"]);
    motor.start();
    await motor.poll();

    const lectura = motor.get("ac:X");
    expect(lectura.value).toBeNull();
    expect(lectura.motivo.codigo).toBe(MOTIVO.SIN_ENTREGA);

    baja();
    motor.stop();
  });

  it("un punto que NO vino no tiene motivo: es ausencia, no calidad", async () => {
    // No hay calidad que interpretar, y de eso ya habla `stale`. Inventarle un
    // motivo sería afirmar algo del servidor que el servidor no dijo.
    const motor = createPollingEngine({ read: async () => new Map(), intervalMs: 50 });
    const baja = motor.acquire(["ac:AUSENTE"]);
    motor.start();
    await motor.poll();

    expect(motor.get("ac:AUSENTE").motivo).toBeNull();

    baja();
    motor.stop();
  });

  it("una lectura buena no arrastra motivo", async () => {
    const motor = createPollingEngine({ read: conCalidad(QUALITY_GOOD_UA).read, intervalMs: 50 });
    const baja = motor.acquire(["ac:Y"]);
    motor.start();
    await motor.poll();

    expect(motor.get("ac:Y").motivo).toBeNull();

    baja();
    motor.stop();
  });

  it("la señal del tanque conserva el motivo, y sólo cuando falta el valor", () => {
    const sistema = createSistema({
      nivelTanque: { value: null, receivedAt: null, stale: false, motivo: motivoDeCalidad(QUALITY_BAD_UA) },
      temperaturaTanque: { value: 21, receivedAt: new Date(), stale: false, motivo: null },
    });

    const nivel = sistema.lista.find((s) => s.key === "nivelTanque");
    const temperatura = sistema.lista.find((s) => s.key === "temperaturaTanque");

    expect(nivel.valor).toBeNull();
    expect(nivel.motivo.codigo).toBe(MOTIVO.MALA);

    // Con medición, ningún motivo: sería ruido y se leería como advertencia.
    expect(temperatura.valor).toBe(21);
    expect(temperatura.motivo).toBeNull();
  });
});
