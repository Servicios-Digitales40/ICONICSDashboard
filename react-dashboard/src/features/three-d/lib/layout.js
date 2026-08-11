/**
 * Dónde está cada máquina en la maqueta.
 *
 * ── POR QUÉ ESTO SON DATOS Y NO CÓDIGO ─────────────────────────────
 *
 * La distribución se va a ajustar muchas veces y siempre a ojo, mirando la
 * pantalla. Si viviera repartida entre los componentes, cada ajuste sería una
 * edición de JSX; aquí es cambiar un número en una tabla que se lee entera de
 * un vistazo.
 *
 * ── DE DÓNDE SALEN LAS COORDENADAS ─────────────────────────────────
 *
 * **Son inventadas.** Aproximan la disposición de la pantalla de GraphWorX
 * —rectificadoras al fondo, líneas en dos filas delante— pero no corresponden
 * al plano real de la planta. Cuando haya plano, se sustituyen aquí y ningún
 * componente se entera.
 *
 * Mientras tanto la disposición es deliberadamente REGULAR y no orgánica: la
 * pantalla de GraphWorX las esparce, y eso se ve bien en una captura, pero en
 * un tablero que se consulta para localizar un equipo, las filas alineadas se
 * recorren con la vista y el montón no.
 *
 * Ejes: X a la derecha, Z hacia el observador. Unidades: metros de la escena,
 * no de la planta. `rotY` en radianes.
 */
import { listMachines } from "@/lib/iconics/tagCatalog.js";

/**
 * Escala de cada máquina en la maqueta.
 *
 * El modelo mide ~2.3 × 1.5, así que a 0.5 cada una ocupa ~1.15 × 0.75 y caben
 * las diez sin que la cámara tenga que alejarse hasta perder las balizas, que
 * son lo que hay que poder leer.
 */
export const ESCALA_MAQUETA = 0.5;

/**
 * Posición de cada máquina, por su id global (`"LIN/1"`, `"REC/13"`).
 *
 * Las claves son las de `tagCatalog.listMachines()` y la prueba
 * `layout.test.js` comprueba que no sobre ni falte ninguna: si mañana se da de
 * alta una rectificadora en el catálogo, la maqueta no puede quedarse sin
 * pintarla en silencio.
 */
export const LAYOUT = {
  // Rectificadoras, al fondo. La numeración tiene huecos reales: 10, 11 y 13.
  "REC/10": { x: -3.4, z: -3.9, rotY: 0 },
  "REC/11": { x: -0.6, z: -3.9, rotY: 0 },
  "REC/13": { x: 2.2, z: -3.9, rotY: 0 },

  // Líneas 1-4, fila intermedia.
  "LIN/1": { x: -5.1, z: -0.7, rotY: 0 },
  "LIN/2": { x: -2.3, z: -0.7, rotY: 0 },
  "LIN/3": { x: 0.5, z: -0.7, rotY: 0 },
  "LIN/4": { x: 3.3, z: -0.7, rotY: 0 },

  // Líneas 5-7, fila delantera. Van centradas respecto a la de arriba, que es
  // lo que hace que las dos filas se lean como un bloque y no como un descuadre.
  "LIN/5": { x: -3.7, z: 2.5, rotY: 0 },
  "LIN/6": { x: -0.9, z: 2.5, rotY: 0 },
  "LIN/7": { x: 1.9, z: 2.5, rotY: 0 },
};

/** Radio del suelo, con margen suficiente para que nada quede al borde. */
export const RADIO_PISO = 9.5;

/**
 * Posición de una máquina. Devuelve `null` —y no un (0,0)— cuando no está en
 * la tabla: dos máquinas apiladas en el origen serían un fallo difícil de leer,
 * y una máquina que falta se ve enseguida.
 */
export const posicionDe = (id) => LAYOUT[id] ?? null;

/**
 * Tramos de pasillo entre máquinas consecutivas de la misma fila.
 *
 * Son las cintas del suelo que en la pantalla de GraphWorX unen los equipos.
 * Aquí cumplen una función además de la estética: encadenan visualmente las
 * máquinas de una misma fila, que es lo que permite leer «la fila de líneas»
 * como un grupo en vez de como siete objetos sueltos.
 */
export const FILAS = [
  ["REC/10", "REC/11", "REC/13"],
  ["LIN/1", "LIN/2", "LIN/3", "LIN/4"],
  ["LIN/5", "LIN/6", "LIN/7"],
];

/** Pares consecutivos de cada fila, ya resueltos a coordenadas. */
export function tramos() {
  const out = [];
  for (const fila of FILAS) {
    for (let i = 0; i < fila.length - 1; i++) {
      const a = posicionDe(fila[i]);
      const b = posicionDe(fila[i + 1]);
      if (a && b) out.push({ id: `${fila[i]}→${fila[i + 1]}`, a, b });
    }
  }
  return out;
}

/** Las máquinas del catálogo con su posición ya resuelta. */
export function maquinasColocadas() {
  return listMachines()
    .map((m) => ({ ...m, pos: posicionDe(m.id) }))
    .filter((m) => m.pos !== null);
}
