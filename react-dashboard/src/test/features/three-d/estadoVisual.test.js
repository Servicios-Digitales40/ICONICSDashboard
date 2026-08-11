/**
 * estadoVisual.test.js
 * ------------------------------------------------------------------
 * El contrato estado → comportamiento 3D.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * Lo que se verifica aquí no es que el código funcione —es una tabla, no puede
 * fallar— sino que se respeten tres reglas de DISEÑO que ningún compilador
 * comprueba y que se erosionan solas al añadir estados:
 *
 *  1. La regla de movimiento de `lib/motion.js`: un bucle es una alarma. En 3D
 *     todo invita a girar y a pulsar, y basta con que cada estado nuevo llegue
 *     con «un detallito animado» para acabar con la pantalla que la regla
 *     describe: seis cosas parpadeando y el ojo ignorándolas todas.
 *  2. Ningún par de estados se distingue SÓLO por el color. Es lo que hace la
 *     vista legible con daltonismo y a tres metros.
 *  3. El vocabulario no diverge del dominio. La etiqueta y el color de un
 *     estado se dicen en un solo sitio, `lib/domain/estado.js`.
 *
 * Las tres se rompen sin que nada falle a la vista.
 */
import { describe, expect, it } from "vitest";

import { ESTADOS, estadoInfo } from "@/lib/domain/index.js";
import {
  CLAVES_CANONICAS,
  CLAVES_EXTENDIDAS,
  RPM_MAX,
  RPM_MIN,
  RPM_NOMINAL,
  comportamiento,
  comportamientoReducido,
  rpmDe,
} from "@/features/three-d/lib/estadoVisual.js";

const TODAS = [...CLAVES_CANONICAS, ...CLAVES_EXTENDIDAS];

describe("cobertura del vocabulario", () => {
  it("todo estado que emite ICONICS tiene comportamiento", () => {
    // Si mañana se da de alta un estado nuevo en el dominio, esta prueba lo
    // caza antes de que el modelo 3D lo pinte como «sin dato» en silencio.
    for (const key of Object.keys(ESTADOS)) {
      expect(CLAVES_CANONICAS, `falta el estado "${key}"`).toContain(key);
    }
  });

  it("una clave desconocida cae en «sin dato», no revienta", () => {
    for (const basura of ["", null, undefined, "Operando", "RUNNING", 42]) {
      expect(comportamiento(basura).key).toBe("unknown");
    }
  });

  it("los extendidos siguen sin existir en el servidor", () => {
    // El día que uno de ellos se dé de alta en `estado.js`, esta prueba falla
    // y recuerda bajarlo de EXTENDIDOS a CANONICOS — que es lo que hace que
    // deje de rotularse como «propuesta» en la interfaz.
    for (const key of CLAVES_EXTENDIDAS) {
      expect(ESTADOS[key], `"${key}" ya está en el dominio`).toBeUndefined();
      expect(comportamiento(key).esExtendido).toBe(true);
    }
  });

  it("etiqueta y color de los canónicos salen del dominio, no de la tabla", () => {
    for (const key of CLAVES_CANONICAS) {
      const c = comportamiento(key);
      expect(c.label).toBe(estadoInfo(key).label);
      expect(c.token).toBe(estadoInfo(key).token);
      expect(c.esExtendido).toBe(false);
    }
  });
});

describe("la regla de movimiento", () => {
  it("sólo hay dos bucles en toda la aplicación", () => {
    const conBucle = TODAS.map(comportamiento).filter((c) => c.bucle !== "ninguno");

    expect(conBucle.map((c) => [c.key, c.bucle])).toEqual([
      ["running", "informativo"], // el giro codifica producción
      ["alarma", "alarma"], // lo único que parpadea
    ]);
  });

  it("el único movimiento continuo es el que codifica un dato", () => {
    for (const key of TODAS) {
      const c = comportamiento(key);
      const continuo = c.movimiento.tipo !== "ninguno" && !c.movimiento.unaVez;
      if (continuo) expect(c.bucle, `"${key}" se mueve en bucle sin informar`).toBe("informativo");
    }
  });

  it("el paro de emergencia NO parpadea: la quietud es el mensaje", () => {
    const paro = comportamiento("paro_emergencia");
    expect(paro.baliza.patron).toBe("fija");
    expect(paro.movimiento.tipo).toBe("ninguno");
    // Y aun así tiene que distinguirse de la alarma sin depender del color:
    // los dos son coral.
    const alarma = comportamiento("alarma");
    expect(paro.token).toBe(alarma.token);
    expect(paro.seta).not.toBe(alarma.seta);
  });
});

describe("movimiento reducido", () => {
  it("no deja ni un bucle ni un movimiento", () => {
    for (const key of TODAS) {
      const c = comportamientoReducido(key);
      expect(c.bucle, key).toBe("ninguno");
      expect(c.movimiento.tipo, key).toBe("ninguno");
      expect(c.baliza.hz, key).toBe(0);
    }
  });

  it("lo que se anunciaba con movimiento conserva un sustituto estático", () => {
    // Sin esto, «alarma» sin latido se vería igual que una máquina normal.
    // Es el mismo problema que `GaugeCard` resuelve con un fondo de alerta fijo.
    for (const key of TODAS) {
      if (comportamiento(key).bucle === "ninguno") continue;

      const c = comportamientoReducido(key);
      expect(c.halo || c.baliza.intensidad === 1, `"${key}" se queda mudo`).toBe(true);
    }
  });

  it("no toca los estados que ya eran estáticos", () => {
    expect(comportamientoReducido("standby")).toEqual(comportamiento("standby"));
    expect(comportamientoReducido("unknown")).toEqual(comportamiento("unknown"));
  });
});

describe("legibilidad a tres metros", () => {
  it("dos estados canónicos nunca se distinguen sólo por el color", () => {
    // La firma de los canales que NO son color: silueta, baliza y movimiento.
    const silueta = (key) => {
      const c = comportamiento(key);
      return JSON.stringify([
        c.pose,
        c.pieza,
        c.baliza.patron,
        c.baliza.intensidad,
        c.movimiento.tipo,
        c.material.opacidad,
        c.material.desaturar,
        c.material.wireframe,
        c.halo,
        c.seta,
      ]);
    };

    const vistas = new Map();
    for (const key of CLAVES_CANONICAS) {
      const s = silueta(key);
      expect(vistas.has(s), `"${key}" y "${vistas.get(s)}" sólo se diferencian por el color`).toBe(false);
      vistas.set(s, key);
    }
  });

  it("la cinta va vacía salvo donde hay pieza en proceso", () => {
    // «Cinta vacía» es la señal de Limpieza. Si algún día se declara `pieza`
    // en ese estado, deja de tener silueta propia y sólo lo distingue el
    // violeta — que es lo que esta suite existe para impedir.
    expect(comportamiento("limpieza").pieza).toBe(false);
    expect(comportamiento("running").pieza).toBe(true);
    expect(comportamiento("setup").pieza).toBe(true);

    for (const key of TODAS) {
      expect(typeof comportamiento(key).pieza, key).toBe("boolean");
    }
  });

  it("«sin comunicación» y «sin dato» no se confunden con una máquina parada", () => {
    // Los dos son ausencia de información, no un estado físico, y tienen que
    // verse como tal: translúcidos, nunca como una máquina normal apagada.
    for (const key of ["commfail", "unknown"]) {
      expect(comportamiento(key).material.opacidad).toBeLessThan(1);
    }
    expect(comportamiento("standby").material.opacidad).toBe(1);
  });

  it("«receso» y «stand by» comparten comportamiento a propósito", () => {
    const { key: _k, label: _l, token: _t, esExtendido: _e, lectura: _lec, ...receso } = comportamiento("receso");
    const { key: _k2, label: _l2, token: _t2, esExtendido: _e2, lectura: _lec2, ...standby } = comportamiento("standby");
    expect(receso).toEqual(standby);
  });
});

describe("rpmDe · el ritmo del husillo", () => {
  const maquina = (extra) => ({ estado: "running", rendimiento: 50, ...extra });

  it("sólo gira si la máquina está operando", () => {
    for (const estado of ["alarma", "commfail", "setup", "standby", "unknown"]) {
      expect(rpmDe(maquina({ estado })).rpm).toBe(0);
    }
    expect(rpmDe(null).rpm).toBe(0);
  });

  it("el ritmo sale del rendimiento y se queda dentro del rango", () => {
    expect(rpmDe(maquina({ rendimiento: 0 })).rpm).toBe(RPM_MIN);
    expect(rpmDe(maquina({ rendimiento: 100 })).rpm).toBe(RPM_MAX);
    expect(rpmDe(maquina({ rendimiento: 50 })).rpm).toBe((RPM_MIN + RPM_MAX) / 2);

    // Un factor fuera de escala del servidor no dispara el modelo.
    expect(rpmDe(maquina({ rendimiento: 250 })).rpm).toBe(RPM_MAX);
    expect(rpmDe(maquina({ rendimiento: -30 })).rpm).toBe(RPM_MIN);
  });

  it("sin rendimiento medido gira a ritmo nominal, no se para", () => {
    // Parar el modelo diría «esta máquina no produce», que es lo contrario de
    // lo que informó el servidor. Un hueco es un hueco, no un cero.
    for (const r of [null, undefined, NaN, Infinity]) {
      const { rpm, medido } = rpmDe(maquina({ rendimiento: r }));
      expect(rpm).toBe(RPM_NOMINAL);
      expect(medido).toBe(false);
    }
  });

  it("distingue el ritmo medido del supuesto", () => {
    expect(rpmDe(maquina({ rendimiento: 70 })).medido).toBe(true);
    expect(rpmDe(maquina({ rendimiento: null })).medido).toBe(false);
  });
});
