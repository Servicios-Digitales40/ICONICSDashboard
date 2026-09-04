/**
 * rotor-3d.test.js
 * ------------------------------------------------------------------
 * El contrato de la vista 3D del BANCO DE ROTOR: qué estado le toca a un apoyo
 * y cuándo se permite girar el eje.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * Su hermana `tres-d.test.js` verifica el vocabulario compartido —la tabla
 * estado → comportamiento, la regla de los dos bucles, la separación no
 * cromática—, y todo eso se hereda aquí sin repetirlo. Lo que esta prueba
 * cubre es lo que sólo existe en esta máquina, y son dos decisiones que se
 * erosionan solas porque en las dos la versión CÓMODA es la equivocada:
 *
 *  1. **Un apoyo callado no está en banda.** Lo cómodo es que un canal sin
 *     `vRMS` caiga en `nominal` y la pantalla salga verde. Aquí tiene que
 *     salir `sin_dato`, y basta con que alguien meta un `?? 0` en el camino
 *     del valor para que deje de ser cierto sin que nada falle a la vista.
 *  2. **Un eje sin lectura de régimen no gira.** Lo cómodo es un ritmo por
 *     defecto para que la escena «se vea viva» en una demo. Girar sin dato
 *     afirmaría que la máquina está encendida, y esta máquina —a diferencia
 *     del tanque— no publica ninguna señal de la que deducirlo.
 *
 * Y una tercera que no es de esta máquina sino del reparto por capas: la
 * geometría de la escena tiene que cubrir el tren que declara el dominio, ni
 * más ni menos. Un elemento nuevo en `TREN_MECANICO` sin sitio en la escena se
 * dejaría de dibujar en silencio.
 */
import { describe, expect, it } from "vitest";

import { estadoInfo } from "@/Demo-EVA/domain/estado.js";
import {
  CANALES,
  EJES_MEDIDA,
  LIMITES_ISO,
  RPM_MINIMA_ISO,
  TREN_MECANICO,
  elementoDeCanal,
} from "@/Demo-EVA/domain/vibraciones.js";
import { ALTO_CHUMACERA } from "@/Demo-EVA/three-d/components/ChumaceraModel.jsx";
import {
  ALTURA_BANCADA,
  ALTURA_EJE,
  ALTURA_EJE_MONTAJE,
  BANCADA,
  EJE_DESDE,
  EJE_HASTA,
  ENCUADRES,
  POSICION_X,
  RPM_DIBUJO_MAX,
  RPM_DIBUJO_MIN,
  RPM_REAL_MAX,
  estadoDeApoyo,
  rpmEjeDe,
} from "@/Demo-EVA/three-d/lib/rotor.js";

/** Un apoyo sano: gira rápido, en zona A, sin banderas. */
const SANO = { vRMS: 0.4, aRMS: 1.1, aPeak: 3.2, DKW: 0.5, alarma: false, aviso: false };

describe("estado de un apoyo", () => {
  it("sin canal, y sin vRMS, no hay estado: es «sin dato», nunca «nominal»", () => {
    // La regla de siempre: un hueco no se disfraza de cero, ni de verde.
    expect(estadoDeApoyo(null, true)).toBe("sin_dato");
    expect(estadoDeApoyo(undefined, true)).toBe("sin_dato");
    expect(estadoDeApoyo({ ...SANO, vRMS: null }, true)).toBe("sin_dato");
    expect(estadoDeApoyo({ ...SANO, vRMS: undefined }, true)).toBe("sin_dato");
  });

  it("un cero de verdad SÍ se juzga, y cae en zona A", () => {
    // El contrapunto de la prueba anterior: lo que no se puede es INVENTAR un
    // cero. Un cero que el módulo entregó es una medida y se evalúa.
    expect(estadoDeApoyo({ ...SANO, vRMS: 0 }, true)).toBe("nominal");
  });

  it("la norma reparte las zonas de ISO 10816-1 Clase I", () => {
    expect(estadoDeApoyo({ ...SANO, vRMS: LIMITES_ISO.nueva - 0.01 }, true)).toBe("nominal");
    expect(estadoDeApoyo({ ...SANO, vRMS: LIMITES_ISO.aviso - 0.01 }, true)).toBe("nominal");
    expect(estadoDeApoyo({ ...SANO, vRMS: LIMITES_ISO.aviso + 0.01 }, true)).toBe("atencion");
    expect(estadoDeApoyo({ ...SANO, vRMS: LIMITES_ISO.alarma + 0.01 }, true)).toBe("critico");
  });

  it("si la norma no aplica, no se inventa un veredicto", () => {
    // Girando por debajo de RPM_MINIMA_ISO la única medida acotada deja de
    // significar algo. Incómodo y honesto: el apoyo sale sin criterio.
    expect(estadoDeApoyo(SANO, false)).toBe("sin_dato");
    // Y `null` —«no se sabe si aplica»— tampoco autoriza a juzgar.
    expect(estadoDeApoyo(SANO, null)).toBe("sin_dato");
  });

  it("la bandera del módulo manda sobre el veredicto de la norma", () => {
    /*
     * El SM 1281 vigila cosas que este catálogo no puede leer —el espectro de
     * envolvente, la cuarta frecuencia de rodamiento—. Si él enciende la
     * alarma con el vRMS en zona A, el que sabe más es él: pintar verde sería
     * contradecir al instrumento con un subconjunto de su información.
     */
    expect(estadoDeApoyo({ ...SANO, alarma: true }, true)).toBe("critico");
    expect(estadoDeApoyo({ ...SANO, aviso: true }, true)).toBe("atencion");
    // Y manda incluso cuando la norma no se pronuncia por régimen bajo.
    expect(estadoDeApoyo({ ...SANO, alarma: true }, false)).toBe("critico");
    expect(estadoDeApoyo({ ...SANO, aviso: true }, null)).toBe("atencion");
  });

  it("la alarma pesa más que el aviso cuando están las dos", () => {
    expect(estadoDeApoyo({ ...SANO, alarma: true, aviso: true }, true)).toBe("critico");
  });

  it("todo estado que devuelve existe en el vocabulario del dominio", () => {
    const casos = [
      estadoDeApoyo(null, true),
      estadoDeApoyo(SANO, true),
      estadoDeApoyo(SANO, false),
      estadoDeApoyo({ ...SANO, aviso: true }, true),
      estadoDeApoyo({ ...SANO, alarma: true }, true),
    ];
    for (const key of casos) expect(estadoInfo(key).key).toBe(key);
  });
});

describe("ritmo del eje", () => {
  it("sin lectura de régimen el eje se queda quieto, y lo confiesa", () => {
    for (const variador of [undefined, null, {}, { velocidad: null }, { velocidad: "1200" }]) {
      const g = rpmEjeDe(variador);
      expect(g.rpm).toBe(0);
      expect(g.medido).toBe(false);
      // `real: null` es lo que permite a la ficha escribir «no consta» en vez
      // de «parado», que son dos afirmaciones distintas.
      expect(g.real).toBe(null);
    }
  });

  it("un cero del variador SÍ es una medida: parado, y medido", () => {
    const g = rpmEjeDe({ velocidad: 0 });
    expect(g.rpm).toBe(0);
    expect(g.medido).toBe(true);
    expect(g.motivo).toBe("parado");
  });

  it("girando, el ritmo de dibujo se queda dentro de su ventana visible", () => {
    for (const real of [1, 120, 604, 1750, RPM_REAL_MAX, RPM_REAL_MAX * 3]) {
      const g = rpmEjeDe({ velocidad: real });
      expect(g.rpm).toBeGreaterThanOrEqual(RPM_DIBUJO_MIN);
      expect(g.rpm).toBeLessThanOrEqual(RPM_DIBUJO_MAX);
      expect(g.medido).toBe(true);
      expect(g.real).toBe(real);
    }
  });

  it("más régimen real es más ritmo dibujado, hasta el tope", () => {
    expect(rpmEjeDe({ velocidad: 600 }).rpm).toBeLessThan(rpmEjeDe({ velocidad: 1800 }).rpm);
    expect(rpmEjeDe({ velocidad: RPM_REAL_MAX }).rpm).toBe(RPM_DIBUJO_MAX);
  });

  it("el régimen mínimo de ISO no se ha movido por debajo de lo que la escena asume", () => {
    // La ficha del régimen explica el veredicto de la norma con este número.
    // Si el dominio lo cambia, esa explicación deja de ser cierta.
    expect(RPM_MINIMA_ISO).toBe(600);
  });
});

describe("la escena cubre el tren que declara el dominio", () => {
  it("todo elemento del tren tiene sitio en X, y no sobra ninguno", () => {
    const declarados = TREN_MECANICO.map((e) => e.id).sort();
    const colocados = Object.keys(POSICION_X).sort();
    expect(colocados).toEqual(declarados);
  });

  it("las piezas se colocan en el orden en que el giro las atraviesa", () => {
    const xs = TREN_MECANICO.map((e) => POSICION_X[e.id]);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i], `${TREN_MECANICO[i].id} debería ir después de ${TREN_MECANICO[i - 1].id}`)
        .toBeGreaterThan(xs[i - 1]);
    }
  });

  it("ningún par de piezas se planta en el mismo sitio", () => {
    const xs = Object.values(POSICION_X);
    expect(new Set(xs).size).toBe(xs.length);
  });

  it("los tres canales están montados, cada uno en una pieza distinta", () => {
    const elementos = CANALES.map((c) => elementoDeCanal(c.id));
    expect(elementos.every(Boolean)).toBe(true);
    expect(new Set(elementos.map((e) => e.id)).size).toBe(CANALES.length);
  });

  it("el disco de desbalance NO tiene sonda propia, y eso es el dato", () => {
    /*
     * Es la pieza que el banco existe para desequilibrar y se lee por los dos
     * apoyos que la flanquean. El día que alguien le asigne el canal del apoyo
     * más cercano «para que no quede vacío», esta prueba lo caza: sería decir
     * que el disco está instrumentado.
     */
    expect(elementoDeCanal("S2").id).not.toBe("disco");
    expect(elementoDeCanal("S3").id).not.toBe("disco");
    expect(TREN_MECANICO.find((e) => e.id === "disco").canal).toBe(null);
  });

  it("ningún canal declara un rodamiento que no se esté midiendo", () => {
    /*
     * S1 está sobre el motor y su 6205 ZZ sale del catálogo WEG: vale. S2 y S3
     * están sobre chumaceras cuyo modelo nadie tiene, así que tienen que ir en
     * `null` — un número de rodamiento ahí daría BPFO/BPFI/FTF de otra pieza.
     * Es el error que este módulo cometió con el 6204 ZZ de S3.
     */
    for (const c of CANALES) {
      const el = elementoDeCanal(c.id);
      if (el.tipo === "chumacera") {
        expect(c.rodamiento, `${c.id} está en una chumacera sin modelo conocido`).toBe(null);
      }
    }
  });
});

describe("la instrumentación declara lo que NO mide", () => {
  it("sólo hay eje vertical, y los que faltan están nombrados", () => {
    // La vista dibuja una flecha por cada uno: sólida los medidos, fantasma
    // los ausentes. Si esta lista se vacía, la escena deja de decir qué falta.
    expect(EJES_MEDIDA.medidos).toEqual(["vertical"]);
    expect(EJES_MEDIDA.ausentes).toContain("horizontal");
    expect(EJES_MEDIDA.ausentes).toContain("axial");
  });

  it("ningún eje está a la vez medido y ausente", () => {
    const solape = EJES_MEDIDA.medidos.filter((e) => EJES_MEDIDA.ausentes.includes(e));
    expect(solape).toEqual([]);
  });
});

describe("las cotas verticales cuadran entre sí", () => {
  /*
   * Es la comprobación que más falta hace de este archivo, porque el fallo que
   * caza NO SE ROMPE: si las cotas se separan, la escena sigue compilando, las
   * pruebas siguen pasando y lo único que ocurre es que el eje pasa por fuera
   * del rodamiento que lo sujeta, o el motor flota un palmo sobre el banco.
   * Pasó de verdad al montar esta vista: los modelos daban por hecho que su
   * origen era el suelo y en realidad se plantan sobre una bancada de 16 cm.
   */
  it("el eje visto desde el montaje es el eje menos la bancada", () => {
    expect(ALTURA_EJE_MONTAJE).toBeCloseTo(ALTURA_EJE - ALTURA_BANCADA, 10);
  });

  it("la bancada declara su propio alto y no otro", () => {
    expect(BANCADA.alto).toBe(ALTURA_BANCADA);
  });

  it("el rodamiento de la chumacera cae justo en el eje", () => {
    // Si esto falla, el eje atraviesa la chumacera por encima o por debajo de
    // su pista, que es exactamente lo que una chumacera no puede hacer.
    expect(ALTO_CHUMACERA).toBeCloseTo(ALTURA_EJE_MONTAJE, 10);
  });

  it("el eje empieza en el motor y termina en el extremo libre", () => {
    // Arrancar el eje en el acoplamiento dejaba un hueco de aire entre la
    // brida del motor y el rotor. Tiene que nacer antes del acoplamiento.
    expect(EJE_DESDE).toBeLessThan(POSICION_X.acoplamiento);
    expect(EJE_DESDE).toBeGreaterThan(POSICION_X.motor);
    expect(EJE_HASTA).toBe(POSICION_X["extremo-libre"]);
  });

  it("la bancada llega debajo de todas las piezas del tren", () => {
    const desde = BANCADA.centroX - BANCADA.largo / 2;
    const hasta = BANCADA.centroX + BANCADA.largo / 2;
    for (const [id, x] of Object.entries(POSICION_X)) {
      expect(x, `${id} se sale de la bancada por la izquierda`).toBeGreaterThan(desde);
      expect(x, `${id} se sale de la bancada por la derecha`).toBeLessThan(hasta);
    }
  });
});

describe("encuadres", () => {
  it("cada encuadre tiene etiqueta, posición y objetivo utilizables", () => {
    for (const [id, e] of Object.entries(ENCUADRES)) {
      expect(e.etiqueta, id).toBeTruthy();
      expect(e.posicion, id).toHaveLength(3);
      expect(e.objetivo, id).toHaveLength(3);
      expect(e.posicion.every(Number.isFinite), id).toBe(true);
      expect(e.objetivo.every(Number.isFinite), id).toBe(true);
    }
  });

  it("el encuadre de apertura es el lateral, que es el que lee el orden", () => {
    // Un banco EN LÍNEA sólo enseña su secuencia de perfil. Ver `rotor.js`.
    expect(Object.keys(ENCUADRES)[0]).toBe("lateral");
  });
});
