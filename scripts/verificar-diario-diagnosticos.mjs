#!/usr/bin/env node
/**
 * scripts/verificar-diario-diagnosticos.mjs — Plan 28 F2.
 *
 * ── QUÉ PROTEGE, Y POR QUÉ NO BASTA CON `diario.test.mjs` ───────────
 *
 * `backend/test/diario.test.mjs` ya prueba la MECÁNICA de `lib/diario.mjs`:
 * que una línea se añade sin reescribir el archivo, que la poda se anota, que
 * una línea cortada no tumba la lectura. Eso no hay que volver a probarlo —
 * este diario es el cuarto uso de la misma factoría, no un módulo nuevo.
 *
 * Lo que sí es nuevo, y sólo se puede comprobar de extremo a extremo, es la
 * promesa de la F2: **que todo diagnóstico deja línea, y que esa línea basta
 * para reconstruir la conclusión sin volver a preguntarle a ICONICS**. Son
 * dos cosas distintas y las dos se rompen en silencio:
 *
 *  · un consumidor nuevo del motor que no anote deja un hueco que nadie ve;
 *  · una línea a la que le falte el snapshot parece completa hasta el día que
 *    alguien la lee para investigar, seis meses después.
 *
 * ── SIN RED, CON `ICONICS_FAKE` ────────────────────────────────────
 *
 * Levanta la app entera con el transporte falso y un diario temporal. No toca
 * la planta ni el `datos/` real.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-diario-diagnosticos.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

const carpeta = await mkdtemp(join(tmpdir(), 'diag-diario-'))
const ruta = join(carpeta, 'diario-diagnosticos.jsonl')

process.env.ICONICS_FAKE = 'true'
process.env.DIARIO_DIAGNOSTICOS = ruta
process.env.LOG_LEVEL = 'ERROR'

const { loadConfig } = await import('../backend/config.mjs')
const { createApp } = await import('../backend/app.mjs')

const app = await createApp(loadConfig())
await app.ready()

/** Las líneas del diario, ya parseadas. */
async function leerDiario() {
  const texto = await readFile(ruta, 'utf8').catch(() => '')
  return texto.trim() ? texto.trim().split('\n').map((l) => JSON.parse(l)) : []
}

const pedir = (query) => app.inject({ method: 'GET', url: `/api/diagnostico?${query}` })

console.log('\n── Todo diagnóstico deja línea ────────────────────────────')

await check('un diagnóstico por HTTP queda anotado', async () => {
  await pedir('sistema=tanque&riesgoId=bomba-sin-salida')
  const lineas = await leerDiario()

  assert.equal(lineas.length, 1)
  assert.equal(lineas[0].riesgoId, 'bomba-sin-salida')
  assert.equal(lineas[0].sistema, 'tanque')
  assert.ok(lineas[0].instante, 'la línea tiene que ir fechada')
})

await check('un riesgo HUÉRFANO también se anota, no sólo los que dan causas', async () => {
  /*
   * «No había nada que diagnosticar» es un resultado, y es justo el que
   * alguien querrá poder revisar seis meses después —«¿por qué no dijo
   * nada?»—. Anotar sólo los diagnósticos con causas dejaría esa pregunta sin
   * respuesta y daría la impresión de que no se consultó.
   */
  const antes = (await leerDiario()).length
  await pedir('sistema=tanque&riesgoId=variador-en-manual')
  const lineas = await leerDiario()

  assert.equal(lineas.length, antes + 1)
  assert.equal(lineas.at(-1).huerfano, true)
  assert.deepEqual(lineas.at(-1).causas, [], 'un huérfano no inventa causas')
})

await check('una petición RECHAZADA no ensucia el diario', async () => {
  // Un `riesgoId` que no existe se rechaza antes de diagnosticar: no hubo
  // diagnóstico, así que no hay nada que auditar.
  const antes = (await leerDiario()).length
  const r = await pedir('sistema=tanque&riesgoId=no-existe')

  assert.equal(r.statusCode, 400)
  assert.equal((await leerDiario()).length, antes, 'un 400 no es un diagnóstico')
})

console.log('\n── La línea basta para reconstruir la conclusión ───────────')

await check('la línea lleva el veredicto de cada causa, con su banda y su respaldo', async () => {
  await pedir('sistema=tanque&riesgoId=derrame')
  const linea = (await leerDiario()).at(-1)

  assert.ok(linea.causas.length > 0)
  for (const causa of linea.causas) {
    assert.ok(causa.id, 'cada causa anotada se identifica')
    assert.ok(causa.banda, 'y trae su banda')
    assert.ok(causa.respaldo, 'y el desglose que la sostiene')
    assert.equal(typeof causa.respaldo.total, 'number')
  }
})

await check('la línea NO copia el catálogo: ni título ni componente', async () => {
  /*
   * El título y el componente de una causa viven en `causas.js` y no cambian.
   * Archivarlos en cada línea sería copiar el catálogo miles de veces para
   * guardar algo que ya está en el repositorio, con su historia de git.
   */
  const linea = (await leerDiario()).at(-1)
  for (const causa of linea.causas) {
    assert.equal(causa.titulo, undefined)
    assert.equal(causa.componente, undefined)
  }
})

await check('el snapshot viaja dentro, con las referencias que sostienen la cita', async () => {
  const linea = (await leerDiario()).at(-1)

  assert.ok(linea.snapshot, 'sin snapshot la línea no se puede auditar')
  assert.equal(linea.snapshot.riesgoId, linea.riesgoId)
  assert.equal(linea.snapshot.diagnosticEventId, linea.diagnosticEventId)
  assert.ok(Array.isArray(linea.snapshot.fragmentosManual))
  assert.ok(Array.isArray(linea.snapshot.casosConsultados))
})

await check('las lecturas de sensores llegan al diario cuando quien pregunta las trae', async () => {
  const valores = encodeURIComponent(JSON.stringify({ presionRelativa: 3.1, cargaMotor: 55 }))
  await pedir(`sistema=tanque&riesgoId=bomba-sin-salida&valoresSensores=${valores}`)
  const linea = (await leerDiario()).at(-1)

  assert.equal(linea.snapshot.valoresSensores.presionRelativa, 3.1)
  assert.equal(linea.snapshot.valoresSensores.cargaMotor, 55)
  /*
   * Y su calidad, que es el insumo de la F4: un número pelado se archiva como
   * «no consta», nunca como calidad buena (§2.4).
   */
  assert.equal(linea.snapshot.calidades.cargaMotor.consta, false)
})

await check('se anota cuánto tardó: una regresión de latencia se ve en el diario', async () => {
  const linea = (await leerDiario()).at(-1)
  assert.equal(typeof linea.duracionMs, 'number')
  assert.ok(linea.duracionMs >= 0)
})

console.log('\n── Las métricas salen del diario (Plan 28 F7) ──────────────')

await check('los agregados CUADRAN entre sí, no se contradicen', async () => {
  /*
   * ── EL DEFECTO QUE ESTA COMPROBACIÓN CAZÓ AL ESCRIBIRLA ───────────
   *
   * La primera versión daba «3 completos» y a la vez «manual caído en 2»:
   * dos afirmaciones contradictorias sacadas del MISMO archivo. La causa era
   * que el envoltorio del diario se escribió en la F2, antes de que la F3
   * añadiera `estado`, y nadie lo trajo al diario — así que la métrica caía a
   * un «completo» por defecto que nadie había medido.
   *
   * Es la clase de defecto que sólo aparece cuando algo LEE lo que se
   * escribió. Guardar de menos no se nota hasta que alguien pregunta.
   */
  const r = await app.inject({ method: 'GET', url: '/api/diagnostico/metricas' })
  assert.equal(r.statusCode, 200)
  const m = r.json()

  const sumaEstados = Object.values(m.porEstado).reduce((a, b) => a + b, 0)
  assert.equal(sumaEstados, m.total, 'todo diagnóstico tiene que caer en algún estado')

  const caidos = Object.values(m.fuentesCaidas).reduce((a, b) => a + b, 0)
  if (caidos > 0) {
    assert.ok(
      (m.porEstado.parcial ?? 0) + (m.porEstado.insuficiente ?? 0) > 0,
      'hay fuentes caídas pero ningún diagnóstico parcial ni insuficiente'
    )
  }
})

await check('un estado que NO se declaró no se cuenta como completo', async () => {
  /*
   * Una línea escrita antes de la F3 no sabe su estado. Darla por completa
   * afirmaría algo que no se midió (§2.4), así que se cuenta aparte y con un
   * nombre que se ve.
   */
  const { resumirDiagnosticos } = await import('../backend/ia/motor/metricas.mjs')
  const r = resumirDiagnosticos([{ tipo: 'diagnostico', sistema: 'tanque' }])

  assert.equal(r.porEstado.sin_declarar, 1)
  assert.equal(r.porEstado.completo, undefined)
})

await check('las podas se cuentan aparte, no como diagnósticos', async () => {
  // Una poda dice que faltan entradas que existieron. Contarla como
  // diagnóstico inflaría el total con algo que no lo es, y callarla dejaría
  // creer que la ventana está completa.
  const { resumirDiagnosticos } = await import('../backend/ia/motor/metricas.mjs')
  const r = resumirDiagnosticos([
    { tipo: 'diagnostico', sistema: 'tanque', estado: 'completo' },
    { tipo: 'poda', descartadas: 400 },
  ])

  assert.equal(r.total, 1)
  assert.equal(r.podas, 1)
})

await check('el p95 no se esconde detrás de una media', async () => {
  /*
   * Un diagnóstico que tarda diez veces más que los demás desaparece en una
   * media, y es justo el que el técnico nota. El p95 lo enseña.
   */
  const { resumirDiagnosticos } = await import('../backend/ia/motor/metricas.mjs')
  const entradas = [...Array(19)].map(() => ({ tipo: 'diagnostico', duracionMs: 10 }))
  entradas.push({ tipo: 'diagnostico', duracionMs: 5000 })

  const r = resumirDiagnosticos(entradas)
  assert.equal(r.duracionMs.p50, 10)
  assert.ok(r.duracionMs.p95 > 100, `el p95 quedó en ${r.duracionMs.p95}: el caso lento se perdió`)
  assert.equal(r.duracionMs.max, 5000)
})

console.log('\n── El diario no se come el diagnóstico ─────────────────────')

await check('un diario que no se puede escribir NO tumba la respuesta', async () => {
  /*
   * La decisión está en `lib/diario.mjs` y aquí se comprueba de extremo a
   * extremo: `anotar` nunca lanza. Quien preguntó ya tiene su diagnóstico, y
   * negárselo porque el disco esté lleno sería perder lo útil por no poder
   * guardar la copia. El fallo se registra en el log, que es el otro sitio
   * donde queda constancia.
   *
   * Se simula con una ruta imposible: un archivo dentro de un archivo.
   */
  const imposible = join(ruta, 'no-puede-ser', 'diario.jsonl')
  process.env.DIARIO_DIAGNOSTICOS = imposible
  const otra = await createApp(loadConfig())
  await otra.ready()

  const r = await otra.inject({
    method: 'GET',
    url: '/api/diagnostico?sistema=tanque&riesgoId=bomba-sin-salida',
  })

  assert.equal(r.statusCode, 200, 'el diagnóstico se entrega aunque el diario falle')
  assert.ok(r.json().causas.length > 0)
  await otra.close()
  process.env.DIARIO_DIAGNOSTICOS = ruta
})

await app.close()
await rm(carpeta, { recursive: true, force: true })

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/app.mjs (el motor envuelto) o backend/lib/diario.mjs.${c.reset}`)
  process.exit(1)
}

console.log(
  `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `todo diagnóstico queda auditable.${c.reset}`
)
