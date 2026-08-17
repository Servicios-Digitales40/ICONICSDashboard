/**
 * Cliente mínimo para el backend puente hacia ICONICS (backend/server.mjs).
 *
 * Las rutas son relativas al origen de la página en los dos despliegues: en
 * planta porque el backend sirve el bundle, y en desarrollo porque el dev
 * server reenvía /api al backend. Ver `lib/apiBase.js`.
 */
import { API_BASE } from "@/lib/apiBase";

async function getJson(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `Error ${response.status} al consultar ${path}`);
  }
  return payload;
}

/** Lee un único punto de ICONICS: { ok, payload: { value, quality, timestamp, ... } } */
export function fetchIconicsPoint(pointName) {
  const query = pointName ? `?pointName=${encodeURIComponent(pointName)}` : "";
  return getJson(`/api/iconics/data${query}`);
}

/**
 * Lee varios puntos de una sola vez (POST /Data del lado de ICONICS).
 * Recibe un arreglo de pointNames y devuelve { ok, payload: mapa }, donde
 * el mapa está indexado por pointName: { [pointName]: { ok, payload: { value, ... } } }.
 */
export function fetchIconicsBatch(pointNames) {
  const points = pointNames.map((p) => encodeURIComponent(p)).join(",");
  return getJson(`/api/iconics/data/batch?points=${points}`);
}

/**
 * Lee la serie HISTÓRICA de un punto (Hyper Historian, prefijo `hda:`).
 *
 * Devuelve `{ ok, data: [{ timestamp, value, quality }], hasMore }`; el backend
 * ya normaliza la respuesta de ICONICS, que llega envuelta en
 * `historicalSamples`.
 *
 * La historia no se sondea: se pide una vez por (punto, rango) y se cachea,
 * porque el pasado no cambia. El borde derecho lo cubre el valor en vivo.
 *
 * `aggregate` e `interval` los resuelve el servidor y reducen mucho el volumen
 * de puntos. Sin agregado, el backend limita a 100 muestras por llamada
 * (cabecera `X-ICO-MAX-ITEM-COUNT`) y avisa con `hasMore`.
 *
 * @param {string} pointName  p. ej. `hda:\Configuration\RESONAC\LIN\1:OEE`
 * @param {object} rango      { startDate, endDate, aggregate, interval }
 */
export function fetchIconicsHistory(pointName, { startDate, endDate, aggregate, interval } = {}) {
  const params = new URLSearchParams({ pointName });
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (aggregate) params.set("aggregate", aggregate);
  if (interval) params.set("interval", String(interval));

  return getJson(`/api/iconics/history?${params}`);
}

/**
 * Navega el árbol de puntos de ICONICS (db, assets `ac:`, etc.).
 * Sin `path` lista la raíz. Devuelve { ok, payload: BrowseResult[] }, donde
 * cada nodo trae { shortName, displayName, pointName, browsePointName, ... }.
 * Los nodos navegables (carpetas/equipos) tienen pointName terminado en "/".
 */
export function browseIconics(path) {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return getJson(`/api/iconics/browse${query}`);
}

/** POST genérico con cuerpo JSON hacia el backend puente. */
async function postJson(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `Error ${response.status} al consultar ${path}`);
  }
  return payload;
}

/**
 * Escribe varias celdas/puntos de ICONICS de una sola vez.
 * items: [{ pointName, value }] → { ok, results: WriteResult[] }.
 */
export function writeIconicsBatch(items) {
  return postJson(`/api/iconics/write/batch`, { items });
}

/**
 * Escribe un único punto de ICONICS.
 * Devuelve { ok, result: { pointName, success, errorMessage } }.
 * Se usa, entre otros, para disparar Data Manipulators de GridWorX
 * escribiendo `true` a su punto `.@@Execute`.
 */
export function writeIconicsPoint(pointName, value) {
  return postJson(`/api/iconics/write`, { pointName, value });
}
