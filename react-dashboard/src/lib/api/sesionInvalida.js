/**
 * Aviso de que una petición recibió un 401 (Plan 25 F9 · `SEG-01`).
 *
 * ── POR QUÉ UN EVENTO Y NO QUE CADA CLIENTE IMPORTE EL PROVIDER ─────
 *
 * Mismo criterio que `preguntaExterna.js` y `navegarDesdeAsistente.js` (Plan
 * 25 F7): `lib/api/*Api.js` no puede importar `app/providers/SesionProvider.jsx`
 * sin crear un ciclo —la app importa los clientes, no al revés— y un evento del
 * navegador rompe esa dependencia sin acoplar nada.
 *
 * Cada cliente que recibe un 401 despacha este evento con si el token estaba
 * CADUCADO o de plano era inválido —el backend ya distingue las dos cosas,
 * ver `autenticacion.mjs`— y `SesionProvider` decide qué hacer con cada una:
 * intentar renovar, o pedir acceso de nuevo.
 */

export const EVENTO_SESION_INVALIDA = "eva:sesion-invalida";

/**
 * @param {boolean} caducado  tal cual lo manda el backend en el 401
 */
export function avisarSesionInvalida(caducado) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_SESION_INVALIDA, { detail: { caducado } }));
}
