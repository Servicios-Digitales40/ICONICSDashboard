#!/usr/bin/env node
/**
 * scripts/sondear-paginacion-historico.mjs
 * ------------------------------------------------------------------
 * SONDA DE DESCUBRIMIENTO, no una verificación: mide contra el servidor
 * real las dos cosas que no sabemos y de las que depende cómo se lee el
 * histórico profundo.
 *
 *  A · ¿El tope de 100 muestras es del SERVIDOR o nuestro?
 *      `X-ICO-MAX-ITEM-COUNT: 100` lo elegimos nosotros
 *      (`config.limits.maxUpstreamItems`, constante, sin variable de
 *      entorno). Si pidiendo 1000 llegan 1000, media biblioteca de este
 *      proyecto está construida sobre un límite autoimpuesto.
 *
 *  B · ¿`X-ICO-CONTINUATION` sirve para PAGINAR?
 *      Hoy sólo se lee su presencia como `hasMore` y se tira el valor
 *      (`iconics/client.mjs`). Si reenviándolo llega la página siguiente,
 *      existe paginación de verdad y no hay que simularla troceando.
 *
 * Sólo LEE. No escribe nada en ICONICS.
 *
 *   node --env-file=.env.local scripts/sondear-paginacion-historico.mjs [clave]
 */
import { loadConfig } from '../backend/config.mjs'
import { createAuthenticator } from '../backend/iconics/authenticator.mjs'
import { logger } from '../backend/logger.mjs'
import { esHistorizada, historizadas, pointName } from '../shared/eva/senales.js'
import { isGoodQuality } from '../shared/quality.js'

logger.setLevel('WARN')

const config = loadConfig()
if (config.iconics.fake) { console.error('ICONICS_FAKE=true: esta sonda necesita el servidor real.'); process.exit(1) }
if (!config.iconics.apiBase) { console.error('Falta ICONICS_API_BASE.'); process.exit(1) }

const auth = createAuthenticator(config)
const clave = process.argv[2] ?? historizadas()[0]?.key ?? historizadas()[0]
if (!esHistorizada(clave)) { console.error(`"${clave}" no está historizada.`); process.exit(1) }
const punto = pointName(clave)

/** Una llamada cruda a /History devolviendo TAMBIÉN las cabeceras. */
async function historia({ inicio, fin, aggregate, interval, maxItems, continuation }) {
  const url = new URL(config.iconics.endpoints.history)
  url.searchParams.set('pointName', punto)
  url.searchParams.set('startDate', inicio.toISOString())
  url.searchParams.set('endDate', fin.toISOString())
  if (aggregate) url.searchParams.set('aggregateName', aggregate)
  if (interval) url.searchParams.set('processingInterval', interval)

  const cabeceras = { ...(await auth.authorizationHeaders()) }
  if (maxItems) cabeceras['X-ICO-MAX-ITEM-COUNT'] = String(maxItems)
  if (continuation) cabeceras['X-ICO-CONTINUATION'] = continuation

  const t0 = Date.now()
  const r = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(60000) })
  const tipo = r.headers.get('content-type') ?? ''
  const cuerpo = tipo.includes('application/json') ? await r.json() : await r.text()

  const muestras = []
  if (Array.isArray(cuerpo)) {
    for (const item of cuerpo) {
      if (Array.isArray(item.historicalSamples)) muestras.push(...item.historicalSamples)
      else if (item.timestamp !== undefined) muestras.push(item)
    }
  }
  return {
    status: r.status,
    ms: Date.now() - t0,
    muestras,
    buenas: muestras.filter(m => isGoodQuality(m.quality ?? 0)).length,
    continuation: r.headers.get('X-ICO-CONTINUATION'),
    // Todo lo propietario, por si hay más de lo que creemos.
    ico: Object.fromEntries([...r.headers].filter(([k]) => k.toLowerCase().startsWith('x-ico'))),
    cuerpoSiError: r.ok ? null : String(cuerpo).slice(0, 200),
  }
}

const fin = new Date()
const inicio = new Date(fin.getTime() - 3600_000)   // una hora: sobra dato crudo

console.log(`\nSeñal: ${clave}  ·  punto: ${punto}`)
console.log(`Ventana de sondeo: última hora (${inicio.toISOString()} → ${fin.toISOString()})\n`)

/* ── A · ¿Cuánto nos deja pedir de verdad? ─────────────────────────── */
console.log('A · Tope real de muestras por petición (crudo, sin agregado)')
console.log('    maxItems |  status |  muestras |  buenas |    ms | continuation')
for (const maxItems of [100, 500, 1000, 5000, 50000]) {
  try {
    const r = await historia({ inicio, fin, maxItems })
    console.log(
      `    ${String(maxItems).padStart(8)} | ${String(r.status).padStart(7)} | ` +
      `${String(r.muestras.length).padStart(9)} | ${String(r.buenas).padStart(7)} | ` +
      `${String(r.ms).padStart(5)} | ${r.continuation ? 'sí' : 'no'}` +
      (r.cuerpoSiError ? `\n             error: ${r.cuerpoSiError}` : '')
    )
  } catch (e) { console.log(`    ${String(maxItems).padStart(8)} | FALLO: ${e.message}`) }
}

/* ── B · ¿El token de continuación pagina? ─────────────────────────── */
console.log('\nB · Continuación: ¿reenviar el token trae la página siguiente?')
let pagina = await historia({ inicio, fin, maxItems: 100 })
console.log(`    página 1: ${pagina.muestras.length} muestras, cabeceras X-ICO: ${JSON.stringify(pagina.ico)}`)

if (!pagina.continuation) {
  console.log('    (sin token de continuación: no hay nada que encadenar aquí)')
} else {
  const vistas = new Set(pagina.muestras.map(m => m.timestamp))
  let ultima = pagina.muestras.at(-1)?.timestamp
  for (let p = 2; p <= 4 && pagina.continuation; p++) {
    pagina = await historia({ inicio, fin, maxItems: 100, continuation: pagina.continuation })
    const nuevas = pagina.muestras.filter(m => !vistas.has(m.timestamp)).length
    pagina.muestras.forEach(m => vistas.add(m.timestamp))
    console.log(
      `    página ${p}: ${pagina.muestras.length} muestras, ${nuevas} nuevas, ` +
      `avanza=${pagina.muestras.at(-1)?.timestamp !== ultima ? 'sí' : 'NO (repite)'}, ` +
      `sigue=${pagina.continuation ? 'sí' : 'no'}`
    )
    ultima = pagina.muestras.at(-1)?.timestamp
  }
  console.log(`    total distinto acumulado: ${vistas.size} muestras`)
}

/* ── C · El patrón patológico documentado, para confirmarlo ────────── */
console.log('\nC · Rango largo + intervalo fino (el fallo que documenta trocear())')
const largo = { inicio: new Date(fin.getTime() - 10 * 86400_000), fin }
for (const interval of ['02:24:00', '01:00:00', '00:15:00']) {
  const r = await historia({ ...largo, aggregate: 'Average', interval, maxItems: 100 })
  console.log(`    interval=${interval} -> ${String(r.muestras.length).padStart(4)} muestras, ${String(r.buenas).padStart(4)} buenas, hasMore=${r.continuation ? 'sí' : 'no'}`)
}
console.log()
