#!/usr/bin/env node
/**
 * scripts/verificar-vida-rodamiento.mjs
 * ------------------------------------------------------------------
 * Las fórmulas de vida mecánica del rodamiento, sin servidor.
 *
 * ── QUÉ SE PROTEGE AQUÍ ────────────────────────────────────────────
 *
 * Que un cálculo de mantenimiento predictivo no dé una cifra cuando le falta
 * el dato que la sostiene. La vida L10 sin la carga real P sería un número con
 * cara de medido que nadie midió — y sobre él se programa (o no se programa)
 * una parada. Así que la mitad de estas comprobaciones no verifican una cifra:
 * verifican que, sin el dato, el resultado dice `evaluable:false` y por qué.
 *
 * ── USO ───────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-vida-rodamiento.mjs
 */
import assert from 'node:assert/strict'

import {
  RODAMIENTOS,
  frecuenciasDefecto,
  vidaL10Horas,
  evaluarVidaRodamiento,
  intervaloReengraseHoras,
} from '../shared/eva/vibraciones/vidaRodamiento.js'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

let passed = 0
const fallos = []
function check(nombre, fn) {
  try {
    fn(); passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(`${nombre} — ${error.message}`)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
  }
}
const cerca = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol

/* ── Frecuencias de defecto ─────────────────────────────────────── */

console.log(`\n${c.negrita}── Frecuencias de defecto (órdenes) ─────────────────────────${c.reset}`)

check('el 6205 da las órdenes conocidas (BPFO 3.5850, BPFI 5.4150, FTF 0.3983)', () => {
  const f = frecuenciasDefecto(RODAMIENTOS['6205'])
  assert.ok(cerca(f.BPFO, 3.5850), `BPFO ${f.BPFO}`)
  assert.ok(cerca(f.BPFI, 5.4150), `BPFI ${f.BPFI}`)
  assert.ok(cerca(f.FTF, 0.3983), `FTF ${f.FTF}`)
  assert.ok(cerca(f.BSF, 2.3574), `BSF ${f.BSF}`)
})

check('el 6204 da BPFO 3.0522', () => {
  const f = frecuenciasDefecto(RODAMIENTOS['6204'])
  assert.ok(cerca(f.BPFO, 3.0522), `BPFO ${f.BPFO}`)
})

check('BPFI siempre es mayor que BPFO (la interior gira contra la carga)', () => {
  for (const nombre of Object.keys(RODAMIENTOS)) {
    const f = frecuenciasDefecto(RODAMIENTOS[nombre])
    assert.ok(f.BPFI > f.BPFO, nombre)
  }
})

check('geometría incompleta devuelve null, no ceros', () => {
  assert.equal(frecuenciasDefecto({ Z: 9, Bd: 7.938 }), null) // sin Pd
  assert.equal(frecuenciasDefecto({}), null)
})

/* ── Vida L10 ───────────────────────────────────────────────────── */

console.log(`\n${c.negrita}── Vida L10 por fatiga ──────────────────────────────────────${c.reset}`)

check('L10 exacta: C/P=10, n=1750 rpm → 9523.8 h', () => {
  const h = vidaL10Horas({ C: 14000, P: 1400, rpm: 1750 })
  assert.ok(cerca(h, 9523.81, 0.5), `${h}`)
})

check('doblar la carga divide la vida por 8 (ley cúbica)', () => {
  const base = vidaL10Horas({ C: 14000, P: 1400, rpm: 1750 })
  const doble = vidaL10Horas({ C: 14000, P: 2800, rpm: 1750 })
  assert.ok(cerca(base / doble, 8, 0.01), `ratio ${base / doble}`)
})

check('más velocidad, menos horas de vida', () => {
  const lento = vidaL10Horas({ C: 14000, P: 1400, rpm: 875 })
  const rapido = vidaL10Horas({ C: 14000, P: 1400, rpm: 1750 })
  assert.ok(lento > rapido)
})

check('un dato ausente o no positivo devuelve null, no lanza', () => {
  assert.equal(vidaL10Horas({ C: 14000, P: 1400, rpm: 0 }), null)
  assert.equal(vidaL10Horas({ C: 14000, P: -5, rpm: 1750 }), null)
  assert.equal(vidaL10Horas({}), null)
})

/* ── El resultado honesto de cara al asistente ──────────────────── */

console.log(`\n${c.negrita}── evaluarVidaRodamiento: sin dato, no hay cifra ────────────${c.reset}`)

check('sin la carga P, NO da número: dice evaluable:false y nombra lo que falta', () => {
  const r = evaluarVidaRodamiento({ C: 14000, rpm: 1750, horasAcumuladas: 500 })
  assert.equal(r.evaluable, false)
  assert.ok(/carga equivalente P/.test(r.motivo), r.motivo)
  assert.equal(r.horasL10, undefined, 'no debe colar una cifra')
})

check('con todo, evalúa y se declara provisional (C de catálogo, P estimada)', () => {
  const r = evaluarVidaRodamiento({ C: 14000, P: 1400, rpm: 1750, horasAcumuladas: 4761.9 })
  assert.equal(r.evaluable, true)
  assert.equal(r.provisional, true)
  assert.ok(cerca(r.fraccionConsumida, 0.5, 0.01), `fracción ${r.fraccionConsumida}`)
  assert.ok(cerca(r.horasRestantes, 4761.9, 1), `restantes ${r.horasRestantes}`)
})

check('las horas restantes nunca son negativas', () => {
  const r = evaluarVidaRodamiento({ C: 14000, P: 1400, rpm: 1750, horasAcumuladas: 999999 })
  assert.equal(r.horasRestantes, 0)
  assert.equal(r.fraccionConsumida, 1)
})

/* ── Reengrase ──────────────────────────────────────────────────── */

console.log(`\n${c.negrita}── Intervalo de reengrase ───────────────────────────────────${c.reset}`)

check('6205 (d=25) a 1750 rpm da un intervalo del orden de 1500 h', () => {
  const t = intervaloReengraseHoras({ d: 25, rpm: 1750 })
  assert.ok(t > 1200 && t < 1800, `${t} h`)
})

check('a más velocidad, menos horas entre engrases', () => {
  const lento = intervaloReengraseHoras({ d: 25, rpm: 900 })
  const rapido = intervaloReengraseHoras({ d: 25, rpm: 1750 })
  assert.ok(lento > rapido)
})

check('velocidad imposiblemente alta (intervalo ≤ 0) devuelve null, no negativo', () => {
  assert.equal(intervaloReengraseHoras({ d: 25, rpm: 500000 }), null)
  assert.equal(intervaloReengraseHoras({ d: 0, rpm: 1750 }), null)
})

/* ── Resultado ──────────────────────────────────────────────────── */

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa shared/eva/vibraciones/vidaRodamiento.js.${c.reset}`)
  process.exit(1)
}
console.log(
  `${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `las fórmulas dan cifra sólo con el dato que la sostiene.${c.reset}`,
)
