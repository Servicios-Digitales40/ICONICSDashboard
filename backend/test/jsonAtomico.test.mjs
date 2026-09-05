/**
 * Las dos garantías de `lib/jsonAtomico.mjs`, probadas por separado porque son
 * dos fallos distintos: el archivo a medias y la escritura perdida.
 *
 * La segunda es la que no se ve mirando el código: veinte llamadas
 * concurrentes que hacen leer-modificar-escribir sobre el mismo archivo tienen
 * que dejar veinte entradas, no una. Sin candado dejan una o dos, y ninguna da
 * error — que es exactamente por lo que hace falta una prueba y no una
 * revisión.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { conCandado, escribirAtomico, escribirJsonAtomico } from '../lib/jsonAtomico.mjs'

const temporales = []

async function carpetaTemporal() {
  const dir = await mkdtemp(join(tmpdir(), 'jsonatomico-'))
  temporales.push(dir)
  return dir
}

afterEach(async () => {
  while (temporales.length) {
    await rm(temporales.pop(), { recursive: true, force: true }).catch(() => {})
  }
})

describe('escribirAtomico', () => {
  it('escribe el contenido y no deja ningún temporal detrás', async () => {
    const dir = await carpetaTemporal()
    const ruta = join(dir, 'almacen.json')

    await escribirJsonAtomico(ruta, { hechos: ['uno'] })

    expect(JSON.parse(await readFile(ruta, 'utf8'))).toEqual({ hechos: ['uno'] })
    expect((await readdir(dir)).filter(f => f.endsWith('.tmp'))).toEqual([])
  })

  it('crea la carpeta si no existe', async () => {
    const dir = await carpetaTemporal()
    const ruta = join(dir, 'sub', 'carpeta', 'almacen.json')

    await escribirJsonAtomico(ruta, { ok: true })

    expect(JSON.parse(await readFile(ruta, 'utf8'))).toEqual({ ok: true })
  })

  it('un fallo al serializar deja INTACTO el contenido anterior', async () => {
    /*
     * Es la garantía que `writeFile` no daba: trunca el archivo antes de
     * escribir, así que un fallo entre el truncado y el último byte dejaba un
     * JSON roto donde había uno bueno. Aquí el fallo ocurre antes del
     * `rename`, y lo que hay en disco sigue siendo lo de antes.
     */
    const dir = await carpetaTemporal()
    const ruta = join(dir, 'almacen.json')
    await escribirJsonAtomico(ruta, { version: 1, hechos: ['el bueno'] })

    const ciclico = {}
    ciclico.yo = ciclico
    await expect(escribirJsonAtomico(ruta, ciclico)).rejects.toThrow()

    expect(JSON.parse(await readFile(ruta, 'utf8'))).toEqual({ version: 1, hechos: ['el bueno'] })
    expect((await readdir(dir)).filter(f => f.endsWith('.tmp'))).toEqual([])
  })

  it('acepta bytes, no sólo texto', async () => {
    // `subir()` y `reemplazar()` guardan PDF con esta misma función.
    const dir = await carpetaTemporal()
    const ruta = join(dir, 'manual.pdf')
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d])

    await escribirAtomico(ruta, bytes)

    expect(await readFile(ruta)).toEqual(bytes)
  })
})

describe('conCandado', () => {
  it('veinte leer-modificar-escribir concurrentes dejan las veinte entradas', async () => {
    const dir = await carpetaTemporal()
    const ruta = join(dir, 'almacen.json')
    await escribirJsonAtomico(ruta, { entradas: [] })

    const anadir = n =>
      conCandado(ruta, async () => {
        const almacen = JSON.parse(await readFile(ruta, 'utf8'))
        almacen.entradas.push(n)
        // El respiro es lo que hace visible la carrera: sin él, el bucle de
        // eventos podría no ceder entre la lectura y la escritura y la prueba
        // pasaría incluso sin candado.
        await new Promise(r => setTimeout(r, 1))
        await escribirJsonAtomico(ruta, almacen)
      })

    await Promise.all(Array.from({ length: 20 }, (_, i) => anadir(i)))

    const final = JSON.parse(await readFile(ruta, 'utf8'))
    expect(final.entradas).toHaveLength(20)
    expect([...final.entradas].sort((a, b) => a - b)).toEqual([...Array(20).keys()])
  })

  it('una tarea que falla no bloquea a las siguientes', async () => {
    const ruta = 'ruta-que-no-se-toca.json'
    const orden = []

    const rota = conCandado(ruta, async () => {
      orden.push('rota')
      throw new Error('a propósito')
    })
    const buena = conCandado(ruta, async () => {
      orden.push('buena')
      return 'lista'
    })

    await expect(rota).rejects.toThrow('a propósito')
    await expect(buena).resolves.toBe('lista')
    expect(orden).toEqual(['rota', 'buena'])
  })

  it('dos rutas distintas no se estorban', async () => {
    // El candado es por archivo. Si fuera global, guardar el manifiesto de
    // manuales pondría en cola la caché de embeddings sin ningún motivo.
    const orden = []
    const lenta = conCandado('a.json', async () => {
      await new Promise(r => setTimeout(r, 20))
      orden.push('lenta')
    })
    const rapida = conCandado('b.json', async () => {
      orden.push('rapida')
    })

    await Promise.all([lenta, rapida])
    expect(orden).toEqual(['rapida', 'lenta'])
  })

  it('un lector concurrente nunca ve el archivo a medias', async () => {
    /*
     * La garantía que se prueba es UNA: quien lea el archivo mientras se
     * escribe encuentra JSON válido SIEMPRE. Con `writeFile` directo, un
     * archivo de este tamaño se escribe en varios trozos y este bucle acababa
     * leyendo uno truncado; con `rename` no puede, porque el nombre definitivo
     * apunta a un contenido completo en todo momento.
     *
     * ── POR QUÉ SE TOLERA QUE UNA ESCRITURA FALLE ──────────────────────
     *
     * Porque en Windows `rename` falla mientras alguien tenga abierto el
     * destino, y eso NO viola la garantía de arriba: la escritura se niega en
     * voz alta con su código de error y el archivo se queda como estaba
     * —entero—. La cabecera de `lib/jsonAtomico.mjs` lo dice con esas
     * palabras: «falla ruidosamente y no corrompe nada, que es el intercambio
     * que se quiere».
     *
     * La primera versión de esta prueba exigía además que ninguna escritura
     * fallara, y eso la hacía INTERMITENTE: pasaba aislada y fallaba dentro de
     * la suite completa, según lo cargada que estuviera la máquina. Una prueba
     * intermitente es peor que ninguna — enseña a reintentar hasta el verde.
     * Así que se afirma el contrato y no una propiedad de temporización.
     */
    const dir = await carpetaTemporal()
    const ruta = join(dir, 'grande.json')
    const grande = { relleno: 'x'.repeat(200_000), n: 0 }
    await escribirJsonAtomico(ruta, grande)

    const BLOQUEADO = new Set(['EPERM', 'EBUSY', 'EACCES'])
    let leidas = 0
    let escritas = 0
    let bloqueadas = 0
    let ultimaEscrita = 0
    let corriendo = true

    const lector = (async () => {
      while (corriendo) {
        // Lanza si el archivo está a medias: ESA es la aserción.
        JSON.parse(await readFile(ruta, 'utf8'))
        leidas += 1
        await new Promise(r => setTimeout(r, 2))
      }
    })()

    for (let n = 1; n <= 20; n++) {
      try {
        await escribirJsonAtomico(ruta, { ...grande, n })
        escritas += 1
        ultimaEscrita = n
      } catch (error) {
        if (!BLOQUEADO.has(error?.code)) throw error
        bloqueadas += 1
      }
      await new Promise(r => setTimeout(r, 1))
    }
    corriendo = false
    await lector

    // El lector leyó de verdad, y ni una sola vez encontró basura.
    expect(leidas).toBeGreaterThan(3)
    // Y la mayoría de las escrituras entraron: si fallaran casi todas, el
    // reintento de `renombrarConReintento` estaría mal dimensionado y eso sí
    // sería un fallo que hay que ver.
    expect(escritas).toBeGreaterThan(10)
    expect(escritas + bloqueadas).toBe(20)

    // Lo que quedó en disco es una escritura COMPLETA, no un trozo.
    const final = JSON.parse(await readFile(ruta, 'utf8'))
    expect(final.n).toBe(ultimaEscrita)
    expect(final.relleno).toHaveLength(200_000)
  })
})

describe('el almacén de aprendizaje, de punta a punta', () => {
  it('dos escrituras concurrentes NO se pisan', async () => {
    /*
     * La regresión concreta que F3 arregla: `registrar_intervencion` desde el
     * asistente y `POST /api/casos` desde el cierre de diagnóstico son dos
     * peticiones que pueden solaparse, y antes la segunda borraba la primera
     * sin dar error — quien la dictó veía «queda anotado en la bitácora».
     */
    const { registrarCaso } = await import('../ia/herramientas/aprendizaje/index.mjs')
    const dir = await carpetaTemporal()
    const ruta = join(dir, 'aprendizaje.json')

    const casos = Array.from({ length: 10 }, (_, i) => ({
      sintoma: `sintoma ${i}`,
      solucion: `solucion ${i}`,
      sistema: 'tanque',
    }))

    const resultados = await Promise.all(casos.map(c => registrarCaso(c, { ruta })))

    expect(resultados.every(r => r.ok)).toBe(true)
    const almacen = JSON.parse(await readFile(ruta, 'utf8'))
    expect(almacen.intervenciones).toHaveLength(10)
  })

  it('un almacén corrupto no impide guardar: se parte de vacío', async () => {
    const { registrarCaso } = await import('../ia/herramientas/aprendizaje/index.mjs')
    const dir = await carpetaTemporal()
    const ruta = join(dir, 'aprendizaje.json')
    await writeFile(ruta, '{"intervenciones": [{"a"', 'utf8')

    const r = await registrarCaso({ sintoma: 's', solucion: 'q', sistema: 'tanque' }, { ruta })

    expect(r.ok).toBe(true)
    expect(JSON.parse(await readFile(ruta, 'utf8')).intervenciones).toHaveLength(1)
  })
})
