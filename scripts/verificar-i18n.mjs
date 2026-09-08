#!/usr/bin/env node
/**
 * scripts/verificar-i18n.mjs
 * ------------------------------------------------------------------
 * Que los dos idiomas digan las mismas cosas, y que nadie pinte una clave.
 *
 * ── POR QUÉ HACE FALTA UNA COMPROBACIÓN Y NO BASTA CON MIRAR ───────
 *
 * Porque el modo de fallo de i18n es silencioso, igual que el de la guarda de
 * autenticación del Plan 20 F5. Una clave que falta en inglés no rompe nada:
 * `fallbackLng` la sirve en español, la pantalla funciona, las pruebas pasan,
 * y lo único que ocurre es que un tablero configurado en inglés enseña una
 * frase en español en medio. Eso no se descubre revisando un diff — se
 * descubre en planta, o no se descubre.
 *
 * Y al revés: una clave que sólo existe en inglés es trabajo tirado que nadie
 * ve, porque el idioma por defecto nunca la pide.
 *
 * ── QUÉ COMPRUEBA ──────────────────────────────────────────────────
 *
 *  1. **Paridad de árboles.** Los mismos namespaces y, dentro de cada uno,
 *     exactamente las mismas claves hoja en los dos idiomas.
 *  2. **Ninguna traducción vacía.** Una cadena vacía pasa la paridad y en
 *     pantalla es un hueco: parece un fallo de datos, no de traducción.
 *  3. **Las interpolaciones coinciden.** Si el español dice `{{machine}}` y el
 *     inglés no, el inglés pierde el dato — y al revés, el inglés enseña
 *     `{{machine}}` literal. El orden puede cambiar entre idiomas (para eso se
 *     interpola), pero el CONJUNTO de variables no.
 *  4. **Toda ruta del registro tiene su texto.** `app/routes/routes.jsx` ya no
 *     lleva título ni subtítulo: los toma de `navigation.json` por su `id`.
 *     Añadir una ruta y olvidar su bloque deja el Topbar pintando
 *     `navigation:routes.lo-que-sea.title`, y esto lo caza antes.
 *
 * ── LO QUE NO COMPRUEBA ────────────────────────────────────────────
 *
 * Si una traducción es BUENA. Que `fault` esté bien elegido frente a `failure`
 * no lo decide un script; eso es el glosario del Plan 23 y la revisión de
 * quien sepa del dominio. Aquí sólo se comprueba que no falte y que no mienta
 * sobre sus variables.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-i18n.mjs
 *
 * Sin red, sin build. Entra solo en `npm run verificar` (Plan 20 F2).
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ_LOCALES = join(AQUI, '..', 'react-dashboard', 'src', 'i18n', 'locales')
const RUTAS_JSX = join(AQUI, '..', 'react-dashboard', 'src', 'app', 'routes', 'routes.jsx')

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
    console.log(`    ${c.gris}${error.message.split('\n').slice(0, 6).join('\n    ')}${c.reset}`)
  }
}

/* ── Carga ───────────────────────────────────────────────────────────── */

const idiomas = readdirSync(RAIZ_LOCALES, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort()

/** `{ es: { common: {...}, ... }, en: {...} }` */
const arboles = Object.fromEntries(
  idiomas.map(idioma => {
    const dir = join(RAIZ_LOCALES, idioma)
    const namespaces = Object.fromEntries(
      readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(dir, f), 'utf8'))])
    )
    return [idioma, namespaces]
  })
)

/** Todas las claves HOJA de un objeto, en notación con puntos. */
function hojas(objeto, prefijo = '') {
  const salida = []
  for (const [k, v] of Object.entries(objeto ?? {})) {
    const ruta = prefijo ? `${prefijo}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) salida.push(...hojas(v, ruta))
    else salida.push(ruta)
  }
  return salida
}

/** El valor de una clave con puntos. */
function valorEn(objeto, ruta) {
  return ruta.split('.').reduce((o, k) => o?.[k], objeto)
}

/** Las variables `{{asi}}` de una cadena, como conjunto ordenado. */
function variablesDe(texto) {
  const encontradas = String(texto ?? '').match(/\{\{\s*([\w.]+)[^}]*\}\}/g) ?? []
  return [...new Set(encontradas.map(v => v.replace(/[{}\s]/g, '').split(',')[0]))].sort()
}

const REFERENCIA = idiomas.includes('es') ? 'es' : idiomas[0]
const otros = idiomas.filter(i => i !== REFERENCIA)

console.log(`\n${c.negrita}Idiomas${c.reset}: ${idiomas.join(', ')}  ${c.gris}(referencia: ${REFERENCIA})${c.reset}`)

/* ── 1 · Los mismos namespaces ───────────────────────────────────────── */

console.log('\n── Los dos idiomas tienen la misma forma ────────────────────')

check('los mismos namespaces en todos los idiomas', () => {
  const referencia = Object.keys(arboles[REFERENCIA]).sort()
  for (const idioma of otros) {
    const suyos = Object.keys(arboles[idioma]).sort()
    const faltan = referencia.filter(n => !suyos.includes(n))
    const sobran = suyos.filter(n => !referencia.includes(n))
    assert.ok(
      faltan.length === 0 && sobran.length === 0,
      `"${idioma}": faltan [${faltan.join(', ') || '—'}] · sobran [${sobran.join(', ') || '—'}]`
    )
  }
})

/* ── 2 · Las mismas claves dentro de cada namespace ──────────────────── */

for (const ns of Object.keys(arboles[REFERENCIA]).sort()) {
  check(`«${ns}»: mismas claves en los ${idiomas.length} idiomas`, () => {
    const referencia = hojas(arboles[REFERENCIA][ns]).sort()

    for (const idioma of otros) {
      const suyas = hojas(arboles[idioma]?.[ns] ?? {}).sort()
      const faltan = referencia.filter(k => !suyas.includes(k))
      const sobran = suyas.filter(k => !referencia.includes(k))

      const detalle = []
      if (faltan.length) detalle.push(`faltan en "${idioma}" (${faltan.length}): ${faltan.slice(0, 8).join(', ')}${faltan.length > 8 ? '…' : ''}`)
      if (sobran.length) detalle.push(`sólo en "${idioma}" (${sobran.length}): ${sobran.slice(0, 8).join(', ')}${sobran.length > 8 ? '…' : ''}`)

      assert.ok(detalle.length === 0, detalle.join('\n'))
    }
  })
}

/* ── 3 · Nada vacío ──────────────────────────────────────────────────── */

console.log('\n── Ninguna traducción es un hueco ───────────────────────────')

check('ninguna clave tiene el texto vacío', () => {
  const vacias = []
  for (const idioma of idiomas) {
    for (const [ns, arbol] of Object.entries(arboles[idioma])) {
      for (const clave of hojas(arbol)) {
        const v = valorEn(arbol, clave)
        if (typeof v === 'string' && v.trim() === '') vacias.push(`${idioma}:${ns}:${clave}`)
      }
    }
  }
  assert.ok(vacias.length === 0, `vacías (${vacias.length}): ${vacias.slice(0, 10).join(', ')}`)
})

/* ── 4 · Las interpolaciones coinciden ───────────────────────────────── */

console.log('\n── Las variables de una frase son las mismas en los dos ─────')

check('cada clave interpola las MISMAS variables en todos los idiomas', () => {
  const desajustes = []

  for (const [ns, arbol] of Object.entries(arboles[REFERENCIA])) {
    for (const clave of hojas(arbol)) {
      const esperadas = variablesDe(valorEn(arbol, clave))

      for (const idioma of otros) {
        const suyo = valorEn(arboles[idioma]?.[ns] ?? {}, clave)
        if (suyo === undefined) continue // ya lo cuenta la paridad de arriba
        const suyas = variablesDe(suyo)
        if (esperadas.join('|') !== suyas.join('|')) {
          desajustes.push(
            `${ns}:${clave} → ${REFERENCIA} usa [${esperadas.join(', ') || '—'}] y ${idioma} usa [${suyas.join(', ') || '—'}]`
          )
        }
      }
    }
  }

  assert.ok(desajustes.length === 0, desajustes.slice(0, 8).join('\n'))
})

/* ── 5 · Toda ruta tiene su texto ────────────────────────────────────── */

console.log('\n── Ninguna ruta se queda sin rótulo ─────────────────────────')

check('cada ruta de `routes.jsx` tiene title, nav y sub en todos los idiomas', () => {
  /*
   * Se leen los ids del REGISTRO y no de una lista escrita aquí: una lista
   * paralela se queda vieja en cuanto alguien añada una pantalla, que es
   * justo el caso que esta comprobación existe para cazar.
   *
   * Las rutas sin `nav` (Detalle, Cierre de diagnóstico, Alarmas) existen y
   * son navegables por id, así que necesitan `title` y `sub` igual; su `nav`
   * se exige también porque el día que vuelvan al sidebar nadie se acordará
   * de añadirlo, y una entrada de menú vacía es peor que una ausente.
   */
  const fuente = readFileSync(RUTAS_JSX, 'utf8')
  const ids = [...fuente.matchAll(/^\s*id:\s*["']([^"']+)["'],/gm)].map(m => m[1])

  assert.ok(ids.length > 0, 'no se pudo leer ningún id de routes.jsx — ¿cambió su forma?')

  const huecos = []
  for (const idioma of idiomas) {
    const rutas = arboles[idioma]?.navigation?.routes ?? {}
    for (const id of ids) {
      for (const campo of ['title', 'nav', 'sub']) {
        if (!rutas[id]?.[campo]) huecos.push(`${idioma}:navigation:routes.${id}.${campo}`)
      }
    }
  }

  assert.ok(
    huecos.length === 0,
    `${ids.length} rutas en el registro · sin rótulo (${huecos.length}):\n${huecos.slice(0, 10).join('\n')}`
  )
})

check('no sobra en el locale ninguna ruta que ya no exista', () => {
  // Al revés que la anterior: texto de una pantalla borrada que nadie quitó.
  const fuente = readFileSync(RUTAS_JSX, 'utf8')
  const ids = new Set([...fuente.matchAll(/^\s*id:\s*["']([^"']+)["'],/gm)].map(m => m[1]))
  const sobran = Object.keys(arboles[REFERENCIA]?.navigation?.routes ?? {}).filter(id => !ids.has(id))

  assert.ok(sobran.length === 0, `rutas en el locale que no están en el registro: ${sobran.join(', ')}`)
})

/* ── Resultado ───────────────────────────────────────────────────────── */


if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  process.exit(1)
}

const claves = Object.values(arboles[REFERENCIA]).reduce((n, a) => n + hojas(a).length, 0)
console.log(
  `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `${claves} claves × ${idiomas.length} idiomas, con paridad.${c.reset}`
)
