/**
 * Derivaciones de una serie para las tarjetas: hoy, sólo `delta`.
 *
 * Hasta el Plan 42.5 F4 aquí vivía también `buildModeloEva` —atención,
 * destacadas y márgenes del TANQUE, calculados sobre su `Sistema`— que
 * alimentaba los tiles de `PlantaTanque`. Se retiró con esa vista: la Planta
 * genérica (`views/maquina/PlantaMaquina.jsx`) pide lo equivalente al tipo
 * (`tipo.evaluarRiesgos`, `tipo.bandaDe`) y al registro (`clavesConTendencia`),
 * y el tanque lo tendrá por esa vía al entrar por configuración (Plan 43).
 * Lo que queda es lo único que no sabe de ninguna máquina.
 */

/** Diferencia entre las dos últimas muestras de una serie, o `null` si no hay dos. */
export const delta = (serie) => (serie?.length >= 2 ? serie.at(-1) - serie.at(-2) : null);
