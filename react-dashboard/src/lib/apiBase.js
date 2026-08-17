/**
 * De dónde cuelga la API para este build.
 *
 * Estaba duplicado literalmente en `lib/iconics/apiClient.js` y en
 * `features/asistente/lib/useAsistente.js`, y la duplicación no era inocua:
 * decidía a qué host se conecta la aplicación, así que al exponer el tablero a
 * la red había que acordarse de los dos sitios o el asistente hablaba con una
 * máquina distinta que el resto del tablero.
 *
 * ── POR QUÉ ES VACÍO Y NO `http://localhost:3001` ──────────────────
 *
 * Vacío significa "mismo origen", y eso vale en los dos despliegues:
 *
 *   - En planta el backend sirve el propio bundle, así que /api ya es suyo.
 *   - En desarrollo el dev server de Vite reenvía /api al backend (ver
 *     `server.proxy` en vite.config.js).
 *
 * Antes el defecto en desarrollo era `http://localhost:3001` y eso ataba la
 * aplicación a la máquina del navegador: al abrir el tablero desde otro equipo
 * de la red, "localhost" era el equipo del operador y todas las llamadas
 * fallaban. Con el proxy no hay ningún host escrito en el código, funciona
 * igual desde cualquier IP, y de paso no hace falta CORS: para el navegador
 * la API vive en el mismo origen que la página.
 *
 * `VITE_API_BASE` sigue mandando por encima, para apuntar a un backend que no
 * sea el del proxy (otro servidor, otra planta) sin recompilar la idea.
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";
