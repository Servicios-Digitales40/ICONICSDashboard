/**
 * simulador-vibraciones.test.js
 * ------------------------------------------------------------------
 * El simulador del SISTEMA DE VIBRACIONES: que sirva los setenta y tres puntos
 * del catálogo sin red, y —lo que más importa— que **no le enseñe a la
 * interfaz una máquina que no existe**.
 *
 * ── DÓNDE VIVE LO QUE SE PRUEBA (Plan 40) ──────────────────────────
 *
 * La física es `shared/eva/vibraciones/simuladorVibraciones.js`, la misma
 * para el frontend y para el transporte falso del backend. Hasta el Plan 40
 * el frontend la envolvía en `data/vibraciones/simuladorVibracion.js`
 * (`createTransporteVibracion`), que se retiró con la máquina escrita a
 * mano; el transporte que aquí se monta es el genérico,
 * `createTransporteSimulado` con ese modelo, que es lo que aquel archivo hacía.
 *
 * ── QUÉ SE PRUEBA AQUÍ Y QUÉ NO ────────────────────────────────────
 *
 * No se prueban los números concretos: son de mentira y cambiarlos es libre.
 * Se prueban las PROPIEDADES por las que este simulador vale para trabajar la
 * pantalla, y que se pueden romper sin notarlo al retocar el modelo:
 *
 *  1. Es determinista en el reloj. Dos navegadores abiertos a la vez, o el
 *     backend y el frontend sirviendo el mismo instante, tienen que coincidir.
 *  2. Cubre el catálogo entero. Un punto sin modelo no da error: llega como
 *     hueco, y la pantalla lo cuenta entre los mudos sin que nadie se entere de
 *     que el que falta es el simulador y no la máquina.
 *  3. Reproduce el apagón MEDIDO el 26-08-2026: al pararse el variador se van
 *     los `vRMS` y sobreviven `aRMS` y `aPeak`. Es la razón de que la pantalla
 *     tenga una sección «Sin comprobar», y sin ella esa mitad no se ejercita.
 *  4. Un punto sin dato llega **sin `value`**, no como un cero con calidad
 *     mala. La diferencia es la que separa «no contesta» de «vibración nula,
 *     todo perfecto» en cuanto alguien escriba un `?? 0` río abajo.
 *  5. Recorre las dieciocho reglas a lo largo de una jornada. Un simulador que
 *     se quedara siempre en verde dejaría sin ejercitar la pantalla entera.
 *  6. Se queda dentro de la `escala` del catálogo, que es la que usan el arco y
 *     las barras para su geometría.
 *  7. La MISMA física por descriptor (`valorVibracionDe`, Plan 40 F0): una
 *     máquina configurada tiene otros tags pero los mismos roles, y su tipo
 *     simula traduciendo cada variable a `{tipo, clave, canal}`. Si el
 *     descriptor y el tag divergieran, una configurada en «Simulado» vibraría
 *     distinto de lo que la escrita a mano enseñó durante meses.
 */
import { describe, expect, it } from "vitest";

import {
  enMarchaVib,
  valorVibracionDe,
  valorVibracionEn,
} from "@shared/eva/vibraciones/simuladorVibraciones.js";
import {
  CALIDADES,
  CANALES,
  CONTADORES_ALARMA,
  BANDERAS,
  MEDIDAS,
  VARIADOR,
  VIGILANCIAS,
  decodificarVigilancia,
  parsePunto,
  puntoAlarma,
  puntoBandera,
  puntoCalidad,
  puntoMedida,
  puntoSensor,
  puntoVariador,
  puntoVigilancia,
  todosLosPuntos,
} from "@shared/eva/vibraciones/vibraciones.js";
import { REGLAS, evaluarRiesgosVibracion } from "@shared/eva/vibraciones/riesgosVibracion.js";
import { TIPO_VIBRACIONES } from "@shared/eva/tipos/vibraciones.js";
import { SIN_CAOS, createTransporteSimulado, isGoodQuality } from "@/lib/iconics";

/** Reloj fijo, para que ninguna prueba dependa de cuándo se ejecute. */
const T0 = Date.UTC(2026, 7, 27, 9, 0, 0);

/** Un instante en marcha y otro con el variador parado, dentro del mismo ciclo. */
const EN_MARCHA = (() => {
  for (let i = 0; i < 200; i++) if (enMarchaVib(T0 + i * 5_000)) return T0 + i * 5_000;
  throw new Error("el ciclo no tiene tramo en marcha");
})();
const EN_PARO = (() => {
  for (let i = 0; i < 200; i++) if (!enMarchaVib(T0 + i * 5_000)) return T0 + i * 5_000;
  throw new Error("el ciclo no tiene tramo parado");
})();

/** Transporte sin caos y con el reloj congelado en `ms`, sobre la física del catálogo. */
const enT = (ms) =>
  createTransporteSimulado({ modelo: valorVibracionEn, chaos: SIN_CAOS, ahora: () => ms, rnd: () => 1 });

/** El estado que arma la fuente de la máquina, pero a partir del modelo y sin React. */
function estadoEn(ms) {
  const canales = {};
  for (const c of CANALES) {
    const d = {};
    for (const m of MEDIDAS) d[m.key] = valorVibracionEn(puntoMedida(m.key, c.id), ms);
    for (const b of BANDERAS) d[b.key] = valorVibracionEn(puntoBandera(b.key, c.id), ms);
    d.vigilancias = {};
    for (const v of VIGILANCIAS) {
      d.vigilancias[v.key] = decodificarVigilancia(valorVibracionEn(puntoVigilancia(v.key, c.id), ms));
    }
    d.calidades = {};
    for (const q of CALIDADES) d.calidades[q.key] = valorVibracionEn(puntoCalidad(q.key, c.id), ms);
    d.sensor = decodificarVigilancia(valorVibracionEn(puntoSensor(c.id), ms));
    canales[c.id] = d;
  }
  const variador = {};
  for (const v of VARIADOR) variador[v.key] = valorVibracionEn(puntoVariador(v.key), ms);
  const alarmas = {};
  for (const a of CONTADORES_ALARMA) alarmas[a.key] = valorVibracionEn(puntoAlarma(a.key), ms);
  return { canales, variador, alarmas };
}

describe("el simulador de vibraciones es determinista", () => {
  it("el mismo instante da el mismo valor, siempre", () => {
    // Sin esto, recargar la página daría un salto y dos pantallas abiertas a la
    // vez enseñarían máquinas distintas.
    for (const punto of todosLosPuntos()) {
      expect(valorVibracionEn(punto, EN_MARCHA)).toEqual(valorVibracionEn(punto, EN_MARCHA));
    }
  });

  it("no usa el reloj del sistema: dos instantes distintos dan valores distintos", () => {
    const a = valorVibracionEn(puntoMedida("aRMS", "S1"), EN_MARCHA);
    const b = valorVibracionEn(puntoMedida("aRMS", "S1"), EN_MARCHA + 60_000);
    expect(a).not.toEqual(b);
  });
});

describe("el simulador cubre el catálogo entero", () => {
  it("los setenta y tres puntos tienen modelo", () => {
    /*
     * `undefined` significa «este punto no es de este árbol», y el transporte
     * lo deja fuera de la respuesta. Un punto del catálogo que caiga ahí se
     * vería en la pantalla como un tag mudo, indistinguible de una máquina
     * apagada: el fallo del simulador se leería como un fallo de la planta.
     */
    const sinModelo = todosLosPuntos().filter((p) => valorVibracionEn(p, EN_MARCHA) === undefined);
    expect(sinModelo).toEqual([]);
  });

  it("un punto de OTRA máquina se ignora en silencio", async () => {
    // El árbol del tanque no es de aquí. Cruzarlos es lo que la separación de
    // los dos catálogos existe para impedir.
    const mapa = await enT(EN_MARCHA).read(["ac:TDCON/DEMO/SENSORES/NivelTanque"]);
    expect(mapa.size).toBe(0);
  });
});

describe("el simulador reproduce el apagón del 26-08-2026", () => {
  it("con el variador parado se van los vRMS y sobreviven aceleración y pico", () => {
    for (const c of CANALES) {
      expect(valorVibracionEn(puntoMedida("vRMS", c.id), EN_PARO)).toBeNull();
      expect(valorVibracionEn(puntoMedida("aRMS", c.id), EN_PARO)).not.toBeNull();
      expect(valorVibracionEn(puntoMedida("aPeak", c.id), EN_PARO)).not.toBeNull();
    }
    for (const v of VARIADOR) {
      expect(valorVibracionEn(puntoVariador(v.key), EN_PARO)).toBeNull();
    }
  });

  it("en marcha, el variador y los vRMS sí entregan", () => {
    for (const v of VARIADOR) {
      expect(valorVibracionEn(puntoVariador(v.key), EN_MARCHA)).not.toBeNull();
    }
    for (const c of CANALES) {
      expect(valorVibracionEn(puntoMedida("vRMS", c.id), EN_MARCHA)).not.toBeNull();
    }
  });

  it("el DKW del lado acople no entrega NUNCA: no tiene referencia aprendida", () => {
    expect(valorVibracionEn(puntoMedida("DKW", "S1"), EN_MARCHA)).toBeNull();
    expect(valorVibracionEn(puntoMedida("DKW", "S2"), EN_MARCHA)).not.toBeNull();
  });
});

describe("un punto sin dato llega como lo sirve el servidor", () => {
  it("sin `value`, y no como un cero con calidad mala", async () => {
    /*
     * Es la forma medida en el servidor real: calidad `0x08000000` y ningún
     * campo `value`. Si el simulador sirviera un cero, el fallo que de verdad
     * importa —un `?? 0` convirtiendo «no contesta» en «todo perfecto»— no se
     * podría ensayar sin desenchufar el puente de verdad.
     */
    const punto = puntoVariador("velocidad");
    const mapa = await enT(EN_PARO).read([punto]);
    const entrada = mapa.get(punto);

    expect(entrada).toBeTruthy();
    expect("value" in entrada).toBe(false);
    expect(isGoodQuality(entrada.quality)).toBe(false);
  });

  it("un punto con dato llega con calidad buena", async () => {
    const punto = puntoMedida("aRMS", "S1");
    const mapa = await enT(EN_MARCHA).read([punto]);
    expect(isGoodQuality(mapa.get(punto).quality)).toBe(true);
    expect(Number.isFinite(mapa.get(punto).value)).toBe(true);
  });
});

describe("el simulador ejercita la pantalla entera", () => {
  it("las dieciocho reglas se disparan alguna vez a lo largo de una jornada", () => {
    /*
     * Es LA propiedad de este simulador. Un modelo tranquilo dejaría sin
     * ejercitar los coral, los ámbar, la sección de «Sin comprobar» y las
     * reglas de norma — que es casi toda la pantalla. Se recorren cuatro horas
     * a la cadencia real de sondeo, que es lo que tarda la deriva de jornada en
     * pasear la velocidad por las tres bandas de ISO.
     */
    const vistas = new Set();
    for (let i = 0; i < 4 * 60 * 12; i++) {
      const r = evaluarRiesgosVibracion(estadoEn(T0 + i * 5_000));
      for (const a of r.activos) vistas.add(a.id);
    }

    const nunca = REGLAS.map((r) => r.id).filter((id) => !vistas.has(id));
    expect(nunca).toEqual([]);
  });

  it("hay instantes con reglas sin comprobar, y instantes sin ninguna", () => {
    // Las dos mitades de la pantalla. Si «Sin comprobar» estuviera siempre
    // llena, la sección dejaría de significar algo; si estuviera siempre
    // vacía, no se vería nunca.
    let conHuecos = 0;
    let sinHuecos = 0;
    for (let i = 0; i < 2 * 60 * 12; i++) {
      const r = evaluarRiesgosVibracion(estadoEn(T0 + i * 5_000));
      if (r.noEvaluables.length > 0) conHuecos += 1;
      else sinHuecos += 1;
    }
    expect(conHuecos).toBeGreaterThan(0);
    expect(sinHuecos).toBeGreaterThan(0);
  });
});

describe("el simulador respeta el catálogo", () => {
  it("cada medida se queda dentro de su `escala`", () => {
    /*
     * La escala no es decorativa: el arco y las barras de las tarjetas están
     * construidos sobre ella. Un valor que se salga no da error — pinta una
     * barra fuera de su caja, que es de los fallos que se ven raros y no se
     * saben explicar.
     */
    for (let i = 0; i < 4 * 60 * 6; i++) {
      const ms = T0 + i * 10_000;
      for (const c of CANALES) {
        for (const m of MEDIDAS) {
          const v = valorVibracionEn(puntoMedida(m.key, c.id), ms);
          if (v === null) continue;
          expect(v).toBeGreaterThanOrEqual(m.escala.min);
          expect(v).toBeLessThanOrEqual(m.escala.max);
        }
      }
    }
  });

  it("los estados de vigilancia se decodifican: el ida y vuelta cuadra", () => {
    // El simulador los codifica con `codificarVigilancia` y la pantalla los lee
    // con `decodificarVigilancia`. Si las dos direcciones se separaran, la
    // pantalla enseñaría «no se vigila» sobre estados que sí existen.
    for (const c of CANALES) {
      for (const v of VIGILANCIAS) {
        const crudo = valorVibracionEn(puntoVigilancia(v.key, c.id), EN_MARCHA);
        expect(decodificarVigilancia(crudo)).not.toBeNull();
      }
      expect(decodificarVigilancia(valorVibracionEn(puntoSensor(c.id), EN_MARCHA))).not.toBeNull();
    }
  });
});

describe("la misma física por descriptor: lo que simula una máquina configurada", () => {
  it("un descriptor equivale al tag del catálogo del que se deriva", () => {
    /*
     * `{tipo, clave, canal}` es lo que `parsePunto` saca de un tag escrito a
     * mano, y es TODO lo que la física necesita. Se comprueba por las dos
     * puertas: el descriptor escrito a mano y el que sale de parsear el tag.
     */
    const tag = puntoMedida("vRMS", "S1");
    const escrito = { tipo: "medida", clave: "vRMS", canal: "S1" };

    expect(parsePunto(tag)).toMatchObject(escrito);
    for (const ms of [EN_MARCHA, EN_PARO, EN_MARCHA + 60_000]) {
      expect(valorVibracionDe(escrito, ms)).toEqual(valorVibracionEn(tag, ms));
      expect(valorVibracionDe(parsePunto(tag), ms)).toEqual(valorVibracionEn(tag, ms));
    }
  });

  it("los setenta y tres puntos dan lo mismo por tag que por su descriptor", () => {
    // No sólo el vRMS: si alguna familia (banderas, vigilancias, contadores)
    // hubiera quedado sólo en el camino del tag, una configurada la perdería.
    for (const punto of todosLosPuntos()) {
      expect(valorVibracionDe(parsePunto(punto), EN_MARCHA), punto).toEqual(valorVibracionEn(punto, EN_MARCHA));
    }
  });

  it("un descriptor que la física no conoce es `undefined`, no un valor de consuelo", () => {
    /*
     * `undefined` es «no sé qué es esto» y el transporte lo deja fuera de la
     * respuesta. Un número aquí sería inventar la lectura de una variable que
     * el tipo no sabe simular.
     */
    expect(valorVibracionDe(null, EN_MARCHA)).toBeUndefined();
    expect(valorVibracionDe({}, EN_MARCHA)).toBeUndefined();
    expect(valorVibracionDe({ tipo: "prensa", clave: "fuerza", canal: null }, EN_MARCHA)).toBeUndefined();
    expect(valorVibracionDe({ tipo: "medida", clave: "noExiste", canal: "S1" }, EN_MARCHA)).toBeUndefined();
  });

  it("el descriptor que el TIPO construye para un rol y un apoyo vibra como el catálogo", () => {
    /*
     * Es la cadena entera de una configurada en «Simulado»: la variable trae
     * `rol` y `assetId`, el tipo los traduce con `descriptorDe`, y `simular`
     * llama a la física. El S3 es el apoyo que más vibra en el modelo, así que
     * un descriptor que cayera en «un apoyo cualquiera» se notaría.
     */
    const descriptor = TIPO_VIBRACIONES.descriptorDe("medida:vRMS", "S3");
    expect(descriptor).toEqual({ tipo: "medida", clave: "vRMS", canal: "S3" });

    const tag = puntoMedida("vRMS", "S3");
    for (const ms of [EN_MARCHA, EN_MARCHA + 60_000]) {
      const esperado = valorVibracionEn(tag, ms);
      expect(esperado).not.toBeNull();
      expect(valorVibracionDe(descriptor, ms)).toEqual(esperado);
      expect(TIPO_VIBRACIONES.simular(descriptor, ms)).toEqual(esperado);
    }
    /* Y en paro se apaga igual que el tag: el apagón es del modelo, no del nombre. */
    expect(TIPO_VIBRACIONES.simular(descriptor, EN_PARO)).toBeNull();
  });

  it("una medida de apoyo sin apoyo no tiene descriptor: hueco, no un apoyo cualquiera", () => {
    expect(TIPO_VIBRACIONES.descriptorDe("medida:vRMS")).toBeNull();
    expect(TIPO_VIBRACIONES.descriptorDe("rol:inventado", "S1")).toBeNull();
    /* El variador es de la máquina, no de un apoyo: sin apoyo sí se simula. */
    const velocidad = TIPO_VIBRACIONES.descriptorDe("variador:velocidad");
    expect(velocidad).toEqual({ tipo: "variador", clave: "velocidad", canal: null });
    expect(valorVibracionDe(velocidad, EN_MARCHA)).toEqual(valorVibracionEn(puntoVariador("velocidad"), EN_MARCHA));
  });
});
