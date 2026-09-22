/**
 * fuente-de-maquina.test.js
 * ------------------------------------------------------------------
 * La fuente de datos de una máquina CONFIGURADA. Plan 37 F2.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 *  1. **La instantánea tiene la forma que las vistas esperan**, y sale de
 *     los puntos de la configuración: `canales.S1.vRMS` es lo que se leyó de
 *     `…/S1/vRMS_S1`, y los contadores del área entran en `alarmas`.
 *  2. **Un motor por máquina, con SUS puntos.** Dos máquinas no comparten
 *     lote, y una máquina no pide puntos de otra.
 *  3. **El origen simulado simula con la física del TIPO** (Plan 40 F0): las
 *     medidas con rol y apoyo salen con valor; lo que el tipo no sabe simular
 *     (una variable sin rol, como el estado del sensor) queda como hueco, no
 *     como cero. Hasta el 21-09-2026 esto afirmaba lo contrario —que se
 *     negaba con un motivo—, porque la física sólo parseaba los tags de la
 *     máquina escrita a mano.
 *  4. **Los apoyos salen del tipo cruzado con la máquina**, con su id como
 *     rótulo; un apoyo que la máquina no tiene no se lista.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createFuenteDeMaquina,
  fuenteDeMaquinaConfigurada,
  olvidarFuentesDeMaquina,
  transporteDeConfigurada,
} from "@/Demo-EVA/data/comunes/fuenteDeMaquina.js";
import { TRANSPORTES } from "@/lib/iconics";
import { QUALITY_SIN_DATO } from "@shared/quality.js";
import { canalesDeMaquina, contadoresDeMaquina } from "@shared/eva/comun/vistaDeMaquina.js";
import { tipoDe } from "@shared/eva/tipos/index.js";
import { enMarchaVib } from "@shared/eva/vibraciones/simuladorVibraciones.js";

/**
 * Un instante con el motor SIMULADO en marcha, para la prueba que lee del
 * origen simulado (F10 del backlog, 22-09-2026).
 *
 * El simulador no usa `Math.random`: su marcha y su paro van por RELOJ DE
 * PARED, en ciclos, y con el motor parado `vRMSEn()` devuelve `null` —el
 * módulo no publica—. La prueba leía con `Date.now()` real, así que caía o no
 * según la hora a la que corriera la tanda: «2 de 4 en la carpeta, 0 solo»
 * era pura coincidencia de reloj, no orden ni contención. Cazado con
 * `--reporter=verbose`: `vRMS_S1: expected 'undefined' to be 'number'`.
 * Misma receta que `simulador-vibraciones.test.js`.
 */
const T0 = Date.UTC(2026, 7, 27, 9, 0, 0);
const EN_MARCHA = (() => {
  for (let i = 0; i < 200; i++) if (enMarchaVib(T0 + i * 5_000)) return T0 + i * 5_000;
  throw new Error("el ciclo del simulador no tiene tramo en marcha");
})();

const RAIZ = "ac:TDCON/DEMO_VIBRACIONES/Vibraciones/";
const AREA = "ae:/DEMO VIBRACIONES";
const TIPO = tipoDe("vibraciones");

const variable = (id, pointName, rol, assetId) => ({
  id, pointName, rol, assetId, historyPointName: null, historyVerified: false, acceso: "read",
});

const maquina = (id = "vib-motor-03") => ({
  id,
  nombre: "Nuevo-Modor",
  tipo: "vibraciones",
  plc: "PLC_2 · ua:DEMO3",
  cadenciaMs: 5000,
  revisada: null,
  assets: [
    { id: "Vibraciones", pointName: RAIZ, rol: "raiz" },
    { id: "S1", pointName: `${RAIZ}S1/`, rol: "secundario" },
    { id: "S2", pointName: `${RAIZ}S2/`, rol: "secundario" },
    { id: "V20", pointName: `${RAIZ}V20/`, rol: "secundario" },
    { id: "DEMO VIBRACIONES", pointName: AREA, rol: "secundario" },
  ],
  variables: [
    variable("vRMS_S1", `${RAIZ}S1/vRMS_S1`, "medida:vRMS", "S1"),
    variable("aRMS_S1", `${RAIZ}S1/aRMS_S1`, "medida:aRMS", "S1"),
    variable("vRMS_S2", `${RAIZ}S2/vRMS_S2`, "medida:vRMS", "S2"),
    variable("SPEED_BMS", `${RAIZ}V20/SPEED_BMS`, "variador:velocidad", "V20"),
    variable("ActiveUnackedCount", `${AREA}=ActiveUnackedCount`, null, "DEMO VIBRACIONES"),
  ],
});

/** Un transporte que contesta un valor fijo por punto y apunta qué le piden. */
function transporteFalso(valores) {
  const pedidos = [];
  return {
    pedidos,
    async read(puntos) {
      pedidos.push([...puntos]);
      const salida = new Map();
      for (const p of puntos) if (p in valores) salida.set(p, { value: valores[p], quality: 0 });
      return salida;
    },
  };
}

/** Espera al primer ciclo del motor. */
const primeraLectura = (fuente) =>
  new Promise((resolver) => {
    const off = fuente.subscribeVibracion((s) => {
      if (s.lastUpdated) {
        off();
        resolver(s);
      }
    });
  });

afterEach(() => {
  olvidarFuentesDeMaquina();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("los apoyos y los contadores de una máquina configurada", () => {
  it("los apoyos son los del tipo que la máquina tiene, en el orden del tipo y con su id de rótulo", () => {
    const canales = canalesDeMaquina(maquina(), TIPO);
    expect(canales.map((c) => c.id)).toEqual(["S1", "S2"]);
    expect(canales[0]).toMatchObject({ id: "S1", sufijo: "S1", label: "S1", sensibilidad: null, rodamiento: null });
  });

  it("sin tipo no hay apoyos: no se adivina", () => {
    expect(canalesDeMaquina(maquina(), null)).toEqual([]);
  });

  it("los contadores se emparejan por el sufijo que el servidor les da", () => {
    const contadores = contadoresDeMaquina(maquina(), TIPO.contadoresAlarma);
    expect(contadores).toEqual({ activasSinReconocer: `${AREA}=ActiveUnackedCount` });
  });
});

describe("la fuente de una máquina configurada", () => {
  it("entrega la forma de las vistas, leída de los puntos de la configuración", async () => {
    const transporte = transporteFalso({
      [`${RAIZ}S1/vRMS_S1`]: 1.23,
      [`${RAIZ}S1/aRMS_S1`]: 0.5,
      [`${RAIZ}S2/vRMS_S2`]: 2.5,
      [`${RAIZ}V20/SPEED_BMS`]: 1480,
      [`${AREA}=ActiveUnackedCount`]: 2,
    });
    const fuente = createFuenteDeMaquina({ maquina: maquina(), transport: transporte, intervalMs: 60_000 });

    const s = await primeraLectura(fuente);
    fuente.stop();

    expect(s.canales.S1.vRMS).toBe(1.23);
    expect(s.canales.S1.aRMS).toBe(0.5);
    expect(s.canales.S2.vRMS).toBe(2.5);
    expect(s.variador.velocidad).toBe(1480);
    expect(s.alarmas.activasSinReconocer).toBe(2);
    expect(s.puntosPedidos).toBe(5);
    expect(s.canalesMeta.map((c) => c.id)).toEqual(["S1", "S2"]);
    /* Sin `arboles` guardados, el área es `null`: no se inventa la del catálogo. */
    expect(s.maquina).toEqual({ id: "vib-motor-03", nombre: "Nuevo-Modor", configurada: true, area: null });
    expect(s.error).toBeNull();
    expect(s.loading).toBe(false);

    /* Lo que la máquina no declara queda como hueco, no como cero. */
    expect(s.canales.S1.DKW).toBeNull();
    /* Y el pedido fue EXACTAMENTE sus cinco puntos: ninguno del catálogo. */
    expect(transporte.pedidos[0].sort()).toEqual(maquina().variables.map((v) => v.pointName).sort());
  });

  it("un punto que no contesta se cuenta como mudo, con su motivo", async () => {
    const transporte = transporteFalso({ [`${RAIZ}S1/vRMS_S1`]: 1 });
    const fuente = createFuenteDeMaquina({ maquina: maquina(), transport: transporte, intervalMs: 60_000 });

    const s = await primeraLectura(fuente);
    fuente.stop();

    expect(s.puntosSinDato).toHaveLength(4);
    expect(s.puntosSinDato).toContain(`${RAIZ}S2/vRMS_S2`);
    expect(s.canales.S2.vRMS).toBeNull();
  });

  it("dos máquinas abren dos motores y ninguno pide puntos de la otra", async () => {
    const t1 = transporteFalso({ [`${RAIZ}S1/vRMS_S1`]: 1 });
    const t2 = transporteFalso({ ["ac:OTRA/S1/vRMS_S1"]: 9 });
    const otra = {
      ...maquina("vib-motor-04"),
      variables: [variable("vRMS_S1", "ac:OTRA/S1/vRMS_S1", "medida:vRMS", "S1")],
    };
    const f1 = createFuenteDeMaquina({ maquina: maquina(), transport: t1, intervalMs: 60_000 });
    const f2 = createFuenteDeMaquina({ maquina: otra, transport: t2, intervalMs: 60_000 });

    const [s1, s2] = await Promise.all([primeraLectura(f1), primeraLectura(f2)]);
    f1.stop();
    f2.stop();

    expect(s1.canales.S1.vRMS).toBe(1);
    expect(s2.canales.S1.vRMS).toBe(9);
    expect(t1.pedidos.flat()).not.toContain("ac:OTRA/S1/vRMS_S1");
    expect(t2.pedidos.flat()).toHaveLength(1);
  });

  it("con el origen SIMULADO las medidas con rol y apoyo salen con valor, y lo sin rol queda como hueco", async () => {
    /*
     * El caos suave puede volver mala una lectura de cada cincuenta (valor 0,
     * calidad incierta) o dejar fuera una de cada cien. Se fija el azar para
     * que la prueba mida la física del tipo, no la suerte del preset.
     *
     * Y se fija el RELOJ, que era lo que de verdad la hacía intermitente:
     * sólo `Date`, no los temporizadores —el transporte espera `latenciaMs`
     * con `setTimeout`, y con los timers falsos esa espera no terminaría—.
     */
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    vi.useFakeTimers({ toFake: ["Date"], now: EN_MARCHA });
    const m = maquina();
    const sensor = variable("SENSOR_S1", `${RAIZ}S1/SENSOR_S1`, null, "S1");
    const transporte = transporteDeConfigurada({ ...m, variables: [...m.variables, sensor] }, TRANSPORTES.SIMULADO);

    const lectura = await transporte.read([
      `${RAIZ}S1/vRMS_S1`, `${RAIZ}S1/aRMS_S1`, `${RAIZ}S2/vRMS_S2`, `${RAIZ}S1/SENSOR_S1`, "ac:OTRA/x",
    ]);

    for (const punto of [`${RAIZ}S1/vRMS_S1`, `${RAIZ}S1/aRMS_S1`, `${RAIZ}S2/vRMS_S2`]) {
      expect(typeof lectura.get(punto)?.value, punto).toBe("number");
      expect(Number.isFinite(lectura.get(punto).value), punto).toBe(true);
    }
    /* El estado del sensor no tiene rol: el tipo no lo simula y queda como
       hueco honesto —sin `value`, con la calidad de «sin dato»—, nunca 0. */
    expect(lectura.get(`${RAIZ}S1/SENSOR_S1`)).toEqual({ quality: QUALITY_SIN_DATO });
    /* Un punto que no es de esta máquina ni siquiera aparece en la respuesta. */
    expect(lectura.has("ac:OTRA/x")).toBe(false);
  });

  it("un tipo que el programa no conoce se rechaza al construir, no al pintar", () => {
    expect(() =>
      createFuenteDeMaquina({ maquina: { ...maquina(), tipo: "prensa" }, transport: transporteFalso({}) }),
    ).toThrow(/tipo «prensa»/);
  });

  it("la caché es por máquina y se rehace cuando la configuración cambia", () => {
    const m = maquina();
    const a = fuenteDeMaquinaConfigurada(m, TRANSPORTES.REAL);
    expect(fuenteDeMaquinaConfigurada(m, TRANSPORTES.REAL)).toBe(a);

    const editada = { ...m, revisada: "2026-09-21T23:00:00.000Z" };
    const b = fuenteDeMaquinaConfigurada(editada, TRANSPORTES.REAL);
    expect(b).not.toBe(a);
  });
});
