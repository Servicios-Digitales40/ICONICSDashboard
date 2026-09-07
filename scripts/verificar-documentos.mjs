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
 * ── Y DESDE EL PLAN 22 F2 (SEG-10) ─────────────────────────────────
 *
 *  - Que sea la FIRMA del archivo y no su extensión la que decide qué parser
 *    corre: un `.pdf` que no empieza por `%PDF-` no llega a `pdfjs`.
 *  - Que un documento que pasa de los topes entre RECORTADO —no ilegible, que
 *    es lo contrario— y lo declare en `parciales`, incluso después de una
 *    recarga que él no disparó.
 *  - Que una extracción que no termina se corte por tiempo en vez de dejar un
 *    hilo vivo para siempre.
 *  - Y la afirmación de la fase: que **el bucle de eventos sigue atendiendo**
 *    mientras se extrae un documento pesado. Antes no lo hacía, y el síntoma
 *    era el tablero entero congelado mientras alguien subía un manual.
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
import { deflateRawSync } from 'node:zlib'
import { join } from 'node:path'

import { createIndiceDocumentos } from '../backend/ia/indices/documentos.mjs'

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
 * `TAMANO_LOTE` de `backend/ia/indices/documentos.mjs` no se exporta —es un detalle
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

/**
 * Un `.docx` de verdad, fabricado aquí (Plan 22 F2).
 *
 * ── POR QUÉ SE FABRICA Y NO SE GUARDA UNO EN EL ÁRBOL ──────────────
 *
 * Porque las tres guardas de esta fase se prueban con el TAMAÑO del
 * documento, y un archivo de siete megas en el repositorio para probar un
 * tope no lo justifica nadie. Además, generarlo deja escrito qué se está
 * probando: un ZIP con una única entrada `word/document.xml`, que es
 * exactamente lo que `extraerTextoDocx` busca por dentro.
 *
 * Es la cabecera local de un ZIP tal como la lee ese extractor: firma
 * `PK\x03\x04`, método 8 (deflate), tamaños en su sitio y el nombre a
 * continuación. Nada de directorio central: el lector no lo mira, y añadirlo
 * sería fabricar un ZIP más completo que el que el código necesita.
 */
function docxDeMentira(texto) {
  const xml = `<w:document><w:body>${texto
    .split('\n\n')
    .map(p => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
    .join('')}</w:body></w:document>`

  const nombre = Buffer.from('word/document.xml', 'latin1')
  const datos = deflateRawSync(Buffer.from(xml, 'utf8'))

  const cabecera = Buffer.alloc(30)
  cabecera.write('PK\x03\x04', 0, 'latin1')
  cabecera.writeUInt16LE(20, 4)              // versión mínima
  cabecera.writeUInt16LE(0, 6)               // sin banderas
  cabecera.writeUInt16LE(8, 8)               // método: deflate
  cabecera.writeUInt32LE(0, 14)              // CRC — el lector no lo comprueba
  cabecera.writeUInt32LE(datos.length, 18)   // tamaño comprimido
  cabecera.writeUInt32LE(xml.length, 22)     // tamaño original
  cabecera.writeUInt16LE(nombre.length, 26)
  cabecera.writeUInt16LE(0, 28)              // sin campo extra

  return Buffer.concat([cabecera, nombre, datos])
}

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

console.log('\n── El aislamiento por sistema no es opcional (Plan 17 G7) ────')

await check('un manual de OTRO sistema no aparece, aunque el texto encaje perfecto', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'tanque.txt'), textoLargo('valvula de impulsion agarrotada', 2))
  await writeFile(join(dir, 'vibraciones.txt'), textoLargo('valvula de impulsion agarrotada', 2))
  await writeFile(join(dir, '.manifiesto.json'), JSON.stringify({
    version: 1,
    manuales: [
      { id: 'm1', archivo: 'tanque.txt', sistema: 'tanque' },
      { id: 'm2', archivo: 'vibraciones.txt', sistema: 'vibraciones' },
    ],
  }))

  const indice = createIndiceDocumentos({ carpeta: dir, rutaCache: join(dir, '.cache.json') })
  const resultados = await indice.buscar('valvula de impulsion agarrotada', { sistema: 'tanque' })

  assert.ok(resultados.length > 0, 'debía encontrar el manual del tanque')
  assert.ok(resultados.every(f => f.archivo === 'tanque.txt'), 'se coló un manual de otro sistema')
})

await check('un manual SIN sistema asignado responde a los dos (toda la planta)', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'general.txt'), textoLargo('procedimiento de arranque general', 2))
  await writeFile(join(dir, '.manifiesto.json'), JSON.stringify({
    version: 1,
    manuales: [{ id: 'm1', archivo: 'general.txt', sistema: null }],
  }))

  const indice = createIndiceDocumentos({ carpeta: dir, rutaCache: join(dir, '.cache.json') })
  const paraTanque = await indice.buscar('procedimiento de arranque general', { sistema: 'tanque' })
  const paraVibraciones = await indice.buscar('procedimiento de arranque general', { sistema: 'vibraciones' })

  assert.ok(paraTanque.length > 0, 'un manual sin sistema debía respaldar al tanque también')
  assert.ok(paraVibraciones.length > 0, 'y a vibraciones también')
})

await check('sin manifiesto en la carpeta, nada se excluye (compatibilidad con lo que ya había)', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'sin-catalogar.txt'), textoLargo('procedimiento sin catalogar', 2))
  // Sin `.manifiesto.json`: archivos puestos a mano, de antes de que
  // existiera el catálogo (Plan 16 Fase 1).

  const indice = createIndiceDocumentos({ carpeta: dir, rutaCache: join(dir, '.cache.json') })
  const resultados = await indice.buscar('procedimiento sin catalogar', { sistema: 'tanque' })

  assert.ok(resultados.length > 0, 'un manual sin manifiesto no debía quedar invisible')
})

await check('sin pedir `sistema` en la búsqueda, el comportamiento es el de siempre', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'vibraciones.txt'), textoLargo('valvula de impulsion agarrotada', 2))
  await writeFile(join(dir, '.manifiesto.json'), JSON.stringify({
    version: 1,
    manuales: [{ id: 'm1', archivo: 'vibraciones.txt', sistema: 'vibraciones' }],
  }))

  const indice = createIndiceDocumentos({ carpeta: dir, rutaCache: join(dir, '.cache.json') })
  const resultados = await indice.buscar('valvula de impulsion agarrotada')

  assert.ok(resultados.length > 0, 'sin sistema pedido no debía excluirse nada')
})

console.log('\n── Los duplicados no inflan la cita (Plan 17 G8) ─────────────')

await check('dos archivos con el CONTENIDO idéntico no duplican el fragmento citado', async () => {
  const dir = await carpetaNueva()
  const texto = textoLargo('anexo de limites de proteccion', 1)
  // Dos nombres, mismo contenido byte a byte — el escenario medido en la
  // auditoría del 01-09-2026: dos PDF con nombres distintos, mismo hash.
  await writeFile(join(dir, 'Anexo_Limites_Proteccion.txt'), texto)
  await writeFile(join(dir, 'Anexo_Limites_Proteccion-2.txt'), texto)

  const indice = createIndiceDocumentos({ carpeta: dir, rutaCache: join(dir, '.cache.json') })
  const resultados = await indice.buscar('anexo de limites de proteccion', { top: 10 })

  const hashes = resultados.map(f => f.hash)
  assert.equal(new Set(hashes).size, hashes.length, 'dos fragmentos con el mismo hash no debían convivir en el resultado')
})

await check('dos archivos con contenido DISTINTO no se deduplican por error', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'a.txt'), textoLargo('contenido de a', 1))
  await writeFile(join(dir, 'b.txt'), textoLargo('contenido de b', 1))

  const indice = createIndiceDocumentos({ carpeta: dir, rutaCache: join(dir, '.cache.json') })
  const resultados = await indice.buscar('contenido', { top: 10 })

  const archivos = new Set(resultados.map(f => f.archivo))
  assert.equal(archivos.size, 2, 'dos archivos con contenido distinto debían seguir siendo dos resultados')
})


console.log('\n── Un binario no se abre en el hilo de planta (Plan 22 F2) ───')

await check('un `.pdf` que no empieza por %PDF- se rechaza por la FIRMA, sin llegar a pdfjs', async () => {
  const dir = await carpetaNueva()
  // Un ZIP renombrado: la extensión dice PDF, los bytes dicen otra cosa.
  await writeFile(join(dir, 'disfrazado.pdf'), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]))

  const indice = createIndiceDocumentos({ carpeta: dir })
  await indice.recargar()

  const [ilegible] = indice.estado().ilegibles
  assert.equal(ilegible?.archivo, 'disfrazado.pdf')
  assert.match(ilegible.motivo, /no es un PDF de verdad/)
  // El motivo importa: si dijera «no contiene texto extraíble» sería que el
  // archivo llegó a pdfjs igualmente y la firma no está haciendo nada.
  assert.doesNotMatch(ilegible.motivo, /escaneo|ToUnicode/)
})

await check('un `.docx` que no es un ZIP se rechaza igual, por su propia firma', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'falso.docx'), 'esto es texto plano con nombre de Word')

  const indice = createIndiceDocumentos({ carpeta: dir })
  await indice.recargar()

  assert.match(indice.estado().ilegibles[0]?.motivo ?? '', /no es un DOCX de verdad/)
})

await check('un PDF de VERDAD sigue pasando la firma y su camino no cambia', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'roto.pdf'), PDF_BASURA)

  const indice = createIndiceDocumentos({ carpeta: dir })
  await indice.recargar()

  // Empieza por `%PDF-`, así que la firma no lo para: cae donde caía antes,
  // en el lector, y con el motivo de siempre.
  assert.match(indice.estado().ilegibles[0]?.motivo ?? '', /escaneo|ToUnicode/)
})

await check('un `.txt` no necesita firma: la ausencia de regla no es un rechazo', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'nota.txt'), textoLargo('sin firma ninguna', 2))

  const indice = createIndiceDocumentos({ carpeta: dir })
  const resultados = await indice.buscar('sin firma ninguna')

  assert.ok(resultados.length > 0, 'un .txt normal dejó de indexarse')
  assert.equal(indice.estado().ilegibles.length, 0)
})

await check('la extracción que no termina se corta por tiempo, y lo dice', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'eterno.pdf'), PDF_BASURA)

  // `msMaximo: 0` dispara el reloj en el tick siguiente, antes de que el hilo
  // llegue siquiera a cargar sus módulos. Se prueba el MECANISMO del corte,
  // no cuánto tarda un PDF concreto — que sería afirmar temporización.
  const indice = createIndiceDocumentos({ carpeta: dir, topes: { msMaximo: 0 } })
  await indice.recargar()

  assert.match(indice.estado().ilegibles[0]?.motivo ?? '', /se cortó/)
})

await check('un documento que pasa del tope entra RECORTADO, no ilegible, y lo declara', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'enorme.docx'), docxDeMentira(textoLargo('procedimiento extenso', 60)))

  const indice = createIndiceDocumentos({ carpeta: dir, topes: { maxCaracteres: 2000 } })
  await indice.recargar()

  const estado = indice.estado()
  assert.equal(estado.ilegibles.length, 0, 'un archivo con DEMASIADO texto no es un archivo ilegible')
  assert.equal(estado.parciales.length, 1)
  assert.match(estado.parciales[0].motivo, /se cortó al pasar de/)

  // Y lo que entró se busca: recortar no es descartar.
  assert.ok((await indice.buscar('procedimiento extenso')).length > 0)
})

await check('el aviso de recorte sobrevive a una recarga que dispara OTRO archivo', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'enorme.docx'), docxDeMentira(textoLargo('capitulo largo', 60)))
  await writeFile(join(dir, 'normal.txt'), 'primera versión')

  const indice = createIndiceDocumentos({ carpeta: dir, topes: { maxCaracteres: 2000 } })
  await indice.recargar()
  assert.equal(indice.estado().parciales.length, 1)

  // El recortado no se toca; el otro sí. Como el recortado SÍ se cachea
  // —tiene fragmentos buenos—, no vuelve a pasar por la extracción: si el
  // aviso se hubiera anotado allí, aquí ya habría desaparecido.
  await writeFile(join(dir, 'normal.txt'), 'segunda versión, distinta')
  await indice.recargar()

  assert.equal(indice.estado().parciales.length, 1, 'el aviso de recorte se perdió al recargar por otro archivo')
  assert.equal(indice.estado().parciales[0].archivo, 'enorme.docx')
})

await check('el bucle de eventos sigue contestando mientras se extrae', async () => {
  const dir = await carpetaNueva()
  /*
   * Veinte mil párrafos: unos 15 MB de XML inflado, que inflar y limpiar
   * cuesta ~200 ms de CPU (medido el 07-09-2026: 226 ms). En el hilo
   * principal —donde esto corría antes del Plan 22 F2— ese cuarto de segundo
   * no atendía NADA: ni un temporizador, ni una lectura de planta, ni una
   * pantalla.
   *
   * El archivo pesa 0,18 MB en disco porque el texto es repetitivo y deflate
   * lo aplasta. Lo que cuesta no es leerlo, es procesarlo — que es justo la
   * distinción que `MAX_BYTES` por sí solo no podía hacer.
   */
  await writeFile(join(dir, 'pesado.docx'), docxDeMentira(textoLargo('parrafo de relleno', 20_000)))

  let latidos = 0
  const pulso = setInterval(() => { latidos += 1 }, 10)

  const indice = createIndiceDocumentos({ carpeta: dir, topes: { maxCaracteres: 50_000 } })
  const t0 = Date.now()
  await indice.recargar()
  const duracion = Date.now() - t0
  clearInterval(pulso)

  /*
   * La afirmación no es «tardó X» —eso sería temporización, y ya costó una
   * prueba intermitente en el Plan 20— sino «mientras tardaba, este hilo
   * seguía vivo». Un latido por cada 40 ms es la CUARTA parte de los que
   * caben: sobra margen para una máquina cargada, y sigue siendo imposible
   * de alcanzar si el hilo se bloquea, porque entonces son cero.
   */
  const esperados = Math.floor(duracion / 40)
  assert.ok(
    latidos >= esperados,
    `el hilo principal se quedó sordo: ${latidos} latidos en ${duracion} ms (se esperaban ${esperados}+)`
  )
})
/* ── Resultado ───────────────────────────────────────────────────────── */

embServer.close()
await rm(raiz, { recursive: true, force: true })

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/indices/documentos.mjs.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: el índice de documentación se mantiene.${c.reset}`)
