#!/usr/bin/env node
/**
 * scripts/comprobar-historia-vibraciones.mjs
 * ------------------------------------------------------------------
 * ¿Ya registra el grupo `DEMO 3` del Hyper Historian?
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────
 *
 * Porque «activar el registro» se hace en Workbench, a mano, y hasta ahora la
 * única forma de saber si había funcionado era preguntar. Esto lo contesta en
 * diez segundos y sin abrir el navegador.
 *
 * Y sobre todo: distingue las TRES cosas que se confunden entre sí.
 *
 *   el tag no existe        el nombre está mal escrito
 *   existe y no registra    está en la configuración pero nadie lo recoge
 *   registra y no hay datos recoge desde hace un rato, pero la máquina estuvo
 *                           parada todo ese rato
 *
 * La tercera es la que engaña: se ve igual que la segunda si sólo se mira si
 * vuelve una lista vacía. Por eso se compara SIEMPRE contra `DEMO DANONE`, que
 * es el grupo que sí registra: si el de control también viene vacío, el
 * problema no es de vibraciones.
 *
 * ── USO ───────────────────────────────────────────────────────────
 *
 *   node scripts/comprobar-historia-vibraciones.mjs
 *   node scripts/comprobar-historia-vibraciones.mjs 72     (últimas 72 h)
 *
 * Necesita el backend levantado en el 3001.
 */
const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', ambar: '\x1b[33m',
  gris: '\x1b[90m', negrita: '\x1b[1m', reset: '\x1b[0m',
}

const B = String.fromCharCode(92)
const RAIZ = `hda:${B}Configuration${B}`
const HORAS = Number(process.argv[2]) || 24
const BASE = 'http://127.0.0.1:3001'

/** El grupo que SÍ registra. Sin este control, un fallo general parece local. */
const CONTROL = { grupo: 'DEMO DANONE', tag: 'Tension' }

const VIBRACION = [
  'vRMS_S1', 'vRMS_S2', 'vRMS_S3',
  'aRMS_S1', 'aRMS_S2', 'aRMS_S3',
  'DKW_S1', 'DKW_S2', 'DKW_S3',
  'SPEED_BMS', 'TORQUE_BMS', 'FREQ OUTPUT_BMS',
]

const fin = new Date()
const inicio = new Date(fin.getTime() - HORAS * 3600 * 1000)

/**
 * Muestras de un punto en la ventana.
 *
 * Devuelve `{ estado, n, min, max }` donde `estado` es lo único que importa:
 * `"datos"`, `"vacio"` (registra pero no hay nada en la ventana) o `"error"`
 * (no registra, o el nombre está mal).
 */
async function serie(punto) {
  const u = new URL(`${BASE}/api/iconics/history`)
  u.searchParams.set('pointName', punto)
  u.searchParams.set('startDate', inicio.toISOString())
  u.searchParams.set('endDate', fin.toISOString())
  u.searchParams.set('aggregate', 'Average')
  u.searchParams.set('interval', '01:00:00')

  let j
  try {
    j = await (await fetch(u)).json()
  } catch (e) {
    return { estado: 'error', detalle: e.message }
  }
  if (!j?.ok) return { estado: 'error', detalle: `HTTP ${j?.status ?? '?'}` }

  const v = (j.data ?? []).map((s) => s.value).filter((x) => Number.isFinite(x))
  if (!v.length) return { estado: 'vacio', n: 0 }
  return { estado: 'datos', n: v.length, min: Math.min(...v), max: Math.max(...v) }
}

const marca = (r) =>
  r.estado === 'datos' ? `${c.verde}✓${c.reset}`
    : r.estado === 'vacio' ? `${c.ambar}~${c.reset}`
      : `${c.rojo}✗${c.reset}`

console.log(`\n${c.negrita}Historia del Hyper Historian · últimas ${HORAS} h${c.reset}`)
console.log(`${c.gris}${inicio.toISOString()} → ${fin.toISOString()}${c.reset}\n`)

/* Primero el control. Si éste falla, lo de abajo no significa nada. */
const ctrl = await serie(`${RAIZ}${CONTROL.grupo}:${CONTROL.tag}`)
console.log(`${c.negrita}Control${c.reset} — el grupo que sí registraba`)
console.log(`  ${marca(ctrl)} ${CONTROL.grupo}:${CONTROL.tag}   ${ctrl.n ?? 0} muestras ${ctrl.detalle ?? ''}\n`)

if (ctrl.estado === 'error') {
  console.log(`${c.rojo}${c.negrita}El control también falla.${c.reset}`)
  console.log('El problema no es del grupo de vibraciones: o el backend no llega')
  console.log('a ICONICS, o el historiador entero está caído. Comprueba antes:')
  console.log(`  curl ${BASE}/api/health\n`)
  process.exit(1)
}

console.log(`${c.negrita}DEMO 3${c.reset} — vibraciones y variador`)
const res = []
for (const tag of VIBRACION) {
  const r = await serie(`${RAIZ}DEMO 3:${tag}`)
  res.push({ tag, ...r })
  const cifras = r.estado === 'datos'
    ? `${String(r.n).padStart(3)} muestras   min ${r.min.toFixed(3)}   max ${r.max.toFixed(3)}`
    : r.estado === 'vacio' ? '  0 muestras   (registra, pero nada en la ventana)'
      : `              ${r.detalle}`
  console.log(`  ${marca(r)} ${tag.padEnd(17)} ${cifras}`)
}

const conDatos = res.filter((r) => r.estado === 'datos').length
const vacios = res.filter((r) => r.estado === 'vacio').length
const errores = res.filter((r) => r.estado === 'error').length

console.log()
if (conDatos === res.length) {
  console.log(`${c.verde}${c.negrita}Registra. Los ${conDatos} puntos devuelven serie.${c.reset}`)
  console.log('Ya se puede poner `historizado` en shared/eva/vibraciones.js y')
  console.log('escribir el pronóstico de rodamientos sobre tendencia real.')
} else if (errores === res.length) {
  console.log(`${c.rojo}${c.negrita}Sigue sin registrar: los ${errores} puntos dan error.${c.reset}`)
  console.log('El control SÍ funciona, así que ICONICS está bien y el historiador')
  console.log('también. Lo que falta es del grupo `DEMO 3` en Workbench:')
  console.log(`  ${c.gris}·${c.reset} que los tags estén habilitados`)
  console.log(`  ${c.gris}·${c.reset} que tengan grupo de colección asignado`)
  console.log(`  ${c.gris}·${c.reset} que la configuración se haya APLICADO tras editarla`)
} else if (vacios && !errores) {
  console.log(`${c.ambar}${c.negrita}Registra, pero la ventana está vacía.${c.reset}`)
  console.log(`Los ${vacios} puntos responden sin error y sin muestras: se activó`)
  console.log(`hace poco, o la máquina estuvo parada estas ${HORAS} h. Vuelve a`)
  console.log('probar con la máquina en marcha, o pide más horas:')
  console.log(`  ${c.gris}node scripts/comprobar-historia-vibraciones.mjs 168${c.reset}`)
} else {
  console.log(`${c.ambar}${c.negrita}A medias: ${conDatos} con datos, ${vacios} vacíos, ${errores} con error.${c.reset}`)
  console.log('Que unos vayan y otros no apunta a configuración tag por tag, no')
  console.log('al grupo entero. Compara en Workbench uno que va contra uno que no.')
}
console.log()
