/**
 * Las dos familias tipográficas de la aplicación.
 *
 * ── POR QUÉ VIVEN AQUÍ Y NO EN UN COMPONENTE ───────────────────────
 *
 * Porque estaban en DOS sitios a la vez. `Demo-EVA/components/base.jsx` las
 * exportaba para las vistas de planta, y `features/asistente/components/
 * Asistente.jsx` volvía a declararlas idénticas por su cuenta. Mientras el
 * tablero existió eso fue una duplicación tolerada; al quedarse el asistente
 * solo (Plan 20 Fase 3) habría sido la única definición viva copiada dos
 * veces, que es exactamente lo que CLAUDE.md §2.6 prohíbe.
 *
 * Van en `theme/` y no en `components/` porque son una decisión de TEMA, no
 * una pieza de interfaz: no dependen de qué se esté pintando, y cambiarlas
 * cambia la aplicación entera.
 *
 * ── QUÉ NO SE MUDÓ, Y POR QUÉ ──────────────────────────────────────
 *
 * `ESCALA`, la tercera exportación de tokens de aquel archivo, no está aquí:
 * la usaban las tiles, las gráficas de detalle, la ficha 3D y el modo muro,
 * y ninguno sobrevive. Traerla habría sido mudar código muerto a un sitio más
 * visible.
 *
 * ── CUÁNDO SE USA CADA UNA ─────────────────────────────────────────
 *
 * `MONO` para lo que es una MEDIDA —un valor, una unidad, una marca de
 * tiempo, el nombre de un punto de ICONICS—: alinea en columna y no baila
 * cuando el dato cambia de un dígito a tres, que es lo que pasa cuatro veces
 * por minuto en una pantalla en vivo. `SANS` para lo que es prosa.
 */
export const MONO = "'IBM Plex Mono', monospace";
export const SANS = "'Plus Jakarta Sans', sans-serif";
