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
 * (el adaptador de ICONICS) y nunca en las vistas.
 */

/** OPC-DA "good" (expresiones del servidor y transporte falso). */
export const QUALITY_GOOD = 192;

/** OPC-UA StatusCode Good: lo que devuelve la REST API de FrameWorX. */
export const QUALITY_GOOD_UA = 0;

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
