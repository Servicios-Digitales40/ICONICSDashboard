/**
 * El contrato de `/api/health`, incluido lo que se le añadió en el Plan 20 F10.
 *
 * ── LO QUE ESTAS PRUEBAS PROTEGEN ──────────────────────────────────
 *
 * Dos cosas, y la primera es la que más se rompe sin querer:
 *
 *   1. Que los campos VIEJOS siguen ahí. `status`, `iconicsReachable`,
 *      `tokenValid` y `readOnly` los usan `scripts/verificar-backend.mjs`, la
 *      vista de Alarmas —que decide con `readOnly` si ofrecer el botón de
 *      reconocer— y la sonda del orquestador. F10 AÑADE `servicios`; si algún
 *      día se «reordena» la respuesta y se lleva uno de esos por delante, se
 *      rompe algo que no tiene nada que ver con esta pantalla.
 *   2. Que `ICONICS_FAKE` se declara. Es el estado en el que ningún dato es
 *      real y el único que la pantalla tiene que gritar.
 */
import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'

import { montarApp } from '../ayudas.mjs'
import { json } from '../ayudas.mjs'

/**
 * Un servidor que sólo existe para contestar. Hace de llama-server o de
 * whisper-server según a quién se le apunte: lo único que se comprueba de
 * ellos es que respondan HTTP.
 *
 * Es un servidor de VERDAD en un puerto de verdad, y no un `fetch` mockeado, a
 * propósito: el fallo que estas pruebas vigilan era precisamente que nadie
 * llamaba a nadie. Con el `fetch` sustituido, una comprobación que volviera a
 * no hacerse seguiría pasando.
 */
async function servidorDeMentira({ estado = 200 } = {}) {
  const server = createServer((_req, res) => {
    res.writeHead(estado, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: [] }))
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))

  return {
    base: `http://127.0.0.1:${server.address().port}`,
    cerrar: () => new Promise(r => server.close(r)),
  }
}

/**
 * Un puerto donde no hay nadie escuchando.
 *
 * 9 es `discard`, reservado por la IANA y que nadie levanta: contra 127.0.0.1
 * el sistema rechaza la conexión de inmediato (ECONNREFUSED), así que la
 * comprobación falla rápido y sin esperar al corte por tiempo. Un puerto alto
 * al azar podría estar ocupado por otra cosa y volver la prueba intermitente.
 */
const PUERTO_MUERTO = 9

describe('GET /api/health — los campos de siempre', () => {
  it('mantiene el contrato que ya usaban los guiones y la vista de alarmas', async () => {
    const { app } = await montarApp()
    const salud = json(await app.inject({ method: 'GET', url: '/api/health' }))

    for (const campo of ['status', 'version', 'iconicsReachable', 'tokenValid', 'readOnly', 'uptimeSeconds', 'timestamp']) {
      expect(salud, `falta el campo "${campo}"`).toHaveProperty(campo)
    }

    await app.close()
  })

  it('`/api/health/live` NO llama a ICONICS y sigue sin traer servicios', async () => {
    // Es la sonda del orquestador: corre cada pocos segundos para siempre, y
    // engordarla con el estado de cuatro servicios sería trabajo por nada.
    const { app } = await montarApp()
    const vivo = json(await app.inject({ method: 'GET', url: '/api/health/live' }))

    expect(vivo.status).toBe('ok')
    expect(vivo.servicios).toBeUndefined()

    await app.close()
  })
})

describe('GET /api/health — los dos relojes (Plan 21 F6)', () => {
  it('publica la zona del puente y la declarada para la planta', async () => {
    const { app } = await montarApp({ PLANTA_TZ: 'America/Mexico_City' })
    const { relojes } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(relojes.planta).toBe('America/Mexico_City')
    expect(typeof relojes.servidor).toBe('string')
    expect(relojes.plantaDeclarada).toBe(true)

    await app.close()
  })

  it('sin declarar, dice que se está DANDO POR HECHO que coinciden', async () => {
    /*
     * `plantaDeclarada: false` es el dato: no es que la planta esté en la zona
     * del servidor, es que nadie lo ha dicho y se está suponiendo. Con
     * `coinciden: true` a secas eso se leería como una comprobación.
     */
    const { app } = await montarApp()
    const { relojes } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(relojes.plantaDeclarada).toBe(false)
    expect(relojes.planta).toBe(relojes.servidor)
    expect(relojes.coinciden).toBe(true)

    await app.close()
  })

  it('avisa cuando el puente NO está en la zona de la planta', async () => {
    // La ventana de «ayer a las 12» se resuelve contra el reloj del puente, así
    // que con dos zonas distintas sale corrida y devuelve datos reales del
    // momento equivocado.
    const zonaAjena = Intl.DateTimeFormat().resolvedOptions().timeZone === 'UTC'
      ? 'America/Mexico_City'
      : 'UTC'
    const { app } = await montarApp({ PLANTA_TZ: zonaAjena })
    const { relojes } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(relojes.coinciden).toBe(false)

    await app.close()
  })

  it('el desfase con el historiador es `null`, y eso NO es cero', async () => {
    /*
     * Cero afirmaría que los relojes están sincronizados. `null` dice que no se
     * ha medido, y medirlo necesita la planta delante (Plan 26). Es §2.5
     * aplicada a un número.
     */
    const { app } = await montarApp()
    const { relojes } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(relojes.desfaseConHistorianMs).toBeNull()

    await app.close()
  })

  it('una zona horaria inventada impide arrancar', async () => {
    await expect(montarApp({ PLANTA_TZ: 'Marte/Olympus' })).rejects.toThrow(/zona horaria/i)
  })
})

describe('GET /api/health — los servicios (Plan 20 F10)', () => {
  it('declara los cuatro servicios', async () => {
    const { app } = await montarApp()
    const { servicios } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(Object.keys(servicios).sort()).toEqual(
      ['asistente', 'datos', 'dictado', 'documentacion']
    )

    await app.close()
  })

  it('GRITA que los datos son simulados con ICONICS_FAKE', async () => {
    /*
     * `montarApp` levanta con `ICONICS_FAKE=true`, que es justo el caso: un
     * puente sirviendo valores del simulador. Que eso se pueda leer desde
     * fuera es la razón principal de que este bloque exista.
     */
    const { app } = await montarApp()
    const { servicios } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(servicios.datos.estado).toBe('simulado')
    expect(servicios.datos.detalle).toMatch(/NINGÚN dato es real/)

    await app.close()
  })

  it('un servicio apagado dice CON QUÉ VARIABLE se enciende, y no es un error', async () => {
    const { app } = await montarApp()
    const { servicios } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(servicios.asistente.estado).toBe('no_configurado')
    expect(servicios.asistente.variable).toBe('IA_BASE')
    expect(servicios.dictado.variable).toBe('IA_WHISPER_BASE')
    expect(servicios.documentacion.variable).toBe('IA_DOCS_DIR')

    // «no_configurado» es un estado legítimo y permanente de una instalación
    // mínima: no puede compartir nombre con una avería.
    expect(servicios.asistente.estado).not.toBe('error')

    await app.close()
  })

  it('con el asistente EN PIE dice qué modelo tiene puesto y cómo va la cola', async () => {
    // Es lo que se busca cuando alguien pregunta por qué una respuesta tardó
    // dos minutos. Sin esto hay que leer los logs del servidor.
    const llama = await servidorDeMentira()
    const { app } = await montarApp({
      IA_BASE: llama.base,
      IA_MODELOS: 'qwen-3.5-4B,qwen-3.5-9B',
    })
    const { servicios } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(servicios.asistente.estado).toBe('ok')
    expect(servicios.asistente.modelo).toBe('qwen-3.5-4B')
    expect(servicios.asistente.modelosDisponibles).toEqual(['qwen-3.5-4B', 'qwen-3.5-9B'])
    expect(servicios.asistente.cola).toEqual({ atendiendo: false, enEspera: 0 })
    expect(servicios.asistente.variable).toBeUndefined()

    await app.close()
    await llama.cerrar()
  })

  it('sigue fuera del límite de peticiones', async () => {
    // Una pantalla de diagnóstico que se queda sin cuota justo cuando algo va
    // mal sería lo contrario de lo que se necesita.
    const { app } = await montarApp({ RATE_LIMIT_MAX: '2' })

    for (let i = 0; i < 5; i++) {
      const respuesta = await app.inject({ method: 'GET', url: '/api/health' })
      expect(respuesta.statusCode).toBe(200)
    }

    await app.close()
  })
})

/**
 * ── EL FALLO QUE ESTE BLOQUE VIGILA (07-09-2026) ───────────────────
 *
 * El panel daba el asistente y el dictado por FUNCIONANDO mientras el chat, en
 * la misma pantalla, contestaba «No se puede contactar con llama-server».
 * Comprobado con los dos servicios caídos: `/api/health` decía `ok` para
 * ambos.
 *
 * La causa era que `servicio()` equiparaba «configurado» con «funcionando» —
 * su parámetro `ok` tenía valor por defecto `true` y ningún llamador lo pasaba
 * nunca—, así que estos servicios NO SE CONTACTABAN JAMÁS. Una pantalla de
 * diagnóstico que se contradice con la pantalla que diagnostica es peor que no
 * tenerla.
 *
 * Estas pruebas levantan un servidor de mentira para el caso en pie, y apuntan
 * a un puerto muerto para el caso caído. Sin las dos mitades, «responde: true»
 * podría ser cierto por no estar comprobando nada.
 */
describe('salud — tener la variable puesta NO es estar funcionando', () => {
  it('el asistente configurado y CAÍDO sale como `no_responde`, no como `ok`', async () => {
    const { app } = await montarApp({ IA_BASE: `http://127.0.0.1:${PUERTO_MUERTO}` })
    const { servicios } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(servicios.asistente.estado).toBe('no_responde')
    // Y el motivo, que es lo accionable: sin él la pantalla sólo dice que algo
    // va mal, no si es que no hay nadie escuchando o si contestó un error.
    expect(servicios.asistente.detalle).toMatch(/No responde/)

    await app.close()
  }, 15_000)

  it('el dictado configurado y CAÍDO sale como `no_responde`', async () => {
    const { app } = await montarApp({ IA_WHISPER_BASE: `http://127.0.0.1:${PUERTO_MUERTO}` })
    const { servicios } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(servicios.dictado.estado).toBe('no_responde')

    await app.close()
  }, 15_000)

  it('el dictado EN PIE sale como `ok`', async () => {
    const whisper = await servidorDeMentira()
    const { app } = await montarApp({ IA_WHISPER_BASE: whisper.base })
    const { servicios } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(servicios.dictado.estado).toBe('ok')
    expect(servicios.dictado.idioma).toBe('es')

    await app.close()
    await whisper.cerrar()
  })

  it('un servicio que contesta un ERROR HTTP tampoco es `ok`', async () => {
    // Un llama-server a medio arrancar contesta 503. Está escuchando, así que
    // un simple «¿hay alguien en el puerto?» lo daría por bueno.
    const roto = await servidorDeMentira({ estado: 503 })
    const { app } = await montarApp({ IA_BASE: roto.base })
    const { servicios } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(servicios.asistente.estado).toBe('no_responde')
    expect(servicios.asistente.detalle).toMatch(/503/)

    await app.close()
    await roto.cerrar()
  })

  it('sin configurar sigue siendo `no_configurado`, que no es una avería', async () => {
    // La regresión fácil al arreglar esto: pasarse de frenada y pintar en rojo
    // una instalación mínima, que es legítima y permanente.
    const { app } = await montarApp()
    const { servicios } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(servicios.asistente.estado).toBe('no_configurado')
    expect(servicios.dictado.estado).toBe('no_configurado')

    await app.close()
  })

  it('el estado de los servicios NO cambia el `status` global', async () => {
    /*
     * `status` habla del puente contra ICONICS y lo usan la sonda del
     * orquestador y `verificar-backend.mjs`. Que whisper esté caído no puede
     * hacer que un contenedor sano se reinicie.
     *
     * Se comparan las DOS respuestas en vez de afirmar un valor concreto: cuál
     * sea `status` en modo falso depende del token de ICONICS y no de esto, y
     * clavarlo aquí ataría esta prueba a algo que no está comprobando.
     */
    const { app: sinWhisper } = await montarApp()
    const antes = json(await sinWhisper.inject({ method: 'GET', url: '/api/health' })).status
    await sinWhisper.close()

    const { app } = await montarApp({ IA_WHISPER_BASE: `http://127.0.0.1:${PUERTO_MUERTO}` })
    const salud = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(salud.servicios.dictado.estado).toBe('no_responde')
    expect(salud.status).toBe(antes)

    await app.close()
  }, 15_000)
})

describe('salud — contestar no es entregar datos', () => {
  it('sin ninguna lectura todavía, lo DICE en vez de pintarlo mal', async () => {
    // Un puente recién arrancado sin pantallas abiertas no ha leído nada, y eso
    // no es una avería. `null` no es cero.
    const { app } = await montarApp({ ICONICS_FAKE: 'false', ICONICS_API_BASE: 'https://planta.local/api' })
    const { servicios } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(servicios.datos.ultimaLectura).toBeNull()

    await app.close()
  })

  it('tras leer, publica cuántos puntos trajeron valor y con qué calidad', async () => {
    /*
     * Es el dato que faltaba para poder decir «el servidor contesta y no manda
     * datos», que es como estuvo esta tarjeta en verde mientras la planta no
     * entregaba nada.
     */
    const { app } = await montarApp()
    await app.inject({
      method: 'GET',
      url: '/api/iconics/data/batch?points=ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE',
    })

    const { servicios } = json(await app.inject({ method: 'GET', url: '/api/health' }))
    const ultima = servicios.datos.ultimaLectura

    expect(ultima).not.toBeNull()
    expect(ultima.puntosPedidos).toBe(1)
    expect(typeof ultima.conValor).toBe('number')
    expect(typeof ultima.conCalidadBuena).toBe('number')
    expect(typeof ultima.instante).toBe('string')

    await app.close()
  })
})
