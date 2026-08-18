/**
 * dominio.test.js
 * ------------------------------------------------------------------
 * El contrato del dominio de Demo EVA: catálogo, activos, umbrales y sistema.
 *
 * ── QUÉ SE VERIFICA AQUÍ, Y POR QUÉ ────────────────────────────────
 *
 * Casi nada de esto puede «fallar» en el sentido de reventar: son tablas y
 * comparaciones. Lo que se protege son cuatro reglas que se erosionan solas y
 * que no rompen el build cuando se rompen:
 *
 *  1. **Ninguna señal sin serie propia puede colarse como historizada.** Es la
 *     regla dura del módulo: el historiador devuelve la curva de la temperatura
 *     del tanque para tres tags que no son la temperatura, sin dar error. Ver
 *     `domain/senales.js` y `docs/PLAN-8-DEMO-EVA.md` §1.3.
 *  2. **Un hueco nunca se convierte en cero ni en un estado tranquilizador.**
 *  3. **El reposo silencia sólo lo que debe.** Sin esta regla la demo abre en
 *     rojo permanente; con ella de más, taparía una avería real.
 *  4. **El vocabulario es el suyo y no el de un tablero de OEE.** Hubo un
 *     segundo juego de estados —`running`, `alarma`— mientras convivió el
 *     tablero de Resonac, y esta prueba comprobaba que no colisionaran. Aquel
 *     se fue con su sección; lo que queda es que estos estados digan lo que
 *     esta instalación necesita decir, empezando por distinguir un hueco.
 */
import { describe, expect, it } from "vitest";

import {
  RAIZ,
  SENALES,
  SENAL_KEYS,
  esHistorizada,
  historizadas,
  parsePointName,
  pointName,
} from "@/Demo-EVA/domain/senales.js";
import { ACTIVOS, ACTIVO_IDS } from "@/Demo-EVA/domain/activos.js";
import { ESTADOS, ESTADOS_ORDEN, enReposo, estadoDeSenal, peor } from "@/Demo-EVA/domain/estado.js";
import { UMBRALES, bandaDe, margenConsumido } from "@/Demo-EVA/domain/umbrales.js";
import { SISTEMA_VACIO, createSistema, toBooleano } from "@/Demo-EVA/domain/sistema.js";

/**
 * Lectura del servidor real del 17-ago-2026, con el sistema en reposo. Es la
 * referencia contra la que se comprueba que la pantalla en reposo se LEE como
 * reposo y no como avería.
 */
const REAL_EN_REPOSO = {
  nivelTanque: { value: 51.53717803955078 },
  temperaturaTanque: { value: 24.51171875 },
  cargaMotor: { value: 0 },
  modoVdf: { value: false },
  flujoInstantaneo: { value: -0.03978588059544563 },
  presionRelativa: { value: -0.8355035185813904 },
  tensionLinea: { value: 122.11435953776042 },
  eficienciaEnergetica: { value: 0 },
};

describe("catálogo de señales", () => {
  it("son las ocho del servidor, y sus puntos cuelgan de la raíz de la demo", () => {
    expect(SENAL_KEYS).toHaveLength(8);
    for (const key of SENAL_KEYS) {
      expect(pointName(key).startsWith(RAIZ), `${key} fuera de la raíz`).toBe(true);
    }
  });

  it("cada señal declara lo que la interfaz necesita para pintarla", () => {
    for (const key of SENAL_KEYS) {
      const s = SENALES[key];
      expect(typeof s.tag, key).toBe("string");
      expect(typeof s.label, key).toBe("string");
      expect(typeof s.corto, key).toBe("string");
      expect(["real", "booleano"], key).toContain(s.tipo);
      expect(typeof s.historizado, key).toBe("boolean");
      // Toda señal real necesita escala, o la geometría (barras, arcos, el
      // líquido del tanque) no tendría contra qué normalizar.
      if (s.tipo === "real") expect(s.escala, key).toMatchObject({ min: expect.any(Number), max: expect.any(Number) });
    }
  });

  it("SOLO las cuatro verificadas están marcadas como historizadas", () => {
    // Medido contra el servidor: a las otras tres el historiador les devuelve
    // la serie de STEMPERATURA_TANQUE. Si alguien marca una de más, la vista
    // pintaría la curva de la temperatura con otro rótulo y nadie lo notaría.
    expect(historizadas().sort()).toEqual(
      ["flujoInstantaneo", "nivelTanque", "presionRelativa", "temperaturaTanque"].sort()
    );

    for (const key of ["cargaMotor", "eficienciaEnergetica", "tensionLinea", "modoVdf"]) {
      expect(esHistorizada(key), `${key} NO tiene serie propia en el historiador`).toBe(false);
    }
  });

  it("las señales con unidad o nombre dudosos lo confiesan", () => {
    // Si alguien «limpia» estas notas, la interfaz dejaría de advertir de que
    // la unidad o el rótulo son una lectura nuestra y no del servidor.
    for (const key of ["flujoInstantaneo", "presionRelativa", "tensionLinea", "modoVdf"]) {
      expect(SENALES[key].nota, `${key} sin nota de procedencia`).toBeTruthy();
    }
  });

  it("parsePointName es el inverso exacto, y rechaza lo que no reconoce", () => {
    for (const key of SENAL_KEYS) expect(parsePointName(pointName(key))).toBe(key);

    for (const basura of [
      "",
      null,
      undefined,
      "ac:RESONAC/LIN/1/OEE",
      `${RAIZ}TAG_QUE_NO_EXISTE`,
      "ac:TDCON/DEMO/OTRA/SNIVEL_TANQUE",
    ]) {
      expect(parsePointName(basura), String(basura)).toBeNull();
    }
  });

  it("el punto del modo del variador conserva sus espacios", () => {
    // El nombre real lleva espacios («Modo AM VDF») y el lote los admite porque
    // el cliente codifica cada punto por separado. Sanearlos aquí rompería la
    // lectura contra el servidor.
    expect(pointName("modoVdf")).toBe("ac:TDCON/DEMO/SENSORES/Modo AM VDF");
  });
});

describe("activos", () => {
  it("cada señal pertenece a exactamente un activo, y ninguno queda vacío", () => {
    const repartidas = ACTIVO_IDS.flatMap((id) => ACTIVOS[id].senales);
    expect(repartidas.sort()).toEqual([...SENAL_KEYS].sort());
    expect(new Set(repartidas).size).toBe(SENAL_KEYS.length);
    for (const id of ACTIVO_IDS) expect(ACTIVOS[id].senales.length, id).toBeGreaterThan(0);
  });
});

describe("umbrales y bandas", () => {
  it("un hueco no cae en ninguna banda: no se afirma nada sobre lo que no se midió", () => {
    for (const v of [null, undefined, NaN, Infinity]) {
      expect(bandaDe("nivelTanque", v)).toBeNull();
      expect(margenConsumido("nivelTanque", v)).toBeNull();
    }
  });

  it("los tres tramos de una banda con los dos lados acotados", () => {
    expect(bandaDe("nivelTanque", 50)).toBe("nominal");
    expect(bandaDe("nivelTanque", 20)).toBe("atencion");
    expect(bandaDe("nivelTanque", 92)).toBe("atencion");
    expect(bandaDe("nivelTanque", 10)).toBe("critico");
    expect(bandaDe("nivelTanque", 99)).toBe("critico");
  });

  it("un extremo `null` es «sin límite», no un cero", () => {
    // cargaMotor no tiene mínimo: un motor descargado está ocioso, no en falta.
    expect(UMBRALES.cargaMotor.min).toBeNull();
    expect(bandaDe("cargaMotor", 0)).toBe("nominal");
    expect(bandaDe("cargaMotor", 99)).toBe("critico");

    // eficienciaEnergetica no tiene máximo: más eficiencia nunca es problema.
    expect(UMBRALES.eficienciaEnergetica.max).toBeNull();
    expect(bandaDe("eficienciaEnergetica", 100)).toBe("nominal");
  });

  it("una señal sin umbrales declarados está en banda mientras haya lectura", () => {
    expect(bandaDe("modoVdf", 1)).toBe("nominal");
    expect(margenConsumido("modoVdf", 1)).toBe(0);
  });

  it("el margen consumido crece hacia el límite duro y ordena por gravedad", () => {
    // Centro de la banda cómoda del nivel: (25 + 90) / 2 = 57.5
    expect(margenConsumido("nivelTanque", 57.5)).toBeCloseTo(0, 6);
    // En el límite duro inferior (15) se ha consumido el margen entero.
    expect(margenConsumido("nivelTanque", 15)).toBeCloseTo(100, 6);
    expect(margenConsumido("nivelTanque", 95)).toBeCloseTo(100, 6);
    // Y por fuera pasa de 100, para que el orden se conserve.
    expect(margenConsumido("nivelTanque", 5)).toBeGreaterThan(100);
  });
});

describe("estado derivado", () => {
  it("«sin dato» es más grave que «en banda»: un hueco no es una tranquilidad", () => {
    expect(ESTADOS.sin_dato.orden).toBeLessThan(ESTADOS.nominal.orden);
    expect(peor(["nominal", "sin_dato"])).toBe("sin_dato");
    expect(peor(["nominal", "atencion", "critico"])).toBe("critico");
    // Sin señales no se puede afirmar que algo esté bien.
    expect(peor([])).toBe("sin_dato");
    expect(ESTADOS_ORDEN[0]).toBe("critico");
  });

  it("el reposo exige medir las dos señales, no suponerlas", () => {
    expect(enReposo({ cargaMotor: 0, flujoInstantaneo: -0.04 })).toBe(true);
    expect(enReposo({ cargaMotor: 40, flujoInstantaneo: 20 })).toBe(false);
    // No saber si la bomba está en marcha NO es lo mismo que saber que está
    // parada, y la diferencia importa porque el reposo silencia media planta.
    expect(enReposo({ cargaMotor: null, flujoInstantaneo: -0.04 })).toBe(false);
    expect(enReposo({})).toBe(false);
  });

  it("el reposo silencia sólo las señales de marcha", () => {
    // El caudal en reposo no significa nada…
    expect(estadoDeSenal("flujoInstantaneo", -0.04, { reposo: true })).toBe("reposo");
    expect(estadoDeSenal("cargaMotor", 0, { reposo: true })).toBe("reposo");
    // …pero el nivel del tanque y la tensión importan MÁS con la planta parada.
    expect(estadoDeSenal("nivelTanque", 8, { reposo: true })).toBe("critico");
    expect(estadoDeSenal("tensionLinea", 122.1, { reposo: true })).toBe("nominal");
  });

  it("sin lectura, cualquier señal es «sin dato» y nunca otra cosa", () => {
    for (const key of SENAL_KEYS) {
      expect(estadoDeSenal(key, null), key).toBe("sin_dato");
      expect(estadoDeSenal(key, undefined), key).toBe("sin_dato");
    }
  });
});

describe("construcción del sistema", () => {
  it("el sistema vacío existe, y todo dentro dice «sin dato»", () => {
    expect(SISTEMA_VACIO.lista).toHaveLength(8);
    expect(SISTEMA_VACIO.estado).toBe("sin_dato");
    expect(SISTEMA_VACIO.resumen.medidas).toBe(0);
    expect(SISTEMA_VACIO.receivedAt).toBeNull();
    for (const s of SISTEMA_VACIO.lista) expect(s.valor, s.key).toBeNull();
  });

  it("un booleano falso es una lectura, no un hueco", () => {
    // `toNumber(false)` daría 0, y «modo automático» pasaría a ser
    // indistinguible de «modo sin leer».
    expect(toBooleano(false)).toBe(false);
    expect(toBooleano(null)).toBeNull();
    expect(toBooleano("true")).toBe(true);
    expect(toBooleano("cualquier cosa")).toBeNull();

    const s = createSistema({ modoVdf: { value: false } }).senales.modoVdf;
    expect(s.valor).toBe(false);
    expect(s.estado).toBe("nominal");
    expect(s.texto).toBe("Automático");
  });

  it("con la lectura real del servidor, el sistema se lee como reposo y no como avería", () => {
    const sistema = createSistema(REAL_EN_REPOSO);

    expect(sistema.enReposo).toBe(true);
    // Las cuatro señales de marcha quedan en reposo…
    for (const key of ["flujoInstantaneo", "presionRelativa", "cargaMotor", "eficienciaEnergetica"]) {
      expect(sistema.senales[key].estado, key).toBe("reposo");
    }
    // …y ninguna señal está en crítico, que es lo que haría abrir la demo en rojo.
    expect(sistema.resumen.fueraDeLimite).toBe(0);
    expect(sistema.senales.nivelTanque.estado).toBe("nominal");
    expect(sistema.senales.temperaturaTanque.estado).toBe("nominal");
    expect(sistema.senales.tensionLinea.estado).toBe("nominal");
  });

  it("la banda cruda se conserva junto al estado, aunque el reposo la silencie", () => {
    // El caudal negativo SÍ está fuera de su banda; lo que decimos es que ahora
    // mismo eso no significa nada. La tarjeta necesita las dos cosas para poder
    // explicarlo, así que no se puede perder una al calcular la otra.
    const s = createSistema(REAL_EN_REPOSO).senales.flujoInstantaneo;
    expect(s.estado).toBe("reposo");
    expect(s.banda).toBe("critico");
  });

  it("el peor estado del sistema sube desde las señales, activo a activo", () => {
    const sistema = createSistema({ ...REAL_EN_REPOSO, nivelTanque: { value: 8 } });
    expect(sistema.senales.nivelTanque.estado).toBe("critico");
    expect(sistema.activos.find((a) => a.id === "tanque").estado).toBe("critico");
    expect(sistema.estado).toBe("critico");
  });

  it("una lectura ausente no se cuenta como medida ni contamina el resto", () => {
    const sistema = createSistema({ ...REAL_EN_REPOSO, nivelTanque: { value: null } });
    expect(sistema.senales.nivelTanque.estado).toBe("sin_dato");
    expect(sistema.resumen.sinDato).toBe(1);
    expect(sistema.resumen.medidas).toBe(7);
    // El resto sigue evaluándose con normalidad.
    expect(sistema.senales.temperaturaTanque.estado).toBe("nominal");
  });

  it("la fecha del sistema es la lectura más reciente de cualquier señal", () => {
    const viejo = new Date("2026-08-17T18:00:00Z");
    const nuevo = new Date("2026-08-17T18:50:00Z");
    const sistema = createSistema({
      nivelTanque: { value: 50, receivedAt: viejo },
      temperaturaTanque: { value: 24, receivedAt: nuevo },
    });
    expect(sistema.receivedAt).toEqual(nuevo);
  });
});
