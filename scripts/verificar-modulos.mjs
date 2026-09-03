#!/usr/bin/env node
/**
 * scripts/verificar-modulos.mjs
 * ------------------------------------------------------------------
 * El registro de módulos (`shared/modulos.js`) contra el de sistemas
 * (`shared/eva/comun/sistemas.js`), sin red y sin servidores.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 *  - Todo sistema de `SISTEMAS` pertenece a EXACTAMENTE un módulo. Ni cero
 *    —una máquina huérfana no sale en ninguna agrupación y nadie se entera—
 *    ni dos —que es la puerta al cruce de fuentes.
 *  - Ningún módulo declara un sistema que no existe. Un id mal escrito deja
 *    la máquina fuera en silencio, que es el mismo fallo que el anterior con
 *    otra cara.
 *  - Sólo un módulo con fuente `iconics` puede declarar sistemas. Es la
 *    comprobación que impide meter una máquina de otra fuente en `SISTEMAS`
 *    por la puerta de atrás (CLAUDE.md §4.7).
 *  - `compartenModulo()` dice que no ante dos módulos distintos, y ante un
 *    sistema desconocido. Esa guarda es lo único que separa las curvas de un
 *    compresor de las de un tanque en una misma gráfica.
 *  - Todo módulo declara `limitaciones` no vacías: es lo que el asistente
 *    tiene que decir en voz alta, no un campo decorativo.
 *
 * ── POR QUÉ LA COMPROBACIÓN VIVE AQUÍ Y NO EN EL ARRANQUE ──────────
 *
 * Porque `modulos.js` guarda ids de sistema como CADENAS a propósito —ver su
 * cabecera— para no arrastrar el dominio EVA entero. Cruzar los dos registros
 * en tiempo de arranque devolvería esa dependencia por la ventana. Aquí cuesta
 * lo mismo y no la crea.
 */
import assert from 'node:assert/strict'

import { compartenModulo, FUENTES, MODULOS, moduloDeSistema, moduloPorId } from '../shared/modulos.js'
import { SISTEMAS } from '../shared/eva/comun/sistemas.js'

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

const idsDeSistemas = SISTEMAS.map(s => s.id)
const fuentesValidas = new Set(Object.values(FUENTES))

console.log(`\n${c.negrita}El registro de módulos${c.reset}`)

check('no hay dos módulos con el mismo id', () => {
  const ids = MODULOS.map(m => m.id)
  assert.equal(new Set(ids).size, ids.length, `ids repetidos en ${ids.join(', ')}`)
})

check('todo módulo declara una fuente conocida', () => {
  for (const m of MODULOS) {
    assert.ok(m.fuente, `«${m.id}» no declara fuente`)
    assert.ok(
      fuentesValidas.has(m.fuente),
      `«${m.id}» declara la fuente «${m.fuente}», que no está en FUENTES`
    )
  }
})

check('todo módulo declara nombre, origen y limitaciones', () => {
  for (const m of MODULOS) {
    assert.ok(m.nombre, `«${m.id}» no tiene nombre legible`)
    assert.ok(m.origen, `«${m.id}» no dice de dónde sale su dato`)
    assert.ok(
      Array.isArray(m.limitaciones) && m.limitaciones.length > 0,
      `«${m.id}» no declara ninguna limitación — ese campo es lo que el asistente ` +
        `tiene que confesar, no un adorno`
    )
  }
})

check('cada sistema pertenece a exactamente un módulo', () => {
  for (const id of idsDeSistemas) {
    const dueños = MODULOS.filter(m => m.sistemas.includes(id))
    assert.equal(
      dueños.length,
      1,
      dueños.length === 0
        ? `el sistema «${id}» existe en SISTEMAS pero ningún módulo lo reclama`
        : `el sistema «${id}» lo reclaman ${dueños.length} módulos: ${dueños.map(m => m.id).join(', ')}`
    )
  }
})

check('ningún módulo declara un sistema que no existe', () => {
  for (const m of MODULOS) {
    for (const id of m.sistemas) {
      assert.ok(
        idsDeSistemas.includes(id),
        `«${m.id}» declara el sistema «${id}», que no está en SISTEMAS`
      )
    }
  }
})

check('sólo un módulo servido por ICONICS declara sistemas', () => {
  /*
   * `SISTEMAS` es ejecutable y da por hecho que hay tags de ICONICS detrás. Un
   * módulo de otra fuente que declarara sistemas estaría afirmando que sus
   * máquinas se pueden sondear como las de planta, y no se puede.
   */
  for (const m of MODULOS) {
    if (m.fuente === FUENTES.ICONICS) continue
    assert.equal(
      m.sistemas.length,
      0,
      `«${m.id}» no se sirve de ICONICS (${m.fuente}) pero declara los sistemas ` +
        `${m.sistemas.join(', ')} — una máquina que no se lee por ICONICS no entra en SISTEMAS`
    )
  }
})

console.log(`\n${c.negrita}La guarda contra el cruce de fuentes${c.reset}`)

check('dos sistemas del mismo módulo sí comparten', () => {
  assert.equal(compartenModulo('tanque', 'vibraciones'), true)
})

check('un sistema desconocido no comparte con nadie', () => {
  // El caso de la entrada de fuera: `null` y no una excepción, pero tampoco
  // un `true` por descuido al comparar dos `null`.
  assert.equal(compartenModulo('tanque', 'compresor'), false)
  assert.equal(compartenModulo('compresor', 'compresor'), false)
  assert.equal(compartenModulo(undefined, undefined), false)
})

check('moduloDeSistema resuelve los de planta y niega el resto', () => {
  assert.equal(moduloDeSistema('tanque')?.id, 'monitoreo')
  assert.equal(moduloDeSistema('vibraciones')?.id, 'monitoreo')
  assert.equal(moduloDeSistema('compresor'), null)
})

check('moduloPorId devuelve null en vez de lanzar', () => {
  assert.equal(moduloPorId('prediccion')?.nombre, 'Predicción')
  assert.equal(moduloPorId('no-existe'), null)
})

check('Predicción declara que el asistente todavía no la alcanza', () => {
  /*
   * `herramientas: []` es un HECHO medido, no un olvido: ninguna de las 22
   * herramientas habla con esa API. El día que la F5 del Plan 19 añada la
   * familia, esta comprobación falla y hay que actualizarla — que es
   * exactamente lo que se quiere que pase.
   */
  const prediccion = moduloPorId('prediccion')
  assert.deepEqual(
    prediccion.herramientas,
    [],
    'si ya hay herramientas de predicción, actualiza esta comprobación y las limitaciones del módulo'
  )
  assert.ok(
    prediccion.limitaciones.some(l => /asistente todavía no tiene/i.test(l)),
    'el módulo no confiesa que el asistente no puede contestar sobre él'
  )
})

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa shared/modulos.js.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: los ${MODULOS.length} módulos se mantienen separados.${c.reset}`)
