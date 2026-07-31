/**
 * history.test.js
 * ------------------------------------------------------------------
 * `daySummary`: cómo se resume un día del historiador.
 *
 * Fija las dos decisiones que, mal tomadas, producen números creíbles y
 * falsos en el comparativo:
 *
 *   · los FACTORES se promedian y los CONTADORES no (promediar `Pz_OK`
 *     daría "la mitad de lo producido");
 *   · un día sin muestras es `null`, no un día con ceros.
 */
import { describe, expect, it } from "vitest";
import { daySummary } from "@/lib/domain/history.js";

const hora = (t, oee, d, r, c) => ({ t, oee, disponibilidad: d, rendimiento: r, calidad: c });

describe("daySummary", () => {
  it("promedia los factores de la jornada", () => {
    const s = daySummary([hora("08:00", 60, 70, 90, 95), hora("09:00", 70, 80, 90, 95)], {});

    expect(s.oee).toBe(65);
    expect(s.disponibilidad).toBe(75);
    expect(s.muestras).toBe(2);
  });

  it("toma los contadores tal cual: son cierres, no medias", () => {
    const s = daySummary([hora("08:00", 60, 70, 90, 95)], { aprobadas: 900, rechazadas: 100, tMuerto: 7200 });

    expect(s.aprobadas).toBe(900);
    expect(s.rechazadas).toBe(100);
    expect(s.producidas).toBe(1000);
    expect(s.tMuerto).toBe(7200);
  });

  it("ignora las horas sin muestra en vez de contarlas como cero", () => {
    // Una hora sin dato hunde la media si entra como 0. El turno de este
    // caso tuvo 80 de OEE en las dos horas que midió: eso es lo que pasó.
    const s = daySummary([hora("08:00", 80, 80, 100, 100), hora("09:00", null, null, null, null), hora("10:00", 80, 80, 100, 100)], {});

    expect(s.oee).toBe(80);
    expect(s.muestras).toBe(2);
  });

  it("deriva el OEE de los factores solo si el historiador no lo tiene", () => {
    const s = daySummary([hora("08:00", null, 80, 90, 100)], {});

    expect(s.oee).toBe(72);
  });

  it("un día sin nada es null, no un día de ceros", () => {
    expect(daySummary([], {})).toBeNull();
    expect(daySummary([hora("08:00", null, null, null, null)], {})).toBeNull();
  });

  it("sobrevive a valores inutilizables del servidor", () => {
    // `OEE_Cal` llega como Infinity al inicio del turno (división por
    // Prod_Real_Total = 0). No debe propagarse a la media.
    const s = daySummary([hora("08:00", 60, 70, 90, Infinity), hora("09:00", 70, 80, 90, 90)], {});

    expect(s.calidad).toBe(90);
    expect(Number.isFinite(s.oee)).toBe(true);
  });
});
