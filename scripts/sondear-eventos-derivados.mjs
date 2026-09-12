#!/usr/bin/env node
/**
 * scripts/sondear-eventos-derivados.mjs
 * ------------------------------------------------------------------
 * SONDA: los eventos que la pantalla enseñaría, contra el servidor real.
 *
 * Corre `eventosDeAlarma()` —el MISMO dominio que usa la vista— sobre la serie
 * cruda de cada alarma, para ver la lista de verdad en vez de deducirla.
 *
 * Existe porque el modo de fallo que destapó era invisible desde el navegador:
 * la pantalla enseñaba un evento, sin error ninguno, y parecía que la planta
 * había estado tranquila. Lo que pasaba es que `Average` borraba los flancos.
 * Una lista corta no se distingue a ojo de una lista correcta; por eso se mide.
 */
import { loadConfig } from '../backend/config.mjs'
import { createAuthenticator } from '../backend/iconics/authenticator.mjs'
import { logger } from '../backend/logger.mjs'
import { eventosDeAlarma } from '../shared/eva/comun/eventosDeAlarma.js'
import { normalizar } from '../shared/eva/comun/historia.js'
import { ALARMAS, SENALES, puntoHistorico } from '../shared/eva/tanque/senales.js'

logger.setLevel('WARN')

const config = loadConfig()
if (config.iconics.fake || !config.iconics.apiBase) {
  console.error('Necesita el servidor real: node --env-file=.env.local scripts/sondear-eventos-derivados.mjs [horas]')
  process.exit(1)
}

const horas = Number(process.argv[2] ?? 24)
const auth = createAuthenticator(config)

async function crudo(punto) {
  const fin = new Date()
  const inicio = new Date(fin.getTime() - horas * 3600_000)

  const url = new URL(config.iconics.endpoints.history)
  url.searchParams.set('pointName', punto)
  url.searchParams.set('startDate', inicio.toISOString())
  url.searchParams.set('endDate', fin.toISOString())

  const muestras = []
  let continuation = null
  for (let p = 0; p < 50; p++) {
    const r = await fetch(url, {
      headers: {
        ...(await auth.authorizationHeaders()),
        'X-ICO-MAX-ITEM-COUNT': '100',
        ...(continuation ? { 'X-ICO-CONTINUATION': continuation } : {}),
      },
      signal: AbortSignal.timeout(60_000),
    })
    if (r.status !== 200) return { error: `status ${r.status}` }
    const cuerpo = await r.json()
    const trozo = cuerpo?.[0]?.historicalSamples ?? cuerpo?.historicalSamples ?? cuerpo?.data ?? cuerpo
    if (!Array.isArray(trozo)) return { error: 'forma inesperada' }
    muestras.push(...trozo)
    continuation = r.headers.get('X-ICO-CONTINUATION')
    if (!continuation) break
  }
  // La regla 3 de `shared/eva/comun/historia.js`: sin agregado, el servidor
  // puede colar su muestra límite fuera del rango. Se recorta igual que hace
  // `enRango()` en el frontend.
  const desde = inicio.getTime()
  const hasta = fin.getTime()
  return { muestras: muestras.filter(m => {
    const t = new Date(m.timestamp).getTime()
    return t >= desde && t <= hasta
  }) }
}

const dur = ms => ms === null ? 'sigue activa' :
  ms < 60_000 ? `${Math.round(ms / 1000)} s` :
  ms < 3600_000 ? `${Math.round(ms / 60_000)} min` :
  `${Math.floor(ms / 3600_000)} h ${Math.round((ms % 3600_000) / 60_000)} min`

console.log(`\nEventos derivados, últimas ${horas} h\n`)

for (const clave of ALARMAS.filter(k => SENALES[k]?.historizado)) {
  const r = await crudo(puntoHistorico(clave))
  if (r.error) { console.log(`── ${clave}: ${r.error}`); continue }

  const eventos = eventosDeAlarma(normalizar(r.muestras))
  console.log(`── ${clave}: ${eventos.length} evento(s) de ${r.muestras.length} muestras`)
  for (const e of eventos.slice(-5)) {
    const marcas = [e.desdeAntes ? 'venía de antes' : null, e.activa ? 'activa' : null].filter(Boolean)
    console.log(`     ${e.inicio.toLocaleString()}  ${dur(e.duracionMs).padEnd(14)}${marcas.join(', ')}`)
  }
}
console.log()
