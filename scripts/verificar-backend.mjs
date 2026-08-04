#!/usr/bin/env node
/**
 * scripts/verificar-backend.mjs
 * ------------------------------------------------------------------
 * Comprueba el CONTRATO del backend puente sin necesidad de un servidor
 * ICONICS.
 *
 * A diferencia de `verificar-catalogo.mjs` y `verificar-historia.mjs`, que
 * interrogan al servidor real, este script levanta un ICONICS **falso** —el
 * flujo OIDC completo incluido— y monta la app contra él. Eso permite
 * comprobar lo que aquellos no pueden: qué forma exacta tiene cada respuesta,
 * qué pasa cuando el servidor devuelve un error, y qué pasa cuando no hay
 * servidor en absoluto.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 * El frontend depende de la forma de estas respuestas, no sólo de su código
 * HTTP: `payload` indexado por `pointName` en el lote, `data[]` normalizado
 * en la historia, `result` frente a `results[]` en las escrituras. Un cambio
 * inocente en el backend puede romper una vista sin romper ninguna petición,
 * y eso no se ve hasta abrir el panel.
 *
 * Cubre además las regresiones que motivaron la reestructuración: el
 * preflight CORS que no anunciaba POST/PUT, el flujo OIDC disparado una vez
 * por petición concurrente, y las rutas que se colgaban sin configuración.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-backend.mjs
 *
 * No necesita configuración, ni red, ni el backend levantado.
 *
 * Código de salida: 0 si todo el contrato se cumple, 1 si algo falla.
 */
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { connect } from 'node:net'
import { existsSync } from 'node:fs'
import { createApp } from '../backend/app.mjs'
import { loadConfig } from '../backend/config.mjs'

let loginCount = 0

/* ── Servidor ICONICS falso ──────────────────────────────────────────── */
const fake = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const p = url.pathname

  const json = (code, body, headers = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json', ...headers })
    res.end(JSON.stringify(body))
  }

  // --- OIDC ---
  if (p === '/fwxserverweb/security/connect/authorize') {
    // Segunda pasada (ya con sesión): devuelve el código.
    if (url.searchParams.has('sid')) {
      return res.writeHead(302, { location: '/cb?code=THE_CODE' }).end()
    }
    if (url.searchParams.get('code_challenge_method') !== 'S256') return json(400, { e: 'no pkce' })
    return res
      .writeHead(302, { location: '/login?returnUrl=x', 'set-cookie': 'auth=1; Path=/' })
      .end()
  }
  if (p === '/login') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'set-cookie': 'csrf=2; Path=/' })
    return res.end(
      `<form><input name="__RequestVerificationToken" value="TOK123"/>
       <input name="ReturnUrl" value="/fwxserverweb/security/connect/authorize?sid=9&amp;x=1"/></form>`
    )
  }
  if (p === '/fwxserverweb/security/account/login') {
    let body = ''
    for await (const chunk of req) body += chunk
    const f = new URLSearchParams(body)
    if (f.get('__RequestVerificationToken') !== 'TOK123') return json(400, { e: 'no csrf' })
    if (f.get('Username') !== 'u' || f.get('Password') !== 'p') return json(401, { e: 'bad creds' })
    if (!req.headers.cookie?.includes('auth=1') || !req.headers.cookie?.includes('csrf=2')) {
      return json(400, { e: 'cookies no acumuladas' })
    }
    loginCount += 1
    return res.writeHead(302, { location: f.get('ReturnUrl') }).end()
  }
  if (p === '/fwxserverweb/security/connect/token') {
    let body = ''
    for await (const chunk of req) body += chunk
    const f = new URLSearchParams(body)
    if (f.get('grant_type') === 'refresh_token') {
      return json(200, { access_token: 'REFRESHED', expires_in: 3600 })
    }
    if (f.get('code') !== 'THE_CODE' || !f.get('code_verifier')) return json(400, { e: 'bad code' })
    return json(200, { access_token: 'TOKEN_A', refresh_token: 'R1', expires_in: 3600 })
  }

  // --- API ---
  const authed = req.headers.authorization === 'Bearer TOKEN_A'
  if (p.startsWith('/fwxapi/rest') || p.startsWith('/fwxapi/systeminfo')) {
    if (!authed) return json(401, { error: 'unauthorized' })
  }

  if (p === '/fwxapi/echo/v1') return json(200, { echo: true })
  if (p === '/fwxapi/systeminfo/v1/UserInfo') return json(200, { userName: 'u' })

  if (p === '/fwxapi/rest/v1/Data' && req.method === 'GET') {
    const pn = url.searchParams.get('pointName')
    if (pn === 'boom') return json(500, { detail: 'upstream exploded' })
    return json(200, { pointName: pn, value: 42, quality: 192 })
  }
  if (p === '/fwxapi/rest/v1/Data' && req.method === 'POST') {
    let body = ''
    for await (const chunk of req) body += chunk
    const { pointName } = JSON.parse(body)
    return json(200, pointName.map((n, i) => ({ pointName: n, value: i, quality: 192 })))
  }
  if (p === '/fwxapi/rest/v1/Data/Browse') {
    return json(200, [{ shortName: 'LIN', pointName: 'ac:RESONAC/LIN/' }])
  }
  if (p === '/fwxapi/rest/v1/Data/Search') return json(200, [{ shortName: 'hit' }])
  if (p === '/fwxapi/rest/v1/Data/Write') {
    let body = ''
    for await (const chunk of req) body += chunk
    const items = JSON.parse(body)
    assert.ok(Array.isArray(items), 'Write debe recibir un array')
    return json(200, items.map(i => ({ pointName: i.pointName, success: true })))
  }
  if (p === '/fwxapi/rest/v1/History') {
    return json(
      200,
      [
        { historicalSamples: [{ timestamp: 't1', value: 1, quality: 192 }] },
        { historicalSamples: [{ timestamp: 't2', value: 2 }] },
      ],
      { 'X-ICO-CONTINUATION': 'more' }
    )
  }
  if (p === '/fwxapi/rest/v1/AlarmHistory') {
    return json(200, [{ eventId: 'e1', startDate: url.searchParams.get('startDate') }])
  }
  if (p === '/fwxapi/rest/v1/Alarm/SetAlarmState') return json(200, { acknowledged: 1 })

  return json(404, { e: 'not found', p })
})

await new Promise(r => fake.listen(0, '127.0.0.1', r))
const fakeBase = `http://127.0.0.1:${fake.address().port}`

/* ── Backend bajo prueba ─────────────────────────────────────────────── */
const config = loadConfig({
  PORT: '0',
  LOG_LEVEL: 'ERROR',
  ICONICS_API_BASE: `${fakeBase}/fwxapi/rest/v1/`,
  ICONICS_USERNAME: 'u',
  ICONICS_PASSWORD: 'p',
  ICONICS_POINT_NAME: 'ac:default',
  STATIC_DIR: 'react-dashboard/dist',
})

const app = createServer(createApp(config))
await new Promise(r => app.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${app.address().port}`

const get = async (path, init) => {
  const res = await fetch(`${base}${path}`, init)
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body, headers: res.headers }
}

/* Mismos colores que el resto de scripts de verificación. */
const c = {
  reset: '\x1b[0m', rojo: '\x1b[31m', verde: '\x1b[32m',
  gris: '\x1b[90m', negrita: '\x1b[1m',
}

let passed = 0
const fallos = []

function check(nombre, comprobacion) {
  try {
    comprobacion()
    passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(nombre)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
    console.log(`    ${c.gris}${error.message.split('\n')[0]}${c.reset}`)
  }
}

console.log('\n── Contrato de la API ──────────────────────────────────────')

// 1. Lectura de un punto
{
  const r = await get('/api/iconics/data?pointName=ac:RESONAC/LIN/1/OEE')
  check('GET /api/iconics/data → { ok, status, payload, pointName }', () => {
    assert.equal(r.status, 200)
    assert.equal(r.body.ok, true)
    assert.equal(r.body.pointName, 'ac:RESONAC/LIN/1/OEE')
    assert.equal(r.body.payload.value, 42)
  })
}

// 2. Punto por defecto cuando no se pasa pointName
{
  const r = await get('/api/iconics/data')
  check('GET /api/iconics/data sin parámetro usa ICONICS_POINT_NAME', () => {
    assert.equal(r.body.pointName, 'ac:default')
  })
}

// 3. Error del servidor se propaga con su status
{
  const r = await get('/api/iconics/data?pointName=boom')
  check('error upstream → status propagado + { ok:false, error, payload }', () => {
    assert.equal(r.status, 500)
    assert.equal(r.body.ok, false)
    assert.equal(r.body.error, 'ICONICS API request failed.')
    assert.equal(r.body.payload.detail, 'upstream exploded')
  })
}

// 4. Validación
{
  const r = await get('/api/iconics/data?pointName=' + encodeURIComponent('bad;{}|point'))
  check('pointName inválido → 400', () => {
    assert.equal(r.status, 400)
    assert.equal(r.body.error, 'Invalid pointName parameter.')
  })
}

// 5. Lote → mapa indexado por pointName (lo que consume pollingEngine)
{
  const pts = ['ac:a', 'ac:b', '$info:Overview.Tier']
  const r = await get('/api/iconics/data/batch?points=' + pts.map(encodeURIComponent).join(','))
  check('GET /api/iconics/data/batch → payload como mapa', () => {
    assert.equal(r.body.ok, true)
    assert.deepEqual(Object.keys(r.body.payload), pts)
    assert.equal(r.body.payload['ac:a'].payload.value, 0)
    assert.equal(r.body.payload['$info:Overview.Tier'].ok, true)
  })
}
{
  const r = await get('/api/iconics/data/batch')
  check('batch sin points → 400', () => {
    assert.equal(r.status, 400)
    assert.match(r.body.error, /points parameter is required/)
  })
}

// 6. Historia: normalización + hasMore
{
  const r = await get(
    '/api/iconics/history?pointName=' + encodeURIComponent('hda:\\Configuration\\X:OEE') +
    '&startDate=2026-08-04T00:00:00%2B02:00&endDate=2026-08-05T00:00:00%2B02:00' +
    '&aggregate=Interpolative&interval=01:00:00'
  )
  check('GET /api/iconics/history → { ok, data[], hasMore }', () => {
    assert.equal(r.body.ok, true)
    assert.equal(r.body.hasMore, true)
    assert.equal(r.body.data.length, 2, 'debe acumular muestras de todos los items')
    assert.deepEqual(r.body.data[0], { timestamp: 't1', value: 1, quality: 192 })
    assert.equal(r.body.data[1].quality, 0, 'quality ausente → 0')
  })
}
{
  const r = await get('/api/iconics/history')
  check('history sin pointName → 400', () => assert.equal(r.status, 400))
}

// 7. Browse / search / userinfo
{
  const r = await get('/api/iconics/browse?path=' + encodeURIComponent('ac:RESONAC/'))
  check('GET /api/iconics/browse → { ok, payload[] }', () => {
    assert.equal(r.body.ok, true)
    assert.equal(r.body.payload[0].pointName, 'ac:RESONAC/LIN/')
  })
}
{
  const r = await get('/api/iconics/points?query=OEE')
  check('GET /api/iconics/points → { ok, payload }', () => assert.equal(r.body.ok, true))
}
{
  const r = await get('/api/iconics/userinfo')
  check('GET /api/iconics/userinfo → { ok, payload }', () => {
    assert.equal(r.body.payload.userName, 'u')
  })
}

// 8. Escritura simple y en lote
{
  const r = await get('/api/iconics/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pointName: 'db:X.@@Execute', value: true }),
  })
  check('POST /api/iconics/write → { ok, result }', () => {
    assert.equal(r.body.ok, true)
    assert.equal(r.body.result.success, true)
    assert.equal(r.body.result.pointName, 'db:X.@@Execute')
  })
}
{
  const r = await get('/api/iconics/write/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ pointName: 'ac:a', value: 1 }, { pointName: 'ac:b', value: 2 }] }),
  })
  check('POST /api/iconics/write/batch → { ok, results[] }', () => {
    assert.equal(r.body.ok, true)
    assert.equal(r.body.results.length, 2)
  })
}
{
  const r = await get('/api/iconics/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pointName: 'ac:a' }),
  })
  check('write sin value → 400', () => {
    assert.equal(r.status, 400)
    assert.equal(r.body.error, 'value is required.')
  })
}
{
  const r = await get('/api/iconics/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'no-es-json',
  })
  check('cuerpo no-JSON → 400 Invalid JSON body.', () => {
    assert.equal(r.status, 400)
    assert.equal(r.body.error, 'Invalid JSON body.')
  })
}

// 9. Alarmas
{
  const r = await get('/api/iconics/alarms?hours=3')
  check('GET /api/iconics/alarms → { ok, alarms[] }', () => {
    assert.equal(r.body.ok, true)
    assert.match(r.body.alarms[0].startDate, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
}
{
  const r = await get('/api/iconics/alarms/acknowledge', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventIds: ['e1'], comment: 'ok' }),
  })
  check('PUT .../acknowledge → { ok, result }', () => {
    assert.equal(r.body.ok, true)
    assert.equal(r.body.result.acknowledged, 1)
  })
}

// 10. Salud
{
  const r = await get('/api/health')
  check('GET /api/health → ok con servidor accesible y token válido', () => {
    assert.equal(r.body.status, 'ok')
    assert.equal(r.body.iconicsReachable, true)
    assert.equal(r.body.tokenValid, true)
    assert.equal(typeof r.body.uptimeSeconds, 'number')
  })
}

// 11. Contexto
{
  const r = await get('/api/context')
  check('GET /api/context → { context, iconics }', () => {
    assert.equal(r.body.context.usuario, 'Operador')
    assert.equal(r.body.iconics.ok, true)
  })
}

console.log('\n── Regresiones corregidas ──────────────────────────────────')

// A. CORS: el preflight debe anunciar los métodos que la API acepta
{
  const res = await fetch(`${base}/api/iconics/write`, { method: 'OPTIONS' })
  check('preflight anuncia POST y PUT (antes solo GET, OPTIONS)', () => {
    assert.equal(res.status, 204)
    const allow = res.headers.get('access-control-allow-methods')
    assert.match(allow, /POST/)
    assert.match(allow, /PUT/)
  })
}

// B. Un solo login para muchas peticiones concurrentes en frío
check('token cacheado: un único login para todas las peticiones previas', () => {
  assert.equal(loginCount, 1, `logins=${loginCount}`)
})
{
  loginCount = 0
  const cold = createServer(createApp(config))
  await new Promise(r => cold.listen(0, '127.0.0.1', r))
  const coldBase = `http://127.0.0.1:${cold.address().port}`

  // 20 peticiones simultáneas contra un backend sin token todavía.
  const responses = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      fetch(`${coldBase}/api/iconics/data?pointName=ac:p${i}`).then(r => r.json())
    )
  )
  check('20 peticiones concurrentes en frío → un solo flujo OIDC', () => {
    assert.ok(responses.every(r => r.ok === true), 'todas deben resolverse bien')
    assert.equal(loginCount, 1, `logins=${loginCount} (antes: uno por petición)`)
  })
  cold.close()
}

// C. Método no permitido → 405 y no caída al SPA
{
  const r = await get('/api/iconics/data', { method: 'PUT' })
  check('método incorrecto → 405 con cabecera Allow', () => {
    assert.equal(r.status, 405)
    assert.equal(r.headers.get('allow'), 'GET')
  })
}

// D. Cuerpo desmesurado → 413 en vez de comerse la RAM
{
  const r = await get('/api/iconics/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pointName: 'ac:a', value: 'x'.repeat(2 * 1024 * 1024) }),
  }).catch(e => ({ status: 'conn-reset:' + e.message, body: {} }))
  check('cuerpo > 1 MiB → 413 (o corte de conexión)', () => {
    assert.ok(r.status === 413 || String(r.status).startsWith('conn-reset'), `status=${r.status}`)
  })
}

// E. Estáticos: se sirve el build real de react-dashboard/dist. Sólo se
//    comprueba si ese build existe; sin él, la respuesta correcta es un 503
//    que lo diga, y eso también se verifica.
{
  const hayBuild = existsSync(new URL('../react-dashboard/dist/index.html', import.meta.url))
  const r = await get('/una/ruta/de/la/spa')

  check(
    hayBuild
      ? 'ruta desconocida → index.html del build (antes: 503 siempre)'
      : 'sin build compilado → 503 explicando que falta',
    () => {
      if (hayBuild) {
        assert.equal(r.status, 200)
        assert.match(String(r.body), /<!doctype html>|<html/i)
      } else {
        assert.equal(r.status, 503)
        assert.match(String(r.body), /Frontend build not found/)
      }
    }
  )
}
// F. Travesía de rutas: hay que mandarla por socket crudo, porque `fetch`
//    normaliza los ".." antes de enviarlos y no probaría nada.
{
  const raw = await new Promise(resolve => {
    const socket = connect(app.address().port, '127.0.0.1', () => {
      socket.write('GET /assets/../../../.env.local HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')
    })
    let data = ''
    socket.on('data', chunk => { data += chunk })
    socket.on('end', () => resolve(data))
  })
  check('travesía de rutas no filtra .env.local', () => {
    assert.ok(!raw.includes('ICONICS_PASSWORD'), 'la respuesta contiene el .env')
    assert.ok(!raw.includes('ICONICS_API_BASE'), 'la respuesta contiene el .env')
  })
}

console.log('\n── Sin ICONICS configurado ─────────────────────────────────')
{
  const bare = createServer(createApp(loadConfig({ LOG_LEVEL: 'ERROR' })))
  await new Promise(r => bare.listen(0, '127.0.0.1', r))
  const bareBase = `http://127.0.0.1:${bare.address().port}`

  const alarms = await fetch(`${bareBase}/api/iconics/alarms`)
  const alarmsBody = await alarms.json()
  check('alarms sin API_BASE → 500 limpio (antes: petición colgada)', () => {
    assert.equal(alarms.status, 500)
    assert.equal(alarmsBody.error, 'ICONICS_API_BASE is not configured.')
  })

  const health = await (await fetch(`${bareBase}/api/health`)).json()
  check('health sin API_BASE → error + motivo', () => {
    assert.equal(health.status, 'error')
    assert.equal(health.reason, 'ICONICS_API_BASE not configured')
  })
  bare.close()
}

console.log('\n── Configuración inválida ──────────────────────────────────')
check('ICONICS_API_BASE mal formada falla al cargar, con mensaje', () => {
  assert.throws(() => loadConfig({ ICONICS_API_BASE: 'no-es-url' }), /URL absoluta válida/)
})
check('PORT inválido falla al cargar, con mensaje', () => {
  assert.throws(() => loadConfig({ PORT: '99999' }), /entre 0 y 65535/)
})

app.close()
fake.close()

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}El contrato del backend cambió: revisa que el frontend siga leyendo`)
  console.log(`las mismas claves (react-dashboard/src/lib/iconics/apiClient.js).${c.reset}`)
  process.exit(1)
}

console.log(`${c.verde}${c.negrita}${passed} comprobaciones correctas: el contrato del backend se mantiene.${c.reset}`)
process.exit(0)
