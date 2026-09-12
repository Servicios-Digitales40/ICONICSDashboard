/**
 * procedencia.test.js
 * ------------------------------------------------------------------
 * Plan 24, F1 (`USO-03`): `shared/eva/comun/procedencia.js`, el módulo que
 * contesta «¿de dónde salió este número?» recogiendo lo que ya sabían cinco
 * sitios distintos.
 *
 * Lo que se prueba aquí es que RECOGE y no CALCULA — que es toda la diferencia
 * entre un panel de procedencia y una segunda opinión sobre el dato. Por eso
 * casi todas las aserciones comparan contra el valor que el registro ya declara
 * (`SISTEMA.tanque.plc`, `series.ruta`) en vez de contra una constante escrita
 * a mano: si alguien cambia la cadencia de una máquina en `sistemas.js`, esta
 * suite tiene que seguir en verde, porque el panel tiene que seguir diciendo la
 * verdad. Una prueba con `"PLC_1 · ua:DEMO2"` escrito literal comprobaría que
 * nadie toca el registro, que no es lo que importa.
 *
 * Es dominio puro: sin React, sin DOM, sin red (`CLAUDE.md` §2.7).
 */
import { describe, expect, it } from "vitest";

import { procedenciaDe, EXPLICACION_MOTIVO } from "@shared/eva/comun/procedencia.js";
import { SISTEMA } from "@shared/eva/comun/sistemas.js";
import { MOTIVO } from "@shared/quality.js";
import { createSenal } from "@shared/eva/tanque/sistema.js";
import { pointName } from "@shared/eva/tanque/senales.js";

const AHORA = new Date("2026-09-11T12:00:00Z");

const senalViva = () =>
  createSenal({ key: "nivelTanque", valor: 62.5, receivedAt: AHORA });

describe("procedenciaDe: recoge la cadena entera, sin inventar ningún tramo", () => {
  it("el punto que devuelve es el tag real de ICONICS, entero", () => {
    const punto = pointName("nivelTanque");
    const p = procedenciaDe({ senal: senalViva(), punto });

    // Entero y sin acortar: es el dato con el que alguien puede ir al servidor
    // a mirar el punto por su cuenta.
    expect(p.punto).toBe(punto);
    expect(p.punto).toMatch(/^ac:/);
  });

  it("la máquina sale del registro, no de una tabla paralela", () => {
    const p = procedenciaDe({ senal: senalViva(), punto: pointName("nivelTanque") });

    expect(p.sistema.id).toBe("tanque");
    expect(p.sistema.plc).toBe(SISTEMA.tanque.plc);
    expect(p.sistema.cadenciaMs).toBe(SISTEMA.tanque.cadenciaMs);
  });

  it("la mecánica del historiador también, y es distinta en cada máquina", () => {
    const p = procedenciaDe({ senal: senalViva(), punto: pointName("nivelTanque") });

    expect(p.serie.ruta).toBe(SISTEMA.tanque.series.ruta);
    expect(p.serie.agregado).toBe(SISTEMA.tanque.series.agregado);

    // Que sean distintas es el motivo de que esto salga del registro y no de
    // una constante: `ac:` vs `hda:`, y dos rutas que no se parecen.
    expect(SISTEMA.vibraciones.series.ruta).not.toBe(SISTEMA.tanque.series.ruta);
  });
});

describe("la otra máquina contesta igual, sin que el módulo sepa de ninguna", () => {
  it("un punto de vibraciones trae SU plc, SU cadencia y SU ruta", () => {
    const punto = SISTEMA.vibraciones.puntos()[0];
    const p = procedenciaDe({ senal: { key: "x", valor: 1, historizado: true }, punto });

    expect(p.sistema.id).toBe("vibraciones");
    expect(p.sistema.plc).toBe(SISTEMA.vibraciones.plc);
    expect(p.sistema.cadenciaMs).toBe(SISTEMA.vibraciones.cadenciaMs);
    expect(p.serie.ruta).toBe(SISTEMA.vibraciones.series.ruta);
  });

  it("los dos PLC son distintos, que es justo lo que un panel no puede confundir", () => {
    const delTanque = procedenciaDe({ senal: senalViva(), punto: pointName("nivelTanque") });
    const deVibra = procedenciaDe({
      senal: { key: "x", valor: 1 }, punto: SISTEMA.vibraciones.puntos()[0],
    });

    expect(delTanque.sistema.plc).not.toBe(deVibra.sistema.plc);
  });
});

describe("la ausencia de dato no se disfraza (CLAUDE.md §2.4)", () => {
  it("sin `punto` no se adivina la máquina: sale null, no la primera que encaje", () => {
    // Dos catálogos pueden llamar igual a dos señales distintas — es el cruce
    // que el Plan 23 corrigió en `98fe465`. Sin el tag no hay identidad, y
    // deducirla de la clave sería reintroducirlo.
    const p = procedenciaDe({ senal: senalViva() });

    expect(p.sistema).toBeNull();
    expect(p.serie.ruta).toBeNull();
  });

  it("un punto que no es de nadie tampoco inventa máquina", () => {
    const p = procedenciaDe({ senal: senalViva(), punto: "ac:OTRA/PLANTA/COSA" });
    expect(p.sistema).toBeNull();
  });

  it("cada código de motivo viaja con su explicación, y son los de quality.js", () => {
    for (const codigo of Object.values(MOTIVO)) {
      const p = procedenciaDe({ senal: { key: "x", valor: null, motivo: codigo } });

      expect(p.lectura.motivo).toBe(codigo);
      expect(p.lectura.explicacion).toBe(EXPLICACION_MOTIVO[codigo]);
      expect(p.lectura.explicacion).toBeTruthy();
    }
  });

  it("sin lectura, `hayValor` es false y no hay receivedAt que fingir", () => {
    const p = procedenciaDe({ senal: { key: "x", valor: null, motivo: MOTIVO.SIN_ENTREGA } });

    expect(p.lectura.hayValor).toBe(false);
    expect(p.lectura.receivedAt).toBeNull();
  });

  it("una lectura buena no arrastra motivo: sería ruido leído como advertencia", () => {
    const p = procedenciaDe({ senal: senalViva(), punto: pointName("nivelTanque") });

    expect(p.lectura.hayValor).toBe(true);
    expect(p.lectura.motivo).toBeNull();
    expect(p.lectura.explicacion).toBeNull();
  });
});

describe("cobertura: viajan las CUENTAS, no el texto ya redactado", () => {
  it("incompleta: se dice cuántos tramos de cuántos, sin frase en español", () => {
    const p = procedenciaDe({
      senal: senalViva(), cobertura: { tramosConDato: 40, tramosPosibles: 48 },
    });

    expect(p.cobertura).toEqual({ tramosConDato: 40, tramosPosibles: 48, completa: false });
    // El texto lo pone quien pinta, en el idioma que toque. `historia.js`
    // redacta el suyo en español porque nació para el asistente.
    expect(JSON.stringify(p.cobertura)).not.toMatch(/promedio|tramos del período/);
  });

  it("completa cuando no falta ningún tramo", () => {
    const p = procedenciaDe({
      senal: senalViva(), cobertura: { tramosConDato: 48, tramosPosibles: 48 },
    });
    expect(p.cobertura.completa).toBe(true);
  });

  it("sin cobertura, o con una inservible, es null y no un 0/0 que parece un hueco", () => {
    expect(procedenciaDe({ senal: senalViva() }).cobertura).toBeNull();
    expect(procedenciaDe({ senal: senalViva(), cobertura: {} }).cobertura).toBeNull();
    expect(
      procedenciaDe({ senal: senalViva(), cobertura: { tramosConDato: 3, tramosPosibles: 0 } }).cobertura
    ).toBeNull();
  });
});

describe("la firma admite un punto y sólo uno", () => {
  it("sin señal no hay procedencia que dar", () => {
    expect(procedenciaDe({ senal: null })).toBeNull();
    expect(procedenciaDe()).toBeNull();
  });
});
