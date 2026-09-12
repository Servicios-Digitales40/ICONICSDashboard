/**
 * El código estable de cada error que esta API puede devolver.
 *
 * ── QUÉ PROBLEMA RESUELVE ──────────────────────────────────────────
 *
 * Hasta ahora toda respuesta de error viajaba como `{ ok: false, error }` con
 * el mensaje YA REDACTADO en español. El tablero lo pintaba tal cual, así que
 * al traducirlo a inglés quedaban treinta frases en español dentro de una
 * interfaz en inglés — y no había forma de arreglarlo desde el frontend: el
 * texto llegaba hecho.
 *
 * Un mensaje es prosa; un código es una identidad. Con el código, cada lado
 * hace lo suyo: el servidor dice QUÉ pasó, el tablero decide CÓMO se cuenta y
 * en qué idioma.
 *
 * ── EL CAMBIO ES ADITIVO, Y ESO ES DELIBERADO ──────────────────────
 *
 * `error` NO se va. Sigue viajando con el mismo texto de siempre porque tiene
 * dos consumidores que no son el tablero:
 *
 *   · quien llama a la API con `curl` mientras monta el servidor, que necesita
 *     leer qué falló sin abrir un diccionario;
 *   · los guiones de `scripts/`, que comparan mensajes concretos.
 *
 * Así que la respuesta pasa a ser `{ ok: false, error, codigo }`. Un cliente
 * que no conozca `codigo` sigue funcionando exactamente igual — incluido el
 * propio tablero mientras le falte la traducción de un código nuevo, que cae
 * en el mensaje del servidor en vez de quedarse mudo.
 *
 * ── POR QUÉ LOS CÓDIGOS NO SE TRADUCEN ─────────────────────────────
 *
 * Son identificadores, no texto: viajan en el cuerpo de una respuesta HTTP,
 * los compara código y aparecen en registros. Traducirlos sería como traducir
 * un tag de ICONICS. Van en mayúsculas y en inglés por lo mismo que
 * `ICONICS_READ_ONLY` o `AUTH_HABILITADA`.
 *
 * ── LA REGLA QUE MANTIENE ESTO VIVO ────────────────────────────────
 *
 * `scripts/verificar-codigos.mjs` comprueba que cada código de esta lista
 * tenga su frase en los DOS idiomas del tablero, y que el tablero no invente
 * ninguno que aquí no exista. Sin esa comprobación, añadir un código nuevo
 * dejaría un error saliendo en español para siempre y nadie se enteraría —que
 * es exactamente el fallo que este archivo viene a cerrar.
 */

/**
 * El catálogo. La clave y el valor coinciden a propósito: se usa como
 * `CODIGOS.ERROR_SIN_AUDIO`, que se lee en el sitio de la llamada, y el
 * verificador recorre los valores.
 */
export const CODIGOS = Object.freeze({
  /* ── Transversales: los pone `plugins/errores.mjs`, no una ruta ──── */

  /** El cliente mandó algo que el esquema rechaza. Culpa suya, no del servidor. */
  ERROR_VALIDACION: 'ERROR_VALIDACION',
  /** Cuerpo que no es JSON válido, o que supera el tope. */
  ERROR_CUERPO_INVALIDO: 'ERROR_CUERPO_INVALIDO',
  /** Demasiadas peticiones. Lleva `reintentarEnSegundos` al lado. */
  ERROR_RATE_LIMITED: 'ERROR_RATE_LIMITED',
  /** Cualquier fallo no previsto. El detalle se queda en el registro. */
  ERROR_SERVER: 'ERROR_SERVER',

  /* ── Sesión (Plan 22 F6; el interruptor sigue apagado) ───────────── */

  ERROR_AUTH_DESACTIVADA: 'ERROR_AUTH_DESACTIVADA',
  ERROR_CREDENCIALES: 'ERROR_CREDENCIALES',
  ERROR_USUARIO_DESCONOCIDO: 'ERROR_USUARIO_DESCONOCIDO',

  /* ── ICONICS ────────────────────────────────────────────────────── */

  ERROR_READ_ONLY: 'ERROR_READ_ONLY',
  ERROR_PUNTOS_REQUERIDOS: 'ERROR_PUNTOS_REQUERIDOS',
  ERROR_PUNTOS_INVALIDOS: 'ERROR_PUNTOS_INVALIDOS',
  /** El accionamiento de la bomba lo rechazó una guarda, o falló al escribir. */
  ERROR_ACCION_BOMBA: 'ERROR_ACCION_BOMBA',

  /* ── Asistente ──────────────────────────────────────────────────── */

  ERROR_IA_SIN_CONFIGURAR: 'ERROR_IA_SIN_CONFIGURAR',
  ERROR_MODELO_UNICO: 'ERROR_MODELO_UNICO',
  ERROR_MODELO_DESCONOCIDO: 'ERROR_MODELO_DESCONOCIDO',
  ERROR_CONSULTA_EN_CURSO: 'ERROR_CONSULTA_EN_CURSO',
  ERROR_PDF_SIN_CONFIGURAR: 'ERROR_PDF_SIN_CONFIGURAR',
  ERROR_PDF_SIN_DEPENDENCIAS: 'ERROR_PDF_SIN_DEPENDENCIAS',

  /* ── Diagnóstico y bitácora de casos ────────────────────────────── */

  ERROR_MOTOR_SIN_MONTAR: 'ERROR_MOTOR_SIN_MONTAR',
  ERROR_DIARIO_SIN_MONTAR: 'ERROR_DIARIO_SIN_MONTAR',
  ERROR_CUADERNO_SIN_MONTAR: 'ERROR_CUADERNO_SIN_MONTAR',
  ERROR_DIAGNOSTICO: 'ERROR_DIAGNOSTICO',
  ERROR_CASO_NO_ENCONTRADO: 'ERROR_CASO_NO_ENCONTRADO',
  ERROR_BITACORA: 'ERROR_BITACORA',

  /* ── Documentación de planta (RAG) ──────────────────────────────── */

  ERROR_DOCS_SIN_CONFIGURAR: 'ERROR_DOCS_SIN_CONFIGURAR',
  ERROR_CARGA_DESACTIVADA: 'ERROR_CARGA_DESACTIVADA',
  ERROR_ARCHIVO_GRANDE: 'ERROR_ARCHIVO_GRANDE',
  ERROR_SIN_ARCHIVO: 'ERROR_SIN_ARCHIVO',
  ERROR_MANUAL: 'ERROR_MANUAL',
  ERROR_MANUAL_NO_ENCONTRADO: 'ERROR_MANUAL_NO_ENCONTRADO',

  /* ── Dictado por voz ────────────────────────────────────────────── */

  ERROR_VOZ_SIN_CONFIGURAR: 'ERROR_VOZ_SIN_CONFIGURAR',
  ERROR_AUDIO_GRANDE: 'ERROR_AUDIO_GRANDE',
  ERROR_SIN_AUDIO: 'ERROR_SIN_AUDIO',
  ERROR_TRANSCRIPCION: 'ERROR_TRANSCRIPCION',

  /* ── Enlaces de reporte firmados (Plan 22 F7) ───────────────────── */

  ERROR_ENLACE_CADUCADO: 'ERROR_ENLACE_CADUCADO',
  ERROR_ENLACE_SIN_FIRMA: 'ERROR_ENLACE_SIN_FIRMA',
  ERROR_ENLACE_INVALIDO: 'ERROR_ENLACE_INVALIDO',
  ERROR_ENLACE_DE_OTRO: 'ERROR_ENLACE_DE_OTRO',
  ERROR_REPORTE_NO_ENCONTRADO: 'ERROR_REPORTE_NO_ENCONTRADO',
})

/**
 * Responde un error con su código, en la única forma que entiende el tablero.
 *
 * Existe como función y no como un `reply.code(...).send({...})` suelto por un
 * motivo concreto: **el código es fácil de olvidar**. Un sitio que se lo salte
 * devuelve un error sin identidad, el tablero cae en el mensaje del servidor y
 * esa respuesta se queda en español para siempre sin que nada falle. Con una
 * función, el código es un parámetro obligatorio de la firma.
 *
 * @param {object} reply    la respuesta de Fastify
 * @param {number} estado   el código HTTP (400, 403, 503…)
 * @param {string} codigo   uno de `CODIGOS`
 * @param {string} error    el mensaje de siempre, en español, para curl y logs
 * @param {object} [extra]  campos adicionales de esa respuesta concreta
 */
export function responderError(reply, estado, codigo, error, extra = {}) {
  return reply.code(estado).send({ ok: false, error, codigo, ...extra })
}
