#!/usr/bin/env node
/**
 * scripts/verificar-intencion.mjs — Plan 28 F5.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 * El clasificador acota el catálogo que ve el modelo, y los dos errores no
 * cuestan lo mismo:
 *
 *   cerrar de más  el modelo no tiene la herramienta que necesitaba y contesta
 *                  peor. El técnico lo nota y no sabe por qué.
 *   abrir de más   se pierde la optimización. Nadie lo nota.
 *
 * Así que la mitad de estas comprobaciones no son sobre acotar bien, sino
 * sobre ABRIR cuando hay duda — que es la propiedad que hace seguro el resto.
 *
 * ── SIN RED Y SIN MODELO ───────────────────────────────────────────
 *
 * El clasificador es determinista a propósito (§2.3), así que se prueba entero
 * en Node. Si algún día alguien lo convierte en una llamada al LLM, este
 * archivo deja de poder existir — y eso es parte de por qué no se hace.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-intencion.mjs
 */
import assert from 'node:assert/strict'

import { DEFINICIONES } from '../backend/ia/conversacion/definiciones.mjs'
import { acotarCatalogo, intencionesDe } from '../backend/ia/conversacion/intencion.mjs'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

let passed = 0
const fallos = []

function check(nombre, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(`${nombre} — ${error.message}`)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
  }
}

const nombresDe = (defs) => defs.map((d) => d?.function?.name ?? d?.name)
const acotar = (pregunta) => acotarCatalogo(DEFINICIONES, pregunta)

/* ── El banco de frases, en los dos idiomas ──────────────────────────── */

console.log('\n── Las intenciones se distinguen, en español y en inglés ───')

/**
 * Cada entrada: la frase y la intención que TIENE que reconocer. No se exige
 * que reconozca SÓLO esa —una pregunta puede tocar dos cosas de verdad— sino
 * que no se le escape la principal.
 */
const BANCO = [
  ['cuál es la presión actual del tanque?', 'actual'],
  ['cómo está la instalación ahora mismo?', 'actual'],
  ['hay algún riesgo activo?', 'actual'],
  ['what is the current tank pressure?', 'actual'],

  ['qué pasó ayer con la presión?', 'historica'],
  ['la temperatura ha subido esta semana?', 'historica'],
  ['cuándo fue la última vez que bajó el caudal?', 'historica'],
  ['what happened yesterday with the flow?', 'historica'],

  ['por qué se paró la bomba?', 'diagnostico'],
  ['diagnostica el tanque', 'diagnostico'],
  ['qué le pasa al variador?', 'diagnostico'],
  ['why did the pump stop?', 'diagnostico'],

  ['qué dice el manual sobre la presión máxima?', 'documental'],
  ['cuál es la especificación del variador?', 'documental'],
  ['what does the manual say about the relief valve?', 'documental'],

  ['registra que cambiamos el filtro', 'intervenciones'],
  ['qué se hizo la última vez con esta válvula?', 'intervenciones'],
  ['log this: we replaced the seal', 'intervenciones'],

  ['enciende la bomba', 'accion'],
  ['apaga la bomba por favor', 'accion'],
  ['turn on the pump', 'accion'],
]

for (const [frase, esperada] of BANCO) {
  check(`«${frase.slice(0, 46)}» → ${esperada}`, () => {
    assert.ok(
      intencionesDe(frase).includes(esperada),
      `reconoció [${intencionesDe(frase).join(',') || 'nada'}]`
    )
  })
}

console.log('\n── Ante la duda se ABRE, que es el error barato ────────────')

check('una pregunta general no acota nada', () => {
  /*
   * «¿Qué es una bomba?» no necesita ninguna herramienta, pero acotar aquí no
   * ahorra nada y sí podría dejar fuera algo si la pregunta resulta ser más
   * que conversación. Se abre.
   */
  const r = acotar('qué es una bomba centrífuga?')
  assert.equal(r.acotado, false)
  assert.equal(r.definiciones.length, DEFINICIONES.length)
})

check('una pregunta vacía o absurda no acota', () => {
  for (const frase of ['', '   ', 'asdfgh']) {
    assert.equal(acotar(frase).acotado, false, `«${frase}» no debía acotar`)
  }
})

check('una pregunta que cruza TRES intenciones abre del todo', () => {
  /*
   * Tres o más marcas a la vez es señal de una pregunta que cruza medio
   * sistema. Es justo donde acotar tiene más riesgo de cerrar de más, así que
   * es donde menos se acota.
   */
  const r = acotar('diagnostica el tanque y dime qué pasó ayer con la presión según el manual')
  assert.ok(r.intenciones.length >= 3)
  assert.equal(r.acotado, false)
})

check('un acotado que deja menos de tres herramientas se descarta', () => {
  // Si el filtro deja casi nada, lo más probable es que la tabla no entendiera
  // la pregunta. Abrir es más barato que equivocarse.
  for (const defs of acotar('qué dice el manual sobre la presión máxima?').definiciones) {
    assert.ok(defs, 'las definiciones tienen que ser objetos')
  }
  assert.ok(acotar('qué dice el manual sobre la presión máxima?').definiciones.length >= 3)
})

console.log('\n── Lo que el acotado NUNCA puede hacer ─────────────────────')

check('acotar sólo QUITA: nunca añade una herramienta que no estaba', () => {
  /*
   * La propiedad que hace seguro combinarlo con la guarda de `soloLectura`
   * (Plan 21 F8): si esa guarda quitó las herramientas de escritura, el
   * acotado no puede devolverlas.
   */
  const sinEscritura = DEFINICIONES.filter(
    (d) => !['controlar_bomba', 'registrar_intervencion'].includes(d?.function?.name)
  )
  const r = acotarCatalogo(sinEscritura, 'registra que cambiamos el filtro')

  assert.ok(!nombresDe(r.definiciones).includes('controlar_bomba'))
  assert.ok(!nombresDe(r.definiciones).includes('registrar_intervencion'))
})

check('`sistemas_de_la_planta` sobrevive a cualquier acotado SIN contexto de pantalla', () => {
  /*
   * Es el registro de qué máquinas existen y con qué ids. Sin él el modelo
   * inventa nombres de sistema — un fallo ya medido antes de esta fase.
   */
  for (const [frase] of BANCO) {
    const r = acotar(frase)
    if (!r.acotado) continue
    assert.ok(
      nombresDe(r.definiciones).includes('sistemas_de_la_planta'),
      `«${frase}» dejó fuera el registro de sistemas`
    )
  }
})



check('una intención de diagnóstico conserva con qué mirar', () => {
  /*
   * Un diagnóstico de verdad cruza estado actual, historia y manual — es lo
   * que hace la propia herramienta `diagnostico({sintoma})` por dentro.
   * Acotarlo a `diagnosticar_falla` dejaría al modelo sin poder mirar lo que
   * el diagnóstico necesita.
   */
  const nombres = nombresDe(acotar('por qué se paró la bomba?').definiciones)

  for (const imprescindible of [
    'diagnosticar_falla', 'estado_del_sistema', 'historia_de_senal', 'consultar_documentacion',
  ]) {
    assert.ok(nombres.includes(imprescindible), `falta ${imprescindible}`)
  }
})

check('preguntar por el estado NO abre la herramienta que acciona la planta', () => {
  /*
   * `controlar_bomba` es la única que escribe en la máquina. Que una pregunta
   * de consulta la deje sobre la mesa no sería un fallo de seguridad —la
   * guarda de `soloLectura` y las propias comprobaciones de la herramienta
   * siguen ahí— pero sí una invitación innecesaria: el modelo tendría a mano
   * una maniobra en una conversación donde nadie la pidió.
   */
  for (const frase of [
    'cuál es la presión actual del tanque?',
    'hay algún riesgo activo?',
    'qué pasó ayer con la presión?',
  ]) {
    const r = acotar(frase)
    if (!r.acotado) continue
    assert.ok(
      !nombresDe(r.definiciones).includes('controlar_bomba'),
      `«${frase}» dejó a mano la herramienta de accionar`
    )
  }
})

check('toda herramienta del catálogo es alcanzable por alguna intención', () => {
  /*
   * Una herramienta que ninguna intención abre sólo se ofrecería cuando el
   * clasificador se rinde — o sea, casi nunca. Eso la haría invisible en la
   * práctica sin que nadie lo notara, que es la clase de defecto silencioso
   * que este proyecto persigue.
   */
  const alcanzables = new Set()
  for (const [frase] of BANCO) {
    for (const nombre of nombresDe(acotar(frase).definiciones)) alcanzables.add(nombre)
  }

  const huerfanas = nombresDe(DEFINICIONES).filter((n) => !alcanzables.has(n))
  assert.deepEqual(
    huerfanas, [],
    `estas herramientas no las abre ninguna frase del banco: ${huerfanas.join(', ')}`
  )
})

console.log('\n── El ahorro es real ───────────────────────────────────────')

check('una pregunta acotada manda bastante menos catálogo', () => {
  const tamano = (defs) => JSON.stringify(defs).length
  const completo = tamano(DEFINICIONES)
  const acotadoActual = tamano(acotar('cuál es la presión actual del tanque?').definiciones)

  assert.ok(
    acotadoActual < completo / 2,
    `acotado ${acotadoActual} de ${completo}: el ahorro no compensa la complejidad`
  )
})

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/conversacion/intencion.mjs.${c.reset}`)
  process.exit(1)
}

console.log(
  `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `el clasificador acota sin cerrar de más.${c.reset}`
)
