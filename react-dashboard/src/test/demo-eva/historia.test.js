/**
 * historia.test.js
 * ------------------------------------------------------------------
 * El cálculo de rango del selector de tiempo (Plan 11): los tres accesos
 * rápidos, el personalizado, y que `leerSerie` pida el intervalo correcto
 * según venga un rango relativo (`{horas, puntos}`, el de siempre) o uno
 * absoluto (`{inicio, fin}`, el nuevo).
 *
 * Se mockea `fetchIconicsHistory` porque lo que se prueba es la ARITMÉTICA
 * del rango, no la red — esa la cubre `src/test/live/eva.live.test.js`.
 */
import { describe, expect, it, vi } from "vitest";

const { fetchIconicsHistory } = vi.hoisted(() => ({
  fetchIconicsHistory: vi.fn(async () => ({ data: [] })),
}));

vi.mock("@/lib/iconics", () => ({ fetchIconicsHistory }));

import {
  leerSerie,
  rangoAyer,
  rangoPersonalizado,
  rangoSemana,
} from "@/Demo-EVA/data/historia.js";

describe("los accesos rápidos contra el historiador son aritmética de calendario, no de red", () => {
  it("«Ayer» es el día completo anterior, sin tocar hoy", () => {
    const ahora = new Date("2026-08-20T09:00:00");
    const { inicio, fin } = rangoAyer(ahora);

    expect(inicio.getDate()).toBe(19);
    expect(inicio.getHours()).toBe(0);
    expect(fin.getDate()).toBe(20);
    expect(fin.getHours()).toBe(0);
    expect(fin.getTime() - inicio.getTime()).toBe(24 * 3600 * 1000);
  });

  it("«Hace una semana» es una ventana móvil de 7 días, no un día suelto", () => {
    const ahora = new Date("2026-08-20T15:30:00");
    const { inicio, fin } = rangoSemana(ahora);

    expect(fin).toEqual(ahora);
    expect(fin.getTime() - inicio.getTime()).toBe(7 * 24 * 3600 * 1000);
  });
});

describe("el rango personalizado cubre los dos días completos, sin hora", () => {
  it("de un día a otro, incluye el día de fin entero", () => {
    const { inicio, fin } = rangoPersonalizado(
      new Date("2026-08-10T11:00:00"),
      new Date("2026-08-12T23:00:00")
    );

    expect(inicio.getDate()).toBe(10);
    expect(inicio.getHours()).toBe(0);
    // El fin es la medianoche SIGUIENTE al día de fin, para incluirlo entero.
    expect(fin.getDate()).toBe(13);
    expect(fin.getHours()).toBe(0);
  });

  it("un solo día como inicio y fin sigue cubriendo el día entero, no un instante", () => {
    const dia = new Date("2026-08-15T18:00:00");
    const { inicio, fin } = rangoPersonalizado(dia, dia);

    expect(fin.getTime() - inicio.getTime()).toBe(24 * 3600 * 1000);
  });
});

describe("leerSerie pide el intervalo correcto según el tipo de rango", () => {
  it("con {horas, puntos} (el camino de siempre) el cálculo no cambió", async () => {
    fetchIconicsHistory.mockClear();
    await leerSerie("nivelTanque", { horas: 6, puntos: 24 });

    const [, params] = fetchIconicsHistory.mock.calls[0];
    expect(params.interval).toBe("00:15:00");
  });

  it("sin argumento cae en VENTANA (6 h en 24 puntos), igual que antes", async () => {
    fetchIconicsHistory.mockClear();
    await leerSerie("nivelTanque");

    const [, params] = fetchIconicsHistory.mock.calls[0];
    expect(params.interval).toBe("00:15:00");
  });

  it("con {inicio, fin} absoluto, el intervalo escala a MAX_PUNTOS", async () => {
    fetchIconicsHistory.mockClear();
    const inicio = new Date("2026-08-13T00:00:00Z");
    const fin = new Date("2026-08-20T00:00:00Z"); // una semana exacta

    await leerSerie("nivelTanque", { inicio, fin });

    const [punto, params] = fetchIconicsHistory.mock.calls[0];
    expect(punto).toBe("ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE");
    expect(params.startDate).toBe(inicio.toISOString());
    expect(params.endDate).toBe(fin.toISOString());
    // 7 días de segundos / 100 puntos = 6048 s = 01:40:48.
    expect(params.interval).toBe("01:40:48");
  });

  it("un {inicio, fin} con `fin` en el futuro se recorta a `ahora`", async () => {
    // Regresión: el calendario personalizado deja elegir HOY como día de
    // fin (sólo «mañana» en adelante está deshabilitado), y
    // `rangoPersonalizado` redondea ese día a su medianoche SIGUIENTE sin
    // saber qué hora es todavía. Sin este recorte, `leerSerie` pedía un
    // tramo hasta esa medianoche futura, y como los MAX_PUNTOS se reparten
    // por igual entre `inicio` y `fin`, la mitad del rango que aún no
    // ocurre le robaba resolución a la mitad que sí tiene dato.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
    fetchIconicsHistory.mockClear();

    const inicio = new Date("2026-08-20T00:00:00Z");
    const fin = new Date("2026-08-21T00:00:00Z"); // "hoy" completo, con fin en el futuro

    await leerSerie("nivelTanque", { inicio, fin });

    const [, params] = fetchIconicsHistory.mock.calls[0];
    expect(params.endDate).toBe(new Date("2026-08-20T12:00:00Z").toISOString());
    // 12 h reales / 100 puntos = 432 s = 00:07:12 — más fino que las
    // 00:14:24 que habría dado el día completo, porque ya no se reparte
    // resolución sobre horas que no pueden tener muestra.
    expect(params.interval).toBe("00:07:12");

    vi.useRealTimers();
  });

  it("una señal no historizada no llega a pedir nada, con cualquier tipo de rango", async () => {
    fetchIconicsHistory.mockClear();
    const { datos, motivo } = await leerSerie("cargaMotor", {
      inicio: new Date(),
      fin: new Date(),
    });

    expect(fetchIconicsHistory).not.toHaveBeenCalled();
    expect(datos).toEqual([]);
    expect(motivo).toBeTruthy();
  });
});
