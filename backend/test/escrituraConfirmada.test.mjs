/**
 * Escribe y confirma (Plan 21 F5).
 *
 * ── QUÉ SE PROTEGE ─────────────────────────────────────────────────
 *
 * Que un `ok: true` del servidor deje de valer como prueba de que el PLC tomó
 * el valor. Son dos afirmaciones distintas —«aceptó la petición» y «la
 * instalación cambió»— y hasta F5 sólo `controlar_bomba` las distinguía.
 *
 * Se comprobó contra el tag real de esta demo: primero configurado como
 * «Static value» —aceptaba la escritura y seguía leyendo `true` siempre— y
 * luego como fuente en tiempo real con escaneo cada ~1 s, donde una relectura
 * inmediata puede traer el valor de antes del ciclo.
 *
 * ── Y QUE LA CONFIRMACIÓN INFORME, NO DECIDA ───────────────────────
 *
 * Una escritura aceptada y no confirmada sigue devolviendo `ok: true` con
 * `confirmada: false`. Quién trata eso como fallo depende de la consecuencia:
 * `controlar_bomba` lo convierte en un 409, la vista de Data lo enseña. Que el
 * cliente lo decidiera habría cambiado el contrato de `/api/iconics/write` sin
 * que nadie lo pidiera.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.LOG_LEVEL = 'silent'

const { createIconicsClient } = await import('../iconics/client.mjs')
const { loadConfig } = await import('../config.mjs')

const AUTENTICADOR_FALSO = {
  authorizationHeaders: async () => ({}),
  hasValidToken: () => true,
}

/** Lo que devolverá la próxima relectura de cada punto. */
let leeraComo
/** Cuántas veces se leyó cada punto. */
let lecturas

function clienteDePrueba(extra = {}) {
  const config = loadConfig({
    ICONICS_API_BASE: 'https://planta.local/api',
    LOG_LEVEL: 'silent',
    // Espera de 1 ms: lo que se prueba es el MECANISMO del reintento, no los
    // 800 ms medidos contra el tag real (ver `writeConfirmIntentos`).
    ...extra,
  })
  return createIconicsClient(config, AUTENTICADOR_FALSO)
}

function json(cuerpo) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => cuerpo,
    text: async () => '',
  }
}

beforeEach(() => {
  leeraComo = {}
  lecturas = {}

  vi.stubGlobal('fetch', async (url, opciones = {}) => {
    const u = String(url)

    if (opciones.method === 'POST' && u.includes('/Write')) {
      const items = JSON.parse(opciones.body)
      return json(items.map(i => ({ pointName: i.pointName, success: true })))
    }

    // Lectura: `GET /Data?pointName=...`
    const punto = new URL(u).searchParams.get('pointName')
    lecturas[punto] = (lecturas[punto] ?? 0) + 1

    const guion = leeraComo[punto]
    const valor = Array.isArray(guion)
      ? guion[Math.min(lecturas[punto] - 1, guion.length - 1)]
      : guion

    return json({ pointName: punto, value: valor, quality: 0 })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('writePoint confirma releyendo', () => {
  it('cuando el punto cambió, lo dice y no reintenta de más', async () => {
    const cliente = clienteDePrueba()
    leeraComo['ac:CONTROL'] = true

    const r = await cliente.writePoint('ac:CONTROL', true)

    expect(r.ok).toBe(true)
    expect(r.confirmada).toBe(true)
    expect(r.confirmacion).toMatchObject({
      pointName: 'ac:CONTROL',
      pedido: true,
      leido: true,
      coincide: true,
    })
    // Una sola relectura: no se gasta el presupuesto si ya coincide.
    expect(lecturas['ac:CONTROL']).toBe(1)
  })

  it('reintenta mientras el punto todavía no ha cambiado', async () => {
    /*
     * El caso medido: el tag escanea cada ~1 s y la primera relectura trae el
     * valor de antes del ciclo. Con 3 intentos de 700 ms se vieron falsos
     * rechazos sobre escrituras que SÍ entraron.
     */
    const cliente = clienteDePrueba({ WRITE_CONFIRM_ESPERA_MS: '1' })
    leeraComo['ac:CONTROL'] = [false, false, true]

    const r = await cliente.writePoint('ac:CONTROL', true)

    expect(r.confirmada).toBe(true)
    expect(lecturas['ac:CONTROL']).toBe(3)
  })

  it('agotado el presupuesto, informa SIN convertirlo en un fallo', async () => {
    const cliente = clienteDePrueba({ WRITE_CONFIRM_ESPERA_MS: '1' })
    leeraComo['ac:CONTROL'] = false

    const r = await cliente.writePoint('ac:CONTROL', true)

    // La escritura la aceptó el servidor: eso no se puede negar.
    expect(r.ok).toBe(true)
    // Pero no se confirma, y se dice con los tres datos.
    expect(r.confirmada).toBe(false)
    expect(r.confirmacion).toMatchObject({ pedido: true, leido: false, coincide: false })
  })

  it('compara por VALOR, no por forma', async () => {
    /*
     * El valor no vuelve como se mandó: se escribe el booleano `true` y
     * ICONICS puede devolverlo como `"True"` o como `1` según el tipo del tag.
     * Comparar con `===` daría «no coincide» sobre una escritura que sí entró,
     * y eso enseñaría a desconfiar de la confirmación.
     */
    const cliente = clienteDePrueba()

    leeraComo['ac:A'] = 'True'
    expect((await cliente.writePoint('ac:A', true)).confirmada).toBe(true)

    leeraComo['ac:B'] = 1
    expect((await cliente.writePoint('ac:B', true)).confirmada).toBe(true)

    leeraComo['ac:C'] = '0'
    expect((await cliente.writePoint('ac:C', false)).confirmada).toBe(true)

    leeraComo['ac:D'] = '42'
    expect((await cliente.writePoint('ac:D', 42)).confirmada).toBe(true)
  })

  it('un valor distinto de verdad NO se da por bueno', async () => {
    const cliente = clienteDePrueba({ WRITE_CONFIRM_ESPERA_MS: '1' })
    leeraComo['ac:A'] = 41

    expect((await cliente.writePoint('ac:A', 42)).confirmada).toBe(false)
  })
})

describe('writePoints confirma punto por punto', () => {
  it('un lote a medias se declara a medias, y dice cuál falló', async () => {
    // Es lo que hace útil el resultado POR PUNTO: «no se confirmó» sobre un
    // lote de diez no dice a cuál hay que volver.
    const cliente = clienteDePrueba({ WRITE_CONFIRM_ESPERA_MS: '1' })
    leeraComo['ac:A'] = 1
    leeraComo['ac:B'] = 0

    const r = await cliente.writePoints([
      { pointName: 'ac:A', value: 1 },
      { pointName: 'ac:B', value: 1 },
    ])

    expect(r.ok).toBe(true)
    expect(r.confirmada).toBe(false)
    expect(r.confirmacion).toHaveLength(2)
    expect(r.confirmacion.find(c => c.pointName === 'ac:A').coincide).toBe(true)
    expect(r.confirmacion.find(c => c.pointName === 'ac:B').coincide).toBe(false)
  })
})

describe('lo que la confirmación no cambia', () => {
  it('una escritura RECHAZADA por el servidor no se relee siquiera', async () => {
    // No hay nada que confirmar, y una relectura de más sobre un servidor que
    // acaba de fallar sólo suma latencia al error.
    vi.stubGlobal('fetch', async (url, opciones = {}) => {
      if (opciones.method === 'POST') {
        return {
          ok: false,
          status: 500,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ detail: 'no' }),
          text: async () => 'no',
        }
      }
      lecturas.relectura = (lecturas.relectura ?? 0) + 1
      return json({})
    })

    const cliente = clienteDePrueba()
    const r = await cliente.writePoint('ac:A', true)

    expect(r.ok).toBe(false)
    expect(lecturas.relectura).toBeUndefined()
  })

  it('se puede apagar cuando quien llama ya va a releer por su cuenta', async () => {
    const cliente = clienteDePrueba()
    leeraComo['ac:A'] = false

    const r = await cliente.writePoint('ac:A', true, { confirmar: false })

    expect(r.ok).toBe(true)
    expect(r.confirmacion).toBeNull()
    expect(lecturas['ac:A']).toBeUndefined()
  })
})
