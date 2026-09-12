/**
 * La sesión de quien mira el tablero: el token, cuándo caduca, y los
 * encabezados que hay que mandar (Plan 25 F9 · `SEG-01`, segunda mitad).
 *
 * ── POR QUÉ ESTO Y NO UN `fetch` GLOBAL INTERCEPTADO ────────────────
 *
 * Se consideró envolver `window.fetch` una sola vez al arrancar, en vez de
 * tocar cada cliente. Se descartó: sería invisible al leer cualquier cliente
 * por separado —nadie vería, mirando `casosApi.js`, que sus peticiones llevan
 * un token— y arriesgaría las pruebas que ya mockean `globalThis.fetch`
 * directamente (F0, F2, F4, F7 lo hacen). `authHeaders()` explícito, añadido a
 * cada cliente, es más trabajo pero nada queda oculto.
 *
 * ── DÓNDE VIVE EL TOKEN, Y POR QUÉ NO ES UNA COOKIE ─────────────────
 *
 * `localStorage`, por dispositivo. El backend no pone la cookie —firma un JWT
 * y lo devuelve en el cuerpo (`authRoutes.mjs`)—, así que no hay sesión de
 * servidor que gestionar aquí: guardarlo es responsabilidad del cliente, igual
 * que ya hace `persistencia.js` del asistente con el hilo de conversación.
 *
 * ── FAIL-OPEN, MISMO CRITERIO QUE `vistoPorMi.js` ───────────────────
 *
 * Un almacenamiento bloqueado (un kiosco configurado así) no debe tirar la
 * aplicación: se lee como «sin sesión», que fuerza a pedir acceso — el lado
 * seguro. Fingir una sesión con datos rotos sería el lado peligroso.
 *
 * ── LA RENOVACIÓN PROACTIVA, Y POR QUÉ ANTES Y NO DESPUÉS DE UN 401 ─
 *
 * El plan lo pide explícito: «la renovación se intenta antes de caducar». Un
 * token vive 12 h por defecto (`AUTH_MINUTOS`, ver `config.mjs`) — bastante
 * para cubrir un turno con su relevo, pero cualquier margen es finito, y un
 * wallboard sin teclado que espere al 401 para reaccionar ya tuvo una ventana
 * en la que las peticiones fallaron antes de que nadie se enterara.
 *
 * `UMBRAL_RENOVACION_MIN` (30 min) es el margen antes de esa hora límite en el
 * que se intenta renovar. No es agresivo —no golpea `/api/auth/renovar` en
 * cada carga de página, sólo cerca del final— y deja tiempo de sobra frente a
 * un reloj de navegador desincronizado del servidor (ver `relojes` en
 * `/api/health`, Plan 21 F6): un desfase de minutos no hace que se pierda la
 * ventana.
 */

const CLAVE = "eva:sesion";

/**
 * Umbral de renovación, en minutos. Se renueva cuando quedan MENOS de esto
 * para caducar — no es una cuenta atrás exacta, es margen de sobra.
 */
export const UMBRAL_RENOVACION_MIN = 30;

/**
 * Lee la sesión guardada.
 *
 * @returns {{ token: string, expiraEn: number, usuario: object } | null}
 *          `expiraEn` es un timestamp absoluto (`Date.now()` + minutos), NO
 *          los minutos que devuelve el servidor: hay que fijar el instante en
 *          el momento de guardar, no recalcularlo cada vez que se lee.
 */
export function leerSesion() {
  try {
    const crudo = globalThis.localStorage?.getItem(CLAVE);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    if (typeof datos?.token !== "string" || typeof datos?.expiraEn !== "number") return null;
    return datos;
  } catch {
    return null;
  }
}

/**
 * Guarda una sesión a partir de lo que devuelve `/api/auth/login` o
 * `/api/auth/renovar`.
 *
 * @param {{ token: string, expiraEnMinutos: number, usuario: object }} respuesta
 */
export function guardarSesion({ token, expiraEnMinutos, usuario }) {
  try {
    globalThis.localStorage?.setItem(
      CLAVE,
      JSON.stringify({
        token,
        expiraEn: Date.now() + expiraEnMinutos * 60_000,
        usuario,
      })
    );
  } catch {
    // Un kiosco con el almacenamiento bloqueado sigue funcionando: la sesión
    // vive sólo en memoria para esta carga de página, y se pedirá acceso de
    // nuevo al recargar. No es ideal, pero no tira la pantalla.
  }
}

/** Borra la sesión guardada. Se llama al detectar un token inválido —no caducado— o tras un logout. */
export function borrarSesion() {
  try {
    globalThis.localStorage?.removeItem(CLAVE);
  } catch {
    /* Nada que limpiar si no se pudo ni guardar. */
  }
}

/**
 * Los encabezados para una petición autenticada.
 *
 * `{}` sin sesión — la petición sale igual, sin `Authorization`, y el
 * servidor decide qué hacer (con `AUTH_HABILITADA=false`, nada; con ella
 * encendida, un 401). No lanza ni bloquea: cada cliente decide cómo reacciona
 * a esa respuesta, esto sólo aporta el encabezado si lo hay.
 */
export function authHeaders() {
  const sesion = leerSesion();
  return sesion ? { Authorization: `Bearer ${sesion.token}` } : {};
}

/**
 * ¿Falta menos de `UMBRAL_RENOVACION_MIN` para que caduque?
 *
 * `false` sin sesión: no hay nada que renovar. Es una pregunta deliberadamente
 * simple —no intenta adivinar el desfase de reloj del Plan 21 F6, sólo
 * compara contra el reloj del propio navegador, que es el mismo que puso
 * `expiraEn` al guardar la sesión, así que no hay comparación entre dos
 * relojes distintos aquí.
 */
export function sesionPorCaducar() {
  const sesion = leerSesion();
  if (!sesion) return false;
  return sesion.expiraEn - Date.now() < UMBRAL_RENOVACION_MIN * 60_000;
}

/** ¿La sesión guardada ya caducó del todo? */
export function sesionCaducada() {
  const sesion = leerSesion();
  if (!sesion) return false;
  return sesion.expiraEn <= Date.now();
}
