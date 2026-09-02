#!/usr/bin/env node
/**
 * scripts/verificar-temporal.mjs
 * ------------------------------------------------------------------
 * El cuarto término del diagnóstico (Plan 17 Fase 6, G5): `backend/ia/
 * temporal.mjs` evaluando una firma temporal contra una serie, sin
 * servidor —un `historia.leerSerie` de mentira—.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 *  - Una serie que sube cuando la firma declara "sube" cuenta A FAVOR.
 *  - Una serie que sube cuando la firma declara "baja" cuenta EN CONTRA —
 *    no en silencio: con una frase que dice qué se esperaba y qué pasó.
 *  - Una serie PLANA (cambio por debajo del umbral relativo) no cuenta ni a
 *    favor ni en contra: silencio, no una dirección forzada.
 *  - Con pocos puntos, o sin serie (`ok:false`), lo mismo: silencio.
 *  - El umbral es RELATIVO al valor de partida, no absoluto — una señal de
 *    escala pequeña y una de escala grande no comparten un solo número de
 *    corte (mismo criterio que `UMBRAL_BM25_*` en `diagnostico.mjs`).
 *  - `evaluar()` nunca lanza: un fallo de `leerSerie()` se cuenta como sin
 *    respaldo, igual que las demás fuentes del motor.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-temporal.mjs
 */
import assert from 'node:assert/strict'

import { createEvaluadorTemporal } from '../backend/ia/motor/temporal.mjs'

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

/** Una serie sintética: `n` puntos por hora, de `inicio` a `inicio + delta`
 *  en línea recta —la aritmética de `temporal.mjs` es una pendiente por
 *  mínimos cuadrados, así que una recta perfecta es el caso más simple de
 *  verificar—. */
function serieLineal(inicio, delta, horas, puntosPorHora = 4) {
  const n = Math.max(3, Math.round(horas * puntosPorHora))
  const ahora = new Date()
  return Array.from({ length: n }, (_, i) => ({
    t: new Date(ahora.getTime() - (horas - (i * horas) / (n - 1)) * 3600000),
    valor: inicio + (delta * i) / (n - 1),
  }))
}

/** Un `historia` de mentira: una serie fija por señal, ignorando la ventana
 *  exacta pedida —sólo le importan `senal` y si se llegó a llamar—. */
function historiaFalsa(seriePorSenal = {}) {
  const llamadas = []
  return {
    llamadas,
    async leerSerie(senal, ventana, sistemaId) {
      llamadas.push({ senal, ventana, sistemaId })
      const entrada = seriePorSenal[senal]
      if (!entrada) return { ok: false, motivo: 'sin serie de mentira para esta señal' }
      if (entrada.error) throw new Error(entrada.error)
      return { ok: true, datos: entrada.datos, truncada: false, ventana }
    },
  }
}

console.log('\n── Una tendencia que coincide cuenta A FAVOR ──────────────────')

await check('presión subiendo, firma declara "sube": evidenciaAFavor, puntos=1', async () => {
  const historia = historiaFalsa({
    presionRelativa: { datos: serieLineal(4.0, 2.0, 4) }, // 4,0 -> 6,0 bar, +50%
  })
  const evaluador = createEvaluadorTemporal({ historia })

  const r = await evaluador.evaluar(
    [{ senal: 'presionRelativa', direccion: 'sube', ventanaH: 4 }],
    'tanque'
  )

  assert.equal(r.puntos, 1)
  assert.equal(r.evidenciaEnContra.length, 0)
  assert.equal(r.evidenciaAFavor.length, 1)
  assert.equal(r.evidenciaAFavor[0].fuente, 'temporal')
  assert.equal(r.evidenciaAFavor[0].referencia, 'presionRelativa')
  assert.match(r.evidenciaAFavor[0].texto, /subió/)
})

console.log('\n── Una tendencia OPUESTA cuenta EN CONTRA, con una frase ──────')

await check('temperatura bajando, firma declara "sube": evidenciaEnContra, puntos=0', async () => {
  const historia = historiaFalsa({
    temperaturaTanque: { datos: serieLineal(30, -10, 1) }, // 30 -> 20 °C, -33%
  })
  const evaluador = createEvaluadorTemporal({ historia })

  const r = await evaluador.evaluar(
    [{ senal: 'temperaturaTanque', direccion: 'sube', ventanaH: 1 }],
    'tanque'
  )

  assert.equal(r.puntos, 0)
  assert.equal(r.evidenciaAFavor.length, 0)
  assert.equal(r.evidenciaEnContra.length, 1)
  assert.match(r.evidenciaEnContra[0].texto, /bajó/)
  assert.match(r.evidenciaEnContra[0].texto, /"sube"/)
})

console.log('\n── Una serie PLANA no cuenta ni a favor ni en contra ──────────')

await check('cambio por debajo del umbral relativo: silencio total', async () => {
  // 40,0 -> 40,5 °C es un 1,25% de cambio — por debajo de UMBRAL_CAMBIO_RELATIVO (5%).
  const historia = historiaFalsa({
    temperaturaTanque: { datos: serieLineal(40.0, 0.5, 2) },
  })
  const evaluador = createEvaluadorTemporal({ historia })

  const r = await evaluador.evaluar(
    [{ senal: 'temperaturaTanque', direccion: 'sube', ventanaH: 2 }],
    'tanque'
  )

  assert.equal(r.puntos, 0)
  assert.equal(r.evidenciaAFavor.length, 0)
  assert.equal(r.evidenciaEnContra.length, 0)
})

console.log('\n── Sin datos suficientes, silencio — no se fuerza una dirección ─')

await check('leerSerie con ok:false: silencio', async () => {
  const historia = historiaFalsa({}) // ninguna señal tiene serie
  const evaluador = createEvaluadorTemporal({ historia })

  const r = await evaluador.evaluar(
    [{ senal: 'senalSinHistoria', direccion: 'sube', ventanaH: 4 }],
    'tanque'
  )

  assert.deepEqual(r, { puntos: 0, evidenciaAFavor: [], evidenciaEnContra: [] })
})

await check('menos de 3 puntos: silencio, aunque los que hay suban', async () => {
  const historia = historiaFalsa({
    presionRelativa: { datos: serieLineal(4.0, 2.0, 1, 1).slice(0, 2) }, // sólo 2 puntos
  })
  const evaluador = createEvaluadorTemporal({ historia })

  const r = await evaluador.evaluar(
    [{ senal: 'presionRelativa', direccion: 'sube', ventanaH: 1 }],
    'tanque'
  )

  assert.equal(r.puntos, 0)
  assert.equal(r.evidenciaAFavor.length, 0)
})

await check('un `leerSerie` que lanza no rompe el diagnóstico: se cuenta como sin respaldo', async () => {
  const historia = historiaFalsa({ presionRelativa: { error: 'El historiador no contesta' } })
  const evaluador = createEvaluadorTemporal({ historia })

  const r = await evaluador.evaluar(
    [{ senal: 'presionRelativa', direccion: 'sube', ventanaH: 4 }],
    'tanque'
  )

  assert.deepEqual(r, { puntos: 0, evidenciaAFavor: [], evidenciaEnContra: [] })
})

console.log('\n── Sin firma declarada, o sin firma en absoluto: 0 sin más ────')

await check('firma vacía o ausente: 0, sin llamar a leerSerie', async () => {
  const historia = historiaFalsa({ presionRelativa: { datos: serieLineal(4, 2, 4) } })
  const evaluador = createEvaluadorTemporal({ historia })

  const sinFirma = await evaluador.evaluar(undefined, 'tanque')
  const firmaVacia = await evaluador.evaluar([], 'tanque')

  assert.deepEqual(sinFirma, { puntos: 0, evidenciaAFavor: [], evidenciaEnContra: [] })
  assert.deepEqual(firmaVacia, { puntos: 0, evidenciaAFavor: [], evidenciaEnContra: [] })
  assert.equal(historia.llamadas.length, 0, 'sin firma no debía consultar el historiador')
})

console.log('\n── El umbral es relativo, no absoluto ─────────────────────────')

await check('el mismo cambio ABSOLUTO cuenta distinto según la escala de partida', async () => {
  // +2 unidades sobre una base de 4 es 50% (cuenta); +2 sobre una base de
  // 400 es 0,5% (no cuenta). Mismo delta absoluto, veredicto distinto.
  const historia = historiaFalsa({
    escalaPequena: { datos: serieLineal(4, 2, 2) },
    escalaGrande: { datos: serieLineal(400, 2, 2) },
  })
  const evaluador = createEvaluadorTemporal({ historia })

  const pequena = await evaluador.evaluar([{ senal: 'escalaPequena', direccion: 'sube', ventanaH: 2 }], 'tanque')
  const grande = await evaluador.evaluar([{ senal: 'escalaGrande', direccion: 'sube', ventanaH: 2 }], 'tanque')

  assert.equal(pequena.puntos, 1)
  assert.equal(grande.puntos, 0)
})

console.log('\n── Varias señales en una firma: tope de 2, cada una con su frase ─')

await check('dos señales que coinciden: puntos=2, dos entradas en evidenciaAFavor', async () => {
  const historia = historiaFalsa({
    presionRelativa: { datos: serieLineal(4.0, 2.0, 4) },
    temperaturaTanque: { datos: serieLineal(30, 10, 4) },
  })
  const evaluador = createEvaluadorTemporal({ historia })

  const r = await evaluador.evaluar(
    [
      { senal: 'presionRelativa', direccion: 'sube', ventanaH: 4 },
      { senal: 'temperaturaTanque', direccion: 'sube', ventanaH: 4 },
    ],
    'tanque'
  )

  assert.equal(r.puntos, 2)
  assert.equal(r.evidenciaAFavor.length, 2)
})

console.log('\n── Una ventana que arranca en cero se calla (F7c) ────────────')

await check('un arranque desde ~0 no es una tendencia con confianza infinita', async () => {
  /*
   * Medido contra ICONICS real el 02-09-2026: el caudal instantáneo daba
   * cambios relativos de hasta 2,2 MILLONES en ventanas de 1 h, porque el
   * cambio relativo divide por el valor de partida y con la bomba parada
   * ese valor es ~0. Hoy no muerde —la única firma declarada es sobre
   * temperatura, que nunca parte de cero— pero el día que alguien declare
   * una sobre caudal, CADA arranque de bomba sería una tendencia con la
   * máxima confianza posible. La salida correcta es el silencio.
   */
  const historia = historiaFalsa({
    caudalDesdeParada: { datos: serieLineal(0.000001, 18, 1) },
  })
  const evaluador = createEvaluadorTemporal({ historia })

  const r = await evaluador.evaluar(
    [{ senal: 'caudalDesdeParada', direccion: 'sube', ventanaH: 1 }],
    'tanque'
  )

  assert.equal(r.puntos, 0, 'un arranque desde cero se contó como tendencia')
  assert.deepEqual(r.evidenciaAFavor, [], 'no debería haber evidencia a favor')
})

await check('una señal que arranca en un valor normal sigue midiéndose igual', async () => {
  // El guardián no puede apagar el término entero: la misma subida, desde
  // una base razonable, tiene que seguir contando.
  const historia = historiaFalsa({
    caudalConBase: { datos: serieLineal(10, 18, 1) },
  })
  const evaluador = createEvaluadorTemporal({ historia })

  const r = await evaluador.evaluar(
    [{ senal: 'caudalConBase', direccion: 'sube', ventanaH: 1 }],
    'tanque'
  )

  assert.equal(r.puntos, 1, 'el guardián apagó una tendencia legítima')
})


/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/motor/temporal.mjs.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: el término temporal se mantiene.${c.reset}`)
