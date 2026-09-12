/**
 * Cliente del diario de accionamientos — `GET /api/diario` (Plan 25 F1/F2).
 *
 * Archivo propio y no una función más en `casosApi.js` porque no es el mismo
 * recurso ni la misma clase de dato: la bitácora de casos la escriben las
 * PERSONAS al cerrar un diagnóstico, y el diario lo escribe el SISTEMA cada vez
 * que alguien acciona algo, con su IP y su usuario. Juntarlos invitaría a
 * tratarlos igual, y no lo son: uno se puede archivar y corregir, el otro es un
 * registro de lo que pasó y no se toca.
 *
 * Mismo criterio de `parseResponse` que `casosApi.js` y `ragApi.js`: conserva
 * el `codigo` del puente, que es lo único que permite traducir el fallo.
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
 * Los accionamientos de una ventana.
 *
 * @param {object}  opciones
 * @param {Date}    [opciones.desde]
 * @param {Date}    [opciones.hasta]
 * @param {number}  [opciones.limite]
 * @param {number}  [opciones.cursor]  ÍNDICE, no fecha — ver `lib/diario.mjs`.
 * @param {AbortSignal} [opciones.signal]
 * @returns {Promise<{ok, entradas, total, cursor, podas}>}
 */
export async function leerDiario({ desde, hasta, limite, cursor, signal } = {}) {
  const params = new URLSearchParams();
  if (desde instanceof Date) params.set("desde", desde.toISOString());
  if (hasta instanceof Date) params.set("hasta", hasta.toISOString());
  if (limite) params.set("limite", String(limite));
  if (cursor) params.set("cursor", String(cursor));

  const response = await fetch(`${API_BASE}/api/diario?${params}`, { headers: authHeaders(), signal });
  return parseResponse(response);
}
