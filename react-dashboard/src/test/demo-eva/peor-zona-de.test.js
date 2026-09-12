/**
 * peor-zona-de.test.js
 * ------------------------------------------------------------------
 * `peorZonaDe()` (Plan 25 F10) — extraída de `InicioVibraciones.jsx` cuando
 * `ContextoDeMaquina.jsx` (F4) resultó tener una copia rota: filtraba
 * `canal.zona && canal.nivel` sobre un objeto que nunca tiene esos campos, así
 * que su indicador de contexto nunca mostraba nada en producción real. Ver la
 * cabecera de `shared/eva/vibraciones/vibraciones.js`.
 *
 * Lo que más importa probar aquí: el PEOR gana, nunca un promedio, y sin norma
 * aplicable no se afirma ningún veredicto — ver §2.4.
 */
import { describe, expect, it } from "vitest";
import { normaAplicableDe, peorZonaDe } from "@shared/eva/vibraciones/vibraciones.js";

describe("peorZonaDe: el peor veredicto, nunca un promedio", () => {
  it("con un solo canal en zona B, esa es la peor", () => {
    const z = peorZonaDe({ S1: { vRMS: 1.0 } }, true);
    expect(z.zona).toBe("B");
  });

  it("entre A, D y B, gana D — la más grave, no la media", () => {
    /*
     * Un promedio entre zona A (como nueva) y zona D (daño) daría un número
     * tranquilizador que no describe a ninguno de los dos canales reales.
     */
    const z = peorZonaDe({ S1: { vRMS: 0.3 }, S2: { vRMS: 5.0 }, S3: { vRMS: 1.2 } }, true);
    expect(z.zona).toBe("D");
  });

  it("todos en zona A: el peor sigue siendo A, no null", () => {
    const z = peorZonaDe({ S1: { vRMS: 0.2 }, S2: { vRMS: 0.3 } }, true);
    expect(z.zona).toBe("A");
  });
});

describe("sin norma aplicable, no se afirma ningún veredicto", () => {
  it("normaAplicable: false devuelve null, aunque los vRMS sean altísimos", () => {
    // §2.4: sin saber si la norma aplica, un veredicto sería inventado.
    const z = peorZonaDe({ S1: { vRMS: 10.0 } }, false);
    expect(z).toBeNull();
  });

  it("normaAplicable: null (no se sabe la velocidad) tampoco afirma nada", () => {
    const z = peorZonaDe({ S1: { vRMS: 10.0 } }, null);
    expect(z).toBeNull();
  });
});

describe("canales sin dato no cuentan como «bien»", () => {
  it("sin ningún canal, devuelve null — no hay nada que evaluar", () => {
    expect(peorZonaDe({}, true)).toBeNull();
  });

  it("un vRMS no numérico (sin dato) para ese canal no cuenta, no es zona A", () => {
    const z = peorZonaDe({ S1: { vRMS: null }, S2: { vRMS: 5.0 } }, true);
    // Sólo S2 se evalúa; su zona D es la que sale, no un "empate" con un A falso.
    expect(z.zona).toBe("D");
  });

  it("con TODOS los canales sin dato, no hay veredicto que dar", () => {
    const z = peorZonaDe({ S1: { vRMS: null }, S2: { vRMS: undefined } }, true);
    expect(z).toBeNull();
  });
});

describe("normaAplicableDe: la MISMA fórmula que usa el motor de reglas, aparte", () => {
  it("con velocidad por encima del mínimo ISO, la norma aplica", () => {
    expect(normaAplicableDe(900)).toBe(true);
  });

  it("exactamente en el mínimo (600 rpm), aplica", () => {
    expect(normaAplicableDe(600)).toBe(true);
  });

  it("por debajo del mínimo, NO aplica — pero es `false`, no `null`", () => {
    // «No aplica» y «no se sabe» son cosas distintas: aquí SÍ se sabe la
    // velocidad, y es baja.
    expect(normaAplicableDe(100)).toBe(false);
  });

  it("sin velocidad (null/undefined), no se sabe si aplica — null, no false", () => {
    /*
     * §2.4: `false` aquí apagaría las reglas de ISO en silencio, como si se
     * hubiera comprobado que no aplican. `null` dice que no se sabe.
     */
    expect(normaAplicableDe(null)).toBeNull();
    expect(normaAplicableDe(undefined)).toBeNull();
  });

  it("un valor no finito (NaN) tampoco afirma nada", () => {
    expect(normaAplicableDe(NaN)).toBeNull();
  });
});
