import crypto from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from './logger.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = normalize(join(__dirname, '..'))
const distDir = join(projectRoot, 'dist')

const PORT = Number(process.env.PORT ?? 3001)
const ICONICS_API_BASE = (process.env.ICONICS_API_BASE ?? '').replace(/\/+$/, '')
const ICONICS_USERNAME = process.env.ICONICS_USERNAME ?? ''
const ICONICS_PASSWORD = process.env.ICONICS_PASSWORD ?? ''
const DEFAULT_POINT_NAME = process.env.ICONICS_POINT_NAME ?? ''

const SERVER_START_TIME = Date.now()

const defaultContext = {
  usuario: process.env.DEFAULT_USUARIO ?? 'Operador',
  linea: process.env.DEFAULT_LINEA ?? 'Linea 1',
  equipo: process.env.DEFAULT_EQUIPO ?? 'Equipo principal',
  turno: process.env.DEFAULT_TURNO ?? 'Matutino',
  rendimiento: process.env.DEFAULT_RENDIMIENTO ?? '84%',
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

// Allowed pattern for point names and search queries — prevent param injection
// ICONICS point names can contain: letters, digits, colons, dots, underscores,
// hyphens, spaces, @, #, parentheses, brackets, slashes, backslashes, and —
// para los Data Manipulators de GridWorX — < > = ' " , (parámetros).
// Examples: "svrsim:step int 5 25 10", "db:Northwind.Products[ProductName][0]",
// "db:Northwind.AddCustomer<@CustomerID='X', @CompanyName='Y'>.@@Execute"
//
// El `$` es del espacio de nombres de diagnóstico `$info:`, que expone el
// estado de la LICENCIA ("$info:Overview.Tier", "$info:Features.HistorianOn").
// Sin él, `scripts/verificar-historia.mjs` no puede distinguir un servidor
// en modo Demo —que apaga la lectura histórica y devuelve 500— de un
// servicio realmente roto.
const SAFE_PARAM_RE = /^[a-zA-Z0-9:._\-\s@#$()[\]/\\<>=',"]{1,300}$/

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'text/plain; charset=utf-8',
  })
  response.end(message)
}

// --- OIDC Token Management ---
// ICONICS 11.x requires Authorization Code + PKCE flow for the FWX REST API.
// We automate the browser login flow server-side: generate PKCE, hit the
// authorize endpoint, POST credentials to the login form, exchange the
// resulting code for tokens, and refresh before expiry.

const ICONICS_HOST = ICONICS_API_BASE
  ? new URL(ICONICS_API_BASE).origin
  : ''
const AUTHORIZE_ENDPOINT = ICONICS_HOST
  ? `${ICONICS_HOST}/fwxserverweb/security/connect/authorize`
  : ''
const TOKEN_ENDPOINT = ICONICS_HOST
  ? `${ICONICS_HOST}/fwxserverweb/security/connect/token`
  : ''
const LOGIN_ENDPOINT = ICONICS_HOST
  ? `${ICONICS_HOST}/fwxserverweb/security/account/login`
  : ''
const REDIRECT_URI = ICONICS_HOST
  ? `${ICONICS_HOST}/fwxapi/swagger/oauth2-redirect.html`
  : ''

let cachedToken = ''
let cachedRefreshToken = ''
let tokenExpiresAt = 0

function resolveUrl(location) {
  if (location.startsWith('http')) return location
  return ICONICS_HOST + (location.startsWith('/') ? '' : '/') + location
}

function collectCookies(responses) {
  const all = []
  for (const r of responses) {
    const sc = r.headers.getSetCookie?.() || []
    all.push(...sc)
  }
  return all.map(c => c.split(';')[0]).join('; ')
}

async function loginAndGetTokens() {
  // Step 1: Generate PKCE pair
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

  // Step 2: Start authorization request
  const authParams = new URLSearchParams({
    client_id: 'in_house_client',
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid fwxserver offline_access',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const r1 = await fetch(`${AUTHORIZE_ENDPOINT}?${authParams}`, { redirect: 'manual' })

  // Step 3: Load login page to get CSRF token
  const r2 = await fetch(resolveUrl(r1.headers.get('location')), {
    headers: { Cookie: collectCookies([r1]) },
    redirect: 'manual',
  })
  const html = await r2.text()
  const csrfToken = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/)?.[1]
  const returnUrl = html.match(/name="ReturnUrl"[^>]*value="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&')

  if (!csrfToken || !returnUrl) {
    throw new Error('Could not find CSRF token or return URL on ICONICS login page')
  }

  // Step 4: POST login credentials
  const r3 = await fetch(LOGIN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: collectCookies([r1, r2]),
    },
    body: new URLSearchParams({
      ReturnUrl: returnUrl,
      Username: ICONICS_USERNAME,
      Password: ICONICS_PASSWORD,
      __RequestVerificationToken: csrfToken,
      button: 'login',
    }),
    redirect: 'manual',
  })

  if (r3.status !== 302) {
    throw new Error(`ICONICS login failed (status ${r3.status}). Check ICONICS_USERNAME and ICONICS_PASSWORD.`)
  }

  // Step 5: Follow redirect back to authorize to get the code
  const loc3 = r3.headers.get('location')?.replace(/&amp;/g, '&')
  const r4 = await fetch(resolveUrl(loc3), {
    headers: { Cookie: collectCookies([r1, r2, r3]) },
    redirect: 'manual',
  })

  const loc4 = r4.headers.get('location')
  if (!loc4 || !loc4.includes('code=')) {
    throw new Error('Authorization did not return a code. Check user permissions.')
  }

  const code = new URL(loc4).searchParams.get('code')

  // Step 6: Exchange code for tokens
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'in_house_client',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    throw new Error(`Token exchange failed (${tokenRes.status}): ${text}`)
  }

  return tokenRes.json()
}

async function refreshAccessToken() {
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: 'in_house_client',
      refresh_token: cachedRefreshToken,
    }),
  })

  if (!tokenRes.ok) {
    throw new Error(`Token refresh failed (${tokenRes.status})`)
  }

  return tokenRes.json()
}

async function getIconicsToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  if (!TOKEN_ENDPOINT || !ICONICS_USERNAME || !ICONICS_PASSWORD) {
    return ''
  }

  try {
    // Try refresh first if we have a refresh token
    const data = cachedRefreshToken
      ? await refreshAccessToken()
      : await loginAndGetTokens()

    cachedToken = data.access_token
    if (data.refresh_token) cachedRefreshToken = data.refresh_token
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000
    logger.info('ICONICS OIDC token obtained', { expiresIn: data.expires_in })
    return cachedToken
  } catch (refreshError) {
    // If refresh failed, do a full login
    if (cachedRefreshToken) {
      logger.warn('Token refresh failed, performing full login', { reason: refreshError.message })
      cachedRefreshToken = ''
      return getIconicsToken()
    }
    throw refreshError
  }
}

async function buildIconicsHeaders() {
  try {
    const token = await getIconicsToken()
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
  } catch (error) {
    logger.error('Failed to obtain ICONICS token', { err: error })
    return {}
  }
}

async function readIconicsPoint(pointName) {
  if (!ICONICS_API_BASE) {
    return {
      ok: false,
      status: 500,
      error: 'ICONICS_API_BASE is not configured.',
    }
  }

  if (!pointName) {
    return {
      ok: false,
      status: 400,
      error: 'pointName is required.',
    }
  }

  const requestUrl = new URL(`${ICONICS_API_BASE}/Data`)
  requestUrl.searchParams.set('pointName', pointName)

  const t0 = Date.now()
  try {
    const headers = await buildIconicsHeaders()
    const upstream = await fetch(requestUrl, { headers })

    const contentType = upstream.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await upstream.json()
      : await upstream.text()

    logger.info('ICONICS data fetched', { pointName, status: upstream.status, durationMs: Date.now() - t0 })

    if (!upstream.ok) {
      return {
        ok: false,
        status: upstream.status,
        error: 'ICONICS API request failed.',
        payload,
      }
    }

    return {
      ok: true,
      status: upstream.status,
      payload,
      pointName,
    }
  } catch (error) {
    logger.error('ICONICS data proxy error', { pointName, durationMs: Date.now() - t0, err: error })
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'Unexpected proxy error.',
    }
  }
}

async function browseIconicsPoints(path) {
  if (!ICONICS_API_BASE) {
    return { ok: false, status: 500, error: 'ICONICS_API_BASE is not configured.' }
  }

  // GET /fwxapi/rest/v1/Data/Browse?path=... → BrowseResult[] (hijos del nodo).
  // Sin `path` navega desde la raíz del espacio de nombres.
  const requestUrl = new URL(`${ICONICS_API_BASE}/Data/Browse`)
  if (path) requestUrl.searchParams.set('path', path)

  try {
    const headers = await buildIconicsHeaders()
    const upstream = await fetch(requestUrl, { headers })

    const contentType = upstream.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await upstream.json()
      : await upstream.text()

    if (!upstream.ok) {
      return { ok: false, status: upstream.status, error: 'ICONICS browse failed.', payload }
    }

    return { ok: true, status: upstream.status, payload }
  } catch (error) {
    logger.error('ICONICS browse error', { path, err: error })
    return { ok: false, status: 502, error: error instanceof Error ? error.message : 'Unexpected proxy error.' }
  }
}

async function searchIconicsPoints(query) {
  if (!ICONICS_API_BASE) {
    return {
      ok: false,
      status: 500,
      error: 'ICONICS_API_BASE is not configured.',
    }
  }

  // GET /fwxapi/rest/v1/Data/Search?text=query → BrowseResult[]
  const requestUrl = new URL(`${ICONICS_API_BASE}/Data/Search`)
  if (query) requestUrl.searchParams.set('text', query)

  try {
    const headers = await buildIconicsHeaders()
    const upstream = await fetch(requestUrl, { headers })

    const contentType = upstream.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await upstream.json()
      : await upstream.text()

    if (!upstream.ok) {
      return {
        ok: false,
        status: upstream.status,
        error: 'ICONICS points search failed.',
        payload,
      }
    }

    return {
      ok: true,
      status: upstream.status,
      payload,
    }
  } catch (error) {
    logger.error('ICONICS points search error', { query, err: error })
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'Unexpected proxy error.',
    }
  }
}

async function readIconicsUserInfo() {
  if (!ICONICS_API_BASE) {
    return { ok: false, status: 500, error: 'ICONICS_API_BASE is not configured.' }
  }

  // GET /fwxapi/systeminfo/v1/UserInfo — base URL is /fwxapi/rest/v1, so go up two levels
  const host = new URL(ICONICS_API_BASE).origin
  const requestUrl = `${host}/fwxapi/systeminfo/v1/UserInfo`

  try {
    const headers = await buildIconicsHeaders()
    const upstream = await fetch(requestUrl, { headers })

    const contentType = upstream.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await upstream.json()
      : await upstream.text()

    if (!upstream.ok) {
      return { ok: false, status: upstream.status, error: 'ICONICS UserInfo request failed.', payload }
    }

    return { ok: true, status: upstream.status, payload }
  } catch (error) {
    logger.error('ICONICS userinfo error', { err: error })
    return { ok: false, status: 502, error: error instanceof Error ? error.message : 'Unexpected proxy error.' }
  }
}

async function batchReadIconicsPoints(tags) {
  if (!ICONICS_API_BASE) {
    return { ok: false, status: 500, error: 'ICONICS_API_BASE is not configured.' }
  }

  // POST /fwxapi/rest/v1/Data with body { pointName: string[] } → ReadResult[]
  const requestUrl = `${ICONICS_API_BASE}/Data`
  const t0 = Date.now()

  try {
    const headers = await buildIconicsHeaders()
    const upstream = await fetch(requestUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pointName: tags }),
    })

    const contentType = upstream.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await upstream.json()
      : await upstream.text()

    logger.info('ICONICS batch fetch', { count: tags.length, status: upstream.status, durationMs: Date.now() - t0 })

    if (!upstream.ok) {
      return { ok: false, status: upstream.status, error: 'ICONICS batch request failed.', payload }
    }

    // payload is ReadResult[] — convert to map keyed by pointName
    const map = {}
    if (Array.isArray(payload)) {
      for (const item of payload) {
        map[item.pointName] = { ok: true, status: 200, payload: item }
      }
    }

    return { ok: true, payload: map }
  } catch (error) {
    logger.error('ICONICS batch proxy error', { count: tags.length, durationMs: Date.now() - t0, err: error })
    return { ok: false, status: 502, error: error instanceof Error ? error.message : 'Unexpected proxy error.' }
  }
}

async function writeIconicsPoint(pointName, value) {
  if (!ICONICS_API_BASE) {
    return { ok: false, status: 500, error: 'ICONICS_API_BASE is not configured.' }
  }

  // POST /fwxapi/rest/v1/Data/Write — body: WriteItem[]
  const requestUrl = `${ICONICS_API_BASE}/Data/Write`
  const t0 = Date.now()

  try {
    const headers = await buildIconicsHeaders()
    const upstream = await fetch(requestUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ pointName, value }]),
    })

    const contentType = upstream.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await upstream.json()
      : await upstream.text()

    logger.info('ICONICS write', { pointName, value, status: upstream.status, durationMs: Date.now() - t0 })

    if (!upstream.ok) {
      return { ok: false, status: upstream.status, error: 'ICONICS write request failed.', payload }
    }

    // payload is WriteResult[] — grab first element
    const result = Array.isArray(payload) ? payload[0] : payload
    return { ok: true, status: 200, result }
  } catch (error) {
    logger.error('ICONICS write error', { pointName, durationMs: Date.now() - t0, err: error })
    return { ok: false, status: 502, error: error instanceof Error ? error.message : 'Unexpected proxy error.' }
  }
}

async function batchWriteIconicsPoints(items) {
  if (!ICONICS_API_BASE) {
    return { ok: false, status: 500, error: 'ICONICS_API_BASE is not configured.' }
  }

  // POST /fwxapi/rest/v1/Data/Write — body: WriteItem[] (varias celdas de una vez)
  const requestUrl = `${ICONICS_API_BASE}/Data/Write`
  const t0 = Date.now()

  try {
    const headers = await buildIconicsHeaders()
    const upstream = await fetch(requestUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    })

    const contentType = upstream.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await upstream.json()
      : await upstream.text()

    logger.info('ICONICS batch write', { count: items.length, status: upstream.status, durationMs: Date.now() - t0 })

    if (!upstream.ok) {
      return { ok: false, status: upstream.status, error: 'ICONICS batch write request failed.', payload }
    }

    // payload is WriteResult[]
    return { ok: true, status: 200, results: Array.isArray(payload) ? payload : [payload] }
  } catch (error) {
    logger.error('ICONICS batch write error', { count: items.length, durationMs: Date.now() - t0, err: error })
    return { ok: false, status: 502, error: error instanceof Error ? error.message : 'Unexpected proxy error.' }
  }
}

async function readIconicsHistory(pointName, startDate, endDate, aggregate, interval) {
  if (!ICONICS_API_BASE) {
    return { ok: false, status: 500, error: 'ICONICS_API_BASE is not configured.' }
  }

  // GET /fwxapi/rest/v1/History
  const requestUrl = new URL(`${ICONICS_API_BASE}/History`)
  requestUrl.searchParams.set('pointName', pointName)
  if (startDate) requestUrl.searchParams.set('startDate', startDate)
  if (endDate) requestUrl.searchParams.set('endDate', endDate)
  if (aggregate) requestUrl.searchParams.set('aggregateName', aggregate)
  if (interval) requestUrl.searchParams.set('processingInterval', interval)

  const t0 = Date.now()
  try {
    const headers = await buildIconicsHeaders()
    // Request up to 2000 samples per call
    const upstream = await fetch(requestUrl, {
      headers: { ...headers, 'X-ICO-MAX-ITEM-COUNT': '100' },
    })

    const contentType = upstream.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await upstream.json()
      : await upstream.text()

    logger.info('ICONICS history fetched', { pointName, status: upstream.status, durationMs: Date.now() - t0 })

    if (!upstream.ok) {
      return { ok: false, status: upstream.status, error: 'ICONICS History request failed.', payload }
    }

    // payload is ReadResult[] with historicalSamples or just array of samples
    // Normalize: each item has { timestamp, value, quality }
    let samples = []
    if (Array.isArray(payload)) {
      for (const item of payload) {
        if (item.historicalSamples && Array.isArray(item.historicalSamples)) {
          samples = item.historicalSamples.map(s => ({
            timestamp: s.timestamp,
            value: s.value,
            quality: s.quality ?? 0,
          }))
        } else if (item.timestamp !== undefined && item.value !== undefined) {
          samples.push({ timestamp: item.timestamp, value: item.value, quality: item.quality ?? 0 })
        }
      }
    }

    const hasMore = Boolean(upstream.headers.get('X-ICO-CONTINUATION'))

    return { ok: true, status: 200, data: samples, hasMore }
  } catch (error) {
    logger.error('ICONICS history error', { pointName, durationMs: Date.now() - t0, err: error })
    return { ok: false, status: 502, error: error instanceof Error ? error.message : 'Unexpected proxy error.' }
  }
}

async function serveStaticAsset(response, requestPath) {
  const normalizedPath = normalize(join(distDir, requestPath))

  if (!normalizedPath.startsWith(distDir)) {
    sendText(response, 403, 'Forbidden')
    return
  }

  try {
    const assetStats = await stat(normalizedPath)

    if (!assetStats.isFile()) {
      sendText(response, 404, 'Not found')
      return
    }

    response.writeHead(200, {
      'Content-Type': contentTypes[extname(normalizedPath)] ?? 'application/octet-stream',
    })

    createReadStream(normalizedPath).pipe(response)
  } catch {
    sendText(response, 404, 'Not found')
  }
}

// --- Health check helper ---
async function checkIconicsConnectivity() {
  if (!ICONICS_API_BASE) return { reachable: false, reason: 'ICONICS_API_BASE not configured' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    // GET /fwxapi/echo/v1 — no auth required, lightweight ping
    const host = new URL(ICONICS_API_BASE).origin
    const res = await fetch(`${host}/fwxapi/echo/v1`, { signal: controller.signal })
    clearTimeout(timeout)
    return { reachable: res.ok, httpStatus: res.status }
  } catch (err) {
    clearTimeout(timeout)
    return { reachable: false, reason: err.name === 'AbortError' ? 'timeout' : err.message }
  }
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, 'Bad request')
    return
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Origin': '*',
    })
    response.end()
    return
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host}`)
  const ip = request.socket.remoteAddress ?? 'unknown'

  logger.info('Request', { method: request.method, url: requestUrl.pathname, ip })

  // --- /api/health ---
  if (requestUrl.pathname === '/api/health') {
    const tokenValid = Boolean(cachedToken && Date.now() < tokenExpiresAt)
    const connectivity = await checkIconicsConnectivity()

    let status
    if (connectivity.reachable && tokenValid) status = 'ok'
    else if (!connectivity.reachable) status = 'error'
    else status = 'degraded'

    sendJson(response, 200, {
      status,
      iconicsReachable: connectivity.reachable,
      tokenValid,
      uptimeSeconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
      timestamp: new Date().toISOString(),
      ...(connectivity.reason ? { reason: connectivity.reason } : {}),
    })
    return
  }

  if (requestUrl.pathname === '/api/context') {
    const pointName = requestUrl.searchParams.get('pointName') ?? DEFAULT_POINT_NAME
    const iconicsData = pointName ? await readIconicsPoint(pointName) : null

    sendJson(response, 200, {
      context: defaultContext,
      iconics: iconicsData,
    })
    return
  }

  // --- /api/iconics/data (single point) ---
  if (requestUrl.pathname === '/api/iconics/data') {
    const pointName = requestUrl.searchParams.get('pointName') ?? DEFAULT_POINT_NAME

    if (pointName && !SAFE_PARAM_RE.test(pointName)) {
      sendJson(response, 400, { ok: false, error: 'Invalid pointName parameter.' })
      return
    }

    const result = await readIconicsPoint(pointName)
    sendJson(response, result.status, result)
    return
  }

  // --- /api/iconics/data/batch (multiple points via POST /Data) ---
  if (requestUrl.pathname === '/api/iconics/data/batch') {
    const pointsParam = requestUrl.searchParams.get('points') ?? ''
    const tags = pointsParam
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    if (tags.length === 0) {
      sendJson(response, 400, { ok: false, error: 'points parameter is required (comma-separated list).' })
      return
    }

    if (tags.some(t => !SAFE_PARAM_RE.test(t))) {
      sendJson(response, 400, { ok: false, error: 'One or more point names are invalid.' })
      return
    }

    logger.info('Batch data request', { count: tags.length })

    const result = await batchReadIconicsPoints(tags)
    sendJson(response, result.ok ? 200 : result.status, result)
    return
  }

  // --- /api/iconics/alarms ---
  if (requestUrl.pathname === '/api/iconics/alarms') {
    const pointName = requestUrl.searchParams.get('pointName') ?? ''
    const hours = Math.min(Number(requestUrl.searchParams.get('hours') ?? '1'), 48)

    if (pointName && !SAFE_PARAM_RE.test(pointName)) {
      sendJson(response, 400, { ok: false, error: 'Invalid pointName parameter.' })
      return
    }

    const end = new Date()
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000)
    const pad = n => String(n).padStart(2, '0')
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

    const alarmUrl = new URL(`${ICONICS_API_BASE}/AlarmHistory`)
    if (pointName) alarmUrl.searchParams.set('pointName', pointName)
    alarmUrl.searchParams.set('startDate', fmt(start))
    alarmUrl.searchParams.set('endDate', fmt(end))

    try {
      const headers = await buildIconicsHeaders()
      const upstream = await fetch(alarmUrl, {
        headers: { ...headers, 'X-ICO-MAX-ITEM-COUNT': '100' },
      })
      const contentType = upstream.headers.get('content-type') ?? ''
      const payload = contentType.includes('application/json') ? await upstream.json() : await upstream.text()

      if (!upstream.ok) {
        sendJson(response, upstream.status, { ok: false, error: 'ICONICS AlarmHistory request failed.', payload })
        return
      }
      sendJson(response, 200, { ok: true, alarms: Array.isArray(payload) ? payload : [] })
    } catch (error) {
      logger.error('ICONICS alarms error', { err: error })
      sendJson(response, 502, { ok: false, error: error instanceof Error ? error.message : 'Unexpected proxy error.' })
    }
    return
  }

  // --- /api/iconics/alarms/acknowledge ---
  if (requestUrl.pathname === '/api/iconics/alarms/acknowledge' && request.method === 'PUT') {
    let body = ''
    for await (const chunk of request) body += chunk
    let parsed
    try { parsed = JSON.parse(body) } catch {
      sendJson(response, 400, { ok: false, error: 'Invalid JSON body.' })
      return
    }

    const { eventIds, comment } = parsed
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      sendJson(response, 400, { ok: false, error: 'eventIds array is required.' })
      return
    }

    const ackUrl = `${ICONICS_API_BASE}/Alarm/SetAlarmState`
    try {
      const headers = await buildIconicsHeaders()
      const upstream = await fetch(ackUrl, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'Acknowledge', eventIds, comment: comment ?? '' }),
      })
      const contentType = upstream.headers.get('content-type') ?? ''
      const payload = contentType.includes('application/json') ? await upstream.json() : await upstream.text()

      if (!upstream.ok) {
        sendJson(response, upstream.status, { ok: false, error: 'ICONICS ACK request failed.', payload })
        return
      }
      sendJson(response, 200, { ok: true, result: payload })
    } catch (error) {
      logger.error('ICONICS alarm ACK error', { err: error })
      sendJson(response, 502, { ok: false, error: error instanceof Error ? error.message : 'Unexpected proxy error.' })
    }
    return
  }

  // --- /api/iconics/write ---
  if (requestUrl.pathname === '/api/iconics/write' && request.method === 'POST') {
    let body = ''
    for await (const chunk of request) body += chunk
    let parsed
    try { parsed = JSON.parse(body) } catch {
      sendJson(response, 400, { ok: false, error: 'Invalid JSON body.' })
      return
    }

    const { pointName, value } = parsed
    if (!pointName || !SAFE_PARAM_RE.test(String(pointName))) {
      sendJson(response, 400, { ok: false, error: 'pointName is required and must be valid.' })
      return
    }
    if (value === undefined || value === null) {
      sendJson(response, 400, { ok: false, error: 'value is required.' })
      return
    }

    const result = await writeIconicsPoint(pointName, value)
    sendJson(response, result.ok ? 200 : result.status, result)
    return
  }

  // --- /api/iconics/write/batch (varias celdas de una vez) ---
  if (requestUrl.pathname === '/api/iconics/write/batch' && request.method === 'POST') {
    let body = ''
    for await (const chunk of request) body += chunk
    let parsed
    try { parsed = JSON.parse(body) } catch {
      sendJson(response, 400, { ok: false, error: 'Invalid JSON body.' })
      return
    }

    const { items } = parsed
    if (!Array.isArray(items) || items.length === 0) {
      sendJson(response, 400, { ok: false, error: 'items array is required ([{ pointName, value }]).' })
      return
    }

    for (const it of items) {
      if (!it || !it.pointName || !SAFE_PARAM_RE.test(String(it.pointName))) {
        sendJson(response, 400, { ok: false, error: `Invalid pointName: ${it?.pointName}` })
        return
      }
      if (it.value === undefined || it.value === null) {
        sendJson(response, 400, { ok: false, error: `value is required for ${it.pointName}` })
        return
      }
    }

    const result = await batchWriteIconicsPoints(items)
    sendJson(response, result.ok ? 200 : result.status, result)
    return
  }

  // --- /api/iconics/history ---
  if (requestUrl.pathname === '/api/iconics/history') {
    const pointName = requestUrl.searchParams.get('pointName') ?? ''
    const startDate = requestUrl.searchParams.get('startDate') ?? ''
    const endDate = requestUrl.searchParams.get('endDate') ?? ''
    const aggregate = requestUrl.searchParams.get('aggregate') ?? ''
    const interval = requestUrl.searchParams.get('interval') ?? ''

    if (!pointName || !SAFE_PARAM_RE.test(pointName)) {
      sendJson(response, 400, { ok: false, error: 'pointName is required and must be valid.' })
      return
    }

    const result = await readIconicsHistory(pointName, startDate, endDate, aggregate, interval)
    sendJson(response, result.ok ? 200 : result.status, result)
    return
  }

  // --- /api/iconics/userinfo ---
  if (requestUrl.pathname === '/api/iconics/userinfo') {
    const result = await readIconicsUserInfo()
    sendJson(response, result.ok ? 200 : result.status, result)
    return
  }

  if (requestUrl.pathname === '/api/iconics/points') {
    const query = requestUrl.searchParams.get('query') ?? ''

    if (query && !SAFE_PARAM_RE.test(query)) {
      sendJson(response, 400, { ok: false, error: 'Invalid query parameter.' })
      return
    }

    const result = await searchIconicsPoints(query)
    sendJson(response, result.ok ? 200 : result.status, result)
    return
  }

  // --- /api/iconics/browse (navegar el árbol de puntos: db, ax/assets, etc.) ---
  if (requestUrl.pathname === '/api/iconics/browse') {
    const path = requestUrl.searchParams.get('path') ?? ''

    if (path && !SAFE_PARAM_RE.test(path)) {
      sendJson(response, 400, { ok: false, error: 'Invalid path parameter.' })
      return
    }

    const result = await browseIconicsPoints(path)
    sendJson(response, result.ok ? 200 : result.status, result)
    return
  }

  if (requestUrl.pathname.startsWith('/assets/') || requestUrl.pathname === '/favicon.svg' || requestUrl.pathname === '/icons.svg') {
    await serveStaticAsset(response, requestUrl.pathname)
    return
  }

  if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
    if (!existsSync(join(distDir, 'index.html'))) {
      sendText(response, 503, 'Frontend build not found. Run npm run build:iconics first.')
      return
    }

    await serveStaticAsset(response, '/index.html')
    return
  }

  if (existsSync(join(distDir, 'index.html'))) {
    await serveStaticAsset(response, '/index.html')
    return
  }

  sendText(response, 404, 'Not found')
})

server.listen(PORT, '0.0.0.0', () => {
  logger.info('ICONICS bridge started', {
    port: PORT,
    iconicsBase: ICONICS_API_BASE || null,
    defaultPoint: DEFAULT_POINT_NAME || null,
  })
})
