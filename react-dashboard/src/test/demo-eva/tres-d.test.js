/**
 * tres-d.test.js
 * ------------------------------------------------------------------
 * El contrato estado → comportamiento 3D de Demo EVA, y el layout de la maqueta.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * Lo que se verifica no es que el código funcione —es una tabla— sino cuatro
 * reglas de DISEÑO que ningún compilador comprueba y que se erosionan solas al
 * añadir estados o activos:
 *
 *  1. La regla de movimiento de `lib/motion.js`: un bucle es una alarma. En 3D
 *     todo invita a girar, y basta con que cada estado nuevo llegue con «un
 *     detallito animado» para acabar con la pantalla que la regla describe.
 *  2. Ningún par de estados se distingue SÓLO por el color.
 *  3. El vocabulario no diverge del dominio: etiqueta y token se dicen en un
 *     solo sitio.
 *  4. La maqueta no puede quedarse sin pintar un activo en silencio.
 *
 * Las cuatro se rompen sin que nada falle a la vista.
 */
import { describe, expect, it } from "vitest";

import { ESTADOS, ESTADOS_ORDEN, estadoInfo } from "@/Demo-EVA/domain/estado.js";
import { ACTIVO_IDS } from "@/Demo-EVA/domain/activos.js";
import { createSistema } from "@/Demo-EVA/domain/sistema.js";
import {
  RPM_MAX,
  RPM_MIN,
  RPM_NOMINAL,
  comportamiento,
  comportamientoReducido,
  frameloopDe,
  rpmDe,
} from "@/Demo-EVA/three-d/lib/comportamiento.js";
import { LAYOUT, TRAMOS, activosColocados, posicionDe, tramos } from "@/Demo-EVA/three-d/lib/layout.js";

const TODAS = Object.keys(ESTADOS);

describe("cobertura del vocabulario", () => {
  it("todo estado del dominio tiene comportamiento", () => {
    // Si mañana se da de alta un estado nuevo, esta prueba lo caza antes de que
    // el modelo 3D lo pinte como «sin dato» en silencio.
    for (const key of TODAS) {
      expect(comportamiento(key).key, `falta el estado "${key}"`).toBe(key);
    }
  });

  it("una clave desconocida cae en «sin dato», no revienta", () => {
    for (const basura of ["", null, undefined, "running", "alarma", "RUNNING", 42]) {
      expect(comportamiento(basura).key).toBe("sin_dato");
    }
  });

  it("la etiqueta y el token salen del dominio, no de la tabla 3D", () => {
    // Es lo que impide que el 3D y las tarjetas 2D digan cosas distintas del
    // mismo estado.
    for (const key of TODAS) {
      const c = comportamiento(key);
      expect(c.label).toBe(estadoInfo(key).label);
      expect(c.token).toBe(estadoInfo(key).token);
    }
  });
});

describe("la regla de movimiento", () => {
  it("sólo «critico» lleva bucle, y es el de alarma", () => {
    for (const key of TODAS) {
      const esperado = key === "critico" ? "alarma" : "ninguno";
      expect(comportamiento(key).bucle, `bucle de "${key}"`).toBe(esperado);
    }
  });

  it("sólo «critico» destella; el resto de balizas son fijas o apagadas", () => {
    for (const key of TODAS) {
      const { patron } = comportamiento(key).baliza;
      if (key === "critico") expect(patron).toBe("destello");
      else expect(["fija", "apagada"], `baliza de "${key}"`).toContain(patron);
    }
  });

  it("con movimiento reducido no queda ningún bucle, y el estado sigue comunicando", () => {
    for (const key of TODAS) {
      const c = comportamientoReducido(key);
      expect(c.bucle, key).toBe("ninguno");
      expect(c.baliza.hz, key).toBe(0);
      // Lo que se pierde en movimiento se recupera como presencia fija: sin
      // esto, un estado que comunicaba con el destello se quedaría mudo.
      if (comportamiento(key).bucle !== "ninguno") expect(c.halo, key).toBe("doble");
    }
  });
});

describe("ningún par de estados se distingue sólo por el color", () => {
  /**
   * La firma junta los canales que NO son el tinte: baliza, opacidad,
   * desaturado, malla y halo. Dos estados con la misma firma serían
   * indistinguibles para quien no perciba la diferencia de tono, y a tres
   * metros de una televisión eso es cualquiera.
   */
  const firma = (c) =>
    [
      c.baliza.patron,
      c.baliza.intensidad,
      c.material.opacidad,
      c.material.desaturar,
      c.material.wireframe,
      c.halo,
    ].join("|");

  const sinColisiones = (descriptorDe, etiqueta) => {
    const vistas = new Map();
    for (const key of TODAS) {
      const f = firma(descriptorDe(key));
      expect(
        vistas.has(f),
        `${etiqueta}: "${key}" y "${vistas.get(f)}" sólo se distinguen por el color`
      ).toBe(false);
      vistas.set(f, key);
    }
  };

  it("cada estado tiene una firma no cromática distinta de los demás", () => {
    sinColisiones(comportamiento, "normal");
  });

  it("y siguen siendo distintos con `prefers-reduced-motion`", () => {
    // Éste es el caso que se escapa: al quitar el destello, `critico` pierde su
    // canal más fuerte y podría quedar idéntico a `atencion`. Lo que lo separa
    // entonces es el anillo doble.
    sinColisiones(comportamientoReducido, "movimiento reducido");
  });
});

describe("ritmo del impulsor", () => {
  const enMarcha = (carga) =>
    createSistema({
      cargaMotor: { value: carga },
      flujoInstantaneo: { value: 20 },
    });

  it("en reposo el impulsor se para del todo", () => {
    const sistema = createSistema({
      cargaMotor: { value: 0 },
      flujoInstantaneo: { value: -0.04 },
    });
    expect(sistema.enReposo).toBe(true);
    expect(rpmDe(sistema)).toMatchObject({ rpm: 0, medido: false, motivo: "reposo" });
  });

  it("con carga medida, el ritmo la escala dentro del rango visible", () => {
    expect(rpmDe(enMarcha(0)).rpm).toBeCloseTo(RPM_MIN, 6);
    expect(rpmDe(enMarcha(100)).rpm).toBeCloseTo(RPM_MAX, 6);
    expect(rpmDe(enMarcha(50)).rpm).toBeCloseTo((RPM_MIN + RPM_MAX) / 2, 6);
    expect(rpmDe(enMarcha(50)).medido).toBe(true);
  });

  it("impulsando sin carga medida gira a ritmo nominal y lo confiesa", () => {
    // Parar el modelo diría «esta bomba no impulsa», que es lo contrario de lo
    // que informó el servidor. Es la regla del hueco, llevada a la geometría.
    const sistema = createSistema({
      cargaMotor: { value: null },
      flujoInstantaneo: { value: 20 },
    });
    const r = rpmDe(sistema);
    expect(r.rpm).toBe(RPM_NOMINAL);
    expect(r.medido).toBe(false);
    expect(r.motivo).toBe("sin-carga");
  });

  it("un valor fuera de rango no saca al impulsor de su ventana visible", () => {
    expect(rpmDe(enMarcha(340)).rpm).toBeCloseTo(RPM_MAX, 6);
    expect(rpmDe(enMarcha(-20)).rpm).toBeCloseTo(RPM_MIN, 6);
  });
});

describe("frameloop", () => {
  it("una instalación en reposo y en banda deja la GPU a cero", () => {
    expect(frameloopDe({ estados: ["nominal", "reposo"], rpm: 0 })).toBe("demand");
  });

  it("basta un activo en crítico, o la bomba girando, para volver a dibujar", () => {
    expect(frameloopDe({ estados: ["nominal", "critico"], rpm: 0 })).toBe("always");
    expect(frameloopDe({ estados: ["nominal"], rpm: 95 })).toBe("always");
  });

  it("con movimiento reducido siempre es bajo demanda", () => {
    expect(frameloopDe({ estados: ["critico"], rpm: 120, reduce: true })).toBe("demand");
  });

  it("sin nada en pantalla no se dibuja", () => {
    expect(frameloopDe({})).toBe("demand");
  });
});

describe("layout de la maqueta", () => {
  it("todos los activos del dominio tienen sitio, y no sobra ninguno", () => {
    // Si mañana se da de alta un activo, la maqueta no puede quedarse sin
    // pintarlo en silencio.
    expect(Object.keys(LAYOUT).sort()).toEqual([...ACTIVO_IDS].sort());
    expect(activosColocados()).toHaveLength(ACTIVO_IDS.length);
  });

  it("un activo sin sitio devuelve null, no un (0,0)", () => {
    // Dos activos apilados en el origen serían un fallo difícil de leer; uno
    // que falta se ve enseguida.
    expect(posicionDe("no-existe")).toBeNull();
  });

  it("ningún par de activos se solapa", () => {
    const puestos = Object.entries(LAYOUT);
    for (let i = 0; i < puestos.length; i++) {
      for (let j = i + 1; j < puestos.length; j++) {
        const [ia, a] = puestos[i];
        const [ib, b] = puestos[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        expect(d, `"${ia}" y "${ib}" están a ${d.toFixed(2)} m`).toBeGreaterThan(2.2);
      }
    }
  });

  it("los tramos de tubería unen activos que existen, y se resuelven", () => {
    for (const tr of TRAMOS) {
      expect(ACTIVO_IDS, `origen de "${tr.id}"`).toContain(tr.de);
      expect(ACTIVO_IDS, `destino de "${tr.id}"`).toContain(tr.a);
    }
    expect(tramos()).toHaveLength(TRAMOS.length);
    for (const tr of tramos()) {
      expect(tr.a1).not.toBeNull();
      expect(tr.a2).not.toBeNull();
    }
  });

  it("el orden de los estados va de peor a mejor, y la leyenda lo hereda", () => {
    expect(ESTADOS_ORDEN[0]).toBe("critico");
    expect(ESTADOS_ORDEN.at(-1)).toBe("nominal");
  });
});
