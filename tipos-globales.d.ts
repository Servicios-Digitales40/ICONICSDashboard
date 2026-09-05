/**
 * Los dos globales que `shared/` sí puede usar, declarados a mano.
 *
 * ── POR QUÉ NO SE RESUELVE AÑADIENDO UNA `lib` ─────────────────────
 *
 * `jsconfig.json` declara `lib: ["ES2022"]` y nada más, a propósito: es la
 * misma frontera que `eslint.config.js` vigila del otro lado. Meter `"DOM"`
 * traería `window`, `document`, `localStorage` y `fetch` — justo los cuatro
 * que el linter prohíbe en esta carpeta— y meter `@types/node` traería
 * `process` y `Buffer`. Cualquiera de las dos convierte la comprobación de
 * tipos en el sitio donde la regla no negociable §2.7 deja de comprobarse.
 *
 * `atob` y `btoa` son la excepción y son sólo dos: existen como global TANTO
 * en el navegador COMO en Node desde la 16, así que usarlas no rompe la
 * promesa de `shared/` —seguir importándose desde los dos lados sin arrancar
 * nada—. `vibraciones.js` las necesita para el arreglo de vigilancia que el
 * módulo SM 1281 publica en base64.
 *
 * Si algún día hace falta un tercero, se añade aquí y se explica. Que cueste
 * una línea de este archivo es el punto.
 */
declare function atob(datosCodificados: string): string
declare function btoa(datosSinCodificar: string): string
