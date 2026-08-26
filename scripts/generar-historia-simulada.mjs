#!/usr/bin/env node
/**
 * scripts/generar-historia-simulada.mjs
 * ------------------------------------------------------------------
 * Escribe historia SIMULADA en el historiador real de ICONICS, para poder
 * probar la UI (calendario, gráficas, exportaciones) con datos más antiguos
 * de los que el servidor tiene hoy.
 *
 * ── ESTO ESCRIBE EN EL SERVIDOR REAL ────────────────────────────────
 *
 * No es un simulador local: usa `POST /History/AddSamples`, el endpoint
 * oficial de ICONICS para insertar muestras con timestamp arbitrario (ver
 * conversación — probado y confirmado el 26-08-2026: el servidor respeta el
 * timestamp que se le da, no la hora de escritura). Necesita
 * `ICONICS_READ_ONLY=false` y borra por su cuenta cualquier muestra previa
 * en el mismo rango antes de escribir (`--limpiar-antes`, activado por
 * defecto) para que dos corridas seguidas no dupliquen datos.
 *
 * ── LA FÍSICA: CALIBRADA CONTRA DATOS REALES, NO EL SIMULADOR DE DEMO ──
 *
 * `shared/eva/simulador.js` existe, pero está calibrado para verse VIVO en
 * una demo (ciclos de 6 min, jornada de 4 h) — no representa un patrón real
 * de operación. Este script usa su propio modelo, calibrado contra
 * estadísticas reales leídas del historiador (min/max/avg de los últimos
 * días, ver la conversación) y el horario que pide el usuario: ciclos de
 * marcha/paro DENTRO de la ventana laboral, reposo fuera de ella.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node --env-file=.env.local scripts/generar-historia-simulada.mjs \
 *     --desde 2026-08-03 --hasta 2026-08-07 \
 *     --hora-inicio 7 --hora-fin 17 \
 *     [--intervalo-min 5] [--dry-run] [--sin-limpiar]
 *
 * `--dry-run` calcula todo y lo reporta SIN escribir nada — para revisar el
 * plan antes de tocar el servidor real.
 */
import { createAuthenticator } from '../backend/iconics/authenticator.mjs'
import { loadConfig } from '../backend/config.mjs'
import { historizadas, pointName, senalInfo } from '../shared/eva/senales.js'
import { UMBRALES } from '../shared/eva/umbrales.js'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
  amarillo: '\x1b[33m', negrita: '\x1b[1m', reset: '\x1b[0m',
}

/* ── Argumentos ───────────────────────────────────────────────────── */

function leerArgs(argv) {
  const args = { intervaloMin: 5, horaInicio: 7, horaFin: 17, dryRun: false, limpiarAntes: true, zonaHorasUtc: 6 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--desde') args.desde = argv[++i]
    else if (a === '--hasta') args.hasta = argv[++i]
    else if (a === '--hora-inicio') args.horaInicio = Number(argv[++i])
    else if (a === '--hora-fin') args.horaFin = Number(argv[++i])
    else if (a === '--intervalo-min') args.intervaloMin = Number(argv[++i])
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--sin-limpiar') args.limpiarAntes = false
    else if (a === '--zona-horas-utc') args.zonaHorasUtc = Number(argv[++i])
  }
  return args
}

const args = leerArgs(process.argv.slice(2))

if (!args.desde || !args.hasta) {
  console.error(`${c.rojo}Faltan --desde y --hasta (formato YYYY-MM-DD).${c.reset}`)
  console.error('Ejemplo: node scripts/generar-historia-simulada.mjs --desde 2026-08-03 --hasta 2026-08-07')
  process.exit(1)
}

const config = loadConfig()

if (config.iconics.fake) {
  console.error(`${c.rojo}ICONICS_FAKE=true: este script necesita el servidor real.${c.reset}`)
  process.exit(1)
}
if (!args.dryRun && config.iconics.readOnly) {
  console.error(
    `${c.rojo}ICONICS_READ_ONLY=true: este script escribe en el historiador y no puede ` +
    `hacerlo en modo solo lectura. Usa --dry-run para revisar el plan sin escribir, o ` +
    `arranca con ICONICS_READ_ONLY=false para escribir de verdad.${c.reset}`
  )
  process.exit(1)
}

const authenticator = createAuthenticator(config)

/* ── El modelo físico: calibrado contra el historiador real ─────────
 *
 * Rangos medidos el 26-08-2026 sobre los últimos 6 días de datos reales
 * (ver la conversación), y las bandas de `shared/eva/umbrales.js` como
 * referencia de qué es "normal" para cada señal. La bomba cicla dentro de
 * la ventana laboral —ciclos de ~25 min: 18 min de marcha, 7 de paro—, y
 * queda en reposo fuera de ella.
 */
const CICLO_MARCHA_MIN = 18
const CICLO_PARO_MIN = 7
const CICLO_TOTAL_MIN = CICLO_MARCHA_MIN + CICLO_PARO_MIN

/** ¿Está la bomba impulsando en este minuto DENTRO de la jornada? */
function enMarcha(minutoDesdeInicioJornada) {
  const faseMin = minutoDesdeInicioJornada % CICLO_TOTAL_MIN
  return faseMin < CICLO_MARCHA_MIN
}

/** Ruido aleatorio pequeño y acotado — variación de sensor, no un salto. */
function ruido(amplitud, rnd) {
  return (rnd() * 2 - 1) * amplitud
}

/**
 * Valor de cada señal en un instante dado. `enJornada` decide si la bomba
 * puede estar en marcha; fuera de la ventana laboral todo queda en reposo,
 * igual que hace `shared/eva/simulador.js` con `enMarcha`.
 */
function valorSimulado(clave, { enJornada, minutoJornada, progresoSemana, rnd }) {
  const marcha = enJornada && enMarcha(minutoJornada)

  switch (clave) {
    case 'nivelTanque': {
      // Deriva lenta a lo largo de la semana (57→80 %, dentro de la banda
      // normal 25-90) más el vaciado/relleno de cada ciclo de bombeo.
      const base = 55 + 18 * progresoSemana
      const cicloFrac = (minutoJornada % CICLO_TOTAL_MIN) / CICLO_TOTAL_MIN
      const variacionCiclo = marcha ? -4 * cicloFrac : 2 * cicloFrac
      return clamp(base + variacionCiclo + ruido(1.5, rnd), UMBRALES.nivelTanque.min, UMBRALES.nivelTanque.max)
    }
    case 'temperaturaTanque': {
      const base = 23.5 + (marcha ? 1.2 : 0) + 0.6 * Math.sin(progresoSemana * Math.PI)
      return clamp(base + ruido(0.4, rnd), UMBRALES.temperaturaTanque.min, UMBRALES.temperaturaTanque.max)
    }
    case 'flujoInstantaneo': {
      if (!marcha) return clamp(0.1 + ruido(0.08, rnd), 0, UMBRALES.flujoInstantaneo.max)
      const base = 4.5 + 2.5 * Math.sin((minutoJornada / CICLO_TOTAL_MIN) * Math.PI)
      return clamp(base + ruido(0.8, rnd), UMBRALES.flujoInstantaneo.min, UMBRALES.flujoInstantaneo.max)
    }
    case 'presionRelativa': {
      if (!marcha) return clamp(0.2 + ruido(0.05, rnd), 0, UMBRALES.presionRelativa.max)
      const base = 3.2 + 0.5 * Math.sin((minutoJornada / CICLO_TOTAL_MIN) * Math.PI)
      return clamp(base + ruido(0.15, rnd), UMBRALES.presionRelativa.min, UMBRALES.presionRelativa.max)
    }
    case 'tensionLinea': {
      // La tensión no depende del ciclo de bombeo: es de la red, con su
      // propia variación lenta a lo largo del día.
      const base = 122 + 3 * Math.sin((minutoJornada / (10 * 60)) * Math.PI)
      return clamp(base + ruido(1.2, rnd), UMBRALES.tensionLinea.min, UMBRALES.tensionLinea.max)
    }
    default:
      return null
  }
}

function clamp(v, min, max) {
  if (typeof min === 'number' && v < min) return min
  if (typeof max === 'number' && v > max) return max
  return v
}

/** RNG determinista (mismo seed = mismos datos, para poder repetir el dry-run). */
function crearRnd(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/* ── El calendario: días laborables entre --desde y --hasta ─────────── */

function esDiaLaborable(fecha) {
  const dia = fecha.getUTCDay()
  return dia >= 1 && dia <= 5 // lunes(1)..viernes(5)
}

function diasEnRango(desde, hasta) {
  const dias = []
  for (let t = new Date(desde); t <= hasta; t.setUTCDate(t.getUTCDate() + 1)) {
    if (esDiaLaborable(t)) dias.push(new Date(t))
  }
  return dias
}

/* ── Construir el plan de muestras ───────────────────────────────────── */

const desde = new Date(`${args.desde}T00:00:00Z`)
const hasta = new Date(`${args.hasta}T00:00:00Z`)
const dias = diasEnRango(desde, hasta)

if (!dias.length) {
  console.error(`${c.rojo}Ningún día laborable (lun-vie) entre ${args.desde} y ${args.hasta}.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.negrita}Generación de historia simulada${c.reset}`)
console.log(`${c.gris}Servidor: ${config.iconics.apiBase}${c.reset}`)
console.log(`Días laborables: ${dias.map(d => d.toISOString().slice(0, 10)).join(', ')}`)
console.log(`Horario: ${args.horaInicio}:00–${args.horaFin}:00 (hora local, UTC-${args.zonaHorasUtc}) cada ${args.intervaloMin} min`)
console.log(`Ciclo de bombeo simulado: ${CICLO_MARCHA_MIN} min marcha / ${CICLO_PARO_MIN} min paro`)

const claves = historizadas()
console.log(`Señales: ${claves.map(k => senalInfo(k).label).join(', ')}\n`)

/** Plan por señal: [{ timestamp, value }]. */
const planPorSenal = {}
for (const clave of claves) planPorSenal[clave] = []

const rnd = crearRnd(20260803) // seed fijo: mismo plan en cada corrida con los mismos argumentos

for (let diaIdx = 0; diaIdx < dias.length; diaIdx++) {
  const dia = dias[diaIdx]
  const progresoSemana = dias.length > 1 ? diaIdx / (dias.length - 1) : 0
  const horasJornada = args.horaFin - args.horaInicio
  const minutosJornada = horasJornada * 60

  for (let min = 0; min <= minutosJornada; min += args.intervaloMin) {
    const horaUtc = args.horaInicio + args.zonaHorasUtc + min / 60
    const ts = new Date(dia)
    ts.setUTCHours(0, 0, 0, 0)
    ts.setUTCMinutes(Math.round(horaUtc * 60))

    for (const clave of claves) {
      const valor = valorSimulado(clave, { enJornada: true, minutoJornada: min, progresoSemana, rnd })
      if (valor === null) continue
      planPorSenal[clave].push({ timestamp: ts.toISOString(), value: Number(valor.toFixed(3)) })
    }
  }
}

const totalMuestras = Object.values(planPorSenal).reduce((acc, arr) => acc + arr.length, 0)
console.log(`Muestras por señal: ${claves.map(k => `${senalInfo(k).label}=${planPorSenal[k].length}`).join(', ')}`)
console.log(`${c.negrita}Total: ${totalMuestras} escrituras${c.reset}\n`)

if (args.dryRun) {
  console.log(`${c.amarillo}--dry-run: no se escribió nada. Primeras 3 muestras de "${senalInfo(claves[0]).label}":${c.reset}`)
  console.log(JSON.stringify(planPorSenal[claves[0]].slice(0, 3), null, 2))
  console.log(`\n${c.gris}Quita --dry-run para escribir de verdad.${c.reset}`)
  process.exit(0)
}

/* ── Escribir contra el servidor real, en lotes ──────────────────────── */

const TAMANO_LOTE = 100

async function addSamples(pn, muestras) {
  const url = new URL(config.iconics.endpoints.dataWrite.replace('/Data/Write', '/History/AddSamples'))
  url.searchParams.set('pointName', pn)
  const headers = await authenticator.authorizationHeaders()
  const r = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(muestras),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
  return r.json()
}

/**
 * `DeleteSamples` va por QUERY STRING (`timestamps[]=...` repetido), no por
 * body — con cientos de timestamps ISO eso excede el límite de longitud de
 * URI del servidor (medido: 414 con 605 timestamps de una vez). Se trocea
 * en lotes pequeños, muy por debajo de `TAMANO_LOTE` (que sí vale para
 * `AddSamples`, que va por body JSON y no tiene ese límite).
 */
const TAMANO_LOTE_BORRADO = 20

async function deleteSamples(pn, timestamps) {
  const headers = await authenticator.authorizationHeaders()
  for (let i = 0; i < timestamps.length; i += TAMANO_LOTE_BORRADO) {
    const lote = timestamps.slice(i, i + TAMANO_LOTE_BORRADO)
    const url = new URL(config.iconics.endpoints.dataWrite.replace('/Data/Write', '/History/DeleteSamples'))
    url.searchParams.set('pointName', pn)
    for (const ts of lote) url.searchParams.append('timestamps[]', ts)
    const r = await fetch(url, { method: 'DELETE', headers })
    if (!r.ok) throw new Error(`HTTP ${r.status} en lote ${i}-${i + lote.length}: ${(await r.text()).slice(0, 100)}`)
  }
}

for (const clave of claves) {
  const pn = pointName(clave)
  const muestras = planPorSenal[clave]
  if (!muestras.length) continue

  if (args.limpiarAntes) {
    process.stdout.write(`${senalInfo(clave).label}: limpiando posibles muestras previas… `)
    const timestamps = muestras.map(m => m.timestamp)
    try {
      await deleteSamples(pn, timestamps)
      console.log(`${c.verde}ok${c.reset}`)
    } catch (e) {
      console.log(`${c.amarillo}sin efecto (${e.message.slice(0, 80)})${c.reset}`)
    }
  }

  let escritas = 0
  let fallidas = 0
  for (let i = 0; i < muestras.length; i += TAMANO_LOTE) {
    const lote = muestras.slice(i, i + TAMANO_LOTE)
    process.stdout.write(
      `\r${senalInfo(clave).label}: escribiendo ${Math.min(i + TAMANO_LOTE, muestras.length)}/${muestras.length}…`
    )
    try {
      const resultado = await addSamples(pn, lote)
      const ok = resultado.filter(r => r.success).length
      escritas += ok
      fallidas += lote.length - ok
    } catch (e) {
      fallidas += lote.length
      console.log(`\n${c.rojo}  lote falló: ${e.message.slice(0, 150)}${c.reset}`)
    }
  }
  console.log(
    `\r${senalInfo(clave).label}: ${c.verde}${escritas} escritas${c.reset}` +
    (fallidas ? `, ${c.rojo}${fallidas} fallidas${c.reset}` : '') + '                    '
  )
}

console.log(`\n${c.negrita}${c.verde}Listo.${c.reset} Revisa la vista Detalle con el rango personalizado ${args.desde}–${args.hasta}.`)
