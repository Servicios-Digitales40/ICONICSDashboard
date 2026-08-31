/**
 * Rutas del dictado por voz.
 *
 * La prueba que importa es la del 413: existe por un fallo real que ya se
 * arregló una vez y que la migración a Fastify reintrodujo —el socket se
 * cortaba antes de que la respuesta saliera, y el cliente veía un error de red
 * genérico en vez del motivo—. Sin esta prueba, el siguiente cambio en el
 * manejo del cuerpo lo trae de vuelta sin que nadie se entere.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { json, montarApp } from '../ayudas.mjs'

const { app } = await montarApp()
const { app: conVoz, config } = await montarApp({ IA_WHISPER_BASE: 'http://127.0.0.1:9' })

afterAll(async () => {
  await app.close()
  await conVoz.close()
})

describe('GET /api/voz', () => {
  it('dice que está apagado sin IA_WHISPER_BASE', async () => {
    const cuerpo = json(await app.inject({ method: 'GET', url: '/api/voz' }))
    expect(cuerpo.habilitado).toBe(false)
  })

  it('anuncia el tope de bytes para que el frontend corte antes de enviar', async () => {
    /*
     * Descubrir el tope con un 413 después de que alguien haya hablado tres
     * minutos es tirar los tres minutos.
     */
    const cuerpo = json(await app.inject({ method: 'GET', url: '/api/voz' }))
    expect(cuerpo.maxBytes).toBeGreaterThan(0)
  })
})

describe('POST /api/voz', () => {
  it('responde 503 y nombra la variable cuando está apagado', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/voz',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('audio'),
    })

    expect(respuesta.statusCode).toBe(503)
    expect(json(respuesta).error).toMatch(/IA_WHISPER_BASE/)
  })

  it('rechaza un cuerpo vacío con 400', async () => {
    const respuesta = await conVoz.inject({
      method: 'POST',
      url: '/api/voz',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.alloc(0),
    })
    expect(respuesta.statusCode).toBe(400)
  })

  it('el 413 LLEGA al cliente en vez de cortarle la conexión', async () => {
    /*
     * El fallo original: al pasarse del límite se destruía el socket, y con
     * 6 MB el cliente todavía está subiendo cuando eso ocurre — la respuesta
     * moría con la conexión y llegaba `ECONNRESET` en lugar del 413. Lo que se
     * comprueba aquí es que hay respuesta y que dice el motivo.
     */
    const respuesta = await conVoz.inject({
      method: 'POST',
      url: '/api/voz',
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(config.limits.maxAudioBytes + 4096),
      },
      payload: Buffer.alloc(config.limits.maxAudioBytes + 4096),
    })

    expect(respuesta.statusCode).toBe(413)
    expect(json(respuesta).error).toMatch(/supera el límite/i)
  })

  it('el mensaje del 413 dice el tope en MB, no en bytes', async () => {
    // Lo lee un operador en la pantalla, no un programador en un log.
    const respuesta = await conVoz.inject({
      method: 'POST',
      url: '/api/voz',
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(config.limits.maxAudioBytes + 4096),
      },
      payload: Buffer.alloc(config.limits.maxAudioBytes + 4096),
    })
    expect(json(respuesta).error).toMatch(/\d+ MB/)
  })
})
