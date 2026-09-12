/**
 * `turnoEnCurso()` — Plan 25 F2.
 *
 * ── POR QUÉ ESTO TIENE SUITE PROPIA ────────────────────────────────
 *
 * Porque su modo de fallo es silencioso y de la peor clase: devolver un rango
 * VÁLIDO de las horas equivocadas. La vista de Turno enseñaría accionamientos y
 * alarmas de verdad, con sus horas de verdad, del turno de al lado — y eso es
 * indistinguible de la respuesta correcta para quien lo mira. Es literalmente el
 * argumento con el que `leerTurnos` se dejó vacío por defecto.
 *
 * Lo que más se prueba es el turno que CRUZA MEDIANOCHE (`noche=22-6`), que es
 * el caso normal en una planta y donde un `desde <= h < hasta` escrito sin
 * pensar falla dos veces: a las 23:00 diría que no hay turno, y a las 3:00
 * tampoco.
 */
import { describe, expect, it } from 'vitest'

import { leerTurnos, turnoEnCurso } from '../../shared/periodo.js'

/** El horario de tres turnos de siempre. */
const TURNOS = leerTurnos('manana=6-14,tarde=14-22,noche=22-6')

/** Una fecha local a la hora pedida, para que las pruebas se lean. */
const alas = (hora, minuto = 0, dia = 15) =>
  new Date(2026, 8, dia, hora, minuto, 0, 0) // septiembre de 2026

describe('turnos que no cruzan medianoche', () => {
  it('a media mañana, el turno de mañana', () => {
    const turno = turnoEnCurso(TURNOS, alas(9))

    expect(turno.clave).toBe('manana')
    expect(turno.inicio.getHours()).toBe(6)
    expect(turno.fin.getHours()).toBe(14)
  })

  it('el borde pertenece al turno que EMPIEZA, no al que termina', () => {
    // A las 14:00 en punto empieza la tarde. Sin esto, el minuto de las 14:00
    // caería en los dos turnos o en ninguno, según el orden del objeto.
    expect(turnoEnCurso(TURNOS, alas(14)).clave).toBe('tarde')
    expect(turnoEnCurso(TURNOS, alas(13, 59)).clave).toBe('manana')
  })
})

describe('el turno de noche, que es donde esto se rompe', () => {
  it('a las 23:00 el turno de noche está en curso, y empezó hoy', () => {
    const turno = turnoEnCurso(TURNOS, alas(23))

    expect(turno.clave).toBe('noche')
    expect(turno.inicio.getHours()).toBe(22)
    expect(turno.inicio.getDate()).toBe(15)
  })

  it('a las 3:00 sigue siendo el turno de noche, y empezó AYER', () => {
    /*
     * La aserción que de verdad importa. Sin ella, la vista pediría desde las
     * 00:00 y se comería las primeras cinco horas del turno — justo las de
     * madrugada, que es cuando pasan las cosas que nadie vio.
     */
    const turno = turnoEnCurso(TURNOS, alas(3))

    expect(turno.clave).toBe('noche')
    expect(turno.inicio.getHours()).toBe(22)
    expect(turno.inicio.getDate()).toBe(14)
  })

  it('el turno de noche dura 8 h, no 16 ni −16', () => {
    // `hasta - desde` daría −16 con 22→6. El error se vería como un rango
    // invertido, o peor, como una ventana de dieciséis horas.
    const turno = turnoEnCurso(TURNOS, alas(23))
    expect(turno.fin.getTime() - turno.inicio.getTime()).toBe(8 * 3600_000)
  })

  it('a las 5:59 todavía es de noche; a las 6:00 ya es de mañana', () => {
    expect(turnoEnCurso(TURNOS, alas(5, 59)).clave).toBe('noche')
    expect(turnoEnCurso(TURNOS, alas(6)).clave).toBe('manana')
  })
})

describe('sin turnos configurados no se inventa ninguno', () => {
  it('con el horario vacío devuelve null, no un turno por defecto', () => {
    /*
     * Es la regla de `leerTurnos`, llevada hasta aquí: «un turno inventado
     * devolvería datos verdaderos de las horas equivocadas». `null` obliga a
     * quien llama a decir que no están configurados.
     */
    expect(turnoEnCurso({}, alas(9))).toBeNull()
    expect(turnoEnCurso(undefined, alas(9))).toBeNull()
    expect(turnoEnCurso(null, alas(9))).toBeNull()
  })

  it('un horario con huecos devuelve null en el hueco, no el turno más cercano', () => {
    // Una planta que sólo trabaja de día: a las 3:00 no hay turno, y decirlo es
    // más honesto que estirar el de mañana hasta cubrirlo.
    const soloDia = leerTurnos('manana=6-14,tarde=14-22')

    expect(turnoEnCurso(soloDia, alas(9)).clave).toBe('manana')
    expect(turnoEnCurso(soloDia, alas(3))).toBeNull()
  })
})
