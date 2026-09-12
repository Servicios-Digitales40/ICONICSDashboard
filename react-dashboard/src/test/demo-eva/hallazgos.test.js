/**
 * hallazgos.test.js
 * ------------------------------------------------------------------
 * `shared/eva/comun/hallazgos.js`: normaliza riesgos activos y casos
 * similares a una forma común, SIN calcular ni puntuar nada (Plan 25 F6).
 *
 * Lo que más importa aquí no es la normalización en sí —eso es transporte de
 * campos— sino las dos reglas que un normalizador de este tipo puede romper
 * sin darse cuenta: mezclar hallazgos de las dos máquinas bajo el mismo id, e
 * inventar una severidad que el origen no declaró.
 */
import { describe, expect, it } from "vitest";
import { hallazgoDeCaso, hallazgoDeRiesgo, ordenarHallazgos } from "@shared/eva/comun/hallazgos.js";

describe("hallazgoDeRiesgo: transporta, no recalcula", () => {
  const riesgo = { id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "Nivel al 98%" };

  it("conserva la severidad TAL CUAL vino del dominio del riesgo", () => {
    const h = hallazgoDeRiesgo("tanque", riesgo);
    expect(h.severidad).toBe("critico");
  });

  it("el id lleva el SISTEMA delante — un riesgo del tanque y uno de vibraciones con el mismo id de regla no colisionan", () => {
    const enTanque = hallazgoDeRiesgo("tanque", riesgo);
    const enVibraciones = hallazgoDeRiesgo("vibraciones", riesgo);

    expect(enTanque.id).not.toBe(enVibraciones.id);
    expect(enTanque.id).toContain("tanque");
    expect(enVibraciones.id).toContain("vibraciones");
  });

  it("el id lleva el prefijo `riesgo:` — no se puede confundir con el de un caso", () => {
    expect(hallazgoDeRiesgo("tanque", riesgo).id).toMatch(/^riesgo:/);
  });

  it("declara su sistema, para que quien pinte pueda filtrar sin adivinar", () => {
    expect(hallazgoDeRiesgo("vibraciones", riesgo).sistema).toBe("vibraciones");
  });
});

describe("hallazgoDeCaso: no le inventa una severidad al caso", () => {
  const caso = { id: "c1", fecha: "2026-08-01", resuelto: true, resumen: "La válvula no cerró" };

  it("la severidad es null, no una inferida de `resuelto`", () => {
    /*
     * La aserción que de verdad importa: un caso resuelto no es "informativo"
     * ni uno sin resolver es "crítico" por defecto — esa equivalencia no la ha
     * declarado el dominio del caso, y afirmarla aquí sería inventar un dato.
     */
    const h = hallazgoDeCaso("tanque", "derrame", caso);
    expect(h.severidad).toBeNull();
  });

  it("el id lleva el prefijo `caso:` y arrastra el riesgo que respalda", () => {
    const h = hallazgoDeCaso("tanque", "derrame", caso);
    expect(h.id).toMatch(/^caso:/);
    expect(h.referencia.riesgoId).toBe("derrame");
    expect(h.referencia.casoId).toBe("c1");
  });

  it("dos casos del mismo caso pero de sistemas distintos no colisionan", () => {
    const enTanque = hallazgoDeCaso("tanque", "derrame", caso);
    const enVibraciones = hallazgoDeCaso("vibraciones", "derrame", caso);
    expect(enTanque.id).not.toBe(enVibraciones.id);
  });
});

describe("ordenarHallazgos: lo grave primero, sin inventar una comparación", () => {
  const critico = { id: "a", severidad: "critico" };
  const atencion = { id: "b", severidad: "atencion" };
  const informativo = { id: "c", severidad: "informativo" };
  const sinSeveridad = { id: "d", severidad: null };

  it("ordena crítico, atención, informativo", () => {
    const out = ordenarHallazgos([informativo, critico, atencion]);
    expect(out.map((h) => h.id)).toEqual(["a", "b", "c"]);
  });

  it("un hallazgo SIN severidad (un caso) va al final, no en medio por casualidad", () => {
    const out = ordenarHallazgos([sinSeveridad, critico, informativo]);
    expect(out.map((h) => h.id)).toEqual(["a", "c", "d"]);
  });

  it("no muta el array de entrada", () => {
    const entrada = [informativo, critico];
    ordenarHallazgos(entrada);
    expect(entrada[0]).toBe(informativo);
  });
});
