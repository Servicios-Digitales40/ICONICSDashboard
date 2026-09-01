#!/usr/bin/env node
/**
 * scripts/verificar-documentos.mjs
 * ------------------------------------------------------------------
 * Comprueba el índice de documentación (Plan 16 Fase 0) **sin llama-server
 * real**: un servidor de embeddings falso que cuenta cuántas peticiones
 * recibe y qué le llega en cada una, para poder afirmar cosas del tipo «un
 * archivo sin cambios no vuelve a pedir vector» — con el servidor real habría
 * que adivinarlo mirando logs.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 *  - Que reindexar NO vuelva a embeber fragmentos ya embebidos: ni los de un
 *    archivo sin cambios (indexado incremental), ni los que ya están en la
 *    caché de disco de un proceso anterior (caché persistente, sobrevive a
 *    un reinicio del backend).
 *  - Que el embebido vaya POR LOTES: N fragmentos nuevos son
 *    ceil(N / TAMANO_LOTE) peticiones, no N.
 *  - Que un lote que falla entero se reintente fragmento a fragmento, y que
 *    todos acaben con vector pese al primer fallo.
 *  - Que cambiar de modelo de embeddings invalide la caché en vez de mezclar
 *    vectores de dos modelos —que no comparten espacio semántico— bajo el
 *    mismo hash.
 *  - Que un archivo ilegible siga apareciendo en `ilegibles` aunque el que
 *    dispare la siguiente recarga sea OTRO archivo de la misma carpeta.
 *  - Que la búsqueda (BM25 y el híbrido con embeddings) siga encontrando lo
 *    que tiene que encontrar: el refactor de Fase 0 no toca `buscar()`, pero
 *    toca todo lo que la alimenta.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-documentos.mjs
 *
 * No necesita red, ni GPU, ni llama-server.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createIndiceDocumentos } from '../backend/ia/documentos.mjs'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

let passed = 0
const fallos = []

async function check(nombre, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(`${nombre} — ${error.message}`)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
  }
}

/*
 * `TAMANO_LOTE` de `backend/ia/documentos.mjs` no se exporta —es un detalle
 * de implementación—, así que se duplica aquí para poder predecir cuántas
 * peticiones debería costar embeber N fragmentos nuevos. Si cambia allí,
 * cambia aquí.
 */
const TAMANO_LOTE = 16

/* ── servidor de embeddings falso ────────────────────────────────────── */

/** Cada petición recibida, en orden: `{ textos, modelo }`. Se limpia entre
 *  pruebas con `peticiones.length = 0` para poder contar desde cero. */
let peticiones = []
/** Cuántas de las PRÓXIMAS peticiones deben fallar con 500, para probar el
 *  reintento fragmento a fragmento. */
let romperSiguientes = 0
/** Retraso artificial antes de contestar, para poder pillar `estado()` con
 *  una indexación en curso. */
let retrasoMs = 0

/** Determinista y barato: no hace falta que "signifique" nada para probar
 *  caché, lotes o indexado incremental — sólo que sea estable por texto. */
function vectorDeMentira(texto) {
  let h = 0
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0
  return [(h % 1000) / 1000, ((h >> 8) % 1000) / 1000, ((h >> 16) % 1000) / 1000]
}

const embServer = createServer(async (req, res) => {
  if (req.url !== '/v1/embeddings' || req.method !== 'POST') {
    res.writeHead(404).end()
    return
  }

  const trozos = []
  for await (const t of req) trozos.push(t)
  const cuerpo = JSON.parse(Buffer.concat(trozos).toString('utf8'))
  const textos = Array.isArray(cuerpo.input) ? cuerpo.input : [cuerpo.input]
  peticiones.push({ textos, modelo: cuerpo.model })

  if (retrasoMs) await new Promise(r => setTimeout(r, retrasoMs))

  if (romperSiguientes > 0) {
    romperSiguientes--
    res.writeHead(500).end('roto a propósito')
    return
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    data: textos.map((t, i) => ({ index: i, embedding: vectorDeMentira(t) })),
  }))
})
await new Promise(r => embServer.listen(0, '127.0.0.1', r))
const embeddingBase = `http://127.0.0.1:${embServer.address().port}`

/* ── carpetas y archivos de prueba ───────────────────────────────────── */

const raiz = await mkdtemp(join(tmpdir(), 'verificar-documentos-'))

async function carpetaNueva() {
  return mkdtemp(join(raiz, 'docs-'))
}

/** Texto de sobra para producir varios fragmentos (`TAMANO_FRAGMENTO` son 900
 *  caracteres): párrafos numerados y distintos entre sí para que no colapsen
 *  en uno solo por deduplicación de ningún tipo. */
function textoLargo(etiqueta, parrafos) {
  return Array.from(
    { length: parrafos },
    (_, i) => `${etiqueta} párrafo número ${i}. `.repeat(30)
  ).join('\n\n')
}

/** Un `.pdf` que no es un PDF de verdad: sin `stream`/`endstream`, así que
 *  `extraerTextoPdf` no saca ni una página y el archivo cae en `ilegibles`
 *  como «no contiene texto extraíble» — el mismo camino que un escaneo real,
 *  sin necesitar un PDF real para probarlo. */
const PDF_BASURA = '%PDF-1.4\nesto no tiene ni stream ni endstream\n%%EOF'

console.log('\n── Lo básico sigue funcionando ──────────────────────────────')

await check('BM25 encuentra el fragmento que toca', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'valvulas.txt'), 'La válvula de impulsión debe revisarse cada seis meses.')

  const indice = createIndiceDocumentos({ carpeta: dir })
  const resultados = await indice.buscar('válvula de impulsión')

  assert.equal(resultados.length, 1)
  assert.match(resultados[0].texto, /válvula de impulsión/)
})

await check('con embeddings, la búsqueda sigue devolviendo resultados con score', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'valvulas.txt'), 'La válvula de impulsión debe revisarse cada seis meses.')
  peticiones = []

  const indice = createIndiceDocumentos({
    carpeta: dir, embeddingBase, embeddingModelo: 'sonda-basico',
    rutaCache: join(dir, '.cache.json'),
  })
  const resultados = await indice.buscar('válvula de impulsión')

  assert.equal(resultados.length, 1)
  assert.ok(resultados[0].score > 0)
})

console.log('\n── El embebido va por lotes ─────────────────────────────────')

await check('N fragmentos nuevos son ceil(N / TAMANO_LOTE) peticiones, no N', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'manual.txt'), textoLargo('manual', 40))
  peticiones = []

  const indice = createIndiceDocumentos({
    carpeta: dir, embeddingBase, embeddingModelo: 'sonda-lotes',
    rutaCache: join(dir, '.cache.json'),
  })
  await indice.recargar()

  const totalFragmentos = indice.estado().documentos[0].fragmentos
  assert.ok(totalFragmentos > TAMANO_LOTE, 'la prueba necesita más de un lote para decir algo')
  assert.equal(peticiones.length, Math.ceil(totalFragmentos / TAMANO_LOTE))

  // Y cada petición de verdad llevó varios textos, no uno por llamada.
  assert.ok(peticiones[0].textos.length > 1)
})

console.log('\n── La caché persiste entre reinicios ────────────────────────')

await check('un segundo proceso contra la MISMA caché no vuelve a pedir nada', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'manual.txt'), textoLargo('persistencia', 10))
  const rutaCache = join(dir, '.cache.json')

  peticiones = []
  const primero = createIndiceDocumentos({
    carpeta: dir, embeddingBase, embeddingModelo: 'sonda-persistencia', rutaCache,
  })
  await primero.recargar()
  assert.ok(peticiones.length > 0, 'el primer proceso sí tuvo que embeber')

  // Un `createIndiceDocumentos` nuevo simula un reinicio del backend: no
  // hereda nada en memoria, sólo lo que hay en `rutaCache` en disco.
  peticiones = []
  const segundo = createIndiceDocumentos({
    carpeta: dir, embeddingBase, embeddingModelo: 'sonda-persistencia', rutaCache,
  })
  await segundo.recargar()

  assert.equal(peticiones.length, 0, 'todos los vectores deberían salir de la caché en disco')
  assert.equal(segundo.estado().documentos[0].fragmentos, primero.estado().documentos[0].fragmentos)
})

await check('cambiar de modelo de embeddings invalida la caché entera', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'manual.txt'), textoLargo('modelo', 5))
  const rutaCache = join(dir, '.cache.json')

  const conModeloA = createIndiceDocumentos({
    carpeta: dir, embeddingBase, embeddingModelo: 'modelo-A', rutaCache,
  })
  await conModeloA.recargar()
  const totalFragmentos = conModeloA.estado().documentos[0].fragmentos

  peticiones = []
  const conModeloB = createIndiceDocumentos({
    carpeta: dir, embeddingBase, embeddingModelo: 'modelo-B', rutaCache,
  })
  await conModeloB.recargar()

  // Vectores de un modelo no sirven para otro: se reembebe TODO, no se
  // mezclan los dos espacios semánticos bajo el mismo hash de texto.
  assert.equal(peticiones.length, Math.ceil(totalFragmentos / TAMANO_LOTE))

  const cacheEnDisco = JSON.parse(await readFile(rutaCache, 'utf8'))
  assert.equal(cacheEnDisco.modelo, 'modelo-B')
})

console.log('\n── El indexado es incremental por archivo ───────────────────')

await check('un archivo sin cambios no se vuelve a embeber cuando OTRO cambia', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'sin-cambios.txt'), textoLargo('estable', 3))
  const rutaCache = join(dir, '.cache.json')

  const indice = createIndiceDocumentos({
    carpeta: dir, embeddingBase, embeddingModelo: 'sonda-incremental', rutaCache,
  })
  await indice.recargar()

  // Llega un archivo nuevo a la misma carpeta.
  await writeFile(join(dir, 'nuevo.txt'), textoLargo('recien-llegado', 3))
  peticiones = []
  await indice.recargar()

  const fragmentosNuevoArchivo = indice.estado().documentos.find(d => d.archivo === 'nuevo.txt').fragmentos
  assert.equal(peticiones.length, Math.ceil(fragmentosNuevoArchivo / TAMANO_LOTE))

  // Ninguna de las peticiones de esta segunda recarga menciona el archivo
  // que no cambió — si lo hiciera, se estaría reembebiendo sin motivo.
  for (const p of peticiones) {
    for (const t of p.textos) assert.ok(!t.includes('estable'), 'el archivo sin cambios se reembebió')
  }
})

await check('modificar un archivo sólo reembebe SUS fragmentos', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'a.txt'), textoLargo('archivo-a', 3))
  await writeFile(join(dir, 'b.txt'), textoLargo('archivo-b', 3))
  const rutaCache = join(dir, '.cache.json')

  const indice = createIndiceDocumentos({
    carpeta: dir, embeddingBase, embeddingModelo: 'sonda-modificar', rutaCache,
  })
  await indice.recargar()

  // mtime tiene que moverse de verdad para que la huella cambie; escribir de
  // nuevo basta en casi todos los sistemas de archivos, pero por si acaso se
  // fuerza contenido distinto además.
  await writeFile(join(dir, 'a.txt'), textoLargo('archivo-a-editado', 3))
  peticiones = []
  await indice.recargar()

  assert.ok(peticiones.length > 0, 'el archivo editado sí debía reembeberse')
  for (const p of peticiones) {
    for (const t of p.textos) assert.ok(!t.includes('archivo-b'), 'se reembebió el archivo que no cambió')
  }
})

console.log('\n── Un archivo ilegible no se olvida ─────────────────────────')

await check('sigue en `ilegibles` aunque la siguiente recarga la dispare OTRO archivo', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'roto.pdf'), PDF_BASURA)
  await writeFile(join(dir, 'normal.txt'), 'primera versión')

  const indice = createIndiceDocumentos({ carpeta: dir })
  await indice.recargar()

  assert.equal(indice.estado().ilegibles.length, 1)
  assert.equal(indice.estado().ilegibles[0].archivo, 'roto.pdf')

  // Cambia el archivo normal; el roto no se toca.
  await writeFile(join(dir, 'normal.txt'), 'segunda versión, distinta')
  await indice.recargar()

  assert.equal(indice.estado().ilegibles.length, 1, 'el archivo roto desapareció de `ilegibles` sin motivo')
  assert.equal(indice.estado().ilegibles[0].archivo, 'roto.pdf')
})

console.log('\n── Un lote que falla se reintenta fragmento a fragmento ─────')

await check('el primer lote falla, el reintento uno-a-uno igual deja todo con vector', async () => {
  const dir = await carpetaNueva()
  // Corto a propósito: menos fragmentos que TAMANO_LOTE, para que sea UN
  // solo lote y el conteo de peticiones sea predecible.
  await writeFile(join(dir, 'fragil.txt'), textoLargo('fragil', 3))
  const rutaCache = join(dir, '.cache.json')

  const indice = createIndiceDocumentos({
    carpeta: dir, embeddingBase, embeddingModelo: 'sonda-fallo', rutaCache,
  })

  peticiones = []
  romperSiguientes = 1 // sólo el lote grande falla; los reintentos uno-a-uno pasan
  await indice.recargar()

  const totalFragmentos = indice.estado().documentos[0].fragmentos
  assert.ok(totalFragmentos <= TAMANO_LOTE, 'la prueba asume un solo lote')
  // 1 lote que falla + un reintento por fragmento.
  assert.equal(peticiones.length, 1 + totalFragmentos)

  // Y los vectores SÍ llegaron a la caché de disco pese al primer fallo.
  const cacheEnDisco = JSON.parse(await readFile(rutaCache, 'utf8'))
  assert.equal(Object.keys(cacheEnDisco.vectores).length, totalFragmentos)
})

console.log('\n── `estado()` cuenta si hay una indexación en curso ─────────')

await check('`indexando` es true mientras se embebe y false al terminar', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'lento.txt'), textoLargo('lento', 3))

  const indice = createIndiceDocumentos({
    carpeta: dir, embeddingBase, embeddingModelo: 'sonda-progreso',
    rutaCache: join(dir, '.cache.json'),
  })

  retrasoMs = 150
  const enCurso = indice.recargar()
  // Le da tiempo a que la petición HTTP esté en vuelo antes de mirar.
  await new Promise(r => setTimeout(r, 30))

  assert.equal(indice.estado().indexando, true)
  await enCurso
  retrasoMs = 0

  assert.equal(indice.estado().indexando, false)
  assert.equal(indice.estado().progreso, null)
})

/* ── Resultado ───────────────────────────────────────────────────────── */

embServer.close()
await rm(raiz, { recursive: true, force: true })

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/documentos.mjs.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: el índice de documentación se mantiene.${c.reset}`)
