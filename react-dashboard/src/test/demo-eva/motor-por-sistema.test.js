/**
 * Un motor de sondeo POR MÁQUINA. La unificación es del código, nunca del lote.
 *
 * ── POR QUÉ ESTA PRUEBA EXISTE DESDE LA MISMA FASE QUE EL ARREGLO ──
 *
 * Porque el arreglo crea la tentación. Hasta el Plan 21 F2, vibraciones tenía
 * su propio `setInterval` y el tanque el motor de `lib/iconics`: nadie iba a
 * juntar dos cosas que ni se parecían. Desde que las dos máquinas usan el MISMO
 * motor, pedir los puntos de todas en una sola llamada parece la
 * simplificación obvia — y sería meter las dos instalaciones en el mismo lote
 * y en el mismo búfer.
 *
 * La cabecera de `shared/eva/comun/sistemas.js` ya lo avisa con estas palabras:
 * «En cuanto existe `SISTEMAS.flatMap(s => s.puntos())`, alguien pedirá un solo
 * lote con las dos máquinas y las meterá en el mismo búfer.» Esto es lo que lo
 * convierte en un fallo de pruebas en vez de en un párrafo que alguien puede no
 * leer.
 *
 * ── LO QUE CAMBIÓ CON EL PLAN 40, Y LO QUE NO ──────────────────────
 *
 * La máquina de vibraciones escrita a mano se retiró: hoy toda máquina de
 * vibraciones es una CONFIGURADA, con sus propios tags, y su fuente es
 * `createFuenteDeMaquina` (`data/comunes/fuenteDeMaquina.js`). La tentación
 * es la misma con más motivo —ahora hay N máquinas del mismo tipo con la misma
 * forma—, así que la prueba se reescribe contra esa fuente y contra el tanque,
 * que sigue siendo la otra instalación. La máquina de aquí tiene una raíz
 * propia (`ac:OTRA/PLANTA/`) a propósito: si algún lote la atribuyera al
 * tanque, o al catálogo retirado, se vería.
 *
 * ── LO QUE SE COMPRUEBA ────────────────────────────────────────────
 *
 *  1. Con las dos fuentes vivas a la vez sobre el MISMO transporte, NINGUNA
 *     petición contiene puntos de las dos máquinas. No que sean dos peticiones
 *     exactas —el motor trocea por `maxBatch` y podría partirlas— sino que
 *     ningún lote las mezcla, que es la afirmación que importa.
 *  2. Cada motor va a la cadencia de SU máquina: una configurada lee su
 *     `cadenciaMs`, y dos máquinas con cadencias distintas piden a ritmos
 *     distintos. Un solo motor compartido obligaría a la lenta a ir al paso de
 *     la rápida, o al revés.
 *  3. Soltar todos los puntos y volver a entrar no finge una máquina muda.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { SISTEMA } from "@shared/eva/comun/sistemas.js";
import { crearMaquina } from "@shared/eva/comun/configuracionMaquina.js";
import { createEvaSource } from "@/Demo-EVA/data/comunes/evaSource.js";
import { createFuenteDeMaquina } from "@/Demo-EVA/data/comunes/fuenteDeMaquina.js";

/* ── La máquina configurada de estas pruebas ─────────────────────── */

/** Una raíz que no es la del tanque ni la del catálogo retirado. */
const RAIZ = "ac:OTRA/PLANTA/Motor/";
const APOYOS = ["S1", "S2", "S3"];

/**
 * Una máquina de vibraciones configurada con sus propios tags: cuatro medidas
 * por apoyo y el variador. Lo que importa aquí es de QUIÉN son sus puntos, no
 * cuántos: la forma de dominio la prueba `fuente-de-maquina.test.js`.
 */
function maquinaConfigurada({ id = "otra-vibraciones", cadenciaMs = 5000 } = {}) {
  const variables = [];
  for (const s of APOYOS) {
    for (const m of ["vRMS", "aRMS", "aPeak", "DKW"]) {
      variables.push({ id: `${m}_${s}`, pointName: `${RAIZ}${s}/${m}`, rol: `medida:${m}`, assetId: s });
    }
  }
  for (const v of ["velocidad", "frecuencia"]) {
    variables.push({ id: v, pointName: `${RAIZ}Variador/${v}`, rol: `variador:${v}`, assetId: "Variador" });
  }
  return crearMaquina({
    id,
    nombre: "Otra máquina",
    tipo: "vibraciones",
    plc: "PLC_9 · ua:OTRA",
    cadenciaMs,
    assets: [
      { id: "Motor", pointName: RAIZ, rol: "raiz" },
      ...APOYOS.map((s) => ({ id: s, pointName: `${RAIZ}${s}/` })),
      { id: "Variador", pointName: `${RAIZ}Variador/` },
    ],
    variables,
  });
}

/** Un transporte que apunta cada lote que le piden, sin salir a ningún lado. */
function transporteEspia(lotes) {
  return {
    read: async (puntos) => {
      lotes.push([...puntos]);
      // Da igual qué devuelva: lo que se mide es QUÉ se pidió.
      return new Map(puntos.map((p) => [p, { value: 1, quality: 0 }]));
    },
  };
}

const bajas = [];
afterEach(() => {
  while (bajas.length) bajas.pop()();
  vi.useRealTimers();
});

describe("cada máquina sondea por su cuenta", () => {
  it("ningún lote mezcla puntos de las dos instalaciones", async () => {
    const lotes = [];
    const espia = transporteEspia(lotes);
    const configurada = maquinaConfigurada();

    const tanque = createEvaSource({ transport: espia, intervalMs: 50 });
    const vibracion = createFuenteDeMaquina({ maquina: configurada, transport: espia, intervalMs: 50 });

    bajas.push(tanque.subscribeSistema(() => {}));
    bajas.push(vibracion.subscribeVibracion(() => {}));

    await new Promise((r) => setTimeout(r, 500));

    expect(lotes.length).toBeGreaterThan(0);

    const raicesTanque = SISTEMA.tanque.raices;
    const raicesConfigurada = configurada.assets.filter((a) => a.rol === "raiz").map((a) => a.pointName);
    const deQuien = (punto) => {
      if (raicesTanque.some((r) => punto.startsWith(r))) return "tanque";
      if (raicesConfigurada.some((r) => punto.startsWith(r))) return "configurada";
      return "ninguna";
    };

    const vistos = new Set();
    for (const lote of lotes) {
      const duenos = new Set(lote.map(deQuien));
      /* Un punto que no es de ninguna sería un lote pidiendo algo que ningún
         motor declaró: el catálogo retirado colándose por alguna puerta. */
      expect(duenos.has("ninguna"), `Un lote pidió puntos de nadie:\n  ${lote.slice(0, 5).join("\n  ")}`).toBe(false);
      for (const d of duenos) vistos.add(d);
      expect(
        duenos.size,
        `Un lote pidió puntos de ${[...duenos].join(" y ")} a la vez:\n  ` +
          lote.slice(0, 5).join("\n  ") +
          "\n\nLa unificación del Plan 21 F2 es del CÓDIGO, nunca del lote. " +
          "Ver la cabecera de `data/comunes/fuenteDeMaquina.js`."
      ).toBeLessThanOrEqual(1);
    }

    /* Las dos han pedido: la separación no se cumple por tener una sola. */
    expect([...vistos].sort()).toEqual(["configurada", "tanque"]);

    /* Y lo que pidió la configurada son EXACTAMENTE sus variables: se
       atribuyen a ella, no al tanque ni a ningún catálogo. */
    const pedidosConfigurada = new Set(lotes.flat().filter((p) => deQuien(p) === "configurada"));
    expect([...pedidosConfigurada].sort()).toEqual(configurada.variables.map((v) => v.pointName).sort());
  });

  it("cada motor va a la cadencia de SU máquina", async () => {
    /*
     * `createFuenteDeMaquina` toma `maquina.cadenciaMs` por defecto. Dos
     * configuradas con cadencias distintas, sobre el mismo reloj falso, tienen
     * que pedir a ritmos distintos: la rápida acumula más lotes que la lenta.
     * Con reloj falso la cuenta es determinista, no una carrera contra el
     * planificador de la máquina que corre la suite.
     */
    vi.useFakeTimers();

    const lotesRapida = [];
    const lotesLenta = [];
    const rapida = createFuenteDeMaquina({
      maquina: maquinaConfigurada({ id: "rapida", cadenciaMs: 100 }),
      transport: transporteEspia(lotesRapida),
    });
    const lenta = createFuenteDeMaquina({
      maquina: maquinaConfigurada({ id: "lenta", cadenciaMs: 1000 }),
      transport: transporteEspia(lotesLenta),
    });

    bajas.push(rapida.subscribeVibracion(() => {}));
    bajas.push(lenta.subscribeVibracion(() => {}));

    await vi.advanceTimersByTimeAsync(3_000);

    rapida.stop();
    lenta.stop();

    expect(lotesLenta.length).toBeGreaterThan(0);
    expect(lotesRapida.length).toBeGreaterThan(lotesLenta.length * 2);
  });

  it("la cadencia del tanque es la suya, no la de una máquina de vibraciones", () => {
    // El tanque la declara en su registro; una configurada la trae en su
    // configuración. Que no coincidan es lo normal, y un motor único no
    // podría respetar las dos.
    expect(SISTEMA.tanque.cadenciaMs).not.toBe(maquinaConfigurada().cadenciaMs);
  });
});

describe("volver a entrar en la sección no finge una máquina muda", () => {
  it("tras soltar todos los puntos, el estado vuelve a `loading` y no a «sin dato»", async () => {
    /*
     * La regresión que este archivo estrena, y que se introdujo en el propio
     * F2: al desmontarse el último componente, la baja del motor BORRA los
     * valores cacheados (`values.delete`). Si `loading` se dedujera de
     * `stats.ultimaLectura` —que dura lo que el proceso— el primer instante de
     * la siguiente visita sería `loading: false` con todos los puntos mudos, o
     * sea la cinta de «La máquina no está contestando» sobre una máquina que
     * está perfectamente.
     *
     * Se vio montando la vista dos veces seguidas en la misma tanda de
     * pruebas, que es exactamente lo que hace un operador al navegar.
     */
    const lotes = [];
    const fuente = createFuenteDeMaquina({
      maquina: maquinaConfigurada(),
      transport: transporteEspia(lotes),
      intervalMs: 50,
    });

    const estados = [];
    const baja = fuente.subscribeVibracion((e) => estados.push(e));
    await new Promise((r) => setTimeout(r, 300));

    expect(estados.at(-1).loading).toBe(false);
    expect(estados.at(-1).lastUpdated).not.toBeNull();

    baja();

    // Segunda visita: nadie ha leído nada todavía.
    const segunda = [];
    const baja2 = fuente.subscribeVibracion((e) => segunda.push(e));

    expect(segunda[0].loading).toBe(true);
    expect(segunda[0].lastUpdated).toBeNull();

    baja2();
    fuente.stop();
  });
});
