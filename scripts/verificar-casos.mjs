#!/usr/bin/env node
/**
 * scripts/verificar-casos.mjs
 * ------------------------------------------------------------------
 * El índice de casos previos (Plan 16 Fase 2, Fuente #3 del diagnóstico),
 * contra un servidor de embeddings de mentira y un `aprendizaje.json`
 * temporal — mismo criterio que `verificar-documentos.mjs` para el índice
 * de manuales, del que `casos.mjs` reutiliza el motor de embeddings y la
 * puntuación BM25 (`embeddings.mjs`, `bm25.mjs`).
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 *  - Que un caso de OTRO sistema nunca aparezca, ni con el embedding más
 *    parecido del mundo: el filtro por sistema va antes de puntuar.
 *  - Que `sistema` sea obligatorio: sin un valor explícito —ni siquiera
 *    `null`— la función se niega en vez de adivinar "todos".
 *  - Que BM25 encuentre una referencia de componente exacta («VF-02») que
 *    un embedding de mentira no distinguiría de cualquier otra.
 *  - Que una intervención ya procesada NUNCA se vuelva a embeber —ni al
 *    reiniciar el proceso—, porque una intervención no cambia de contenido.
 *  - Que un intento que NO funcionó (`resuelto:false`) se seguya
 *    encontrando, y que la respuesta lo diga.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-casos.mjs
 *
 * No necesita red, ni GPU, ni llama-server.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createIndiceCasos } from '../backend/ia/motor/casos.mjs'
import { crearIntervencion, VACIO as APRENDIZAJE_VACIO } from '../shared/eva/comun/aprendizaje.js'

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

/* ── servidor de embeddings falso ────────────────────────────────────── */

let peticiones = []
let romperSiguientes = 0

/**
 * Determinista, pero NO ciego al contenido: dos textos que comparten una
 * palabra de 6+ letras (aquí, referencias de componente tipo «VF-02» tras
 * quitarle el guion) comparten una parte del vector. Sin esto, la prueba de
 * «BM25 encuentra lo que el embedding no distingue» no demostraría nada:
 * un embedding puramente aleatorio también fallaría en distinguirlos, pero
 * por una razón distinta a la que se quiere probar.
 */
function vectorDeMentira(texto) {
  const normalizado = texto.toLowerCase().replace(/[^a-z0-9]/g, '')
  let h = 0
  for (let i = 0; i < normalizado.length; i++) h = (h * 31 + normalizado.charCodeAt(i)) >>> 0
  // Sólo los primeros 12 caracteres normalizados aportan al vector: dos
  // frases largas que sólo se diferencian en un componente al final dan
  // vectores casi idénticos — es la propiedad que se quiere para la prueba.
  const cabecera = normalizado.slice(0, 12)
  let h2 = 0
  for (let i = 0; i < cabecera.length; i++) h2 = (h2 * 31 + cabecera.charCodeAt(i)) >>> 0
  return [(h % 1000) / 1000, (h2 % 1000) / 1000]
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

/* ── almacén de aprendizaje temporal ─────────────────────────────────── */

const raiz = await mkdtemp(join(tmpdir(), 'verificar-casos-'))

async function almacenNuevo(intervenciones = []) {
  const ruta = join(raiz, `aprendizaje-${Math.random().toString(36).slice(2)}.json`)
  await writeFile(ruta, JSON.stringify({ ...APRENDIZAJE_VACIO, intervenciones }), 'utf8')
  return ruta
}

async function agregarIntervencion(ruta, datos, ahora = new Date()) {
  const bruto = JSON.parse(await readFile(ruta, 'utf8'))
  const nueva = crearIntervencion(datos, ahora)
  bruto.intervenciones.push(nueva)
  await writeFile(ruta, JSON.stringify(bruto), 'utf8')
  return nueva
}

/* ── casos de sonda ───────────────────────────────────────────────────── */

const CASO_TANQUE = {
  sistema: 'tanque',
  sintoma: 'La bomba giraba contra una salida cerrada, presión muy alta y caudal nulo.',
  causa: 'La válvula de impulsión VF-02 estaba agarrotada.',
  solucion: 'Se liberó la válvula de impulsión VF-02 y se lubricó el vástago.',
  origen: 'Técnico de turno',
}

const CASO_VIBRACIONES = {
  sistema: 'vibraciones',
  sintoma: 'El pico de aceleración del lado acople copiaba el valor eficaz.',
  causa: 'Configuración incorrecta del canal S1.',
  solucion: 'Se corrigió la configuración del canal S1 en el módulo SIPLUS.',
  origen: 'Técnico de turno',
}

console.log('\n── `sistema` es obligatorio ──────────────────────────────────')

await check('sin `sistema` en el objeto, lanza en vez de adivinar "todos"', async () => {
  const ruta = await almacenNuevo([])
  const indice = createIndiceCasos({ rutaAprendizaje: ruta })
  await assert.rejects(() => indice.buscarCasosSimilares({ texto: 'algo' }), TypeError)
})

await check('`sistema: null` sí es válido — "toda la planta"', async () => {
  const ruta = await almacenNuevo([])
  const indice = createIndiceCasos({ rutaAprendizaje: ruta })
  const r = await indice.buscarCasosSimilares({ sistema: null, texto: 'algo' })
  assert.deepEqual(r, [])
})

console.log('\n── El aislamiento entre sistemas no es opcional ─────────────')

await check('un caso de vibraciones NUNCA aparece al buscar en tanque, aunque sea idéntico', async () => {
  const ruta = await almacenNuevo()
  await agregarIntervencion(ruta, CASO_TANQUE)
  await agregarIntervencion(ruta, { ...CASO_VIBRACIONES, sintoma: CASO_TANQUE.sintoma, solucion: CASO_TANQUE.solucion })

  const indice = createIndiceCasos({ rutaAprendizaje: ruta })
  const resultados = await indice.buscarCasosSimilares({ sistema: 'tanque', texto: CASO_TANQUE.sintoma })

  assert.ok(resultados.length > 0, 'debía encontrar el caso del tanque')
  assert.ok(resultados.every(r => r.sistema === 'tanque'), 'se coló un caso de otro sistema')
})

console.log('\n── El aislamiento por riesgo (Plan 17 Fase 1, G1) ────────────')

await check('un caso de OTRO riesgo se excluye aunque sea del mismo sistema y el texto encaje', async () => {
  // Reproduce el escenario medido en la auditoría del 01-09-2026: un caso
  // guardado bajo `sobrepresion` no puede respaldar un diagnóstico de
  // `derrame`, aunque los dos sean del tanque y el texto se parezca.
  const ruta = await almacenNuevo()
  await agregarIntervencion(ruta, {
    ...CASO_TANQUE,
    disparador: { riesgoId: 'sobrepresion' },
  })

  const indice = createIndiceCasos({ rutaAprendizaje: ruta })
  const resultados = await indice.buscarCasosSimilares({
    sistema: 'tanque', riesgoId: 'derrame', texto: CASO_TANQUE.sintoma,
  })

  assert.deepEqual(resultados, [], 'un caso de sobrepresion no debía respaldar derrame')
})

await check('un caso del MISMO riesgo se sigue encontrando', async () => {
  const ruta = await almacenNuevo()
  await agregarIntervencion(ruta, {
    ...CASO_TANQUE,
    disparador: { riesgoId: 'bomba-sin-salida' },
  })

  const indice = createIndiceCasos({ rutaAprendizaje: ruta })
  const resultados = await indice.buscarCasosSimilares({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida', texto: CASO_TANQUE.sintoma,
  })

  assert.equal(resultados.length, 1)
})

await check('un caso SIN `disparador` (voz/chat) no se excluye: "no se sabe" no es "es de otro"', async () => {
  const ruta = await almacenNuevo()
  await agregarIntervencion(ruta, CASO_TANQUE) // sin disparador, como registrar_intervencion

  const indice = createIndiceCasos({ rutaAprendizaje: ruta })
  const resultados = await indice.buscarCasosSimilares({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida', texto: CASO_TANQUE.sintoma,
  })

  assert.equal(resultados.length, 1, 'un caso sin disparador debía seguir siendo candidato')
})

await check('sin `riesgoId` en la búsqueda, el comportamiento es el de siempre (toda la planta)', async () => {
  const ruta = await almacenNuevo()
  await agregarIntervencion(ruta, { ...CASO_TANQUE, disparador: { riesgoId: 'sobrepresion' } })

  const indice = createIndiceCasos({ rutaAprendizaje: ruta })
  const resultados = await indice.buscarCasosSimilares({ sistema: 'tanque', texto: CASO_TANQUE.sintoma })

  assert.equal(resultados.length, 1, 'sin riesgoId no debía excluirse nada por disparador')
})

console.log('\n── BM25 encuentra lo que el embedding no distingue ──────────')

await check('una referencia de componente exacta gana aunque el resto del texto sea parecido', async () => {
  const ruta = await almacenNuevo()
  await agregarIntervencion(ruta, CASO_TANQUE) // menciona VF-02
  await agregarIntervencion(ruta, {
    ...CASO_TANQUE,
    causa: 'El filtro de línea FIL-01 estaba colmatado.',
    solucion: 'Se limpió el filtro de línea FIL-01.',
  })

  const indice = createIndiceCasos({ embeddingBase, embeddingModelo: 'sonda-bm25', rutaAprendizaje: ruta })
  const resultados = await indice.buscarCasosSimilares({ sistema: 'tanque', texto: 'problema con VF-02' })

  assert.ok(resultados.length > 0)
  assert.match(resultados[0].solucion, /VF-02/, 'BM25 debía preferir el caso que de verdad menciona VF-02')
})

console.log('\n── Un intento que NO funcionó se sigue encontrando ──────────')

await check('resuelto:false aparece en los resultados, con su valor intacto', async () => {
  const ruta = await almacenNuevo()
  await agregarIntervencion(ruta, { ...CASO_TANQUE, resuelto: false })

  const indice = createIndiceCasos({ rutaAprendizaje: ruta })
  const resultados = await indice.buscarCasosSimilares({ sistema: 'tanque', texto: CASO_TANQUE.sintoma })

  assert.equal(resultados.length, 1)
  assert.equal(resultados[0].resuelto, false)
})

console.log('\n── Incremental: una intervención ya vista no se reembebe ────')

await check('agregar una intervención nueva no reembebe las que ya estaban', async () => {
  const ruta = await almacenNuevo()
  await agregarIntervencion(ruta, CASO_TANQUE)

  const indice = createIndiceCasos({ embeddingBase, embeddingModelo: 'sonda-incremental', rutaAprendizaje: ruta })
  await indice.recargar()
  assert.ok(peticiones.length > 0, 'la primera indexación sí debía embeber')

  await agregarIntervencion(ruta, { ...CASO_TANQUE, sintoma: 'Un síntoma completamente distinto y nuevo.' })
  peticiones = []
  await indice.recargar()

  assert.equal(peticiones.length, 1, 'sólo la intervención nueva debía pedir un embedding')
  for (const p of peticiones) {
    for (const t of p.textos) assert.ok(!t.includes('salida cerrada'), 'se reembebió la intervención vieja')
  }
})

console.log('\n── La caché persiste entre reinicios ────────────────────────')

await check('un segundo proceso contra la MISMA caché no vuelve a pedir nada', async () => {
  const ruta = await almacenNuevo()
  await agregarIntervencion(ruta, CASO_TANQUE)
  const rutaCache = join(raiz, `cache-${Math.random().toString(36).slice(2)}.json`)

  peticiones = []
  const primero = createIndiceCasos({
    embeddingBase, embeddingModelo: 'sonda-persistencia', rutaAprendizaje: ruta, rutaCache,
  })
  await primero.recargar()
  assert.ok(peticiones.length > 0)

  peticiones = []
  const segundo = createIndiceCasos({
    embeddingBase, embeddingModelo: 'sonda-persistencia', rutaAprendizaje: ruta, rutaCache,
  })
  await segundo.recargar()

  assert.equal(peticiones.length, 0, 'el vector ya estaba en la caché de disco')
})

console.log('\n── `estado()` cuenta lo que hay indexado ─────────────────────')

await check('total, modo e indexando reflejan la realidad', async () => {
  const ruta = await almacenNuevo()
  await agregarIntervencion(ruta, CASO_TANQUE)
  await agregarIntervencion(ruta, CASO_VIBRACIONES)

  const sinEmbeddings = createIndiceCasos({ rutaAprendizaje: ruta })
  await sinEmbeddings.recargar()
  assert.equal(sinEmbeddings.estado().total, 2)
  assert.equal(sinEmbeddings.estado().modo, 'BM25')
  assert.equal(sinEmbeddings.estado().indexando, false)

  const conEmbeddings = createIndiceCasos({ embeddingBase, embeddingModelo: 'sonda-estado', rutaAprendizaje: ruta })
  await conEmbeddings.recargar()
  assert.equal(conEmbeddings.estado().modo, 'embeddings + BM25')
})

console.log('\n── Archivar retira del índice sin borrar del archivo ─────────')

/**
 * La regresión que abrió `PATCH /api/casos/:id`.
 *
 * `asegurarAlDia` comparaba el RECUENTO de intervenciones, y era correcto
 * mientras la bitácora sólo apilara. Archivar es el peor caso posible para
 * esa comprobación: no cambia la longitud NI los ids, así que el recuento
 * no veía absolutamente nada y el índice seguía sirviendo un caso ya
 * retirado hasta el siguiente reinicio, sin un solo error por ningún lado.
 *
 * No hace falta esperar los 10 s de `MS_ENTRE_COMPROBACIONES`:
 * `ultimaComprobacion` arranca en 0, así que la PRIMERA búsqueda después de
 * cargar sí entra a comprobar. Es justo el momento en que se manifiesta.
 */
async function marcarArchivada(ruta, id, archivado) {
  const bruto = JSON.parse(await readFile(ruta, 'utf8'))
  for (const i of bruto.intervenciones) {
    if (i.id !== id) continue
    if (archivado) i.archivado = true
    else delete i.archivado
  }
  await writeFile(ruta, JSON.stringify(bruto), 'utf8')
}

await check('una intervención archivada deja de encontrarse', async () => {
  const ruta = await almacenNuevo()
  const caso = await agregarIntervencion(ruta, CASO_TANQUE)
  const indice = createIndiceCasos({ rutaAprendizaje: ruta })
  await indice.recargar()
  assert.equal(indice.estado().total, 1)

  await marcarArchivada(ruta, caso.id, true)

  const hallados = await indice.buscarCasosSimilares({
    sistema: 'tanque', texto: 'válvula de impulsión agarrotada',
  })
  assert.deepEqual(hallados, [], 'el caso archivado sigue respaldando diagnósticos')
  assert.equal(indice.estado().total, 0)
})

await check('archivar no cambia la longitud, y aun así el índice lo ve', async () => {
  const ruta = await almacenNuevo()
  const caso = await agregarIntervencion(ruta, CASO_TANQUE)
  const indice = createIndiceCasos({ rutaAprendizaje: ruta })
  await indice.recargar()

  await marcarArchivada(ruta, caso.id, true)

  // La condición que hacía ciega a la comprobación por recuento: mismo
  // número de registros antes y después. Si esta afirmación deja de ser
  // cierta, la prueba ya no prueba lo que dice probar.
  const bruto = JSON.parse(await readFile(ruta, 'utf8'))
  assert.equal(bruto.intervenciones.length, 1, 'la prueba sólo vale si la longitud no cambió')

  /*
   * La comprobación va DESPUÉS de una búsqueda, no antes: `estado()` sólo
   * informa de lo que hay en memoria y no dispara `asegurarAlDia()`. Quien
   * refresca el índice es la búsqueda, así que es ahí donde se manifiesta
   * —o no— que la huella detectó el archivado.
   */
  await indice.buscarCasosSimilares({ sistema: 'tanque', texto: 'lo que sea' })
  assert.equal(indice.estado().total, 0, 'el índice no detectó el archivado')
})

await check('devolver una intervención la vuelve a poner en el índice', async () => {
  const ruta = await almacenNuevo()
  const caso = await agregarIntervencion(ruta, CASO_TANQUE)
  const indice = createIndiceCasos({ rutaAprendizaje: ruta })
  await indice.recargar()

  await marcarArchivada(ruta, caso.id, true)
  await indice.recargar()
  assert.equal(indice.estado().total, 0)

  await marcarArchivada(ruta, caso.id, false)
  const devueltos = await indice.buscarCasosSimilares({
    sistema: 'tanque', texto: 'válvula de impulsión agarrotada',
  })
  assert.equal(devueltos.length, 1, 'archivar y devolver no es reversible')
  assert.equal(devueltos[0].id, caso.id)
})

await check('el texto de la intervención archivada queda intacto en disco', async () => {
  // Archivar no es editar: `sintoma`, `causa`, `solucion` y `fecha` siguen
  // siendo exactamente lo que se escribió. Es lo que separa esta baja de
  // reescribir la historia — ver `estaArchivada` en `aprendizaje.js`.
  const ruta = await almacenNuevo()
  const caso = await agregarIntervencion(ruta, CASO_TANQUE)
  await marcarArchivada(ruta, caso.id, true)

  const bruto = JSON.parse(await readFile(ruta, 'utf8'))
  const guardado = bruto.intervenciones.find(i => i.id === caso.id)
  assert.equal(guardado.sintoma, CASO_TANQUE.sintoma)
  assert.equal(guardado.causa, CASO_TANQUE.causa)
  assert.equal(guardado.solucion, CASO_TANQUE.solucion)
  assert.equal(guardado.fecha, caso.fecha)
  assert.equal(guardado.archivado, true)
})

/* ── Resultado ───────────────────────────────────────────────────────── */

embServer.close()
await rm(raiz, { recursive: true, force: true })

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/motor/casos.mjs.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: el índice de casos se mantiene.${c.reset}`)
