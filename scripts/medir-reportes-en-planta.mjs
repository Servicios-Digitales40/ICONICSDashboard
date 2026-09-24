#!/usr/bin/env node
/**
 * Mide las OCHO plantillas de reporte contra la planta de verdad (Plan 44 F7).
 *
 * Es un instrumento (`medir-*`), no un verificador: necesita ICONICS real y
 * una máquina configurada, y **no devuelve código de error**. Lo que produce
 * es una tabla —tiempo, páginas, tamaño, secciones con y sin dato— y los PDF
 * en una carpeta para abrirlos y mirarlos, que es la otra mitad de la F7.
 *
 *   node --env-file=.env.local scripts/medir-reportes-en-planta.mjs [--sistema <id>] [--periodo "<texto>"] [--idioma es|en] [--salida <dir>]
 *
 * ── POR QUÉ NO PASA POR EL MODELO ──────────────────────────────────
 *
 * Que el modelo elija bien el `tipo` ya se midió aparte
 * (`medir-tipo-de-reporte.mjs`, 14 de 14 en la F3.4). Aquí la pregunta es
 * otra: **cuánto tarda y cuánto pesa cada plantilla leyendo el historiador
 * real**, y si las secciones sin dato dicen su motivo de verdad. Meter al
 * modelo en medio añadiría 15–50 s por consulta de redacción que no se está
 * midiendo. Se llama a la herramienta directamente, con el mismo camino que
 * usa el asistente.
 *
 * ── LO QUE SE MIDE, Y POR QUÉ ESOS TRES ────────────────────────────
 *
 *   tiempo    D14: una plantilla pide las series que su sección declara, y
 *             `tecnico` puede pedir ocho. Contra el historiador real eso son
 *             ocho viajes troceados. Si tarda de más, se decide con la
 *             medida delante.
 *   tamaño    el arte de portada añade ~0,5 MB por PDF, y el enlace de
 *             descarga va por el chat.
 *   motivos   cada sección sin dato tiene que decir POR QUÉ, no un genérico
 *             «sin datos» (D3). Aquí se imprimen todos para leerlos.
 */
process.env.AUTH_HABILITADA = 'false'
/* Sólo la tabla: el registro del backend a stdout taparía lo que se mide. */
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error'

import { mkdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const c = { reset: '\x1b[0m', negrita: '\x1b[1m', verde: '\x1b[32m', rojo: '\x1b[31m', amarillo: '\x1b[33m', gris: '\x1b[90m' }
const argumentos = process.argv.slice(2)
const opcion = (nombre) => { const i = argumentos.indexOf(`--${nombre}`); return i === -1 ? null : argumentos[i + 1] }

const salida = resolve(opcion('salida') ?? join(process.cwd(), 'reportes-f7'))
await mkdir(salida, { recursive: true })
process.env.IA_REPORTES_DIR = salida

const { loadConfig } = await import('../backend/config.mjs')
const { createApp } = await import('../backend/app.mjs')
const { TIPOS } = await import('../backend/ia/reportes/plantillas/index.mjs')
const { SISTEMAS } = await import('../shared/eva/comun/sistemas.js')

const config = loadConfig(process.env)
if (!config.iconics?.apiBase || process.env.ICONICS_FAKE === 'true') {
  console.log(`\n${c.rojo}Este instrumento mide contra PLANTA REAL.${c.reset}`)
  console.log(`Necesita ${c.negrita}ICONICS_API_BASE${c.reset} y NO \`ICONICS_FAKE=true\`:\n`)
  console.log('  node --env-file=.env.local scripts/medir-reportes-en-planta.mjs\n')
  console.log(`${c.gris}Para medir sin planta está el transporte falso, pero entonces los tiempos\nno significan nada: el falso contesta al instante.${c.reset}\n`)
  process.exit(1)
}

const app = await createApp(config)
await app.ready()

/* La máquina: la pedida, o la única configurada en servicio. */
const idPedido = opcion('sistema')
const configuradas = SISTEMAS.filter((s) => s.configurada && !s.cerrado)
const sistema = idPedido ?? configuradas[0]?.id
if (!sistema) {
  console.log(`\n${c.rojo}No hay ninguna máquina configurada en servicio.${c.reset}`)
  console.log(`${c.gris}Configura una en el tablero o pasa --sistema <id>.${c.reset}\n`)
  await app.close()
  process.exit(1)
}

const periodo = opcion('periodo') ?? 'últimas 24 horas'
const idioma = opcion('idioma') ?? 'es'

const { createHerramientas } = await import('../backend/ia/conversacion/herramientas.mjs')
const { createIconicsClient } = await import('../backend/iconics/client.mjs')
const { createAuthenticator } = await import('../backend/iconics/authenticator.mjs')
/* El SEGUNDO argumento no es opcional: sin él, `request()` revienta al pedir
   `authorizationHeaders` y cada lectura del historiador falla con un
   «no se pudo contactar con ICONICS» que despista, porque el servidor está
   perfectamente. Es el mismo par que arma `app.mjs`. */
const client = createIconicsClient(config, createAuthenticator(config))
const herramientas = createHerramientas({ client, reportes: config.reportes })

console.log(`\n${c.negrita}Las ocho plantillas contra planta — ${sistema} · ${periodo} · ${idioma}${c.reset}`)
console.log(`${c.gris}${config.iconics.apiBase}${c.reset}`)
console.log(`${c.gris}Los PDF quedan en ${salida}${c.reset}\n`)

const filas = []
for (const tipo of TIPOS) {
  const t0 = Date.now()
  const r = await herramientas.ejecutar('generar_reporte', { tipo, sistema, periodo }, { idioma })
  const ms = Date.now() - t0

  if (!r.ok) {
    filas.push({ tipo, ms, ok: false, error: r.error })
    continue
  }
  const id = new URL(`http://x${r._adjunto.url}`).searchParams.get('id')
  let bytes = null
  try { bytes = (await stat(join(salida, `${id}.pdf`))).size } catch { /* el archivo se mide si está */ }
  filas.push({
    tipo, ms, ok: true, id, bytes,
    folio: r.folio, paginas: r.paginas, graficas: r.graficas ?? null,
    conDato: r.seccionesConDato ?? [], sinDato: r.seccionesSinDato ?? [],
  })
}

const mb = (b) => (b === null ? '—' : `${(b / 1_048_576).toFixed(2)} MB`)
const seg = (ms) => `${(ms / 1000).toFixed(1)} s`

for (const f of filas) {
  if (!f.ok) {
    console.log(`  ${c.amarillo}○${c.reset} ${c.negrita}${f.tipo}${c.reset} ${c.gris}· ${seg(f.ms)} · no se emite${c.reset}`)
    console.log(`      ${c.gris}${String(f.error).replace(/\s+/g, ' ').slice(0, 220)}${c.reset}`)
    continue
  }
  /* `catalogo` es el reporte de SIEMPRE y no devuelve manifiesto: no lleva
     `paginas` ni `folio` con prefijo, y el Plan 44 dice que no se toca.
     Imprimir «undefined» ahí haría parecer un defecto lo que es su contrato. */
  const extra = [f.paginas ? `${f.paginas} pág` : null, f.folio ?? null].filter(Boolean).join(' · ')
  console.log(`  ${c.verde}✓${c.reset} ${c.negrita}${f.tipo}${c.reset} ${c.gris}· ${seg(f.ms)} · ${mb(f.bytes)}${extra ? ` · ${extra}` : ` · ${c.gris}sin manifiesto (el reporte de siempre)`}${c.reset}`)
  if (f.sinDato.length) {
    for (const s of f.sinDato) {
      console.log(`      ${c.amarillo}sin dato${c.reset} ${s.seccion ?? s.id}: ${c.gris}${String(s.motivo ?? '(vacía)').replace(/\s+/g, ' ').slice(0, 200)}${c.reset}`)
    }
  }
}

const emitidos = filas.filter((f) => f.ok)
if (emitidos.length) {
  const tiempos = emitidos.map((f) => f.ms).sort((a, b) => a - b)
  const pesos = emitidos.map((f) => f.bytes ?? 0)
  const masLento = emitidos.reduce((a, b) => (b.ms > a.ms ? b : a))
  const masPesado = emitidos.reduce((a, b) => ((b.bytes ?? 0) > (a.bytes ?? 0) ? b : a))
  console.log(`\n${c.negrita}${emitidos.length} de ${filas.length} emitidos${c.reset}`)
  console.log(`  ${c.gris}tiempo: mediana ${seg(tiempos[Math.floor(tiempos.length / 2)])} · el más lento ${masLento.tipo} con ${seg(masLento.ms)}${c.reset}`)
  console.log(`  ${c.gris}tamaño: total ${mb(pesos.reduce((a, b) => a + b, 0))} · el más pesado ${masPesado.tipo} con ${mb(masPesado.bytes)}${c.reset}`)
  const sinMotivo = emitidos.flatMap((f) => f.sinDato.filter((s) => !s.motivo).map((s) => `${f.tipo}/${s.seccion ?? s.id}`))
  console.log(`  ${sinMotivo.length ? c.amarillo : c.gris}secciones sin dato Y sin motivo: ${sinMotivo.length ? sinMotivo.join(', ') : 'ninguna'}${c.reset}`)
}
console.log(`\n${c.gris}Mide, no afirma. Abre los PDF de ${salida} antes de dar la F7 por buena.${c.reset}\n`)

await app.close()
