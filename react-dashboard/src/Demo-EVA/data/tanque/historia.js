/**
 * Lectura del historiador para las señales del TANQUE — hoy, una puerta.
 *
 * El lector vive en [`../comunes/historia.js`](../comunes/historia.js) desde
 * el Plan 42.5 F1 (22-09-2026), con el `sistema` como primer argumento: la
 * misma mecánica sirve para el tanque y para cualquier máquina configurada,
 * porque el nombre del punto histórico y la guarda de «tiene serie propia»
 * salen de quien conoce la máquina (`series.punto`, `esHistorizada`) y no de
 * un catálogo concreto. Aquí sólo se fija el tanque como ese primer
 * argumento, para que `evaSource`, `alarmas.js`, `hooks.js` y sus pruebas
 * sigan importando lo mismo hasta que F4 retire la fuente en vivo del tanque.
 *
 * ── POR QUÉ SE PASA EL CATÁLOGO Y NO `SISTEMA.tanque` ────────────────
 *
 * Los dos dicen lo mismo para las 52 claves reales (lo afirma
 * `historia-generica.test.js`), pero no se comportan igual ante una señal
 * dada de alta EN CALIENTE: `SISTEMA.tanque.claves()` fija la lista al
 * cargar, y el lector viejo consultaba `SENALES[clave]` en cada llamada.
 * Dos pruebas del tanque (`fuente.test.js`, `historia.test.js`) meten una
 * señal sintética con `historizado: false` en el catálogo para probar la
 * guarda `SIN_SERIE`, porque ya no queda una clave real así. Esta rama no
 * toca esas pruebas, así que la puerta conserva la lectura viva del
 * catálogo, que es lo que hacía el archivo al que sustituye.
 *
 * Es una puerta (CLAUDE.md §4.2): nada de lógica, y el día que su último
 * consumidor apunte a `comunes/historia.js` se borra sin más.
 */
import { SENALES, esHistorizada, puntoHistorico } from "../../domain/senales.js";
import * as generica from "../comunes/historia.js";

export {
  MAX_PUNTOS,
  SIN_SERIE,
  VENTANA,
  intervaloHMS,
  normalizar,
  rangoAyer,
  rangoPersonalizado,
  rangoSemana,
} from "../comunes/historia.js";

/** La vista del tanque que el lector genérico necesita, leída del catálogo vivo. */
const TANQUE = {
  claves: () => Object.keys(SENALES),
  esHistorizada,
  series: { punto: puntoHistorico },
};

/** `leerSerie(clave, rango, { crudo })` del tanque: ver `comunes/historia.js`. */
export const leerSerie = (clave, rango, opciones) => generica.leerSerie(TANQUE, clave, rango, opciones);

/** `leerSeries(claves, rango)` del tanque: ver `comunes/historia.js`. */
export const leerSeries = (claves, rango) => generica.leerSeries(TANQUE, claves, rango);
