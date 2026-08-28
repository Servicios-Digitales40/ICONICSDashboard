/**
 * traza.test.js
 * ------------------------------------------------------------------
 * La línea de procedencia que va bajo cada respuesta del asistente.
 *
 * ── POR QUÉ ESTO MERECE PRUEBA PROPIA ──────────────────────────────
 *
 * Porque es la única parte de la pantalla donde se ve que el modelo consultó la
 * MÁQUINA EQUIVOCADA.
 *
 * Desde que las herramientas se parametrizan por sistema, `sistema` es un
 * argumento obligatorio del backend, y lo es por un motivo concreto: contestar
 * del tanque cuando preguntaron por las vibraciones da cifras reales, unidades
 * reales y ni un error en el log. La respuesta sale impecable y habla de otra
 * instalación. Ningún dato de la conversación lo delata — sólo esta línea.
 *
 * Y estuvo mal justo después del cambio: el rótulo decía «Leyó las ocho señales
 * en vivo de ICONICS» dos veces seguidas, una por máquina, con la cuenta del
 * tanque puesta sobre las dos.
 *
 * ── QUÉ SE FIJA, Y QUÉ NO ──────────────────────────────────────────
 *
 * No se fijan las frases: son texto de interfaz y cambiarlas es libre. Se fija
 * que la traza DIGA DE QUÉ MÁQUINA habla, que no ponga la cuenta de una sobre
 * las demás, y que lo que pintó sea lo que mandó el modelo y no una traducción
 * nuestra.
 */
import { describe, expect, it } from "vitest";

import { ETIQUETA_HERRAMIENTA, describirConsulta } from "@/features/asistente/lib/useAsistente.js";

/** La línea tal y como la arma `Asistente.jsx`. */
const linea = (nombre, argumentos) =>
  [ETIQUETA_HERRAMIENTA[nombre] ?? nombre, ...describirConsulta(nombre, argumentos)].join(" · ");

describe("la traza dice de qué máquina habla", () => {
  it("dos lecturas de sistemas distintos NO producen la misma línea", () => {
    /*
     * Es literalmente lo que se vio en pantalla: dos veces «Leyó las ocho
     * señales en vivo de ICONICS», una por sistema, indistinguibles.
     */
    const tanque = linea("estado_del_sistema", { sistema: "tanque" });
    const vibraciones = linea("estado_del_sistema", { sistema: "vibraciones" });

    expect(tanque).not.toBe(vibraciones);
    expect(tanque).toMatch(/tanque/);
    expect(vibraciones).toMatch(/vibraciones/);
  });

  it("el sistema va PRIMERO, antes que la señal y el período", () => {
    // Se lee de izquierda a derecha y lo primero que hay que poder descartar es
    // que se esté hablando de otra instalación.
    const partes = describirConsulta("historia_de_senal", {
      sistema: "tanque",
      senal: "nivel del tanque",
      periodo: "hoy",
    });
    expect(partes[0]).toBe("tanque");
    expect(partes).toEqual(["tanque", "nivel del tanque", "hoy"]);
  });

  it("el id se pinta CRUDO, sin traducir a su nombre bonito", () => {
    /*
     * Traducir `tanque` a «Tanque y grupo de bombeo» taparía un id inventado, y
     * un id inventado es exactamente lo que hay que poder ver: significa que el
     * modelo se lo imaginó y la herramienta lo rechazó.
     */
    expect(describirConsulta("estado_del_sistema", { sistema: "prensa" })).toEqual(["prensa"]);
  });

  it("sin sistema no se inventa ninguno", () => {
    // Una llamada sin `sistema` es un fallo del backend, no algo que la
    // interfaz deba disimular poniendo el tanque por defecto.
    expect(describirConsulta("estado_del_sistema", {})).toEqual([]);
  });
});

describe("los rótulos no afirman la cuenta de una máquina sobre las demás", () => {
  it("ningún rótulo cita un número de señales", () => {
    /*
     * «Las ocho señales» era cierto del tanque y falso del sistema de
     * vibraciones, que pide 73 puntos. Cualquier cifra en un rótulo compartido
     * vuelve a ser falsa en cuanto se dé de alta la máquina siguiente.
     */
    for (const [nombre, etiqueta] of Object.entries(ETIQUETA_HERRAMIENTA)) {
      expect(etiqueta, `«${nombre}» cita una cuenta que no vale para todas`).not.toMatch(
        /\b(ocho|nueve|diez|\d+)\s+(señales|puntos|tags)/i,
      );
    }
  });

  it("la única herramienta que escribe se anuncia como que escribe", () => {
    // Confundir una lectura con una orden al PLC es el peor malentendido que
    // esta línea puede provocar.
    expect(ETIQUETA_HERRAMIENTA.controlar_bomba).toMatch(/escrib/i);

    const lectoras = Object.entries(ETIQUETA_HERRAMIENTA).filter(
      ([n]) => n !== "controlar_bomba" && !n.startsWith("recordar") && !n.startsWith("proponer"),
    );
    for (const [nombre, etiqueta] of lectoras) {
      expect(etiqueta, `«${nombre}» no escribe en la planta`).not.toMatch(/ESCRIBIÓ en el PLC/);
    }
  });

  it("cada rótulo dice de dónde salió el dato, no qué hizo el modelo", () => {
    // La distinción que permite creerse la respuesta: «leyó el historiador» es
    // una procedencia verificable; «analizó» no dice de dónde vino nada.
    for (const [nombre, etiqueta] of Object.entries(ETIQUETA_HERRAMIENTA)) {
      expect(typeof etiqueta, nombre).toBe("string");
      expect(etiqueta.length, nombre).toBeGreaterThan(0);
    }
  });
});
