/**
 * Cliente mínimo para el backend puente hacia ICONICS (backend/server.mjs).
 *
 * Las rutas son relativas al origen de la página en los dos despliegues: en
 * planta porque el backend sirve el bundle, y en desarrollo porque el dev
 * server reenvía /api al backend. Ver `lib/api/apiBase.js`.
 */
import { API_BASE } from "@/lib/api/apiBase";

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
/**
 * Varias series históricas de una ventana, en UNA sola petición.
 *
 * ── POR QUÉ EXISTE, Y QUÉ SUSTITUYE ────────────────────────────────
 *
 * Porque el troceado de una ventana larga vivía aquí, en el navegador: cada
 * tramo salía como una petición HTTP propia, y cinco señales por diez tramos
 * de una ventana de 30 días eran CINCUENTA peticiones para pintar una
 * pantalla. El limitador del puente corta en 300 por minuto y por IP, así que
 * ese patrón se llevaba un 429 que acababa pagando el siguiente en preguntar.
 *
 * Ahora el cliente pide LA VENTANA y el servidor trocea: mismo `planificar()`,
 * misma concurrencia acotada, una respuesta. Ver la ruta en
 * `backend/routes/iconicsRoutes.mjs`.
 *
 * Devuelve `{ ok, payload: { series, ventana } }`, donde `series` va indexado por
 * nombre de punto y cada entrada trae `data` —las muestras crudas, en el mismo
 * formato que `fetchIconicsHistory`— junto a la cobertura del troceado
 * (`tramos`, `tramosConDato`, `tramosFallidos`): quien lo pinte puede DECLARAR
 * lo que se leyó en vez de suponerlo.
 */
export function fetchIconicsHistoryBatch(points, { startDate, endDate, aggregate } = {}) {
  return enviarJson("POST", "/api/iconics/history/batch", {
    points,
    startDate,
    endDate,
    aggregate,
  });
}
export function browseIconics(path) {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return getJson(`/api/iconics/browse${query}`);
}

/** Verbo HTTP genérico con cuerpo JSON hacia el backend puente. */
async function enviarJson(metodo, path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `Error ${response.status} al consultar ${path}`);
  }
  return payload;
}

/** POST genérico con cuerpo JSON hacia el backend puente. */
const postJson = (path, body) => enviarJson("POST", path, body);

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

/**
 * Historial de alarmas de las últimas `hours` horas (máx. 48, recortado por
 * el propio servidor). Sin `pointName`, trae las de toda la instalación.
 * Devuelve `{ ok, alarms: [...] }` — la forma exacta de cada evento la
 * decide ICONICS y este cliente no la interpreta; sólo se ha confirmado
 * `eventId` y `startDate` (`scripts/verificar-backend.mjs`), así que quien
 * pinte esto no puede dar por hecho ningún otro campo.
 */
export function fetchIconicsAlarms(pointName, hours = 1) {
  const params = new URLSearchParams({ hours: String(hours) });
  if (pointName) params.set("pointName", pointName);
  return getJson(`/api/iconics/alarms?${params}`);
}

/**
 * Reconoce una o varias alarmas. Responde 403 —y este cliente lo propaga
 * como excepción— si el puente está en modo solo lectura
 * (`ICONICS_READ_ONLY`); quien llame a esto ya debería haber comprobado
 * `fetchHealth().readOnly` antes de ofrecer el botón.
 */
export function acknowledgeIconicsAlarms(eventIds, comment = "") {
  return enviarJson("PUT", `/api/iconics/alarms/acknowledge`, { eventIds, comment });
}

/**
 * Estado del propio puente: si ICONICS responde, si el token es válido, y
 * —lo que le importa a esta vista— si está en modo solo lectura. Es la
 * misma respuesta que ya usa `scripts/verificar-backend.mjs` para probar el
 * arranque; aquí se lee para decidir si el botón de reconocer alarmas tiene
 * sentido ofrecerlo.
 */
export function fetchHealth() {
  return getJson(`/api/health`);
}
