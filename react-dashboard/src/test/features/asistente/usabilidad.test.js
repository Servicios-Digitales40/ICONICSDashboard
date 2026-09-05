import { describe, expect, it } from "vitest";
import { idDeMensaje, resumirRespuesta } from "@/features/asistente/lib/usabilidad.js";

describe("mejoras de usabilidad del asistente", () => {
  it("resume una respuesta larga sin dejar marcas de Markdown", () => {
    const texto = `## Diagnóstico\n\nLa presión está fuera de banda. ${"Detalle técnico ".repeat(30)}`;
    const resumen = resumirRespuesta(texto);
    expect(resumen).toMatch(/^Diagnóstico/);
    expect(resumen).not.toContain("##");
    expect(resumen.length).toBeLessThanOrEqual(191);
  });

  it("conserva el id estable que trae un turno nuevo", () => {
    expect(idDeMensaje({ id: "turno-1", rol: "usuario", texto: "hola" }, 4)).toBe("turno-1");
  });
});
