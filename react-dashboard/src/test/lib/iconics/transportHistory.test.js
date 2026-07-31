/**
 * transportHistory.test.js
 * ------------------------------------------------------------------
 * Lo que el transporte le PIDE al historiador y cómo une lo que recibe.
 *
 * Es la parte del comparativo que no se puede comprobar mirando la
 * pantalla: si el rango se manda en UTC, si un contador se promedia o si
 * dos tags se emparejan por posición, el resultado sigue siendo una
 * gráfica con forma de gráfica. Aquí se fija cada una de esas decisiones
 * contra un doble del cliente HTTP.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const llamadas = [];

vi.mock("@/lib/iconics/apiClient.js", () => ({
  fetchIconicsBatch: vi.fn(),
  fetchIconicsHistory: vi.fn(async (pointName, rango) => {
    llamadas.push({ pointName, ...rango });
    return { ok: true, data: respuestas[pointName] ?? [] };
  }),
}));

/** Respuestas por punto que devuelve el doble. La rellena cada prueba. */
let respuestas = {};

const { createRealTransport } = await import("@/lib/iconics/transport.js");

const meta = { areaId: "LIN", machineId: "1" };
const punto = (prop) => `hda:\\Configuration\\RESONAC\\LIN\\1:${prop}`;

const muestra = (hora, value) => ({ timestamp: `2026-07-30T${hora}:00:00-06:00`, value, quality: 0 });

beforeEach(() => {
  llamadas.length = 0;
  respuestas = {};
});

describe("readDay", () => {
  it("pide el día LOCAL completo, no el día UTC", async () => {
    await createRealTransport().readDay(meta, "2026-07-30");

    const oee = llamadas.find((l) => l.pointName === punto("OEE"));
    // Con desplazamiento explícito: mandarlo en UTC movería la frontera
    // del día y devolvería las últimas horas del día anterior.
    expect(oee.startDate).toMatch(/^2026-07-30T00:00:00[+-]\d{2}:\d{2}$/);
    expect(oee.endDate).toMatch(/^2026-07-31T00:00:00[+-]\d{2}:\d{2}$/);
  });

  it("pide los siete tags con Interpolative, una sola petición cada uno", async () => {
    await createRealTransport().readDay(meta, "2026-07-30");

    // Siete tags, siete llamadas: ni una más. La versión anterior hacía
    // una ronda extra solo para el cierre de los contadores.
    expect(llamadas).toHaveLength(7);
    for (const l of llamadas) {
      expect(l).toMatchObject({ aggregate: "Interpolative", interval: "01:00:00" });
    }
  });

  it("NO usa Average: desborda en los tags que pueden traer Infinity", async () => {
    // `OEE_Cal` = Pz_OK / Prod_Real_Total sin proteger la división, y `OEE`
    // la multiplica. Con `Average`, el historiador responde 500 a esos dos
    // —verificado contra el servidor— mientras que `Interpolative` no suma
    // y los devuelve sin problema.
    await createRealTransport().readDay(meta, "2026-07-30");

    expect(llamadas.some((l) => l.aggregate === "Average")).toBe(false);
  });

  it("empareja los tags por marca de tiempo, no por posición", async () => {
    // `OEE_Rend` se queda sin la muestra de las 09:00. Con emparejado
    // posicional, su valor de las 10:00 acabaría en la fila de las 09:00
    // y toda la serie quedaría desplazada sin avisar.
    respuestas = {
      [punto("OEE")]: [muestra("08", 60), muestra("09", 65), muestra("10", 70)],
      [punto("OEE_Disp")]: [muestra("08", 80), muestra("09", 82), muestra("10", 84)],
      [punto("OEE_Rend")]: [muestra("08", 90), muestra("10", 92)],
      [punto("OEE_Cal")]: [muestra("08", 95), muestra("09", 95), muestra("10", 95)],
    };

    const { serie } = await createRealTransport().readDay(meta, "2026-07-30");

    expect(serie).toHaveLength(3);
    expect(serie[1].rendimiento).toBeNull();
    expect(serie[2].rendimiento).toBe(92);
  });

  it("suma los incrementos del contador, que se REINICIA con el turno", async () => {
    // Datos con la forma real del 28-jul: sube hasta 1551 y a las 07:00
    // arranca de nuevo en 48 con el cambio de turno. Tomar el último
    // valor daría 594 piezas cuando se hicieron más de dos mil.
    respuestas = {
      [punto("Pz_OK")]: [
        muestra("00", 727), muestra("01", 871), muestra("06", 1551),
        muestra("07", 48), muestra("12", 594), muestra("23", 594),
      ],
    };

    const { cierre } = await createRealTransport().readDay(meta, "2026-07-30");

    // 1551 del primer turno + 594 del segundo.
    expect(cierre.aprobadas).toBe(2145);
    // Un contador sin muestras es un hueco, no un cero.
    expect(cierre.rechazadas).toBeNull();
  });

  it("no dibuja horas que aún no han ocurrido", async () => {
    // `Interpolative` rellena TODOS los buckets del rango repitiendo el
    // último valor: en el día en curso eso inventa una recta desde ahora
    // hasta las 23:00.
    const ahora = new Date();
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
    const enHoras = (n) => {
      const d = new Date(ahora);
      d.setHours(d.getHours() + n, 0, 0, 0);
      return { timestamp: d.toISOString(), value: 70, quality: 0 };
    };

    respuestas = { [punto("OEE")]: [enHoras(-2), enHoras(-1), enHoras(2), enHoras(5)] };

    const { serie } = await createRealTransport().readDay(meta, hoy);

    expect(serie).toHaveLength(2);
    expect(serie.every((f) => new Date(f.ts) <= new Date())).toBe(true);
  });

  it("conserva la meseta final de un día PASADO: ahí sí es información", async () => {
    respuestas = { [punto("OEE")]: [muestra("08", 70), muestra("20", 70), muestra("23", 70)] };

    const { serie } = await createRealTransport().readDay(meta, "2026-07-28");

    expect(serie).toHaveLength(3);
  });

  it("un tag que falla no deja la serie entera en blanco", async () => {
    // El primer punto que se pide es `OEE_Disp`; se le hace fallar para
    // comprobar que un tag sin historizar solo se lleva su columna.
    const { fetchIconicsHistory } = await import("@/lib/iconics/apiClient.js");
    fetchIconicsHistory.mockImplementationOnce(async () => { throw new Error("sin historizar"); });

    respuestas = {
      [punto("OEE")]: [muestra("08", 68)],
      [punto("OEE_Rend")]: [muestra("08", 90)],
      [punto("OEE_Cal")]: [muestra("08", 95)],
    };

    const { serie } = await createRealTransport().readDay(meta, "2026-07-30");

    expect(serie).toHaveLength(1);
    expect(serie[0].disponibilidad).toBeNull();
    expect(serie[0].oee).toBe(68);
    expect(serie[0].rendimiento).toBe(90);
  });
});

describe("readDailyOee", () => {
  it("pide DÍA A DÍA: este servidor rechaza los rangos de varios días", async () => {
    respuestas = { [punto("OEE")]: [muestra("08", 60), muestra("09", 70)] };

    const dias = await createRealTransport().readDailyOee(meta, { desde: "2026-07-28", hasta: "2026-07-30" });

    // Tres días → tres peticiones, cada una acotada a su propio día.
    expect(llamadas).toHaveLength(3);
    expect(llamadas.every((l) => l.interval === "01:00:00")).toBe(true);
    expect(llamadas[0].startDate.slice(0, 10)).toBe("2026-07-28");
    expect(llamadas[2].startDate.slice(0, 10)).toBe("2026-07-30");

    // El valor del día es la media de sus puntos: el `Average` del
    // servidor no sirve, así que se promedia aquí.
    expect(dias.map((d) => d.oee)).toEqual([65, 65, 65]);
  });

  it("descarta los días sin valor: el calendario no debe teñirlos", async () => {
    respuestas = { [punto("OEE")]: [muestra("08", null)] };

    const dias = await createRealTransport().readDailyOee(meta, { desde: "2026-07-29", hasta: "2026-07-30" });

    expect(dias).toEqual([]);
  });
});
