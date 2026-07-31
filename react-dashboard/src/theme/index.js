/**
 * API pública del sistema de tema.
 *
 * Los re-exports son nombrados y explícitos en vez de `export *`, que deja
 * documentado qué es API pública y evita el fallo del star export ambiguo: dos
 * `export *` con el mismo nombre lo excluyen en silencio, y el consumidor
 * recibe `undefined` sin error de build.
 *
 * `useTheme()` se llama desde casi todas partes, y este barrel es el
 * especificador corto y estable que todos comparten (`@/theme`).
 *
 * `chartPalette` no se exporta aquí: está deprecado y sin consumidores vivos.
 * Sigue accesible en `@/theme/themes.js` para el código archivado.
 */
export { ThemeProvider, useTheme } from "./ThemeProvider.jsx";
export { THEMES } from "./themes.js";
