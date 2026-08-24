/**
 * De lo que escribe una persona a un rango de tiempo concreto.
 *
 * ── POR QUÉ ESTO ES CÓDIGO Y NO PROMPT ─────────────────────────────
 *
 * Es la misma regla que ya siguen los nombres de máquina y las fechas:
 * **resolver es trabajo del backend; elegir es trabajo del modelo.** Pedirle a
 * un modelo de 4B que convierta «julio de 2026» en un rango de 31 días, o
 * «ayer a las 12» en una ventana horaria, es pedirle aritmética de calendario
 * —lo que peor hace— y aquí un fallo no se ve: devuelve datos reales del
 * período equivocado, que es indistinguible de la respuesta correcta.
 *
 * ── LA FORMA ÚNICA ─────────────────────────────────────────────────
 *
 * Todo período, sea lo que sea, se reduce a lo mismo:
 *
 *     { tipo, diaDesde, diaHasta, horaDesde, horaHasta }
 *
 * Un día es `horaDesde 0, horaHasta 24`. Una hora suelta es `12 → 13`. Un mes
 * son dos días distintos con las horas completas. Así el que lee no tiene
 * cuatro caminos, solo dos: mismo día (una lectura horaria que se recorta) o
 * varios días (un barrido).
 */

/** Qué clase de período es. Decide cómo se lee y cómo se resume. */
export const TIPOS = {
  DIA: 'dia',
  HORA: 'hora',
  VENTANA: 'ventana',   // un tramo de horas dentro de un día (un turno)
  RANGO: 'rango',       // varios días
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

/**
 * Quita acentos y unifica separadores.
 *
 * Conserva `:` y `-` a propósito: son parte de los datos, no separadores.
 * Sin el guión, «2025-03-25» se convertía en «2025 03 25» y dejaba de
 * reconocerse como fecha ISO — un fallo silencioso que hacía irresoluble la
 * forma más común de todas.
 */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9:-]+/g, ' ')
    .trim()
}

const p2 = n => String(n).padStart(2, '0')

/** Date → "YYYY-MM-DD" del día local. */
export function isoLocal(d) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/** "YYYY-MM-DD" de hoy más `dias`. */
export function desdeHoy(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return isoLocal(d)
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/* ── Días ────────────────────────────────────────────────────────────── */

/**
 * Un día suelto, en ISO o en lenguaje llano.
 * @returns {string|null} "YYYY-MM-DD"
 */
export function resolverDia(texto) {
  const crudo = String(texto ?? '').trim()
  if (ISO_RE.test(crudo)) return crudo

  const t = normalizar(crudo).replace(/\b(el|del|de|dia)\b/g, ' ').replace(/\s+/g, ' ').trim()

  // Otra vez tras limpiar los artículos: «del 2025-03-25» llega aquí desde el
  // resolvedor de turnos, y probando el formato solo al principio se quedaba
  // sin reconocer una fecha perfectamente válida.
  if (ISO_RE.test(t)) return t

  if (t === 'hoy') return desdeHoy(0)
  if (t === 'ayer') return desdeHoy(-1)
  if (t === 'anteayer' || t === 'antier') return desdeHoy(-2)

  // «hace 3 dias»
  const hace = t.match(/^hace (\d+) dias?$/)
  if (hace) return desdeHoy(-Number(hace[1]))

  // «martes» es el más reciente, hoy incluido; «martes pasado» el anterior.
  const pasado = /\bpasad[oa]\b/.test(t)
  const indice = DIAS_SEMANA.indexOf(t.replace(/\bpasad[oa]\b/g, '').trim())
  if (indice >= 0) {
    const hoy = new Date().getDay()
    let atras = (hoy - indice + 7) % 7
    if (pasado && atras === 0) atras = 7
    return desdeHoy(-atras)
  }

  // «20 de julio», «20 julio 2026»
  const conMes = t.match(/^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/)
  if (conMes) {
    const mes = MESES.indexOf(conMes[2])
    if (mes >= 0) {
      const anio = conMes[3] ? Number(conMes[3]) : new Date().getFullYear()
      return `${anio}-${p2(mes + 1)}-${p2(Number(conMes[1]))}`
    }
  }

  return null
}

/* ── Horas ───────────────────────────────────────────────────────────── */

/**
 * Extrae la hora de un texto y devuelve el resto.
 *
 * Acepta «12:00», «a las 12», «12 pm», «12 de la tarde». El historiador
 * agrega por horas, así que los minutos se descartan a propósito: pedir
 * «12:30» devolvería el bucket de las 12 igual, y fingir precisión de minutos
 * sobre un dato horario sería mentir sobre la resolución del dato.
 */
function extraerHora(t) {
  const m = t.match(/\ba las (\d{1,2})(?::(\d{2}))?\s*(am|pm|de la ma[nñ]ana|de la tarde|de la noche)?/)
    || t.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?/)
    || t.match(/\b(\d{1,2})\s*(am|pm)\b/)

  if (!m) return { hora: null, resto: t }

  let hora = Number(m[1])
  const sufijo = m[3] ?? m[2] ?? ''

  if (/pm|tarde|noche/.test(sufijo) && hora < 12) hora += 12
  if (/am|ma[nñ]ana/.test(sufijo) && hora === 12) hora = 0
  if (hora < 0 || hora > 23) return { hora: null, resto: t }

  return { hora, resto: t.replace(m[0], ' ').replace(/\s+/g, ' ').trim() }
}

/**
 * Un INSTANTE concreto: «el 21 de agosto de 2026 a las 11:16».
 *
 * ── POR QUÉ ESTO NO ES `resolverPeriodo` ───────────────────────────
 *
 * Porque son dos preguntas distintas y sólo una de ellas tiene minutos.
 * `resolverPeriodo` contesta «¿cómo fue ese tramo?» y para eso el minuto
 * sobra: se responde con el mínimo, el máximo y el promedio de la hora. Ésta
 * contesta «¿cuánto marcaba en ese momento?», donde el minuto ES la pregunta
 * y redondearlo a la hora cambia la respuesta.
 *
 * `extraerHora` tira los minutos a propósito —y bien, para lo suyo—, así que
 * aquí se leen aparte en vez de cambiar aquella regla.
 *
 * @returns {{ instante: Date, etiqueta: string } | { error: string }}
 */
export function resolverInstante(texto) {
  const crudo = String(texto ?? '').trim()
  if (!crudo) return error('No me has dicho de qué momento.')

  const t = sinZona(normalizar(crudo))

  // Los minutos, antes de que `extraerHora` los descarte.
  const conMinutos = t.match(/\b(\d{1,2}):(\d{2})/)
  const minutos = conMinutos ? Number(conMinutos[2]) : 0
  if (minutos > 59) return error(`"${crudo}" no tiene una hora válida.`)

  const { hora, resto } = extraerHora(t)
  if (hora === null) {
    return error(
      `"${crudo}" no dice de qué hora. Para un valor puntual hace falta el momento: ` +
        `"ayer a las 14:30", "2026-08-21 a las 11:16".`
    )
  }

  const dia = resolverDia(resto) ?? (resto === '' ? isoLocal(new Date()) : null)
  if (!dia) return error(`No entiendo de qué día es "${crudo}". ${AYUDA}`)

  const instante = new Date(`${dia}T${p2(hora)}:${p2(minutos)}:00`)
  if (Number.isNaN(instante.getTime())) return error(`"${crudo}" no es un momento válido.`)
  if (instante > new Date()) {
    return error(`Ese momento (${dia} ${p2(hora)}:${p2(minutos)}) está en el futuro; no hay dato.`)
  }

  return { instante, etiqueta: `el ${dia} a las ${p2(hora)}:${p2(minutos)}` }
}

/* ── El resolvedor ───────────────────────────────────────────────────── */

const error = mensaje => ({ error: mensaje })

/**
 * Quita el sufijo de zona horaria: «… hora mexico», «… hora local», «… cst».
 *
 * ── POR QUÉ SE TIRA Y NO SE INTERPRETA ─────────────────────────────
 *
 * Porque el servidor YA está en la zona de la planta, así que «11:16 hora
 * México» y «11:16» son el mismo instante: lo único que hacía el sufijo era
 * impedir que la frase se reconociera. «el 21 de agosto de 2026 a las 11:16am
 * hora mexico» caía hasta el error final —«no entiendo el período»— por tres
 * palabras que no cambiaban nada, y el operador recibía una negativa a una
 * pregunta perfectamente formada.
 *
 * Ojo con el alcance: sólo se aceptan las zonas que SON la de la planta. Un
 * «hora de españa» tiene que seguir sin resolverse, porque ahí el sufijo sí
 * cambiaría el instante y descartarlo devolvería datos reales de la hora
 * equivocada —el modo de fallo que no se ve—.
 */
function sinZona(t) {
  return t
    .replace(/\bhora(?:rio)? (?:de |del )?(?:mexico|centro|local|planta|cdmx)\b/g, ' ')
    .replace(/\b(?:hora )?(?:cst|cdt|gmt-6|utc-6)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const AYUDA =
  'Formas que entiendo: un día ("2026-07-20", "ayer", "martes"), una hora ' +
  '("ayer a las 12", "2026-07-20 14:00"), un mes ("julio 2026"), un rango ' +
  '("últimos 7 días", "esta semana") o un turno si están configurados.'

/**
 * Resuelve cualquier período.
 *
 * @param {string} texto
 * @param {object} [opciones]
 * @param {object} [opciones.turnos]  { manana: [6,14], tarde: [14,22], … } o vacío
 * @returns {{ tipo, diaDesde, diaHasta, horaDesde, horaHasta, etiqueta } | { error }}
 */
export function resolverPeriodo(texto, { turnos = {} } = {}) {
  const crudo = String(texto ?? '').trim()
  if (!crudo) return error(`No me has dicho de qué período. ${AYUDA}`)

  let t = sinZona(normalizar(crudo))
  const hoy = isoLocal(new Date())

  /* 1 · Turnos. Van primero porque llevan un día dentro. */
  const turno = t.match(/\bturno (?:de (?:la|el) )?(ma[nñ]ana|tarde|noche|nocturno|matutino|vespertino)\b/)
  if (turno) {
    const clave = { matutino: 'manana', vespertino: 'tarde', nocturno: 'noche' }[turno[1]] ?? turno[1].replace('ñ', 'n')
    const tramo = turnos[clave]

    if (!tramo) {
      return error(
        `Los turnos no están configurados en este servidor, así que no puedo saber a qué horas ` +
          `empieza el turno de ${turno[1]}. Pregúntame por una hora concreta ("a las 8") o por ` +
          `el día completo.`
      )
    }

    const restoTurno = t.replace(turno[0], ' ').replace(/\s+/g, ' ').trim()
    const dia = resolverDia(restoTurno) ?? (restoTurno === '' ? hoy : null)
    if (!dia) return error(`No entiendo de qué día es ese turno. ${AYUDA}`)

    return {
      tipo: TIPOS.VENTANA,
      diaDesde: dia, diaHasta: dia,
      horaDesde: tramo[0], horaHasta: tramo[1],
      etiqueta: `turno de ${turno[1]} del ${dia}`,
    }
  }

  /* 2 · Rangos relativos. */
  const ultimos = t.match(/\b(?:ultim[oa]s?|pasad[oa]s?) (\d+) dias?\b/)
  if (ultimos) {
    const n = Number(ultimos[1])
    if (n < 1 || n > 366) return error(`El rango de ${n} días no es razonable. Pide entre 1 y 366.`)
    return rango(desdeHoy(-(n - 1)), hoy, `los últimos ${n} días`)
  }

  if (/\b(esta|la) semana\b/.test(t) && !/pasada/.test(t)) return rango(desdeHoy(-6), hoy, 'los últimos 7 días')
  if (/\bsemana pasada\b/.test(t)) return rango(desdeHoy(-13), desdeHoy(-7), 'la semana pasada')
  if (/\beste mes\b/.test(t)) return rango(hoy.slice(0, 8) + '01', hoy, 'lo que va de mes')

  if (/\bmes pasado\b/.test(t)) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return rango(isoLocal(d), isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      `${MESES[d.getMonth()]} de ${d.getFullYear()}`)
  }

  /* 3 · Un mes con nombre: «julio», «julio 2026», «el periodo de julio 2026». */
  const mesNombrado = t.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b(?:\s+(?:de\s+)?(\d{4}))?/)
  if (mesNombrado && !/\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/.test(t)) {
    const mes = MESES.indexOf(mesNombrado[1])
    const anio = mesNombrado[2] ? Number(mesNombrado[2]) : new Date().getFullYear()
    const primero = `${anio}-${p2(mes + 1)}-01`
    const ultimo = isoLocal(new Date(anio, mes + 1, 0))
    // Un mes en curso se recorta en hoy: los días que no han pasado no tienen dato.
    return rango(primero, ultimo > hoy ? hoy : ultimo, `${mesNombrado[1]} de ${anio}`)
  }

  /* 4 · Un día, con o sin hora. */
  const { hora, resto } = extraerHora(t)
  const dia = resolverDia(resto) ?? (resto === '' && hora !== null ? hoy : null)

  if (dia) {
    if (dia > hoy) return enElFuturo(dia)

    if (hora === null) {
      return { tipo: TIPOS.DIA, diaDesde: dia, diaHasta: dia, horaDesde: 0, horaHasta: 24, etiqueta: `el ${dia}` }
    }
    return {
      tipo: TIPOS.HORA,
      diaDesde: dia, diaHasta: dia,
      horaDesde: hora, horaHasta: hora + 1,
      etiqueta: `el ${dia} a las ${p2(hora)}:00`,
    }
  }

  return error(`No entiendo el período "${crudo}". ${AYUDA}`)
}

/**
 * El futuro se rechaza a propósito.
 *
 * `Interpolative` rellena todos los buckets del rango repitiendo el último
 * valor conocido, también los que aún no han ocurrido: un día que no ha
 * pasado devolvería un resumen con pinta de real.
 */
function enElFuturo(dia) {
  return error(`La fecha ${dia} está en el futuro; no hay datos todavía.`)
}

function rango(desde, hasta, etiqueta) {
  if (desde > hasta) return error('El período empieza después de terminar.')

  const hoy = isoLocal(new Date())
  if (desde > hoy) return enElFuturo(desde)

  // Un rango que se adentra en el futuro se recorta en hoy en vez de
  // rechazarse: «julio 2026» en mitad de julio es una pregunta legítima.
  return {
    tipo: TIPOS.RANGO,
    diaDesde: desde,
    diaHasta: hasta > hoy ? hoy : hasta,
    horaDesde: 0, horaHasta: 24,
    etiqueta,
  }
}

/**
 * Días de un rango, en orden.
 *
 * El historiador rechaza los rangos de varios días —fallan de forma
 * intermitente con «Invalid Point Name»—, así que quien lea tiene que ir día
 * a día. Ver docs/TAGS.md.
 */
export function diasDelRango(desde, hasta) {
  const dias = []
  const fin = new Date(`${hasta}T00:00:00`)
  for (let d = new Date(`${desde}T00:00:00`); d <= fin; d.setDate(d.getDate() + 1)) {
    dias.push(isoLocal(d))
  }
  return dias
}

/**
 * Lee la configuración de turnos de una cadena tipo
 * `manana=6-14,tarde=14-22,noche=22-6`.
 *
 * Vacía por defecto **a propósito**: sin el horario real de la planta, un
 * turno inventado devolvería datos verdaderos de las horas equivocadas, que
 * es indistinguible de la respuesta correcta. Preferimos decir que no está
 * configurado.
 */
export function leerTurnos(crudo) {
  const turnos = {}
  for (const parte of String(crudo ?? '').split(',')) {
    const m = parte.trim().match(/^([a-zñ]+)\s*=\s*(\d{1,2})\s*-\s*(\d{1,2})$/i)
    if (!m) continue

    const desde = Number(m[2])
    const hasta = Number(m[3])
    if (desde > 23 || hasta > 24) continue

    turnos[normalizar(m[1])] = [desde, hasta]
  }
  return turnos
}
