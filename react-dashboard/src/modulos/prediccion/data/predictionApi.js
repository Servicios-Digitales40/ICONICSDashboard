/**
 * Cliente del backend predictivo V4.4 — el histórico de un compresor real,
 * servido por Django. La ÚNICA puerta de este módulo hacia su origen de datos.
 *
 * ── LA DIRECCIÓN ERA DOS DIRECCIONES ────────────────────────────────
 *
 * Hasta el 03-09-2026 esto tenía dos respuestas distintas y contradictorias
 * para la misma pregunta: en el navegador daba por hecho que Django corría en
 * el MISMO host que el dashboard (`window.location.hostname:8000`), y sin
 * navegador devolvía `10.10.21.11:8000`. Las dos no podían ser ciertas, y de
 * hecho ninguna lo era: la API corre en su propia máquina, `10.10.17.13:8000`
 * — una cuarta computadora, distinta del servidor de ICONICS, del de IA y del
 * que sirve este tablero.
 *
 * Ahora hay UN valor por defecto, explícito, e igual con navegador y sin él.
 * Se cambia sin tocar código con `VITE_PREDICTION_API_BASE`:
 *
 *   VITE_PREDICTION_API_BASE=http://127.0.0.1:8000
 *
 * ── ESTE MÓDULO LLAMA A DJANGO DIRECTAMENTE, Y ES UNA DECISIÓN ABIERTA ──
 *
 * En Monitoreo el navegador sólo habla con el puente (`:3001`), y ni las
 * credenciales de ICONICS ni el servidor de IA quedan expuestos al cliente.
 * Aquí no: la petición sale del navegador del técnico a `:8000`.
 *
 * Eso implica CORS, una API-key que viaja en el bundle si algún día se exige,
 * y dos superficies que explicar en vez de una. La alternativa —proxy por el
 * puente, como `backend/iconics/`— está planteada en
 * `docs/PLAN-19-MODULARIZACION.md` F4, y está BLOQUEADA hasta saber si Django
 * es alcanzable desde el servidor del puente y no sólo desde la red del
 * navegador. Mientras tanto esto se queda como está, dicho en voz alta.
 */

/** La máquina donde corre la API predictiva. Ver la cabecera. */
const HOST_POR_DEFECTO = "http://10.10.17.13:8000";

function defaultBase() {
  return HOST_POR_DEFECTO;
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
