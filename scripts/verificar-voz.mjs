#!/usr/bin/env node
/**
 * scripts/verificar-voz.mjs
 * ------------------------------------------------------------------
 * Comprueba el dictado por voz **sin whisper-server real**.
 *
 * Levanta un whisper-server falso al que se le dice qué contestar, y monta la
 * app contra él. Mismo criterio que `verificar-chat.mjs`: los casos que
 * importan —un audio sin convertir, uno que se pasa del tope, el servidor
 * apagado— no se pueden provocar a voluntad con el binario de verdad, y con el
 * de verdad cada comprobación costaría segundos de CPU.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 *  - Que un audio que NO es WAV se rechace aquí y no en whisper-server, cuya
 *    respuesta a un formato que no entiende es una transcripción VACÍA. Ese
 *    modo de fallo llega a la pantalla como «no se oyó nada» y manda a repetir
 *    la frase más alto cuando el problema es que el navegador no convirtió.
 *  - Que pasarse del tope devuelva un 413 QUE LLEGUE. Destruir el socket antes
 *    de escribir la respuesta —que es lo que hacía— deja al cliente con un
 *    error de red en vez del motivo.
 *  - Que sin `IA_WHISPER_BASE` la ruta dé 503 y no caiga al index.html de la
 *    SPA, que sería un 200 con HTML dentro.
 *  - Que las anotaciones del transcriptor (BLANK_AUDIO, «música») no acaben en
 *    el cuadro de pregunta del operador.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-voz.mjs
 *
 * No necesita red, ni GPU, ni whisper.cpp, ni ICONICS.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createApp } from '../backend/app.mjs'
import { loadConfig } from '../backend/config.mjs'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
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
  }
}

/* ── whisper-server falso ────────────────────────────────────────────── */

/** Qué contesta el servidor falso. Lo cambia cada comprobación. */
let respuestaWhisper = { text: 'nivel del tanque ahora mismo' }
/** Lo que recibió, para poder comprobar QUE se le mandó lo que toca. */
let ultimoFormulario = null

const whisper = createServer(async (req, res) => {
  if (req.url !== '/inference' || req.method !== 'POST') {
    res.writeHead(404).end()
    return
  }

  // El multipart no se parsea entero: basta con saber qué campos llegaron, que
  // es lo que se quiere comprobar. Parsearlo de verdad sería reimplementar un
  // parser para una prueba.
  const trozos = []
  for await (const t of req) trozos.push(t)
  const crudo = Buffer.concat(trozos).toString('latin1')

  ultimoFormulario = {
    tieneArchivo: crudo.includes('name="file"'),
    idioma: crudo.match(/name="language"\r?\n\r?\n([^\r\n]*)/)?.[1] ?? null,
    prompt: crudo.match(/name="prompt"\r?\n\r?\n([^\r\n]*)/)?.[1] ?? null,
    // El WAV viaja entero dentro del multipart: si la cabecera RIFF no está,
    // es que se corrompió por el camino.
    llevaRiff: crudo.includes('RIFF'),
  }

  if (respuestaWhisper.status) {
    res.writeHead(respuestaWhisper.status).end('roto')
    return
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(respuestaWhisper))
})

await new Promise(r => whisper.listen(0, '127.0.0.1', r))
const whisperBase = `http://127.0.0.1:${whisper.address().port}`

/* ── La app, contra el whisper falso ─────────────────────────────────── */

async function levantar(extra = {}) {
  const config = loadConfig({ LOG_LEVEL: 'ERROR', ...extra })
  const servidor = await createApp(config)
  await servidor.listen({ port: 0, host: '127.0.0.1' })
  return {
    servidor,
    base: `http://127.0.0.1:${servidor.server.address().port}`,
    config,
    cerrar: () => servidor.close(),
  }
}

/** Un WAV mínimo pero VÁLIDO: cabecera canónica y unas muestras de silencio. */
function wavDePrueba(muestras = 1600) {
  const buffer = Buffer.alloc(44 + muestras * 2)
  buffer.write('RIFF', 0, 'latin1')
  buffer.writeUInt32LE(36 + muestras * 2, 4)
  buffer.write('WAVE', 8, 'latin1')
  buffer.write('fmt ', 12, 'latin1')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)      // PCM
  buffer.writeUInt16LE(1, 22)      // mono
  buffer.writeUInt32LE(16000, 24)
  buffer.writeUInt32LE(32000, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'latin1')
  buffer.writeUInt32LE(muestras * 2, 40)
  return buffer
}

const enviar = (base, cuerpo, sistema = null) =>
  fetch(`${base}/api/voz${sistema ? `?sistema=${encodeURIComponent(sistema)}` : ''}`, {
    method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: cuerpo,
  })

console.log(`\n${c.negrita}Dictado por voz${c.reset}`)

const app = await levantar({ IA_WHISPER_BASE: whisperBase, IA_WHISPER_IDIOMA: 'es' })

console.log('\n── El camino feliz ─────────────────────────────────────────')

await check('GET /api/voz anuncia el dictado, su idioma y el tope', async () => {
  const r = await (await fetch(`${app.base}/api/voz`)).json()
  assert.equal(r.habilitado, true)
  assert.equal(r.idioma, 'es')
  // El tope viaja para que el frontend pueda cortar la grabación ANTES de
  // enviar: descubrirlo con un 413 tras hablar tres minutos los tira.
  assert.ok(r.maxBytes > 1024 * 1024, 'el tope tiene que ser mayor que el de JSON')
})

await check('un WAV se transcribe y devuelve el texto', async () => {
  respuestaWhisper = { text: ' ¿qué nivel tiene el tanque? ' }
  const r = await enviar(app.base, wavDePrueba())
  assert.equal(r.status, 200)
  const cuerpo = await r.json()
  assert.equal(cuerpo.texto, '¿qué nivel tiene el tanque?', 'y se entrega recortado')
})

await check('el audio llega íntegro a whisper, no convertido a texto', async () => {
  respuestaWhisper = { text: 'hola' }
  await enviar(app.base, wavDePrueba())
  assert.ok(ultimoFormulario.tieneArchivo, 'tiene que ir como archivo del multipart')
  // Es la comprobación que protege contra volver a leer el cuerpo con
  // `readJsonBody`: pasar un WAV por UTF-8 destroza los bytes sin dar error.
  assert.ok(ultimoFormulario.llevaRiff, 'la cabecera RIFF tiene que sobrevivir el viaje')
})

await check('se le manda el idioma configurado y el vocabulario de la planta', async () => {
  respuestaWhisper = { text: 'hola' }
  await enviar(app.base, wavDePrueba())
  assert.equal(ultimoFormulario.idioma, 'es', 'el idioma es fijo, no auto: ver config.mjs')
  assert.match(
    ultimoFormulario.prompt ?? '', /Cerabar|caudal/,
    'el prompt lleva los nombres propios que Whisper no acierta solo'
  )
})

await check('el vocabulario cambia con el SISTEMA que se está mirando', async () => {
  /*
   * Whisper escribe lo que oye guiándose por el prompt, y el prompt gasta
   * contexto suyo: una lista con el vocabulario de todas las máquinas de la
   * planta empeora la transcripción de todo lo demás. Por eso cada sistema
   * declara el suyo en `shared/eva/sistemas.js` y aquí se elige uno.
   *
   * Y no es sólo tamaño: preguntando por vibraciones con las palabras del agua
   * delante, «lado acople» y «rodamiento» salían deformados. Una pregunta
   * deformada hace que el asistente conteste sobre otra cosa — peor que no
   * entenderla, porque no se nota.
   */
  respuestaWhisper = { text: 'hola' }

  await enviar(app.base, wavDePrueba(), 'vibraciones')
  const vib = ultimoFormulario.prompt ?? ''
  assert.match(vib, /rodamiento/, 'en vibraciones tiene que oír «rodamiento»')
  assert.match(vib, /acople/)

  await enviar(app.base, wavDePrueba(), 'tanque')
  const tanque = ultimoFormulario.prompt ?? ''
  assert.match(tanque, /tanque|derrame/, 'y en el tanque, las suyas')
  assert.ok(!tanque.includes('rodamiento'),
    'sin mezclarlas: el vocabulario de la otra máquina estorba')
})

await check('un sistema que no existe NO deja el dictado sin vocabulario', async () => {
  /*
   * El caso de un cliente antiguo que no manda `?sistema=`, o de una pantalla
   * nueva sin declarar. Cae al contexto general, que lleva las palabras
   * comunes a toda la planta.
   *
   * Se comprueba porque la primera versión de este cambio dejó el contexto
   * general en «planta industrial» a secas, y el dictado EMPEORÓ justo en el
   * caso más común. Perder vocabulario al añadir la posibilidad de elegirlo
   * es un retroceso disfrazado de mejora.
   */
  respuestaWhisper = { text: 'hola' }
  await enviar(app.base, wavDePrueba(), 'sistema-que-no-existe')
  assert.match(ultimoFormulario.prompt ?? '', /motor|bomba|Cerabar/)
})

console.log('\n── Lo que no puede llegar al operador ──────────────────────')

await check('las anotaciones del transcriptor se quitan', async () => {
  // Whisper marca así lo que oye y no es habla. En un chat eso no es texto que
  // nadie quisiera decir, y si llega al cuadro de pregunta se envía al modelo.
  respuestaWhisper = { text: '[BLANK_AUDIO] la presión de la red (música de fondo)' }
  const cuerpo = await (await enviar(app.base, wavDePrueba())).json()
  assert.equal(cuerpo.texto, 'la presión de la red')
})

await check('un audio del que no se entiende nada se dice, no se devuelve vacío', async () => {
  respuestaWhisper = { text: '  [BLANK_AUDIO]  ' }
  const r = await enviar(app.base, wavDePrueba())
  // 422 y no 200 con cadena vacía: el frontend tiene que poder distinguir
  // «no se oyó nada» de «se oyó el silencio», y sólo el primero se avisa.
  assert.equal(r.status, 422)
  assert.match((await r.json()).error, /no se ha entendido|micrófono/i)
})

console.log('\n── Los rechazos, y que digan qué pasa ──────────────────────')

await check('lo que no es un WAV se rechaza AQUÍ, sin molestar a whisper', async () => {
  ultimoFormulario = null
  const r = await enviar(app.base, Buffer.from('esto es un webm sin convertir, o casi'))
  assert.equal(r.status, 422)
  assert.match((await r.json()).error, /WAV/i, 'y el error dice qué faltaba')
  // Lo importante: NO se llamó a whisper. Su respuesta a un formato que no
  // entiende es una transcripción vacía, que llega como «no se oyó nada».
  assert.equal(ultimoFormulario, null, 'no debía salir ninguna petición a whisper')
})

await check('un cuerpo vacío da 400', async () => {
  assert.equal((await enviar(app.base, Buffer.alloc(0))).status, 400)
})

await check('pasarse del tope da un 413 QUE LLEGA al cliente', async () => {
  /*
   * Esta comprobación existe por un fallo real y por eso mira algo tan
   * concreto. El lector destruía el socket al pasarse del límite, y con 6 MB
   * el cliente sigue subiendo cuando eso ocurre: la respuesta moría con la
   * conexión y llegaba `UND_ERR_SOCKET` en vez del 413. Ahora se pausa la
   * lectura, se escribe el 413 y sólo después se corta.
   */
  const r = await enviar(app.base, Buffer.alloc(app.config.limits.maxAudioBytes + 4096))
  assert.equal(r.status, 413)
  assert.match((await r.json()).error, /supera el límite/i)
})

await check('whisper-server roto se cuenta, no se disfraza de transcripción', async () => {
  respuestaWhisper = { status: 500 }
  const r = await enviar(app.base, wavDePrueba())
  assert.equal(r.status, 422)
  assert.match((await r.json()).error, /respondió 500/)
  respuestaWhisper = { text: 'ok' }
})

console.log('\n── Sin configurar, el dictado no existe ────────────────────')

const sinWhisper = await levantar()

await check('GET dice que no está habilitado', async () => {
  const r = await (await fetch(`${sinWhisper.base}/api/voz`)).json()
  assert.equal(r.habilitado, false)
  assert.equal(r.idioma, null)
})

await check('POST da 503 y NO cae al index.html de la SPA', async () => {
  const r = await enviar(sinWhisper.base, wavDePrueba())
  assert.equal(r.status, 503, 'un 200 con HTML dentro sería indistinguible de funcionar')
  assert.match((await r.json()).error, /IA_WHISPER_BASE/, 'y dice qué variable falta')
})

await sinWhisper.cerrar()
await app.cerrar()
whisper.close()

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/voz.mjs y backend/routes/vozRoutes.mjs.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: el dictado se mantiene.${c.reset}`)
