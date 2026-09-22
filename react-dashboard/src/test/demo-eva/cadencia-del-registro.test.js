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
 *
 * ── LA SEGUNDA MÁQUINA YA NO ESTÁ ESCRITA EN EL REGISTRO (Plan 40 F3) ──
 *
 * `SISTEMAS` trae hoy sólo el tanque: la máquina de vibraciones existe
 * CONFIGURADA (`construirSistema` + `registrarSistema`), y su cadencia viene
 * de la configuración —`cadenciaMs: 5000` en la espejo— y no de un literal en
 * este archivo. Se registra aquí la espejo para que «las dos máquinas» siga
 * siendo cierto y el bucle de abajo recorra a las dos, igual que hará el
 * registro de arranque del backend.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SISTEMA, SISTEMAS, desregistrarSistema, registrarSistema } from "@shared/eva/comun/sistemas.js";
import { construirSistema } from "@shared/eva/comun/construirSistema.js";
import { tipoDe } from "@shared/eva/tipos/index.js";
import { CADENCIA_MS } from "@/Demo-EVA/data/comunes/evaSource.js";
import { ID_ESPEJO, configuracionEspejo } from "../../../../scripts/lib/configuracionEspejo.mjs";

beforeAll(() => {
  registrarSistema(construirSistema(configuracionEspejo().configurada, tipoDe("vibraciones")));
});
afterAll(() => {
  desregistrarSistema(ID_ESPEJO);
});

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
    //
    // La de vibraciones sale de SU configuración —es lo que `construirSistema`
    // pone en la entrada—, no del tipo ni de un número del frontend.
    expect(SISTEMA[ID_ESPEJO].cadenciaMs).toBe(configuracionEspejo().configurada.cadenciaMs);
    expect(SISTEMA[ID_ESPEJO].cadenciaMs).not.toBe(SISTEMA.tanque.cadenciaMs);

    const cadencias = SISTEMAS.map((s) => s.cadenciaMs);
    expect(new Set(cadencias).size).toBeGreaterThan(1);
  });
});
