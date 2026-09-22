/**
 * Mide CÓMO registra el historiador una serie que no cambia. Plan 42 F0.
 *
 *   node --env-file=.env.local scripts/medir-cadencia-historiador.mjs
 *   node --env-file=.env.local scripts/medir-cadencia-historiador.mjs --maquina vib-motor-03
 *   node --env-file=.env.local scripts/medir-cadencia-historiador.mjs --todas
 *   node --env-file=.env.local scripts/medir-cadencia-historiador.mjs --horas 24
 *
 * ── LA PREGUNTA QUE CONTESTA ───────────────────────────────────────
 *
 * `backend/lib/sondearSeries.mjs` no puede verificar una serie plana: sin
 * variación no hay con qué distinguirla de otra plana, y el servidor de esta
 * planta ya ha servido una serie por otra. Eso deja las banderas de alarma de
 * una máquina sana —constantes en 0 porque nada ha fallado— sin verificar
 * hasta que algo falle de verdad.
 *
 * La salida es comparar MARCAS DE TIEMPO en vez de valores: si el historiador
 * registra la bandera en los mismos instantes que una medida que sí varía y
 * sí verificó, la bandera está registrada aunque no se mueva. Pero eso sólo
 * vale si el grupo registra PERIÓDICAMENTE (una muestra cada tanto, cambie o
 * no el valor). Si registra SÓLO AL CAMBIAR, una constante no tiene marcas y
 * no hay nada que comparar. Este guion mide cuál de las dos cosas pasa.
 *
 * Por cada serie, sobre la misma ventana que usa el sondeo: cuántas muestras,
 * primera y última marca, cadencia mediana entre muestras, cuántos valores
 * distintos, y cuántas marcas tiene EN COMÚN con la serie testigo (`vRMS_S1`
 * por defecto, o la primera con `historyVerified: true` que varíe).
 *
 * ── POR QUÉ MONTA EL CLIENTE Y NO HACE `curl` ─────────────────────
 *
 * El 22-09-2026 `/api/iconics/history` devolvía 500 mientras el sondeo
 * interno leía bien por `client.readHistory`. La medida tiene que ir por la
 * misma puerta que el sondeo —mismos `aggregate: 'Average'` e `interval: 0`,
 * misma paginación— o mediría otra cosa.
 *
 * ── ESTO NO ES UN VERIFICADOR ──────────────────────────────────────
 *
 * Mide, no afirma: no devuelve código de error por lo que encuentre, y no
 * entra en `npm run verificar` porque necesita ICONICS real. De su salida
 * salen `MIN_MARCAS_COMUNES` y la tolerancia de cadencia de `sondearSeries`,
 * y las cifras se copian al Plan 42 F0 con fecha.
 */
import { readFileSync } from 'node:fs'

import { loadConfig } from '../backend/config.mjs'
import { createAuthenticator } from '../backend/iconics/authenticator.mjs'
import { createIconicsClient } from '../backend/iconics/client.mjs'

const c = {
  reset: '\x1b[0m', negrita: '\x1b[1m', verde: '\x1b[32m', rojo: '\x1b[31m',
  amarillo: '\x1b[33m', gris: '\x1b[90m', cian: '\x1b[36m',
}

const argumentos = process.argv.slice(2)
function opcion(nombre) {
  const i = argumentos.indexOf(`--${nombre}`)
  return i === -1 ? null : argumentos[i + 1]
}
const bandera = (nombre) => argumentos.includes(`--${nombre}`)

const config = loadConfig(process.env)

if (!config.iconics.apiBase || config.iconics.fake) {
  console.log(
    `\n${c.rojo}Falta ICONICS_API_BASE (o está ICONICS_FAKE=true).${c.reset} Este instrumento ` +
    'mide el historiador DE VERDAD; el falso no dice nada sobre cómo registra el real:\n' +
    '  node --env-file=.env.local scripts/medir-cadencia-historiador.mjs\n'
  )
  process.exit(1)
}

/* ── La máquina y las series ─────────────────────────────────────── */

const idMaquina = opcion('maquina') ?? 'vib-motor-03'
const archivo = JSON.parse(readFileSync(config.maquinas.ruta, 'utf8'))
const maquina = (archivo.maquinas ?? []).find((m) => m.id === idMaquina)
if (!maquina) {
  console.log(`${c.rojo}No hay máquina «${idMaquina}» en ${config.maquinas.ruta}.${c.reset}`)
  process.exit(1)
}

const declaradas = maquina.variables.filter((v) => v.historyPointName)

/*
 * Las cinco de la tabla del plan, salvo que se pida `--todas`. Cada una está
 * por un motivo: una verificada que varía (el testigo), una bandera constante
 * del mismo apoyo, un estado constante, una bandera de OTRA carpeta del
 * grupo, y la que salió sin muestras en el sondeo del 22-09.
 */
const MUESTRA = ['vRMS_S1', 'Alarma_S1', 'MonState_vRMS_S1', 'FAULT_BMS', 'MonState_aRMS_S2']
const idTestigo = opcion('testigo') ?? 'vRMS_S1'
const elegidas = bandera('todas')
  ? declaradas
  : MUESTRA.map((id) => declaradas.find((v) => v.id === id)).filter(Boolean)

const horasPedidas = opcion('horas')
const VENTANAS_HORAS = horasPedidas ? [Number(horasPedidas)] : [24, 72, 7 * 24]

/* ── El cliente, por la misma puerta que el sondeo ───────────────── */

const client = createIconicsClient(config, createAuthenticator(config))

async function leer(v, desde, hasta) {
  try {
    const r = await client.readHistory({
      pointName: v.historyPointName,
      startDate: desde,
      endDate: hasta,
      aggregate: 'Average',
      interval: 0,
    })
    if (r?.ok !== true) return { ok: false, motivo: r?.error ?? `HTTP ${r?.status ?? '?'}`, muestras: [] }
    return { ok: true, muestras: r.data ?? [], truncada: r.truncada === true, paginas: r.paginas }
  } catch (error) {
    return { ok: false, motivo: error?.message ?? 'error desconocido', muestras: [] }
  }
}

/* ── Las medidas ─────────────────────────────────────────────────── */

const marcaDe = (m) => String(m?.timestamp ?? m?.Timestamp ?? '')

function mediana(numeros) {
  if (!numeros.length) return null
  const orden = [...numeros].sort((a, b) => a - b)
  const mitad = Math.floor(orden.length / 2)
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2
}

function medir(muestras) {
  const marcas = muestras.map(marcaDe).filter(Boolean)
  const instantes = marcas.map((m) => Date.parse(m)).filter(Number.isFinite).sort((a, b) => a - b)
  const saltos = []
  for (let i = 1; i < instantes.length; i += 1) saltos.push((instantes[i] - instantes[i - 1]) / 1000)
  const valores = muestras.map((m) => m?.value).filter((x) => typeof x === 'number')
  return {
    n: muestras.length,
    primera: instantes.length ? new Date(instantes[0]).toISOString() : null,
    ultima: instantes.length ? new Date(instantes[instantes.length - 1]).toISOString() : null,
    cadenciaS: mediana(saltos),
    /* Cuántos saltos se alejan de la mediana más de un 50 %: dice si la
       cadencia es regular o si «mediana» esconde dos ritmos. */
    saltosIrregulares: saltos.filter((s) => {
      const med = mediana(saltos)
      return med && Math.abs(s - med) > med * 0.5
    }).length,
    distintos: new Set(valores).size,
    valor: new Set(valores).size === 1 ? valores[0] : null,
    marcas: new Set(marcas),
  }
}

function comunes(a, b) {
  let n = 0
  for (const m of a) if (b.has(m)) n += 1
  return n
}

const fmt = (x, d = 1) => (x == null ? '—' : Number(x).toFixed(d))
const hora = (iso) => (iso ? iso.slice(5, 19).replace('T', ' ') : '—')

console.log(
  `\n${c.negrita}Cadencia del historiador · ${maquina.nombre ?? maquina.id} (${maquina.id})${c.reset}\n` +
  `${c.gris}${config.iconics.apiBase} · testigo: ${idTestigo} · ${elegidas.length} series${c.reset}`
)

for (const horas of VENTANAS_HORAS) {
  const hasta = new Date()
  const desde = new Date(hasta.getTime() - horas * 3600 * 1000)
  console.log(`\n${c.cian}${c.negrita}── Ventana: últimas ${horas} h ──${c.reset}`)

  const lecturas = []
  for (const v of elegidas) {
    const r = await leer(v, desde.toISOString(), hasta.toISOString())
    lecturas.push({ v, ...r, medida: r.ok ? medir(r.muestras) : null })
  }

  const testigo = lecturas.find((l) => l.v.id === idTestigo && l.ok && l.medida.distintos > 1)
    ?? lecturas.find((l) => l.ok && l.medida.distintos > 1 && l.v.historyVerified === true)
  if (!testigo) {
    console.log(`${c.amarillo}Ninguna serie varió en esta ventana: no hay testigo con quien comparar marcas.${c.reset}`)
  } else if (testigo.v.id !== idTestigo) {
    console.log(`${c.amarillo}«${idTestigo}» no varió; se usa «${testigo.v.id}» como testigo.${c.reset}`)
  }

  const ancho = Math.max(...lecturas.map((l) => l.v.id.length), 8)
  const fila = (...celdas) => celdas.join('  ')
  console.log(
    c.gris +
    fila('serie'.padEnd(ancho), 'n'.padStart(5), 'primera'.padEnd(14), 'última'.padEnd(14),
      'cad. s'.padStart(7), 'irreg'.padStart(5), 'dist'.padEnd(8), 'comunes'.padStart(9), '% propias'.padStart(9)) +
    c.reset
  )
  for (const l of lecturas) {
    if (!l.ok) {
      console.log(`${l.v.id.padEnd(ancho)}  ${c.rojo}no se pudo leer: ${l.motivo}${c.reset}`)
      continue
    }
    const m = l.medida
    const esTestigo = testigo === l
    const nComunes = testigo && !esTestigo ? comunes(m.marcas, testigo.medida.marcas) : null
    /* Sobre las marcas de la CONSTANTE, no del testigo: la pregunta es qué
       parte de lo que el historiador escribió de ella cae en el reloj del
       testigo, no qué parte del testigo cubre. */
    const pct = nComunes != null && m.n ? (100 * nComunes) / m.n : null
    const color = m.n === 0 ? c.amarillo : m.distintos === 1 ? c.gris : c.verde
    const dist = m.valor != null ? `${m.distintos} (=${m.valor})` : String(m.distintos)
    console.log(
      color + l.v.id.padEnd(ancho) + c.reset + '  ' +
      fila(String(m.n).padStart(5), hora(m.primera).padEnd(14), hora(m.ultima).padEnd(14),
        fmt(m.cadenciaS).padStart(7), String(m.saltosIrregulares).padStart(5), dist.padEnd(8),
        (esTestigo ? '(testigo)' : String(nComunes ?? '—')).padStart(9),
        (esTestigo ? '' : `${fmt(pct, 0)} %`).padStart(9)) +
      (l.truncada ? `  ${c.amarillo}truncada (${l.paginas} pág.)${c.reset}` : '')
    )
  }
}

console.log(
  `\n${c.gris}n = muestras · cad. s = cadencia mediana entre muestras · irreg = saltos que se alejan ` +
  `>50 % de la mediana · dist = valores distintos (=v si es constante) · comunes = marcas de tiempo ` +
  `que coinciden con el testigo · % propias = comunes sobre las marcas de la propia serie.${c.reset}\n`
)
