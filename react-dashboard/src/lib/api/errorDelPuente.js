/**
 * El error que devuelve el puente, con su código y su mensaje.
 *
 * ── POR QUÉ UN `Error` PROPIO Y NO UNO NORMAL ──────────────────────
 *
 * Porque un `new Error(cuerpo.error)` pierde el código en el mismo instante en
 * que se construye, y el código es lo único que permite traducir.
 *
 * Los cuatro clientes HTTP de este tablero hacían exactamente eso —
 * `throw new Error(data?.error ?? ...)`— así que el texto en español del
 * servidor llegaba hasta el `<AlertBanner>` y se pintaba tal cual. En un
 * tablero en inglés eran treinta frases en español, y no había forma de
 * arreglarlo desde aquí: llegaban redactadas.
 *
 * ── EL MENSAJE SIGUE VIAJANDO, Y HACE FALTA ────────────────────────
 *
 * `mensajeDelServidor` no es redundante con el código. El código dice QUÉ
 * clase de fallo fue —«el archivo supera el límite»— y el mensaje trae el
 * DETALLE que sólo el servidor conoce: cuántos MB son, qué variable falta, qué
 * tag rechazó la guarda. La pantalla enseña la frase traducida arriba y el
 * detalle debajo, en gris; ver `useMensajeDeError`.
 *
 * ── Y CUANDO NO HAY CÓDIGO ─────────────────────────────────────────
 *
 * Se cae en el mensaje del servidor, que es lo que se pintaba antes. Eso
 * importa: el contrato se añadió de una vez, pero un backend más viejo —o uno
 * que se despliegue a medias— sigue funcionando, en español, en vez de
 * quedarse mudo. La degradación es a lo de siempre, no a nada.
 */

import { avisarSesionInvalida } from "./sesionInvalida.js";

/** Un fallo del puente que conserva el código para poder traducirlo. */
export class ErrorDelPuente extends Error {
  /**
   * @param {object} opciones
   * @param {string} [opciones.codigo]   uno de `backend/http/codigos.mjs`
   * @param {string} [opciones.mensaje]  el texto que redactó el servidor
   * @param {number} [opciones.estado]   el código HTTP, para depurar
   * @param {object} [opciones.detalle]  lo que el cuerpo traiga además del
   *   mensaje. Hoy sólo `problemas` de `/api/maquinas` (Plan 33 F5)
   */
  constructor({ codigo = null, mensaje = "", estado = null, detalle = null } = {}) {
    /*
     * `message` se queda con el texto del servidor —no con el código— para que
     * un `console.error` o una traza sigan siendo legibles sin traducir nada.
     */
    super(mensaje || codigo || "Error");
    this.name = "ErrorDelPuente";
    this.codigo = codigo;
    this.mensajeDelServidor = mensaje || null;
    this.estado = estado;
    /*
     * ── POR QUÉ UN ERROR PUEDE LLEVAR MÁS QUE UNA FRASE ────────────
     *
     * Porque algunos fallos no se explican en una línea. `POST /api/maquinas`
     * rechaza una configuración incompleta con una LISTA de `{campo,
     * problema}`, y esa lista es lo que permite a la pantalla señalar el paso
     * que está mal en vez de un aviso genérico encima del formulario.
     *
     * Sin este campo la lista se perdía al construir el error, y la vista
     * habría tenido que reimplementar la validación para saber dónde apuntar —
     * que es cómo nacen las dos copias de una misma regla (`shared/README.md`).
     *
     * Es `null` para los demás clientes, que no mandan nada aparte. Se guarda
     * el cuerpo entero y no sólo `problemas` para no tener que volver aquí la
     * próxima vez que un error necesite acompañamiento.
     */
    this.detalle = detalle;
  }
}

/**
 * Construye el error a partir del cuerpo `{ ok:false, error, codigo }`.
 *
 * Se usa en los cuatro clientes para que la forma sea una sola.
 *
 * ── POR QUÉ HACE FALTA `porDefecto` ────────────────────────────────
 *
 * Porque una respuesta puede no traer cuerpo —un 502 de un proxy, un 500 sin
 * JSON— y ahí lo único que se sabe es el estado y a qué se estaba llamando. El
 * primer intento de este archivo se quedaba con un «Error» pelado y perdía las
 * dos cosas; lo cazó `apiClient.test.js`, que fija justo eso desde antes de
 * que existieran los códigos. El mensaje de reserva lo pone quien llama porque
 * es quien conoce la ruta.
 */
export function errorDeRespuesta(cuerpo, estado, porDefecto = "") {
  /*
   * Plan 25 F9: un 401 de CUALQUIER cliente avisa a `SesionProvider`, que
   * decide qué hacer con `caducado` (intentar renovar, o pedir acceso). Aquí y
   * no en cada cliente por separado — los seis lo llaman ya para construir su
   * error, así que un solo cambio los cubre a todos sin tocarlos uno a uno.
   *
   * `cuerpo?.caducado` puede faltar (una ruta que no pasa por `autenticar`, un
   * 401 de otra clase) y entonces se trata como «no caducado, simplemente
   * inválido» — el lado que fuerza pedir acceso de nuevo en vez de reintentar
   * una renovación que quizá no tenga sentido.
   */
  if (estado === 401) avisarSesionInvalida(cuerpo?.caducado === true);

  const delServidor = typeof cuerpo?.error === "string" ? cuerpo.error : "";

  return new ErrorDelPuente({
    codigo: typeof cuerpo?.codigo === "string" ? cuerpo.codigo : null,
    mensaje: delServidor || porDefecto || (estado ? `HTTP ${estado}` : ""),
    estado,
    /* El cuerpo entero, para lo que un error traiga además del mensaje. Ver
       `detalle` en el constructor. */
    detalle: cuerpo && typeof cuerpo === "object" ? cuerpo : null,
  });
}
