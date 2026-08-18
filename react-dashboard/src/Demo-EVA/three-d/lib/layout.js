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
 * De un dibujo del equipo real, desde agosto de 2026.
 *
 * Antes eran inventadas, y el comentario que había aquí lo decía sin rodeos:
 * de esta instalación no teníamos ni plano ni pantalla, sólo ocho tags, así que
 * la disposición reproducía el RECORRIDO DEL AGUA —lo único que las señales sí
 * implican— con los cuatro activos repartidos por el suelo.
 *
 * Ese dibujo apareció —está en `react-dashboard/img/`— y lo que enseña no es
 * una nave: es un SKID
 * de dos niveles, del tamaño de una mesa. El depósito va DEBAJO de la bandeja,
 * y la bomba, el armario y la columna encima. Así que la maqueta se rehízo
 * contra él, y por eso ahora cada activo lleva altura:
 *
 *     nivel bajo   tanque
 *     bandeja      bombeo ──► eléctrico ──► distribución
 *
 * El recorrido del agua sigue siendo el mismo y sigue siendo verdadero: la
 * bomba se alimenta del depósito que tiene debajo, y el caudal y la presión
 * están aguas abajo de la bomba.
 *
 * Lo que se gana es que las dos vistas enseñan LA MISMA máquina, que es lo que
 * permite compararlas. Lo que no se gana es exactitud métrica: las cotas están
 * tomadas a ojo sobre un dibujo en perspectiva, no de un plano acotado.
 *
 * Ejes: X a la derecha, Y hacia arriba, Z hacia el observador. Unidades: metros
 * de la escena.
 */
import { ACTIVO_IDS } from "../../domain/activos.js";

/**
 * Posición de cada activo por su id.
 *
 * Las claves son las de `domain/activos.js` y la prueba `maqueta.test.js`
 * comprueba que no sobre ni falte ninguna: si mañana se da de alta un activo,
 * la maqueta no puede quedarse sin pintarlo en silencio.
 */
/**
 * Las cotas del bastidor, tomadas a ojo sobre el dibujo.
 *
 * Viven aquí y no en `BastidorModel.jsx` porque las necesitan los dos: el
 * modelo para dibujar los perfiles, y `LAYOUT` para saber a qué altura está
 * la bandeja. Repetir el 2.4 en dos archivos sería la clase de número que un
 * día se cambia en uno y no en el otro, y entonces los equipos quedarían
 * flotando sobre la bandeja sin que nada falle.
 */
export const SKID = {
  /** Largo (X), fondo (Z) y alto total del bastidor. */
  largo: 4.8,
  fondo: 2.0,
  alto: 2.5,
  /** Cara superior de la bandeja: sobre ella se apoyan tres de los cuatro. */
  bandeja: 2.4,
  /** Sección del perfil de aluminio. */
  perfil: 0.11,
};

/**
 * El bidón de almacenamiento, en el hueco de abajo.
 *
 * **No está en `LAYOUT` porque no es un activo.** No tiene ni un sensor: las
 * dos señales del activo «tanque» se miden sobre la columna. Aquí sólo se
 * necesita su sitio, para dibujarlo y para que la succión salga de él.
 */
export const DEPOSITO = { x: -1.2, y: 0, z: 0.15, rotY: 0 };

/**
 * Dónde va la TARJETA de cada activo.
 *
 * ── LA REGLA, QUE COSTÓ DOS INTENTOS ───────────────────────────────
 *
 * Un activo se ancla **donde está el aparato que mide sus señales**, no donde
 * está el recipiente que le da nombre. Es lo que hace que señalar una pieza y
 * leer un número sean la misma pregunta.
 *
 * De ahí las dos que sorprenden al leer la tabla:
 *
 *  - **«tanque» es la COLUMNA**, no el bidón. `SNIVEL_TANQUE` y
 *    `STEMPERATURA_TANQUE` las publica la instrumentación montada sobre ella.
 *    El bidón está en `DEPOSITO`, sin tarjeta, porque no publica nada.
 *  - **«distribucion» es la VÁLVULA de media tubería**, no un recipiente.
 *    `SFLUJO_INSTANTANEO` y `SPRESION_RELATIVA` se miden ahí, en el tramo de
 *    impulsión, y es la única de las cuatro que va en el aire.
 *
 * `ficha` es la altura a la que flota su tarjeta, sobre la propia posición del
 * activo. Es por activo y no una constante porque los cuatro modelos miden
 * cosas muy distintas: una válvula de 30 cm y una columna de 1.6 m no pueden
 * compartir la misma holgura sin que a una le quede la ficha dentro y a la otra
 * a un metro de distancia.
 */
export const LAYOUT = {
  // La columna, a la derecha de la bandeja: el vaso donde se mide el nivel.
  tanque: { x: 1.55, y: SKID.bandeja, z: 0.25, rotY: 0, ficha: 2.5 },

  // El grupo de bombeo, en la bandeja y a la izquierda del todo: justo encima
  // del depósito del que aspira.
  bombeo: { x: -1.75, y: SKID.bandeja, z: 0.3, rotY: 0, ficha: 2.5 },

  // El armario en el centro de la bandeja, que es donde está en el equipo. Deja
  // de estar "fuera de la línea del agua" como en la disposición inventada: en
  // el skid real está en medio, y el agua le pasa por delante sin entrar.
  electrico: { x: -0.05, y: SKID.bandeja, z: -0.2, rotY: 0, ficha: 1.8 },

  // La válvula instrumentada, montada SOBRE el tramo de impulsión. Su altura es
  // la de ese tramo (ver TRAMOS): si se mueve la tubería, hay que moverla.
  // `aire: true` se lo dice a la maqueta, que no puede dibujarle un anillo en
  // el suelo a algo que está a cuatro metros del suelo.
  distribucion: { x: 0.3, y: 4.12, z: 0.27, rotY: 0, ficha: 0.95, aire: true },
};

/** Radio del suelo. Se encogió con la instalación: ya no hay nave que cubrir. */
export const RADIO_PISO = 5;

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
/*
 * `desde` y `hasta` son las alturas de las bocas, medidas desde la BASE DE SU
 * PROPIO activo y no desde el suelo. Hacen falta desde que el skid tiene dos
 * niveles: la succión sale por la boca del depósito, que está abajo, y entra en
 * la bomba, que está 2.4 m más arriba, y sin las dos cotas el tramo saldría
 * atravesando la bandeja en diagonal.
 */
export const TRAMOS = [
  { id: "succion", de: "deposito", a: "bombeo", papel: "succion", desde: 1.98, hasta: 0.34 },
  { id: "impulsion", de: "bombeo", a: "tanque", papel: "impulsion", desde: 0.82, hasta: 1.5 },
];

/**
 * Los extremos de un tramo: los activos, más el depósito.
 *
 * El depósito no está en `LAYOUT` —no es un activo— y aun así la succión sale
 * de él, porque es de donde sale en el equipo. Por eso los tramos se resuelven
 * contra este mapa y no contra `posicionDe`, que sigue respondiendo sólo por
 * activos y sigue devolviendo `null` para todo lo demás.
 */
const PUNTOS = { ...LAYOUT, deposito: DEPOSITO };

/** Tramos ya resueltos a coordenadas. Los que no se puedan resolver se omiten. */
export function tramos() {
  return TRAMOS.map((tr) => ({ ...tr, a1: PUNTOS[tr.de] ?? null, a2: PUNTOS[tr.a] ?? null })).filter(
    (tr) => tr.a1 && tr.a2
  );
}

/** Los activos del catálogo con su posición ya resuelta. */
export const activosColocados = () =>
  ACTIVO_IDS.map((id) => ({ id, pos: posicionDe(id) })).filter((a) => a.pos !== null);

/**
 * Altura por defecto de la ficha, para un activo que no declare la suya.
 * Los cuatro la declaran; esto es la red de seguridad del quinto.
 */
export const ALTURA_FICHA = 2.5;
