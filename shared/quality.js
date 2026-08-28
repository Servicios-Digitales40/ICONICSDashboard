/**
 * Código de calidad que acompaña a cada valor leído de ICONICS.
 *
 * Conviven dos convenciones distintas y hay que aceptar las dos:
 *
 *  - OPC-DA: 192 (0xC0) = good. La usan las expresiones del propio servidor
 *    para detectar fallo de comunicación, y también el transporte falso.
 *  - OPC-UA: 0 = good (StatusCode Good). Es la que devuelve la REST API de
 *    FrameWorX. Las calidades malas llegan con el bit alto puesto
 *    (≥ 0x80000000) y su valor como null.
 *
 * Aceptar solo 192 descarta todos los valores buenos reales y deja las vistas
 * en «Sin dato» aunque el servidor esté entregando lecturas.
 *
 * Un valor de mala calidad suele llegar como 0 en el valor, no en la calidad.
 * Si ese 0 entra en los agregados se promedia como una medición real y hunde
 * el OEE de la planta entera, así que la calidad se filtra en la frontera
 * —el motor de sondeo en el frontend, la capa de herramientas en el backend—
 * y nunca en las vistas ni en la respuesta del asistente.
 */

/** OPC-DA "good" (expresiones del servidor y transporte falso). */
export const QUALITY_GOOD = 192;

/** OPC-UA StatusCode Good: lo que devuelve la REST API de FrameWorX. */
export const QUALITY_GOOD_UA = 0;

/** OPC-UA malo: bit alto puesto. Lo que sirve el servidor con un fallo duro. */
export const QUALITY_BAD_UA = 0x80000000;

/**
 * "Uncertain": lo que más se parece a un dato bueno sin serlo. Los simuladores
 * la usan para el caos de calidad, acompañada de un cero — que es como llega
 * de ICONICS y por lo que la calidad se filtra en la frontera.
 */
export const QUALITY_UNCERTAIN = 64;

/**
 * Calidad de un punto que **existe y ha dejado de entregar**: `0x08000000`, y
 * el servidor la manda **sin campo `value`**.
 *
 * Está MEDIDA, no supuesta: es la que devolvieron quince de veintiún puntos del
 * sistema de vibraciones el 26-08-2026 a las 13:10:31, cuando se paró el
 * variador. Vive aquí —y no en cada simulador— porque es un hecho del servidor,
 * no de una instalación, y porque estuvo repetida a mano en tres archivos.
 *
 * La forma importa tanto como el número. `isGoodQuality` la rechaza, así que un
 * lector correcto la convierte en «sin dato»; lo que esta constante protege es
 * que nadie la sirva como un cero con calidad mala, porque entonces un `?? 0`
 * río abajo convertiría «no contesta» en «vibración nula, todo perfecto».
 */
export const QUALITY_SIN_DATO = 0x08000000;

/**
 * Acepta el good de ambas convenciones; cualquier otra calidad presente
 * (uncertain, bad) se rechaza.
 *
 * ICONICS puede omitir la calidad en respuestas sintéticas. La ausencia se
 * trata como buena a propósito: si el servidor no se pronuncia, el dato se
 * acepta y ya lo filtrará el saneamiento numérico de dominio.
 */
export function isGoodQuality(quality) {
  return (
    quality === undefined ||
    quality === null ||
    quality === QUALITY_GOOD_UA ||
    quality === QUALITY_GOOD
  );
}
