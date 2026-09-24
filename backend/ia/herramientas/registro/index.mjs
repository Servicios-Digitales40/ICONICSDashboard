/**
 * backend/ia/herramientas/registro/index.mjs
 * ------------------------------------------------------------------
 * Una sola herramienta: qué máquinas hay en esta planta.
 *
 * ── POR QUÉ MERECE SU PROPIA FAMILIA SIENDO UNA ────────────────────
 *
 * Porque no es una herramienta sobre una máquina: es la que las ENUMERA, y el
 * asistente no puede saber de antemano cuántas hay. Hoy dos, mañana las que se
 * den de alta en `shared/eva/comun/sistemas.js`.
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
/* `SISTEMAS` ya no se importa: `cuantos` contaba su longitud —cerradas
   incluidas— y ahora cuenta las que se pueden consultar (Plan 45 F3.2). */
import { NO_COMPARTEN, resumenDeSistemas } from '../../../../shared/eva/comun/sistemas.js'

/** La herramienta que enumera las máquinas de la planta. */
export function crearHerramientasDeRegistro() {
  return {
    /**
     * ── QUÉ SISTEMAS HAY EN ESTA PLANTA ───────────────────────────────
     *
     * El asistente no puede saber de antemano cuántos hay: hoy dos, mañana
     * los que se den de alta en `shared/eva/comun/sistemas.js`. Esta herramienta es
     * como los descubre, con lo que cada uno mide, qué herramientas lo cubren
     * y —lo que importa— qué NO se puede afirmar de él.
     *
     * Existe sobre todo por el error que evita: sin ella, preguntado por algo
     * de un sistema que no conoce, el modelo llamaría a la herramienta del
     * otro y contestaría con datos de la máquina equivocada, en una frase
     * perfectamente redactada.
     */
    async sistemas_de_la_planta() {
      /*
       * ── POR QUÉ ESTA HERRAMIENTA APUNTA A LA DE AL LADO ─────────────
       *
       * Medido con el modelo local: preguntado «¿qué se hizo con el pico de
       * aceleración? ¿ya había pasado?» llamó AQUÍ, no a
       * `hechos_de_la_planta`, que es donde está la bitácora. Contestó con las
       * limitaciones del sistema —correctas— y ni mencionó que hay un registro
       * de reparaciones.
       *
       * Refinar las descripciones no lo arregló. Lo que sí: que la elección
       * equivocada acabe llevando al sitio bueno. Cuesta una línea de contexto
       * y evita que el usuario se quede sin la respuesta que sí existe.
       */
      /*
       * ── LAS CERRADAS SE CUENTAN APARTE (Plan 45 F3.2) ──────────────
       *
       * `cuantos` era `SISTEMAS.length` y la lista iban todas, cerradas
       * incluidas. Medido el 24-09-2026 contra el modelo real: a «¿qué
       * máquinas hay?» contestó «en esta planta hay dos máquinas
       * independientes» y presentó la estación de llenado —cerrada desde el
       * 17-09, sin vistas, y que `resolverSistema()` niega en toda
       * herramienta— como si se pudiera preguntar por ella.
       *
       * No se OCULTAN, y esa es la decisión: ocultarlas dejaría al modelo sin
       * saber que existen, y entonces una pregunta legítima por el tanque
       * («¿y la bomba?») se contestaría con un «no existe» que es falso. Lo
       * que se hace es contarlas aparte y mandar su motivo, para que la
       * respuesta pueda ser «existe, pero está cerrada por esto».
       */
      const enServicio = resumenDeSistemas().filter((s) => !s.cerrado)
      const cerradas = resumenDeSistemas().filter((s) => s.cerrado)

      return {
        ok: true,
        cuantos: enServicio.length,
        sistemas: enServicio,
        ...(cerradas.length
          ? {
            cerradas: cerradas.map((s) => ({ id: s.id, nombre: s.nombre, motivo: s.cerrado })),
            sobre_las_cerradas:
              'Estas máquinas EXISTEN pero están cerradas: ninguna herramienta contesta por ' +
              'ellas. No las cuentes entre las de la planta ni ofrezcas consultarlas; si ' +
              'preguntan por una, di que está cerrada y por qué.',
          }
          : {}),
        si_preguntan_por_lo_que_ya_se_hizo:
          'Esta herramienta NO tiene la bitácora de reparaciones ni los datos confirmados de ' +
          'la instalación. Si la pregunta era «¿qué se hizo con esto?», «¿ya había pasado?» o ' +
          '«¿qué sabes de la planta?», llama a hechos_de_la_planta antes de contestar.',
        aviso: NO_COMPARTEN,
      }
    },
  }
}
