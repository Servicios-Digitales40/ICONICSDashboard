#!/usr/bin/env node
/**
 * scripts/verificar-calibracion.mjs
 * ------------------------------------------------------------------
 * Plan 17 §5. `scripts/verificar-diagnostico.mjs` pasa sus comprobaciones con
 * **dobles de prueba** que devuelven scores controlados (`{scoreCrudo: 10}`):
 * nunca ejerce la normalización real de BM25 ni el filtro real por sistema —
 * que es exactamente donde vivían H1/H2 de la auditoría del 01-09-2026. Las
 * pruebas de ese archivo verifican la ARITMÉTICA; éste verifica la
 * CALIBRACIÓN, contra el motor real completo: `createIndiceDocumentos` +
 * `createIndiceCasos` + `createMotorDiagnostico`, sin dobles.
 *
 * ── LA RESERVA QUE HAY QUE LEER ANTES DE CONFIAR EN ESTO ────────────
 *
 * El plan pedía correr esto "contra el índice REAL de `Documentacion/`".
 * **En esta copia de trabajo no hay un solo PDF ni un `datos/aprendizaje.json`
 * real** —`Documentos/` sólo tiene `Reportes/`, y `datos/` está en
 * `.gitignore` y no existe—. Las seis comprobaciones de abajo corren contra
 * un corpus SINTÉTICO: párrafos de manual escritos a mano (mismo criterio
 * que el experimento de calibración de `UMBRAL_BM25_*` en
 * `backend/ia/motor/diagnostico.mjs`, Plan 17 Fase 3a) y casos construidos con
 * `crearIntervencion` real. Prueban que el MECANISMO funciona —el filtro por
 * sistema, el emparejamiento exacto, el dedupe—, no que los umbrales estén
 * calibrados para la planta real: eso exige `Documentacion/` con manuales de
 * verdad, y hoy no los hay. Ver PLAN-17 §7·10 y el estado de la Fase 7a.
 *
 * ── LAS SEIS COMPROBACIONES DEL PLAN ─────────────────────────────────
 *
 *  1. Dos causas del mismo riesgo NO empatan en `manual`.
 *  2. Un caso de OTRO riesgo no aparece en `casosCitados`.
 *  3. Una causa refutada por un cierre anterior queda por debajo de la que
 *     el técnico señaló como real.
 *  4. Un manual de vibraciones no respalda una causa del tanque.
 *  5. `manualCitado` no contiene dos entradas del mismo documento.
 *  6. Con la documentación vacía, todo sigue funcionando y `manual` sale 0.
 *
 * No usa red ni GPU. Los manuales son `.txt` —`documentos.mjs` los indexa
 * igual que un `.pdf`— y los casos van a un `aprendizaje.json` temporal.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-calibracion.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createIndiceDocumentos } from '../backend/ia/indices/documentos.mjs'
import { createIndiceCasos } from '../backend/ia/motor/casos.mjs'
import { createMotorDiagnostico } from '../backend/ia/motor/diagnostico.mjs'
import { crearIntervencion, VACIO as APRENDIZAJE_VACIO } from '../shared/eva/aprendizaje.js'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', ambar: '\x1b[33m', gris: '\x1b[90m',
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

const raiz = await mkdtemp(join(tmpdir(), 'verificar-calibracion-'))

/** Párrafos de manual SINTÉTICOS —ver la cabecera— sobre causas reales de
 *  `shared/eva/causas.js`, lo bastante largos y específicos para que BM25
 *  los distinga de verdad. */
const MANUAL_VALVULA_IMPULSION = `La válvula de impulsión VF-02 debe permanecer completamente
  abierta durante el funcionamiento normal de la bomba. Si la válvula de impulsión queda
  cerrada o parcialmente agarrotada por corrosión o falta de mantenimiento, la bomba gira
  contra una salida cerrada: el caudal cae a cero mientras la presión en la línea sube por
  encima de lo normal. Revise el estado de la válvula de impulsión y libere el vástago si
  está agarrotado.`

const MANUAL_VIBRACIONES = `El módulo SIPLUS SM 1281 vigila la aceleración eficaz de los tres
  apoyos del tren de vibraciones. Un desequilibrio del rotor produce una componente dominante
  a 1X la velocidad de giro, visible en el espectro del apoyo más próximo al desequilibrio.`

async function carpetaNueva() {
  return mkdtemp(join(raiz, 'docs-'))
}

/**
 * Ruido para acercar el corpus a la escala que midió la auditoría
 * (~44 fragmentos) — sin él, `UMBRAL_BM25_*` (calibrados contra un corpus de
 * ese tamaño, ver `backend/ia/motor/diagnostico.mjs`) no separan nada: medido, un
 * corpus de sólo 2 archivos deja el `scoreCrudo` de un match genuino en
 * ~4,2-4,6, por debajo de `UMBRAL_BM25_FUERTE=8`, y las dos causas empatan
 * en el nivel "débil" en vez de discriminar. El `idf` de BM25 no es
 * invariante al tamaño del corpus (Plan 17 Fase 3a) — este archivo es la
 * prueba de esa dependencia, no sólo su explicación.
 */
async function conRuido(dir, cuantos = 40) {
  const temas = [
    'nivel del tanque', 'temperatura ambiente', 'caudal de entrada', 'presión atmosférica',
    'lubricación de rodamientos', 'filtro de aire', 'panel eléctrico', 'alarma de turno',
    'registro de mantenimiento', 'inspección visual', 'sensor de nivel', 'fuente de alimentación',
  ]
  for (let i = 0; i < cuantos; i++) {
    const tema = temas[i % temas.length]
    await writeFile(
      join(dir, `ruido-${i}.txt`),
      `Observación rutinaria sobre ${tema} durante el turno de operación, sin incidencias que
       reportar. El equipo funciona dentro de los parámetros normales. Registro número ${i}.`
    )
  }
}

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

function motorCon({ carpetaManuales, rutaCasos }) {
  const indiceDocumentos = carpetaManuales
    ? createIndiceDocumentos({ carpeta: carpetaManuales, rutaCache: join(carpetaManuales, '.cache.json') })
    : null
  const indiceCasos = createIndiceCasos({ rutaAprendizaje: rutaCasos })
  return createMotorDiagnostico({ indiceDocumentos, indiceCasos })
}

/* ── 1. Dos causas del mismo riesgo no empatan en `manual` ─────────────── */

console.log('\n── 1 · Dos causas del mismo riesgo no empatan en `manual` ────')

/*
 * OJO con lo que esta comprobación afirma y lo que NO: si las dos causas
 * tuvieran cada una un párrafo de manual genuino y bien encajado, empatar en
 * `manual: 2` sería CORRECTO —dos respaldos fuertes son dos respaldos
 * fuertes—, no el fallo H2 de la auditoría. El fallo medido era que
 * CUALQUIER consulta, incluso sin encaje real, tocaba el techo. Por eso este
 * corpus da manual sólo a UNA de las dos causas: la que no tiene párrafo
 * dedicado no debe salir con el mismo `manual` que la que sí lo tiene, por
 * puro accidente de vocabulario compartido con el ruido.
 */
await check('con manual sólo para una causa, la otra no toca el mismo techo por accidente', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'valvula.txt'), MANUAL_VALVULA_IMPULSION)
  // Sin párrafo para `sin-recirculacion-minima` a propósito.
  await conRuido(dir)

  const motor = motorCon({ carpetaManuales: dir, rutaCasos: await almacenNuevo() })
  const resultado = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  const valvula = resultado.causas.find(cc => cc.id === 'valvula-impulsion-cerrada')
  const recirculacion = resultado.causas.find(cc => cc.id === 'sin-recirculacion-minima')

  assert.equal(valvula.respaldo.manual, 2, 'la causa con manual dedicado debía sacar el máximo')
  assert.notEqual(
    valvula.respaldo.manual, recirculacion.respaldo.manual,
    'la causa SIN manual empató con la que sí lo tiene — sigue tocando techo sin encaje real'
  )
})

/* ── 2. Un caso de otro riesgo no aparece en casosCitados ───────────────── */

console.log('\n── 2 · Un caso de otro riesgo no aparece en `casosCitados` ───')

await check('derrame no cita casos de sobrepresion, aunque el texto se parezca', async () => {
  // Reproduce el escenario H1 medido en la auditoría: un caso guardado bajo
  // `sobrepresion` no puede respaldar `derrame`, aunque los dos sean del
  // tanque y el texto se parezca.
  const rutaCasos = await almacenNuevo()
  await agregarIntervencion(rutaCasos, {
    sistema: 'tanque',
    sintoma: 'Sobrepresión en la red de agua.',
    causa: 'La válvula de alivio no está actuando.',
    solucion: 'Se cambió la válvula de alivio.',
    disparador: { tipo: 'riesgo', riesgoId: 'sobrepresion' },
  })

  const motor = motorCon({ carpetaManuales: null, rutaCasos })
  const resultado = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'derrame' })

  const causa = resultado.causas.find(cc => cc.id === 'corte-nivel-alto-no-actua')
  assert.deepEqual(causa.casosCitados, [], 'un caso de sobrepresion se coló en un diagnóstico de derrame')
})

/* ── 3. Una causa refutada queda por debajo de la confirmada ───────────── */

console.log('\n── 3 · La causa refutada queda por debajo de la confirmada ───')

await check('consigna-variador-alta refutada, valvula-alivio-no-actua confirmada: el orden lo dice', async () => {
  const rutaCasos = await almacenNuevo()
  // El sistema propuso el variador; el técnico dijo que la causa real era
  // la válvula — dos veces, como en el escenario medido en la auditoría.
  await agregarIntervencion(rutaCasos, {
    sistema: 'tanque',
    sintoma: 'Sobrepresión en la red.',
    causa: 'Era la válvula de alivio.',
    solucion: 'Se cambió la válvula de alivio.',
    diagnostico: { propuesta: 'consigna-variador-alta' },
    causaReal: { tipo: 'valvula-alivio-no-actua' },
    diagnosticoCorrecto: false,
    disparador: { tipo: 'riesgo', riesgoId: 'sobrepresion' },
  })
  await agregarIntervencion(rutaCasos, {
    sistema: 'tanque',
    sintoma: 'Sobrepresión en la red, otra vez.',
    causa: 'Otra vez era la válvula de alivio.',
    solucion: 'Se ajustó el tarado de la válvula.',
    diagnostico: { propuesta: 'consigna-variador-alta' },
    causaReal: { tipo: 'valvula-alivio-no-actua' },
    diagnosticoCorrecto: false,
    disparador: { tipo: 'riesgo', riesgoId: 'sobrepresion' },
  })

  const motor = motorCon({ carpetaManuales: null, rutaCasos })
  const resultado = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'sobrepresion' })

  const variador = resultado.causas.find(cc => cc.id === 'consigna-variador-alta')
  const valvula = resultado.causas.find(cc => cc.id === 'valvula-alivio-no-actua')

  assert.ok(
    valvula.respaldo.total > variador.respaldo.total,
    `la causa confirmada (${valvula.respaldo.total}) debía quedar por encima de la refutada (${variador.respaldo.total})`
  )
  assert.equal(resultado.causas[0].id, 'valvula-alivio-no-actua', 'la confirmada debía quedar primera')
})

/* ── 4. Un manual de vibraciones no respalda una causa del tanque ──────── */

console.log('\n── 4 · Un manual de vibraciones no respalda una causa del tanque ─')

await check('el manual de vibraciones queda fuera de un diagnóstico del tanque', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'valvula.txt'), MANUAL_VALVULA_IMPULSION)
  await writeFile(join(dir, 'vibraciones.txt'), MANUAL_VIBRACIONES)
  await writeFile(join(dir, '.manifiesto.json'), JSON.stringify({
    version: 1,
    manuales: [
      { id: 'm1', archivo: 'valvula.txt', sistema: 'tanque' },
      { id: 'm2', archivo: 'vibraciones.txt', sistema: 'vibraciones' },
    ],
  }))

  const motor = motorCon({ carpetaManuales: dir, rutaCasos: await almacenNuevo() })
  const resultado = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  const valvula = resultado.causas.find(cc => cc.id === 'valvula-impulsion-cerrada')
  assert.ok(
    valvula.manualCitado.every(m => m.archivo !== 'vibraciones.txt'),
    'un manual de vibraciones respaldó una causa del tanque'
  )
})

/* ── 5. manualCitado no repite el mismo documento ───────────────────────── */

console.log('\n── 5 · `manualCitado` no repite el mismo documento ────────────')

await check('dos archivos con el mismo contenido no duplican la cita', async () => {
  const dir = await carpetaNueva()
  await writeFile(join(dir, 'valvula.txt'), MANUAL_VALVULA_IMPULSION)
  await writeFile(join(dir, 'valvula-copia.txt'), MANUAL_VALVULA_IMPULSION)

  const motor = motorCon({ carpetaManuales: dir, rutaCasos: await almacenNuevo() })
  const resultado = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  const valvula = resultado.causas.find(cc => cc.id === 'valvula-impulsion-cerrada')
  const hashes = valvula.manualCitado.map(m => m.hash)
  assert.equal(new Set(hashes).size, hashes.length, 'el mismo fragmento apareció citado dos veces')
})

/* ── 6. Con la documentación vacía, `manual` sale 0 sin romper nada ────── */

console.log('\n── 6 · Sin documentación, todo sigue funcionando ──────────────')

await check('carpeta vacía: manual=0, el diagnóstico no falla', async () => {
  const dir = await carpetaNueva()
  const motor = motorCon({ carpetaManuales: dir, rutaCasos: await almacenNuevo() })
  const resultado = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  for (const causa of resultado.causas) {
    assert.equal(causa.respaldo.manual, 0)
    assert.deepEqual(causa.manualCitado, [])
  }
})

await check('sin `indiceDocumentos` en absoluto (config.ia.docsDir vacío): igual', async () => {
  const motor = motorCon({ carpetaManuales: null, rutaCasos: await almacenNuevo() })
  const resultado = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  for (const causa of resultado.causas) assert.equal(causa.respaldo.manual, 0)
})

/* ── Resultado ───────────────────────────────────────────────────────── */

await rm(raiz, { recursive: true, force: true })

console.log(`\n${c.ambar}${c.negrita}Recordatorio:${c.reset}${c.ambar} estas seis comprobaciones corrieron contra un`)
console.log(`corpus SINTÉTICO — no hay Documentacion/ real en esta copia de trabajo. Prueban`)
console.log(`el MECANISMO, no que los umbrales estén calibrados para la planta real. Ver la`)
console.log(`cabecera de este archivo y PLAN-17 §7·10.${c.reset}`)

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/motor/diagnostico.mjs, documentos.mjs o casos.mjs.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: la calibración del mecanismo se mantiene.${c.reset}`)
