/**
 * estado-dato.test.js
 * ------------------------------------------------------------------
 * `estadoDelDato.js` (Plan 13, Fase 0): una sola respuesta a «¿me puedo fiar
 * de este dato?», para el valor en vivo (`frescuraDe`) y para la serie del
 * historiador (`estadoHistorial`).
 *
 * Sin DOM ni temporizadores del navegador: son funciones puras, y si esto
 * necesitara renderizar algo para probarse estaría en el sitio equivocado.
 */
import { describe, expect, it } from "vitest";

import {
  FRESCURA,
  HISTORIAL,
  UMBRAL_CONGELADO_MS,
  estadoHistorial,
  frescuraDe,
  presentarValor,
} from "@/Demo-EVA/data/comunes/estadoDelDato.js";

describe("frescuraDe: el valor en vivo", () => {
  const ahora = new Date("2026-08-21T12:00:00Z");

  it("sin ninguna lectura todavía es sinDato, no fresco ni congelado", () => {
    expect(frescuraDe({ receivedAt: null, ahora })).toBe(FRESCURA.SIN_DATO);
  });

  it("una lectura reciente y no rancia es fresco", () => {
    const receivedAt = new Date(ahora.getTime() - 2_000);
    expect(frescuraDe({ receivedAt, stale: false, ahora })).toBe(FRESCURA.FRESCO);
  });

  it("el motor de sondeo ya la marcó rancia: envejecido, aunque no llegue al minuto", () => {
    const receivedAt = new Date(ahora.getTime() - 10_000);
    expect(frescuraDe({ receivedAt, stale: true, ahora })).toBe(FRESCURA.ENVEJECIDO);
  });

  it("justo por debajo del minuto sigue sin ser congelado", () => {
    const receivedAt = new Date(ahora.getTime() - (UMBRAL_CONGELADO_MS - 1));
    expect(frescuraDe({ receivedAt, stale: true, ahora })).toBe(FRESCURA.ENVEJECIDO);
  });

  it("al minuto exacto ya es congelado — la frontera es cerrada, no abierta", () => {
    const receivedAt = new Date(ahora.getTime() - UMBRAL_CONGELADO_MS);
    expect(frescuraDe({ receivedAt, stale: true, ahora })).toBe(FRESCURA.CONGELADO);
  });

  it("por encima del minuto es congelado aunque el motor no la haya marcado stale", () => {
    // No debería pasar en la práctica (staleAfterCycles dispara mucho antes),
    // pero la regla del minuto es la que manda y no puede depender de que
    // otra pieza haya hecho bien su trabajo.
    const receivedAt = new Date(ahora.getTime() - 5 * 60_000);
    expect(frescuraDe({ receivedAt, stale: false, ahora })).toBe(FRESCURA.CONGELADO);
  });

  it("un reloj ligeramente adelantado no produce una edad negativa ni revienta", () => {
    const receivedAt = new Date(ahora.getTime() + 500);
    expect(frescuraDe({ receivedAt, stale: false, ahora })).toBe(FRESCURA.FRESCO);
  });
});

describe("presentarValor: qué texto va en el sitio de la cifra", () => {
  const ahora = new Date("2026-08-21T12:00:00Z");

  it("fresco: el formateado tal cual, sin atenuar", () => {
    const receivedAt = new Date(ahora.getTime() - 2_000);
    expect(presentarValor({ receivedAt, stale: false, ahora, formateado: "62,5 %" }))
      .toEqual({ texto: "62,5 %", atenuado: false, frescura: FRESCURA.FRESCO });
  });

  it("envejecido: el mismo formateado, pero atenuado — no se sustituye", () => {
    const receivedAt = new Date(ahora.getTime() - 10_000);
    const r = presentarValor({ receivedAt, stale: true, ahora, formateado: "62,5 %" });
    expect(r.texto).toBe("62,5 %");
    expect(r.atenuado).toBe(true);
    expect(r.frescura).toBe(FRESCURA.ENVEJECIDO);
  });

  it("congelado: el formateado SE SUSTITUYE por la edad, y va atenuado", () => {
    const receivedAt = new Date(ahora.getTime() - 90_000);
    const r = presentarValor({ receivedAt, stale: true, ahora, formateado: "62,5 %" });
    expect(r.texto).not.toBe("62,5 %");
    expect(r.texto).toMatch(/hace/);
    expect(r.atenuado).toBe(true);
    expect(r.frescura).toBe(FRESCURA.CONGELADO);
  });

  it("sinDato: pasa el formateado tal cual (el «—» ya lo decide quien formatea)", () => {
    const r = presentarValor({ receivedAt: null, ahora, formateado: "—" });
    expect(r).toEqual({ texto: "—", atenuado: false, frescura: FRESCURA.SIN_DATO });
  });
});

describe("estadoHistorial: la serie del historiador", () => {
  it("cargando, sin datos previos, es cargando", () => {
    expect(estadoHistorial({ loading: true, datos: [] })).toBe(HISTORIAL.CARGANDO);
  });

  it("terminó de cargar y no hay ninguna muestra: sinDato, no cargando", () => {
    expect(estadoHistorial({ loading: false, datos: [] })).toBe(HISTORIAL.SIN_DATO);
  });

  it("hay muestras: ok", () => {
    expect(estadoHistorial({ loading: false, datos: [{ t: new Date(), valor: 1 }] })).toBe(HISTORIAL.OK);
  });

  it("un fallo de red manda siempre, aunque también hubiera un motivo", () => {
    expect(estadoHistorial({ error: "ECONNREFUSED", motivo: "algo", datos: [] })).toBe(HISTORIAL.SIN_CONEXION);
  });

  it("sin serie propia de la señal es sinHistoriador, no sinDato", () => {
    expect(estadoHistorial({ motivo: "El historiador no publica una serie propia de esta señal.", datos: [] }))
      .toBe(HISTORIAL.SIN_HISTORIADOR);
  });

  it("motivo manda incluso mientras loading sigue en true", () => {
    expect(estadoHistorial({ motivo: "sin serie", loading: true, datos: [] })).toBe(HISTORIAL.SIN_HISTORIADOR);
  });

  it("stale-while-revalidate: loading en true con datos previos sigue siendo ok, no cargando", () => {
    // Es el caso documentado en useSerieHistorica: cambiar de rango conserva
    // la curva anterior mientras llega la nueva. Tratar esto como "cargando"
    // borraría del tablón una gráfica que sigue siendo válida.
    const datos = [{ t: new Date(), valor: 1 }, { t: new Date(), valor: 2 }];
    expect(estadoHistorial({ loading: true, datos })).toBe(HISTORIAL.OK);
  });

  it("con minimo: 2, una sola muestra no basta para ok — cargando si aún carga", () => {
    const datos = [{ t: new Date(), valor: 1 }];
    expect(estadoHistorial({ loading: true, datos, minimo: 2 })).toBe(HISTORIAL.CARGANDO);
  });

  it("con minimo: 2, una sola muestra y ya sin loading es sinDato, no ok", () => {
    const datos = [{ t: new Date(), valor: 1 }];
    expect(estadoHistorial({ loading: false, datos, minimo: 2 })).toBe(HISTORIAL.SIN_DATO);
  });

  it("sin argumentos no lanza: cargando por defecto es false y datos vacío", () => {
    expect(estadoHistorial()).toBe(HISTORIAL.SIN_DATO);
  });
});
