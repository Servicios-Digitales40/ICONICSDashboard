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

/** Un fallo del puente que conserva el código para poder traducirlo. */
export class ErrorDelPuente extends Error {
  /**
   * @param {object} opciones
   * @param {string} [opciones.codigo]   uno de `backend/http/codigos.mjs`
   * @param {string} [opciones.mensaje]  el texto que redactó el servidor
   * @param {number} [opciones.estado]   el código HTTP, para depurar
   */
  constructor({ codigo = null, mensaje = "", estado = null } = {}) {
    /*
     * `message` se queda con el texto del servidor —no con el código— para que
     * un `console.error` o una traza sigan siendo legibles sin traducir nada.
     */
    super(mensaje || codigo || "Error");
    this.name = "ErrorDelPuente";
    this.codigo = codigo;
    this.mensajeDelServidor = mensaje || null;
    this.estado = estado;
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
  const delServidor = typeof cuerpo?.error === "string" ? cuerpo.error : "";

  return new ErrorDelPuente({
    codigo: typeof cuerpo?.codigo === "string" ? cuerpo.codigo : null,
    mensaje: delServidor || porDefecto || (estado ? `HTTP ${estado}` : ""),
    estado,
  });
}
