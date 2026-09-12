/**
 * Cliente de sesión — `POST /api/auth/login`, `POST /api/auth/renovar`,
 * `GET /api/auth/yo` (Plan 25 F9 · `SEG-01`, segunda mitad).
 *
 * No guarda nada por su cuenta: devuelve lo que contestó el servidor, y quien
 * llama decide si lo guarda (`guardarSesion()` en `sesion.js`). Separar la
 * llamada de la persistencia es lo que permite probar cada una sin la otra.
 */
import { API_BASE } from "./apiBase.js";
import { authHeaders } from "./sesion.js";
import { errorDeRespuesta } from "./errorDelPuente.js";

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

  if (!response.ok) throw errorDeRespuesta(data, response.status);
  return data;
}

/**
 * @param {string} usuario
 * @param {string} clave
 * @returns {Promise<{ok, token, expiraEnMinutos, usuario}>}
 */
export async function iniciarSesion(usuario, clave) {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, clave }),
  });
  return parseResponse(response);
}

/**
 * Renueva el token actual. Necesita una sesión ya guardada —manda su propio
 * `Authorization`— así que llamarla sin sesión previa siempre da 401.
 *
 * @returns {Promise<{ok, token, expiraEnMinutos, usuario}>}
 */
export async function renovarSesion() {
  const response = await fetch(`${API_BASE}/api/auth/renovar`, {
    method: "POST",
    headers: authHeaders(),
  });
  return parseResponse(response);
}

/**
 * ¿Hace falta autenticarse en este servidor, y con quién estamos entrando?
 *
 * Es la única ruta que funciona en los DOS estados: con `AUTH_HABILITADA=false`
 * la guarda rellena un anónimo sin exigir token (`autenticacion.mjs`), y con
 * ella encendida exige el que se le mande —o ninguno, y entonces contesta 401
 * como cualquier otra ruta protegida—. Por eso es el sitio correcto para
 * preguntar «¿hace falta pantalla de acceso?» al arrancar: no hay que adivinar
 * el estado del servidor desde otro lado.
 *
 * @returns {Promise<{ok, usuario: {id, roles, autenticado}, habilitada}>}
 */
export async function quienSoy() {
  const response = await fetch(`${API_BASE}/api/auth/yo`, { headers: authHeaders() });
  return parseResponse(response);
}
