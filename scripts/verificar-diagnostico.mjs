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
