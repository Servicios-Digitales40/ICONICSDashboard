/**
 * Grados de caos del simulador.
 *
 * Viven aquí y no dentro del simulador de Demo EVA porque son un ajuste del
 * ENTORNO, no de una instalación: describen cuánto se degrada la lectura, y
 * cualquier transporte falso que se añada debe degradar igual. Antes vivían en
 * `fakeTransport.js`, el simulador de Resonac, y desaparecieron con él.
 *
 * ── POR QUÉ EL CAOS VIENE ENCENDIDO ────────────────────────────────
 *
 * En grado suave, y a propósito: sin él la UI se escribiría dando por hecho
 * que todos los tags existen siempre y que la calidad siempre es buena, y
 * ambas suposiciones fallan con el servidor real.
 *
 * Pero el caos es aleatorio, y eso choca con el otro uso del simulador:
 * enseñar la aplicación. Con `none` no hay huecos ni mala calidad, así que la
 * pantalla es predecible, que es lo que hace falta con público delante. `high`
 * es para revisar a conciencia el comportamiento degradado.
 */

/** Grado suave: el defecto. Lo justo para que los huecos existan. */
export const CAOS_SUAVE = {
  malaCalidad: 0.02,
  ausente: 0.01,
  noFinito: 0.01,
  errorPeticion: 0,
  latenciaMs: 60,
};

/** Grado alto: para revisar a conciencia el comportamiento degradado. */
export const CAOS_ALTO = {
  malaCalidad: 0.25,
  ausente: 0.15,
  noFinito: 0.08,
  errorPeticion: 0.2,
  latenciaMs: 400,
};

/** Sin caos: para una demostración con público. */
export const SIN_CAOS = {
  malaCalidad: 0,
  ausente: 0,
  noFinito: 0,
  errorPeticion: 0,
  latenciaMs: 0,
};

/**
 * El grado que pide el build. Un valor desconocido cae en `soft`, que es el
 * que no miente sobre la fiabilidad del servidor.
 */
const PRESETS = { none: SIN_CAOS, soft: CAOS_SUAVE, high: CAOS_ALTO };

export function presetCaos() {
  return PRESETS[import.meta.env?.VITE_ICONICS_CHAOS] ?? CAOS_SUAVE;
}
