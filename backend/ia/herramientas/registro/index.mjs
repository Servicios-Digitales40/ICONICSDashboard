/**
 * backend/ia/herramientas/registro/index.mjs
 * ------------------------------------------------------------------
 * Una sola herramienta: qué máquinas hay en esta planta.
 *
 * ── POR QUÉ MERECE SU PROPIA FAMILIA SIENDO UNA ────────────────────
 *
 * Porque no es una herramienta sobre una máquina: es la que las ENUMERA, y el
 * asistente no puede saber de antemano cuántas hay. Hoy dos, mañana las que se
 * den de alta en `shared/eva/sistemas.js`.
 *
 * Existe sobre todo por el error que evita. Sin ella, preguntado por algo de un
 * sistema que no conoce, el modelo llamaría a la herramienta del otro y
 * contestaría con datos de la máquina equivocada, en una frase perfectamente
 * redactada. Por eso va la PRIMERA del catálogo: es lo que tiene que encontrar
 * cuando no sabe de qué le hablan.
 *
 * No recibe nada. Lee el registro y ya está — igual que `aprendizaje/`, su
 * firma vacía es el dato de que no depende de ICONICS.
 */
import { NO_COMPARTEN, SISTEMAS, resumenDeSistemas } from '../../../../shared/eva/sistemas.js'

/** La herramienta que enumera las máquinas de la planta. */
export function crearHerramientasDeRegistro() {
  return {
    /**
     * ── QUÉ SISTEMAS HAY EN ESTA PLANTA ───────────────────────────────
     *
     * El asistente no puede saber de antemano cuántos hay: hoy dos, mañana
     * los que se den de alta en `shared/eva/sistemas.js`. Esta herramienta es
     * como los descubre, con lo que cada uno mide, qué herramientas lo cubren
     * y —lo que importa— qué NO se puede afirmar de él.
     *
     * Existe sobre todo por el error que evita: sin ella, preguntado por algo
     * de un sistema que no conoce, el modelo llamaría a la herramienta del
     * otro y contestaría con datos de la máquina equivocada, en una frase
     * perfectamente redactada.
     */
    async sistemas_de_la_planta() {
      return {
        ok: true,
        cuantos: SISTEMAS.length,
        sistemas: resumenDeSistemas(),
        aviso: NO_COMPARTEN,
      }
    },
  }
}
