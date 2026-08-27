#!/usr/bin/env node
/**
 * scripts/comprobar-historial-alarmas.mjs
 * ------------------------------------------------------------------
 * ¿Ya guarda el Alarm Historian de ICONICS?
 *
 * ── POR QUÉ EXISTE, Y POR QUÉ NO BASTA CON MIRAR SI DA ERROR ───────
 *
 * Porque en ICONICS hay DOS subsistemas de alarmas y se confunden:
 *
 *   Alarm Server     decide cuándo hay alarma y mantiene su estado AHORA.
 *                    Es lo que da los contadores del área, y funciona.
 *   Alarm Historian  guarda el registro de lo que pasó. Es otro servicio,
 *                    con su propia base de datos, y puede estar apagado sin
 *                    que el Alarm Server se entere ni se queje.
 *
 * Que el segundo esté caído no se nota en ninguna pantalla: las alarmas siguen
 * saltando y reconociéndose con normalidad. Lo único que falta es poder mirar
 * atrás — y eso sólo se descubre el día que hace falta.
 *
 * Por eso este comprobador mira PRIMERO el Alarm Server. Si los contadores no
 * responden, el problema no es del historial y buscarlo ahí es perder el rato.
 *
 * ── USO ───────────────────────────────────────────────────────────
 *
 *   node scripts/comprobar-historial-alarmas.mjs
 *   node scripts/comprobar-historial-alarmas.mjs 24     (últimas 24 h)
 *
 * Necesita el backend levantado en el 3001.
 */
const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', ambar: '\x1b[33m',
  gris: '\x1b[90m', negrita: '\x1b[1m', reset: '\x1b[0m',
}

const BASE = 'http://127.0.0.1:3001'
const HORAS = Number(process.argv[2]) || 4

/**
 * Las áreas que se prueban.
 *
 * Se prueban VARIAS a propósito: si sólo fallara la de vibraciones, sería su
 * configuración; si fallan todas, es el servicio. Esa diferencia es la que
 * decide dónde hay que ir a tocar, y no se ve probando una sola.
 */
const AREAS = ['ae:/DEMO VIBRACIONES', 'ae:/DEMO', 'ae:']

async function contador(punto) {
  const u = new URL(`${BASE}/api/iconics/data`)
  u.searchParams.set('pointName', punto)
  try {
    const j = await (await fetch(u)).json()
    const p = j?.payload
    return p && p.quality === 0 && p.value !== undefined ? p.value : null
  } catch {
    return null
  }
}

async function historial(area) {
  const u = new URL(`${BASE}/api/iconics/alarms`)
  u.searchParams.set('pointName', area)
  u.searchParams.set('hours', String(HORAS))
  try {
    const j = await (await fetch(u)).json()
    if (!j?.ok) return { estado: 'error', detalle: `HTTP ${j?.status ?? '?'}` }
    const lista = j.alarms ?? j.payload ?? []
    const n = Array.isArray(lista) ? lista.length : 0
    return n > 0 ? { estado: 'datos', n } : { estado: 'vacio', n: 0 }
  } catch (e) {
    return { estado: 'error', detalle: e.message }
  }
}

console.log(`\n${c.negrita}Alarmas de ICONICS · últimas ${HORAS} h${c.reset}\n`)

/* ── 1. El Alarm Server, que es el que decide si hay alarma ───────── */

console.log(`${c.negrita}Alarm Server${c.reset} — el estado de AHORA`)
const contadores = [
  ['Activas sin reconocer', '=ActiveUnackedCount'],
  ['Activas reconocidas', '=ActiveAckedCount'],
  ['Normales sin reconocer', '=NormalUnackedCount'],
]
let servidorVivo = false
for (const [label, sufijo] of contadores) {
  const v = await contador(`ae:/DEMO VIBRACIONES${sufijo}`)
  if (v !== null) servidorVivo = true
  console.log(`  ${v === null ? `${c.rojo}✗${c.reset}` : `${c.verde}✓${c.reset}`} ${label.padEnd(26)} ${v ?? 'sin lectura'}`)
}

if (!servidorVivo) {
  console.log(`\n${c.rojo}${c.negrita}El Alarm Server no contesta.${c.reset}`)
  console.log('El historial es lo de menos: primero tiene que responder el servidor.')
  console.log(`  ${c.gris}curl ${BASE}/api/health${c.reset}\n`)
  process.exit(1)
}

/* ── 2. El Alarm Historian, que es otro servicio ──────────────────── */

console.log(`\n${c.negrita}Alarm Historian${c.reset} — el registro de lo que PASÓ`)
const res = []
for (const area of AREAS) {
  const r = await historial(area)
  res.push({ area, ...r })
  const marca = r.estado === 'datos' ? `${c.verde}✓${c.reset}`
    : r.estado === 'vacio' ? `${c.ambar}~${c.reset}` : `${c.rojo}✗${c.reset}`
  const cifras = r.estado === 'datos' ? `${r.n} eventos`
    : r.estado === 'vacio' ? '0 eventos   (responde, pero no hay nada)'
      : r.detalle
  console.log(`  ${marca} ${area.padEnd(24)} ${cifras}`)
}

const conDatos = res.filter((r) => r.estado === 'datos').length
const errores = res.filter((r) => r.estado === 'error').length

console.log()
if (conDatos) {
  console.log(`${c.verde}${c.negrita}Guarda. ${conDatos} de ${res.length} áreas devuelven eventos.${c.reset}`)
  console.log('Ya se puede pintar QUÉ alarma saltó y cuándo, en vez de sólo cuántas hay.')
} else if (errores === res.length) {
  console.log(`${c.rojo}${c.negrita}No guarda: fallan las ${errores} áreas.${c.reset}`)
  /* Todas a la vez es el dato que importa: si fuera configuración de un área,
     las otras irían. Que caigan todas apunta al servicio o a su base de datos. */
  console.log('Fallan TODAS, incluida la del tanque y la raíz. Eso no es la')
  console.log('configuración de un área: es el servicio de historial de alarmas')
  console.log('o su base de datos. En Workbench, bajo «Alarms and Notifications»:')
  console.log(`  ${c.gris}·${c.reset} Alarm Historian → que tenga conexión a base de datos y que pruebe bien`)
  console.log(`  ${c.gris}·${c.reset} que haya una suscripción a las áreas que se quieren guardar`)
  console.log(`  ${c.gris}·${c.reset} que la configuración se haya APLICADO tras editarla`)
  console.log(`  ${c.gris}·${c.reset} que el servicio del logger esté arrancado (services.msc)`)
} else {
  console.log(`${c.ambar}${c.negrita}Responde sin eventos.${c.reset}`)
  console.log(`Se acaba de activar, o no ha saltado ninguna alarma en ${HORAS} h.`)
  console.log(`  ${c.gris}node scripts/comprobar-historial-alarmas.mjs 48${c.reset}`)
}
console.log()
