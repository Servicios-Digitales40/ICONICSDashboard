/**
 * sistemas.test.js
 * ------------------------------------------------------------------
 * El registro de sistemas como PUERTO: que toda máquina dada de alta cumpla el
 * mismo contrato, y que dar de alta la siguiente no exija tocar nada más.
 *
 * ── POR QUÉ ESTAS PRUEBAS Y NO OTRAS ───────────────────────────────
 *
 * Porque el registro es ahora la pieza de la que cuelgan el transporte falso
 * del backend, el simulado del frontend y el asistente. Una entrada mal
 * declarada no da error: da una máquina que no aparece por ningún lado, o —peor—
 * una que contesta `null` con calidad buena, que es el fallo que este proyecto
 * ya ha cometido DOS veces.
 *
 * Se recorren `SISTEMAS` en bucle a propósito, sin nombrar ninguno: así la
 * máquina que se dé de alta mañana queda cubierta el día que se añada, sin que
 * nadie se acuerde de venir aquí. Es el único sitio del proyecto donde iterar
 * todos los sistemas está bien — y aun así **nunca se mezclan sus puntos**: lo
 * que se comprueba abajo es justamente que no se solapan.
 */
import { describe, expect, it } from "vitest";

import {
  SISTEMAS,
  SISTEMA,
  SISTEMA_IDS,
  mismoSistema,
  parsePuntoDeSistema,
  sistemaDePunto,
  sistemasDeSenal,
  valorSimuladoDe,
} from "@shared/eva/comun/sistemas.js";

/** Reloj fijo: ninguna prueba puede depender de cuándo se ejecute. */
const T0 = Date.UTC(2026, 7, 27, 9, 0, 0);

describe("cada sistema cumple el contrato del puerto", () => {
  it.each(SISTEMAS.map((s) => [s.id, s]))("«%s» declara su comportamiento", (id, sistema) => {
    // Los seis campos ejecutables. Sin ellos la entrada es documentación, y el
    // transporte falso la trataría como «punto que no existe».
    expect(Array.isArray(sistema.raices)).toBe(true);
    expect(sistema.raices.length).toBeGreaterThan(0);
    expect(typeof sistema.puntos).toBe("function");
    expect(typeof sistema.parse).toBe("function");
    expect(typeof sistema.modelo).toBe("function");
    expect(typeof sistema.esHistorizada).toBe("function");
    expect(Number.isFinite(sistema.cadenciaMs)).toBe(true);
  });

  it.each(SISTEMAS.map((s) => [s.id, s]))(
    "«%s»: todos sus puntos caen bajo alguna de sus raíces",
    (id, sistema) => {
      /*
       * Es lo que hace que `sistemaDePunto` funcione, y el fallo que tuvo el
       * registro durante un tiempo: los contadores de alarma de vibraciones
       * viven en `ae:` y la entrada declaraba una sola raíz en `ac:`, así que
       * su propia máquina no los reconocía.
       */
      const huerfanos = sistema
        .puntos()
        .filter((p) => !sistema.raices.some((r) => p.startsWith(r)));
      expect(huerfanos).toEqual([]);
    },
  );

  it.each(SISTEMAS.map((s) => [s.id, s]))(
    "«%s»: todos sus puntos tienen modelo y se parsean",
    (id, sistema) => {
      /*
       * `undefined` significa «no es de este árbol». Un punto propio que caiga
       * ahí se vería en pantalla como un tag mudo, indistinguible de una
       * máquina apagada: el fallo del simulador se leería como un fallo de la
       * planta.
       */
      const puntos = sistema.puntos();
      expect(puntos.length).toBeGreaterThan(0);

      const sinModelo = puntos.filter((p) => sistema.modelo(p, T0) === undefined);
      const sinParse = puntos.filter((p) => sistema.parse(p) === null);

      expect(sinModelo).toEqual([]);
      expect(sinParse).toEqual([]);
    },
  );

  it.each(SISTEMAS.map((s) => [s.id, s]))(
    "«%s»: su modelo NO reconoce puntos de las demás máquinas",
    (id, sistema) => {
      // El contrato de `modelo` sólo sirve si cada uno dice que no a lo ajeno.
      // Si dos modelos reclamaran el mismo punto, `valorSimuladoDe` serviría el
      // del primero del registro y nadie se enteraría.
      const ajenos = SISTEMAS.filter((o) => o.id !== id).flatMap((o) => o.puntos());
      const reclamados = ajenos.filter((p) => sistema.modelo(p, T0) !== undefined);
      expect(reclamados).toEqual([]);
    },
  );
});

describe("los sistemas no se solapan", () => {
  it("ningún punto pertenece a dos máquinas", () => {
    const vistos = new Map();
    for (const s of SISTEMAS) {
      for (const p of s.puntos()) {
        expect(vistos.has(p)).toBe(false);
        vistos.set(p, s.id);
      }
    }
  });

  it("cada punto se resuelve a SU sistema, y a ninguno más", () => {
    for (const s of SISTEMAS) {
      for (const p of s.puntos()) {
        expect(sistemaDePunto(p)?.id).toBe(s.id);
        expect(parsePuntoDeSistema(p)?.sistema).toBe(s.id);
      }
    }
  });

  it("un punto ajeno no es de nadie", () => {
    // Y `undefined`, no `null`: es el mismo contrato que cada `modelo`, para
    // que un transporte no tenga que distinguir «no hay sistema» de «el
    // sistema no lo conoce». Las dos cosas significan «no es mío».
    expect(sistemaDePunto("ac:OTRA/PLANTA/X")).toBeNull();
    expect(parsePuntoDeSistema("ac:OTRA/PLANTA/X")).toBeNull();
    expect(valorSimuladoDe("ac:OTRA/PLANTA/X", T0)).toBeUndefined();
  });

  it("`mismoSistema` responde sobre dos puntos de la MISMA máquina", () => {
    /*
     * Es la regresión que motivó pasar `raiz` a `raices`. Un contador de alarma
     * y una medida de vibración son de la misma máquina, y el registro
     * contestaba `null` —«no sé»— porque el contador vivía en un espacio de
     * nombres que la entrada no declaraba.
     */
    for (const s of SISTEMAS) {
      const puntos = s.puntos();
      expect(mismoSistema(puntos[0], puntos[puntos.length - 1])).toBe(true);
    }
  });

  it("`mismoSistema` dice que NO entre máquinas distintas", () => {
    // La salvaguarda de todo esto: dos instalaciones con PLC distinto no se
    // correlacionan. Con un solo sistema dado de alta la comprobación no
    // aplica, y decirlo es mejor que fingir que se comprobó.
    if (SISTEMAS.length < 2) return;
    expect(mismoSistema(SISTEMAS[0].puntos()[0], SISTEMAS[1].puntos()[0])).toBe(false);
  });
});

describe("el registro se puede recorrer sin conocer las máquinas", () => {
  it("`valorSimuladoDe` sirve cualquier punto de cualquier sistema", () => {
    // Es la función de la que cuelga el transporte falso del backend. Si
    // fallara para una máquina, esa máquina volvería a caer en la rama de
    // «punto de escritura» y saldría con `value: null` y calidad BUENA.
    for (const s of SISTEMAS) {
      for (const p of s.puntos()) {
        expect(valorSimuladoDe(p, T0)).not.toBeUndefined();
      }
    }
  });

  it("los índices por id cuadran con la lista", () => {
    expect(SISTEMA_IDS).toEqual(SISTEMAS.map((s) => s.id));
    for (const s of SISTEMAS) expect(SISTEMA[s.id]).toBe(s);
  });
});

/**
 * ── RECONOCER UN NOMBRE DE SEÑAL, EN CUALQUIER MÁQUINA ─────────────
 *
 * `sistemasDeSenal` es la única puerta por la que el asistente averigua a qué
 * máquina pertenece un nombre que no es del tanque. Comparaba con `===`, y las
 * etiquetas de esta planta son compuestas —«Velocidad eficaz · Lado acople»—,
 * así que nadie las escribe enteras: con «velocidad eficaz» devolvía lista
 * vacía y el asistente contestaba que esa señal no existe EN LA PLANTA,
 * existiendo en la máquina de al lado.
 *
 * Estas pruebas fijan las dos mitades del arreglo, que tiran en direcciones
 * contrarias y por eso se prueban juntas: reconocer MÁS nombres, sin empezar a
 * ELEGIR por nadie.
 */
describe("el registro reconoce un nombre de señal sin exigir la etiqueta exacta", () => {
  it("un nombre parcial encuentra la señal, y en su máquina", () => {
    const r = sistemasDeSenal("velocidad eficaz");

    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.sistema === "vibraciones")).toBe(true);
  });

  it("la etiqueta exacta gana sobre la coincidencia parcial", () => {
    // Quien acierta el nombre entero recibe UNA señal, no la familia: la
    // igualdad se resuelve antes y no compite con la contención.
    expect(sistemasDeSenal("Velocidad eficaz · Lado acople")).toEqual([
      { sistema: "vibraciones", clave: "vRMS_S1" },
    ]);
  });

  it("«velocidad» a secas no se confunde con «velocidad eficaz»", () => {
    /*
     * La trampa del catálogo: «Velocidad» (rpm, del variador) es subcadena de
     * «Velocidad eficaz» (mm/s, de un acelerómetro). Son dos señales distintas
     * en dos sitios distintos de la máquina, y colapsarlas daría una respuesta
     * con unidad real y señal cambiada.
     */
    const eficaz = sistemasDeSenal("velocidad eficaz").map((x) => x.clave);
    expect(eficaz).not.toContain("velocidad");

    expect(sistemasDeSenal("velocidad del variador")).toEqual([
      { sistema: "vibraciones", clave: "velocidad" },
    ]);
  });

  it("un nombre ambiguo devuelve TODOS los candidatos, no el primero", () => {
    /*
     * La regla que no cambia: reconocer más nombres no es elegir por quien
     * pregunta. «Velocidad eficaz» sin decir el apoyo son tres señales de tres
     * puntos de medida, y quien llama tiene que preguntar cuál — devolver la
     * primera es como se contesta correctamente sobre el apoyo equivocado.
     */
    const r = sistemasDeSenal("velocidad eficaz");
    expect(r.length).toBe(3);
    expect(new Set(r.map((x) => x.clave)).size).toBe(3);
  });

  it("un nombre que no existe en ninguna máquina no inventa una", () => {
    expect(sistemasDeSenal("zumbido del compresor")).toEqual([]);
    expect(sistemasDeSenal("")).toEqual([]);
    // Un fragmento no dispara DENTRO de otra palabra: «601 rpm» lleva un «1»
    // pegado a otras cifras y no puede resolver al apoyo 1.
    expect(sistemasDeSenal("601 rpm")).toEqual([]);
  });

  it("un nombre corto vale, pero como palabra entera", () => {
    /*
     * «DKW» son tres letras y el umbral de contención exige cuatro, así que
     * se descartaba: preguntado por «el DKW del sensor 1», el asistente
     * contestó que esa señal NO EXISTE, teniendo su serie en el historiador.
     *
     * Las cortas cuentan ahora, pero tienen que aparecer como palabra
     * completa. Eso conserva la razón del umbral —que «S1» no dispare dentro
     * de otra palabra— sin perder los nombres que la gente usa de verdad.
     */
    const dkw = sistemasDeSenal("DKW");
    expect(dkw.length).toBe(3);
    expect(dkw.every((x) => x.clave.startsWith("DKW_"))).toBe(true);

    // Y con el apoyo dicho, una sola.
    expect(sistemasDeSenal("DKW del Sensor 1")).toEqual([
      { sistema: "vibraciones", clave: "DKW_S1" },
    ]);
  });

  it("nombrar sólo el APOYO no elige una medida por él", () => {
    /*
     * «S1» y «sensor 1» nombran el punto de medida, no la señal: hay diez
     * señales en ese apoyo. Antes salía una sola —`DKW_S1`— porque el
     * desempate por prefijo medía el largo del nombre de la medida y ganaba
     * la más corta. Eso es elegir al azar y presentarlo como certeza.
     */
    const porApoyo = sistemasDeSenal("sensor 1");
    expect(porApoyo.length).toBeGreaterThan(1);
    expect(porApoyo.every((x) => x.clave.endsWith("_S1"))).toBe(true);
  });

  it("cada máquina resuelve sus propias claves, sin pisarse", () => {
    // En bucle y sin nombrar máquinas: la que se dé de alta mañana tiene que
    // poder resolver sus claves igual, y NO aparecer en las de las demás.
    for (const sistema of SISTEMAS) {
      for (const clave of sistema.claves()) {
        const r = sistemasDeSenal(clave);
        expect(r.some((x) => x.sistema === sistema.id && x.clave === clave)).toBe(true);
      }
    }
  });
});
