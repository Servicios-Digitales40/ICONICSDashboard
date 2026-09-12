/**
 * navegacion-del-asistente.test.js — Plan 25 F7 (`NUE-08`, la vuelta).
 *
 * ── QUÉ SE PRUEBA ────────────────────────────────────────────────────
 *
 * `destinoDeHerramienta` es dominio puro: dada una llamada a herramienta (su
 * nombre y sus argumentos), qué ruta le corresponde. Lo que más importa
 * probar es lo que NO se inventa: sin los identificadores completos, no hay
 * destino — nunca un destino "aproximado".
 */
import { describe, expect, it } from "vitest";
import { destinoDeHerramienta } from "@/features/asistente/lib/navegacionDelAsistente.js";

describe("diagnosticar_falla y cerrar_diagnostico van al cierre de diagnóstico", () => {
  it("con sistema y riesgoId completos, da la ruta con sus params", () => {
    const d = destinoDeHerramienta("diagnosticar_falla", { sistema: "tanque", riesgoId: "derrame" });
    expect(d).toEqual({ ruta: "cierre-diagnostico", params: { sistema: "tanque", riesgoId: "derrame" } });
  });

  it("cerrar_diagnostico lleva al MISMO destino que diagnosticar_falla", () => {
    const d = destinoDeHerramienta("cerrar_diagnostico", { sistema: "vibraciones", riesgoId: "desalineacion" });
    expect(d.ruta).toBe("cierre-diagnostico");
    expect(d.params).toEqual({ sistema: "vibraciones", riesgoId: "desalineacion" });
  });

  it("sin riesgoId no hay destino — no se navega a medias", () => {
    expect(destinoDeHerramienta("diagnosticar_falla", { sistema: "tanque" })).toBeNull();
  });

  it("sin sistema tampoco", () => {
    expect(destinoDeHerramienta("diagnosticar_falla", { riesgoId: "derrame" })).toBeNull();
  });
});

describe("riesgos_activos va a la vista de riesgos DE ESE SISTEMA, sin riesgoId", () => {
  it("tanque va a eva-riesgos", () => {
    expect(destinoDeHerramienta("riesgos_activos", { sistema: "tanque" })).toEqual({ ruta: "eva-riesgos" });
  });

  it("vibraciones va a eva-riesgos-vibracion — las dos máquinas NO comparten destino", () => {
    expect(destinoDeHerramienta("riesgos_activos", { sistema: "vibraciones" })).toEqual({
      ruta: "eva-riesgos-vibracion",
    });
  });

  it("nunca lleva `params.riesgoId`: esa llamada no lo trae, y fingir uno sería inventarlo", () => {
    /*
     * La limitación real que la cabecera del módulo documenta: CUÁL riesgo
     * mencionó el modelo después vive en el RESULTADO de la herramienta, que
     * no viaja por este canal. Aquí sólo hay `sistema`.
     */
    const d = destinoDeHerramienta("riesgos_activos", { sistema: "tanque" });
    expect(d.params).toBeUndefined();
  });

  it("sin sistema no hay destino", () => {
    expect(destinoDeHerramienta("riesgos_activos", {})).toBeNull();
  });
});

describe("estado_del_sistema va al Inicio de esa máquina", () => {
  it("tanque va a eva-inicio", () => {
    expect(destinoDeHerramienta("estado_del_sistema", { sistema: "tanque" })).toEqual({ ruta: "eva-inicio" });
  });

  it("vibraciones va a vib-inicio, NO a eva-inicio", () => {
    // Las dos máquinas no pueden compartir Inicio: mezclaría instalaciones.
    expect(destinoDeHerramienta("estado_del_sistema", { sistema: "vibraciones" })).toEqual({ ruta: "vib-inicio" });
  });
});

describe("controlar_bomba tiene destino fijo: no lleva `sistema`", () => {
  it("siempre va a eva-controles, sin importar `encender`", () => {
    expect(destinoDeHerramienta("controlar_bomba", { encender: true })).toEqual({ ruta: "eva-controles" });
    expect(destinoDeHerramienta("controlar_bomba", { encender: false })).toEqual({ ruta: "eva-controles" });
  });
});

describe("una herramienta sin destino registrado no revienta", () => {
  it("una herramienta desconocida devuelve null, no lanza", () => {
    expect(() => destinoDeHerramienta("analisis_de_senal", { senal: "nivel" })).not.toThrow();
    expect(destinoDeHerramienta("analisis_de_senal", { senal: "nivel" })).toBeNull();
  });

  it("un nombre vacío o inventado también devuelve null", () => {
    expect(destinoDeHerramienta("", {})).toBeNull();
    expect(destinoDeHerramienta("esto_no_existe", { sistema: "tanque" })).toBeNull();
  });

  it("sin argumentos (undefined) no revienta", () => {
    expect(() => destinoDeHerramienta("diagnosticar_falla", undefined)).not.toThrow();
    expect(destinoDeHerramienta("diagnosticar_falla", undefined)).toBeNull();
  });
});

describe("un argumento con el tipo equivocado no se acepta como identificador", () => {
  it("un `sistema` que no es string se trata como ausente", () => {
    // Un modelo que alucinara `sistema: 123` no debe producir una ruta con un
    // valor no-string metido en los params.
    expect(destinoDeHerramienta("estado_del_sistema", { sistema: 123 })).toBeNull();
  });
});
