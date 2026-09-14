/**
 * La caché de lecturas en vivo, indexada POR PUNTO (Plan 21 F4).
 *
 * Igual que `historyCache.test.mjs`: se prueba contra `createIconicsClient` con
 * un `fetch` de mentira que apunta QUÉ PUNTOS se pidieron en cada salida. Lo
 * que hay que demostrar no es qué devuelve —eso ya lo cubre el contrato HTTP—
 * sino cuántas veces sale al servidor y con qué, que es justo lo que no se ve
 * desde fuera.
 *
 * ── LO QUE CAMBIÓ, DICHO COMO PRUEBA ───────────────────────────────
 *
 * Antes la clave era el CONJUNTO entero de puntos. Dos lecturas compartían
 * caché sólo si pedían exactamente lo mismo: una vista que mira ocho señales y
 * otra que mira seis de esas ocho no compartían nada. Ahora comparten los seis
 * y se pide sólo lo que falta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* El logger nace leyendo `LOG_LEVEL` en el import; ver `historyCache.test.mjs`. */
process.env.LOG_LEVEL = 'silent'

const { createIconicsClient } = await import('../iconics/client.mjs')
const { loadConfig } = await import('../config.mjs')

const AUTENTICADOR_FALSO = {
  authorizationHeaders: async () => ({}),
  hasValidToken: () => true,
}

/** Los puntos que se pidieron en cada salida al servidor, en orden. */
let salidas
let responder

function clienteDePrueba(extra = {}) {
  const config = loadConfig({
    ICONICS_API_BASE: 'https://planta.local/api',
    LOG_LEVEL: 'silent',
    ...extra,
  })
  return createIconicsClient(config, AUTENTICADOR_FALSO)
}

/** Una respuesta buena: un item por punto pedido. */
function respuestaBuena(puntos) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => puntos.map(p => ({ pointName: p, value: 1, quality: 0 })),
    text: async () => '',
  }
}

beforeEach(() => {
  salidas = []
  responder = respuestaBuena

  vi.stubGlobal('fetch', async (url, opciones) => {
    const puntos = JSON.parse(opciones.body).pointName
    salidas.push(puntos)
    return responder(puntos)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Todos los puntos pedidos al servidor, aplanados. */
const pedidos = () => salidas.flat()

describe('caché por punto', () => {
  it('dos lecturas del mismo conjunto siguen siendo UNA salida', async () => {
    // Es lo que ya hacía la caché por conjunto: no se pierde.
    const cliente = clienteDePrueba()

    await cliente.readPoints(['ac:A', 'ac:B'])
    await cliente.readPoints(['ac:A', 'ac:B'])

    expect(salidas).toHaveLength(1)
  })

  it('dos conjuntos que SE SOLAPAN sólo piden lo que falta', async () => {
    /*
     * El caso que la caché por conjunto no cubría, y que es el motivo de F4:
     * la vista completa y la que mira un solo activo comparten casi todos sus
     * puntos, y antes no compartían ni una lectura.
     */
    const cliente = clienteDePrueba()

    await cliente.readPoints(['ac:A', 'ac:B', 'ac:C'])
    await cliente.readPoints(['ac:B', 'ac:C', 'ac:D'])

    expect(salidas).toHaveLength(2)
    expect(salidas[0]).toEqual(['ac:A', 'ac:B', 'ac:C'])
    // Sólo el que faltaba.
    expect(salidas[1]).toEqual(['ac:D'])
  })

  it('un subconjunto de lo ya leído no sale al servidor en absoluto', async () => {
    const cliente = clienteDePrueba()

    await cliente.readPoints(['ac:A', 'ac:B', 'ac:C'])
    const r = await cliente.readPoints(['ac:B'])

    expect(salidas).toHaveLength(1)
    expect(r.ok).toBe(true)
    expect(r.payload['ac:B']).toBeTruthy()
  })

  it('devuelve el dato aunque venga de dos lotes distintos', async () => {
    // La respuesta se compone de varias lecturas: quien la recibe no tiene por
    // qué saber de cuántas salidas salió.
    const cliente = clienteDePrueba()

    await cliente.readPoints(['ac:A'])
    const r = await cliente.readPoints(['ac:A', 'ac:B'])

    expect(r.ok).toBe(true)
    expect(Object.keys(r.payload).sort()).toEqual(['ac:A', 'ac:B'])
  })

  it('dos lecturas a la vez con solape comparten la salida', async () => {
    // Se guarda la PROMESA del lote, así que quien llega mientras la llamada
    // está en vuelo espera a ésa en vez de arrancar la suya.
    const cliente = clienteDePrueba()

    const [r1, r2] = await Promise.all([
      cliente.readPoints(['ac:A', 'ac:B']),
      cliente.readPoints(['ac:A', 'ac:B']),
    ])

    expect(salidas).toHaveLength(1)
    expect(r1.ok && r2.ok).toBe(true)
  })

  it('un fallo NO se cachea: el siguiente vuelve a intentarlo', async () => {
    const cliente = clienteDePrueba()
    responder = () => ({
      ok: false,
      status: 500,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ detail: 'roto' }),
      text: async () => 'roto',
    })

    const fallida = await cliente.readPoints(['ac:A'])
    expect(fallida.ok).toBe(false)

    responder = respuestaBuena
    const buena = await cliente.readPoints(['ac:A'])

    expect(buena.ok).toBe(true)
    expect(salidas).toHaveLength(2)
  })

  it('si el lote que hacía falta falla, falla la LECTURA ENTERA', async () => {
    /*
     * Y no una respuesta parcial que se presente como buena. Quien pide ocho
     * señales y recibe seis sin saberlo pinta una pantalla con dos huecos que
     * parecen datos ausentes de la planta, cuando lo que pasó es que el puente
     * no pudo leer. Es el comportamiento de siempre y se conserva.
     */
    const cliente = clienteDePrueba()

    await cliente.readPoints(['ac:A'])

    responder = () => ({
      ok: false,
      status: 503,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ detail: 'caído' }),
      text: async () => 'caído',
    })

    const r = await cliente.readPoints(['ac:A', 'ac:B'])

    expect(r.ok).toBe(false)
    expect(r.status).toBe(503)
    /*
     * Y no se cuela el punto que SÍ estaba cacheado. `payload` en un sobre de
     * fallo lleva lo que dijo ICONICS —eso es de `request()` y no cambia—, lo
     * que no puede llevar es media lectura presentada como buena.
     */
    expect(r.payload?.['ac:A']).toBeUndefined()
  })

  it('un punto que el servidor no devuelve se omite, y no se vuelve a pedir', async () => {
    // Para el motor de sondeo eso es un hueco, que es lo que es. Y dentro de
    // la ventana no tiene sentido insistir: el servidor ya dijo lo que tenía.
    const cliente = clienteDePrueba()
    responder = puntos =>
      respuestaBuena(puntos.filter(p => p !== 'ac:FANTASMA'))

    const primera = await cliente.readPoints(['ac:A', 'ac:FANTASMA'])
    expect(primera.ok).toBe(true)
    expect(primera.payload['ac:FANTASMA']).toBeUndefined()
    expect(primera.payload['ac:A']).toBeTruthy()

    await cliente.readPoints(['ac:A', 'ac:FANTASMA'])
    expect(salidas).toHaveLength(1)
  })

  it('con BATCH_CACHE_TTL_MS=0 no se cachea nada', async () => {
    const cliente = clienteDePrueba({ BATCH_CACHE_TTL_MS: '0' })

    await cliente.readPoints(['ac:A'])
    await cliente.readPoints(['ac:A'])

    expect(salidas).toHaveLength(2)
  })

  it('pasada la ventana se vuelve a leer', async () => {
    vi.useFakeTimers()
    try {
      const cliente = clienteDePrueba({ BATCH_CACHE_TTL_MS: '2000' })

      await cliente.readPoints(['ac:A'])
      vi.setSystemTime(Date.now() + 2500)
      await cliente.readPoints(['ac:A'])

      expect(salidas).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('el coste deja de depender de cómo se agrupen las vistas', async () => {
    /*
     * La afirmación de F4, medida. Cinco vistas que miran subconjuntos
     * distintos de los mismos seis puntos: con la caché por CONJUNTO eran
     * cinco salidas —cinco claves distintas—; por punto es una sola, porque
     * después de la primera ya no falta nada.
     */
    const cliente = clienteDePrueba()
    const todos = ['ac:1', 'ac:2', 'ac:3', 'ac:4', 'ac:5', 'ac:6']

    await cliente.readPoints(todos)
    await cliente.readPoints(['ac:1', 'ac:2'])
    await cliente.readPoints(['ac:2', 'ac:3', 'ac:4'])
    await cliente.readPoints(['ac:5'])
    await cliente.readPoints(['ac:1', 'ac:6'])

    expect(salidas).toHaveLength(1)
    expect(pedidos()).toEqual(todos)
  })
})
