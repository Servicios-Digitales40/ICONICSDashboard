/**
 * fuente.test.js
 * ------------------------------------------------------------------
 * El camino de datos de Demo EVA, de punta a punta, con un transporte de
 * mentira: registro de puntos → motor de polling → filtro de calidad →
 * `createSistema` → búfer rodante.
 *
 * ── POR QUÉ CON UN TRANSPORTE DE MENTIRA Y NO CONTRA EL SERVIDOR ───
 *
 * Porque lo que se prueba aquí son propiedades que el servidor no puede
 * demostrar: qué pasa cuando la calidad es MALA, cuando un punto desaparece o
 * cuando dos vistas se suscriben a la vez. Contra un servidor sano esas ramas
 * no se ejecutan nunca — y son justo las que rompen la pantalla.
 *
 * De hecho, mientras se escribía esto el servidor pasó a devolver mala calidad
 * en TODOS sus árboles, Resonac incluido. Esta prueba siguió pasando, que es
 * exactamente para lo que está.
 *
 * La prueba contra el servidor real existe y es otra:
 * `src/test/live/eva.live.test.js`, que sólo corre con `LIVE=1`.
 */
import { describe, expect, it, vi } from "vitest";

import { createEvaSource } from "@/Demo-EVA/data/evaSource.js";
import { SENAL_KEYS, TODOS_LOS_PUNTOS, pointName } from "@/Demo-EVA/domain/senales.js";
import { createBufferRodante } from "@/Demo-EVA/lib/buffer.js";
import { createSistema } from "@/Demo-EVA/domain/sistema.js";

/** Calidad buena de OPC. Cualquier otra cosa es ausencia de dato. */
const BUENA = 0;
/** La que devolvía el servidor real el 17-ago cuando dejó de entregar datos. */
const MALA = 2147483659;

/**
 * Transporte de mentira: devuelve lo que se le diga, y cuenta las llamadas.
 * Se le pasan valores por CLAVE de dominio, no por nombre de punto, para que la
 * prueba no tenga que repetir el catálogo.
 */
function transporteFalso(valoresPorClave, { calidad = BUENA } = {}) {
  const llamadas = [];

  return {
    llamadas,
    read: vi.fn(async (puntos) => {
      llamadas.push(puntos);
      const salida = new Map();
      for (const clave of SENAL_KEYS) {
        const punto = pointName(clave);
        if (!puntos.includes(punto)) continue;
        if (!(clave in valoresPorClave)) continue;
        salida.set(punto, { value: valoresPorClave[clave], quality: calidad });
      }
      return salida;
    }),
  };
}

const EN_MARCHA = {
  nivelTanque: 62.4,
  temperaturaTanque: 21.8,
  cargaMotor: 58,
  modoVdf: false,
  flujoInstantaneo: 24.6,
  presionRelativa: 3.4,
  tensionLinea: 121.2,
  eficienciaEnergetica: 76,
};

/** Suscribe, dispara un ciclo a mano y devuelve la última instantánea. */
async function unaLectura(source) {
  let ultima = null;
  const baja = source.subscribeSistema((s) => { ultima = s; });

  // El motor agrupa las altas en una ventana de 250 ms; se le da tiempo y
  // luego se comprueba. Se usan temporizadores reales porque el motor los usa
  // por dentro y falsearlos aquí probaría el reloj, no la fuente.
  await new Promise((r) => setTimeout(r, 400));

  return { ultima, baja };
}

describe("la fuente registra y lee lo que debe", () => {
  it("un ciclo pide los ocho puntos en UNA sola petición", async () => {
    const transport = transporteFalso(EN_MARCHA);
    const source = createEvaSource({ transport, intervalMs: 60_000 });

    const { ultima, baja } = await unaLectura(source);

    expect(transport.read).toHaveBeenCalledTimes(1);
    expect(transport.llamadas[0].sort()).toEqual([...TODOS_LOS_PUNTOS].sort());
    expect(ultima.sistema.resumen.medidas).toBe(8);

    baja();
    source.stop();
  });

  it("al darse de baja el último suscriptor, deja de haber puntos que sondear", async () => {
    const transport = transporteFalso(EN_MARCHA);
    const source = createEvaSource({ transport, intervalMs: 60_000 });

    const { baja } = await unaLectura(source);
    expect(source.stats().referencias).toBe(8);

    baja();
    expect(source.stats().referencias).toBe(0);

    source.stop();
  });

  it("dos suscriptores comparten una sola lectura, no dos", async () => {
    // Es la razón de ser del provider: la vista de Planta monta ocho tarjetas y
    // no puede abrir ocho motores para leer los mismos ocho puntos.
    const transport = transporteFalso(EN_MARCHA);
    const source = createEvaSource({ transport, intervalMs: 60_000 });

    const a = source.subscribeSistema(() => {});
    const b = source.subscribeSistema(() => {});
    await new Promise((r) => setTimeout(r, 400));

    expect(transport.read).toHaveBeenCalledTimes(1);
    expect(source.stats().referencias).toBe(8);

    a();
    b();
    source.stop();
  });
});

describe("la mala calidad es ausencia de dato, nunca un cero", () => {
  it("con todo en mala calidad el sistema queda «sin dato», no en crítico", async () => {
    // Es el estado real del servidor el 17-ago-2026 a las 19:33 UTC. La
    // pantalla tiene que decir «no sé», no «la planta se ha roto».
    const transport = transporteFalso(EN_MARCHA, { calidad: MALA });
    const source = createEvaSource({ transport, intervalMs: 60_000 });

    const { ultima, baja } = await unaLectura(source);

    expect(ultima.sistema.estado).toBe("sin_dato");
    expect(ultima.sistema.resumen.medidas).toBe(0);
    expect(ultima.sistema.resumen.fueraDeLimite).toBe(0);
    for (const s of ultima.sistema.lista) {
      expect(s.valor, s.key).toBeNull();
      expect(s.estado, s.key).toBe("sin_dato");
    }

    baja();
    source.stop();
  });

  it("un punto que no viene no borra el resto", async () => {
    const { nivelTanque, ...sinNivel } = EN_MARCHA;
    const transport = transporteFalso(sinNivel);
    const source = createEvaSource({ transport, intervalMs: 60_000 });

    const { ultima, baja } = await unaLectura(source);

    expect(ultima.sistema.senales.nivelTanque.estado).toBe("sin_dato");
    expect(ultima.sistema.senales.temperaturaTanque.valor).toBeCloseTo(21.8, 5);
    expect(ultima.sistema.resumen.medidas).toBe(7);

    baja();
    source.stop();
  });
});

describe("el búfer rodante", () => {
  const instantanea = (valores, ms) => ({
    ...createSistema(
      Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, { value: v }]))
    ),
    receivedAt: new Date(ms),
  });

  it("deduplica por marca de tiempo", () => {
    // El motor notifica en cada ciclo y la fuente emite además al suscribirse;
    // sin deduplicar, la serie mostraría una meseta que nunca ocurrió.
    const b = createBufferRodante();
    const s = instantanea(EN_MARCHA, 1000);

    expect(b.push(s)).toBe(true);
    expect(b.push(s)).toBe(false);
    expect(b.estado().muestras).toBe(1);
  });

  it("ignora las instantáneas sin ninguna lectura", () => {
    const b = createBufferRodante();
    expect(b.push(createSistema({}))).toBe(false);
    expect(b.estado().muestras).toBe(0);
  });

  it("descarta los huecos en vez de dibujarlos como ceros", () => {
    const b = createBufferRodante();
    b.push(instantanea({ nivelTanque: 50 }, 1000));
    b.push(instantanea({ nivelTanque: null }, 2000));
    b.push(instantanea({ nivelTanque: 52 }, 3000));

    // Tres muestras en el búfer, dos puntos en la serie: el hueco no es un 0.
    expect(b.estado().muestras).toBe(3);
    expect(b.serie("nivelTanque")).toEqual([50, 52]);
  });

  it("no crece sin límite, y conserva las muestras más nuevas", () => {
    const b = createBufferRodante({ maxPuntos: 3 });
    for (let i = 1; i <= 6; i++) b.push(instantanea({ nivelTanque: i }, i * 1000));

    expect(b.estado().muestras).toBe(3);
    expect(b.serie("nivelTanque")).toEqual([4, 5, 6]);
  });

  it("`serie` recorta a los N más recientes", () => {
    const b = createBufferRodante();
    for (let i = 1; i <= 10; i++) b.push(instantanea({ nivelTanque: i }, i * 1000));
    expect(b.serie("nivelTanque", { puntos: 3 })).toEqual([8, 9, 10]);
  });
});
