/**
 * tipos.test.js
 * ------------------------------------------------------------------
 * El índice de TIPOS de máquina — Plan 33 F1.
 *
 * ── QUÉ TIENE QUE DEMOSTRAR ESTA PRUEBA ────────────────────────────
 *
 * F1 es una EXTRACCIÓN: separa lo que vale para cualquier motor con SM 1281
 * (el tipo) de lo que es de la instalación que hay montada (el sistema). Una
 * extracción sólo está bien hecha si **no cambia nada**, así que lo que esta
 * prueba defiende sobre todo es una equivalencia: el tipo tiene que exponer
 * exactamente las mismas reglas, la misma norma y las mismas funciones que ya
 * usaba el sistema — no copias suyas, las mismas.
 *
 * Por eso varios asertos son `toBe` y no `toEqual`: comprobar identidad de
 * referencia es lo que distingue «lo importa» de «lo transcribió». Una copia
 * pasaría un `toEqual` y sería justo el defecto que hay que impedir — dos
 * listas con la misma intención y el riesgo de irse a destiempo (`CLAUDE.md`
 * §2.6).
 *
 * ── LA COLISIÓN DE `aviso`, QUE ES POR LO QUE HAY ROLES CON FAMILIA ─
 *
 * `aviso` existe DOS veces en este tipo: como bandera del módulo (una por
 * apoyo) y como clave del variador (una por máquina). Son 30 entradas en los
 * cinco catálogos y 29 claves distintas.
 *
 * Indexar los roles por clave hacía que la segunda machacara a la primera en
 * silencio, y `ROLES_REQUERIDOS` acababa pidiendo un rol de máquina donde las
 * reglas esperan tres de apoyo. Varias de las pruebas de abajo existen
 * únicamente para que eso no pueda volver.
 */
import { describe, expect, it } from "vitest";

import {
  TIPOS,
  TIPO,
  TIPO_IDS,
  resumenDeTipos,
  tipoDe,
} from "@shared/eva/tipos/index.js";
import {
  ROLES,
  ROLES_REQUERIDOS,
  UMBRALES,
  rolDe,
  rolesDeAmbito,
  rolesDeClave,
} from "@shared/eva/tipos/vibraciones.js";
import {
  BANDERAS,
  CALIDADES,
  LIMITES_ISO,
  MEDIDAS,
  RPM_MINIMA_ISO,
  VARIADOR,
  VIGILANCIAS,
} from "@shared/eva/vibraciones/vibraciones.js";
import {
  REGLAS,
  evaluarRiesgosVibracion,
} from "@shared/eva/vibraciones/riesgosVibracion.js";
import { estadoDeVibraciones } from "@shared/eva/vibraciones/estadoVibraciones.js";

describe("el índice de tipos", () => {
  it("declara al menos un tipo, y todos con id único", () => {
    expect(TIPOS.length).toBeGreaterThan(0);
    expect(new Set(TIPO_IDS).size).toBe(TIPO_IDS.length);
  });

  it("resuelve un tipo por su id", () => {
    expect(tipoDe("vibraciones")).toBe(TIPO.vibraciones);
  });

  /*
   * `null` y no una excepción: quien pregunta puede estar validando una
   * configuración guardada que trae un tipo retirado, y eso es un error DE ESA
   * configuración —que hay que poder contar con su nombre— no algo que deba
   * tumbar el arranque.
   */
  it("devuelve null para un tipo que no existe, en vez de lanzar", () => {
    expect(tipoDe("prensa")).toBeNull();
    expect(tipoDe("")).toBeNull();
    expect(tipoDe(null)).toBeNull();
    expect(tipoDe(undefined)).toBeNull();
  });

  /*
   * ── LA ESTACIÓN DE LLENADO YA ESTÁ (Plan 46 F7, 26-09-2026) ───────
   *
   * Esta prueba afirmaba lo contrario —«NO declara la estación de llenado: su
   * extracción es de la F9»— y pasaba por CASUALIDAD: comprobaba el id
   * `estacionLlenado` y el tipo se llama `estacion-de-llenado`, así que habría
   * seguido en verde mientras afirmaba algo falso.
   *
   * Se sustituye por lo que ahora hay que defender: que el tipo existe y que
   * su id es el que usa la configuración de una máquina. Un id distinto del
   * que espera `maquinas.json` deja la máquina sin tipo reconocible.
   */
  it("declara la estación de llenado con el id que usa la configuración", () => {
    expect(TIPO_IDS).toContain("estacion-de-llenado");
    expect(tipoDe("estacion-de-llenado")).toBe(TIPO["estacion-de-llenado"]);
  });

  it("el resumen viaja como datos, sin reglas ni funciones", () => {
    for (const r of resumenDeTipos()) {
      expect(typeof r.reglas).toBe("number");
      for (const valor of Object.values(r)) {
        expect(typeof valor).not.toBe("function");
      }
    }
  });

  it("todo tipo declara lo que el índice exige", () => {
    for (const t of TIPOS) {
      for (const campo of ["nombre", "roles", "rolesRequeridos", "reglas", "estado", "resumen"]) {
        expect(t[campo], `${t.id} no declara ${campo}`).toBeTruthy();
      }
      expect(typeof t.evaluarRiesgos).toBe("function");
    }
  });

  /*
   * ── DIAGNOSTICAR ES UNA OPCIÓN (Plan 46 F1, 24-09-2026) ────────────
   *
   * Esto decía `expect(t.reglas.length).toBeGreaterThan(0)` dentro de la
   * prueba de arriba, porque hasta ese día el índice exigía reglas a TODO
   * tipo. Con `sensado` —el primero que sólo observa— esa afirmación pasó a
   * ser falsa, y lo que hay que comprobar es lo que el índice comprueba
   * ahora: que lo que un tipo PROMETE y lo que TRAE concuerden.
   *
   * No se relajó la comprobación, se le cambió la pregunta. El caso que antes
   * cazaba —un tipo diagnosticable y mudo— lo sigue cazando la primera rama.
   */
  it("un tipo trae reglas si y sólo si promete DIAGNOSTICS", () => {
    for (const t of TIPOS) {
      const promete = t.capacidadesPosibles
        ? t.capacidadesPosibles.includes("DIAGNOSTICS")
        : true;

      if (promete) {
        expect(t.reglas.length, `${t.id} promete DIAGNOSTICS y no trae reglas`).toBeGreaterThan(0);
      } else {
        expect(t.reglas.length, `${t.id} trae reglas que nunca se evaluarían`).toBe(0);
      }
    }
  });

  it("todo rol requerido existe entre los roles de su tipo", () => {
    for (const t of TIPOS) {
      for (const rol of t.rolesRequeridos) {
        expect(t.roles[rol], `${t.id} exige «${rol}», que no declara`).toBeTruthy();
      }
    }
  });
});

describe("el tipo vibraciones NO copia el dominio: lo compone", () => {
  /*
   * Identidad de referencia, no igualdad. Es lo que separa «lo importa» de «lo
   * transcribió», y una transcripción pasaría un `toEqual`.
   */
  it("expone LAS MISMAS reglas que el módulo de vibraciones", () => {
    expect(TIPO.vibraciones.reglas).toBe(REGLAS);
  });

  it("expone LAS MISMAS funciones de evaluación y estado", () => {
    expect(TIPO.vibraciones.evaluarRiesgos).toBe(evaluarRiesgosVibracion);
    expect(TIPO.vibraciones.estado).toBe(estadoDeVibraciones);
  });

  it("expone LOS MISMOS límites de la norma", () => {
    expect(UMBRALES.iso).toBe(LIMITES_ISO);
    expect(UMBRALES.rpmMinimaIso).toBe(RPM_MINIMA_ISO);
  });
});

describe("los roles del tipo vibraciones", () => {
  const CATALOGOS = [MEDIDAS, BANDERAS, CALIDADES, VIGILANCIAS, VARIADOR];

  /*
   * La prueba de la colisión. 30 entradas en los cinco catálogos → 30 roles.
   * Con un índice por clave serían 29, porque `aviso` sale dos veces.
   */
  it("hay un rol por cada entrada de los catálogos, sin colapsar ninguna", () => {
    const entradas = CATALOGOS.reduce((total, c) => total + c.length, 0);
    expect(Object.keys(ROLES).length).toBe(entradas);
  });

  it("«aviso» produce DOS roles distintos, uno por familia", () => {
    const candidatos = rolesDeClave("aviso");
    expect(candidatos).toHaveLength(2);
    expect(candidatos).toContain(rolDe("bandera", "aviso"));
    expect(candidatos).toContain(rolDe("variador", "aviso"));

    expect(ROLES[rolDe("bandera", "aviso")].ambito).toBe("apoyo");
    expect(ROLES[rolDe("variador", "aviso")].ambito).toBe("maquina");
  });

  /*
   * Devolver la lista y no el primero es la misma regla que `sistemasDeSenal`
   * aplica entre máquinas: elegir es como se contesta correctamente sobre la
   * señal equivocada.
   */
  it("rolesDeClave devuelve TODOS los que reclaman una clave, no el primero", () => {
    expect(rolesDeClave("vRMS")).toEqual([rolDe("medida", "vRMS")]);
    expect(rolesDeClave("no-existe")).toEqual([]);
  });

  it("todo rol declara ámbito, familia y su clave de origen", () => {
    for (const [nombre, r] of Object.entries(ROLES)) {
      expect(["apoyo", "maquina"], `${nombre} tiene ámbito raro`).toContain(r.ambito);
      expect(r.familia, `${nombre} no declara familia`).toBeTruthy();
      expect(r.clave, `${nombre} no declara clave`).toBeTruthy();
      expect(nombre).toBe(rolDe(r.familia, r.clave));
    }
  });

  it("el variador es de la máquina; medidas y banderas, del apoyo", () => {
    expect(rolesDeAmbito("maquina")).toHaveLength(VARIADOR.length);
    for (const m of MEDIDAS) {
      expect(ROLES[rolDe("medida", m.key)].ambito).toBe("apoyo");
    }
  });
});

describe("lo que las reglas necesitan", () => {
  /*
   * Derivado del `necesita` de las propias reglas, no escrito a mano: una
   * lista a mano se queda vieja en la primera regla que alguien añada, y el
   * fallo sería una máquina dada de alta como completa cuyas reglas nunca se
   * evalúan.
   */
  it("todo rol requerido está resuelto a familia:clave", () => {
    for (const rol of ROLES_REQUERIDOS) {
      expect(rol, `«${rol}» no está resuelto a una familia`).toContain(":");
      expect(ROLES[rol]).toBeTruthy();
    }
  });

  it("cubre lo que declaran las reglas, sin perder ninguna clave", () => {
    const claves = new Set(REGLAS.flatMap((r) => r.necesita ?? []));
    const cubiertas = new Set(ROLES_REQUERIDOS.map((rol) => ROLES[rol].clave));
    for (const c of claves) {
      expect(cubiertas.has(c), `«${c}» lo pide una regla y no está en ROLES_REQUERIDOS`).toBe(true);
    }
  });

  /*
   * ── LA PRUEBA QUE NACE DE UN ERROR COMETIDO ────────────────────────
   *
   * La primera versión de `DESAMBIGUA` resolvía `aviso` a `variador:aviso`, por
   * parecido de nombre. Es falso: la única regla que lo pide es
   * `aviso-del-modulo`, de ámbito `canal`, que lee la bandera del apoyo.
   *
   * El fallo no habría dado error — habría dado una configuración que mapea el
   * aviso del variador donde el diagnóstico espera el del apoyo. Esto lo ata:
   * una regla por canal exige un rol de apoyo.
   */
  it("una regla por canal no puede exigir un rol de la máquina", () => {
    for (const regla of REGLAS) {
      for (const clave of regla.necesita ?? []) {
        const rol = ROLES_REQUERIDOS.find((r) => ROLES[r].clave === clave);
        if (!rol) continue;

        const esperado = regla.ambito === "canal" ? "apoyo" : "maquina";
        expect(
          ROLES[rol].ambito,
          `«${regla.id}» es de ámbito "${regla.ambito}" y «${clave}» se resolvió a «${rol}»`,
        ).toBe(esperado);
      }
    }
  });
});

/*
 * ── EL TIPO DEL TANQUE SE COMPONE, NO SE TRANSCRIBE (Plan 46 F7) ─────
 *
 * `estacion-de-llenado` se extrajo de `shared/eva/tanque/` -3.393 lineas-
 * SIN tocar ni una de ellas, que es lo que la regla de la rama pide: se
 * consulta cuanto haga falta, no se edita.
 *
 * Lo que se fija aqui es que sea COMPOSICION y no copia. Una transcripcion
 * pasaria un `toEqual` y se iria a destiempo en cuanto alguien tocara una de
 * las dos listas; la identidad de referencia solo la pasa lo importado.
 */
describe("el tipo estacion-de-llenado compone el dominio del tanque", () => {
  it("expone LAS MISMAS reglas que el modulo del tanque, por referencia", async () => {
    const { REGLAS } = await import("@shared/eva/tanque/riesgos.js");
    expect(TIPO["estacion-de-llenado"].reglas).toBe(REGLAS);
  });

  it("sus roles salen del CATALOGO, no de una lista escrita a mano", async () => {
    const { SENAL_KEYS } = await import("@shared/eva/tanque/senales.js");
    const t = TIPO["estacion-de-llenado"];

    /* Una senal nueva en el catalogo aparece aqui sola: es lo que evita que
       las dos listas se separen. */
    expect(Object.keys(t.roles)).toHaveLength(SENAL_KEYS.length);
    for (const clave of SENAL_KEYS) {
      expect(t.rolesDeClave(clave).length).toBeGreaterThan(0);
    }
  });

  it("sus roles REQUERIDOS salen del `necesita` de las reglas", async () => {
    const { REGLAS } = await import("@shared/eva/tanque/riesgos.js");
    const t = TIPO["estacion-de-llenado"];
    const claves = new Set(REGLAS.flatMap((r) => r.necesita ?? []));

    /*
     * Escribirlos a mano seria una segunda lista que se queda vieja en cuanto
     * alguien anade una regla, y el fallo no se veria: la maquina se daria de
     * alta "completa" y sus reglas nunca se evaluarian.
     */
    expect(t.rolesRequeridos).toHaveLength(claves.size);
    for (const rol of t.rolesRequeridos) {
      expect(t.roles[rol], `${rol} no esta entre los roles del tipo`).toBeTruthy();
    }
  });

  it("reparte por ACTIVOS y no por apoyos: no declara canales", () => {
    const t = TIPO["estacion-de-llenado"];

    /* Sus partes -el deposito, el grupo de bombeo, la red- son partes
       DISTINTAS de una instalacion, no tres vistas de la misma pieza como los
       tres acelerometros de un motor. */
    expect(t.canales).toBeUndefined();
    expect(t.activos.length).toBeGreaterThan(0);
    expect(t.activos.map((a) => a.id)).toContain("tanque");
  });

  it("declara DIAGNOSTICS y ALARMS, que es lo que lo separa de un observador", () => {
    const t = TIPO["estacion-de-llenado"];
    expect(t.capacidadesPosibles).toContain("DIAGNOSTICS");
    expect(t.capacidadesPosibles).toContain("ALARMS");
    /* Y la coherencia que el indice exige: promete diagnostico Y trae reglas. */
    expect(t.reglas.length).toBeGreaterThan(0);
  });
});
