/**
 * Vida mecánica del rodamiento: frecuencias de defecto, vida L10 por fatiga y
 * el intervalo de reengrase. Fórmulas puras, sin red ni estado. Fase 1 del
 * análisis de vibraciones (09-09-2026).
 *
 * ── QUÉ RESUELVE, Y EN QUÉ SE DIFERENCIA DE LO QUE YA HAY ──────────
 *
 * `shared/eva/comun/pronostico.js` mira la HISTORIA de operación: cuántas horas
 * la máquina estuvo en un estado que la desgasta. Esto mira la FÍSICA del
 * rodamiento: dada su geometría, su capacidad de carga y las vueltas que lleva
 * dadas, cuánta vida de fatiga le queda y cuándo toca engrasarlo. Son dos
 * caras del mantenimiento predictivo y no se pisan.
 *
 * ── LAS TRES REGLAS DE HONESTIDAD (mismas que pronostico.js) ───────
 *
 * 1. NADA SE CALCULA CON UN DATO INVENTADO. La vida L10 necesita la carga real
 *    P sobre el rodamiento, que casi nunca se mide en una planta pequeña. Si no
 *    llega, la función devuelve `{ evaluable:false, motivo }` — NO rellena P con
 *    un número plausible para poder dar una cifra. Un pronóstico con una carga
 *    inventada es peor que no dar pronóstico: parece medido y no lo es.
 * 2. LO QUE SÍ SE CALCULA VA MARCADO `provisional: true` mientras dependa de un
 *    valor de catálogo (la capacidad C) o de un factor típico (reengrase) que
 *    nadie ha confirmado contra la marca real del rodamiento montado.
 * 3. NINGUNA FUNCIÓN LANZA. Ante una entrada mala (rpm cero, carga negativa)
 *    devuelve el hueco con su motivo, porque quien la llama suele estar
 *    encadenando cálculos y un `throw` a media cadena esconde de cuál salió.
 *
 * ── EL CATÁLOGO NO INCLUYE EL RODAMIENTO DE LAS CHUMACERAS ─────────
 *
 * Sólo están los rodamientos del MOTOR (del catálogo WEG del W22): 6204 y 6205.
 * Los apoyos S2/S3 del banco son CHUMACERAS —rodamientos de inserto de la
 * bancada, no del motor— y su número hay que leerlo del inserto real. Poner
 * aquí un 6206 «por parecido» daría frecuencias de defecto de otra pieza; ver
 * la misma advertencia en `CANALES` de `vibraciones.js`. Cuando se confirme, se
 * añade aquí con su fuente.
 */

/**
 * Rodamientos con geometría y capacidad conocidas. `C` es la capacidad de carga
 * dinámica del catálogo (SKF), en newtons. `d` es el diámetro interior (calibre)
 * en mm, que usa el intervalo de reengrase.
 *
 * Son valores de CATÁLOGO estándar: sirven para calcular, pero hay que
 * confirmarlos contra la marca real del rodamiento montado (un 6205 NSK y uno
 * SKF no traen exactamente la misma C). Por eso todo lo que dependa de ellos
 * sale `provisional: true`.
 */
export const RODAMIENTOS = Object.freeze({
  "6204": { Z: 8, Bd: 7.938, Pd: 33.5, d: 20, C: 12700, fuente: "catálogo SKF 6204" },
  "6205": { Z: 9, Bd: 7.938, Pd: 39.04, d: 25, C: 14000, fuente: "catálogo SKF 6205" },
});

/** Exponente de la ley de vida: 3 para rodamientos de bolas. */
export const EXPONENTE_BOLAS = 3;

/**
 * Frecuencias de defecto como ÓRDENES (múltiplos de la frecuencia de giro del
 * eje). Para pasarlas a Hz: `orden × rpm / 60`. Ángulo de contacto α, en grados
 * (0 para un rodamiento radial de bolas).
 *
 * Devuelve `null` si la geometría no está completa: sin ella no hay nada que
 * calcular, y devolver ceros parecería un rodamiento perfecto.
 */
export function frecuenciasDefecto({ Z, Bd, Pd, alpha = 0 } = {}) {
  if (![Z, Bd, Pd].every((x) => Number.isFinite(x) && x > 0)) return null;
  const r = (Bd / Pd) * Math.cos((alpha * Math.PI) / 180);
  return {
    BPFO: (Z / 2) * (1 - r), // pista exterior
    BPFI: (Z / 2) * (1 + r), // pista interior
    BSF: (Pd / (2 * Bd)) * (1 - r * r), // elemento rodante
    FTF: 0.5 * (1 - r), // jaula
  };
}

/**
 * Vida L10 en HORAS: las horas de funcionamiento en las que el 90 % de una
 * población de estos rodamientos sigue sin fallar por fatiga.
 *
 *   L10h = (10^6 / (60·n)) · (C/P)^p
 *
 * `C` capacidad dinámica (N), `P` carga equivalente (N), `n` rpm. Devuelve el
 * número de horas, o `null` si algún dato falta o no es positivo — nunca lanza.
 */
export function vidaL10Horas({ C, P, rpm, p = EXPONENTE_BOLAS } = {}) {
  if (![C, P, rpm].every((x) => Number.isFinite(x) && x > 0)) return null;
  return (1e6 / (60 * rpm)) * Math.pow(C / P, p);
}

/**
 * Vida L10 consumida y restante, dadas las horas que el rodamiento lleva
 * girando. Es la forma pensada para el asistente: un resultado con su bandera
 * de honestidad y, cuando no se puede, el motivo exacto de qué falta.
 *
 * `provisional` es SIEMPRE true cuando sí evalúa: la vida depende de `C`
 * (catálogo, no la marca real) y de `P` (que en esta planta se estima, no se
 * mide). El asistente debe decirlo al narrarlo.
 */
export function evaluarVidaRodamiento({ C, P, rpm, horasAcumuladas = 0, p = EXPONENTE_BOLAS } = {}) {
  const faltan = [];
  if (!(Number.isFinite(C) && C > 0)) faltan.push("capacidad de carga C");
  if (!(Number.isFinite(P) && P > 0)) faltan.push("carga equivalente P");
  if (!(Number.isFinite(rpm) && rpm > 0)) faltan.push("velocidad de giro");
  if (faltan.length) {
    return {
      evaluable: false,
      motivo:
        `No se puede calcular la vida del rodamiento: falta ${faltan.join(", ")}. ` +
        "La carga P casi nunca se mide en planta; sin ella el cálculo sería una cifra inventada.",
    };
  }
  if (!(Number.isFinite(horasAcumuladas) && horasAcumuladas >= 0)) horasAcumuladas = 0;

  const horasL10 = vidaL10Horas({ C, P, rpm, p });
  const horasRestantes = Math.max(0, horasL10 - horasAcumuladas);
  return {
    evaluable: true,
    provisional: true, // depende de C (catálogo) y P (estimada): ver cabecera
    horasL10,
    horasAcumuladas,
    horasRestantes,
    fraccionConsumida: horasL10 > 0 ? Math.min(1, horasAcumuladas / horasL10) : 1,
  };
}

/**
 * Factor típico del intervalo de reengrase, condiciones normales (eje
 * horizontal, temperatura moderada, rodamiento de bolas). Es un valor de
 * referencia, no medido en esta máquina — por eso el resultado es provisional.
 */
export const FACTOR_REENGRASE = 1.0;

/**
 * Intervalo de reengrase en HORAS de marcha, fórmula clásica de SKF:
 *
 *   tf = K · [ 14·10^6 / (n·√d) − 4·d ]
 *
 * `d` calibre del rodamiento en mm, `n` rpm, `K` el factor de condiciones.
 * A más vueltas o más grande el rodamiento, menos horas entre engrases.
 *
 * Devuelve `null` si los datos no sirven, o si a esa velocidad el intervalo
 * sale ≤ 0 (rodamiento demasiado rápido/grande para engrase con grasa: pide
 * otra estrategia de lubricación, no un número negativo sin sentido).
 */
export function intervaloReengraseHoras({ d, rpm, factor = FACTOR_REENGRASE } = {}) {
  if (![d, rpm].every((x) => Number.isFinite(x) && x > 0)) return null;
  const tf = factor * (14e6 / (rpm * Math.sqrt(d)) - 4 * d);
  return tf > 0 ? tf : null;
}
