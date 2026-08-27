/**
 * Preguntarle a Tdconcito desde cualquier pantalla.
 *
 * ── POR QUÉ UN EVENTO Y NO UN CONTEXTO ─────────────────────────────
 *
 * El asistente se monta solo, una vez, fuera del árbol de las vistas: decide
 * él si aparecer según lo que diga el servidor (`IA_BASE`). Las vistas no lo
 * renderizan y no lo conocen.
 *
 * Un contexto obligaría a envolver la aplicación entera en un proveedor que
 * existe para que dos pantallas puedan mandar una cadena de texto, y a que
 * cada vista que quiera preguntar se acople al asistente. Un evento del
 * navegador hace lo mismo sin acoplar nada: quien quiera preguntar llama a
 * `pedirAlAsistente()`, y si el asistente no está montado —una instalación sin
 * modelo configurado— no pasa absolutamente nada. Que no haya nadie
 * escuchando es un caso NORMAL aquí, no un fallo.
 *
 * ── POR QUÉ ESTO NO ES UN ATAJO SUCIO ──────────────────────────────
 *
 * Porque el contrato es de una sola dirección y de un solo dato: se manda un
 * texto, no se espera respuesta. No hay estado compartido que pueda
 * desincronizarse, y el que escucha es exactamente uno.
 */

/** Nombre del evento. Vive aquí para que nadie lo escriba a mano dos veces. */
export const EVENTO_PREGUNTA = "tdconcito:preguntar";

/**
 * Abre el asistente y le manda una pregunta.
 *
 * @param {string} texto  la pregunta, ya redactada por quien la lanza
 * @returns {boolean} si llegó a despacharse (falso si el texto estaba vacío)
 */
export function pedirAlAsistente(texto) {
  const limpio = String(texto ?? "").trim();
  if (!limpio) return false;
  if (typeof window === "undefined") return false;

  window.dispatchEvent(new CustomEvent(EVENTO_PREGUNTA, { detail: { texto: limpio } }));
  return true;
}
