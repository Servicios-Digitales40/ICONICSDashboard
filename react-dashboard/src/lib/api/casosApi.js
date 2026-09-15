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

  if (!response.ok) {
    /* Conserva el `codigo`: ver `lib/api/errorDelPuente.js`. */
    throw errorDeRespuesta(data, response.status);
  }

  return data;
}

/** Las causas candidatas de un riesgo, ya puntuadas y ordenadas — el mismo
 *  `motorDiagnostico` que usa la herramienta de chat `diagnosticar_falla`,
 *  sin pasar por una conversación con el modelo. */
export async function obtenerDiagnostico({ sistema, riesgoId, valoresSensores, signal }) {
  const params = new URLSearchParams({ sistema, riesgoId });
  /*
   * La muestra de sensores con su calidad (Plan 28 F4). Es OPCIONAL: sin ella
   * el diagnóstico sale como siempre, y con ella el motor puede vetar las
   * señales cuya lectura no vale — un sensor inválido no respalda una causa.
   *
   * Viaja como JSON en la query porque el endpoint es un GET y la muestra son
   * unas pocas señales. `URLSearchParams` ya codifica; no hay que escapar a
   * mano.
   */
  if (valoresSensores && Object.keys(valoresSensores).length > 0) {
    params.set("valoresSensores", JSON.stringify(valoresSensores));
  }
  const response = await fetch(`${API_BASE}/api/diagnostico?${params}`, { headers: authHeaders(), signal });
  return parseResponse(response);
}

/**
 * El mismo diagnóstico, además NARRADO por el modelo — Plan 31 F2.
 *
 * ── POR QUÉ ES UNA FUNCIÓN APARTE Y NO UNA BANDERA ──────────────────
 *
 * Porque tardan cosas muy distintas. `obtenerDiagnostico` es determinista y
 * vuelve en milisegundos; ésta espera a un modelo de lenguaje y puede tardar
 * decenas de segundos. Quien sólo necesita las causas —`CierreDiagnostico`,
 * que pre-rellena un formulario— no debe compartir contrato con eso.
 *
 * ── `narracion: null` NO ES UN ERROR ────────────────────────────────
 *
 * Es el caso normal de un servidor sin `IA_BASE`, y `sinNarracion` dice por
 * qué. La respuesta trae las causas igual: la narración es el adorno, el
 * diagnóstico es el dato. Quien pinte esto enseña el diagnóstico y, si acaso,
 * menciona que no se pudo redactar — nunca al revés.
 *
 * `idioma` lo manda la PANTALLA y no se deduce de una cabecera: el tablero ya
 * sabe en qué idioma está, y `Accept-Language` dice lo que puso el navegador,
 * que es otra cosa.
 */
export async function obtenerDiagnosticoNarrado({ sistema, riesgoId, idioma, valoresSensores, signal }) {
  const params = new URLSearchParams({ sistema, riesgoId });
  if (idioma) params.set("idioma", idioma);
  if (valoresSensores && Object.keys(valoresSensores).length > 0) {
    params.set("valoresSensores", JSON.stringify(valoresSensores));
  }
  const response = await fetch(`${API_BASE}/api/diagnostico/narrado?${params}`, {
    headers: authHeaders(),
    signal,
  });
  return parseResponse(response);
}

/** Cierra un caso: lo que el sistema ya sabía más lo que confirmó o
 *  corrigió la persona. Ver `shared/eva/comun/aprendizaje.js` (`crearIntervencion`)
 *  para la forma completa de `datos`. */
export async function registrarCaso(datos, { signal } = {}) {
  const response = await fetch(`${API_BASE}/api/casos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(datos),
    signal,
  });
  return parseResponse(response);
}

/** La bitácora entera, de la más reciente atrás, **incluidas las
 *  archivadas**: la pantalla de revisión necesita enseñar precisamente lo
 *  que el diagnóstico ya no mira, para poder devolverlo. */
export async function listarCasos({ signal } = {}) {
  const response = await fetch(`${API_BASE}/api/casos`, { headers: authHeaders(), signal });
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
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ archivado }),
    signal,
  });
  return parseResponse(response);
}
