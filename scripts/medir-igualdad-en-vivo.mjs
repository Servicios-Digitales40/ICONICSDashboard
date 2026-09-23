/**
 * Mide si unas variables que el historiador sirve IDÉNTICAS son también
 * idénticas EN VIVO. Plan 42, seguimiento de la causa `serie-compartida`.
 *
 *   node --env-file=.env.local scripts/medir-igualdad-en-vivo.mjs
 *   node --env-file=.env.local scripts/medir-igualdad-en-vivo.mjs --maquina vib-motor-03 --minutos 10 --cada 3
 *   node --env-file=.env.local scripts/medir-igualdad-en-vivo.mjs --ids "QC_aRMS_S1,QC_DKW_S1,QC_vRMS_S1"
 *
 * ── LA PREGUNTA QUE CONTESTA ───────────────────────────────────────
 *
 * El sondeo (`sondearSeries.mjs`) marca `serie-compartida` a las variables
 * cuyas series históricas coinciden en TODOS los valores de las marcas que
 * comparten. Desde los valores eso tiene dos explicaciones que no se pueden
 * separar: un cruce del historiador (una serie servida con varios nombres:
 * `aPeak_S1`, 21-09-2026) o fuentes distintas que coinciden de verdad (nueve
 * códigos de calidad que suben y bajan juntos).
 *
 * El cruce vive en la configuración del historiador, no en el PLC. Así que
 * la vía para separarlos es el dato EN VIVO (`ac:`), que llega por tag desde
 * el PLC sin pasar por el historiador:
 *
 *   · si en vivo las variables DIFIEREN alguna vez mientras en el historiador
 *     son idénticas → el cruce es real, y se arregla en el Workbench;
 *   · si en vivo son siempre iguales, y cada una trae SU marca de tiempo
 *     (se actualizan por separado) → son fuentes distintas que coinciden;
 *   · si en vivo son iguales Y traen la misma marca al milisegundo en todas
 *     las lecturas → también en vivo podría ser un solo dato con varios
 *     nombres; no se puede afirmar lo contrario.
 *
 * ── ESTO NO ES UN VERIFICADOR ──────────────────────────────────────
 *
 * Mide, no afirma: no devuelve código de error y necesita ICONICS real (el
 * falso simula cada variable por separado y diría siempre «distintas»). Lo
 * que salga se anota en el backlog (B15 / la causa `serie-compartida`) con
 * fecha, y de ahí se decide si el tipo declara alguna familia de series
 * como «equivalentes».
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

const config = loadConfig(process.env)
if (!config.iconics.apiBase || config.iconics.fake) {
  console.log(
    `\n${c.rojo}Falta ICONICS_API_BASE (o está ICONICS_FAKE=true).${c.reset} Este instrumento lee ` +
    'la planta DE VERDAD; el falso simula cada variable aparte y no dice nada del cruce:\n' +
    '  node --env-file=.env.local scripts/medir-igualdad-en-vivo.mjs\n'
  )
  process.exit(1)
}

/* ── La máquina y el grupo ───────────────────────────────────────── */

const idMaquina = opcion('maquina') ?? 'vib-motor-03'
const archivo = JSON.parse(readFileSync(config.maquinas.ruta, 'utf8'))
const maquina = (archivo.maquinas ?? []).find((m) => m.id === idMaquina)
if (!maquina) {
  console.log(`${c.rojo}No hay máquina «${idMaquina}» en ${config.maquinas.ruta}.${c.reset}`)
  process.exit(1)
}

/*
 * Por defecto, las once que el sondeo del 22-09-2026 dio como
 * `serie-compartida` en `vib-motor-03`: las nueve `QC_*` (un grupo) y dos del
 * variador (otro). Se comparan DENTRO de cada grupo: comparar un código de
 * calidad con un contador de arranques no dice nada.
 */
const GRUPOS_POR_DEFECTO = [
  ['QC_aRMS_S1', 'QC_DKW_S1', 'QC_vRMS_S1', 'QC_aRMS_S2', 'QC_DKW_S2', 'QC_vRMS_S2', 'QC_aRMS_S3', 'QC_DKW_S3', 'QC_vRMS_S3'],
  ['OUTPUT VOLTS_BMS', 'Numero de arranques'],
]
const grupos = opcion('ids')
  ? [opcion('ids').split(',').map((s) => s.trim()).filter(Boolean)]
  : GRUPOS_POR_DEFECTO

const variablesDe = (ids) =>
  ids.map((id) => {
    const v = maquina.variables.find((x) => x.id === id)
    if (!v) console.log(`${c.amarillo}«${id}» no está en la máquina; se omite.${c.reset}`)
    return v
  }).filter(Boolean)

const gruposVar = grupos.map(variablesDe).filter((g) => g.length >= 2)
if (!gruposVar.length) {
  console.log(`${c.rojo}Ningún grupo con al menos dos variables que comparar.${c.reset}`)
  process.exit(1)
}

const minutos = Number(opcion('minutos') ?? 5)
const cadaS = Number(opcion('cada') ?? 3)
const lecturas = Math.max(1, Math.round((minutos * 60) / cadaS))

/* ── El cliente ───────────────────────────────────────────────────── */

const client = createIconicsClient(config, createAuthenticator(config))
const todos = [...new Set(gruposVar.flat().map((v) => v.pointName))]

const valorDe = (l) => l?.payload?.value ?? l?.payload?.Value ?? null
const marcaDe = (l) => String(l?.payload?.timestamp ?? l?.payload?.Timestamp ?? '')
const calidadDe = (l) => l?.payload?.quality ?? l?.payload?.Quality ?? null

console.log(
  `\n${c.negrita}Igualdad en vivo · ${maquina.nombre ?? maquina.id} (${maquina.id})${c.reset}\n` +
  `${c.gris}${config.iconics.apiBase} · ${lecturas} lecturas cada ${cadaS} s (${minutos} min) · ` +
  `${gruposVar.length} grupo(s), ${todos.length} puntos${c.reset}\n`
)

/* Por grupo: instantes en que TODAS fueron iguales, en que alguna difirió, y
   por par cuántas veces difirieron. Y las marcas: si cada variable trae la
   suya o todas la misma. */
const estado = gruposVar.map((g) => ({
  variables: g,
  iguales: 0,
  difieren: 0,
  sinDato: 0,
  ejemplos: [],
  paresDistintos: new Map(),
  marcasIguales: 0,
  marcasDistintas: 0,
  valoresVistos: new Set(),
}))

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

for (let i = 0; i < lecturas; i += 1) {
  const inicio = Date.now()
  const r = await client.readPoints(todos)
  const hora = new Date().toISOString().slice(11, 19)

  if (!r?.ok) {
    console.log(`${c.rojo}${hora} lectura fallida: ${r?.error ?? `HTTP ${r?.status}`}${c.reset}`)
  } else {
    for (const e of estado) {
      const filas = e.variables.map((v) => {
        const l = r.payload?.[v.pointName]
        return { id: v.id, valor: valorDe(l), marca: marcaDe(l), calidad: calidadDe(l) }
      })
      if (filas.some((f) => f.valor === null || f.valor === undefined)) { e.sinDato += 1; continue }

      for (const f of filas) e.valoresVistos.add(String(f.valor))
      const distintos = new Set(filas.map((f) => String(f.valor)))
      if (distintos.size === 1) e.iguales += 1
      else {
        e.difieren += 1
        if (e.ejemplos.length < 6) e.ejemplos.push(`${hora}  ${filas.map((f) => `${f.id}=${f.valor}`).join('  ')}`)
        for (let a = 0; a < filas.length; a += 1) {
          for (let b = a + 1; b < filas.length; b += 1) {
            if (String(filas[a].valor) === String(filas[b].valor)) continue
            const k = `${filas[a].id} ≠ ${filas[b].id}`
            e.paresDistintos.set(k, (e.paresDistintos.get(k) ?? 0) + 1)
          }
        }
      }
      const marcas = new Set(filas.map((f) => f.marca).filter(Boolean))
      if (marcas.size <= 1) e.marcasIguales += 1
      else e.marcasDistintas += 1
    }
    if (i % Math.max(1, Math.round(60 / cadaS)) === 0) {
      process.stdout.write(`${c.gris}${hora} · lectura ${i + 1}/${lecturas}${c.reset}\n`)
    }
  }

  const resta = cadaS * 1000 - (Date.now() - inicio)
  if (i < lecturas - 1 && resta > 0) await dormir(resta)
}

/* ── El informe ──────────────────────────────────────────────────── */

for (const e of estado) {
  const n = e.iguales + e.difieren
  console.log(`\n${c.cian}${c.negrita}── ${e.variables.map((v) => v.id).join(', ')} ──${c.reset}`)
  console.log(`  lecturas con dato: ${n} · sin dato en alguna: ${e.sinDato}`)
  console.log(`  valores vistos en el grupo: ${[...e.valoresVistos].slice(0, 8).join(', ')}${e.valoresVistos.size > 8 ? '…' : ''}`)
  console.log(
    `  todas iguales: ${e.iguales}  ·  alguna distinta: ` +
    `${e.difieren ? c.verde : c.amarillo}${e.difieren}${c.reset}`
  )
  console.log(
    `  marcas de tiempo: ${e.marcasDistintas} lecturas con marcas DISTINTAS entre variables, ` +
    `${e.marcasIguales} con la misma marca en todas`
  )
  if (e.difieren) {
    console.log(`  ${c.verde}En vivo SÍ difieren: son fuentes distintas. Si el historiador las sirve idénticas, el cruce es del historiador.${c.reset}`)
    for (const [k, veces] of [...e.paresDistintos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`    ${k}  ×${veces}`)
    }
    for (const ej of e.ejemplos) console.log(`    ${c.gris}${ej}${c.reset}`)
  } else if (n) {
    console.log(
      e.marcasDistintas
        ? `  ${c.amarillo}En vivo iguales, pero cada una con su marca: fuentes distintas que coinciden en esta ventana. No prueba el cruce; tampoco lo descarta del todo.${c.reset}`
        : `  ${c.amarillo}En vivo iguales Y con la misma marca en todas las lecturas: también en vivo podría ser un solo dato. Nada que afirmar.${c.reset}`
    )
  }
}
console.log()
