/**
 * Cliente del backend MetroPT-3 V4.4.
 *
 * Por defecto usa el mismo host desde el que se abrió el dashboard, pero en
 * el puerto 8000, que es donde corre Django en desarrollo. Se puede cambiar
 * sin tocar el código con VITE_PREDICTION_API_BASE.
 *
 * Ejemplos:
 *   VITE_PREDICTION_API_BASE=http://127.0.0.1:8000
 *   VITE_PREDICTION_API_BASE=http://10.10.17.25:8000
 */

function defaultBase() {
  if (typeof window === "undefined") return "http://127.0.0.1:8000";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export const PREDICTION_API_BASE = (
  import.meta.env.VITE_PREDICTION_API_BASE || defaultBase()
).replace(/\/+$/, "");

const API_KEY = (import.meta.env.VITE_PREDICTION_API_KEY || "").trim();

async function parseResponse(response) {
  const raw = await response.text();
  let data = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `El backend predictivo respondió ${response.status}, pero no devolvió JSON válido.`
      );
    }
  }

  if (!response.ok) {
    const message = data?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function headers() {
  const result = { "Content-Type": "application/json" };
  if (API_KEY) result["X-API-Key"] = API_KEY;
  return result;
}

export async function fetchPredictionHealth({ signal } = {}) {
  const response = await fetch(`${PREDICTION_API_BASE}/api/v1/health/`, {
    method: "GET",
    headers: API_KEY ? { "X-API-Key": API_KEY } : undefined,
    signal,
  });
  return parseResponse(response);
}

/**
 * Consulta la reproducción histórica de uno de los cuatro eventos MetroPT-3.
 * Devuelve exactamente `hoursBefore` elementos en `timeline`.
 */
export async function fetchEventHistory({ eventId, hoursBefore, signal } = {}) {
  const response = await fetch(`${PREDICTION_API_BASE}/api/v1/event-history/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      event_id: Number(eventId),
      hours_before: Number(hoursBefore),
    }),
    signal,
  });

  return parseResponse(response);
}
