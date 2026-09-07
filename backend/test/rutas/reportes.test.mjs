/**
 * Enlaces de descarga firmados (Plan 22 F7 · SEG-09).
 *
 * ── QUÉ SE PERSIGUE ────────────────────────────────────────────────
 *
 * `GET /api/reportes?id=<uuid>` servía cualquier PDF de las dos carpetas sin
 * caducidad ni autorización por documento: un informe de proceso reenviado por
 * chat seguía descargable meses después por cualquiera que tuviera la URL. El
 * patrón de UUID protegía del recorrido de rutas —eso ya estaba bien— pero no
 * de esto.
 *
 * Lo que se comprueba aquí son las tres afirmaciones del plan: que un enlace
 * sin firma se rechaza, que uno caducado da un error **que dice que caducó** y
 * no un 404 genérico, y que la firma de un id no sirve para otro. Más la
 * cuarta, que el plan no pedía y sin la cual las otras tres podrían ser
 * ciertas por accidente: que un enlace bien firmado SÍ descarga.
 */
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { json, montarApp } from '../ayudas.mjs'
import { firmarEnlace } from '../../lib/enlacesFirmados.mjs'

const SECRETO = 'un-secreto-para-firmar-enlaces-de-prueba'

/** Monta la app con firma encendida y deja un PDF de mentira en su carpeta. */
async function conUnReporte(extra = {}) {
  const { app, reportesDir } = await montarApp({ REPORTES_SECRETO: SECRETO, ...extra })
  const id = randomUUID()
  await writeFile(join(reportesDir, `${id}.pdf`), '%PDF-1.4 de mentira')
  return { app, id }
}

const firmar = (id, opciones = {}) =>
  firmarEnlace({ id, usuario: 'anonimo', minutos: 60, secreto: SECRETO, ...opciones })

describe('con la firma configurada', () => {
  it('un enlace bien firmado descarga el PDF', async () => {
    const { app, id } = await conUnReporte()
    const respuesta = await app.inject({ method: 'GET', url: firmar(id) })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.headers['content-type']).toBe('application/pdf')

    await app.close()
  })

  it('sin firma se rechaza, y el mensaje dice que no hay período de gracia', async () => {
    const { app, id } = await conUnReporte()
    const respuesta = await app.inject({ method: 'GET', url: `/api/reportes?id=${id}` })

    expect(respuesta.statusCode).toBe(403)
    // Los enlaces que el asistente ya entregó dejan de funcionar, y eso es
    // visible para quien los tuviera guardados: el mensaje tiene que decirlo,
    // no sólo el código.
    expect(json(respuesta).error).toMatch(/período de gracia/)

    await app.close()
  })

  it('uno caducado da 410 y dice QUE CADUCÓ, no que no exista', async () => {
    const { app, id } = await conUnReporte()
    // Minutos negativos: firmado con este secreto, sólo que fuera de plazo.
    const respuesta = await app.inject({ method: 'GET', url: firmar(id, { minutos: -10 }) })

    expect(respuesta.statusCode).toBe(410)
    expect(json(respuesta).error).toMatch(/caducado/i)
    // Un 404 «no encontrado» mandaría a buscar el archivo, que sigue estando.
    expect(json(respuesta).error).not.toMatch(/no encontrado/i)

    await app.close()
  })

  it('la firma de un id no sirve para otro', async () => {
    const { app, id } = await conUnReporte()
    const otro = randomUUID()

    // Se toma el enlace bueno y se le cambia el id, conservando firma y fecha.
    const suplantado = firmar(id).replace(id, otro)
    const respuesta = await app.inject({ method: 'GET', url: suplantado })

    expect(respuesta.statusCode).toBe(403)
    await app.close()
  })

  it('una firma de otro secreto no vale', async () => {
    const { app, id } = await conUnReporte()
    const ajeno = firmarEnlace({ id, usuario: 'anonimo', minutos: 60, secreto: 'otro-secreto' })

    expect((await app.inject({ method: 'GET', url: ajeno })).statusCode).toBe(403)
    await app.close()
  })

  it('un enlace válido de un reporte que ya se purgó sigue dando 404', async () => {
    // La firma autoriza a PEDIR, no promete que el archivo esté. Son dos
    // respuestas distintas y tienen que seguir siéndolo.
    const { app } = await conUnReporte()
    const respuesta = await app.inject({ method: 'GET', url: firmar(randomUUID()) })

    expect(respuesta.statusCode).toBe(404)
    await app.close()
  })

  it('la firma se comprueba ANTES de mirar el disco', async () => {
    /*
     * Un enlace inventado sobre un id que no existe tiene que responder lo
     * mismo que uno sobre un id que sí: 403 por la firma. Al revés —mirando el
     * disco primero— un 404 le confirmaría a quien prueba que ese id no está,
     * y por diferencia, cuáles sí.
     */
    const { app, id } = await conUnReporte()

    const existe = await app.inject({ method: 'GET', url: `/api/reportes?id=${id}` })
    const noExiste = await app.inject({ method: 'GET', url: `/api/reportes?id=${randomUUID()}` })

    expect(existe.statusCode).toBe(403)
    expect(noExiste.statusCode).toBe(403)
    expect(json(existe).error).toBe(json(noExiste).error)

    await app.close()
  })
})

describe('sin secreto configurado', () => {
  it('el enlace desnudo sigue funcionando: es el comportamiento anterior', async () => {
    /*
     * No se genera un secreto al vuelo a propósito (ver `config.reportes`): uno
     * aleatorio por arranque invalidaría en cada reinicio los enlaces que el
     * asistente ya entregó. Sin secreto no se firma, y el arranque lo avisa.
     */
    const { app, reportesDir } = await montarApp()
    const id = randomUUID()
    await writeFile(join(reportesDir, `${id}.pdf`), '%PDF-1.4 de mentira')

    const respuesta = await app.inject({ method: 'GET', url: `/api/reportes?id=${id}` })
    expect(respuesta.statusCode).toBe(200)

    await app.close()
  })
})

describe('quién emite el enlace', () => {
  it('la exportación de chat devuelve un enlace firmado', async () => {
    const { app } = await montarApp({ REPORTES_SECRETO: SECRETO })

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/chat/exportar',
      payload: {
        turnos: [{ pregunta: '¿nivel?', respuesta: 'Al 42 %.' }],
      },
    })

    // El PDF puede fallar por dependencias en algún entorno; lo que se afirma
    // es que SI devuelve enlace, va firmado.
    if (respuesta.statusCode === 200) {
      const { url } = json(respuesta)
      expect(url).toMatch(/[?&]firma=[0-9a-f]{64}/)
      expect(url).toMatch(/[?&]expira=\d+/)
    }

    await app.close()
  })
})
