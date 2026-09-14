/**
 * Registro de los MÓDULOS de la demo.
 *
 * ── POR QUÉ EXISTE, HABIENDO YA UN REGISTRO DE SISTEMAS ─────────────
 *
 * Porque `eva/comun/sistemas.js` no puede contestar la pregunta que este
 * archivo contesta: **de dónde viene el dato**.
 *
 * Ese registro es código ejecutable que da por hecho que hay tags de ICONICS
 * detrás de cada entrada — declara `raices`, `puntos()`, `parse()`, `modelo()`,
 * `esHistorizada()` y `cadenciaMs`. Meter ahí una máquina que se lee por REST
 * desde otro backend obligaría a que cada una de esas funciones tuviera una
 * rama «ésta no es de ICONICS», que es exactamente el `if` repetido en cinco
 * archivos que ese registro existe para evitar. Ver CLAUDE.md §4.7.
 *
 * Así que la separación se hace un nivel más arriba:
 *
 *   SISTEMA   una máquina de planta leída por ICONICS (tanque, vibraciones)
 *   MÓDULO    una agrupación definida por su FUENTE DE DATOS
 *
 * ── LO QUE ESTE REGISTRO EXISTE PARA IMPEDIR ────────────────────────
 *
 * Que alguien cruce dos fuentes distintas.
 *
 * Es la misma prohibición que `NO_COMPARTEN` ya impone entre el tanque y
 * vibraciones —dos máquinas con distinto PLC no se correlacionan sin que
 * alguien lo justifique primero— pero aquí el salto es mayor: allí al menos
 * las dos máquinas comparten servidor, reloj e historiador. Un compresor
 * servido por otro backend no comparte ni eso.
 *
 * El fallo que esto previene no es teórico. El 03-09-2026, preguntado por los
 * tres apoyos del sistema de vibraciones, el asistente contestó ofreciendo
 * «las ocho señales del sistema de agua». Confundió dos máquinas del MISMO
 * módulo. Con dos módulos y dos fuentes, el error equivalente pondría curvas
 * de un compresor bajo el nombre de un tanque.
 *
 * ── `sistemas` SON IDS, NO OBJETOS, A PROPÓSITO ─────────────────────
 *
 * Importar `SISTEMAS` aquí arrastraría el dominio EVA entero —catálogos,
 * física, simuladores— a un archivo cuyo trabajo es decir qué agrupa a qué, y
 * crearía una dependencia en el sentido equivocado: el registro de arriba
 * dependiendo del de abajo. Quedan como cadenas, y
 * `scripts/verificar-modulos.mjs` comprueba contra `SISTEMAS` que ninguna
 * sobra y que ninguna falta. La comprobación es del verificador, no del
 * arranque.
 *
 * ── `limitaciones` NO ES DOCUMENTACIÓN ──────────────────────────────
 *
 * Mismo criterio que en `sistemas.js`: es lo que hay que decir EN VOZ ALTA al
 * contestar sobre ese módulo. Un dato que no existe y un dato que vale cero se
 * ven igual en una respuesta bien redactada, y la diferencia importa.
 */

/**
 * Los orígenes posibles. No es una lista abierta: añadir una fuente es una
 * decisión de arquitectura (CLAUDE.md §2.1), no un valor más de un enum.
 */
export const FUENTES = Object.freeze({
  /** El servidor ICONICS FrameWorX de esta planta. */
  ICONICS: 'iconics',
  /** Un backend que no es nuestro y que no leemos por ICONICS. */
  API_EXTERNA: 'api-externa',
})

/**
 * Forma de un módulo:
 *
 *   id            identificador estable
 *   nombre        cómo se llama para una persona
 *   fuente        de FUENTES — LO QUE IMPIDE EL CRUCE
 *   origen        de dónde sale el dato, en lenguaje de persona
 *   sistemas      ids de `SISTEMAS` que contiene; vacío si no lee ICONICS
 *   herramientas  familias del asistente que aplican a este módulo
 *   limitaciones  lo que hay que confesar al contestar sobre él
 */
export const MODULOS = Object.freeze([
  Object.freeze({
    id: 'monitoreo',
    nombre: 'Monitoreo y Diagnóstico',
    fuente: FUENTES.ICONICS,
    origen: 'ICONICS FrameWorX de esta planta, vía el puente de backend.',
    sistemas: Object.freeze(['tanque', 'vibraciones']),
    herramientas: Object.freeze([
      'maquina',
      'historicos',
      'documentacion',
      'diagnostico',
      'aprendizaje',
      'registro',
    ]),
    limitaciones: Object.freeze([
      'Los límites con los que se evalúa cada señal son estimaciones nuestras salvo donde el manual diga otra cosa.',
      'La agrupación en cuatro activos del tanque es nuestra, no del servidor: bajo su raíz no hay equipos, sólo señales sueltas.',
    ]),
  }),

  Object.freeze({
    id: 'prediccion',
    nombre: 'Predicción',
    fuente: FUENTES.API_EXTERNA,
    origen: 'Backend predictivo propio (Django) en 10.10.17.13:8000, alimentado por el histórico de un compresor real.',
    /*
     * Vacío, y no `['compresor']`: el compresor NO es un sistema. No está en
     * `SISTEMAS` y no puede estarlo — ver la cabecera. Si algún día se leyera
     * por ICONICS, entonces sí, y esta lista dejaría de estar vacía.
     */
    sistemas: Object.freeze([]),
    /*
     * Vacío HOY, y es un hecho, no un olvido: ninguna de las 22 herramientas
     * del asistente habla con esta API. Es lo que separa una pantalla de un
     * módulo consultable en lenguaje natural, y lo construye la F5 del
     * Plan 19.
     */
    herramientas: Object.freeze([]),
    limitaciones: Object.freeze([
      'El dato NO viene de ICONICS: lo sirve otro backend, en otra máquina. Nada de este módulo se cruza con el tanque ni con el sistema de vibraciones.',
      'El histórico se alimenta de una hoja de cálculo cuyo contenido exacto todavía no está inventariado: no se sabe aún qué variables hay ni con qué unidad.',
      'No hay lectura en vivo de esta máquina. Todo lo que se consulta es pasado.',
      'El modelo predictivo no tiene todavía un error validado publicado, así que ninguna proyección se puede citar como fiable.',
      'El asistente todavía no tiene ninguna herramienta contra esta API: no puede contestar preguntas sobre este módulo.',
    ]),
  }),
])

/** Un módulo por su id, o `null`. */
export function moduloPorId(id) {
  return MODULOS.find(m => m.id === id) ?? null
}

/**
 * A qué módulo pertenece un sistema, o `null` si ese sistema no existe en
 * ninguno. Devolver `null` y no lanzar es deliberado: quien pregunta suele
 * estar validando una entrada de fuera, y una excepción ahí se convierte en un
 * 500 donde correspondía un «no lo conozco».
 */
export function moduloDeSistema(sistemaId) {
  return MODULOS.find(m => m.sistemas.includes(sistemaId)) ?? null
}

/**
 * ¿Pueden cruzarse estos dos sistemas? Sólo si pertenecen al MISMO módulo —y
 * aun entonces `NO_COMPARTEN` puede prohibirlo por PLC distinto, que es una
 * comprobación aparte y más fina (`eva/comun/sistemas.js`).
 *
 * Esta función es la guarda gruesa: la que impide mezclar fuentes.
 */
export function compartenModulo(sistemaA, sistemaB) {
  const a = moduloDeSistema(sistemaA)
  const b = moduloDeSistema(sistemaB)
  return Boolean(a && b && a.id === b.id)
}
