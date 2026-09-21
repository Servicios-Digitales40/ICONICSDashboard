/**
 * Cliente de las MÁQUINAS CONFIGURADAS — `/api/maquinas`. Plan 33 F5.
 *
 * Mismo criterio de `parseResponse` que `casosApi.js` y `ragApi.js`, incluido
 * lo que de verdad importa de esa función: que conserve el `codigo` del error.
 * Sin él, el tablero en inglés enseña la frase en español que redactó el
 * servidor — el fallo silencioso que `verificar-codigos.mjs` existe para cazar.
 *
 * ── LO QUE ESTE CLIENTE DEVUELVE Y NO TIRA ─────────────────────────
 *
 * `crear` y `editar` pueden fallar con 400 y una lista de `problemas`
 * —`{campo, problema}`— que es lo que permite a la pantalla señalar el paso
 * que está mal en vez de un aviso genérico encima del formulario.
 *
 * Esa lista viaja DENTRO del error, no se pierde: `errorDeRespuesta` conserva
 * el cuerpo, y `problemasDeError()` de aquí abajo lo saca. Una versión que
 * lanzara sólo el mensaje obligaría a la vista a reimplementar la validación
 * para saber dónde apuntar, que es cómo nacen las dos copias de una regla.
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
    /* Conserva el `codigo` y el cuerpo: ver `lib/api/errorDelPuente.js`. */
    throw errorDeRespuesta(data, response.status);
  }

  return data;
}

/**
 * Los problemas por campo que trae un error de validación, o lista vacía.
 *
 * Existe para que la vista no tenga que saber dónde los pone el backend. Si
 * mañana cambia la forma de la respuesta, cambia aquí y no en cada formulario.
 */
export function problemasDeError(error) {
  const lista = error?.detalle?.problemas;
  return Array.isArray(lista) ? lista : [];
}

/** Los tipos de máquina que este programa sabe interpretar. */
export async function listarTipos({ signal } = {}) {
  const response = await fetch(`${API_BASE}/api/maquinas/tipos`, { signal });
  return parseResponse(response);
}

/** Las máquinas configuradas, con sus capacidades ya derivadas. */
export async function listarMaquinas({ signal } = {}) {
  const response = await fetch(`${API_BASE}/api/maquinas`, { signal });
  return parseResponse(response);
}

/** Una máquina por su id. */
export async function obtenerMaquina(id, { signal } = {}) {
  const response = await fetch(`${API_BASE}/api/maquinas/${encodeURIComponent(id)}`, { signal });
  return parseResponse(response);
}

/**
 * Da de alta una máquina.
 *
 * Lo que se manda es la configuración tal cual la armó el formulario. **No se
 * manda `historyVerified`**: el backend lo descarta de todas formas —prometer
 * una serie es una afirmación sobre el servidor, y el servidor ya ha mentido
 * sobre eso— así que mandarlo sólo invitaría a creer que sirve de algo.
 */
export async function crearMaquina(maquina, { signal } = {}) {
  const response = await fetch(`${API_BASE}/api/maquinas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(maquina),
    signal,
  });
  return parseResponse(response);
}

/** Modifica una máquina. El `id` no se puede cambiar: lo guardan sus casos. */
export async function editarMaquina(id, cambios, { signal } = {}) {
  const response = await fetch(`${API_BASE}/api/maquinas/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(cambios),
    signal,
  });
  return parseResponse(response);
}

/**
 * Contrasta una máquina contra ICONICS y anota el resultado. Plan 33 F8.
 *
 * ── LO QUE DEVUELVE, Y POR QUÉ `anotado` IMPORTA ───────────────────
 *
 * `{ estado, motivo, resumen, ausentes, anotado }`.
 *
 * `anotado` es `false` cuando el estado salió `UNKNOWN` —no se pudo mirar— y
 * el backend decidió NO guardarlo: lo que se sabía ayer sigue siendo la mejor
 * información disponible, y pisarlo con «hubo un corte de red» perdería un
 * dato cierto a cambio de uno que no dice nada de la máquina.
 *
 * Quien lo pinte tiene que distinguirlo: enseñar `UNKNOWN` como si fuera el
 * estado nuevo de la máquina sería exactamente la confusión que esta fase
 * existe para evitar.
 */
export async function verificarMaquina(id, { signal } = {}) {
  const response = await fetch(
    `${API_BASE}/api/maquinas/${encodeURIComponent(id)}/verificar`,
    { method: "POST", headers: { ...authHeaders() }, signal },
  );
  return parseResponse(response);
}

/**
 * Propone las variables de una máquina recorriendo el árbol de ICONICS.
 * Plan 34 F4.
 *
 * ── NO GUARDA NADA, Y ESO ES EL PUNTO ──────────────────────────────
 *
 * Devuelve una PROPUESTA: las variables que el árbol publica, con su
 * emparejamiento `ac:` ↔ `hda:` sugerido donde el nombre coincide y su rol
 * propuesto donde el tipo lo reconoce. Quien la revisa decide qué entra.
 *
 * Lo que no resuelve lo DICE en vez de adivinarlo: `procedencia` explica por
 * qué se propuso cada emparejamiento, `rolCandidatos` trae los varios cuando
 * hay más de uno, y `sinEmparejar` lista lo que el historiador publica y
 * nadie reclamó. Una variable mal emparejada no da error — da una gráfica con
 * la señal de al lado bajo el rótulo correcto.
 *
 * `tipo` es opcional: sin él se descubren variables y emparejamientos, pero
 * ningún rol, porque los roles son del tipo.
 */
export async function descubrirMaquina(
  { raizEnVivo, raizHistorico = null, areaAlarmas = null, tipo = null },
  { signal } = {},
) {
  const response = await fetch(`${API_BASE}/api/maquinas/descubrir`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ raizEnVivo, raizHistorico, areaAlarmas, tipo }),
    signal,
  });
  return parseResponse(response);
}

/**
 * Sondea las series de una máquina y anota cuáles son de verdad suyas.
 * Plan 34 F4.
 *
 * ── POR QUÉ ÉSTE SÍ ESCRIBE, Y `descubrir` NO ──────────────────────
 *
 * Porque aquí no hay nada que decidir: la serie es de esta variable o es la
 * de otra, y eso lo dice el servidor comparando. Lo que se guarda es el
 * resultado de una medición, no una elección de nadie.
 *
 * Escribe en NUESTRO archivo de configuración, no en la instalación — el
 * mismo argumento por el que `verificarMaquina` ya puede escribir sin la
 * autenticación de la que depende el alta.
 *
 * `pendientes` trae sólo lo que NO quedó verificado, con su `causa`:
 * `serie-compartida` (el servidor da la misma serie a varias),
 * `sin-variacion` (no se puede distinguir de otra plana), `sin-muestras` o
 * `no-se-pudo-leer`. Las dos últimas no son un veredicto sobre la variable.
 */
export async function sondearMaquina(id, { signal } = {}) {
  const response = await fetch(
    `${API_BASE}/api/maquinas/${encodeURIComponent(id)}/sondear`,
    { method: "POST", headers: { ...authHeaders() }, signal },
  );
  return parseResponse(response);
}

/**
 * Da de baja una máquina.
 *
 * La respuesta trae `desactivada`: con casos previos asociados el backend NO
 * borra, desactiva — y dice por qué en `motivo`. Quien llame tiene que pintar
 * esa diferencia, porque un «hecho» sobre una máquina que sigue ahí sería
 * mentir sobre lo que acaba de pasar.
 */
export async function eliminarMaquina(id, { signal } = {}) {
  const response = await fetch(`${API_BASE}/api/maquinas/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
    signal,
  });
  return parseResponse(response);
}
