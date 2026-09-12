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

const { fetchIconicsHistory, fetchIconicsHistoryBatch } = vi.hoisted(() => ({
  fetchIconicsHistory: vi.fn(async () => ({ data: [] })),
  fetchIconicsHistoryBatch: vi.fn(async () => ({ ok: true, payload: { series: {} } })),
}));

vi.mock("@/lib/iconics", () => ({ fetchIconicsHistory, fetchIconicsHistoryBatch }));

import {
  leerSerie,
  leerSeries,
  rangoAyer,
  rangoPersonalizado,
  rangoSemana,
} from "@/Demo-EVA/data/tanque/historia.js";
import { MAX_SERIES_BATCH } from "@shared/eva/comun/historia.js";
import { historizadasMedidas } from "@/Demo-EVA/domain/senales.js";

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

/**
 * ── `crudo: true`: SIN agregado, y con el recorte que eso obliga ───
 *
 * Nació de un fallo silencioso (12-09-2026): el historial de alarmas enseñaba
 * un evento donde el servidor tenía once, porque `Average` sobre un booleano
 * borra los flancos —los cubos salen a `0,5` o sin `value`—. Ver la cabecera de
 * `leerSerie` y `scripts/sondear-agregado-alarma.mjs`.
 *
 * El recorte no es celo: es la regla 3 de `@shared/eva/comun/historia.js`, y
 * sólo aplica sin agregado. Medido el 26-08-2026: un rango vacío pedido SIN
 * `aggregate` devuelve la muestra límite del historiador entero, con `ok: true`
 * y sin aviso, por lejos que caiga. Para una alarma eso es un flanco inventado.
 */
describe("leerSerie en crudo, para los booleanos", () => {
  it("no manda `aggregate` ni `interval` cuando se pide crudo", async () => {
    fetchIconicsHistory.mockClear();
    await leerSerie("nivelTanque", { horas: 6, puntos: 24 }, { crudo: true });

    const [, params] = fetchIconicsHistory.mock.calls[0];
    expect(params.aggregate).toBeUndefined();
    expect(params.interval).toBeUndefined();
  });

  it("por defecto SIGUE mandando el agregado — esto no cambia para los caudales", async () => {
    fetchIconicsHistory.mockClear();
    await leerSerie("nivelTanque", { horas: 6, puntos: 24 });

    const [, params] = fetchIconicsHistory.mock.calls[0];
    expect(params.aggregate).toBe("Average");
  });

  it("descarta la muestra que el servidor cuela FUERA del rango pedido", async () => {
    const inicio = new Date("2026-09-11T00:00:00Z");
    const fin = new Date("2026-09-11T06:00:00Z");

    fetchIconicsHistory.mockResolvedValueOnce({
      data: [
        // La muestra límite del historiador entero: de hace un año, sin aviso.
        { timestamp: "2025-06-01T00:00:00.000Z", quality: 0, value: true },
        { timestamp: "2026-09-11T02:00:00.000Z", quality: 0, value: false },
        { timestamp: "2026-09-11T03:00:00.000Z", quality: 0, value: true },
      ],
    });

    const { datos } = await leerSerie("nivelTanque", { inicio, fin }, { crudo: true });

    expect(datos).toHaveLength(2);
    expect(datos.every((m) => m.t >= inicio && m.t <= fin)).toBe(true);
  });

  it("con agregado NO recorta: ahí el servidor ya devuelve el rango vacío limpio", async () => {
    // Recortar también aquí sería una regla nueva colada de rebote en el camino
    // que usan todas las gráficas, y la trampa de la regla 3 no existe con agregado.
    const inicio = new Date("2026-09-11T00:00:00Z");
    const fin = new Date("2026-09-11T06:00:00Z");

    fetchIconicsHistory.mockResolvedValueOnce({
      data: [{ timestamp: "2025-06-01T00:00:00.000Z", quality: 0, value: 3 }],
    });

    const { datos } = await leerSerie("nivelTanque", { inicio, fin });
    expect(datos).toHaveLength(1);
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

  it("un rango de varios días se pide DÍA A DÍA, no de una vez", async () => {
    /*
     * Medido contra el servidor real con el rango 14→24 de agosto de 2026,
     * que tiene 119 puntos de datos repartidos entre el 17 y el 21:
     *
     *     interval=02:24:00  ->  1 punto    hasMore=false
     *     interval=01:00:00  ->  2 puntos   hasMore=true
     *     interval=00:15:00  ->  0 puntos   hasMore=true
     *
     * Cuanto más fino el intervalo, MENOS datos: el servidor agota su cupo
     * recorriendo los buckets vacíos del principio y devuelve `hasMore` con
     * la lista vacía. Una gráfica de diez días salía con dos puntos y una
     * recta entre ellos. El backend ya troceaba por días
     * (`leerSerieEnRango`); esto lo trae a la vista de detalle.
     */
    fetchIconicsHistory.mockClear();
    const inicio = new Date("2026-08-13T00:00:00Z");
    const fin = new Date("2026-08-20T00:00:00Z"); // una semana exacta

    await leerSerie("nivelTanque", { inicio, fin });

    expect(fetchIconicsHistory.mock.calls).toHaveLength(7);

    const [punto, primero] = fetchIconicsHistory.mock.calls[0];
    // Plan 27 F6: el histórico ya no se pide con el nombre en vivo (ac:).
    expect(punto).toBe("hda:\\Configuration\\DEMO TANQUE\\INSTRUMENTACION_PROCESO:NIVEL_TANQUE");
    expect(primero.startDate).toBe(inicio.toISOString());
    // Un día en 96 puntos: la misma rejilla de 15 min del resto del proyecto.
    expect(primero.interval).toBe("00:15:00");

    // Los tramos cubren el rango entero, sin huecos ni solapes.
    const ultimo = fetchIconicsHistory.mock.calls[6][1];
    expect(ultimo.endDate).toBe(fin.toISOString());
  });

  it("un rango largo agrupa días para no disparar cientos de peticiones", async () => {
    // Diez días son diez peticiones, razonable. Un año serían 365 a la vez,
    // que no lo es: los escalones acotan el número sin perder resolución en
    // los rangos que la gente pide de verdad.
    fetchIconicsHistory.mockClear();
    await leerSerie("nivelTanque", {
      inicio: new Date("2026-01-01T00:00:00Z"),
      fin: new Date("2026-08-20T00:00:00Z"), // ~8 meses
    });

    const peticiones = fetchIconicsHistory.mock.calls.length;
    expect(peticiones).toBeGreaterThan(1);
    expect(peticiones).toBeLessThanOrEqual(30);
  });

  it("la cobertura declara cuántos tramos traían dato", async () => {
    // Un rango con días vacíos se dibuja como una curva continua entre los
    // que sí tienen muestras. Sin la cobertura, eso se lee como si la señal
    // hubiera evolucionado así, cuando lo que hubo fue silencio.
    fetchIconicsHistory.mockClear();
    fetchIconicsHistory.mockImplementation((_punto, params) => {
      // Sólo el primer día del rango trae muestras.
      const esPrimero = params.startDate.startsWith("2026-08-13");
      return Promise.resolve({
        data: esPrimero
          ? [{ timestamp: "2026-08-13T06:00:00Z", value: 50, quality: 0 }]
          : [],
        hasMore: false,
      });
    });

    const { datos, cobertura } = await leerSerie("nivelTanque", {
      inicio: new Date("2026-08-13T00:00:00Z"),
      fin: new Date("2026-08-20T00:00:00Z"),
    });

    expect(datos).toHaveLength(1);
    expect(cobertura.tramos).toBe(7);
    expect(cobertura.tramosConDato).toBe(1);
    expect(cobertura.completa).toBe(false);
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

describe("leerSeries trocea en lotes de MAX_SERIES_BATCH (Plan 27 F6)", () => {
  /*
   * Medido contra el servidor real el 10-09-2026: con cincuenta señales
   * historizadas, la pestaña «Estación de llenado» pedía once de golpe y
   * `/api/iconics/history/batch` rechazaba el lote ENTERO con
   * `too_big`/"No more than 10 points per request" — las tarjetas de esa
   * pestaña se quedaban sin histórico. Este archivo nunca había probado
   * `leerSeries` directamente (sólo `leerSerie`, uno a uno), y por eso nadie
   * atrapó la regresión antes de llegar a producción.
   */
  it("con más de MAX_SERIES_BATCH claves, hace VARIAS llamadas, ninguna por encima del tope", async () => {
    fetchIconicsHistoryBatch.mockClear();

    // Señales reales, historizadas y medidas de verdad — no hace falta que
    // sean muchas más de once: lo que importa es cruzar el tope.
    const claves = historizadasMedidas();
    expect(claves.length).toBeGreaterThan(MAX_SERIES_BATCH);

    await leerSeries(claves, { inicio: new Date("2026-09-01"), fin: new Date("2026-09-02") });

    expect(fetchIconicsHistoryBatch.mock.calls.length).toBeGreaterThan(1);
    for (const [puntos] of fetchIconicsHistoryBatch.mock.calls) {
      expect(puntos.length).toBeLessThanOrEqual(MAX_SERIES_BATCH);
    }
    // Ninguna clave se pierde ni se repite al trocear.
    const totalPedido = fetchIconicsHistoryBatch.mock.calls.reduce((n, [puntos]) => n + puntos.length, 0);
    expect(totalPedido).toBe(claves.length);
  });

  it("si un lote falla, se propaga el error — no se disfraza de rango vacío", async () => {
    fetchIconicsHistoryBatch.mockClear();
    fetchIconicsHistoryBatch
      .mockResolvedValueOnce({ ok: true, payload: { series: {} } })
      .mockResolvedValueOnce({ ok: false, error: "ICONICS History request failed." });

    const claves = historizadasMedidas();
    await expect(
      leerSeries(claves, { inicio: new Date("2026-09-01"), fin: new Date("2026-09-02") })
    ).rejects.toThrow(/ICONICS History request failed/);
  });
});
