/**
 * `GET /api/diario` — Plan 25 F1.
 *
 * ── QUÉ SE PRUEBA AQUÍ ─────────────────────────────────────────────
 *
 * El CONTRATO HTTP: que pagina sin repetir ni saltarse nada, que acota por
 * fechas, y que un rango imposible se rechaza en vez de contestar una lista
 * vacía —que se leería como «no pasó nada» (§2.4)—.
 *
 * La mecánica del archivo (JSONL, poda, línea a medias) es de `lib/diario.mjs`
 * y tiene su propia suite en `test/diario.test.mjs`. Aquí no se repite: lo
 * único que se comprueba de eso es que la propiedad que se eligió JSONL para
 * tener —un archivo cortado sigue siendo legible— llega de verdad hasta el
 * cliente HTTP, porque tenerla en la librería y perderla en la ruta sería
 * exactamente el fallo que nadie miraría.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { montarApp } from '../ayudas.mjs'

let apps = []

afterEach(async () => {
  for (const app of apps) await app.close()
  apps = []
})

/** Una app cuyo diario vive en un archivo temporal con `lineas` ya escritas. */
async function conDiario(lineas = []) {
  const dir = await mkdtemp(join(tmpdir(), 'iconics-diario-'))
  const ruta = join(dir, 'diario.jsonl')
  await writeFile(ruta, lineas.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + (lineas.length ? '\n' : ''), 'utf8')

  const { app } = await montarApp({ DIARIO_ACCIONAMIENTOS: ruta })
  apps.push(app)
  return { app, ruta }
}

/** `n` accionamientos, uno por hora, del más viejo al más nuevo. */
const accionamientos = (n, base = Date.parse('2026-09-10T00:00:00Z')) =>
  Array.from({ length: n }, (_, i) => ({
    instante: new Date(base + i * 3600_000).toISOString(),
    resultado: 'cumplida',
    accion: 'encender',
    ip: '10.0.0.5',
    usuario: 'operador1',
    n: i + 1,
  }))

const pedir = (app, query = '') =>
  app.inject({ method: 'GET', url: `/api/diario${query}` })

describe('GET /api/diario', () => {
  it('devuelve las entradas de la más reciente a la más antigua', async () => {
    const { app } = await conDiario(accionamientos(3))

    const r = await pedir(app)
    expect(r.statusCode).toBe(200)

    const { ok, entradas, total } = r.json()
    expect(ok).toBe(true)
    expect(total).toBe(3)
    expect(entradas.map((e) => e.n)).toEqual([3, 2, 1])
  })

  it('sin diario escrito todavía no es un error: es un turno sin accionamientos', async () => {
    const { app } = await conDiario([])

    const r = await pedir(app)
    expect(r.statusCode).toBe(200)
    expect(r.json().entradas).toEqual([])
    expect(r.json().total).toBe(0)
  })

  it('dos páginas encadenadas no repiten ni se saltan una entrada', async () => {
    /*
     * El fallo clásico de paginar, y no se ve mirando una sola página: una
     * investigación sobre por qué arrancó la bomba se apoya en que la lista
     * esté completa.
     */
    const { app } = await conDiario(accionamientos(10))

    const p1 = (await pedir(app, '?limite=4')).json()
    const p2 = (await pedir(app, `?limite=4&cursor=${p1.cursor}`)).json()
    const p3 = (await pedir(app, `?limite=4&cursor=${p2.cursor}`)).json()

    const vistas = [...p1.entradas, ...p2.entradas, ...p3.entradas].map((e) => e.n)
    expect(vistas).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(new Set(vistas).size).toBe(10)
    expect(p3.cursor).toBeNull()
  })

  it('acota por fecha', async () => {
    const base = Date.parse('2026-09-10T00:00:00Z')
    const { app } = await conDiario(accionamientos(10, base))

    const desde = new Date(base + 2 * 3600_000).toISOString()
    const hasta = new Date(base + 4 * 3600_000).toISOString()
    const r = await pedir(app, `?desde=${desde}&hasta=${hasta}`)

    expect(r.json().total).toBe(3)
    expect(r.json().entradas.map((e) => e.n)).toEqual([5, 4, 3])
  })

  it('un rango invertido se RECHAZA, no se contesta con una lista vacía', async () => {
    /*
     * §2.4: vacío significa «no pasó nada en esas horas», y eso es una
     * afirmación sobre la instalación. Un rango del revés es un error de quien
     * pregunta y tiene que decirse.
     */
    const { app } = await conDiario(accionamientos(3))

    const r = await pedir(app, '?desde=2026-09-11T00:00:00Z&hasta=2026-09-10T00:00:00Z')

    expect(r.statusCode).toBe(400)
    expect(r.json().ok).toBe(false)
  })

  it('una fecha que no es una fecha se rechaza con 400, no se ignora', async () => {
    const { app } = await conDiario(accionamientos(3))

    const r = await pedir(app, '?desde=el-martes')
    expect(r.statusCode).toBe(400)
  })

  it('el límite tiene techo: no se puede pedir el diario entero de una vez', async () => {
    const { app } = await conDiario(accionamientos(3))

    const r = await pedir(app, '?limite=99999')
    expect(r.statusCode).toBe(400)
  })

  it('una línea a medias llega como hueco declarado, no tumba la petición', async () => {
    /*
     * La propiedad por la que `lib/diario.mjs` eligió JSONL, comprobada de
     * extremo a extremo: tenerla en la librería y perderla en la ruta sería un
     * fallo que sólo aparece el día de un apagón.
     */
    const { app } = await conDiario([
      ...accionamientos(2),
      '{"instante":"2026-09-10T05:00:00Z","resulta',
    ])

    const r = await pedir(app)
    expect(r.statusCode).toBe(200)

    const { entradas } = r.json()
    expect(entradas.some((e) => e.tipo === 'ilegible')).toBe(true)
    // Y lo anterior sigue ahí: el hueco no se lleva por delante el resto.
    expect(entradas.some((e) => e.n === 2)).toBe(true)
  })

  it('cuenta las podas de la ventana: «no pasó nada» y «ya no se guarda» son distintos', async () => {
    const { app } = await conDiario([
      { instante: '2026-09-10T00:00:00Z', tipo: 'poda', descartadas: 120, hasta: '2026-09-01T00:00:00Z' },
      ...accionamientos(2, Date.parse('2026-09-10T01:00:00Z')),
    ])

    expect((await pedir(app)).json().podas).toBe(1)
  })
})
