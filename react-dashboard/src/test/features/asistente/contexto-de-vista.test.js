/**
 * contexto-de-vista.test.js
 * ------------------------------------------------------------------
 * Plan 24, F7 (`USO-07`): qué pantalla tiene delante quien pregunta.
 *
 * ── LO QUE ESTA SUITE PROTEGE DE VERDAD ────────────────────────────
 *
 * Que no se cuele un VALOR. Las tres restricciones de esta entrega vienen del
 * Plan 23 y no de aquí, y la primera es la que tiene consecuencias si se rompe:
 * una cifra que llegue por este canal es una cifra que el modelo puede citar sin
 * que ninguna herramienta la haya leído — sin calidad, sin frescura y sin poder
 * auditarla (`IA-02`).
 *
 * Hay dos guardas para eso y se prueban las dos: el recorte de este módulo y el
 * `strict()` de `ChatSchema.contexto` en el backend. La de aquí existe para que
 * un descuido no acabe en un 400 silencioso; la del backend, para que este
 * módulo no sea la única defensa.
 */
import { describe, expect, it, beforeEach } from "vitest";

import {
  contextoDeVista,
  declararContextoDeVista,
} from "@/features/asistente/lib/contextoDeVista.js";

/* Cada prueba parte de limpio: es estado de módulo. */
beforeEach(() => declararContextoDeVista({})());

describe("declarar y leer", () => {
  it("sin nada declarado no hay contexto, y eso es un caso normal", () => {
    expect(contextoDeVista()).toBeNull();
  });

  it("lo declarado se lee tal cual", () => {
    declararContextoDeVista({ sistema: "tanque", activo: "bombeo", rango: "ayer" });
    expect(contextoDeVista()).toEqual({ sistema: "tanque", activo: "bombeo", rango: "ayer" });
  });

  it("la función que devuelve lo retira", () => {
    const limpiar = declararContextoDeVista({ sistema: "vibraciones" });
    expect(contextoDeVista()).toEqual({ sistema: "vibraciones" });

    limpiar();
    // Un contexto pegado de una pantalla cerrada es peor que ninguno.
    expect(contextoDeVista()).toBeNull();
  });

  it("limpiar el de una vista YA sustituida no borra el de la nueva", () => {
    /*
     * React puede montar la vista entrante antes de desmontar la saliente, así
     * que la limpieza tiene que ser condicional. Sin esto, navegar de Detalle a
     * Vibraciones dejaría al asistente sin contexto justo después de que la
     * pantalla nueva lo declarara.
     */
    const limpiarVieja = declararContextoDeVista({ sistema: "tanque" });
    declararContextoDeVista({ sistema: "vibraciones" });

    limpiarVieja();

    expect(contextoDeVista()).toEqual({ sistema: "vibraciones" });
  });
});

describe("ningún valor entra, y es la regla que importa", () => {
  it("un campo que no es de los cuatro se descarta en silencio", () => {
    declararContextoDeVista({
      sistema: "tanque",
      // Lo que pasaría si alguien hiciera `declararContextoDeVista({ ...senal })`.
      valor: 62.5,
      banda: "aviso",
      receivedAt: new Date(),
    });

    const ctx = contextoDeVista();
    expect(ctx).toEqual({ sistema: "tanque" });
    expect(ctx.valor).toBeUndefined();
    expect(ctx.banda).toBeUndefined();
  });

  it("una señal entera sólo aporta su CLAVE, nunca su lectura", () => {
    // El caso real: pasar la señal de dominio completa por comodidad.
    declararContextoDeVista({
      senal: "nivelTanque",
      sistema: "tanque",
      valor: 62.5,
      estado: "nominal",
      unidad: "%",
    });

    expect(contextoDeVista()).toEqual({ senal: "nivelTanque", sistema: "tanque" });
  });

  it("un valor no-cadena en un campo válido tampoco entra", () => {
    // `activo: 3` no identifica ningún activo; el backend lo rechazaría.
    declararContextoDeVista({ sistema: "tanque", activo: 3 });
    expect(contextoDeVista()).toEqual({ sistema: "tanque" });
  });

  it("un objeto vacío o sin campos útiles deja el contexto en null, no en `{}`", () => {
    declararContextoDeVista({ valor: 1 });
    // `{}` haría que el asistente mandara `contexto: {}`, que no dice nada y
    // ocupa sitio en el prompt.
    expect(contextoDeVista()).toBeNull();
  });

  it("las cadenas en blanco no cuentan como declaradas", () => {
    declararContextoDeVista({ sistema: "  ", activo: "bombeo" });
    expect(contextoDeVista()).toEqual({ activo: "bombeo" });
  });
});
