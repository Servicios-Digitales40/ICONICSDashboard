/**
 * Cliente de la bitácora de casos — `/api/diagnostico` y `/api/casos`.
 *
 * Nació para UNA pantalla, `CierreDiagnostico.jsx` (Plan 16 Fase 5): leer la
 * propuesta del sistema y mandar lo que confirmó o corrigió la persona. Hoy
 * lo comparte con `CasosRag.jsx`, la pantalla de revisión, que usa las dos
 * de abajo. Siguen juntas porque son el mismo recurso —la bitácora— visto
 * en dos momentos: cuando se escribe y cuando se repasa.
 *
 * Mismo criterio de `parseResponse` que `ragApi.js`.
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
 *  corrigió la persona. Ver `shared/eva/comun/aprendizaje.js` (`crearIntervencion`)
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

/** La bitácora entera, de la más reciente atrás, **incluidas las
 *  archivadas**: la pantalla de revisión necesita enseñar precisamente lo
 *  que el diagnóstico ya no mira, para poder devolverlo. */
export async function listarCasos({ signal } = {}) {
  const response = await fetch(`${API_BASE}/api/casos`, { signal });
  return parseResponse(response);
}

/**
 * Archiva un caso, o lo devuelve. No borra: ver `estaArchivada` en
 * `@shared/eva/comun/aprendizaje.js` para por qué la baja es ésta y no un
 * `DELETE` — es el mismo criterio con el que se archiva un manual.
 */
export async function archivarCaso({ id, archivado, signal }) {
  const response = await fetch(`${API_BASE}/api/casos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archivado }),
    signal,
  });
  return parseResponse(response);
}
