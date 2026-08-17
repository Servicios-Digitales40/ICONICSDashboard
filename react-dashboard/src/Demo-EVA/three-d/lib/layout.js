/**
 * Dónde va cada activo en la maqueta del sistema de agua.
 *
 * ── POR QUÉ ESTO SON DATOS Y NO CÓDIGO ─────────────────────────────
 *
 * Igual que en la maqueta de Resonac: la distribución se va a ajustar muchas
 * veces y siempre a ojo, mirando la pantalla. Repartida entre los componentes,
 * cada ajuste sería una edición de JSX; aquí es cambiar un número en una tabla
 * que se lee entera de un vistazo.
 *
 * ── DE DÓNDE SALEN LAS COORDENADAS ─────────────────────────────────
 *
 * **Son inventadas**, y aquí con menos disculpa que en Resonac: allí al menos
 * aproximaban una pantalla de GraphWorX. De esta instalación no tenemos ni
 * plano ni pantalla, sólo ocho tags. Lo que la disposición reproduce es el
 * RECORRIDO DEL AGUA, que es la única topología que las señales sí implican:
 *
 *     tanque ──► bombeo ──► distribución        eléctrico (al lado del bombeo)
 *
 * Y esa lectura sí es verdadera: el caudal y la presión están aguas abajo de la
 * bomba, y la bomba se alimenta del tanque. Cuando haya plano se sustituye
 * aquí y ningún componente se entera.
 *
 * Ejes: X a la derecha, Z hacia el observador. Unidades: metros de la escena.
 */
import { ACTIVO_IDS } from "../../domain/activos.js";

/**
 * Posición de cada activo por su id.
 *
 * Las claves son las de `domain/activos.js` y la prueba `maqueta.test.js`
 * comprueba que no sobre ni falte ninguna: si mañana se da de alta un activo,
 * la maqueta no puede quedarse sin pintarlo en silencio.
 */
export const LAYOUT = {
  // El tanque a la izquierda, que es donde empieza el recorrido.
  tanque: { x: -3.6, z: 0.2, rotY: 0 },

  // El grupo de bombeo en el centro, alineado con el tanque para que la
  // tubería que los une sea recta y se lea como una succión.
  bombeo: { x: -0.2, z: 0.2, rotY: 0 },

  // La distribución aguas abajo, a la derecha.
  distribucion: { x: 3.2, z: 0.2, rotY: 0 },

  // El armario eléctrico DETRÁS del bombeo y no en la línea del agua: no forma
  // parte del recorrido, alimenta al que sí. Ponerlo en fila sugeriría que el
  // agua pasa por él.
  electrico: { x: -0.2, z: -2.9, rotY: 0 },
};

/** Radio del suelo, con margen para que nada quede al borde. */
export const RADIO_PISO = 7.5;

/**
 * Posición de un activo. Devuelve `null` —y no un (0,0)— cuando no está en la
 * tabla: dos activos apilados en el origen serían un fallo difícil de leer, y
 * uno que falta se ve enseguida.
 */
export const posicionDe = (id) => LAYOUT[id] ?? null;

/**
 * Tramos de tubería, en orden de recorrido.
 *
 * No son adorno: encadenan visualmente los tres activos de la línea del agua,
 * que es lo que permite leer «la instalación» en vez de tres objetos sueltos. Y
 * el tramo de impulsión es además el que lleva el testigo de caudal.
 */
export const TRAMOS = [
  { id: "succion", de: "tanque", a: "bombeo", papel: "succion" },
  { id: "impulsion", de: "bombeo", a: "distribucion", papel: "impulsion" },
];

/** Tramos ya resueltos a coordenadas. Los que no se puedan resolver se omiten. */
export function tramos() {
  return TRAMOS.map((tr) => ({ ...tr, a1: posicionDe(tr.de), a2: posicionDe(tr.a) })).filter(
    (tr) => tr.a1 && tr.a2
  );
}

/** Los activos del catálogo con su posición ya resuelta. */
export const activosColocados = () =>
  ACTIVO_IDS.map((id) => ({ id, pos: posicionDe(id) })).filter((a) => a.pos !== null);

/** Altura a la que flota la ficha de un activo, en unidades de escena. */
export const ALTURA_FICHA = 2.5;
