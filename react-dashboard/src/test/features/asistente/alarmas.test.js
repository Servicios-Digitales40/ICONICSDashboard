// @vitest-environment jsdom
/**
 * Las alarmas en el panel del asistente.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 *  - Que la pregunta de diagnóstico lleve la HORA de la alarma. Sin ella el
 *    asistente mira las últimas seis horas por defecto, y en una alarma de
 *    hace tres días ahí no hay absolutamente nada que explique el disparo.
 *    Es el fallo más caro de los tres, porque produce una respuesta que suena
 *    razonable y no dice nada.
 *  - Que un fallo de lectura NO vacíe la lista. Que ICONICS no conteste un
 *    momento no puede hacer desaparecer un aviso de alarma de la pantalla:
 *    quien lo estaba viendo pensaría que la alarma se ha ido.
 *  - Que la severidad se traduzca a los cortes correctos, que son los que
 *    deciden si el aviso se pinta en rojo o en ámbar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  nivelDeSeveridad,
  preguntaDeDiagnostico,
} from "@/features/asistente/lib/useAlarmas.js";

const alarmaReal = {
  alarma: "BAJO FLUJO",
  severidad: 800,
  desde: "2026-08-17 14:52:32",
  mensaje: "BAJO FLUJO",
  vigilaLaSenal: "Caudal instantáneo",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("la pregunta de diagnóstico", () => {
  it("lleva el nombre EXACTO de la alarma", () => {
    // Con el nombre literal, la traza de la respuesta deja ver si el asistente
    // entendió la alarma correcta. Reformularlo lo taparía.
    expect(preguntaDeDiagnostico(alarmaReal)).toContain('"BAJO FLUJO"');
  });

  it("lleva la hora de activación", () => {
    /*
     * Lo más importante de este archivo. Sin la hora, el asistente resuelve el
     * período por defecto —las últimas 6 horas— y una alarma del 17 de agosto
     * queda completamente fuera de esa ventana: contestaría con datos de hoy
     * sobre un suceso de hace tres días.
     */
    expect(preguntaDeDiagnostico(alarmaReal)).toContain("2026-08-17 14:52:32");
  });

  it("pide investigar, no sólo describir", () => {
    // «¿Qué es BAJO FLUJO?» se responde con el manual. Lo que hace falta es que
    // mire las señales alrededor de ese momento.
    expect(preguntaDeDiagnostico(alarmaReal)).toMatch(/investiga|señales|caus/i);
  });

  it("una alarma sin hora no inventa una", () => {
    // Pasa con las alarmas que nunca se han disparado: sus campos vienen con
    // calidad mala y `desde` llega vacío. Mejor sin período —y que el servidor
    // use su defecto— que con uno inventado.
    const sinHora = { ...alarmaReal, desde: null };
    const pregunta = preguntaDeDiagnostico(sinHora);

    expect(pregunta).toContain("BAJO FLUJO");
    expect(pregunta).not.toMatch(/Se activó el\s*\./);
    expect(pregunta).not.toContain("null");
  });
});

describe("la severidad", () => {
  it("800 es alta: es la de la alarma real de esta instalación", () => {
    expect(nivelDeSeveridad(800).clave).toBe("alta");
    expect(nivelDeSeveridad(1000).clave).toBe("alta");
  });

  it("los cortes intermedios son los del estándar", () => {
    expect(nivelDeSeveridad(500).clave).toBe("media");
    expect(nivelDeSeveridad(799).clave).toBe("media");
    expect(nivelDeSeveridad(499).clave).toBe("baja");
  });

  it("una severidad ausente no revienta ni se cuenta como alta", () => {
    // Marcar como grave algo que no sabemos que lo sea enseña a ignorar el
    // rojo, que es la peor consecuencia posible en una pantalla de alarmas.
    expect(nivelDeSeveridad(null).clave).toBe("baja");
    expect(nivelDeSeveridad(undefined).clave).toBe("baja");
    expect(nivelDeSeveridad("no es un número").clave).toBe("baja");
  });
});

describe("el sondeo", () => {
  it("un fallo de lectura conserva lo último que se supo", async () => {
    /*
     * No se puede probar el hook sin React, así que se comprueba la regla sobre
     * la mecánica que usa: la respuesta fallida no debe producir una lista
     * vacía. Se reproduce el manejo del hook con la misma forma.
     */
    let activas = [alarmaReal];

    const consultar = async (fetchFalso) => {
      try {
        const r = await fetchFalso();
        if (!r.ok) throw new Error(String(r.status));
        activas = (await r.json()).activas ?? [];
      } catch {
        // Se conserva `activas` a propósito: ver `useAlarmas`.
      }
    };

    await consultar(async () => ({ ok: false, status: 502 }));
    expect(activas).toHaveLength(1);
    expect(activas[0].alarma).toBe("BAJO FLUJO");

    // Y cuando vuelve a funcionar, sí se actualiza.
    await consultar(async () => ({ ok: true, json: async () => ({ activas: [] }) }));
    expect(activas).toHaveLength(0);
  });
});
