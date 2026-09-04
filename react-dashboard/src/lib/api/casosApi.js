/**
 * Cliente de la bitácora de casos — `/api/diagnostico` y `/api/casos`.
 *
 * Nació para UNA pantalla, `CierreDiagnostico.jsx` (Plan 16 Fase 5): leer la
 * propuesta del sistema y mandar lo que confirmó o corrigió la persona. Esa
 * pantalla se fue en la Fase 3 del Plan 20 —el cierre se hace por
 * conversación, con `cerrar_diagnostico`— y hoy el consumidor es el cajón
 * «Casos». Las cuatro siguen juntas porque son el mismo recurso, la bitácora,
 * vista en dos momentos: cuando se escribe y cuando se repasa.
 *
 * ── QUÉ SE FUE DE AQUÍ (PLAN 20 FASE 4) ────────────────────────────
 *
 * Un `parseResponse` propio, idéntico al de `ragApi.js`. Interpretar la
 * respuesta de la API es exactamente la clase de cosa que no puede estar en
 * dos sitios: una mejora en el mensaje de error de uno no llegaba al otro, y
 * con la sesión de por medio habría además dos lugares donde acertar a
 * distinguir un 401 de caducidad de uno de permisos. Vive en `pedir.js`.
 */
import { pedirJson } from "./pedir.js";

/** Las causas candidatas de un riesgo, ya puntuadas y ordenadas — el mismo
 *  `motorDiagnostico` que usa la herramienta de chat `diagnosticar_falla`,
 *  sin pasar por una conversación con el modelo. */
export async function obtenerDiagnostico({ sistema, riesgoId, signal }) {
  const params = new URLSearchParams({ sistema, riesgoId });
  return pedirJson(`/api/diagnostico?${params}`, { signal });
}

/** Cierra un caso: lo que el sistema ya sabía más lo que confirmó o
 *  corrigió la persona. Ver `shared/eva/comun/aprendizaje.js` (`crearIntervencion`)
 *  para la forma completa de `datos`. */
export async function registrarCaso(datos, { signal } = {}) {
  return pedirJson("/api/casos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
    signal,
  });
}

/** La bitácora entera, de la más reciente atrás, **incluidas las
 *  archivadas**: el cajón de revisión necesita enseñar precisamente lo
 *  que el diagnóstico ya no mira, para poder devolverlo. */
export async function listarCasos({ signal } = {}) {
  return pedirJson("/api/casos", { signal });
}

/**
 * Archiva un caso, o lo devuelve. No borra: ver `estaArchivada` en
 * `@shared/eva/comun/aprendizaje.js` para por qué la baja es ésta y no un
 * `DELETE` — es el mismo criterio con el que se archiva un manual.
 */
export async function archivarCaso({ id, archivado, signal }) {
  return pedirJson(`/api/casos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archivado }),
    signal,
  });
}
