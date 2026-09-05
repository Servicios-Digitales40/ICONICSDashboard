/**
 * La caché de historia YA CERRADA (Plan 20 F6).
 *
 * Se prueba contra `createIconicsClient` directamente, con un `fetch` de
 * mentira que CUENTA las salidas: lo que hay que demostrar no es qué devuelve
 * —eso ya lo cubre el contrato HTTP— sino cuántas veces sale al servidor, que
 * es justo lo que no se ve desde fuera.
 *
 * La regla que vigilan estas pruebas se puede decir en una frase: **entra en la
 * caché lo que ya no puede cambiar, y nada más.**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * El `logger` del módulo nace leyendo `LOG_LEVEL` en el import, así que esto
 * tiene que ir ANTES de importar el cliente. Sin ello, la prueba del fallo del
 * servidor —que provoca un 500 a propósito— escupe su traza de error en medio
 * de la salida de la suite y parece que algo se rompió.
 */
process.env.LOG_LEVEL = 'silent'

const { createIconicsClient } = await import('../iconics/client.mjs')
const { loadConfig } = await import('../config.mjs')

const AUTENTICADOR_FALSO = {
  authorizationHeaders: async () => ({}),
  hasValidToken: () => true,
}

/** Hace hora y media, para que quede holgadamente fuera del margen. */
const CERRADO = {
  startDate: new Date(Date.now() - 7200_000).toISOString(),
  endDate: new Date(Date.now() - 5400_000).toISOString(),
}

/** Una ventana que llega hasta ahora: el borde que el historiador aún escribe. */
const ABIERTO = {
  startDate: new Date(Date.now() - 3600_000).toISOString(),
  endDate: new Date().toISOString(),
}

const MUESTRAS = [{ timestamp: '2026-09-04T10:00:00Z', value: 42, quality: 192 }]

let salidas
let respuesta

function clienteDePrueba(extra = {}) {
  const config = loadConfig({
    ICONICS_API_BASE: 'https://planta.local/api',
    LOG_LEVEL: 'silent',
    ...extra,
  })
  return createIconicsClient(config, AUTENTICADOR_FALSO)
}

beforeEach(() => {
  salidas = []
  respuesta = () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => [{ historicalSamples: MUESTRAS }],
    text: async () => '',
  })

  vi.stubGlobal('fetch', async url => {
    salidas.push(String(url))
    return respuesta()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('caché de historia cerrada', () => {
  it('dos lecturas iguales de una ventana pasada son UNA salida', async () => {
    const cliente = clienteDePrueba()

    const primera = await cliente.readHistory({ pointName: 'hda:X', ...CERRADO })
    const segunda = await cliente.readHistory({ pointName: 'hda:X', ...CERRADO })

    expect(primera.data).toHaveLength(1)
    expect(segunda.data).toEqual(primera.data)
    expect(salidas).toHaveLength(1)
  })

  it('dos lecturas a la vez esperan a la MISMA salida', async () => {
    // Se guarda la promesa y no el resultado, igual que en `batchCache`: dos
    // pantallas que abren la misma vista no arrancan dos lecturas.
    const cliente = clienteDePrueba()

    await Promise.all([
      cliente.readHistory({ pointName: 'hda:X', ...CERRADO }),
      cliente.readHistory({ pointName: 'hda:X', ...CERRADO }),
    ])

    expect(salidas).toHaveLength(1)
  })

  it('una ventana que llega hasta AHORA no se cachea nunca', async () => {
    /*
     * El historiador escribe con retraso: la muestra de hace treinta segundos
     * puede no estar todavía. Cachear el borde congelaría un hueco que se iba
     * a llenar solo, y la gráfica se quedaría con él durante toda la vida de
     * la entrada.
     */
    const cliente = clienteDePrueba()

    await cliente.readHistory({ pointName: 'hda:X', ...ABIERTO })
    await cliente.readHistory({ pointName: 'hda:X', ...ABIERTO })

    expect(salidas).toHaveLength(2)
  })

  it('distingue por punto, por ventana y por agregado', async () => {
    const cliente = clienteDePrueba()

    await cliente.readHistory({ pointName: 'hda:X', ...CERRADO })
    await cliente.readHistory({ pointName: 'hda:Y', ...CERRADO })
    await cliente.readHistory({ pointName: 'hda:X', ...CERRADO, aggregate: 'Average' })
    await cliente.readHistory({ pointName: 'hda:X', ...CERRADO, interval: '01:00:00' })

    expect(salidas).toHaveLength(4)
  })

  it('un fallo del servidor no se cachea', async () => {
    // El siguiente en pedirlo tiene derecho a que se intente otra vez: una
    // caída momentánea no puede fijarse durante diez minutos.
    const cliente = clienteDePrueba()
    respuesta = () => ({
      ok: false,
      status: 500,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ detail: 'roto' }),
      text: async () => 'roto',
    })

    const fallida = await cliente.readHistory({ pointName: 'hda:X', ...CERRADO })
    expect(fallida.ok).toBe(false)

    respuesta = () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => [{ historicalSamples: MUESTRAS }],
      text: async () => '',
    })

    const buena = await cliente.readHistory({ pointName: 'hda:X', ...CERRADO })
    expect(buena.ok).toBe(true)
    expect(buena.data).toHaveLength(1)
    expect(salidas.length).toBeGreaterThan(1)
  })

  it('una serie TRUNCADA no se cachea', async () => {
    /*
     * Guardarla fijaría un recorte accidental —el de un momento en que el
     * servidor iba lento— durante toda la vida de la entrada, y las gráficas
     * siguientes heredarían esa cobertura sin ningún motivo.
     *
     * Se fuerza con un tope de una página y una continuación siempre presente:
     * la lectura corta por presupuesto y vuelve con `truncada: true`.
     */
    const cliente = clienteDePrueba({ HISTORY_MAX_PAGINAS: '1' })
    respuesta = () => ({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
        'x-ico-continuation': 'hay-mas',
      }),
      json: async () => [{ historicalSamples: MUESTRAS }],
      text: async () => '',
    })

    const primera = await cliente.readHistory({ pointName: 'hda:X', ...CERRADO })
    expect(primera.truncada).toBe(true)

    await cliente.readHistory({ pointName: 'hda:X', ...CERRADO })
    expect(salidas).toHaveLength(2)
  })

  it('con HISTORY_CACHE_TTL_MS=0 se desactiva entera', async () => {
    const cliente = clienteDePrueba({ HISTORY_CACHE_TTL_MS: '0' })

    await cliente.readHistory({ pointName: 'hda:X', ...CERRADO })
    await cliente.readHistory({ pointName: 'hda:X', ...CERRADO })

    expect(salidas).toHaveLength(2)
  })

  it('no crece por encima de su tope', async () => {
    const cliente = clienteDePrueba({ HISTORY_CACHE_MAX: '3' })

    // Cinco ventanas distintas, y después se repite la primera: ya no está.
    for (let i = 0; i < 5; i++) {
      await cliente.readHistory({ pointName: `hda:${i}`, ...CERRADO })
    }
    const antes = salidas.length
    await cliente.readHistory({ pointName: 'hda:0', ...CERRADO })

    expect(salidas.length).toBe(antes + 1)
  })
})
