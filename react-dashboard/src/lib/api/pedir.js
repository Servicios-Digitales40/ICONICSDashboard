/**
 * La única puerta por la que esta aplicación sale a la API.
 *
 * ── POR QUÉ TIENE QUE HABER UNA SOLA (PLAN 20 FASE 4) ──────────────
 *
 * Porque desde la Fase 1 toda ruta de `/api/` exige sesión, y eso son dos
 * obligaciones nuevas en CADA petición: mandar la cookie, e interpretar un 401
 * como «vuelve al login» en vez de como un error cualquiera.
 *
 * Había diecisiete `fetch` repartidos en cinco archivos. Resolverlo en cada
 * sitio eran diecisiete oportunidades de olvidarlo, y el olvido no da un fallo
 * ruidoso: da una pantalla que no carga y un mensaje de error genérico donde
 * debería haber un formulario de login. Es el mismo problema que en el backend
 * resolvió `test/ayudas.mjs` de una vez para las once pruebas de rutas.
 *
 * ── `credentials: "include"` Y NO EL DEFECTO ───────────────────────
 *
 * En planta el backend sirve el propio bundle, así que la API es del mismo
 * origen y el defecto (`same-origin`) ya mandaría la cookie. Pero con
 * `VITE_API_BASE` apuntando a otro servidor la petición pasa a ser cruzada, y
 * ahí el defecto la omite: el login funcionaría y la siguiente pantalla daría
 * 401, que es de los síntomas más desconcertantes que existen. El backend ya
 * declara `credentials: true` en su CORS (`http/plugins/seguridad.mjs`), así
 * que las dos mitades del acuerdo están puestas.
 *
 * ── EL 401 SE DISTINGUE, NO SE UNIFORMA ────────────────────────────
 *
 * Sólo un 401 con `motivo: "sesion"` significa «no has entrado o caducaste».
 * Cualquier otro 401 —el que ICONICS devuelve cuando el usuario no tiene
 * permiso sobre un punto, por ejemplo— es un problema de permisos que hay que
 * contarle a la persona SIN expulsarla de la aplicación. Uniformarlos haría
 * que pedir un dato prohibido cerrara la sesión, que es absurdo y además
 * borraría la conversación en curso.
 */
import { API_BASE } from "./apiBase.js";

/**
 * Error de sesión: no hay, o caducó.
 *
 * Es una clase y no una bandera en el mensaje porque quien lo captura tiene
 * que poder distinguirlo sin leer texto: un `catch` que decide por
 * `error.message.includes("sesión")` se rompe al traducir o al reescribir la
 * frase, y falla en la dirección peligrosa —dejando al usuario dentro de una
 * aplicación que ya no puede leer nada—.
 */
export class ErrorDeSesion extends Error {
  constructor(mensaje = "Tu sesión ha caducado.") {
    super(mensaje);
    this.name = "ErrorDeSesion";
  }
}

/** Quién quiere enterarse de que la sesión se cayó. */
const escuchas = new Set();

/**
 * Avisa cuando una petición descubre que ya no hay sesión.
 *
 * ── POR QUÉ SUSCRIPCIÓN Y NO UN `throw` QUE SUBA SOLO ──────────────
 *
 * Porque quien descubre la caducidad casi nunca es quien puede reaccionar. La
 * descubre un cajón lateral pidiendo su lista, o el sondeo del explorador de
 * assets; quien tiene que reaccionar es el proveedor de sesión, arriba del
 * todo. Hacer que cada componente propagara el error hasta allí obligaría a
 * que todos supieran de sesiones.
 *
 * @returns {() => void} para darse de baja. Devolverlo, y no un `off()`
 *   aparte, es lo que permite que un `useEffect` lo retorne tal cual.
 */
export function alCaducarSesion(escucha) {
  escuchas.add(escucha);
  return () => escuchas.delete(escucha);
}

function avisarDeCaducidad() {
  for (const escucha of escuchas) escucha();
}

/**
 * Una petición a la API, con la sesión puesta.
 *
 * Devuelve la `Response` en crudo: hay llamadas que no quieren JSON —el flujo
 * SSE del chat, la descarga de un PDF— y forzarlas a pasar por un parseador
 * las obligaría a salirse de esta puerta, que es justo lo que no se quiere.
 *
 * @param {string} ruta Empieza por `/api/`. No una URL completa: la base la
 *   pone este módulo, y así ningún sitio puede escribir un host a mano.
 */
export async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(`${API_BASE}${ruta}`, {
    ...opciones,
    credentials: "include",
  });

  if (respuesta.status === 401) {
    /*
     * Se clona antes de leer: el cuerpo de una `Response` se consume una sola
     * vez, y quien llamó puede querer leerlo también. Sin el clon, un 401 de
     * permisos llegaría al llamante con el cuerpo ya gastado.
     */
    const cuerpo = await respuesta.clone().json().catch(() => null);

    if (cuerpo?.motivo === "sesion") {
      avisarDeCaducidad();
      throw new ErrorDeSesion(cuerpo.error);
    }
  }

  return respuesta;
}

/**
 * Como `pedir`, y además parsea y traduce el error.
 *
 * Sustituye a los dos `parseResponse` que estaban copiados en `casosApi.js` y
 * `ragApi.js`. Eran idénticos, y una copia de la capa que interpreta errores
 * de red es una copia que diverge en cuanto alguien mejora un mensaje en uno
 * de los dos.
 */
export async function pedirJson(ruta, opciones = {}) {
  const respuesta = await pedir(ruta, opciones);
  const crudo = await respuesta.text();

  let datos = null;
  if (crudo) {
    try {
      datos = JSON.parse(crudo);
    } catch {
      throw new Error(`El servidor respondió ${respuesta.status}, pero no devolvió JSON válido.`);
    }
  }

  if (!respuesta.ok) {
    throw new Error(datos?.error || `HTTP ${respuesta.status}`);
  }

  return datos;
}
