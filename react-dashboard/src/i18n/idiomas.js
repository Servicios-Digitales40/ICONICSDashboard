/**
 * Qué idiomas existen y dónde se guarda el elegido. El único módulo que sabe
 * ese par de cosas.
 *
 * ── POR QUÉ ESTO NO ESTÁ DENTRO DE `index.js` ──────────────────────
 *
 * Porque lo necesitan tres sitios que no deberían importar la configuración
 * entera de i18next para preguntar una constante: el selector de idioma (para
 * pintar las opciones), el formateo de fechas y números (para resolver el
 * `locale` de `Intl`) y el asistente (para decirle al modelo en qué idioma
 * contestar). Con la lista aquí, ninguno de los tres arrastra i18next.
 *
 * ── AÑADIR UN IDIOMA ───────────────────────────────────────────────
 *
 * Se añade una entrada a `IDIOMAS` y su carpeta en `locales/`. Nada más:
 * `index.js` recorre esta lista para armar los `resources`, el selector la
 * recorre para pintarse, y `verificar-i18n.mjs` la recorre para comprobar que
 * el árbol de claves del idioma nuevo está completo. Ningún componente
 * enumera idiomas por su cuenta.
 *
 * `nombre` va SIEMPRE en el propio idioma —«English», no «Inglés»—: quien
 * busca su idioma en un desplegable lo busca escrito como lo escribiría él, y
 * traducirlo obligaría a leer un idioma que quizá no entiende para poder
 * salir de él.
 */

/**
 * `intl` es el BCP-47 que reciben `Intl.DateTimeFormat` y `Intl.NumberFormat`.
 * No es lo mismo que la clave de i18next: `es` a secas deja el formato de
 * fecha y el separador decimal a criterio del navegador, y un tablero de
 * planta en México no debería enseñar la fecha en el formato de España sólo
 * porque el sistema operativo esté en otra región. Se declara la región.
 */
export const IDIOMAS = Object.freeze({
  es: Object.freeze({ codigo: "es", nombre: "Español", intl: "es-MX" }),
  en: Object.freeze({ codigo: "en", nombre: "English", intl: "en-US" }),
});

/** Las claves, para recorrer sin repetir `Object.keys` en cada sitio. */
export const CODIGOS = Object.freeze(Object.keys(IDIOMAS));

/**
 * El idioma de partida cuando no hay preferencia guardada ni el navegador
 * declara ninguno de los nuestros.
 *
 * Español, y no inglés, porque la planta está en México: el defecto tiene que
 * ser el que sirve al operador que abre el tablero sin tocar nada. Es también
 * el `fallbackLng`, así que una clave sin traducir en inglés sale en español
 * —legible— en vez de salir como la propia clave.
 */
export const IDIOMA_POR_DEFECTO = "es";

/**
 * La clave de `localStorage`. Una constante y no una cadena suelta porque la
 * usan el detector de i18next y las pruebas, y un literal repetido en dos
 * sitios es la forma habitual de que uno de los dos deje de leer lo que el
 * otro escribe.
 */
export const CLAVE_ALMACEN = "language";

/** ¿Es éste un idioma que sabemos servir? */
export const esIdiomaConocido = (codigo) => Object.hasOwn(IDIOMAS, codigo ?? "");

/**
 * El `locale` de `Intl` para un idioma de i18next.
 *
 * Tolera lo que i18next puede entregar —`es-MX`, `en-GB`, `undefined`— porque
 * el detector lee del navegador y ahí llega cualquier cosa. Se queda con la
 * parte antes del guion, que es lo que indexa `IDIOMAS`.
 */
export function localeDe(idioma) {
  const base = String(idioma ?? "").split("-")[0];
  return (IDIOMAS[base] ?? IDIOMAS[IDIOMA_POR_DEFECTO]).intl;
}
