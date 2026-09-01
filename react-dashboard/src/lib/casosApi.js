/**
 * Cliente del cierre de diagnóstico — `/api/diagnostico` y `/api/casos`
 * (Plan 16 Fase 5).
 *
 * Las dos rutas conviven en un archivo porque las usa UNA sola pantalla,
 * `CierreDiagnostico.jsx`, en el mismo orden en que aparecen aquí: primero
 * se lee la propuesta del sistema, después se manda lo que confirmó o
 * corrigió la persona. Mismo criterio de `parseResponse` que `ragApi.js`.
 */
import { API_BASE } from "./apiBase.js";

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

  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}

/** Las causas candidatas de un riesgo, ya puntuadas y ordenadas — el mismo
 *  `motorDiagnostico` que usa la herramienta de chat `diagnosticar_falla`,
 *  sin pasar por una conversación con el modelo. */
export async function obtenerDiagnostico({ sistema, riesgoId, signal }) {
  const params = new URLSearchParams({ sistema, riesgoId });
  const response = await fetch(`${API_BASE}/api/diagnostico?${params}`, { signal });
  return parseResponse(response);
}

/** Cierra un caso: lo que el sistema ya sabía más lo que confirmó o
 *  corrigió la persona. Ver `shared/eva/aprendizaje.js` (`crearIntervencion`)
 *  para la forma completa de `datos`. */
export async function registrarCaso(datos, { signal } = {}) {
  const response = await fetch(`${API_BASE}/api/casos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
    signal,
  });
  return parseResponse(response);
}
