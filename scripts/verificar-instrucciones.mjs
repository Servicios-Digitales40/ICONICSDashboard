/**
 * Las instrucciones del sistema no se contradicen con el registro.
 *
 *   node scripts/verificar-instrucciones.mjs
 *
 * ── QUÉ VIGILA, Y POR QUÉ HACE FALTA VIGILARLO ─────────────────────
 *
 * El prompt es programa (ver la cabecera de `instrucciones` en `chat.mjs`),
 * pero se edita como prosa: se añade una regla al final, se cambia una frase,
 * y no falla nada. Hasta el Plan 20 F7 el resultado se veía a simple vista:
 *
 *   · Había DOS reglas «10.», dos «11.», dos «12.», dos «13.» y dos «14.».
 *   · Afirmaba «El servidor publica OCHO señales y nada más» y «Sólo CUATRO de
 *     las ocho tienen historia», mientras el catálogo que iba DEBAJO, en el
 *     mismo mensaje, enseñaba las dos máquinas y sus 50 señales.
 *
 * Lo segundo es lo grave: una contradicción dentro del propio prompt. Un modelo
 * pequeño se queda con una de las dos afirmaciones y no se puede elegir cuál.
 *
 * Esto lo comprueba sin arrancar nada: el prompt se genera en proceso y se
 * contrasta contra `SISTEMAS`. No necesita GPU, ni ICONICS, ni red — corre en
 * la tanda de `verificar-todo.mjs` como uno más.
 */
import assert from 'node:assert/strict'

import { instrucciones, REGLAS } from '../backend/ia/conversacion/chat.mjs'
import { SISTEMAS } from '../shared/eva/comun/sistemas.js'

const c = {
  reset: '\x1b[0m',
  negrita: '\x1b[1m',
  verde: '\x1b[32m',
  rojo: '\x1b[31m',
}

let fallos = 0

function check(nombre, fn) {
  try {
    fn()
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos += 1
    console.log(`  ${c.rojo}✗ ${nombre}${c.reset}`)
    console.log(`    ${error.message.split('\n')[0]}`)
  }
}

/** El prompt tal y como lo recibe el modelo, con un catálogo de mentira. */
const CATALOGO = '  nivel del tanque (%) · Tanque · con historia'
const PROMPT = instrucciones(CATALOGO, 3)

/**
 * El número con el que arranca cada regla.
 *
 * `\s{1,2}` y no `\s{2}`: el número va justificado a cuatro caracteres, así
 * que «9.» lleva dos espacios detrás y «10.» sólo uno. Con dos fijos, esta
 * expresión encontraba nueve reglas de veintiséis y la comprobación de
 * duplicados pasaba sin mirar el tramo donde estaban TODOS los duplicados que
 * este verificador existe para atrapar.
 */
const NUMERO_DE_REGLA = /^(\d+)\.\s{1,2}\S/gm

/**
 * El prompt con los saltos de línea colapsados.
 *
 * Las reglas se parten en varias líneas a 96 caracteres, así que buscar una
 * frase literal en el texto crudo falla en cuanto la frase cruza un salto —y
 * falla en silencio, dando por perdida una regla que sí está.
 */
const PROMPT_PLANO = PROMPT.replace(/\s+/g, ' ')

console.log(`\n${c.negrita}Instrucciones del sistema${c.reset}\n`)

/* ── Numeración ───────────────────────────────────────────────────── */

check('ninguna regla comparte número con otra', () => {
  const numeros = [...PROMPT.matchAll(NUMERO_DE_REGLA)].map(m => Number(m[1]))
  const repetidos = numeros.filter((n, i) => numeros.indexOf(n) !== i)

  assert.deepEqual(
    [...new Set(repetidos)],
    [],
    `Estos números aparecen más de una vez en el prompt: ${[...new Set(repetidos)].join(', ')}. ` +
      'Las reglas se numeran solas desde el arreglo REGLAS; si esto falla, alguien volvió a ' +
      'escribir un número a mano.'
  )
})

check('la numeración es consecutiva desde 1', () => {
  const numeros = [...PROMPT.matchAll(NUMERO_DE_REGLA)].map(m => Number(m[1]))
  const esperados = Array.from({ length: numeros.length }, (_, i) => i + 1)
  assert.deepEqual(numeros, esperados)
})

check('el arreglo de reglas y el prompt cuentan lo mismo', () => {
  const numeros = [...PROMPT.matchAll(NUMERO_DE_REGLA)].map(m => Number(m[1]))
  // `REGLAS` más la del presupuesto de pasos, que se compone aparte porque
  // depende de `maxPasos` y no es una constante del archivo.
  assert.equal(numeros.length, REGLAS.length + 1)
})

/* ── Coherencia con el registro ───────────────────────────────────── */

check('cada sistema del registro aparece nombrado en el prompt', () => {
  for (const sistema of SISTEMAS) {
    assert.ok(
      PROMPT_PLANO.includes(sistema.nombre),
      `El sistema "${sistema.id}" (${sistema.nombre}) está dado de alta en SISTEMAS y no ` +
        'aparece en las instrucciones. El asistente contestará sobre una máquina que no sabe ' +
        'que existe.'
    )
  }
})

check('el recuento de señales de cada sistema sale del registro', () => {
  for (const sistema of SISTEMAS) {
    const claves = sistema.claves().length
    const conSerie = sistema.claves().filter(clave => sistema.esHistorizada(clave)).length
    assert.ok(
      PROMPT_PLANO.includes(`${claves} señales, ${conSerie} con serie propia`),
      `No encuentro el recuento de "${sistema.id}" (${claves} señales, ${conSerie} con serie ` +
        'propia) en el prompt. Si se escribió a mano, ya está desactualizado.'
    )
  }
})

check('las limitaciones de cada sistema viajan enteras', () => {
  // `limitaciones` no es documentación: es lo que hay que decir en voz alta al
  // contestar sobre esa máquina. Una que no llegue al prompt es una afirmación
  // que el modelo hará sin la salvedad que la acompaña.
  for (const sistema of SISTEMAS) {
    for (const limite of sistema.limitaciones) {
      assert.ok(
        PROMPT_PLANO.includes(limite.replace(/\s+/g, ' ')),
        `Falta una limitación de "${sistema.id}": «${limite.slice(0, 60)}…»`
      )
    }
  }
})

check('no queda ninguna cifra de catálogo escrita a mano', () => {
  /*
   * Las dos frases concretas que estaban mal, para que no vuelvan por copia y
   * pega. No es una prueba de estilo: cada una afirmaba un número que el
   * catálogo de abajo desmentía en el mismo mensaje.
   */
  const PROHIBIDAS = [
    /publica OCHO se[ñn]ales y nada m[áa]s/i,
    /S[óo]lo CUATRO de las ocho/i,
    /las cuatro que el historiador guarda/i,
  ]
  for (const patron of PROHIBIDAS) {
    assert.ok(
      !patron.test(PROMPT_PLANO),
      `El prompt vuelve a llevar una cifra de catálogo a mano: ${patron}. Sale del registro ` +
        '(ver `inventarioDeLaPlanta`), no se escribe.'
    )
  }
})

check('el tope de pasos que se le dice al modelo es el que se le aplica', () => {
  // Se le prometía «hasta 3 consultas» con un `maxPasos` que viene de la
  // configuración: si la variable sube y el texto no, el modelo se autolimita
  // por una frase.
  for (const pasos of [1, 3, 5]) {
    assert.ok(
      instrucciones(CATALOGO, pasos).replace(/\s+/g, ' ').includes(`encadenar hasta ${pasos} consultas`),
      `Con maxPasos=${pasos}, el prompt no dice ese número.`
    )
  }
})

/* ── Lo que el prompt no puede perder ─────────────────────────────── */

check('siguen estando las prohibiciones que sostienen la veracidad', () => {
  const IMPRESCINDIBLES = [
    'NUNCA inventes una cifra',
    'NUNCA inventes una unidad',
    'NUNCA pongas plazo a una avería',
    'CORRELACIÓN NO ES CAUSA',
    'NO digas que está todo bien',
  ]
  for (const frase of IMPRESCINDIBLES) {
    assert.ok(PROMPT_PLANO.includes(frase), `Ha desaparecido del prompt: «${frase}»`)
  }
})

check('ninguna regla se queda sin texto', () => {
  for (const [i, regla] of REGLAS.entries()) {
    assert.ok(
      typeof regla === 'string' && regla.trim().length > 40,
      `La regla ${i + 1} está vacía o es demasiado corta para decir nada.`
    )
  }
})

if (fallos) {
  console.log(`\n${c.rojo}${c.negrita}${fallos} comprobación(es) fallaron${c.reset}\n`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}Todo en orden${c.reset} (${REGLAS.length + 1} reglas, ${SISTEMAS.length} sistemas)\n`)
