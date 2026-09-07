#!/usr/bin/env node
/**
 * scripts/verificar-tls.mjs
 * ------------------------------------------------------------------
 * Que `NODE_EXTRA_CA_CERTS` sirva de verdad para dejar de apagar la
 * verificación de certificados del proceso entero (Plan 22 F5 · SEG-06).
 *
 * ── POR QUÉ ESTO NO SE PUEDE PROBAR CON VITEST ─────────────────────
 *
 * Porque `NODE_EXTRA_CA_CERTS` la lee Node **al arrancar el proceso**: ponerla
 * en `process.env` a mitad de una prueba no hace absolutamente nada. Hay que
 * lanzar un proceso hijo con la variable puesta y otro sin ella, y comparar lo
 * que le pasa a cada uno contra el mismo servidor. Ese es todo el motivo de
 * que esto sea un verificador y no un `.test.mjs`.
 *
 * ── QUÉ AFIRMA ─────────────────────────────────────────────────────
 *
 * Contra un HTTPS con certificado AUTOFIRMADO en loopback —el mismo caso que
 * `bms-server` en planta—:
 *
 *   sin CA declarado ......: rechazado con DEPTH_ZERO_SELF_SIGNED_CERT
 *   con NODE_EXTRA_CA_CERTS: aceptado, 200
 *
 * Y que la comprobación de arranque de `config.mjs` se niega ante un
 * `NODE_EXTRA_CA_CERTS` que apunta a un archivo que no existe o que no es un
 * certificado — que es donde Node se calla y deja el fallo para más tarde,
 * disfrazado de problema de red.
 *
 * ── DOS CALLEJONES, PARA QUE NADIE LOS REPITA ──────────────────────
 *
 * Medidos el 05-09-2026 al preparar esta fase:
 *
 *  · `undici` NO es importable como paquete desde este backend, así que la
 *    alternativa «un `Agent` con su propio `ca`» no vale.
 *  · Un `execFileSync` dentro del proceso que sirve congela su bucle de
 *    eventos, y el resultado parece un problema de certificado cuando es un
 *    bloqueo. Por eso aquí el servidor y los hijos son asíncronos.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-tls.mjs
 *
 * No necesita red ni ICONICS. Sí necesita `openssl` en el PATH para fabricar
 * el certificado; si no está, lo dice y sale con 0 — no puede afirmar nada,
 * pero tampoco es una regresión del código.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:https'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { loadConfig } from '../backend/config.mjs'

const ejecutar = promisify(execFile)

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m', amarillo: '\x1b[33m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

let passed = 0
const fallos = []

async function check(nombre, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(`${nombre} — ${error.message}`)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
    console.log(`    ${c.gris}${error.message.split('\n')[0]}${c.reset}`)
  }
}

const raiz = await mkdtemp(join(tmpdir(), 'verificar-tls-'))

/* ── Un certificado autofirmado, como el de `bms-server` ─────────────── */

const rutaClave = join(raiz, 'clave.pem')
const rutaCert = join(raiz, 'cert.pem')

try {
  await ejecutar('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', rutaClave, '-out', rutaCert,
    '-days', '1', '-subj', '/CN=localhost',
    // `subjectAltName` y no sólo CN: Node comprueba el SAN, y sin él el
    // certificado se rechaza por nombre —no por firma— y la prueba mediría
    // otra cosa distinta de la que dice medir.
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
  ])
} catch (error) {
  console.log(
    `\n${c.amarillo}Sin \`openssl\` en el PATH (${error.code ?? error.message}).${c.reset}\n` +
    `${c.gris}Este verificador fabrica un certificado autofirmado para comprobar\n` +
    `NODE_EXTRA_CA_CERTS contra un HTTPS de verdad. Sin openssl no puede afirmar\n` +
    `nada — pero no es una regresión del código, así que sale con 0.${c.reset}\n`
  )
  await rm(raiz, { recursive: true, force: true })
  process.exit(0)
}

/* ── El servidor que sólo presenta ese certificado ───────────────────── */

const servidor = createServer(
  { key: await readFile(rutaClave), cert: await readFile(rutaCert) },
  (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  }
)
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const url = `https://localhost:${servidor.address().port}/`

/**
 * Un proceso hijo que hace un `fetch` a ese servidor y cuenta qué le pasó.
 *
 * Hijo y no aquí mismo: `NODE_EXTRA_CA_CERTS` se lee al arrancar el proceso.
 */
async function intentarFetch(entorno) {
  const guion = join(raiz, 'intento.mjs')
  await writeFile(
    guion,
    `try {
       const r = await fetch(${JSON.stringify(url)})
       console.log(JSON.stringify({ ok: true, status: r.status }))
     } catch (e) {
       console.log(JSON.stringify({ ok: false, causa: e.cause?.code ?? e.code ?? e.message }))
     }`
  )

  const { stdout } = await ejecutar(process.execPath, [guion], {
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '1', ...entorno },
  })
  return JSON.parse(stdout.trim())
}

console.log('\n── El certificado autofirmado, sin apagar nada ──────────────')

await check('sin CA declarado, el autofirmado se RECHAZA', async () => {
  const r = await intentarFetch({ NODE_EXTRA_CA_CERTS: '' })
  assert.equal(r.ok, false, 'se aceptó un certificado autofirmado sin declarar su CA')
  assert.equal(
    r.causa, 'DEPTH_ZERO_SELF_SIGNED_CERT',
    `se rechazó, pero por «${r.causa}» y no por ser autofirmado: la prueba estaría midiendo otra cosa`
  )
})

await check('con NODE_EXTRA_CA_CERTS apuntando a ESE certificado, se acepta', async () => {
  const r = await intentarFetch({ NODE_EXTRA_CA_CERTS: rutaCert })
  assert.equal(r.ok, true, `siguió rechazándose: ${r.causa}`)
  assert.equal(r.status, 200)
})

await check('un CA distinto no cuela: confiar en uno no es confiar en cualquiera', async () => {
  // La afirmación que hace útil a la anterior. Sin esto, «con CA funciona»
  // podría ser cierto por haber apagado la verificación por otro lado.
  const otro = join(raiz, 'otro.pem')
  await ejecutar('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', join(raiz, 'otra-clave.pem'), '-out', otro,
    '-days', '1', '-subj', '/CN=otro',
  ])

  const r = await intentarFetch({ NODE_EXTRA_CA_CERTS: otro })
  assert.equal(r.ok, false, 'se aceptó el servidor declarando la CA de otro certificado')
})

console.log('\n── El arranque se niega a fingir que cargó el CA ────────────')

/*
 * Node ignora en silencio un `NODE_EXTRA_CA_CERTS` que no puede leer, y el
 * síntoma llega mucho después disfrazado de fallo de red. `config.mjs` lo
 * convierte en un fallo de arranque con su explicación.
 */
const entornoMinimo = { ICONICS_FAKE: 'true' }

await check('un CA que no existe impide arrancar, diciendo que Node lo ignoraría', () => {
  assert.throws(
    () => loadConfig({ ...entornoMinimo, NODE_EXTRA_CA_CERTS: join(raiz, 'no-existe.pem') }),
    /no se puede leer|EN SILENCIO/
  )
})

await check('un archivo que no es un certificado tampoco, y dice cómo convertirlo', async () => {
  const noEsPem = join(raiz, 'no-es-cert.txt')
  await writeFile(noEsPem, 'esto no es un certificado')

  assert.throws(
    () => loadConfig({ ...entornoMinimo, NODE_EXTRA_CA_CERTS: noEsPem }),
    /no es un certificado en PEM|openssl x509/
  )
})

await check('un PEM válido se acepta y queda declarado en la configuración', () => {
  const config = loadConfig({ ...entornoMinimo, NODE_EXTRA_CA_CERTS: rutaCert })
  assert.equal(config.extraCaCerts, rutaCert)
})

await check('sin la variable, la configuración no inventa ninguna CA', () => {
  assert.equal(loadConfig(entornoMinimo).extraCaCerts, '')
})

/* ── Resultado ───────────────────────────────────────────────────────── */

servidor.close()
await rm(raiz, { recursive: true, force: true })

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  process.exit(1)
}

console.log(
  `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `una CA propia basta, sin apagar la verificación del proceso.${c.reset}`
)
