/**
 * Las alarmas que el servidor ICONICS tiene configuradas para esta
 * instalación, y a qué señal vigila cada una.
 *
 * ── ESTO NO ES UNA SUPOSICIÓN NUESTRA ──────────────────────────────
 *
 * A diferencia de `umbrales.js` —que son estimaciones nuestras y no se parecen
 * a esta planta— estas once alarmas están **configuradas en el servidor por
 * quien opera la instalación**, bajo `ae:/DEMO`. Sus límites, su severidad y
 * su criterio de disparo los decidió alguien que conoce el proceso.
 *
 * Por eso una alarma activa vale más que cualquier estado que calcule el
 * tablero: cuando ICONICS dice que hay BAJO FLUJO, eso es un hecho de la
 * planta, no una comparación contra un número de libro.
 *
 * ── POR QUÉ `ae:` Y NO `ac:` ───────────────────────────────────────
 *
 * Las señales viven en el árbol de Assets (`ac:`) y las alarmas en el del
 * servidor de alarmas (`ae:`). Son dos espacios de nombres distintos del mismo
 * servidor, y confundirlos es lo que hizo creer durante meses que esta
 * instalación no tenía alarmas: se preguntaba por ellas en `ac:`, donde no
 * están, y la respuesta vacía se leyó como «no hay».
 *
 * ── CÓMO SE LEE EL ESTADO DE UNA ALARMA ────────────────────────────
 *
 * No como un punto: leer `ae:/DEMO.BAJO FLUJO` devuelve calidad mala. Cada
 * alarma publica sus campos como puntos aparte, con `@`:
 *
 *     ae:/DEMO.BAJO FLUJO@NewState     3 = activa, 1 = normal
 *     ae:/DEMO.BAJO FLUJO@Severity     0 a 1000
 *     ae:/DEMO.BAJO FLUJO@ActiveTime   cuándo cambió de estado
 *     ae:/DEMO.BAJO FLUJO@Message      el texto que se enseña
 */

/** Dónde cuelgan las alarmas de esta instalación. */
export const RAIZ_ALARMAS = 'ae:/DEMO'

/**
 * Los campos de alarma que se leen. Cinco y no los veintiséis que publica el
 * servidor: cada uno es un punto más en la lectura en lote, y el resto
 * —comentarios de reconocimiento, actores, husos horarios— no cambia lo que se
 * le enseña al operador ni lo que necesita el diagnóstico.
 */
export const CAMPOS_ALARMA = ['NewState', 'Severity', 'ActiveTime', 'Message', 'AckRequired']

/**
 * `@NewState` es un número, y estos son los que devuelve este servidor.
 *
 * Medido contra la instalación real: 1 con severidad 0 y mensaje «Equipo
 * regresa a condición normal» es una alarma que ya se fue; 3 con severidad 800
 * es una activa. Los demás valores del estándar OPC A&E no se han visto aquí,
 * así que se tratan como desconocidos en vez de inventarles un significado.
 */
export const ESTADO_ALARMA = {
  1: { clave: 'normal', label: 'Normal', activa: false },
  2: { clave: 'reconocida', label: 'Activa, reconocida', activa: true },
  3: { clave: 'activa', label: 'ACTIVA', activa: true },
}

/**
 * El catálogo.
 *
 * `senal` es la clave de `senales.js` que la alarma vigila, y es lo que permite
 * al asistente pasar de «se disparó BAJO FLUJO» a mirar la serie del caudal en
 * ese momento sin que nadie se lo diga. `null` significa que la alarma no
 * vigila una señal medida —los mantenimientos son estados operativos— y
 * entonces el diagnóstico no tiene serie que mirar, lo cual es una respuesta
 * perfectamente válida.
 *
 * `relacionadas` son las señales que conviene mirar ADEMÁS de la propia, y es
 * donde vive el conocimiento del proceso: un caudal bajo puede venir de que la
 * bomba no empuja, de que no hay agua en el tanque o de que la presión se ha
 * caído, así que un diagnóstico honesto las cruza las tres.
 */
export const ALARMAS = {
  'NIVEL ALTO ALTO': {
    senal: 'nivelTanque',
    relacionadas: ['flujoInstantaneo'],
    queSignifica: 'El tanque está muy por encima de su nivel de trabajo. Riesgo de rebose.',
  },
  'NIVEL ALTO': {
    senal: 'nivelTanque',
    relacionadas: ['flujoInstantaneo'],
    queSignifica: 'El tanque está por encima de su nivel de trabajo.',
  },
  'NIVEL BAJO BAJO': {
    senal: 'nivelTanque',
    relacionadas: ['flujoInstantaneo', 'cargaMotor'],
    queSignifica:
      'El tanque está muy por debajo de su nivel de trabajo. Con poco nivel la bomba puede ' +
      'cavitar, así que esta alarma protege al equipo y no sólo al proceso.',
  },
  'NIVEL BAJO': {
    senal: 'nivelTanque',
    relacionadas: ['flujoInstantaneo'],
    queSignifica: 'El tanque está por debajo de su nivel de trabajo.',
  },
  'PRESION ALTA': {
    senal: 'presionRelativa',
    relacionadas: ['flujoInstantaneo', 'cargaMotor'],
    queSignifica:
      'La red está por encima de su presión de trabajo. Suele indicar una salida cerrada con ' +
      'la bomba empujando.',
  },
  'FALTA DE PRESIÓN': {
    senal: 'presionRelativa',
    relacionadas: ['flujoInstantaneo', 'cargaMotor', 'nivelTanque'],
    queSignifica:
      'La red no alcanza su presión de trabajo. Puede ser una fuga, la bomba sin empujar, o ' +
      'que no haya agua que impulsar.',
  },
  'BAJO FLUJO': {
    senal: 'flujoInstantaneo',
    relacionadas: ['presionRelativa', 'cargaMotor', 'nivelTanque'],
    queSignifica:
      'No circula el caudal esperado. Con el motor en marcha apunta a una obstrucción, una ' +
      'válvula cerrada o falta de agua; con el motor parado puede ser simplemente que la ' +
      'instalación no esté impulsando.',
  },
  'FALLA VARIADOR DE FRECUENCIA': {
    senal: 'modoVdf',
    relacionadas: ['cargaMotor', 'tensionLinea'],
    queSignifica:
      'El variador que gobierna la bomba ha fallado. Sin él la bomba no arranca, así que ' +
      'suele arrastrar consigo las alarmas de caudal y presión.',
  },
  'VFD EN MANTENIMIENTO': {
    senal: null,
    relacionadas: ['cargaMotor'],
    queSignifica:
      'El variador está marcado en mantenimiento. NO es una avería: es un estado operativo ' +
      'declarado, y mientras dure el sistema no arranca en automático.',
  },
  'SELENOIDE SUPERIOR EN MANTENIMIENTO': {
    senal: null,
    relacionadas: [],
    queSignifica: 'La solenoide superior está marcada en mantenimiento. Estado operativo, no avería.',
  },
  'SELENOIDE INFERIOR EN MANTENIMIENTO_2': {
    senal: null,
    relacionadas: [],
    queSignifica: 'La solenoide inferior está marcada en mantenimiento. Estado operativo, no avería.',
  },
}

export const NOMBRES_ALARMA = Object.keys(ALARMAS)

/** Los puntos que hay que leer para saber el estado de TODAS las alarmas. */
export function puntosDeAlarmas() {
  const puntos = []
  for (const nombre of NOMBRES_ALARMA) {
    for (const campo of CAMPOS_ALARMA) {
      puntos.push(`${RAIZ_ALARMAS}.${nombre}@${campo}`)
    }
  }
  return puntos
}

/**
 * Un nombre de punto de alarma → de qué alarma y qué campo es.
 *
 * Devuelve `null` ante cualquier cosa que no reconozca, por el mismo motivo
 * que `parsePointName` en `senales.js`: un cambio en el servidor tiene que
 * verse como dato ausente y nunca como una asignación a la alarma equivocada.
 */
export function parsePuntoAlarma(punto) {
  const texto = String(punto ?? '')
  if (!texto.startsWith(`${RAIZ_ALARMAS}.`)) return null

  const resto = texto.slice(RAIZ_ALARMAS.length + 1)
  const arroba = resto.lastIndexOf('@')
  if (arroba === -1) return null

  const nombre = resto.slice(0, arroba)
  const campo = resto.slice(arroba + 1)

  if (!ALARMAS[nombre] || !CAMPOS_ALARMA.includes(campo)) return null
  return { nombre, campo }
}

/**
 * El estado en palabras, a partir del número que devuelve `@NewState`.
 *
 * Un estado que no esté en la tabla se cuenta como desconocido y **no** se
 * asume activo ni normal: inventarle un significado a un código que no hemos
 * visto es exactamente cómo se acaba enseñando una alarma que no existe, o
 * callando una que sí.
 */
export function estadoDeAlarma(valor) {
  const n = Number(valor)
  return ESTADO_ALARMA[n] ?? { clave: 'desconocido', label: `Estado ${valor}`, activa: false }
}
