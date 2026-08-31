/**
 * Rutas del asistente, con foco en el flujo SSE.
 *
 * ── POR QUÉ ESTAS PRUEBAS ──────────────────────────────────────────
 *
 * El streaming es lo más frágil de la migración a Fastify. `POST /api/chat`
 * escribe eventos sobre el socket crudo durante minutos, y Fastify está
 * pensado para componer UNA respuesta y enviarla: por eso la ruta llama a
 * `reply.hijack()`. Si esa salida dejara de funcionar, el síntoma no sería un
 * error sino algo peor —la respuesta llegando de golpe al final en vez de
 * token a token—, que es justo lo que el SSE venía a evitar y lo que nadie
 * nota hasta que un operador dice que «el asistente va lento».
 *
 * Estas pruebas fijan el contrato del flujo: las cabeceras que impiden el
 * buffering en los proxies, y el formato `data: {json}\n\n` que el frontend
 * sabe leer.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { eventosSse, json, montarApp } from '../ayudas.mjs'

/*
 * Sin `IA_BASE` el asistente está apagado, que es el caso que se puede probar
 * sin un llama-server delante. Para el flujo de verdad se monta una app con
 * una base que no responde: el error también viaja por SSE, y lo que se
 * comprueba es el TRANSPORTE, no lo que diga el modelo.
 */
const { app } = await montarApp()
const { app: conIa } = await montarApp({
  // Un puerto donde no hay nada: la conexión se rechaza en milisegundos y el
  // fallo sale por el flujo, que es lo que se quiere observar.
  IA_BASE: 'http://127.0.0.1:9',
  IA_MODELO: 'modelo-de-prueba',
})

afterAll(async () => {
  await app.close()
  await conIa.close()
})

describe('GET /api/chat — estado del asistente', () => {
  it('dice que está apagado cuando no hay IA_BASE', async () => {
    const cuerpo = json(await app.inject({ method: 'GET', url: '/api/chat' }))
    expect(cuerpo.habilitado).toBe(false)
    expect(cuerpo.modelo).toBeNull()
  })

  it('informa del estado de la cola', async () => {
    const cuerpo = json(await app.inject({ method: 'GET', url: '/api/chat' }))
    expect(cuerpo).toHaveProperty('ocupado')
    expect(cuerpo).toHaveProperty('enEspera')
  })
})

describe('POST /api/chat — asistente apagado', () => {
  it('responde 503 y nombra la variable que falta', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { pregunta: '¿Cómo va el tanque?' },
    })

    expect(respuesta.statusCode).toBe(503)
    expect(json(respuesta).error).toMatch(/IA_BASE/)
  })

  it('NO devuelve el index.html de la SPA', async () => {
    /*
     * El motivo de montar el asistente siempre, incluso apagado: si la ruta no
     * existiera, la petición caería al respaldo de la SPA y el frontend
     * recibiría una página HTML con un 200 creyendo que es una respuesta.
     */
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { pregunta: 'hola' },
    })
    expect(respuesta.headers['content-type']).toMatch(/json/)
  })
})

describe('POST /api/chat — validación', () => {
  it('rechaza una pregunta vacía', async () => {
    const respuesta = await conIa.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { pregunta: '   ' },
    })
    expect(respuesta.statusCode).toBe(400)
    expect(json(respuesta).error).toMatch(/pregunta/i)
  })

  it('rechaza una pregunta demasiado larga', async () => {
    const respuesta = await conIa.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { pregunta: 'a'.repeat(3000) },
    })
    expect(respuesta.statusCode).toBe(400)
  })

  it('rechaza con la forma de error de la API', async () => {
    const cuerpo = json(
      await conIa.inject({ method: 'POST', url: '/api/chat', payload: {} })
    )
    // `{ ok: false, error }` es la forma que el frontend sabe leer; un error
    // con la forma nativa de Fastify le obligaría a distinguir dos.
    expect(cuerpo.ok).toBe(false)
    expect(typeof cuerpo.error).toBe('string')
  })
})

describe('POST /api/chat — el flujo SSE', () => {
  it('responde como event-stream, no como JSON', async () => {
    const respuesta = await conIa.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { pregunta: '¿Cómo va el tanque?' },
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.headers['content-type']).toMatch(/text\/event-stream/)
  })

  it('manda las cabeceras que impiden el buffering en los proxies', async () => {
    /*
     * `X-Accel-Buffering: no` es la que hizo falta descubrir: sin ella, IIS en
     * el servidor de planta acumula el flujo entero y lo entrega de golpe al
     * final. `no-transform` cubre el mismo riesgo en otros proxies.
     */
    const respuesta = await conIa.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { pregunta: 'hola' },
    })

    expect(respuesta.headers['x-accel-buffering']).toBe('no')
    expect(respuesta.headers['cache-control']).toMatch(/no-cache/)
    expect(respuesta.headers['cache-control']).toMatch(/no-transform/)
  })

  it('emite eventos con el formato que el frontend sabe leer', async () => {
    const respuesta = await conIa.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { pregunta: 'hola' },
    })

    const eventos = eventosSse(respuesta.body)
    expect(eventos.length).toBeGreaterThan(0)
    // Cada evento es un JSON con `tipo`: es el contrato con `useAsistente.js`.
    for (const evento of eventos) {
      expect(evento).toHaveProperty('tipo')
    }
  })

  it('manda el fallo por el flujo y no como código de estado', async () => {
    /*
     * Cuando llama-server no responde, la cabecera 200 ya salió: el flujo
     * estaba abierto. El error tiene que viajar COMO EVENTO, que es lo que el
     * frontend sabe pintar; cambiar el código de estado a esas alturas es
     * imposible y romper la conexión dejaría al operador sin explicación.
     */
    const respuesta = await conIa.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { pregunta: 'hola' },
    })

    const eventos = eventosSse(respuesta.body)
    const error = eventos.find(e => e.tipo === 'error')

    expect(error).toBeDefined()
    // El mensaje dice qué hacer, no sólo que falló.
    expect(error.mensaje).toMatch(/llama-server|asistente/i)
  })
})

describe('PUT /api/chat/modelo', () => {
  it('responde 503 si el asistente está apagado', async () => {
    const respuesta = await app.inject({
      method: 'PUT',
      url: '/api/chat/modelo',
      payload: { modelo: 'otro' },
    })
    expect(respuesta.statusCode).toBe(503)
  })

  it('rechaza un cuerpo sin modelo', async () => {
    const respuesta = await conIa.inject({
      method: 'PUT',
      url: '/api/chat/modelo',
      payload: {},
    })
    expect(respuesta.statusCode).toBe(400)
    expect(json(respuesta).error).toMatch(/modelo/i)
  })
})

describe('POST /api/chat/exportar', () => {
  it('rechaza una conversación vacía', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/chat/exportar',
      payload: { historial: [] },
    })
    expect(respuesta.statusCode).toBe(400)
    expect(json(respuesta).error).toMatch(/exportar/i)
  })

  it('rechaza un historial sin ningún turno aprovechable', async () => {
    // Los turnos que no son del usuario ni del asistente se descartan; el 400
    // llega sólo cuando no queda nada que poner en el documento.
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/chat/exportar',
      payload: { historial: [{ rol: 'marciano', texto: 'x' }] },
    })
    expect(respuesta.statusCode).toBe(400)
  })

  it('filtra los turnos de servicio y exporta el resto', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/chat/exportar',
      payload: {
        historial: [
          { rol: 'usuario', texto: '¿Cómo va el tanque?' },
          { rol: 'sistema', texto: 'se filtra' },
          { rol: 'asistente', texto: 'Al 58 %.' },
        ],
      },
    })
    expect(respuesta.statusCode).toBe(200)
    expect(json(respuesta).ok).toBe(true)
  })

  it('exporta una conversación válida', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/chat/exportar',
      payload: {
        historial: [
          { rol: 'usuario', texto: '¿Cómo va el tanque?' },
          { rol: 'asistente', texto: 'El nivel está al 62 %.' },
        ],
      },
    })

    expect(respuesta.statusCode).toBe(200)
    const cuerpo = json(respuesta)
    expect(cuerpo.ok).toBe(true)
    // La URL de descarga es la misma ruta de reportes: no hace falta otra.
    expect(cuerpo.url).toMatch(/^\/api\/reportes\?id=/)
  })
})
