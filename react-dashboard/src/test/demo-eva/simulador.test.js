/**
 * simulador.test.js
 * ------------------------------------------------------------------
 * El simulador de Demo EVA: que sirva las ocho señales sin red, que la serie
 * histórica empalme con el valor en vivo, y —lo que más importa— que **no le
 * enseñe a la interfaz una instalación que no existe**.
 *
 * ── QUÉ SE PRUEBA AQUÍ Y QUÉ NO ────────────────────────────────────
 *
 * No se prueban los números concretos: son de mentira y cambiarlos es libre. Se
 * prueban las PROPIEDADES por las que el simulador vale para trabajar la
 * interfaz, y que se pueden romper sin notarlo al retocar el modelo:
 *
 *  1. Es determinista en el reloj. Sin eso, la gráfica del historiador acabaría
 *     en un punto y la tarjeta enseñaría otro.
 *  2. Recorre los estados. Un simulador que se quede siempre en `nominal` deja
 *     sin ejercitar la franja de atención, los coral y el reposo — que es la
 *     mitad de la pantalla.
 *  3. Respeta `historizado`. Cuatro señales no tienen serie propia en el servidor
 *     real y la interfaz está construida sobre ese hecho.
 *  4. Se queda dentro de la `escala` del catálogo, que es la que usan el arco y
 *     las barras para su geometría.
 */
import { describe, expect, it } from "vitest";

import {
  CICLO_MS,
  JORNADA_MS,
  createTransporteEva,
  enMarcha,
  mediaDelTramo,
  valorEn,
} from "@/Demo-EVA/data/simulador.js";
import { SIN_SERIE } from "@/Demo-EVA/data/historia.js";
import {
  SENALES,
  SENAL_KEYS,
  TODOS_LOS_PUNTOS,
  historizadas,
  pointName,
} from "@/Demo-EVA/domain/senales.js";
import { createSistema } from "@/Demo-EVA/domain/sistema.js";
import { SIN_CAOS, isGoodQuality } from "@/lib/iconics";

/** Reloj fijo, para que ninguna prueba dependa de cuándo se ejecute. */
const T0 = Date.UTC(2026, 7, 18, 9, 0, 0);

/** Transporte sin caos y con el reloj congelado en `ms`. */
const enT = (ms) => createTransporteEva({ chaos: SIN_CAOS, ahora: () => ms, rnd: () => 1 });

/** El sistema de dominio tal como quedaría en ese instante. */
const sistemaEn = (ms) =>
  createSistema(
    Object.fromEntries(SENAL_KEYS.map((k) => [k, { value: valorEn(k, ms), receivedAt: new Date(ms) }]))
  );

/** Primer instante a partir de `desde` que cumpla el predicado, o `null`. */
function buscar(desde, predicado, { pasoMs = 5_000, hastaMs = 45 * 60_000 } = {}) {
  for (let ms = desde; ms < desde + hastaMs; ms += pasoMs) {
    if (predicado(ms)) return ms;
  }
  return null;
}

describe("el valor es función del reloj, no del azar", () => {
  it("dos lecturas del mismo instante dan exactamente lo mismo", async () => {
    // Es lo que hace que la cola de la gráfica y el valor de la tarjeta
    // coincidan: las dos salen de la misma función.
    const a = await enT(T0).read(TODOS_LOS_PUNTOS);
    const b = await enT(T0).read(TODOS_LOS_PUNTOS);

    for (const punto of TODOS_LOS_PUNTOS) {
      expect(b.get(punto), punto).toEqual(a.get(punto));
    }
  });

  it("un ciclo sirve los ocho puntos con calidad buena", async () => {
    const salida = await enT(T0).read(TODOS_LOS_PUNTOS);

    // Se comprueba con `isGoodQuality` y no contra un número: conviven dos
    // convenciones de calidad (OPC-DA 192 y OPC-UA 0) y el motor acepta las dos.
    expect(salida.size).toBe(8);
    for (const punto of TODOS_LOS_PUNTOS) {
      expect(isGoodQuality(salida.get(punto).quality), punto).toBe(true);
    }

    // Y llega entero al dominio: ocho medidas, ninguna descartada.
    const sistema = sistemaEn(T0);
    expect(sistema.resumen.medidas).toBe(8);
  });

  it("ignora en silencio los puntos que no son de este árbol", async () => {
    const salida = await enT(T0).read(["ac:RESONAC/LIN/1/OEE", pointName("nivelTanque")]);

    // Para el motor de polling eso es un hueco, que es exactamente lo que es:
    // el simulador de Resonac es otro y vive en `lib/iconics/fakeTransport.js`.
    expect(salida.size).toBe(1);
    expect(salida.has(pointName("nivelTanque"))).toBe(true);
  });
});

describe("el ciclo de bombeo mueve la instalación", () => {
  it("hay marcha y hay paro dentro de un solo ciclo", () => {
    expect(enMarcha(T0)).not.toBe(enMarcha(T0 + CICLO_MS * 0.9));
  });

  it("con la bomba parada el sistema se declara en reposo, no en avería", () => {
    // Sin esta noción, un caudal de 0 caería por debajo de su límite duro y la
    // pantalla abriría en rojo permanente cada vez que la bomba descansa.
    const paro = buscar(T0, (ms) => !enMarcha(ms));
    const sistema = sistemaEn(paro);

    expect(sistema.enReposo).toBe(true);
    for (const s of sistema.lista) {
      if (s.soloEnMarcha) expect(s.estado, s.key).toBe("reposo");
    }
  });

  it("la presión en paro está fuera de banda pero el estado es reposo", () => {
    // La discrepancia es deliberada: es el camino que la tarjeta explica, y sin
    // ella no se ejecuta nunca.
    const paro = buscar(T0, (ms) => !enMarcha(ms));
    const presion = sistemaEn(paro).senales.presionRelativa;

    expect(presion.banda).toBe("critico");
    expect(presion.estado).toBe("reposo");
  });

  it("con la bomba en marcha el caudal y la carga son medidas de verdad", () => {
    const marcha = buscar(T0, (ms) => enMarcha(ms));
    const sistema = sistemaEn(marcha);

    expect(sistema.enReposo).toBe(false);
    expect(sistema.senales.flujoInstantaneo.valor).toBeGreaterThan(5);
    expect(sistema.senales.cargaMotor.valor).toBeGreaterThan(5);
  });
});

describe("recorre los estados en vez de quedarse en nominal", () => {
  /* Una rotación completa de eventos son siete ciclos. Se barre entera y se
     recogen los estados que llega a producir. */
  const vistos = new Set();
  for (let ms = T0; ms < T0 + 7 * CICLO_MS; ms += 5_000) {
    for (const s of sistemaEn(ms).lista) vistos.add(s.estado);
  }

  it.each(["nominal", "atencion", "critico", "reposo"])(
    "alguna señal alcanza «%s» a lo largo de una rotación de eventos",
    (estado) => {
      expect(vistos.has(estado)).toBe(true);
    }
  );

  it("la sobrecarga del motor hunde además la eficiencia", () => {
    // El mismo evento mueve dos señales de forma coherente. Si un día se pintan
    // juntas, la historia que cuentan tiene que sostenerse.
    const pico = buscar(T0, (ms) => enMarcha(ms) && valorEn("cargaMotor", ms) > 95);
    expect(pico).not.toBeNull();
    expect(valorEn("eficienciaEnergetica", pico)).toBeLessThan(60);
  });
});

describe("ninguna señal se sale de su escala declarada", () => {
  /*
   * La `escala` del catálogo es la geometría del arco y de las barras, así que
   * salirse de ella no da un número raro: da un medidor desbordado.
   *
   * Se barre **jornada y media**, no una rotación de eventos: el pico de un
   * evento se suma a la deriva lenta, y los dos hay que verlos coincidir. Con
   * sólo 42 min, un objetivo mal elegido pasaría desapercibido durante horas.
   */
  it.each(SENAL_KEYS.filter((k) => SENALES[k].escala))(
    "%s se queda dentro de su escala a lo largo de jornada y media",
    (clave) => {
      const { min, max } = SENALES[clave].escala;
      for (let ms = T0; ms < T0 + 1.5 * JORNADA_MS; ms += 10_000) {
        const v = valorEn(clave, ms);
        expect(v, `${clave} @ ${ms}`).toBeGreaterThanOrEqual(min);
        expect(v, `${clave} @ ${ms}`).toBeLessThanOrEqual(max);
      }
    }
  );
});

describe("la historia no miente sobre lo que el servidor publica", () => {
  it("las señales sin serie propia devuelven el motivo, no una curva inventada", async () => {
    const transporte = enT(T0);

    for (const clave of SENAL_KEYS.filter((k) => !SENALES[k].historizado)) {
      const { datos, motivo } = await transporte.readSerie(clave);
      expect(datos, clave).toEqual([]);
      expect(motivo, clave).toBe(SIN_SERIE);
    }
  });

  it("una clave desconocida se rechaza sin salir a pedir nada", async () => {
    const { datos, motivo } = await enT(T0).readSerie("caudalDeMentira");
    expect(datos).toEqual([]);
    expect(motivo).toMatch(/desconocida/i);
  });

  it("las cuatro historizadas devuelven la rejilla pedida, en orden y hasta ahora", async () => {
    const transporte = enT(T0);

    for (const clave of historizadas()) {
      const { datos, motivo } = await transporte.readSerie(clave, { horas: 6, puntos: 24 });

      expect(motivo, clave).toBeNull();
      expect(datos, clave).toHaveLength(24);
      expect(datos.at(-1).t.getTime(), clave).toBe(T0);
      expect(datos[0].t.getTime(), clave).toBe(T0 - 6 * 3_600_000 + (6 * 3_600_000) / 24);

      for (let i = 1; i < datos.length; i++) {
        expect(datos[i].t.getTime(), clave).toBeGreaterThan(datos[i - 1].t.getTime());
        expect(Number.isFinite(datos[i].valor), clave).toBe(true);
      }
    }
  });

  it("el tramo se promedia, así que el ciclo rápido no sale como aliasing", async () => {
    /*
     * El caudal salta entre ~0 y ~27 cada seis minutos. Muestreado a pelo sobre
     * una rejilla de quince, la gráfica sería ruido sin significado; promediado
     * —que es lo que hace el agregado `Average` del servidor— queda la deriva
     * lenta, y ningún punto cae ni en el cero ni en el pico.
     */
    const { datos } = await enT(T0).readSerie("flujoInstantaneo", { horas: 6, puntos: 24 });
    const valores = datos.map((d) => d.valor);

    expect(Math.min(...valores)).toBeGreaterThan(5);
    expect(Math.max(...valores)).toBeLessThan(30);
  });

  it("el último punto de la serie empalma con el valor en vivo", async () => {
    // Es la propiedad que justifica que el modelo sea función del reloj: el
    // borde derecho de la gráfica y el número de la tarjeta hablan del mismo
    // instante, así que no puede haber un escalón entre los dos.
    const { datos } = await enT(T0).readSerie("nivelTanque", { horas: 6, puntos: 24 });
    const paso = (6 * 3_600_000) / 24;

    expect(datos.at(-1).valor).toBeCloseTo(mediaDelTramo("nivelTanque", T0 - paso, T0), 6);
    expect(Math.abs(datos.at(-1).valor - valorEn("nivelTanque", T0))).toBeLessThan(6);
  });
});
