#!/usr/bin/env node
/**
 * scripts/verificar-casos-cierre.mjs
 * ------------------------------------------------------------------
 * El cierre de diagnóstico (Plan 16 Fase 5): `registrarCaso()`, la función
 * que `POST /api/casos` llama para escribir en `datos/aprendizaje.json`.
 *
 * ── POR QUÉ ESTE SCRIPT, Y NO SÓLO `test/rutas/casos.test.mjs` ──────
 *
 * `datos/aprendizaje.json` no tiene una variable de entorno que lo reubique
 * —a diferencia de `IA_DOCS_DIR`/`IA_REPORTES_DIR`—, así que
 * `backend/test/rutas/casos.test.mjs` sólo prueba el CONTRATO HTTP
 * (validación, 400) sin llegar nunca a escribir. Lo que SÍ escribe se
 * prueba aquí, contra una `ruta` temporal explícita — el mismo mecanismo
 * que ya usa `scripts/verificar-casos.mjs` para `casos.mjs`.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 *  - Que un cierre RICO (disparador, muestraSensores, diagnostico,
 *    causaReal, resultado, diagnosticoCorrecto) se guarde completo.
 *  - Que los campos NO enviados no aparezcan como `null`/`undefined` de
 *    relleno: un caso simple, del estilo de `registrar_intervencion`,
 *    queda con exactamente los mismos campos que ya escribe hoy la voz.
 *  - Que un caso simple y uno rico convivan en el mismo archivo sin que
 *    `intervencionesRecientes` ni `textoDeRecuperacion` —los dos lectores
 *    que ya existían antes de esta fase— se rompan con el rico.
 *  - Que `casos.mjs` siga indexando y encontrando un caso rico: los campos
 *    nuevos no interfieren con el BM25/embeddings que ya funcionaban.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-casos-cierre.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { registrarCaso } from '../backend/ia/herramientas/aprendizaje/index.mjs'
import { createIndiceCasos } from '../backend/ia/motor/casos.mjs'
import {
  VACIO as APRENDIZAJE_VACIO,
  crearIntervencion,
  intervencionesRecientes,
} from '../shared/eva/comun/aprendizaje.js'
import { textoDeRecuperacion } from '../shared/eva/comun/casos.js'

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

const raiz = await mkdtemp(join(tmpdir(), 'verificar-casos-cierre-'))

async function rutaNueva(intervenciones = []) {
  const ruta = join(raiz, `aprendizaje-${Math.random().toString(36).slice(2)}.json`)
  await writeFile(ruta, JSON.stringify({ ...APRENDIZAJE_VACIO, intervenciones }), 'utf8')
  return ruta
}

const CIERRE_RICO = {
  sistema: 'tanque',
  sintoma: 'La bomba giraba contra una salida cerrada.',
  causa: 'La válvula de impulsión VF-02 estaba agarrotada.',
  solucion: 'Se liberó la válvula de impulsión VF-02 y se lubricó el vástago.',
  resuelto: true,
  origen: 'Técnico · turno mañana',
  disparador: { tipo: 'riesgo', riesgoId: 'bomba-sin-salida', severidad: 'critico' },
  muestraSensores: {
    presionRelativa: 6.2, caudal: 0.0, cargaMotor: 78, nivelTanque: 61,
    calidad: { caudal: 'BUENA' },
  },
  diagnostico: {
    propuesta: 'valvula-impulsion-cerrada',
    respaldo: 'alto',
    fuentes: ['datos', 'manual'],
    manualCitado: [{ archivo: 'bomba-XY.pdf', pagina: 214 }],
  },
  causaReal: { componente: 'VF-02', tipo: 'valvula-impulsion-cerrada' },
  resultado: { riesgoDesaparecio: true, observaciones: 'La presión volvió a 3,1 bar.' },
  diagnosticoCorrecto: true,
}

console.log('\n── Un cierre rico se guarda completo ─────────────────────────')

await check('todos los campos opcionales llegan intactos al archivo', async () => {
  const ruta = await rutaNueva()
  const r = await registrarCaso(CIERRE_RICO, { ruta })
  assert.equal(r.ok, true, r.error)

  const bruto = JSON.parse(await readFile(ruta, 'utf8'))
  assert.equal(bruto.intervenciones.length, 1)
  const guardado = bruto.intervenciones[0]

  assert.deepEqual(guardado.disparador, CIERRE_RICO.disparador)
  assert.deepEqual(guardado.muestraSensores, CIERRE_RICO.muestraSensores)
  assert.deepEqual(guardado.diagnostico, CIERRE_RICO.diagnostico)
  assert.deepEqual(guardado.causaReal, CIERRE_RICO.causaReal)
  assert.deepEqual(guardado.resultado, CIERRE_RICO.resultado)
  assert.equal(guardado.diagnosticoCorrecto, true)
  // Y los campos de siempre, sin tocar.
  assert.equal(guardado.sistema, 'tanque')
  assert.equal(guardado.resuelto, true)
})

console.log('\n── Un cierre simple no arrastra relleno ──────────────────────')

await check('sin los campos de Fase 5, el registro sale exactamente como el de voz/chat', async () => {
  const ruta = await rutaNueva()
  const simple = { sistema: 'tanque', sintoma: 'Algo pasó.', solucion: 'Se arregló.' }
  const r = await registrarCaso(simple, { ruta })
  assert.equal(r.ok, true, r.error)

  const guardado = r.caso
  for (const campo of ['disparador', 'muestraSensores', 'diagnostico', 'causaReal', 'resultado', 'diagnosticoCorrecto']) {
    assert.equal(campo in guardado, false, `"${campo}" no debía aparecer sin haberse mandado`)
  }
  // Misma forma que devuelve `crearIntervencion` para una llamada de voz.
  assert.deepEqual(
    Object.keys(guardado).sort(),
    ['id', 'fecha', 'sistema', 'sintoma', 'causa', 'solucion', 'resuelto', 'origen'].sort()
  )
})

console.log('\n── Convive con lo que ya leía antes de esta fase ─────────────')

await check('intervencionesRecientes y textoDeRecuperacion no se rompen con un caso rico', async () => {
  const ruta = await rutaNueva()
  await registrarCaso(CIERRE_RICO, { ruta })
  await registrarCaso({ sistema: 'tanque', sintoma: 'Otra cosa.', solucion: 'Otro arreglo.' }, { ruta })

  const bruto = JSON.parse(await readFile(ruta, 'utf8'))
  const recientes = intervencionesRecientes(bruto, 10)
  assert.equal(recientes.length, 2)

  const texto = textoDeRecuperacion(recientes.find(i => i.disparador))
  assert.match(texto, /VF-02/)
  assert.match(texto, /funcion[oó]/i)
})

await check('un caso registrado por `crearIntervencion` (voz) y uno por `registrarCaso` (cierre) comparten id sin colisión', async () => {
  const ruta = await rutaNueva()
  await registrarCaso(CIERRE_RICO, { ruta })
  // Simula lo que hace `registrar_intervencion`: mismo generador de id.
  const porVoz = crearIntervencion({ sistema: 'tanque', sintoma: 'Voz.', solucion: 'Voz arreglo.' })
  const bruto = JSON.parse(await readFile(ruta, 'utf8'))
  bruto.intervenciones.push(porVoz)
  await writeFile(ruta, JSON.stringify(bruto), 'utf8')

  const final = JSON.parse(await readFile(ruta, 'utf8'))
  const ids = new Set(final.intervenciones.map(i => i.id))
  assert.equal(ids.size, 2, 'los dos casos deben tener ids distintos')
})

console.log('\n── El desmentido en el texto de recuperación (Fase 2, G3) ────')

await check('un cierre con propuesta y causa real distintas lleva las dos en el texto', async () => {
  // Reproduce lo medido en la auditoría: sin esta frase, un caso cuya
  // `causa` en prosa sólo nombra la causa REAL —nunca la que el sistema
  // propuso y que resultó ser incorrecta— podía no aparecer al buscar por
  // el título de esa causa propuesta, que es precisamente el caso que hace
  // falta encontrar para poder refutarla.
  const nueva = crearIntervencion({
    sistema: 'tanque',
    sintoma: 'Sobrepresión en la red.',
    causa: 'La válvula de alivio no estaba actuando.', // no menciona el variador
    solucion: 'Se cambió la válvula de alivio.',
    diagnostico: { propuesta: 'consigna-variador-alta' },
    causaReal: { tipo: 'valvula-alivio-no-actua' },
    diagnosticoCorrecto: false,
  })

  const texto = textoDeRecuperacion(nueva)
  assert.match(texto, /consigna-variador-alta/)
  assert.match(texto, /valvula-alivio-no-actua/)
})

await check('sin `diagnostico.propuesta`/`causaReal.tipo`, no hay frase de desmentido que añadir', async () => {
  const nueva = crearIntervencion({
    sistema: 'tanque', sintoma: 'Algo raro.', solucion: 'Se revisó.',
  })

  const texto = textoDeRecuperacion(nueva)
  assert.doesNotMatch(texto, /propuso/i)
})

console.log('\n── `casos.mjs` sigue indexando un caso rico ──────────────────')

await check('un caso con campos de Fase 5 se indexa y se encuentra igual que uno simple', async () => {
  const ruta = await rutaNueva()
  await registrarCaso(CIERRE_RICO, { ruta })

  const indice = createIndiceCasos({ rutaAprendizaje: ruta })
  const resultados = await indice.buscarCasosSimilares({ sistema: 'tanque', texto: CIERRE_RICO.sintoma })

  assert.ok(resultados.length > 0, 'debía encontrar el caso rico')
  assert.equal(resultados[0].causa, CIERRE_RICO.causa)
})

/* ── Resultado ───────────────────────────────────────────────────────── */

await rm(raiz, { recursive: true, force: true })

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/herramientas/aprendizaje/index.mjs o backend/routes/casosRoutes.mjs.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: el cierre de diagnóstico se mantiene.${c.reset}`)
