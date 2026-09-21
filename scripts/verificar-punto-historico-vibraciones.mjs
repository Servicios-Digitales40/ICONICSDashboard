#!/usr/bin/env node
/**
 * scripts/verificar-punto-historico-vibraciones.mjs
 * ------------------------------------------------------------------
 * El nombre con el que se le pide la SERIE a vibraciones, sin red.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Porque este proyecto ha perdido su historia DOS veces por lo mismo, y las
 * dos el síntoma fue «no hay datos» en vez de un error:
 *
 *   09-09-2026  una reorganización del árbol rompió el histórico de doce de
 *               las trece ramas del tanque (el incidente B10).
 *   21-09-2026  vibraciones llevaba semanas pidiendo su serie al grupo
 *               `DEMO 3`, que había dejado de existir. Se leyó como «el
 *               historiador no registra»; sí registraba.
 *
 * Las dos veces había pruebas en verde. Ninguna miraba el NOMBRE con el que
 * se pide la serie, porque comprobarlo de verdad exige red — y lo que sí se
 * puede comprobar sin red es que el nombre tenga la FORMA del árbol real, que
 * es lo que caducó.
 *
 * ── LO QUE ESTO NO PUEDE HACER, Y NO FINGE HACER ───────────────────
 *
 * **Decir si el grupo existe hoy en ICONICS.** Eso necesita planta, y lo hace
 * `comprobar-historia-vibraciones.mjs`. Aquí se fija lo medido el 21-09-2026
 * contra el servidor real, para que un cambio que se aleje de esa forma no
 * pase callando. Si el árbol vuelve a cambiar, este guion se pone rojo y hay
 * que venir a actualizarlo A PROPÓSITO — que es justamente lo que no pasó las
 * dos veces anteriores.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-punto-historico-vibraciones.mjs
 */
import assert from 'node:assert/strict'

import {
  CANALES,
  GRUPO_HISTORIADOR,
  historizadas,
  puntoHistorico,
  VARIADOR,
} from '../shared/eva/vibraciones/vibraciones.js'

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

const B = String.fromCharCode(92)

/**
 * El árbol REAL, volcado el 21-09-2026 con `browse()` contra el servidor.
 * Las cinco carpetas del grupo y cuántos tags cuelga cada una.
 */
const CARPETAS_REALES = { S1: 24, S2: 24, S3: 24, V20: 18, Jaritza: 4 }

console.log(`\n${c.negrita}El nombre del punto histórico de vibraciones${c.reset}\n`)

/* ── El grupo ────────────────────────────────────────────────────────── */

check('el grupo es el que existe hoy en el servidor, no el que existió', () => {
  assert.equal(GRUPO_HISTORIADOR, `hda:${B}Configuration${B}DEMO_VIBRACIONES${B}`)
})

check('no queda ni rastro de `DEMO 3`, que devuelve 500 desde el servidor', () => {
  assert.ok(
    !GRUPO_HISTORIADOR.includes('DEMO 3'),
    'el grupo `DEMO 3` ya no existe: explorarlo da 500 y pedirle serie, ok=false',
  )
})

check('el grupo termina en separador de carpeta, no en `:`', () => {
  /* El grupo viejo era plano y el nombre acababa en `:` porque el tag iba
     pegado. El nuevo agrupa por apoyo, así que lo que sigue es una CARPETA. */
  assert.ok(GRUPO_HISTORIADOR.endsWith(B), 'agrupa por apoyo: detrás va una carpeta')
  assert.ok(!GRUPO_HISTORIADOR.endsWith(':'), 'el tag ya no va pegado al grupo')
})

/* ── La forma de cada punto ──────────────────────────────────────────── */

check('todo punto cuelga de una carpeta que existe en el árbol real', () => {
  for (const clave of historizadas()) {
    const punto = puntoHistorico(clave)
    assert.ok(punto, `«${clave}» está en la lista y no compone punto`)

    const resto = punto.slice(GRUPO_HISTORIADOR.length)
    const carpeta = resto.split(':')[0]
    assert.ok(
      carpeta in CARPETAS_REALES,
      `«${clave}» cuelga de «${carpeta}», que no está en el árbol ` +
      `(${Object.keys(CARPETAS_REALES).join(', ')})`,
    )
  }
})

check('cada punto lleva UN separador de tag, y detrás un tag no vacío', () => {
  for (const clave of historizadas()) {
    const resto = puntoHistorico(clave).slice(GRUPO_HISTORIADOR.length)
    const trozos = resto.split(':')
    assert.equal(trozos.length, 2, `«${clave}» no tiene la forma carpeta:tag → ${resto}`)
    assert.ok(trozos[1].length, `«${clave}» compone un tag vacío`)
  }
})

check('los tres apoyos piden su serie a la carpeta de su propio apoyo', () => {
  for (const canal of CANALES) {
    const clave = `vRMS_${canal.sufijo}`
    assert.equal(
      puntoHistorico(clave),
      `${GRUPO_HISTORIADOR}${canal.sufijo}:vRMS_${canal.sufijo}`,
      `«${clave}» tiene que colgar de ${canal.sufijo}`,
    )
  }
})

check('el variador pide a V20, que es donde viven sus tags `_BMS`', () => {
  for (const v of VARIADOR) {
    const punto = puntoHistorico(v.key)
    if (!punto) continue
    assert.ok(
      punto.startsWith(`${GRUPO_HISTORIADOR}V20:`),
      `«${v.key}» no cuelga de V20 → ${punto}`,
    )
  }
})

/* ── La lista blanca, contra lo sondeado ─────────────────────────────── */

check('son 36 las claves con serie: las 40 de antes menos las 4 que no existen', () => {
  assert.equal(historizadas().length, 36)
})

check('las cuatro señales de AVISO están fuera: su tag no existe en el árbol', () => {
  /* `Warning_S1/S2/S3` y `WARNING_BMS`. Sondeados los 94 tags del grupo el
     21-09-2026: no aparecen bajo ningún nombre. */
  for (const clave of ['aviso_S1', 'aviso_S2', 'aviso_S3', 'aviso']) {
    assert.equal(
      puntoHistorico(clave), null,
      `«${clave}» compone un punto que el servidor no tiene`,
    )
  }
})

check('`aPeak_S1` sigue fuera: devuelve la serie de `aRMS_S1`, 1805 de 1805', () => {
  /* Medido el 21-09-2026. El servidor contesta sin error, que es lo que hace
     esto peligroso: no es un hueco, es la señal equivocada con su rótulo. */
  assert.equal(puntoHistorico('aPeak_S1'), null)
  assert.ok(puntoHistorico('aPeak_S2'), '`aPeak_S2` sí tiene serie propia (3 de 321)')
  assert.ok(puntoHistorico('aPeak_S3'), '`aPeak_S3` sí tiene serie propia')
})

check('ninguna clave fuera de la lista compone un punto', () => {
  for (const clave of ['MonState_vRMS_S1', 'sensor_S1', 'inventada_S9']) {
    assert.equal(puntoHistorico(clave), null, `«${clave}» no debería componer punto`)
  }
})

/* ── Resumen ─────────────────────────────────────────────────────────── */

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(
    `${c.gris}Si el árbol del historiador cambió de verdad, actualiza ` +
    `GRUPO_HISTORIADOR\ny CARPETAS_REALES a la vez — y vuelve a sondear las ` +
    `series antes de fiarte.${c.reset}`,
  )
  process.exit(1)
}
console.log(
  `${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `${historizadas().length} claves piden su serie por un nombre con la forma ` +
  `del árbol real.${c.reset}`,
)
