/**
 * Cliente del catálogo de manuales — `/api/rag/documentos` (Plan 16 Fase 1).
 *
 * ── POR QUÉ SUBIR/REEMPLAZAR NO MANDAN JSON ─────────────────────────
 *
 * El backend espera los BYTES del archivo tal cual en el cuerpo —igual que
 * `/api/voz` con el audio—, no envueltos en `multipart/form-data` ni en
 * base64 dentro de un JSON. Un `File` del navegador ES un `Blob`, así que
 * pasarlo directo como `body` de `fetch` ya manda exactamente eso; lo que no
 * cabe en el cuerpo —el nombre original, el sistema, el título— viaja en la
 * query string, que es donde `ragRoutes.mjs` lo espera.
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

/** Qué hay en el catálogo, fusionado con el estado del índice: fragmentos por
 *  manual, si algo se está indexando ahora mismo, y si la carga de nuevos
 *  manuales está habilitada en este servidor. */
export async function listarManuales({ signal } = {}) {
  const response = await fetch(`${API_BASE}/api/rag/documentos`, { signal });
  return parseResponse(response);
}

function query({ nombre, sistema, titulo }) {
  const params = new URLSearchParams();
  if (nombre) params.set("nombre", nombre);
  if (sistema) params.set("sistema", sistema);
  if (titulo) params.set("titulo", titulo);
  return params.toString();
}

/** Da de alta un manual nuevo. `archivo` es el `File` que entregó el
 *  navegador; `sistema` es el id del registro de `sistemas.js`, o `null`
 *  para «toda la planta». */
export async function subirManual({ archivo, sistema, titulo, signal }) {
  const response = await fetch(
    `${API_BASE}/api/rag/documentos?${query({ nombre: archivo.name, sistema, titulo })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: archivo,
      signal,
    }
  );
  return parseResponse(response);
}

/** Sustituye el contenido de un manual ya dado de alta. Mismo archivo,
 *  versión nueva. */
export async function reemplazarManual({ id, archivo, signal }) {
  const response = await fetch(`${API_BASE}/api/rag/documentos?id=${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: archivo,
    signal,
  });
  return parseResponse(response);
}

/** Archiva: el manual deja de indexarse, pero el archivo no se borra. */
export async function archivarManual({ id, signal }) {
  const response = await fetch(`${API_BASE}/api/rag/documentos?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    signal,
  });
  return parseResponse(response);
}

/**
 * Reasigna el manual a una máquina, o a toda la planta con `sistema` vacío.
 *
 * Comparte verbo y ruta con `archivarManual` —las dos son PATCH sobre la
 * misma entrada— y por eso la acción viaja explícita: `sistema` vacío es un
 * valor CON significado, así que «si viene sistema, reasigna» habría hecho que
 * devolver un manual a toda la planta lo archivara. Ver la cabecera de
 * `ArchivarManualQuerySchema` en el backend.
 *
 * Reasignar cambia qué manuales compiten al preguntar por una máquina: uno sin
 * asignar entra siempre, uno asignado sólo en la suya.
 */
export async function asignarSistemaManual({ id, sistema, signal }) {
  const params = new URLSearchParams({ id, accion: "asignar", sistema: sistema ?? "" });
  const response = await fetch(`${API_BASE}/api/rag/documentos?${params}`, {
    method: "PATCH",
    signal,
  });
  return parseResponse(response);
}
