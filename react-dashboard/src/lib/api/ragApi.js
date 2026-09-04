/**
 * Cliente del catálogo de manuales — `/api/rag/documentos` (Plan 16 Fase 1).
 *
 * Es el camino por el que entra al asistente todo el conocimiento que no mide
 * ICONICS. Lo consume el cajón «Manuales» (capacidad 7 del encargo).
 *
 * ── POR QUÉ SUBIR/REEMPLAZAR NO MANDAN JSON ─────────────────────────
 *
 * El backend espera los BYTES del archivo tal cual en el cuerpo —igual que
 * `/api/voz` con el audio—, no envueltos en `multipart/form-data` ni en
 * base64 dentro de un JSON. Un `File` del navegador ES un `Blob`, así que
 * pasarlo directo como `body` de `fetch` ya manda exactamente eso; lo que no
 * cabe en el cuerpo —el nombre original, el sistema, el título— viaja en la
 * query string, que es donde `ragRoutes.mjs` lo espera.
 *
 * ── QUÉ SE FUE DE AQUÍ (PLAN 20 FASE 4) ────────────────────────────
 *
 * Un `parseResponse` propio, copiado literal en `casosApi.js`. Ver la cabecera
 * de aquél: la capa que interpreta errores de la API vive ahora en `pedir.js`,
 * una sola vez, que es también donde se decide qué 401 expulsa al login y cuál
 * es sólo una falta de permisos.
 */
import { pedirJson } from "./pedir.js";

/** Qué hay en el catálogo, fusionado con el estado del índice: fragmentos por
 *  manual, si algo se está indexando ahora mismo, y si la carga de nuevos
 *  manuales está habilitada en este servidor. */
export async function listarManuales({ signal } = {}) {
  return pedirJson("/api/rag/documentos", { signal });
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
  return pedirJson(
    `/api/rag/documentos?${query({ nombre: archivo.name, sistema, titulo })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: archivo,
      signal,
    }
  );
}

/** Sustituye el contenido de un manual ya dado de alta. Mismo archivo,
 *  versión nueva. */
export async function reemplazarManual({ id, archivo, signal }) {
  return pedirJson(`/api/rag/documentos?id=${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: archivo,
    signal,
  });
}

/** Archiva: el manual deja de indexarse, pero el archivo no se borra. */
export async function archivarManual({ id, signal }) {
  return pedirJson(`/api/rag/documentos?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    signal,
  });
}
