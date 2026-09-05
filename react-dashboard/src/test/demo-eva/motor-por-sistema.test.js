/**
 * Un motor de sondeo POR SISTEMA. La unificación es del código, nunca del lote.
 *
 * ── POR QUÉ ESTA PRUEBA EXISTE DESDE LA MISMA FASE QUE EL ARREGLO ──
 *
 * Porque el arreglo crea la tentación. Hasta el Plan 21 F2, vibraciones tenía
 * su propio `setInterval` y el tanque el motor de `lib/iconics`: nadie iba a
 * juntar dos cosas que ni se parecían. Desde que las dos máquinas usan el MISMO
 * motor, pedir `SISTEMAS.flatMap(s => s.puntos())` en una sola llamada parece
 * la simplificación obvia — y sería meter las dos instalaciones en el mismo
 * lote y en el mismo búfer.
 *
 * La cabecera de `shared/eva/comun/sistemas.js` ya lo avisa con estas palabras:
 * «En cuanto existe `SISTEMAS.flatMap(s => s.puntos())`, alguien pedirá un solo
 * lote con las dos máquinas y las meterá en el mismo búfer.» Esto es lo que lo
 * convierte en un fallo de pruebas en vez de en un párrafo que alguien puede no
 * leer.
 *
 * ── LO QUE SE COMPRUEBA ────────────────────────────────────────────
 *
 * Que con las dos fuentes vivas a la vez, NINGUNA petición contiene puntos de
 * las dos máquinas. No que sean dos peticiones exactas —el motor trocea por
 * `maxBatch` y podría partirlas— sino que ningún lote las mezcla, que es la
 * afirmación que importa.
 */
import { afterEach, describe, expect, it } from "vitest";

import { SISTEMA } from "@shared/eva/comun/sistemas.js";
import { createEvaSource } from "@/Demo-EVA/data/comunes/evaSource.js";
import { createVibracionSource } from "@/Demo-EVA/data/vibraciones/vibracionSource.js";

/** Un transporte que apunta cada lote que le piden, sin salir a ningún lado. */
function transporteEspia(lotes) {
  return {
    read: async (puntos) => {
      lotes.push([...puntos]);
      // Da igual qué devuelva: lo que se mide es QUÉ se pidió.
      return new Map(puntos.map((p) => [p, { value: 1, quality: 0 }]));
    },
  };
}

const bajas = [];
afterEach(() => {
  while (bajas.length) bajas.pop()();
});

describe("cada máquina sondea por su cuenta", () => {
  it("ningún lote mezcla puntos de las dos instalaciones", async () => {
    const lotes = [];
    const espia = transporteEspia(lotes);

    const tanque = createEvaSource({ transport: espia, intervalMs: 50 });
    const vibracion = createVibracionSource({ transport: espia, intervalMs: 50 });

    bajas.push(tanque.subscribeSistema(() => {}));
    bajas.push(vibracion.subscribeVibracion(() => {}));

    await new Promise((r) => setTimeout(r, 500));

    expect(lotes.length).toBeGreaterThan(0);

    const raicesTanque = SISTEMA.tanque.raices;
    const raicesVibracion = SISTEMA.vibraciones.raices;
    const deQuien = (punto) => {
      if (raicesTanque.some((r) => punto.startsWith(r))) return "tanque";
      if (raicesVibracion.some((r) => punto.startsWith(r))) return "vibraciones";
      return "ninguna";
    };

    for (const lote of lotes) {
      const duenos = new Set(lote.map(deQuien));
      duenos.delete("ninguna");
      expect(
        [...duenos].length,
        `Un lote pidió puntos de ${[...duenos].join(" y ")} a la vez:\n  ` +
          lote.slice(0, 5).join("\n  ") +
          "\n\nLa unificación del Plan 21 F2 es del CÓDIGO, nunca del lote. " +
          "Ver la cabecera de `data/vibraciones/vibracionSource.js`."
      ).toBeLessThanOrEqual(1);
    }
  });

  it("las dos fuentes tienen su propia cadencia, la que declara su registro", () => {
    // Un solo motor compartido obligaría a la máquina lenta a ir al paso de la
    // rápida, o al revés. Cada una lee la suya del registro (F1).
    expect(SISTEMA.tanque.cadenciaMs).not.toBe(SISTEMA.vibraciones.cadenciaMs);
  });
});

describe("volver a entrar en la sección no finge una máquina muda", () => {
  it("tras soltar todos los puntos, el estado vuelve a `loading` y no a «sin dato»", async () => {
    /*
     * La regresión que este archivo estrena, y que se introdujo en el propio
     * F2: al desmontarse el último componente, la baja del motor BORRA los
     * valores cacheados (`values.delete`). Si `loading` se dedujera de
     * `stats.ultimaLectura` —que dura lo que el proceso— el primer instante de
     * la siguiente visita sería `loading: false` con los 73 puntos mudos, o
     * sea la cinta de «La máquina no está contestando» sobre una máquina que
     * está perfectamente.
     *
     * Se vio montando la vista dos veces seguidas en la misma tanda de
     * pruebas, que es exactamente lo que hace un operador al navegar.
     */
    const lotes = [];
    const fuente = createVibracionSource({ transport: transporteEspia(lotes), intervalMs: 50 });

    const estados = [];
    const baja = fuente.subscribeVibracion((e) => estados.push(e));
    await new Promise((r) => setTimeout(r, 300));

    expect(estados.at(-1).loading).toBe(false);
    expect(estados.at(-1).lastUpdated).not.toBeNull();

    baja();

    // Segunda visita: nadie ha leído nada todavía.
    const segunda = [];
    const baja2 = fuente.subscribeVibracion((e) => segunda.push(e));

    expect(segunda[0].loading).toBe(true);
    expect(segunda[0].lastUpdated).toBeNull();

    baja2();
    fuente.stop();
  });
});
