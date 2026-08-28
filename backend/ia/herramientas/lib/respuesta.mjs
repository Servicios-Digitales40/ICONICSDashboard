/**
 * backend/ia/herramientas/lib/respuesta.mjs
 * ------------------------------------------------------------------
 * La forma del fallo de una herramienta.
 *
 * ── POR QUÉ UN FALLO NO ES UNA EXCEPCIÓN ───────────────────────────
 *
 * Porque el destinatario es un modelo de lenguaje en mitad de una
 * conversación, no un programador leyendo una traza. Una excepción corta el
 * turno; un `{ ok: false, error }` llega al modelo como un dato que puede
 * contar —y, sobre todo, del que puede recuperarse: los errores de este
 * proyecto llevan dentro la lista de ids válidos, el sistema correcto o el
 * nombre de la herramienta que sí sirve, para que el reintento no gaste otra
 * ronda de treinta segundos.
 *
 * `extra` no es decoración: es esa información de recuperación. Ver
 * `senalDesconocida` en `herramientas.mjs`, que devuelve `{ sistema, clave }`
 * junto al mensaje.
 *
 * Vive aquí, y no en `herramientas.mjs`, porque toda familia de herramientas
 * la necesita y ninguna debería reimplementarla: dos formas distintas de decir
 * «no pude» son dos formas distintas de que el modelo lo interprete.
 */
export function fallo(error, extra = {}) {
  return { ok: false, error, ...extra }
}
