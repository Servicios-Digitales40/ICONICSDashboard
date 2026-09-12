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
    const vacio = await crearDiario({ ruta: await rutaTemporal() }).leer()
    expect(vacio.entradas).toEqual([])
    expect(vacio.total).toBe(0)
    // `cursor: null` y no `0`: quien pagina no tiene que comparar con el total.
    expect(vacio.cursor).toBeNull()
  })

  it('devuelve de la más reciente a la más antigua', async () => {
    const ruta = await rutaTemporal()
    const diario = crearDiario({ ruta })

    await diario.anotar({ n: 1 })
    await diario.anotar({ n: 2 })
    await diario.anotar({ n: 3 })

    expect((await diario.leer()).entradas.map(e => e.n)).toEqual([3, 2, 1])
  })

  it('una línea a medias sale como hueco y no tumba la lectura', async () => {
    const ruta = await rutaTemporal()
    const diario = crearDiario({ ruta })

    await diario.anotar({ n: 1 })
    await writeFile(ruta, (await readFile(ruta, 'utf8')) + '{"instante":"2026-09', { flag: 'w' })

    const { entradas } = await diario.leer()
    expect(entradas[0].tipo).toBe('ilegible')
    expect(entradas[1].n).toBe(1)
  })
})

/**
 * ── PAGINAR Y ACOTAR (Plan 25 F1) ──────────────────────────────────
 *
 * Lo que `GET /api/diario` necesita y `leer()` no tenía. Lo que más importa
 * aquí es que dos páginas encadenadas **no repitan ni salten** una entrada: es
 * el fallo clásico de paginar sobre un archivo que crece, y no se ve mirando
 * una sola página.
 */
describe('leer: paginación y rango', () => {
  const diarioCon = async (n) => {
    const ruta = await rutaTemporal()
    const diario = crearDiario({ ruta })
    for (let i = 1; i <= n; i++) await diario.anotar({ n: i })
    return diario
  }

  it('dos páginas encadenadas no repiten ni se saltan ninguna entrada', async () => {
    const diario = await diarioCon(10)

    const p1 = await diario.leer({ limite: 4 })
    const p2 = await diario.leer({ limite: 4, cursor: p1.cursor })
    const p3 = await diario.leer({ limite: 4, cursor: p2.cursor })

    const vistas = [...p1.entradas, ...p2.entradas, ...p3.entradas].map(e => e.n)
    expect(vistas).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(new Set(vistas).size).toBe(10)
  })

  it('la última página cierra con cursor null, no con uno que no lleva a nada', async () => {
    const diario = await diarioCon(5)

    const p1 = await diario.leer({ limite: 3 })
    expect(p1.cursor).toBe(3)

    const p2 = await diario.leer({ limite: 3, cursor: p1.cursor })
    expect(p2.entradas).toHaveLength(2)
    expect(p2.cursor).toBeNull()
  })

  it('`total` cuenta el RANGO entero, no la página', async () => {
    const diario = await diarioCon(10)
    const { entradas, total } = await diario.leer({ limite: 3 })

    expect(entradas).toHaveLength(3)
    expect(total).toBe(10)
  })

  it('acota por fecha, y filtra ANTES de paginar', async () => {
    /*
     * El orden importa: filtrando después, una página de 50 podría quedarse en
     * 3 y parecer que no hay más, cuando el resto del rango está más atrás.
     */
    const ruta = await rutaTemporal()
    const base = new Date('2026-09-10T00:00:00Z').getTime()
    let i = 0
    // Una entrada por hora, las diez primeras horas del día.
    const diario = crearDiario({ ruta, ahora: () => new Date(base + (i++) * 3600_000) })
    for (let n = 1; n <= 10; n++) await diario.anotar({ n })

    const { entradas, total } = await diario.leer({
      desde: new Date(base + 2 * 3600_000),
      hasta: new Date(base + 4 * 3600_000),
    })

    expect(total).toBe(3)
    expect(entradas.map(e => e.n)).toEqual([5, 4, 3])
  })

  it('una entrada sin fecha legible NO se descarta al acotar: el hueco se ve', async () => {
    /*
     * §2.4. Una línea `ilegible` es la constancia de que algo se perdió;
     * filtrarla por fecha —que no tiene— la borraría justo del rango donde
     * alguien está investigando.
     */
    const ruta = await rutaTemporal()
    const diario = crearDiario({ ruta })
    await diario.anotar({ n: 1 })
    await writeFile(ruta, (await readFile(ruta, 'utf8')) + '{"instante":"2026-09', { flag: 'w' })

    const { entradas } = await diario.leer({
      desde: new Date('2030-01-01T00:00:00Z'),
      hasta: new Date('2030-01-02T00:00:00Z'),
    })

    expect(entradas.some(e => e.tipo === 'ilegible')).toBe(true)
  })
})
