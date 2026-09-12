#!/usr/bin/env node
/**
 * scripts/sondear-alarmas.mjs
 * ------------------------------------------------------------------
 * SONDA DE DESCUBRIMIENTO, no una verificación: captura la forma REAL de un
 * evento de `/AlarmHistory` contra el servidor de planta.
 *
 * ── POR QUÉ HACE FALTA ESTO, Y NO SUPONER LOS CAMPOS ───────────────
 *
 * Porque hoy sólo hay DOS campos confirmados —`eventId` y `startDate`— y así lo
 * dice la cabecera de `Demo-EVA/data/comunes/alarmas.js`. Qué más trae cada
 * evento (el punto, un mensaje, una severidad, si está reconocido) lo decide
 * GENESIS64, y en este repositorio no hay un solo ejemplo real contra el que
 * confirmarlo: `readAlarmHistory()` del transporte falso devuelve
 * `{ alarms: [] }`.
 *
 * Mapear a ojo tiene un modo de fallo concreto y silencioso: si se filtra por un
 * campo que no existe, la lista sale VACÍA sin ningún error — el tablero diría
 * «no hay alarmas» sobre un historial lleno. `puntoDe()` ya prueba seis nombres
 * posibles justo para no cometerlo, y esta sonda es lo que permite dejar de
 * adivinar (`CLAUDE.md` §2.5).
 *
 * ── LAS TRES PREGUNTAS QUE CONTESTA ────────────────────────────────
 *
 *  A · ¿Qué campos trae un evento? Imprime las claves de los primeros eventos y
 *      un ejemplo completo, sin interpretar nada.
 *
 *  B · ¿Hace falta `pointName`, o el servidor acepta pedir toda la planta?
 *      Es la pregunta que origina esta sonda: el tablero pedía SIN punto y el
 *      servidor respondía «AlarmHistory request failed». Se prueba con punto y
 *      sin punto, y se compara.
 *
 *  C · ¿Qué ruta quiere — la de tiempo real (`ac:`) o la del historiador
 *      (`hda:`)? El Plan 27 F6 ya descubrió que para las SERIES el tanque
 *      necesita su propio nombre `hda:`; queda por confirmar si las alarmas
 *      siguen la misma regla. Se prueban las dos.
 *
 * Sólo LEE. No escribe nada en ICONICS y no reconoce ninguna alarma.
 *
 *   node --env-file=.env.local scripts/sondear-alarmas.mjs [clave]
 *
 * Sin argumento usa la primera alarma del catálogo. `[clave]` es una clave de
 * dominio (`nivelAltoAlto`, `presionAlta`…), no un tag.
 */
import { loadConfig } from '../backend/config.mjs'
import { createAuthenticator } from '../backend/iconics/authenticator.mjs'
import { logger } from '../backend/logger.mjs'
import { ALARMAS, SENALES, pointName, puntoHistorico } from '../shared/eva/tanque/senales.js'

logger.setLevel('WARN')

const config = loadConfig()
if (config.iconics.fake) {
  console.error('ICONICS_FAKE=true: esta sonda necesita el servidor real.')
  process.exit(1)
}
if (!config.iconics.apiBase) {
  console.error('Falta ICONICS_API_BASE. Usa: node --env-file=.env.local scripts/sondear-alarmas.mjs')
  process.exit(1)
}

const clave = process.argv[2] ?? ALARMAS[0]
if (!SENALES[clave] || SENALES[clave].naturaleza !== 'alarma') {
  console.error(`"${clave}" no es una alarma del catálogo. Opciones: ${ALARMAS.join(', ')}`)
  process.exit(1)
}

const auth = createAuthenticator(config)

/** Formato que espera `/AlarmHistory`: `YYYY-MM-DD HH:mm:ss` local. */
function marcaLocal(fecha) {
  const dos = n => String(n).padStart(2, '0')
  const dia = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`
  return `${dia} ${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:${dos(fecha.getSeconds())}`
}

/** Una llamada cruda, devolviendo el cuerpo SIN interpretar. */
async function alarmas({ punto, horas }) {
  const fin = new Date()
  const inicio = new Date(fin.getTime() - horas * 3600_000)

  const url = new URL(config.iconics.endpoints.alarmHistory)
  if (punto) url.searchParams.set('pointName', punto)
  url.searchParams.set('startDate', marcaLocal(inicio))
  url.searchParams.set('endDate', marcaLocal(fin))

  const t0 = Date.now()
  try {
    const r = await fetch(url, {
      headers: { ...(await auth.authorizationHeaders()), 'X-ICO-MAX-ITEM-COUNT': '100' },
      signal: AbortSignal.timeout(60_000),
    })
    const tipo = r.headers.get('content-type') ?? ''
    const cuerpo = tipo.includes('application/json') ? await r.json() : await r.text()
    return { status: r.status, ms: Date.now() - t0, cuerpo, url: url.toString() }
  } catch (error) {
    return { status: 0, ms: Date.now() - t0, error: error.message, url: url.toString() }
  }
}

/** Resume una respuesta sin decidir nada sobre su contenido. */
function describir(r) {
  if (r.error) return `✗ fallo de red: ${r.error}`
  if (r.status !== 200) {
    const detalle = typeof r.cuerpo === 'string' ? r.cuerpo.slice(0, 200) : JSON.stringify(r.cuerpo).slice(0, 200)
    return `✗ HTTP ${r.status} en ${r.ms} ms — ${detalle}`
  }
  const lista = Array.isArray(r.cuerpo) ? r.cuerpo : null
  if (!lista) return `? HTTP 200 en ${r.ms} ms, pero el cuerpo NO es un array: ${typeof r.cuerpo}`
  return `✓ HTTP 200 en ${r.ms} ms — ${lista.length} evento(s)`
}

const sep = t => console.log(`\n${'─'.repeat(66)}\n${t}\n`)

console.log(`\nSonda de /AlarmHistory · alarma "${clave}"`)
console.log(`Servidor: ${config.iconics.apiBase}`)

/* ── C · ¿ac: o hda:? ─────────────────────────────────────────────── */

sep('C · Qué ruta acepta: tiempo real (ac:) o historiador (hda:)')

const enVivo = pointName(clave)
const historico = puntoHistorico(clave)

console.log(`  ac:  ${enVivo}`)
console.log(`  hda: ${historico}\n`)

const conAc = await alarmas({ punto: enVivo, horas: 24 })
console.log(`  con ac:   ${describir(conAc)}`)

const conHda = await alarmas({ punto: historico, horas: 24 })
console.log(`  con hda:  ${describir(conHda)}`)

/* ── B · ¿hace falta el punto? ────────────────────────────────────── */

sep('B · Si el servidor acepta pedir SIN pointName (toda la planta)')

console.log('  Es la pregunta que origina esta sonda: el tablero pedía así y')
console.log('  el servidor respondía «AlarmHistory request failed».\n')

const sinPunto = await alarmas({ punto: null, horas: 24 })
console.log(`  sin punto: ${describir(sinPunto)}`)

/* ── A · la forma de un evento ────────────────────────────────────── */

sep('A · Qué campos trae un evento (lo que hay que mapear)')

const conDatos = [conHda, conAc, sinPunto].find(
  r => r.status === 200 && Array.isArray(r.cuerpo) && r.cuerpo.length > 0
)

if (!conDatos) {
  console.log('  Ninguna de las tres llamadas devolvió eventos.')
  console.log('  Si las tres dieron 200 con 0 eventos, prueba una ventana más larga:')
  console.log('  puede que simplemente no haya habido alarmas en 24 h.')
} else {
  const eventos = conDatos.cuerpo

  const claves = new Set()
  for (const e of eventos.slice(0, 20)) {
    for (const k of Object.keys(e ?? {})) claves.add(k)
  }

  console.log(`  Campos vistos en los primeros ${Math.min(20, eventos.length)} eventos:`)
  console.log(`  ${[...claves].sort().join(', ')}\n`)

  console.log('  Un evento completo, sin interpretar:')
  console.log(JSON.stringify(eventos[0], null, 2).split('\n').map(l => `  ${l}`).join('\n'))

  /*
   * Lo que `alarmas.js` ya busca, contrastado contra lo que de verdad llegó.
   * No se corrige nada aquí: esta sonda informa, y el arreglo se hace en el
   * código con este resultado delante.
   */
  const CAMPOS_PUNTO = ['pointName', 'PointName', 'tag', 'Tag', 'point', 'Point']
  const acierta = CAMPOS_PUNTO.find(c => typeof eventos[0]?.[c] === 'string')

  console.log('\n  Contraste con lo que el tablero supone hoy:')
  console.log(`    eventId   → ${eventos[0]?.eventId !== undefined ? 'SÍ está' : '✗ NO está'}`)
  console.log(`    startDate → ${eventos[0]?.startDate !== undefined ? 'SÍ está' : '✗ NO está'}`)
  console.log(
    `    el punto  → ${acierta ? `SÍ, en "${acierta}"` : '✗ NINGUNO de los seis nombres que prueba `puntoDe()`'}`
  )
  if (!acierta) {
    console.log('      ⚠ Sin esto el filtro por activo no puede funcionar, y la lista')
    console.log('        saldría vacía en silencio. Añade el nombre real a CAMPOS_PUNTO.')
  }
}

sep('Qué hacer con esto')
console.log('  Copia la salida al plan o al backlog antes de escribir el mapeo.')
console.log('  Es un HECHO del servidor, y el repositorio no tiene otro sitio donde')
console.log('  quede escrito.\n')
