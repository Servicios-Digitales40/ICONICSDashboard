#!/usr/bin/env node
/**
 * Mide cuánto ocupa el prompt del asistente cuando quien pregunta tiene
 * delante una máquina CONFIGURADA (Plan 39 F5).
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────
 *
 * Desde el Plan 39 F5 el bloque «Las señales de …» del prompt es el de la
 * máquina del contexto de pantalla, no siempre el del tanque. Una configurada
 * puede traer 94 variables (`Nuevo-Modor`), y un modelo local paga cada línea
 * en contexto y en tiempo. Antes de dar eso por bueno hay que saber cuántos
 * tokens son, y compararlos con el prompt de siempre.
 *
 * Es un INSTRUMENTO: mide, no afirma, y no devuelve código de error. No entra
 * en `npm run verificar` (sólo se descubren los `verificar-*`).
 *
 * Cuenta tokens con el `/tokenize` del `llama-server` de `IA_BASE`, con el
 * modelo que sirve; sin servidor, estima a cuatro caracteres por token y lo
 * dice.
 *
 *   node --env-file=.env.local scripts/medir-prompt-configurada.mjs [--maquina vib-motor-03]
 *   ICONICS_FAKE=true node scripts/medir-prompt-configurada.mjs          # con la espejo
 */
import { readFile } from 'node:fs/promises'

import { instrucciones } from '../backend/ia/conversacion/chat.mjs'
import { createHerramientas } from '../backend/ia/conversacion/herramientas.mjs'
import { createFakeIconicsClient } from '../backend/iconics/fakeClient.mjs'
import { loadConfig } from '../backend/config.mjs'
import { construirSistema } from '../shared/eva/comun/construirSistema.js'
import { registrarSistema, SISTEMA } from '../shared/eva/comun/sistemas.js'
import { tipoDe } from '../shared/eva/tipos/index.js'
import { configuracionEspejo } from './lib/configuracionEspejo.mjs'

const c = { verde: '\x1b[32m', gris: '\x1b[90m', negrita: '\x1b[1m', amarillo: '\x1b[33m', reset: '\x1b[0m' }

const argumentos = process.argv.slice(2)
function opcion(nombre) {
  const i = argumentos.indexOf(`--${nombre}`)
  return i === -1 ? null : argumentos[i + 1] ?? null
}

const config = loadConfig(process.env)
const rutaMaquinas = config.maquinasRuta ?? 'datos/maquinas.json'

/* Las configuradas del disco, registradas aquí como hace el backend al arrancar. */
let maquinas = []
try {
  maquinas = JSON.parse(await readFile(rutaMaquinas, 'utf8')).maquinas ?? []
} catch {
  maquinas = []
}
for (const m of maquinas) {
  const tipo = tipoDe(m.tipo)
  if (tipo && !SISTEMA[m.id]) registrarSistema(construirSistema(m, tipo))
}
if (!maquinas.length) {
  const espejo = configuracionEspejo({ verificadasDelCatalogo: true }).configurada
  registrarSistema(construirSistema(espejo, tipoDe('vibraciones')))
  maquinas = [espejo]
}

const id = opcion('maquina') ?? maquinas[0].id
if (!SISTEMA[id]) {
  console.log(`\nNo hay ninguna máquina «${id}» registrada. Las que hay: ${Object.keys(SISTEMA).join(', ')}\n`)
  process.exit(0)
}

const herramientas = createHerramientas({ client: createFakeIconicsClient() })

/* La misma composición que `chat.mjs·responder`, sin arrancar el bucle. */
function textoDelCatalogo(entradas) {
  return entradas
    .map(s => [
      `  ${s.nombre}`,
      s.unidad ? ` (${s.unidad})` : ' (sin unidad declarada)',
      s.activo ? ` · ${s.activo}` : '',
      s.historia ? ' · con historia' : ' · SIN historia',
      s.soloEnMarcha ? ' · sólo con la bomba en marcha' : '',
    ].join(''))
    .join('\n')
}

async function contarTokens(texto) {
  const base = (config.ia?.base ?? process.env.IA_BASE ?? '').replace(/\/$/, '')
  if (!base) return { tokens: Math.round(texto.length / 4), estimado: true }
  try {
    const modelos = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(5000) }).then(r => r.json())
    const modelo = config.ia?.modelo ?? modelos?.data?.[0]?.id ?? 'local'
    const r = await fetch(`${base}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, content: texto }),
      signal: AbortSignal.timeout(20000),
    })
    const cuerpo = await r.json()
    if (!Array.isArray(cuerpo.tokens)) throw new Error(cuerpo?.error?.message ?? 'sin tokens')
    return { tokens: cuerpo.tokens.length, estimado: false, modelo }
  } catch (error) {
    return { tokens: Math.round(texto.length / 4), estimado: true, motivo: error.message }
  }
}

const escenarios = [
  { nombre: 'sin contexto (el tanque, como siempre)', contexto: null, catalogo: herramientas.catalogo() },
  { nombre: `con contexto de «${SISTEMA[id].nombre}» (${id})`, contexto: { sistema: id }, catalogo: herramientas.catalogo(id) },
]

console.log(`\n${c.negrita}Tamaño del prompt del asistente${c.reset}  ${c.gris}${maquinas.length} configurada(s) · maxPasos ${config.ia?.maxPasos ?? 3}${c.reset}\n`)

const filas = []
for (const e of escenarios) {
  const prompt = instrucciones(textoDelCatalogo(e.catalogo), config.ia?.maxPasos ?? 3, 'es', null, e.contexto)
  const { tokens, estimado, modelo, motivo } = await contarTokens(prompt)
  filas.push({ ...e, prompt, tokens, estimado, modelo, motivo })
  console.log(`  ${c.negrita}${e.nombre}${c.reset}`)
  console.log(`    ${e.catalogo.length} señales en el catálogo · ${prompt.length} caracteres · ${c.negrita}${tokens} tokens${c.reset}` +
    (estimado ? ` ${c.amarillo}(estimados a 4 car/token${motivo ? `: ${motivo}` : ''})${c.reset}` : ` ${c.gris}(${modelo})${c.reset}`))
}

const [base, con] = filas
const delta = con.tokens - base.tokens
console.log(`\n  ${c.negrita}Diferencia:${c.reset} ${delta >= 0 ? '+' : ''}${delta} tokens (${((con.tokens / base.tokens) * 100).toFixed(0)} % del prompt de siempre)`)
console.log(`  ${c.gris}Esto MIDE, no afirma. Anota la cifra en el plan antes de dar el catálogo por bueno.${c.reset}\n`)
