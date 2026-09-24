#!/usr/bin/env node
/**
 * Mide si el MODELO elige bien el `tipo` de `generar_reporte` (Plan 44 §1.2).
 *
 * Es un instrumento (`medir-*`), no un verificador: habla con el
 * `llama-server` de verdad, así que necesita `IA_BASE` y no devuelve código
 * de error. Levanta el backend entero con el transporte falso de ICONICS —la
 * pregunta es qué hace el modelo, no qué hace la planta— y por cada frase de
 * la tabla §1.2 mira qué herramienta llamó y con qué `tipo`. Lo que sale es
 * una tabla frase → esperado → pedido, y cuántas acertó.
 *
 *   ICONICS_FAKE=true node --env-file=.env.local scripts/medir-tipo-de-reporte.mjs [--modelo <nombre>] [--idioma es|en]
 *
 * Los PDF que genere van a una carpeta temporal, no a la de salida real.
 */
process.env.AUTH_HABILITADA = 'false'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.IA_REPORTES_DIR = await mkdtemp(join(tmpdir(), 'medir-tipo-reporte-'))

const { loadConfig } = await import('../backend/config.mjs')
const { createApp } = await import('../backend/app.mjs')
const { TIPOS } = await import('../backend/ia/reportes/plantillas/index.mjs')

const c = { reset: '\x1b[0m', negrita: '\x1b[1m', verde: '\x1b[32m', rojo: '\x1b[31m', amarillo: '\x1b[33m', gris: '\x1b[90m' }
const argumentos = process.argv.slice(2)
const opcion = (nombre) => { const i = argumentos.indexOf(`--${nombre}`); return i === -1 ? null : argumentos[i + 1] }

const config = loadConfig(process.env)
if (!config.ia.isConfigured) {
  console.log(`\n${c.rojo}Falta IA_BASE.${c.reset} Este instrumento habla con el modelo de verdad:\n  ICONICS_FAKE=true node --env-file=.env.local scripts/medir-tipo-de-reporte.mjs\n`)
  process.exit(1)
}
const app = await createApp(config)
await app.ready()

const modelo = opcion('modelo')
if (modelo) {
  const r = await app.inject({ method: 'POST', url: '/api/chat/modelo', payload: { modelo } })
  if (r.statusCode !== 200) { console.log(`\n${c.rojo}No se pudo cambiar al modelo "${modelo}".${c.reset} ${r.body}\n`); await app.close(); process.exit(1) }
}
const idioma = opcion('idioma') ?? 'es'

/* La tabla §1.2 del plan: qué frase pide qué tipo. `null` = sin tipo (catálogo). */
const CASOS = [
  ['Genérame un reporte técnico sobre el sistema', 'tecnico'],
  ['Quiero el reporte de vibraciones del motor de la última semana', 'vibraciones'],
  ['Dame el CMS de las últimas 6 horas en PDF', 'vibraciones'],
  ['Hazme un reporte de lectura de sensores', 'lectura-de-sensores'],
  ['¿Cómo están leyendo los sensores? Dámelo en un reporte', 'lectura-de-sensores'],
  ['Reporte de riesgos de la máquina', 'riesgos'],
  ['Cuántas alarmas hubo este turno, en un reporte', 'alarmas'],
  ['Reporte de ingeniería del sistema', 'ingenieria'],
  ['Cuánto consumió el motor este mes, en un reporte de energía', 'energias'],
  ['Pronóstico de fallas en PDF', 'predicciones'],
  ['Genérame un reporte', null],
  ['Expórtame todas las señales de esta semana en PDF', null],
  ['Sensor readings report of the last week', 'lectura-de-sensores'],
  ['Technical report of the machine', 'tecnico'],
]

function eventosDe(cuerpo) {
  return cuerpo.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)) } catch { return null } }).filter(Boolean)
}

console.log(`\n${c.negrita}¿Elige el modelo el tipo de reporte? — ${config.ia.modelos?.porDefecto ?? 'modelo por defecto'}${modelo ? ` → ${modelo}` : ''} · idioma ${idioma}${c.reset}`)
console.log(`${c.gris}Tipos que conoce la herramienta: ${TIPOS.join(', ')}${c.reset}\n`)

let aciertos = 0
let conHerramienta = 0
const filas = []
for (const [frase, esperado] of CASOS) {
  const t0 = Date.now()
  const r = await app.inject({ method: 'POST', url: '/api/chat', payload: { pregunta: frase, historial: [], idioma } })
  const ms = Date.now() - t0
  const eventos = eventosDe(r.body)
  const llamadas = eventos.filter((e) => e.tipo === 'herramienta')
  const reporte = llamadas.find((e) => e.nombre === 'generar_reporte')
  const otras = llamadas.filter((e) => e.nombre !== 'generar_reporte').map((e) => e.nombre)
  const pedido = reporte ? (reporte.argumentos?.tipo ?? null) : undefined
  const normalizado = pedido === 'catalogo' ? null : pedido
  const acierto = reporte && (esperado === null ? (normalizado === null) : normalizado === esperado)
  if (reporte) conHerramienta += 1
  if (acierto) aciertos += 1
  filas.push({ frase, esperado: esperado ?? '(sin tipo)', pedido: reporte ? (pedido ?? '(sin tipo)') : `— sin generar_reporte${otras.length ? ` (llamó ${otras.join(', ')})` : ''}`, ok: Boolean(acierto), ms, status: r.statusCode })
}

for (const f of filas) {
  const marca = f.ok ? `${c.verde}✓${c.reset}` : `${c.rojo}✗${c.reset}`
  console.log(`  ${marca} «${f.frase}»`)
  console.log(`      ${c.gris}esperado ${f.esperado} · pedido ${f.pedido} · ${f.ms} ms${f.status !== 200 ? ` · HTTP ${f.status}` : ''}${c.reset}`)
}
console.log(`\n${aciertos === CASOS.length ? c.verde : c.amarillo}${c.negrita}${aciertos} de ${CASOS.length} frases con el tipo correcto${c.reset} ${c.gris}(${conHerramienta} llamaron a generar_reporte)${c.reset}`)
console.log(`${c.gris}Mide, no afirma: un fallo aquí es del modelo o del prompt, no de la herramienta (el normalizador se prueba en backend/test/reportes).${c.reset}\n`)

await app.close()
