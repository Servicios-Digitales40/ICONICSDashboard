/**
 * El diario de accionamientos (`lib/diario.mjs`, Plan 22 F3 · SEG-08).
 *
 * `verificar-backend.mjs` ya prueba el CAMINO —que cada orden a la bomba deje
 * su línea, con quién y con la confirmación de la relectura—. Lo que se prueba
 * aquí es lo que desde la ruta no se puede provocar sin treinta mil
 * accionamientos: la poda, que es la única operación que borra algo.
 *
 * Y es la que hay que vigilar, precisamente por eso. Una poda que se lleva de
 * más, o que se lleva algo sin decirlo, convierte el diario en algo peor que
 * no tenerlo: un registro que parece completo y no lo está.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { crearDiario } from '../lib/diario.mjs'

const temporales = []

async function rutaTemporal() {
  const dir = await mkdtemp(join(tmpdir(), 'diario-'))
  temporales.push(dir)
  return join(dir, 'diario.jsonl')
}

afterEach(async () => {
  while (temporales.length) {
    await rm(temporales.pop(), { recursive: true, force: true }).catch(() => {})
  }
})

/** Las líneas del archivo, ya parseadas. */
async function lineas(ruta) {
  const texto = await readFile(ruta, 'utf8')
  return texto.split('\n').filter(Boolean).map(l => JSON.parse(l))
}

describe('anotar', () => {
  it('añade una línea por entrada, con su instante, sin tocar las anteriores', async () => {
    const ruta = await rutaTemporal()
    const diario = crearDiario({ ruta })

    await diario.anotar({ resultado: 'cumplida', accion: 'encender' })
    await diario.anotar({ resultado: 'rechazada', accion: 'encender', motivo: 'nivel alto' })

    const escritas = await lineas(ruta)
    expect(escritas).toHaveLength(2)
    expect(escritas[0].accion).toBe('encender')
    expect(escritas[1].motivo).toBe('nivel alto')
    expect(new Date(escritas[0].instante).getTime()).not.toBeNaN()
  })

  it('crea la carpeta si no existe: el primer accionamiento no puede fallar por eso', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diario-'))
    temporales.push(dir)
    const ruta = join(dir, 'sin', 'crear', 'todavia', 'diario.jsonl')

    const { ok } = await crearDiario({ ruta }).anotar({ resultado: 'cumplida' })

    expect(ok).toBe(true)
    expect(await lineas(ruta)).toHaveLength(1)
  })

  it('no lanza cuando no puede escribir: la bomba ya se accionó', async () => {
    // Una ruta cuyo padre es un ARCHIVO, no una carpeta: `mkdir` falla y con
    // él la anotación. La orden ya se ejecutó, así que tumbar la petición
    // HTTP diría que falló algo que sí ocurrió.
    const ruta = await rutaTemporal()
    await writeFile(ruta, '')

    const { ok, error } = await crearDiario({ ruta: join(ruta, 'imposible.jsonl') })
      .anotar({ resultado: 'cumplida' })

    expect(ok).toBe(false)
    expect(typeof error).toBe('string')
  })

  it('veinte anotaciones a la vez dejan veinte líneas, no una', async () => {
    // El candado por ruta (Plan 20 F3). Sin él, dos `appendFile` concurrentes
    // sobre el mismo archivo pueden entrelazarse y romper una línea — y el
    // fallo no da error, sólo deja el diario con menos entradas.
    const ruta = await rutaTemporal()
    const diario = crearDiario({ ruta })

    await Promise.all(
      Array.from({ length: 20 }, (_, i) => diario.anotar({ resultado: 'cumplida', n: i }))
    )

    const escritas = await lineas(ruta)
    expect(escritas).toHaveLength(20)
    expect(new Set(escritas.map(e => e.n)).size).toBe(20)
  })
})

describe('poda', () => {
  it('con el archivo por debajo del tope no borra nada', async () => {
    const ruta = await rutaTemporal()
    const diario = crearDiario({ ruta, maxBytes: 1_000_000 })

    for (let i = 0; i < 5; i++) await diario.anotar({ resultado: 'cumplida', n: i })

    const escritas = await lineas(ruta)
    expect(escritas).toHaveLength(5)
    expect(escritas.some(e => e.tipo === 'poda')).toBe(false)
  })

  it('al pasar del tope quita las más viejas y DICE cuántas', async () => {
    const ruta = await rutaTemporal()
    // Un tope diminuto: cada entrada ronda los 60 bytes, así que a la cuarta
    // o quinta se dispara. Probar el mecanismo, no la cifra de producción.
    const diario = crearDiario({ ruta, maxBytes: 300 })

    for (let i = 0; i < 12; i++) await diario.anotar({ resultado: 'cumplida', n: i })

    const escritas = await lineas(ruta)
    const podas = escritas.filter(e => e.tipo === 'poda')

    expect(podas.length).toBeGreaterThan(0)
    expect(podas[0].descartadas).toBeGreaterThan(0)
    expect(podas[0].motivo).toMatch(/pasó de/)
    // Lo último anotado sigue estando: se va lo viejo, no lo reciente.
    expect(escritas.at(-1).n).toBe(11)
  })

  it('descarta primero por antigüedad, que es el criterio declarado', async () => {
    const ruta = await rutaTemporal()
    let ahora = new Date('2020-01-01T00:00:00.000Z')

    const diario = crearDiario({
      ruta,
      maxBytes: 200,
      diasRetencion: 30,
      ahora: () => ahora,
    })

    await diario.anotar({ resultado: 'cumplida', etiqueta: 'antigua' })

    // Un año después: la primera queda fuera de los 30 días de retención.
    ahora = new Date('2021-01-01T00:00:00.000Z')
    await diario.anotar({ resultado: 'cumplida', etiqueta: 'reciente-1' })
    await diario.anotar({ resultado: 'cumplida', etiqueta: 'reciente-2' })
    await diario.anotar({ resultado: 'cumplida', etiqueta: 'reciente-3' })

    const etiquetas = (await lineas(ruta)).map(e => e.etiqueta)
    expect(etiquetas).not.toContain('antigua')
    expect(etiquetas).toContain('reciente-3')
  })

  it('la línea de poda dice hasta cuándo llegaba lo que se llevó', async () => {
    const ruta = await rutaTemporal()
    const diario = crearDiario({ ruta, maxBytes: 250 })

    for (let i = 0; i < 10; i++) await diario.anotar({ resultado: 'cumplida', n: i })

    const poda = (await lineas(ruta)).find(e => e.tipo === 'poda')
    expect(poda).toBeDefined()
    // Sin esto, quien lea el diario sabe que faltan entradas pero no de qué
    // periodo — que es la mitad de la información que necesita.
    expect(new Date(poda.hasta).getTime()).not.toBeNaN()
  })
})

describe('leer', () => {
  it('sin archivo devuelve vacío: antes del primer accionamiento no hay nada que leer', async () => {
    expect(await crearDiario({ ruta: await rutaTemporal() }).leer()).toEqual([])
  })

  it('devuelve de la más reciente a la más antigua', async () => {
    const ruta = await rutaTemporal()
    const diario = crearDiario({ ruta })

    await diario.anotar({ n: 1 })
    await diario.anotar({ n: 2 })
    await diario.anotar({ n: 3 })

    expect((await diario.leer()).map(e => e.n)).toEqual([3, 2, 1])
  })

  it('una línea a medias sale como hueco y no tumba la lectura', async () => {
    const ruta = await rutaTemporal()
    const diario = crearDiario({ ruta })

    await diario.anotar({ n: 1 })
    await writeFile(ruta, (await readFile(ruta, 'utf8')) + '{"instante":"2026-09', { flag: 'w' })

    const leidas = await diario.leer()
    expect(leidas[0].tipo).toBe('ilegible')
    expect(leidas[1].n).toBe(1)
  })
})
