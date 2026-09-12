/**
 * Cliente del cuaderno de planta — `GET/POST /api/cuaderno` (Plan 25 F8).
 *
 * Archivo propio, no una extensión de `diarioApi.js`: son dos recursos
 * distintos por el mismo motivo que sus rutas HTTP están separadas — el diario
 * es lo que el SISTEMA registró, el cuaderno es lo que dice una PERSONA. Ver
 * la cabecera de `backend/routes/cuadernoRoutes.mjs`.
 *
 * Mismo criterio de `parseResponse` que `diarioApi.js`.
 */
import { API_BASE } from "./apiBase.js";
import { errorDeRespuesta } from "./errorDelPuente.js";
import { authHeaders } from "./sesion.js";

async function parseResponse(response) {
  const raw = await response.text();
  let data = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`El servidor respondió ${response.status}, pero no devolvió JSON válido.`);
    }
  }

  if (!response.ok) throw errorDeRespuesta(data, response.status);
  return data;
}

/**
 * Las notas de una ventana.
 *
 * @param {object}  opciones
 * @param {Date}    [opciones.desde]
 * @param {Date}    [opciones.hasta]
 * @param {number}  [opciones.limite]
 * @param {number}  [opciones.cursor]
 * @param {AbortSignal} [opciones.signal]
 * @returns {Promise<{ok, entradas, total, cursor, podas}>}
 */
export async function leerCuaderno({ desde, hasta, limite, cursor, signal } = {}) {
  const params = new URLSearchParams();
  if (desde instanceof Date) params.set("desde", desde.toISOString());
  if (hasta instanceof Date) params.set("hasta", hasta.toISOString());
  if (limite) params.set("limite", String(limite));
  if (cursor) params.set("cursor", String(cursor));

  const response = await fetch(`${API_BASE}/api/cuaderno?${params}`, { headers: authHeaders(), signal });
  return parseResponse(response);
}

/**
 * Añade una nota.
 *
 * NO se le pasa `autor` ni `instante`: el servidor los pone (ver la cabecera
 * de `cuadernoRoutes.mjs`), y una función que aceptara esos campos aquí
 * invitaría a alguien a intentar mandarlos.
 *
 * @param {object} datos
 * @param {string} datos.texto
 * @param {string} [datos.sistema]  `"tanque"` | `"vibraciones"` — opcional
 * @returns {Promise<{ok: boolean}>}
 */
export async function escribirEnCuaderno({ texto, sistema }) {
  const response = await fetch(`${API_BASE}/api/cuaderno`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ texto, ...(sistema ? { sistema } : {}) }),
  });
  return parseResponse(response);
}
