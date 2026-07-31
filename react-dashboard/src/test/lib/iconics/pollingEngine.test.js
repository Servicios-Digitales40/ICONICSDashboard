/**
 * pollingEngine.test.js
 * ------------------------------------------------------------------
 * Fase 3.3 del Plan 1: ciclo de vida y presupuesto de red.
 *
 * Las pruebas NO arrancan el motor (`start()`), sino que invocan `poll()`
 * a mano. Así no dependen de temporizadores reales y cada aserción mide
 * exactamente un ciclo.
 */
import { describe, expect, it, vi } from "vitest";
import { createPollingEngine } from "@/lib/iconics/pollingEngine.js";
import { QUALITY_GOOD } from "@/lib/iconics/quality.js";
import { CAOS_ALTO, SIN_CAOS, createFakeTransport } from "@/lib/iconics/fakeTransport.js";

const P1 = "ac:RESONAC/LIN/1/OEE";
const P2 = "ac:RESONAC/LIN/2/OEE";

/** Transporte que responde siempre bien, contando cuántas veces se le llama. */
function transporteContador(valor = 42) {
  const llamadas = [];
  const read = vi.fn(async (points) => {
    llamadas.push(points);
    return new Map(points.map((p) => [p, { value: valor, quality: QUALITY_GOOD }]));
  });
  return { read, llamadas };
}

describe("presupuesto de red", () => {
  it("hace UNA sola petición aunque haya muchos suscriptores", async () => {
    const { read } = transporteContador();
    const engine = createPollingEngine({ read });

    // Diez componentes distintos pidiendo el mismo par de puntos.
    const bajas = Array.from({ length: 10 }, () => engine.acquire([P1, P2]));
    await engine.poll();

    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0]).toHaveLength(2);

    bajas.forEach((b) => b());
    engine.stop();
  });

  it("trocea cuando la unión supera el tamaño máximo de lote", async () => {
    const { read } = transporteContador();
    const engine = createPollingEngine({ read, maxBatch: 50 });

    const puntos = Array.from({ length: 140 }, (_, i) => `ac:RESONAC/LIN/1/T${i}`);
    engine.acquire(puntos);
    await engine.poll();

    // 140 puntos en lotes de 50 → 3 peticiones.
    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls.every(([lote]) => lote.length <= 50)).toBe(true);

    engine.stop();
  });

  it("omite el ciclo si el anterior sigue en vuelo", async () => {
    let resolver;
    const read = vi.fn(() => new Promise((r) => { resolver = r; }));
    const engine = createPollingEngine({ read });

    engine.acquire([P1]);

    const primero = engine.poll();   // se queda colgado
    await engine.poll();             // debe omitirse, no encolarse

    expect(read).toHaveBeenCalledTimes(1);
    expect(engine.stats().omitidos).toBe(1);

    resolver(new Map([[P1, { value: 1, quality: QUALITY_GOOD }]]));
    await primero;
    engine.stop();
  });

  it("no pide nada si no hay puntos registrados", async () => {
    const { read } = transporteContador();
    const engine = createPollingEngine({ read });

    await engine.poll();

    expect(read).not.toHaveBeenCalled();
    engine.stop();
  });
});

describe("conteo de referencias (riesgos R-05 y R-06)", () => {
  it("montar y desmontar 100 veces no deja referencias vivas", async () => {
    const { read } = transporteContador();
    const engine = createPollingEngine({ read });

    for (let i = 0; i < 100; i++) {
      const baja = engine.acquire([P1, P2]);
      baja();
    }

    expect(engine.stats().referencias).toBe(0);

    await engine.poll();
    expect(read).not.toHaveBeenCalled();

    engine.stop();
  });

  it("sobrevive al doble montaje de StrictMode", () => {
    const { read } = transporteContador();
    const engine = createPollingEngine({ read });

    // React 18 en desarrollo: monta, desmonta, vuelve a montar.
    const primera = engine.acquire([P1]);
    primera();
    const segunda = engine.acquire([P1]);

    expect(engine.stats().referencias).toBe(1);

    segunda();
    expect(engine.stats().referencias).toBe(0);
    engine.stop();
  });

  it("la baja es idempotente y no deja el conteo en negativo", () => {
    const { read } = transporteContador();
    const engine = createPollingEngine({ read });

    const a = engine.acquire([P1]);
    const b = engine.acquire([P1]);

    a(); a(); a();   // repetida a propósito
    expect(engine.stats().referencias).toBe(1);

    b();
    expect(engine.stats().referencias).toBe(0);
    engine.stop();
  });
});

describe("calidad y ausencia de dato", () => {
  it("un valor con mala calidad no se entrega como cero", async () => {
    const read = async (points) =>
      new Map(points.map((p) => [p, { value: 0, quality: 64 }])); // uncertain
    const engine = createPollingEngine({ read });

    engine.acquire([P1]);
    await engine.poll();

    const lectura = engine.get(P1);
    expect(lectura.ok).toBe(false);
    expect(lectura.value).toBeNull();

    engine.stop();
  });

  it("conserva el último valor bueno y solo lo marca rancio tras N ciclos", async () => {
    let responder = true;
    const read = async (points) =>
      responder ? new Map(points.map((p) => [p, { value: 7, quality: QUALITY_GOOD }])) : new Map();

    const engine = createPollingEngine({ read, staleAfterCycles: 3 });
    engine.acquire([P1]);

    await engine.poll();
    expect(engine.get(P1).value).toBe(7);

    responder = false;
    await engine.poll();
    await engine.poll();
    // Dos huecos: aún se conserva el valor y NO se declara rancio.
    expect(engine.get(P1).stale).toBe(false);

    await engine.poll();
    expect(engine.get(P1).stale).toBe(true);

    engine.stop();
  });
});

describe("backoff exponencial", () => {
  it("crece ante fallos consecutivos y se reinicia al primer éxito", async () => {
    let fallar = true;
    const read = async (points) => {
      if (fallar) throw new Error("servidor caído");
      return new Map(points.map((p) => [p, { value: 1, quality: QUALITY_GOOD }]));
    };

    const engine = createPollingEngine({ read, intervalMs: 1000, backoffMaxMs: 8000 });
    engine.acquire([P1]);

    expect(engine.stats().proximoRetardoMs).toBe(1000);

    await engine.poll();
    expect(engine.stats().proximoRetardoMs).toBe(2000);
    await engine.poll();
    expect(engine.stats().proximoRetardoMs).toBe(4000);
    await engine.poll();
    expect(engine.stats().proximoRetardoMs).toBe(8000);
    await engine.poll();
    // Tope respetado: no sigue creciendo.
    expect(engine.stats().proximoRetardoMs).toBe(8000);

    fallar = false;
    await engine.poll();
    expect(engine.stats().proximoRetardoMs).toBe(1000);
    expect(engine.stats().ultimoError).toBeNull();

    engine.stop();
  });
});

describe("consciencia de visibilidad", () => {
  it("con la pestaña oculta no agenda lecturas", async () => {
    const { read } = transporteContador();
    let visible = false;
    const visibility = { esVisible: () => visible, suscribir: () => () => {} };

    const engine = createPollingEngine({ read, visibility, coalesceMs: 0 });
    engine.acquire([P1]);
    engine.start();

    await new Promise((r) => setTimeout(r, 30));
    expect(read).not.toHaveBeenCalled();
    expect(engine.stats().visible).toBe(false);

    engine.stop();
  });
});

describe("integración con el transporte falso", () => {
  it("sin caos entrega todos los puntos con calidad buena", async () => {
    const transporte = createFakeTransport({ chaos: SIN_CAOS });
    const engine = createPollingEngine({ read: transporte.read });

    engine.acquire([P1, P2]);
    await engine.poll();

    expect(engine.get(P1).ok).toBe(true);
    expect(typeof engine.get(P1).value).toBe("number");

    engine.stop();
  });

  it("con caos alto degrada sin lanzar excepciones", async () => {
    // Sin latencia: aquí se mide el comportamiento degradado, no la espera.
    const transporte = createFakeTransport({
      chaos: { ...CAOS_ALTO, latenciaMs: 0 },
      seed: "caos",
    });
    const engine = createPollingEngine({ read: transporte.read });

    engine.acquire([P1, P2]);

    // Varios ciclos: unos fallarán enteros, otros traerán huecos o mala
    // calidad. Ninguno debe propagar una excepción al llamante.
    const degradaciones = [];
    for (let i = 0; i < 20; i++) {
      await expect(engine.poll()).resolves.not.toThrow();
      const l = engine.get(P1);
      if (!l.ok || l.stale) degradaciones.push(i);
    }

    // La lectura siempre está bien formada, haya dato o no.
    const lectura = engine.get(P1);
    expect(lectura).toHaveProperty("ok");
    expect(lectura).toHaveProperty("stale");
    expect(lectura).toHaveProperty("receivedAt");

    // Y el caos alto tiene que haber ejercitado ALGÚN camino degradado:
    // si no, la prueba no estaría probando nada. No se afina más porque
    // el reparto exacto depende de la semilla, y una prueba que depende
    // de la semilla del generador es una prueba que falla sola algún día.
    expect(degradaciones.length).toBeGreaterThan(0);

    engine.stop();
  });
});
