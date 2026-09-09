#!/usr/bin/env node
/**
 * scripts/verificar-dominio.mjs
 * ------------------------------------------------------------------
 * Que la prosa del dominio se sepa decir en inglés, regla por regla.
 *
 * ── POR QUÉ ESTE Y NO LA PARIDAD DE `verificar-i18n.mjs` ───────────
 *
 * Porque el español de esta prosa NO está en el diccionario, y no debe estar:
 * lo escribe `shared/eva/` y lo consume también el backend para que el modelo
 * lo narre. `es/domain.json` está vacío a propósito y el español llega por
 * `defaultValue` (ver `i18n/useProsa.js`).
 *
 * Con ese diseño, comparar es↔en no dice nada. Lo que hay que comparar es el
 * inglés contra EL DOMINIO — que es la fuente de verdad, no un espejo del otro
 * idioma. Esta comprobación es por eso más fuerte que la que sustituye: una
 * regla nueva se caza aquí aunque nadie toque ningún JSON.
 *
 * ── EL MODO DE FALLO QUE CIERRA ────────────────────────────────────
 *
 * Una regla nueva en `shared/eva/tanque/riesgos.js` sale funcionando: se
 * evalúa, se pinta, y en un tablero en inglés aparece **en español**, porque
 * cae en el `defaultValue`. No hay error, no hay clave cruda en pantalla, no
 * falla ninguna prueba. Se descubre en planta, o no se descubre — que es
 * exactamente el patrón que ya obligó a escribir `verificar-textos.mjs`.
 *
 * ── QUÉ COMPRUEBA ──────────────────────────────────────────────────
 *
 *  1. **Cada id del dominio tiene su bloque en inglés**, con los campos de
 *     prosa que esa regla declara — ni de más ni de menos. Una regla sin
 *     `nota` no debe tener `nota` traducida: sería texto que no se pinta nunca.
 *  2. **Las cifras que cita el inglés existen.** Si la frase inglesa interpola
 *     `{{nivelTanque}}`, la regla tiene que declarar esa señal en `necesita` o
 *     emitirla en su `datos()`. Sin esto, el inglés enseñaría `{{nivelTanque}}`
 *     literal mientras el español sale bien, que es el peor reparto posible.
 *  3. **El inglés no inventa ids.** Un bloque en `en/domain.json` que no
 *     corresponde a ninguna regla es trabajo tirado, y sugiere cobertura que
 *     no existe.
 *
 * ── CÓMO LEE EL DOMINIO ────────────────────────────────────────────
 *
 * Importándolo. `shared/eva/` es dominio puro y se puede importar en Node sin
 * levantar nada (§2.7) — de hecho es la razón de que esa regla exista. Nada
 * de leer el fuente con expresiones regulares: si el catálogo cambia de forma,
 * este guion tiene que romperse, no adivinar.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-dominio.mjs
 *
 * Sin red, sin build. Entra solo en `npm run verificar` (Plan 20 F2).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { REGLAS as REGLAS_TANQUE } from '../shared/eva/tanque/riesgos.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const EN = join(AQUI, '..', 'react-dashboard', 'src', 'i18n', 'locales', 'en', 'domain.json')

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
    console.log(`    ${c.gris}${error.message.split('\n').slice(0, 10).join('\n    ')}${c.reset}`)
  }
}

const ingles = JSON.parse(readFileSync(EN, 'utf8'))

/** Los campos de prosa de una regla, en el orden en que se leen en la tarjeta. */
const CAMPOS = ['titulo', 'evidencia', 'consecuencia', 'accion', 'nota']

/** Las variables `{{asi}}` de una cadena. */
function variablesDe(texto) {
  const encontradas = String(texto ?? '').match(/\{\{\s*([\w.]+)[^}]*\}\}/g) ?? []
  return [...new Set(encontradas.map(v => v.replace(/[{}\s]/g, '').split(',')[0]))]
}

/**
 * Los nombres que una regla puede ofrecer para interpolar.
 *
 * Son las señales que declara necesitar más lo que emita su `datos()`. Se
 * llama a `datos()` con un objeto vacío porque las dos que existen hoy sólo
 * devuelven umbrales y no miran sus argumentos; si alguna llegara a mirarlos,
 * este `try` lo convierte en «no puedo comprobarlo» en vez de en una caída.
 */
function nombresDisponibles(regla) {
  const nombres = new Set(regla.necesita ?? [])
  try {
    for (const k of Object.keys(regla.datos?.({}, {}) ?? {})) nombres.add(k)
  } catch {
    return null
  }
  return nombres
}

/* ── Los catálogos que ya están migrados ─────────────────────────────── */

const CATALOGOS = [
  { nombre: 'riesgos del tanque', bloque: 'risks', entradas: REGLAS_TANQUE },
]

console.log(`\n${c.negrita}Prosa del dominio${c.reset}: ${CATALOGOS.map(x => `${x.entradas.length} ${x.nombre}`).join(', ')}`)

for (const { nombre, bloque, entradas } of CATALOGOS) {
  console.log(`\n── ${nombre} ──────────────────────────────────────────────`)

  check(`cada regla tiene su bloque en inglés, con sus campos`, () => {
    const problemas = []

    for (const regla of entradas) {
      const traducido = ingles[bloque]?.[regla.id]
      if (!traducido) {
        problemas.push(`«${regla.id}» no está traducida`)
        continue
      }

      for (const campo of CAMPOS) {
        const loTiene = regla[campo] !== undefined && regla[campo] !== null
        const traducidoLoTiene = typeof traducido[campo] === 'string' && traducido[campo].trim() !== ''

        if (loTiene && !traducidoLoTiene) problemas.push(`«${regla.id}» sin «${campo}»`)
        if (!loTiene && traducidoLoTiene) problemas.push(`«${regla.id}» traduce «${campo}», que la regla no tiene`)
      }
    }

    assert.ok(
      problemas.length === 0,
      `${problemas.length} problema(s):\n${problemas.join('\n')}\n` +
      'El inglés va en `react-dashboard/src/i18n/locales/en/domain.json`.'
    )
  })

  check('las cifras que cita el inglés las ofrece la regla', () => {
    const problemas = []

    for (const regla of entradas) {
      const disponibles = nombresDisponibles(regla)
      if (!disponibles) continue

      for (const campo of CAMPOS) {
        const texto = ingles[bloque]?.[regla.id]?.[campo]
        for (const variable of variablesDe(texto)) {
          if (!disponibles.has(variable)) {
            problemas.push(
              `«${regla.id}.${campo}» interpola {{${variable}}}, que la regla no ofrece ` +
              `(tiene: ${[...disponibles].join(', ') || '—'})`
            )
          }
        }
      }
    }

    assert.ok(problemas.length === 0, `${problemas.length} problema(s):\n${problemas.join('\n')}`)
  })

  check('el inglés no traduce ids que no existen', () => {
    const conocidos = new Set(entradas.map(r => r.id))
    const sobran = Object.keys(ingles[bloque] ?? {}).filter(id => !conocidos.has(id))

    assert.ok(
      sobran.length === 0,
      `traduce ids que el dominio no tiene (${sobran.length}): ${sobran.join(', ')}`
    )
  })
}

/* ── Resumen ─────────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} fallo(s).${c.reset}\n`)
} else {
  const total = CATALOGOS.reduce((n, x) => n + x.entradas.length, 0)
  console.log(
    `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
    `${total} entradas del dominio, todas con su inglés.${c.reset}\n`
  )
}

assert.equal(fallos.length, 0, `${fallos.length} comprobaciones del dominio fallaron`)
