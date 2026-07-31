/**
 * theme/index.js — API pública del sistema de tema.
 *
 * Re-exports NOMBRADOS y explícitos, no `export *`: así queda documentado
 * qué es API pública del módulo y se hace imposible el fallo de "ambiguous
 * star export" (dos `export *` con el mismo nombre lo excluyen en silencio,
 * dejándolo `undefined` en el consumidor y sin error de build).
 *
 * `useTheme()` se llama desde ~57 archivos: este barrel es el especificador
 * corto y estable que todos comparten (`@/theme`).
 *
 * `chartPalette` NO se exporta aquí a propósito: está deprecado y sin
 * consumidores vivos. Sigue accesible en `@/theme/themes.js` para el código
 * archivado, pero no forma parte de la API pública.
 */
export { ThemeProvider, useTheme } from "./ThemeProvider.jsx";
export { THEMES } from "./themes.js";
