/**
 * De una serie 0/1 del historiador a una lista de EVENTOS de alarma.
 *
 * ── POR QUÉ EXISTE, Y POR QUÉ NO SE USA `/AlarmHistory` ────────────
 *
 * Porque esta instalación no tiene Alarm Historian. Medido contra `bms-server`
 * el 12-09-2026 (`scripts/sondear-alarmas.mjs`): `/AlarmHistory` devuelve 500
 * con las dos rutas —el tag en vivo y el del historiador— y 400 sin
 * `pointName`, con el token ya caliente. No es un fallo de autenticación: el
 * subsistema no está montado.
 *
 * Lo que SÍ hay es Hyper Historian, y las nueve alarmas del PLC están
 * declaradas ahí como booleanos historizados: `/History` las sirve como una
 * serie de `{ timestamp, quality, value }` con `value` booleano. De ahí se
 * derivan los eventos mirando los FLANCOS — 0→1 la alarma entra, 1→0 se va.
 *
 * ── QUÉ PUEDE DAR ESTO, Y QUÉ NO ───────────────────────────────────
 *
 * Puede: cuándo entró, cuándo salió, cuánto duró, y si sigue activa.
 *
 * NO puede: mensaje, severidad ni estado de reconocimiento. Eso son campos que
 * el Alarm Server escribe en SUS eventos, y un flanco de una serie no los
 * tiene. Quien pinte esto no debe inventarlos — es la misma regla que impide
 * disfrazar de cero un dato ausente (`CLAUDE.md` §2.4).
 *
 * Y por lo mismo, un evento derivado **no se puede reconocer**: el acuse es una
 * operación del Alarm Server sobre un `eventId` suyo, y aquí ese id no existe.
 *
 * ── POR QUÉ EL PRIMER VALOR NO ES UN EVENTO ────────────────────────
 *
 * La primera muestra de la ventana dice en qué estado estaba la alarma al
 * empezar, no que haya cambiado de estado en ese instante. Contarla como una
 * entrada inventaría un evento en el borde del rango cada vez que alguien abre
 * una ventana con la alarma ya activa — y ese evento tendría la hora de cuando
 * se miró, no de cuando pasó.
 *
 * Lo que sí se conserva es el ESTADO inicial (`activaAlEmpezar`), que es lo que
 * permite decir «llevaba activa desde antes de esta ventana» sin fingir saber
 * desde cuándo.
 */

/**
 * @typedef {object} EventoDeAlarma
 * @property {Date} inicio            Cuándo entró (el flanco 0→1).
 * @property {Date|null} fin          Cuándo salió, o `null` si sigue activa.
 * @property {number|null} duracionMs `null` mientras siga activa.
 * @property {boolean} activa         Si continúa activa al final de la ventana.
 * @property {boolean} desdeAntes     Si ya estaba activa al empezar la ventana,
 *   en cuyo caso `inicio` es el borde del rango y NO el momento real de entrada.
 */

/**
 * Los eventos de una serie booleana, en orden cronológico.
 *
 * @param {{t: Date, valor: number}[]} muestras  Ya normalizadas
 *   (`shared/eva/comun/historia.js`): con `valor` en 0/1 y la mala calidad
 *   descartada. No se filtra aquí otra vez — hacerlo dos veces es cómo las dos
 *   copias acaban discrepando.
 * @returns {EventoDeAlarma[]}
 */
export function eventosDeAlarma(muestras) {
  const lista = Array.isArray(muestras) ? muestras : []
  if (lista.length === 0) return []

  /*
   * Se ordena por si el historiador devolviera los tramos desordenados —pasa
   * al recomponer una ventana larga de varias peticiones— porque un flanco
   * calculado sobre muestras fuera de orden es un evento falso.
   */
  const ordenadas = [...lista].sort((a, b) => a.t.getTime() - b.t.getTime())

  const eventos = []
  let previo = null
  let abierto = null

  for (const m of ordenadas) {
    const activa = Number(m.valor) !== 0

    if (previo === null) {
      /*
       * La primera muestra fija el estado de partida. Si ya venía activa se
       * abre un evento marcado `desdeAntes`: hubo una alarma, y ocultarla
       * porque su flanco cae fuera de la ventana sería perder el caso que más
       * importa — el que sigue sonando.
       */
      if (activa) abierto = { inicio: m.t, desdeAntes: true }
      previo = activa
      continue
    }

    if (activa === previo) continue

    if (activa) {
      abierto = { inicio: m.t, desdeAntes: false }
    } else if (abierto) {
      eventos.push(cerrar(abierto, m.t))
      abierto = null
    }

    previo = activa
  }

  /* Lo que sigue activo al final de la ventana viaja SIN fin y sin duración,
     no con la hora del último dato: eso afirmaría que terminó, y no ha
     terminado. */
  if (abierto) eventos.push(cerrar(abierto, null))

  return eventos
}

function cerrar({ inicio, desdeAntes }, fin) {
  return {
    inicio,
    fin,
    duracionMs: fin ? fin.getTime() - inicio.getTime() : null,
    activa: fin === null,
    desdeAntes,
  }
}

/**
 * Un id estable para un evento derivado.
 *
 * ── PARA QUÉ, SI NO SE PUEDE RECONOCER ─────────────────────────────
 *
 * Para que React tenga una `key` y para que la bandeja pueda recordar qué se ha
 * leído ya (Plan 24 F5) entre visitas. No es un `eventId` del Alarm Server y no
 * sirve para reconocer nada: sale de la clave de la alarma y del instante de
 * entrada, que es lo que lo hace estable entre recargas.
 *
 * Lleva el prefijo `hist:` para que nunca se pueda confundir con un id real si
 * algún día conviven las dos fuentes.
 */
export function idDeEvento(clave, evento) {
  return `hist:${clave}:${evento.inicio.toISOString()}`
}

/**
 * Cuánto tiempo estuvo activa la alarma DENTRO de `[inicio, fin]`, sumando
 * todos los eventos que se solapan con esa ventana — recortando el que
 * empieza antes y el que sigue activo al final (`fin: null` se recorta a
 * `fin` de la ventana, nunca se extrapola).
 *
 * Es la pieza que faltaba para distinguir un arranque normal de uno que no
 * se resuelve: un evento SUELTO no dice nada por sí mismo (`faltaDePresion`
 * llega a durar hasta 2 min en un arranque sano, medido — ver
 * `data/comunes/alarmas.js`), pero CUÁNTO tiempo activo se acumula en una
 * ventana corta sí lo distingue, incluso cuando el patrón viene en pulsos
 * cortos y parpadeantes en vez de un único tramo largo — que es justo la
 * forma que tomó el incidente del 14-09-2026 (parpadeo continuo durante más
 * de dos horas, nunca un solo evento largo).
 */
export function tiempoActivoEnVentana(eventos, { inicio, fin }) {
  const inicioMs = inicio.getTime()
  const finMs = fin.getTime()
  let totalMs = 0
  for (const e of eventos) {
    const desde = Math.max(e.inicio.getTime(), inicioMs)
    const hasta = Math.min(e.fin ? e.fin.getTime() : finMs, finMs)
    if (hasta > desde) totalMs += hasta - desde
  }
  return totalMs
}

/**
 * ¿Esta alarma lleva "sostenida" — activa sin resolverse de verdad— en la
 * ventana reciente?
 *
 * ── POR QUÉ NO BASTA CON "¿ESTÁ ACTIVA AHORA MISMO?" ─────────────────
 *
 * Porque un arranque normal de la bomba TAMBIÉN pasa por la alarma activa un
 * instante — la diferencia no es que se encienda, es que no se apaga y se
 * queda así, o que vuelve a encenderse una y otra vez sin llegar a asentarse.
 * Mirar sólo el instante actual no puede distinguir las dos cosas.
 *
 * ── DE DÓNDE SALEN LOS DEFECTOS ───────────────────────────────────────
 *
 * `ventanaMs` (5 min) y `corteMs` (150 s) se fijaron el 14-09-2026 contra dos
 * medidas reales, no a ojo: un arranque sano nunca pasó de 2 min (120 s) de
 * un único evento (`data/comunes/alarmas.js`), y el incidente de esa fecha
 * mantuvo la alarma activa una fracción muy alta de CUALQUIER ventana de
 * varios minutos durante más de dos horas seguidas. 150 s queda por ENCIMA
 * del evento aislado más largo medido —así que un solo arranque largo pero
 * sano no dispara esto por sí solo, hacen falta varios pulsos o algo
 * genuinamente más largo—, y muy por debajo de lo que acumula un episodio
 * real en la misma ventana.
 *
 * @param {EventoDeAlarma[]} eventos  de `eventosDeAlarma()`, ya en la ventana
 *   que se va a evaluar (o una más amplia; esta función recorta sola).
 * @param {{ahora?: Date, ventanaMs?: number, corteMs?: number}} [opciones]
 * @returns {{activoMs: number, ventanaMs: number, fraccion: number, sostenida: boolean}}
 */
export function evaluarPersistencia(eventos, { ahora = new Date(), ventanaMs = 5 * 60_000, corteMs = 150_000 } = {}) {
  const inicio = new Date(ahora.getTime() - ventanaMs)
  const activoMs = tiempoActivoEnVentana(eventos, { inicio, fin: ahora })
  return {
    activoMs,
    ventanaMs,
    fraccion: activoMs / ventanaMs,
    sostenida: activoMs >= corteMs,
  }
}
