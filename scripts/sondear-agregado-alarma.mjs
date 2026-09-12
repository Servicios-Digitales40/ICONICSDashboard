#!/usr/bin/env node
/**
 * scripts/sondear-agregado-alarma.mjs
 * ------------------------------------------------------------------
 * SONDA, no verificador: ¿qué le hace `aggregate=Average` a la serie de una
 * alarma booleana?
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────
 *
 * `leerAlarmas()` deriva los eventos de los flancos de la serie, y para leerla
 * se apoya en `leerSerie()` — que pide SIEMPRE `aggregate: Average` sobre una
 * rejilla de ~100 puntos, porque está pensada para magnitudes continuas.
 *
 * Sobre un booleano eso hace dos cosas, las dos malas:
 *
 *  1. Promedia. Un cubo de 14 min con la alarma activa un tercio del tiempo
 *     vale `0,33`, que no es ni 0 ni 1. Lo que `normalizar()` entregue de ahí
 *     ya no es un flanco.
 *  2. Diezma. Dos entradas dentro del mismo cubo son UNA muestra: los eventos
 *     cortos —y los de esta planta duran minutos— desaparecen del conteo.
 *
 * Esta sonda pide la MISMA ventana de las dos maneras y compara: cuántas
 * muestras, qué valores distintos, y cuántos flancos salen de cada una. No
 * afirma nada por su cuenta; imprime los dos números para poder decidir.
 *
 * Uso:
 *   node --env-file=.env.local scripts/sondear-agregado-alarma.mjs [clave] [horas]
 */
import { loadConfig } from '../backend/config.mjs'
import { createAuthenticator } from '../backend/iconics/authenticator.mjs'
import { logger } from '../backend/logger.mjs'
import { ALARMAS, SENALES, puntoHistorico } from '../shared/eva/tanque/senales.js'

logger.setLevel('WARN')

const config = loadConfig()
if (config.iconics.fake || !config.iconics.apiBase) {
  console.error('Necesita el servidor real: node --env-file=.env.local scripts/sondear-agregado-alarma.mjs')
  process.exit(1)
}

const horas = Number(process.argv[3] ?? 24)
const auth = createAuthenticator(config)

/**
 * Una lectura de `/History`, con o sin agregado, siguiendo la continuación.
 *
 * El tope de 100 muestras por petición es DEL SERVIDOR y es duro: pedir más con
 * `X-ICO-MAX-ITEM-COUNT` no lo sube, devuelve 400 («Maximum allowed number of
 * samples in a single request is 100»). Por eso se pagina con
 * `X-ICO-CONTINUATION`, igual que hace `backend/iconics/client.mjs`. Sin esto
 * la sonda mediría 100 muestras siempre y confundiría el tope con el dato.
 */
async function serie(punto, { aggregate, interval }) {
  const fin = new Date()
  const inicio = new Date(fin.getTime() - horas * 3600_000)

  const url = new URL(config.iconics.endpoints.history)
  url.searchParams.set('pointName', punto)
  url.searchParams.set('startDate', inicio.toISOString())
  url.searchParams.set('endDate', fin.toISOString())
  // Los nombres que usa el cliente real (`backend/iconics/client.mjs`), no los
  // del contrato del puente: aquí se habla con ICONICS directamente.
  if (aggregate) url.searchParams.set('aggregateName', aggregate)
  if (interval) url.searchParams.set('processingInterval', interval)

  const muestras = []
  let continuation = null
  let paginas = 0

  try {
    while (paginas < 50) {
      const r = await fetch(url, {
        headers: {
          ...(await auth.authorizationHeaders()),
          'X-ICO-MAX-ITEM-COUNT': '100',
          ...(continuation ? { 'X-ICO-CONTINUATION': continuation } : {}),
        },
        signal: AbortSignal.timeout(60_000),
      })
      if (r.status !== 200) {
        return { status: r.status, muestras: null, error: (await r.text()).slice(0, 160) }
      }
      const cuerpo = await r.json()
      const trozo = cuerpo?.[0]?.historicalSamples ?? cuerpo?.historicalSamples ?? cuerpo?.data ?? cuerpo
      if (!Array.isArray(trozo)) return { status: r.status, muestras: null, cuerpo }
      muestras.push(...trozo)
      paginas += 1
      continuation = r.headers.get('X-ICO-CONTINUATION')
      if (!continuation) break
    }
    return { status: 200, muestras, paginas }
  } catch (error) {
    return { status: 0, error: error.message, muestras: null }
  }
}

/** Flancos 0→1 sobre una lista de valores ya en orden. */
function flancos(valores) {
  let previo = null
  let n = 0
  for (const v of valores) {
    const activa = v === true || v === 1
    if (previo !== null && activa && !previo) n++
    previo = activa
  }
  return n
}

function resumen(etiqueta, r) {
  if (!r.muestras) {
    console.log(`  ${etiqueta.padEnd(28)} status ${r.status}${r.error ? ` (${r.error})` : ''}`)
    if (r.cuerpo) console.log(`    cuerpo: ${JSON.stringify(r.cuerpo).slice(0, 200)}`)
    return
  }
  const valores = r.muestras.map(m => m.value ?? m.Value)
  const distintos = [...new Set(valores.map(v => JSON.stringify(v)))]
  const intermedios = valores.filter(v => typeof v === 'number' && v > 0 && v < 1).length
  console.log(`  ${etiqueta.padEnd(28)} ${String(r.muestras.length).padStart(4)} muestras (${r.paginas} pág.)`)
  console.log(`    valores distintos: ${distintos.slice(0, 6).join(', ')}${distintos.length > 6 ? ` …(${distintos.length})` : ''}`)
  console.log(`    entre 0 y 1 (promediados): ${intermedios}`)
  console.log(`    flancos 0→1: ${flancos(valores)}`)
}

const claves = process.argv[2] ? [process.argv[2]] : ALARMAS.filter(k => SENALES[k]?.historizado)

console.log(`\nVentana: últimas ${horas} h\n`)

for (const clave of claves) {
  const punto = puntoHistorico(clave)
  console.log(`── ${clave}  (${punto})`)

  // Lo que pide HOY la pantalla: Average sobre ~100 puntos.
  const segundos = (horas * 3600) / 100
  const dos = n => String(Math.floor(n)).padStart(2, '0')
  const interval = `${dos(segundos / 3600)}:${dos((segundos % 3600) / 60)}:${dos(segundos % 60)}`

  resumen(`Average / ${interval}`, await serie(punto, { aggregate: 'Average', interval }))
  resumen('SIN agregado (crudo)', await serie(punto, {}))
  console.log()
}
