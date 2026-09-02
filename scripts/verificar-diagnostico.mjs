#!/usr/bin/env node
/**
 * scripts/verificar-diagnostico.mjs
 * ------------------------------------------------------------------
 * El motor de diagnóstico (Plan 16 Fase 3): junta Fuente #1 (el propio
 * riesgo, ya activo), Fuente #2 (`indiceDocumentos.buscar()`) y Fuente #3
 * (`indiceCasos.buscarCasosSimilares()`), puntúa cada causa candidata de
 * `causas.js` y devuelve la lista ordenada.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 *  - Determinismo: las mismas tres fuentes, dos veces, dan EXACTAMENTE la
 *    misma salida — es la propiedad que justifica que puntúe el código y no
 *    el modelo.
 *  - Ningún riesgo ACTIVO se queda callado: todo `id` de `REGLAS` (tanque y
 *    vibraciones) o tiene causas candidatas y el diagnóstico las devuelve, o
 *    no las tiene y el diagnóstico lo DICE (`huerfano: true`), nunca una
 *    lista vacía sin explicación.
 *  - Aislamiento: un `riesgoId` que no pertenece al `sistema` pedido, o un
 *    `sistema` que no existe, no se adivina — se rechaza.
 *  - El tope que impide que la memoria se vuelva dogma: los casos previos,
 *    sin manual y con el mínimo de datos, no alcanzan ALTO solos.
 *  - Un caso `resuelto:false` resta, no sólo dice "no encontrado".
 *
 * No usa red, embeddings, ni disco: `indiceDocumentos`/`indiceCasos` son
 * dobles de prueba que implementan sólo `buscar()`/`buscarCasosSimilares()`.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-diagnostico.mjs
 */
import assert from 'node:assert/strict'

import { createMotorDiagnostico } from '../backend/ia/diagnostico.mjs'
import { causasDe } from '../shared/eva/causas.js'
import { REGLAS as REGLAS_TANQUE } from '../shared/eva/riesgos.js'
import { REGLAS as REGLAS_VIBRACION } from '../shared/eva/riesgosVibracion.js'

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

/* ── dobles de prueba ─────────────────────────────────────────────────── */

/** Un `indiceDocumentos` de mentira: score fijo por causa, según su `id`. */
function manualFalso(scorePorCausa = {}) {
  return {
    async buscar(consulta) {
      for (const [pista, score] of Object.entries(scorePorCausa)) {
        if (consulta.includes(pista)) {
          return [{ archivo: 'manual-de-prueba.pdf', pagina: 1, texto: consulta, score }]
        }
      }
      return []
    },
  }
}

/** Un `indiceCasos` de mentira: casos fijos, ignorando el texto de consulta. */
function casosFalsos(casos = []) {
  return {
    async buscarCasosSimilares({ sistema }) {
      return casos.filter(c => c.sistema === sistema)
    },
  }
}

const SIN_FUENTES = createMotorDiagnostico({})

/* ── Determinismo ─────────────────────────────────────────────────────── */

console.log('\n── Mismas entradas, misma salida ─────────────────────────────')

await check('dos llamadas idénticas devuelven exactamente el mismo JSON', async () => {
  const indiceDocumentos = manualFalso({ 'impulsión cerrada': 0.8 })
  const indiceCasos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0.9 },
  ])
  const motor = createMotorDiagnostico({ indiceDocumentos, indiceCasos })

  const a = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  const b = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  assert.deepEqual(a, b)
})

/* ── Ningún riesgo activo queda huérfano ────────────────────────────────── */

console.log('\n── Ningún riesgo activo se queda callado ─────────────────────')

await check('todo riesgo de tanque tiene causas, o el diagnóstico dice `huerfano`', async () => {
  for (const regla of REGLAS_TANQUE) {
    const resultado = await SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: regla.id })
    const candidatas = causasDe(regla.id)
    if (candidatas) {
      assert.equal(resultado.huerfano, false, `${regla.id}: tiene causas pero salió huérfano`)
      assert.equal(resultado.causas.length, candidatas.length, `${regla.id}: perdió candidatas por el camino`)
    } else {
      assert.equal(resultado.huerfano, true, `${regla.id}: no tiene causas y no lo dijo`)
      assert.deepEqual(resultado.causas, [])
    }
  }
})

await check('todo riesgo de vibraciones tiene causas, o el diagnóstico dice `huerfano`', async () => {
  for (const regla of REGLAS_VIBRACION) {
    const resultado = await SIN_FUENTES.diagnosticar({ sistema: 'vibraciones', riesgoId: regla.id })
    const candidatas = causasDe(regla.id)
    if (candidatas) {
      assert.equal(resultado.huerfano, false, `${regla.id}: tiene causas pero salió huérfano`)
      assert.equal(resultado.causas.length, candidatas.length, `${regla.id}: perdió candidatas por el camino`)
    } else {
      assert.equal(resultado.huerfano, true, `${regla.id}: no tiene causas y no lo dijo`)
    }
  }
})

/* ── Aislamiento ──────────────────────────────────────────────────────── */

console.log('\n── Un riesgoId que no encaja no se adivina ───────────────────')

await check('un `riesgoId` de vibraciones pedido con `sistema: "tanque"` se rechaza', async () => {
  await assert.rejects(
    () => SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: 'vibracion-en-alarma' }),
    TypeError,
  )
})

await check('un `sistema` inexistente se rechaza', async () => {
  await assert.rejects(
    () => SIN_FUENTES.diagnosticar({ sistema: 'calderas', riesgoId: 'derrame' }),
    TypeError,
  )
})

/* ── El tope que impide que la memoria se vuelva dogma ──────────────────── */

console.log('\n── Los casos solos no llegan a ALTO ──────────────────────────')

await check('casos fuertes sin manual, con el mínimo de datos, no pasan de MEDIO o suben a ALTO sólo junto a datos altos', async () => {
  // agua-caliente: `necesita` de 1 señal → datos = 1. Con 2 casos fuertes y
  // sin manual: total = 1 + 0 + 2 = 3 → MEDIO, nunca ALTO sin más respaldo.
  const casos = [
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0.9 },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, score: 0.9 },
  ]
  const motor = createMotorDiagnostico({ indiceCasos: casosFalsos(casos) })
  const resultado = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  for (const causa of resultado.causas) {
    assert.ok(causa.respaldo.total <= 3, `${causa.id}: casos solos llegaron a ${causa.respaldo.total}`)
    assert.notEqual(causa.banda, 'alto')
  }
})

console.log('\n── Casos sin `disparador` pesan menos que los confirmados ────')

/*
 * `casos.mjs` ya EXCLUYE los casos de otro riesgo antes de que este módulo
 * los vea (probado con el índice real en `verificar-casos.mjs`); lo que se
 * comprueba aquí es lo que le toca a ESTE módulo, Plan 17 Fase 1 (G1): un
 * caso confirmado del mismo riesgo (`disparador.riesgoId` coincide) pesa
 * más que uno que llegó por parecido de texto sin decir de qué riesgo era
 * —el caso normal para todo lo registrado por voz o chat, que nunca trae
 * `disparador`—.
 */

await check('dos casos CONFIRMADOS del mismo riesgo llegan al tope de 2, como antes', async () => {
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0.9, disparador: { riesgoId: 'agua-caliente' } },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, score: 0.9, disparador: { riesgoId: 'agua-caliente' } },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  assert.equal(resultado.causas[0].respaldo.casos, 2)
})

await check('dos casos SIN `disparador` (voz/chat) topan en 1, nunca llegan a 2', async () => {
  // Mismo texto, mismos scores que el caso anterior — la única diferencia es
  // que estos no dicen de qué riesgo eran, como cualquier intervención
  // registrada por voz. Sin la Fase 1, esto puntuaba 2 igual que arriba.
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0.9 },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, score: 0.9 },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  assert.equal(resultado.causas[0].respaldo.casos, 1, 'sin disparador, dos casos no debían pesar como si confirmaran')
})

await check('un confirmado + uno sin `disparador` siguen sin superar el tope de 2', async () => {
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0.9, disparador: { riesgoId: 'agua-caliente' } },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, score: 0.9 },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  assert.equal(resultado.causas[0].respaldo.casos, 2, 'el confirmado + el débil debían completar el tope, no superarlo')
})

console.log('\n── El emparejamiento exacto por id (Plan 17 Fase 2, G3) ──────')

/*
 * `causaReal.tipo`/`diagnostico.propuesta` son ids estructurados de la Fase
 * 5 del Plan 16: no compiten por parecido de texto, así que estos casos de
 * prueba llevan `score: 0` a propósito —por debajo de CUALQUIER umbral—
 * para demostrar que el emparejamiento exacto no depende del score.
 */

await check('`causaReal.tipo` confirma la causa aunque el score de texto sea 0', async () => {
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      causaReal: { tipo: 'aporte-termico-externo' } },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, score: 0,
      causaReal: { tipo: 'aporte-termico-externo' } },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })
  const causa = resultado.causas.find(c => c.id === 'aporte-termico-externo')

  assert.equal(causa.respaldo.casos, 2, 'dos confirmaciones exactas debían llegar al tope, sin depender del score')
})

await check('`diagnostico.propuesta` + `diagnosticoCorrecto:false` refuta la causa, aunque `resuelto:true`', async () => {
  // El técnico dijo que la avería se arregló (resuelto:true) PERO que la
  // causa propuesta no era la correcta (diagnosticoCorrecto:false) — son dos
  // preguntas distintas, y la que importa aquí es la segunda.
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      diagnostico: { propuesta: 'aporte-termico-externo' }, diagnosticoCorrecto: false },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })
  const causa = resultado.causas.find(c => c.id === 'aporte-termico-externo')

  assert.equal(causa.respaldo.casos, -1, 'una refutación exacta debía restar, aunque el intento se diera por resuelto')
})

await check('una causa refutada DOS VECES baja de banda ella sola — el escenario medido en la auditoría', async () => {
  // Reproduce lo medido el 01-09-2026: `consigna-variador-alta` fue
  // refutada en dos cierres distintos y seguía saliendo en banda ALTO
  // porque nada restaba por `diagnosticoCorrecto:false`. bomba-sin-salida
  // tiene `necesita` de 3 señales → datos=3; sin casos ni manual, total=3
  // (MEDIO, una sola fuente). Dos refutaciones deben bajarlo a BAJO.
  const sinCasos = await createMotorDiagnostico({}).diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  const causaSinCasos = sinCasos.causas.find(c => c.id === 'valvula-impulsion-cerrada')
  assert.equal(causaSinCasos.respaldo.total, 3)
  assert.equal(causaSinCasos.banda, 'medio')

  const casosRefutando = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      diagnostico: { propuesta: 'valvula-impulsion-cerrada' }, diagnosticoCorrecto: false },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, score: 0,
      diagnostico: { propuesta: 'valvula-impulsion-cerrada' }, diagnosticoCorrecto: false },
  ])
  const conRefutaciones = await createMotorDiagnostico({ indiceCasos: casosRefutando }).diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  const causaRefutada = conRefutaciones.causas.find(c => c.id === 'valvula-impulsion-cerrada')

  assert.equal(causaRefutada.respaldo.casos, -2)
  assert.equal(causaRefutada.respaldo.total, 1)
  assert.notEqual(causaRefutada.banda, 'medio', 'dos refutaciones debían bajarla de banda, sola')
  assert.equal(causaRefutada.banda, 'bajo')
})

await check('confirmación exacta y refutación de OTRA causa no se mezclan', async () => {
  // Un mismo lote de casos puede confirmar una causa Y refutar otra del
  // mismo riesgo a la vez — son juicios independientes, uno por causa.
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      causaReal: { tipo: 'aporte-termico-externo' } },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, score: 0,
      diagnostico: { propuesta: 'falta-renovacion-de-agua' }, diagnosticoCorrecto: false },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  const confirmada = resultado.causas.find(c => c.id === 'aporte-termico-externo')
  const refutada = resultado.causas.find(c => c.id === 'falta-renovacion-de-agua')

  assert.equal(confirmada.respaldo.casos, 1)
  assert.equal(refutada.respaldo.casos, -1)
})

console.log('\n── Un caso que NO funcionó resta ─────────────────────────────')

await check('un caso `resuelto:false` baja el total en vez de sumarlo', async () => {
  const casosOk = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0.9 },
  ])
  const casosMal = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: false, score: 0.9 },
  ])

  const conOk = await createMotorDiagnostico({ indiceCasos: casosOk }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })
  const conMal = await createMotorDiagnostico({ indiceCasos: casosMal }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  assert.ok(conMal.causas[0].respaldo.casos < conOk.causas[0].respaldo.casos)
  assert.ok(conMal.causas[0].respaldo.casos < 0, 'un intento fallido debía restar, no sólo no sumar')
})

/* ── El manual desempata entre causas del mismo riesgo ──────────────────── */

console.log('\n── El manual desempata causas que comparten evidencia ────────')

await check('la causa que el manual nombra queda primera, aunque los datos empaten', async () => {
  const candidatas = causasDe('bomba-sin-salida')
  const objetivo = candidatas[1] // "sin-recirculacion-minima"
  const indiceDocumentos = manualFalso({ [objetivo.titulo]: 0.9 })

  const resultado = await createMotorDiagnostico({ indiceDocumentos }).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
  })

  assert.equal(resultado.causas[0].id, objetivo.id)
  assert.ok(resultado.causas[0].respaldo.manual > resultado.causas[1].respaldo.manual)
})

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/diagnostico.mjs o shared/eva/causas.js.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: el diagnóstico se mantiene.${c.reset}`)
