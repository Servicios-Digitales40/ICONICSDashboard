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
