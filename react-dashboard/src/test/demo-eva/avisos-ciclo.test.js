/**
 * avisos-ciclo.test.js — el ciclo de vida de un aviso (Plan 31 F3).
 *
 * Dominio puro: sin React, sin red, sin DOM. El reloj entra por parámetro, que
 * es lo que permite probar un cooldown de media hora sin esperarla.
 *
 * ── LAS DECISIONES QUE ESTAS PRUEBAS FIJAN ──────────────────────────
 *
 *  1. **Un aviso sobrevive a su riesgo.** Decidido el 15-09-2026: un riesgo que
 *     se enciende veinte minutos de madrugada y se apaga solo no puede
 *     desaparecer sin dejar rastro en la pantalla que existe para avisar de él.
 *  2. **Pero se marca.** Si el aviso sobrevive, la vista mezcla presente y
 *     pasado, y dos avisos idénticos —uno vigente, otro de hace una hora— son
 *     la forma de que se deje de mirar la pantalla.
 *  3. **Un riesgo que parpadea no re-narra.** Cada narración son 30-90 s de
 *     modelo; un contacto que rebota encolaría decenas.
 *  4. **`resuelto` no significa «arreglado».** Significa «ya no está activo»,
 *     que puede ser porque se resolvió, porque la bomba se paró o porque el
 *     sensor dejó de dar dato.
 */
import { describe, expect, it } from "vitest";

import {
  COOLDOWN_NARRACION_MS,
  ESTADO_AVISO,
  idDeAviso,
  marcarVisto,
  reconciliarAvisos,
} from "@shared/eva/comun/avisos.js";

const T0 = 1_700_000_000_000;

const riesgo = (id) => ({ id, titulo: `Riesgo ${id}`, severidad: "critico", evidencia: "E" });
const activo = (sistema, id) => ({ sistema, riesgo: riesgo(id) });

describe("la identidad de un aviso es la máquina y el riesgo, no el momento", () => {
  it("dos máquinas con el mismo riesgoId NO son el mismo aviso", () => {
    // `NO_COMPARTEN`: el tanque y vibraciones pueden tener ids que coincidan.
    expect(idDeAviso("tanque", "x")).not.toBe(idDeAviso("vibraciones", "x"));
  });

  it("el mismo riesgo en dos sondeos es UN aviso, no dos", () => {
    /*
     * Es lo que impide usar `diagnosticEventId`, que `diagnostico.mjs` genera
     * con `Date.now()` en cada llamada: con él, cada sondeo habría añadido un
     * aviso «nuevo» del mismo hallazgo y la vista crecería sin parar.
     */
    const uno = reconciliarAvisos({ activos: [activo("tanque", "fuga")], ahora: T0 });
    const dos = reconciliarAvisos({
      previos: uno.avisos, activos: [activo("tanque", "fuga")], ahora: T0 + 5000,
    });

    expect(dos.avisos).toHaveLength(1);
    expect(dos.avisos[0].id).toBe(uno.avisos[0].id);
  });
});

describe("un aviso sobrevive a su riesgo, pero marcado", () => {
  it("el riesgo se apaga y el aviso SIGUE, como resuelto", () => {
    const uno = reconciliarAvisos({ activos: [activo("tanque", "fuga")], ahora: T0 });
    const dos = reconciliarAvisos({ previos: uno.avisos, activos: [], ahora: T0 + 60_000 });

    expect(dos.avisos).toHaveLength(1);
    expect(dos.avisos[0].estado).toBe(ESTADO_AVISO.RESUELTO);
    expect(dos.avisos[0].resueltoEn).toBe(T0 + 60_000);
  });

  it("un riesgo activo se marca VIGENTE: la vista distingue presente de pasado", () => {
    const { avisos } = reconciliarAvisos({ activos: [activo("tanque", "fuga")], ahora: T0 });
    expect(avisos[0].estado).toBe(ESTADO_AVISO.VIGENTE);
    expect(avisos[0].resueltoEn).toBeNull();
  });

  it("la hora de resolución se sella UNA vez, no se reescribe en cada sondeo", () => {
    // Si se reescribiera, «resuelto hace 5 min» diría siempre 5 minutos por
    // muchas horas que pasaran.
    const uno = reconciliarAvisos({ activos: [activo("tanque", "fuga")], ahora: T0 });
    const dos = reconciliarAvisos({ previos: uno.avisos, activos: [], ahora: T0 + 60_000 });
    const tres = reconciliarAvisos({ previos: dos.avisos, activos: [], ahora: T0 + 900_000 });

    expect(tres.avisos[0].resueltoEn).toBe(T0 + 60_000);
  });

  it("un riesgo que REVIVE vuelve a vigente y pierde su hora de resolución", () => {
    const uno = reconciliarAvisos({ activos: [activo("tanque", "fuga")], ahora: T0 });
    const dos = reconciliarAvisos({ previos: uno.avisos, activos: [], ahora: T0 + 60_000 });
    const tres = reconciliarAvisos({
      previos: dos.avisos, activos: [activo("tanque", "fuga")], ahora: T0 + 120_000,
    });

    expect(tres.avisos[0].estado).toBe(ESTADO_AVISO.VIGENTE);
    expect(tres.avisos[0].resueltoEn).toBeNull();
  });

  it("los vigentes van ANTES que los resueltos", () => {
    /*
     * No es estética: es el único orden que no obliga a leer la lista entera
     * para saber si hay algo urgente.
     */
    const uno = reconciliarAvisos({
      activos: [activo("tanque", "vieja"), activo("tanque", "nueva")], ahora: T0,
    });
    const dos = reconciliarAvisos({
      previos: uno.avisos, activos: [activo("tanque", "nueva")], ahora: T0 + 60_000,
    });

    expect(dos.avisos.map((a) => a.estado)).toEqual([
      ESTADO_AVISO.VIGENTE, ESTADO_AVISO.RESUELTO,
    ]);
  });
});

describe("un aviso resuelto Y leído desaparece", () => {
  it("leído y luego apagado: ya no hay nada pendiente que representar", () => {
    const uno = reconciliarAvisos({ activos: [activo("tanque", "fuga")], ahora: T0 });
    const leidos = marcarVisto(uno.avisos, "tanque:fuga", T0 + 1000);
    const dos = reconciliarAvisos({ previos: leidos, activos: [], ahora: T0 + 60_000 });

    expect(dos.avisos).toHaveLength(0);
  });

  it("leído pero TODAVÍA activo: se queda, porque «visto» no apaga un riesgo", () => {
    const uno = reconciliarAvisos({ activos: [activo("tanque", "fuga")], ahora: T0 });
    const leidos = marcarVisto(uno.avisos, "tanque:fuga", T0 + 1000);
    const dos = reconciliarAvisos({
      previos: leidos, activos: [activo("tanque", "fuga")], ahora: T0 + 60_000,
    });

    expect(dos.avisos).toHaveLength(1);
    expect(dos.avisos[0].estado).toBe(ESTADO_AVISO.VIGENTE);
  });

  it("marcar visto no muta la lista anterior", () => {
    const { avisos } = reconciliarAvisos({ activos: [activo("tanque", "fuga")], ahora: T0 });
    const leidos = marcarVisto(avisos, "tanque:fuga", T0 + 1000);

    expect(avisos[0].vistoEn).toBeNull();
    expect(leidos[0].vistoEn).toBe(T0 + 1000);
  });
});

describe("un riesgo que parpadea no gasta el modelo", () => {
  it("la primera vez SÍ se narra", () => {
    const { aNarrar } = reconciliarAvisos({ activos: [activo("tanque", "fuga")], ahora: T0 });
    expect(aNarrar.map((a) => a.id)).toEqual(["tanque:fuga"]);
  });

  it("reaparecer dentro del cooldown NO vuelve a narrar", () => {
    /*
     * El caso que motiva la fase: un presostato en el límite enciende y apaga
     * su riesgo cada pocos segundos. Sin esto, cada rebote encolaría otra
     * narración de 30-90 s con el modelo, y el asistente de al lado esperaría.
     */
    const uno = reconciliarAvisos({ activos: [activo("tanque", "fuga")], ahora: T0 });
    const narrados = uno.avisos.map((a) => ({ ...a, narracion: "texto", narradoEn: T0 }));

    const dos = reconciliarAvisos({ previos: narrados, activos: [], ahora: T0 + 2000 });
    const tres = reconciliarAvisos({
      previos: dos.avisos, activos: [activo("tanque", "fuga")], ahora: T0 + 4000,
    });

    expect(tres.aNarrar).toHaveLength(0);
    // Y se REUSA el texto que ya había, en vez de quedarse sin nada que enseñar.
    expect(tres.avisos[0].narracion).toBe("texto");
  });

  it("pasado el cooldown, se vuelve a narrar", () => {
    const uno = reconciliarAvisos({ activos: [activo("tanque", "fuga")], ahora: T0 });
    const narrados = uno.avisos.map((a) => ({ ...a, narracion: "texto", narradoEn: T0 }));

    const dos = reconciliarAvisos({
      previos: narrados,
      activos: [activo("tanque", "fuga")],
      ahora: T0 + COOLDOWN_NARRACION_MS,
    });

    expect(dos.aNarrar.map((a) => a.id)).toEqual(["tanque:fuga"]);
  });

  it("un aviso RESUELTO no se narra nunca", () => {
    /*
     * Narrarlo gastaría el modelo en describir un presente que no existe, y el
     * texto diría «está pasando» sobre algo que pasó.
     */
    const uno = reconciliarAvisos({ activos: [activo("tanque", "fuga")], ahora: T0 });
    const dos = reconciliarAvisos({
      previos: uno.avisos, activos: [], ahora: T0 + COOLDOWN_NARRACION_MS * 2,
    });

    expect(dos.avisos[0].estado).toBe(ESTADO_AVISO.RESUELTO);
    expect(dos.aNarrar).toHaveLength(0);
  });
});

describe("no se mezclan las dos máquinas", () => {
  it("apagarse un riesgo del tanque no toca el de vibraciones", () => {
    const uno = reconciliarAvisos({
      activos: [activo("tanque", "fuga"), activo("vibraciones", "desalineacion")], ahora: T0,
    });
    const dos = reconciliarAvisos({
      previos: uno.avisos, activos: [activo("vibraciones", "desalineacion")], ahora: T0 + 60_000,
    });

    const porId = Object.fromEntries(dos.avisos.map((a) => [a.id, a.estado]));
    expect(porId["tanque:fuga"]).toBe(ESTADO_AVISO.RESUELTO);
    expect(porId["vibraciones:desalineacion"]).toBe(ESTADO_AVISO.VIGENTE);
  });
});
