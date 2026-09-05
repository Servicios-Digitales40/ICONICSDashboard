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
import { montarApp } from '../ayudas.mjs'
import { json } from '../ayudas.mjs'

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

  it('con el asistente montado dice qué modelo tiene puesto y cómo va la cola', async () => {
    // Es lo que se busca cuando alguien pregunta por qué una respuesta tardó
    // dos minutos. Sin esto hay que leer los logs del servidor.
    const { app } = await montarApp({
      IA_BASE: 'http://localhost:8080',
      IA_MODELOS: 'qwen-3.5-4B,qwen-3.5-9B',
    })
    const { servicios } = json(await app.inject({ method: 'GET', url: '/api/health' }))

    expect(servicios.asistente.estado).toBe('ok')
    expect(servicios.asistente.modelo).toBe('qwen-3.5-4B')
    expect(servicios.asistente.modelosDisponibles).toEqual(['qwen-3.5-4B', 'qwen-3.5-9B'])
    expect(servicios.asistente.cola).toEqual({ atendiendo: false, enEspera: 0 })
    expect(servicios.asistente.variable).toBeUndefined()

    await app.close()
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
