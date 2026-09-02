/**
 * Saneamiento de las lecturas crudas de ICONICS, en la frontera.
 *
 * Todo campo numérico del dominio es `number | null`, donde `null` significa
 * «no hay medición» y las vistas pintan un hueco, nunca un cero. Se pierde un
 * dato de dos maneras, y ambas acaban en `null`:
 *
 *  - Mala calidad, que ya filtró el adaptador de ICONICS (ver `quality.js`).
 *  - Aritmética inválida (`NaN` o `Infinity`), que el servidor emite cuando
 *    una división suya desborda. Un solo NaN contaminaría el resumen entero
 *    del sistema, así que se corta aquí y no en las vistas.
 *
 * Lo consumen los dos lados: `shared/eva/tanque/sistema.js` al construir el modelo, y
 * el frontend antes de formatear. Vive suelto en `shared/` —y no dentro de
 * `eva/`— porque no sabe nada de la instalación: son reglas sobre valores.
 */

/**
 * Convierte a número utilizable o a `null`.
 * `Number.isFinite` descarta de una vez NaN, Infinity, null, undefined,
 * cadenas vacías y objetos.
 */
export function toNumber(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Texto no vacío o `null`. */
export function toText(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

/** ¿Hay medición? Se usa en las vistas antes de formatear. */
export const hasValue = (v) => v !== null && v !== undefined;
