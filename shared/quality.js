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
 * Códigos de motivo por los que una lectura no trae dato.
 *
 * Son estables y en minúsculas porque viajan: al frontend para decidir qué
 * pintar, al asistente dentro del resultado de una herramienta, y a un futuro
 * registro. El TEXTO puede reescribirse; el código, no.
 */
export const MOTIVO = Object.freeze({
  MALA: "mala",
  INCIERTA: "incierta",
  SIN_ENTREGA: "sin_entrega",
  DESCONOCIDA: "desconocida",
});

/**
 * Por qué esta calidad no vale, o `null` si vale.
 *
 * ── POR QUÉ HACE FALTA ALGO MÁS QUE `isGoodQuality` ────────────────
 *
 * Porque un booleano convierte cuatro situaciones distintas en la misma: «no
 * hay dato». Y no son la misma cosa para quien tiene que arreglarlas.
 *
 *   · un sensor DESCONECTADO (mala)                    → se revisa el cableado
 *   · un módulo que DESCONFÍA de su medida (incierta)  → se revisa la medida
 *   · un punto que EXISTE y dejó de entregar           → se revisa la máquina
 *   · una calidad que no sabemos leer                  → se investiga el código
 *
 * La cuarta es la que más importa que exista: `DESCONOCIDA` declara que no
 * sabemos, en vez de meterla en «mala» y afirmar algo que no se ha medido
 * (§2.5). Lleva el código crudo en el texto para que se pueda buscar.
 *
 * ── EL TERCERO ESTÁ MEDIDO, NO SUPUESTO ────────────────────────────
 *
 * `0x08000000` es el que devolvieron quince de veintiún puntos del sistema de
 * vibraciones el 26-08-2026 a las 13:10:31, cuando se paró el variador — con
 * la marca de tiempo congelada y SIN campo `value`. Ver `QUALITY_SIN_DATO`.
 *
 * @param {number|null|undefined} quality
 * @returns {{codigo: string, texto: string}|null}
 */
export function motivoDeCalidad(quality) {
  if (isGoodQuality(quality)) return null;

  if (quality === QUALITY_SIN_DATO) {
    return {
      codigo: MOTIVO.SIN_ENTREGA,
      texto: "El punto existe y ha dejado de entregar valor.",
    };
  }

  if (quality === QUALITY_UNCERTAIN) {
    return {
      codigo: MOTIVO.INCIERTA,
      texto: "El módulo entrega el valor como incierto: no se puede dar por bueno.",
    };
  }

  /*
   * OPC-UA pone el bit alto en cualquier estado «bad», así que es un rango y
   * no una igualdad: comparar sólo contra `QUALITY_BAD_UA` dejaría fuera todos
   * los subestados de fallo salvo el genérico.
   */
  if (typeof quality === "number" && quality >= QUALITY_BAD_UA) {
    return {
      codigo: MOTIVO.MALA,
      texto: "El servidor marca la lectura como mala: suele ser fallo de comunicación o de sensor.",
    };
  }

  return {
    codigo: MOTIVO.DESCONOCIDA,
    texto: `Calidad no reconocida (${quality}). No se da por buena mientras no se sepa qué significa.`,
  };
}

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
