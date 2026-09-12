#!/usr/bin/env node
/**
 * scripts/verificar-codigos.mjs
 * ------------------------------------------------------------------
 * Que el catálogo de códigos de error del puente y el diccionario del tablero
 * digan lo mismo.
 *
 * ── POR QUÉ ESTO NECESITA UN GUION ─────────────────────────────────
 *
 * Porque el modo de fallo es SILENCIOSO, y además es un silencio cómodo.
 *
 * `useMensajeDeError` cae, a propósito, en el mensaje que redactó el servidor
 * cuando no conoce un código. Esa degradación es lo que permite desplegar un
 * backend nuevo contra un tablero viejo sin romper nada — pero también
 * significa que un código sin traducir NO se ve como un fallo: se ve como una
 * frase en español dentro de una interfaz en inglés, que es exactamente el
 * problema que los códigos venían a resolver.
 *
 * Sin esta comprobación, cada código nuevo que alguien añada al backend nace
 * ya roto para el inglés y nadie se entera.
 *
 * ── LAS TRES COSAS QUE MIRA ────────────────────────────────────────
 *
 *  1. **Todo código del backend tiene su frase en los DOS idiomas.** Es la que
 *     importa: es la que caza el código nuevo sin traducir.
 *  2. **El tablero no inventa códigos.** Una clave en `errors.json` que el
 *     backend no emite nunca es trabajo muerto, y peor: sugiere que ese caso
 *     está cubierto cuando no lo está.
 *  3. **Ninguna ruta responde un error sin código.** Un `reply.code(...).send({
 *     ok: false, error })` sin `codigo` compila, funciona y deja esa respuesta
 *     en español para siempre. Es el descuido fácil, y `responderError` existe
 *     precisamente para no cometerlo.
 *
 * ── POR QUÉ SE LEE EL FUENTE Y NO SE IMPORTA ───────────────────────
 *
 * El catálogo SÍ se importa —es un módulo puro sin dependencias—, pero las
 * rutas se leen como texto. Importarlas obligaría a levantar Fastify con toda
 * su configuración para mirar una forma sintáctica, y lo que se busca aquí es
 * justo eso: una forma, no un comportamiento. El comportamiento lo prueban
 * `test/rutas/` y `verificar-backend.mjs`.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-codigos.mjs
 *
 * Sin red, sin build. Entra solo en `npm run verificar` (Plan 20 F2).
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CODIGOS } from '../backend/http/codigos.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RUTAS = join(AQUI, '..', 'backend', 'routes')
const LOCALES = join(AQUI, '..', 'react-dashboard', 'src', 'i18n', 'locales')

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
    console.log(`    ${c.gris}${error.message.split('\n').slice(0, 8).join('\n    ')}${c.reset}`)
  }
}

/* ── Carga ───────────────────────────────────────────────────────────── */

const delBackend = Object.values(CODIGOS).sort()

const idiomas = readdirSync(LOCALES, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort()

/** El `errors.json` entero de cada idioma, para leer `codes` y `actions`. */
const erroresPorIdioma = Object.fromEntries(
  idiomas.map(idioma => [
    idioma,
    JSON.parse(readFileSync(join(LOCALES, idioma, 'errors.json'), 'utf8')),
  ])
)

/** `{ es: { ERROR_X: 'frase' }, en: {...} }` */
const delTablero = Object.fromEntries(
  idiomas.map(idioma => [idioma, erroresPorIdioma[idioma].codes ?? {}])
)

/**
 * `{ es: { ERROR_X: 'qué hacer' }, en: {...} }` — el «siguiente paso» del
 * Plan 24 F2 (`USO-04`).
 *
 * A diferencia de `codes`, esto es **opcional por código** y la comprobación de
 * abajo NUNCA exige que exista. Ver la cabecera de `useMensajeDeError.js`: de
 * los cuarenta y dos códigos, la mayoría no tiene nada que pedirle a un
 * operador de planta, y rellenar el hueco con «inténtalo de nuevo» enseña que
 * ese hueco no dice nada útil — que es cómo se deja de leer justo en los que sí.
 */
const accionesPorIdioma = Object.fromEntries(
  idiomas.map(idioma => [idioma, erroresPorIdioma[idioma].actions ?? {}])
)

/**
 * Los códigos que el tablero conoce y el backend NO emite.
 *
 * `ERROR_CONNECTION_FAILED`, `ERROR_TIMEOUT` y `ERROR_UNKNOWN` no son del
 * puente: los pone el propio navegador cuando la petición ni siquiera llega —
 * `fetch` rechaza— o cuando algo falla sin identidad. `ERROR_UNAUTHORIZED`,
 * `ERROR_FORBIDDEN` y `ERROR_NOT_FOUND` los responde la guarda de
 * autenticación y el 404 de la SPA, que viven fuera de `routes/`.
 */
const SOLO_DEL_TABLERO = new Set([
  'ERROR_CONNECTION_FAILED',
  'ERROR_TIMEOUT',
  'ERROR_UNKNOWN',
  'ERROR_UNAUTHORIZED',
  'ERROR_FORBIDDEN',
  'ERROR_NOT_FOUND',
])

console.log(`\n${c.negrita}Códigos de error${c.reset}: ${delBackend.length} en el puente  ${c.gris}(idiomas: ${idiomas.join(', ')})${c.reset}`)

/* ── 1 · Cada código del puente tiene su frase, en los dos idiomas ───── */

console.log('\n── Todo código del puente se sabe decir ─────────────────────')

for (const idioma of idiomas) {
  check(`«${idioma}»: ninguna frase falta`, () => {
    const faltan = delBackend.filter(codigo => {
      const frase = delTablero[idioma][codigo]
      return typeof frase !== 'string' || frase.trim() === ''
    })
    assert.ok(
      faltan.length === 0,
      `sin frase en "${idioma}" (${faltan.length}): ${faltan.join(', ')}`
    )
  })
}

/* ── 2 · El tablero no inventa códigos ───────────────────────────────── */

console.log('\n── El tablero no conoce códigos que no existan ──────────────')

check('ninguna clave de `errors:codes` sobra', () => {
  const conocidos = new Set(delBackend)
  const sobran = Object.keys(delTablero[idiomas[0]])
    .filter(k => !conocidos.has(k) && !SOLO_DEL_TABLERO.has(k))
    .sort()

  assert.ok(
    sobran.length === 0,
    `el tablero traduce códigos que el puente no emite (${sobran.length}): ${sobran.join(', ')}\n` +
    'Si es de verdad del navegador y no del puente, añádelo a SOLO_DEL_TABLERO con su motivo.'
  )
})

/* ── 2b · Las acciones que EXISTEN, existen en los dos idiomas ────────── */

console.log('\n── Lo que un error pide hacer, se sabe pedir en los dos ─────')

/*
 * La asimetría es el modo de fallo real aquí, y es del mismo tipo silencioso
 * que el resto de este guion: quien añade una acción la escribe en el idioma en
 * el que está pensando. La frase existe, se ve perfecta en su máquina, y en el
 * otro idioma el hueco de «qué hacer» simplemente no aparece — sin error, sin
 * aviso, y con el operador que habla el otro idioma sin la mitad útil del
 * mensaje.
 *
 * Lo que NO se comprueba, a propósito: que todo código tenga acción. Ver el
 * comentario de `accionesPorIdioma`.
 */
check('ninguna acción existe en un solo idioma', () => {
  const todas = new Set(idiomas.flatMap(i => Object.keys(accionesPorIdioma[i])))
  const cojas = []

  for (const codigo of [...todas].sort()) {
    const conAccion = idiomas.filter(i => String(accionesPorIdioma[i][codigo] ?? '').trim())
    if (conAccion.length !== idiomas.length) {
      const faltan = idiomas.filter(i => !conAccion.includes(i))
      cojas.push(`${codigo} — sólo en ${conAccion.join(', ')}; falta en ${faltan.join(', ')}`)
    }
  }

  assert.ok(
    cojas.length === 0,
    `acciones que no están en todos los idiomas (${cojas.length}):\n${cojas.map(x => `  ${x}`).join('\n')}\n` +
    'Una acción a medio traducir deja al operador del otro idioma sin el «qué hacer».'
  )
})

check('ninguna acción apunta a un código que no existe', () => {
  const conocidos = new Set([...delBackend, ...SOLO_DEL_TABLERO])
  const huerfanas = Object.keys(accionesPorIdioma[idiomas[0]])
    .filter(k => !conocidos.has(k))
    .sort()

  assert.ok(
    huerfanas.length === 0,
    `acciones para códigos que nadie emite (${huerfanas.length}): ${huerfanas.join(', ')}\n` +
    'Es trabajo muerto, y peor: sugiere que ese caso está cubierto cuando no lo está.'
  )
})

/* ── 3 · Ninguna ruta responde un error sin código ───────────────────── */

console.log('\n── Ninguna respuesta de error se queda sin identidad ─────────')

/**
 * Un error respondido sin `codigo`.
 *
 * Se busca `ok: false` y se mira si en las diez líneas siguientes aparece
 * `codigo`. Es una heurística sobre el texto —ver la cabecera sobre por qué no
 * se importan las rutas— y por eso el radio es generoso: un objeto de
 * respuesta de este árbol no pasa de ocho líneas.
 */
check('cada `ok: false` de una ruta lleva su `codigo`', () => {
  const huerfanos = []

  for (const archivo of readdirSync(RUTAS).filter(f => f.endsWith('.mjs'))) {
    const lineas = readFileSync(join(RUTAS, archivo), 'utf8').split('\n')

    for (let i = 0; i < lineas.length; i += 1) {
      if (!/\bok:\s*false\b/.test(lineas[i])) continue

      const ventana = lineas.slice(Math.max(0, i - 3), i + 10).join('\n')
      if (/\bcodigo\b/.test(ventana) || /responderError\(/.test(ventana)) continue

      huerfanos.push(`${archivo}:${i + 1}  ${lineas[i].trim().slice(0, 70)}`)
    }
  }

  assert.ok(
    huerfanos.length === 0,
    `respuestas de error sin código (${huerfanos.length}):\n${huerfanos.join('\n')}\n` +
    'Usa `responderError(reply, estado, CODIGOS.X, mensaje)` de `http/codigos.mjs`.'
  )
})

/* ── Resumen ─────────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} fallo(s).${c.reset}\n`)
} else {
  console.log(
    `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
    `${delBackend.length} códigos, todos con frase en ${idiomas.length} idiomas.${c.reset}\n`
  )
}

assert.equal(fallos.length, 0, `${fallos.length} comprobaciones de códigos fallaron`)
