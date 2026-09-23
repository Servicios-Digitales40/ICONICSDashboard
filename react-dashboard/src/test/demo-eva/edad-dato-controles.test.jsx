/**
 * edad-dato-controles.test.jsx
 * ------------------------------------------------------------------
 * Plan 24, F0 (`USO-01`): el CONTRATO de `presentarValor()`, la puerta por la
 * que pasa todo valor de señal antes de pintarse para decir si es de ahora.
 *
 * Nació para los tres sitios que enseñaban el valor SIN decirlo —
 * `ControlesTanque`, `FichaActivo` y las tarjetas de `InicioTanque`—, los
 * tres borrados en el Plan 42.5 F4 con el resto de las vistas del tanque. El
 * contrato sigue vivo: lo usan los tiles genéricos de la Planta de una
 * máquina configurada (`components/maquina/tilesMaquina.jsx`) y la tarjeta
 * del Detalle, y `scripts/verificar-frescura.mjs` vigila la forma sintáctica
 * —que ninguna vista se salte la puerta— sin necesitar jsdom.
 *
 * Hermano de `edad-dato.test.jsx`, que monta componentes porque comprueba el
 * CABLEADO: que la cifra de la pantalla se sustituya de verdad. Aquí no hay
 * DOM: señales construidas con el `createSenal` REAL, para que su forma no
 * pueda desincronizarse del contrato, y un `ahora` inyectado.
 *
 * Lo que fijaba el tercer sitio —que sólo una MEDIDA adjunta su señal y una
 * CUENTA no caduca con el reloj— quedó escrito en el plan (`PLAN-42.5`, F4,
 * «Conocimiento conservado») para la Planta genérica.
 */
import { describe, expect, it } from "vitest";

import { createSenal } from "@/Demo-EVA/domain/sistema.js";

const AHORA = new Date("2026-08-21T12:00:00Z");

const senalDe = ({ edadMs, stale }) =>
  createSenal({
    key: "nivelTanque",
    valor: 62.5,
    receivedAt: new Date(AHORA.getTime() - edadMs),
    stale,
  });

const FRESCA = { edadMs: 2_000, stale: false };
const CONGELADA = { edadMs: 90_000, stale: true };

import { FRESCURA, presentarValor } from "@/Demo-EVA/data/comunes/estadoDelDato.js";
import { fmtSenal } from "@/Demo-EVA/lib/formato.js";

describe("USO-01: los tres sitios nuevos y el contrato que comparten", () => {
  it("fresca: se enseña el valor formateado, sin atenuar", () => {
    const { texto, atenuado, frescura } = presentarValor({
      ...senalDe(FRESCA), ahora: AHORA, formateado: fmtSenal(senalDe(FRESCA)),
    });

    expect(texto).toMatch(/62[.,]5/);
    expect(atenuado).toBe(false);
    expect(frescura).toBe(FRESCURA.FRESCO);
  });

  it("congelada: el valor NO aparece, y en su hueco va la edad", () => {
    const senal = senalDe(CONGELADA);
    const { texto, atenuado, frescura } = presentarValor({
      receivedAt: senal.receivedAt, stale: senal.stale, ahora: AHORA, formateado: fmtSenal(senal),
    });

    // Lo que importa de esta línea: el 62,5 NO está. Un valor de hace minuto y
    // medio presentado como actual es lo que este módulo existe para evitar.
    expect(texto).not.toMatch(/62[.,]5/);
    expect(texto).toMatch(/hace/);
    expect(atenuado).toBe(true);
    expect(frescura).toBe(FRESCURA.CONGELADO);
  });

  it("sin lectura: no se afirma frescura, y eso NO atenúa un valor que no hay", () => {
    // La lección del 07-09-2026, en forma de prueba: sin `receivedAt` el estado
    // es SIN_DATO, nunca FRESCO. Un valor por defecto optimista aquí es
    // exactamente cómo el panel de salud dio «Funcionando» con los servicios
    // caídos.
    const { frescura } = presentarValor({ receivedAt: null, ahora: AHORA, formateado: "—" });
    expect(frescura).toBe(FRESCURA.SIN_DATO);
  });
});
