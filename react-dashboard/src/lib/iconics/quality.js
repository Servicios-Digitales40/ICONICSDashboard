/**
 * lib/iconics/quality.js
 * ------------------------------------------------------------------
 * Código de calidad que acompaña a cada valor leído de ICONICS.
 *
 * ⚠ HAY DOS CONVENCIONES DE CALIDAD Y NO SON LA MISMA ────────────────
 *
 *   · OPC-DA:  192 (0xC0) = "good". Es la que usan las EXPRESIONES del
 *     propio servidor para detectar fallo de comunicación, del tipo
 *         x = quality({{mel:R04_1:PLC_01_PL/Tiempo_Ciclo}}) != 192
 *     y la que emite el transporte falso (fakeTransport) para desarrollo.
 *
 *   · OPC-UA:  0 = "good" (StatusCode Good). Es la que devuelve DE VERDAD
 *     la REST API de ICONICS FrameWorX, verificado contra el servidor:
 *     p. ej. `ac:RESONAC/LIN/1/OEE` → { quality: 0, value: 37.95 }. Las
 *     calidades malas llegan con el bit alto puesto (≥ 0x80000000) y su
 *     valor como null.
 *
 * Aceptar SOLO 192 descartaba todos los valores buenos reales (calidad 0)
 * y dejaba las vistas en "Sin dato" aunque el servidor sí estuviera
 * entregando lecturas. Por eso se aceptan AMBOS "good".
 *
 * POR QUÉ IMPORTA: un valor con mala calidad suele llegar como 0 en su
 * VALOR (no en la calidad). Si ese 0 entra en los agregados,
 * `buildPlantSummary` lo promedia como si fuese una medición real y hunde
 * el OEE de TODA la planta. Un hueco visible es preferible a un número
 * plausible y falso. Regla: la calidad se filtra en la frontera (el
 * adaptador de ICONICS), nunca en las vistas.
 */

/** OPC-DA "good" (expresiones del servidor y transporte falso). */
export const QUALITY_GOOD = 192;

/** OPC-UA StatusCode Good — lo que devuelve la REST API real de FrameWorX. */
export const QUALITY_GOOD_UA = 0;

/**
 * ICONICS puede omitir la calidad en respuestas sintéticas. Se trata la
 * ausencia como buena a propósito: si el servidor no se pronuncia, el
 * dato se acepta y ya lo filtrará el saneamiento numérico de dominio.
 * Se acepta el "good" de ambas convenciones (0 de OPC-UA y 192 de OPC-DA);
 * cualquier otra calidad presente (uncertain, bad) se rechaza.
 */
export function isGoodQuality(quality) {
  return (
    quality === undefined ||
    quality === null ||
    quality === QUALITY_GOOD_UA ||
    quality === QUALITY_GOOD
  );
}
