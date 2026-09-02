/**
 * Una sola respuesta a «¿me puedo fiar de este dato?», para el valor en vivo
 * y para la serie del historiador. JS puro, sin React: es una pregunta que se
 * contesta igual en un tile, en una gráfica o en una prueba, y contestarla dos
 * veces en dos sitios es como acaban discrepando — el tile diciendo «en
 * banda» mientras la gráfica de al lado dice «sin conexión» sobre la misma
 * señal.
 *
 * ── LO QUE ESTO NO HACE ──────────────────────────────────────────────
 *
 * No decide si un VALOR está en banda, en aviso o crítico — eso es
 * `bandaDe()` en `shared/eva/umbrales.js`, y no se toca aquí. Esto contesta
 * una pregunta distinta y anterior: si hay que fiarse del valor que sea que
 * `bandaDe()` reciba. Un `98 %` "en banda" leído hace diez minutos no está en
 * banda: está viejo, y eso hay que decirlo antes que su color.
 *
 * ── DE DÓNDE SALEN LOS DATOS DE ENTRADA, Y POR QUÉ NO SE REINVENTAN ──
 *
 * `receivedAt` y `stale` ya los calcula el motor de sondeo
 * (`lib/iconics/pollingEngine.js`, `staleAfterCycles`) y ya viajan en cada
 * señal (`shared/eva/sistema.js` → `createSenal`). Hasta ahora nada en
 * pantalla los leía: el sondeo los calculaba y se perdían. `frescuraDe()`
 * sólo interpreta lo que ya existe.
 *
 * `motivo` y `error` son los que ya devuelve `useSerieHistorica()` /
 * `useSeriesHistoricas()` (`data/comunes/hooks.js`): `motivo` cuando la señal no
 * tiene serie propia (`SIN_SERIE` de `shared/eva/historia.js`), `error`
 * cuando falló la petición. `estadoHistorial()` sólo les pone nombre.
 */
import { fmtAntiguedad } from "@/lib/format.js";

/** Los cuatro estados de un valor en vivo, de mejor a peor. */
export const FRESCURA = Object.freeze({
  /** Nunca ha llegado una lectura de este punto. */
  SIN_DATO: "sinDato",
  /** Dentro del ciclo de sondeo normal. */
  FRESCO: "fresco",
  /** El motor de sondeo ya lo marcó rancio: van varios ciclos sin noticias. */
  ENVEJECIDO: "envejecido",
  /** Lleva más de un minuto sin refresco. Ver la nota de `UMBRAL_CONGELADO_MS`. */
  CONGELADO: "congelado",
});

/**
 * A partir de aquí un valor deja de enseñarse como valor y pasa a enseñarse
 * como su edad.
 *
 * No es el mismo umbral que `stale` (que dispara a los pocos ciclos de
 * sondeo, ~9 s con la cadencia de esta sección, y sólo sirve para atenuar).
 * Un minuto es la frontera dura: por debajo, «el dato tarda» es creíble; por
 * encima, seguir enseñando un número como si fuera de ahora mismo es peor que
 * no enseñar nada — es indistinguible de un dato fresco para quien sólo mira
 * la cifra, y una cifra vieja presentada como actual es lo que este módulo
 * existe para evitar.
 */
export const UMBRAL_CONGELADO_MS = 60_000;

/**
 * Frescura de un valor en vivo.
 *
 * @param {object} p
 * @param {Date|null} p.receivedAt  Cuándo llegó la última lectura de ESTE punto.
 * @param {boolean}   [p.stale]     Si el motor de sondeo ya lo dio por rancio.
 * @param {Date}      [p.ahora]     Inyectable para las pruebas.
 */
export function frescuraDe({ receivedAt, stale = false, ahora = new Date() } = {}) {
  if (!receivedAt) return FRESCURA.SIN_DATO;

  // Math.max por si `ahora` llega ligeramente antes que `receivedAt` — pasa
  // en pruebas con relojes falsos, y una edad negativa no es un estado real.
  const edadMs = Math.max(0, ahora.getTime() - receivedAt.getTime());

  if (edadMs >= UMBRAL_CONGELADO_MS) return FRESCURA.CONGELADO;
  if (stale) return FRESCURA.ENVEJECIDO;
  return FRESCURA.FRESCO;
}

/**
 * Qué enseñar en el sitio donde hoy va la cifra: el valor mismo, o su edad.
 *
 * No decide ESTILOS —eso es de quien lo pinte, que conoce su propio espacio y
 * su propia tipografía— sólo decide QUÉ TEXTO va ahí y si hace falta atenuar.
 * `envejecido` atenúa sin sustituir: el valor sigue siendo el dato, sólo que
 * hay que dejarlo claro con menos énfasis. `congelado` sustituye del todo,
 * porque a partir de `UMBRAL_CONGELADO_MS` mostrar el número como si fuera de
 * ahora mismo es la cosa exacta que este módulo existe para evitar.
 *
 * @param {object} p
 * @param {Date|null} p.receivedAt
 * @param {boolean}   [p.stale]
 * @param {Date}      [p.ahora]
 * @param {string}    p.formateado  El valor ya formateado por quien llama
 *   (`fmtNum`, `fmtSenal`…) — este módulo no sabe de decimales ni de unidades.
 * @returns {{ texto: string, atenuado: boolean, frescura: string }}
 */
export function presentarValor({ receivedAt, stale = false, ahora = new Date(), formateado } = {}) {
  const frescura = frescuraDe({ receivedAt, stale, ahora });

  if (frescura === FRESCURA.CONGELADO) {
    return { texto: fmtAntiguedad(receivedAt, ahora.getTime()), atenuado: true, frescura };
  }

  return { texto: formateado, atenuado: frescura === FRESCURA.ENVEJECIDO, frescura };
}

/** Los cinco estados de una serie del historiador. */
export const HISTORIAL = Object.freeze({
  /** Hay muestras y se pueden pintar. */
  OK: "ok",
  /** Se están pidiendo. Nunca se llega aquí si ya hay datos previos: ver `minimo`. */
  CARGANDO: "cargando",
  /** El historiador respondió y no hay ninguna muestra en el rango pedido. */
  SIN_DATO: "sinDato",
  /** La señal no tiene serie propia en este servidor. Hecho del catálogo, no avería. */
  SIN_HISTORIADOR: "sinHistoriador",
  /** La petición falló: red, servidor, o el puente caído. */
  SIN_CONEXION: "sinConexion",
});

/**
 * Estado de una serie histórica.
 *
 * El orden de las comprobaciones importa y no es arbitrario:
 *
 *  1. `error` y `motivo` mandan siempre, estén cargando o no — son la causa,
 *     y una causa no deja de serlo porque llegue una petición nueva encima.
 *  2. Con datos ya en mano se cuenta `OK` aunque `loading` siga en `true`:
 *     es el stale-while-revalidate que ya documenta `useSerieHistorica`
 *     (cambiar de rango conserva la curva anterior mientras llega la nueva).
 *     Tratar eso como "cargando" borraría una gráfica que sigue siendo válida.
 *  3. Sólo sin datos y sin causa se distingue cargando de vacío de verdad.
 *
 * @param {object} p
 * @param {string|null} [p.motivo]  El de `useSerieHistorica` / `leerSerie`.
 * @param {string|null} [p.error]   Ídem.
 * @param {boolean}     [p.loading]
 * @param {Array}       [p.datos]
 * @param {number}      [p.minimo]  Muestras necesarias para contar `OK`. Una
 *   gráfica de línea necesita dos puntos para dibujar un trazo; una tabla se
 *   conforma con una. El valor por defecto es el más laxo; quien dibuje una
 *   línea pasa `2` explícito en vez de que este módulo lo suponga por todos.
 */
export function estadoHistorial({ motivo = null, error = null, loading = false, datos = [], minimo = 1 } = {}) {
  if (error) return HISTORIAL.SIN_CONEXION;
  if (motivo) return HISTORIAL.SIN_HISTORIADOR;
  if (datos.length >= minimo) return HISTORIAL.OK;
  if (loading) return HISTORIAL.CARGANDO;
  return HISTORIAL.SIN_DATO;
}
