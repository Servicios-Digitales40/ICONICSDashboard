/**
 * Que el asistente pueda llevarte a la pantalla de la que habla
 * (Plan 25 F7 · `NUE-08`, la vuelta).
 *
 * ── EL SIMÉTRICO DE `preguntaExterna.js` ───────────────────────────
 *
 * `preguntaExterna.js` es la IDA: cualquier vista manda una pregunta al
 * asistente con un evento del navegador, sin acoplarse a él. Esto es la
 * VUELTA, con el mismo mecanismo y por el mismo motivo: el asistente vive
 * fuera del árbol de rutas y no conoce `navigate()` directamente — pasárselo
 * como prop lo acoplaría a `App.jsx`, que es justo lo que las dos cabeceras
 * de este directorio existen para evitar.
 *
 * Archivo APARTE de `preguntaExterna.js`, no el mismo ampliado: son dos
 * contratos de una sola dirección cada uno, y mezclarlos en un solo evento
 * con un campo opcional habría hecho que quien escuchara tuviera que mirar
 * qué campos trae para saber qué está pasando — el mismo problema que evita
 * separar HECHOS de PROPUESTAS en `aprendizaje.js`.
 *
 * ── QUIÉN DECIDE EL DESTINO, Y QUIÉN SÓLO LO EJECUTA ───────────────
 *
 * Este archivo NO decide a dónde ir — eso es `navegacionDelAsistente.js`,
 * dominio puro y probado aparte. Aquí sólo vive el transporte: despachar el
 * evento y, en el otro extremo, traducirlo a `navigate()`.
 *
 * ── LA FRONTERA NO SE MUEVE ─────────────────────────────────────────
 *
 * Sólo viajan `ruta` (un id de `ROUTE_IDS`) y, cuando aplica, un `riesgoId` —
 * nunca un valor medido. Es la misma restricción de `contextoDeVista.js`,
 * aplicada a la dirección contraria.
 */

/** Nombre del evento. Vive aquí para que nadie lo escriba a mano dos veces. */
export const EVENTO_NAVEGAR = "tdconcito:navegar";

/**
 * Pide navegar a una ruta. La escucha `App.jsx`, que es quien tiene
 * `navigate()`; si nadie escucha —el asistente reventó, o esto se llama
 * antes de montar la app— no pasa nada, que es el mismo caso normal que
 * documenta `preguntaExterna.js`.
 *
 * @param {string} ruta     un id de `ROUTE_IDS`
 * @param {object} [params] identificadores para esa ruta — nunca un valor
 */
export function navegarDesdeAsistente(ruta, params = {}) {
  if (!ruta || typeof window === "undefined") return false;

  window.dispatchEvent(new CustomEvent(EVENTO_NAVEGAR, { detail: { ruta, params } }));
  return true;
}
