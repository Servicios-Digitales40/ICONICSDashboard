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

import { estadoDeLosDatos } from '../../routes/systemRoutes.mjs'
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

describe('salud — una lectura que FALLÓ no es una lectura que nadie pidió', () => {
  /*
   * ── POR QUÉ ESTAS PRUEBAS SON UNITARIAS Y NO POR `inject()` ────────
   *
   * Porque para provocar el caso hace falta un ICONICS que se ALCANCE, con
   * token válido, y que aun así rechace las lecturas. Con `ICONICS_FAKE` no
   * falla nunca, y con una URL inalcanzable falla antes —`ping()` no llega— y
   * la tarjeta sale por la rama de «no se alcanza», que no es ésta.
   *
   * Montar un ICONICS de mentira sólo para esto sería un servidor entero para
   * comprobar tres `if`. Así que se prueba la función directamente: es pura,
   * recibe todo lo que mira, y lo que se comprueba es su CRITERIO.
   */
  const CONFIG = { iconics: { fake: false, readOnly: false, origin: 'https://planta.local' } }
  const ALCANZABLE = { reachable: true }

  const tarjeta = lecturas =>
    estadoDeLosDatos({
      config: CONFIG,
      connectivity: ALCANZABLE,
      tokenValid: true,
      lecturas,
      ahora: Date.parse('2026-09-09T10:00:30Z'),
    })

  const FALLO = { instante: '2026-09-09T10:00:00Z', motivo: 'ICONICS batch request failed.' }
  const BUENA = {
    instante: '2026-09-09T10:00:00Z',
    puntosPedidos: 8, conValor: 8, conCalidadBuena: 8,
  }

  it('sin ninguna lectura buena y con un fallo, es un ERROR — no «todavía nadie ha leído»', () => {
    /*
     * El caso medido el 09-09-2026: `fwxapi` devolvía 500 a todo y esta
     * tarjeta decía, en verde, que aún no se había pedido ninguna lectura.
     */
    const datos = tarjeta({ ultima: null, ultimoFallo: FALLO })

    expect(datos.estado).toBe('error')
    expect(datos.detalle).toMatch(/FALLÓ/)
    expect(datos.detalle).toContain('ICONICS batch request failed')
    /* Y sin el punto doble: el motivo ya trae el suyo. */
    expect(datos.detalle).not.toContain('failed..')
    expect(datos.detalle).not.toMatch(/todavía no se ha pedido/i)
    /* Y cuándo fue, para no tener que leer logs por SSH. */
    expect(datos.detalle).toMatch(/hace 30 s/)
    expect(datos.ultimoFallo).toEqual(FALLO)
  })

  /**
   * La sesión caducada tiene su propia frase, y no es un capricho (B9).
   *
   * ── EL INCIDENTE ───────────────────────────────────────────────────
   *
   * Medido el 11-09-2026 en un puente con casi ocho horas de marcha: ICONICS
   * había invalidado la sesión por su cuenta y devolvía la página de login de
   * OIDC —con un 200— a cada lectura. La pantalla decía «se alcanza el
   * servidor y el token es válido», porque `hasValidToken()` comprueba NUESTRO
   * reloj y nunca al servidor, y el operador salía a revisar una planta que
   * estaba perfectamente.
   *
   * El arreglo es distinto de cualquier otro fallo de lectura —renovar el
   * token, no mirar la red—, así que el mensaje tiene que decirlo con esas
   * palabras. Si esta prueba cae, la tarjeta volvió al genérico «la última
   * lectura FALLÓ» y con él a mandar a buscar la avería al sitio equivocado.
   */
  it('la sesión caducada se dice como tal, no como «la lectura falló»', () => {
    const datos = tarjeta({
      ultima: null,
      ultimoFallo: {
        instante: '2026-09-09T10:00:00Z',
        motivo: 'ICONICS pide reautenticación: la sesión caducó del lado del servidor.',
        reautenticacion: true,
      },
    })

    expect(datos.estado).toBe('error')
    expect(datos.plantilla.clave).toBe('needsReauth')
    expect(datos.detalle).toMatch(/REAUTENTICACIÓN/)
    /* Lo que hay que hacer, dicho: sin esto la frase describe y no resuelve. */
    expect(datos.detalle).toMatch(/reiniciando el puente/i)
    /* Y que NO caiga en el genérico, que es el fallo que esto corrige. */
    expect(datos.plantilla.clave).not.toBe('readFailed')
  })

  it('un fallo POSTERIOR a una lectura buena manda: el origen se acaba de caer', () => {
    const datos = tarjeta({
      ultima: { ...BUENA, instante: '2026-09-09T09:59:00Z' },
      ultimoFallo: FALLO,
    })

    expect(datos.estado).toBe('error')
    expect(datos.detalle).toMatch(/FALLÓ/)
  })

  it('una lectura buena POSTERIOR a un fallo manda: el origen ya se recuperó', () => {
    /*
     * La regresión que más importa de las tres. `ultimoFallo` no se borra
     * nunca, así que sin comparar instantes una avería de hace una hora
     * pintaría de rojo para siempre un origen sano — y un rojo que no se apaga
     * se aprende a ignorar igual de rápido que un verde que miente.
     */
    const datos = tarjeta({
      ultima: BUENA,
      ultimoFallo: { ...FALLO, instante: '2026-09-09T09:00:00Z' },
    })

    expect(datos.estado).toBe('ok')
    expect(datos.detalle).toMatch(/8\/8/)
    expect(datos.ultimoFallo).toBeUndefined()
  })

  it('sin fallo y sin lectura sigue siendo un arranque sano, no una avería', () => {
    const datos = tarjeta({ ultima: null, ultimoFallo: null })

    expect(datos.estado).toBe('ok')
    expect(datos.detalle).toMatch(/todavía no se ha pedido/i)
  })

  it('si NO se alcanza el servidor, eso manda sobre el fallo de lectura', () => {
    /*
     * Son dos averías distintas con dos arreglos distintos, y la de red es la
     * de fuera: decir «la lectura falló» cuando lo que pasa es que no hay
     * servidor mandaría a mirar el sitio equivocado.
     */
    const datos = estadoDeLosDatos({
      config: CONFIG,
      connectivity: { reachable: false, reason: 'timeout' },
      tokenValid: true,
      lecturas: { ultima: null, ultimoFallo: FALLO },
      ahora: Date.parse('2026-09-09T10:00:30Z'),
    })

    expect(datos.estado).toBe('error')
    expect(datos.detalle).toMatch(/No se alcanza/)
  })
})
