/**
 * estado-maquina.test.js
 * ------------------------------------------------------------------
 * La FORMA COMÚN: que toda máquina cuente cómo está de la misma manera.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * Porque de esta forma cuelgan ahora el asistente, los informes y —cuando
 * llegue— la predicción de fallos. Antes había dos formas de dominio, una por
 * máquina, y el precio se veía en el catálogo de herramientas: ocho para el
 * tanque y una para vibraciones, no porque faltaran por escribir sino porque
 * cada una estaba escrita contra una forma concreta.
 *
 * Se recorre `SISTEMAS` en bucle, sin nombrar máquinas: la que se dé de alta
 * mañana queda cubierta el día que se añada.
 *
 * ── LO QUE MÁS SE VIGILA AQUÍ ──────────────────────────────────────
 *
 * Que normalizar no pierda lo que no es un valor: los puntos mudos, el reposo
 * y la diferencia entre «en banda» y «sin criterio». Son las tres cosas que se
 * caen primero al aplanar dos dominios en uno, y las tres convierten una
 * pantalla ciega en una pantalla verde.
 */
import { describe, expect, it } from "vitest";

import { SISTEMAS, historizadasDe, tieneHistoria } from "@shared/eva/sistemas.js";
import { contar, estaMuda } from "@shared/eva/estadoMaquina.js";

/** Reloj fijo: ninguna prueba puede depender de cuándo se ejecute. */
const T0 = Date.UTC(2026, 7, 27, 9, 0, 0);

/** El estado de una máquina servido por su propio simulador. */
const estadoDe = (sistema, ms = T0) =>
  sistema.estado(
    (punto) => {
      const v = sistema.modelo(punto, ms);
      return v === undefined ? null : v;
    },
    sistema,
    new Date(ms).toISOString(),
  );

const casos = SISTEMAS.map((s) => [s.id, s]);

describe("toda máquina produce la forma común", () => {
  it.each(casos)("«%s» trae los campos que la forma promete", (id, sistema) => {
    const e = estadoDe(sistema);

    expect(e.sistema).toBe(id);
    expect(e.nombre).toBe(sistema.nombre);
    expect(e.plc).toBe(sistema.plc);
    expect(Array.isArray(e.senales)).toBe(true);
    expect(e.senales.length).toBeGreaterThan(0);
    expect(Array.isArray(e.grupos)).toBe(true);
    expect(Array.isArray(e.sinLectura)).toBe(true);
    expect(Number.isFinite(e.puntosPedidos)).toBe(true);
    expect(Array.isArray(e.limitaciones)).toBe(true);
  });

  it.each(casos)("«%s»: cada señal está completa y no miente sobre su estado", (id, sistema) => {
    for (const s of estadoDe(sistema).senales) {
      expect(typeof s.clave).toBe("string");
      expect(typeof s.label).toBe("string");
      expect(s.tag).toMatch(/^(ac|ae|hda):/);

      /*
       * `null` en `estado` significa «no hay criterio», y es distinto de
       * `nominal`. La mayoría de las medidas de vibración están así porque sólo
       * la velocidad eficaz tiene norma detrás; marcarlas «en banda» sería
       * inventar una autoridad que nadie tiene.
       */
      expect([null, "nominal", "atencion", "critico", "sin_dato", "reposo"]).toContain(s.estado);

      // Y la regla que no admite excepción: sin valor, el estado es sin_dato.
      if (s.valor === null) expect(s.estado).toBe("sin_dato");
    }
  });

  it.each(casos)("«%s»: cada señal pertenece a un grupo declarado", (id, sistema) => {
    const e = estadoDe(sistema);
    const declarados = new Set(e.grupos.map((g) => g.id));
    for (const s of e.senales) {
      if (s.grupo !== null) expect(declarados.has(s.grupo)).toBe(true);
    }
  });

  it.each(casos)("«%s»: las claves de sus señales son únicas", (id, sistema) => {
    // En vibraciones la misma medida existe tres veces, una por apoyo. Si las
    // claves colisionaran, quien las indexe se quedaría con un apoyo y
    // perdería dos, sin que nada lo delatara.
    const claves = estadoDe(sistema).senales.map((s) => s.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });
});

describe("la forma común no pierde lo que no es un valor", () => {
  it("el recuento cuenta las cosas por separado, sin deducir unas de otras", () => {
    const senales = [
      { valor: 1, estado: "nominal" },
      { valor: 2, estado: "atencion" },
      { valor: 3, estado: "critico" },
      { valor: 4, estado: "reposo" },
      { valor: null, estado: "sin_dato" },
      { valor: 6, estado: null },
    ];
    expect(contar(senales)).toEqual({
      senales: 6,
      conMedicion: 5,
      enBanda: 1,
      enAviso: 1,
      fueraDeLimite: 1,
      enReposo: 1,
      sinDato: 1,
    });
  });

  it("una señal SIN CRITERIO no se cuenta como «en banda»", () => {
    // Es la trampa de esta normalización: sumar `null` a `nominal` daría un
    // recuento redondo y una pantalla verde sobre medidas que nadie acota.
    expect(contar([{ valor: 5.4, estado: null }]).enBanda).toBe(0);
  });

  it("`estaMuda` distingue una máquina tranquila de una callada", () => {
    expect(estaMuda({ puntosPedidos: 73, sinLectura: new Array(40) })).toBe(true);
    expect(estaMuda({ puntosPedidos: 73, sinLectura: new Array(2) })).toBe(false);
    // Sin haber pedido nada todavía no se puede afirmar que esté callada.
    expect(estaMuda({ puntosPedidos: 0, sinLectura: [] })).toBe(false);
  });

  it.each(casos)("«%s»: los puntos mudos viajan en el estado, no se pierden", (id, sistema) => {
    const e = estadoDe(sistema);

    // Todo lo que está en `sinLectura` es un punto real de esa máquina.
    const suyos = new Set(sistema.puntos());
    for (const p of e.sinLectura) expect(suyos.has(p)).toBe(true);

    /*
     * `sinLectura` cuenta PUNTOS y `recuento.sinDato` cuenta SEÑALES, y no son
     * lo mismo: vibraciones pide 73 puntos y publica 28 señales, porque sus
     * banderas, vigilancias, confianzas y estado de sensor son diagnóstico del
     * módulo y no medidas — viajan en `dominio`, donde las esperan sus reglas.
     *
     * Por eso el primero es siempre mayor o igual que el segundo. La
     * desigualdad se afirma en ese sentido a propósito: al revés significaría
     * que hay señales sin dato cuyo punto nadie apuntó como mudo, que es
     * exactamente cómo se pierde la mitad de la información al normalizar.
     */
    expect(e.sinLectura.length).toBeGreaterThanOrEqual(e.recuento.sinDato);
    expect(e.puntosPedidos).toBeGreaterThanOrEqual(e.senales.length);
  });
});

describe("la historia se declara en el registro", () => {
  it.each(casos)("«%s» dice qué se puede pedir de su pasado", (id, sistema) => {
    /*
     * El punto 3 del alta de una máquina: siempre habrá al menos una señal
     * historizada, salvo cuando el servidor todavía no la entregue. Las dos
     * situaciones son válidas; lo que no vale es el silencio, porque se lee
     * como que sí las tiene.
     */
    expect(typeof sistema.series.nota).toBe("string");
    expect(sistema.series.nota.length).toBeGreaterThan(0);
    expect(typeof sistema.series.ruta).toBe("string");

    const claves = historizadasDe(id);
    expect(Array.isArray(claves)).toBe(true);
    expect(tieneHistoria(id)).toBe(claves.length > 0);
  });

  it.each(casos)("«%s»: lo historizado es realmente suyo", (id, sistema) => {
    // Una clave que no es de esta máquina en su lista de historizadas haría que
    // se pidiera la serie de otra instalación — con marcas de tiempo correctas
    // y sin dar error, que es como se ve este fallo.
    const suyas = new Set(sistema.claves());
    for (const clave of historizadasDe(id)) expect(suyas.has(clave)).toBe(true);
  });

  it("una máquina sin historia lo dice, en vez de callar", () => {
    const sinHistoria = SISTEMAS.filter((s) => !tieneHistoria(s.id));
    for (const s of sinHistoria) {
      expect(s.series.nota).toMatch(/\S/);
      // Y no declara mecanismos de desgaste: sin histórico no hay exposición
      // acumulada que contar, y un pronóstico sobre el instante es adivinación.
      expect(s.desgaste).toBeNull();
    }
  });
});
