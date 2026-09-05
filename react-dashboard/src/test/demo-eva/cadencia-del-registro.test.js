/**
 * La cadencia de sondeo sale del registro, no de la vista.
 *
 * ── QUÉ FALLO PERSIGUE ─────────────────────────────────────────────
 *
 * Uno que no se ve. Hasta el Plan 21 F1, el mismo número estaba escrito dos
 * veces por máquina: `cadenciaMs` en `shared/eva/comun/sistemas.js` —declarado
 * desde que existe el registro y leído por nadie— y un `CADENCIA_MS` cableado
 * en la fuente de datos de cada una.
 *
 * Cambiar la cadencia de una máquina exigía acordarse de los dos sitios, y
 * olvidar uno NO da error: el tablero sigue sondeando al ritmo viejo y nada lo
 * dice. Es el mismo patrón que el registro existe para cerrar — un dato de la
 * máquina que vive fuera de la entrada de la máquina.
 *
 * ── LO QUE ESTA PRUEBA PUEDE Y NO PUEDE ────────────────────────────
 *
 * Atrapa que los valores DIVERJAN. Si alguien vuelve a cablear un número
 * distinto del que declara el registro, falla aquí.
 *
 * No puede atrapar que alguien recablee el MISMO número: eso no rompe nada hoy
 * y sólo se convertiría en el problema de antes el día que uno de los dos
 * cambie — momento en el que esta prueba sí saltaría. Se acepta a propósito en
 * vez de leer el texto fuente, que sería frágil por otro lado.
 */
import { describe, expect, it } from "vitest";

import { SISTEMA, SISTEMAS } from "@shared/eva/comun/sistemas.js";
import { CADENCIA_MS } from "@/Demo-EVA/data/comunes/evaSource.js";

describe("la cadencia la declara el registro", () => {
  it("la fuente del tanque usa la del registro, no un número propio", () => {
    expect(CADENCIA_MS).toBe(SISTEMA.tanque.cadenciaMs);
  });

  it("todo sistema declara una cadencia utilizable", () => {
    /*
     * El suelo real no es este número sino `batchCacheTtlMs` del puente (2 s),
     * que colapsa en una sola llamada a ICONICS lo que piden todas las
     * pantallas: sondear por debajo de eso no trae dato más nuevo, sólo repite
     * el cacheado. Por arriba, un minuto es lo que una pantalla de planta puede
     * llevar de retraso sin engañar a quien la mira.
     */
    for (const sistema of SISTEMAS) {
      expect(Number.isFinite(sistema.cadenciaMs), sistema.id).toBe(true);
      expect(sistema.cadenciaMs, sistema.id).toBeGreaterThanOrEqual(1000);
      expect(sistema.cadenciaMs, sistema.id).toBeLessThanOrEqual(60_000);
    }
  });

  it("las dos máquinas pueden tener cadencias distintas, y las tienen", () => {
    // No es cosmético: el tanque publica cada pocos segundos y el SM 1281 tiene
    // su propio ritmo. Una cadencia única para toda la planta obligaría a la
    // más lenta a ir al paso de la más rápida, o al revés.
    const cadencias = SISTEMAS.map((s) => s.cadenciaMs);
    expect(new Set(cadencias).size).toBeGreaterThan(1);
  });
});
