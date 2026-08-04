/**
 * Autenticación OIDC contra ICONICS 11.x.
 *
 * La API REST de FrameWorX solo admite Authorization Code + PKCE, un flujo
 * pensado para que lo recorra un navegador con un humano delante. Aquí se
 * automatiza servidor a servidor: se genera el par PKCE, se pide la página de
 * login, se envían las credenciales, se cambia el código por tokens y se
 * refresca antes de que caduquen.
 *
 * El estado (tokens, caducidad) vive en el cierre de la factoría y no en
 * variables de módulo: así dos configuraciones distintas —producción y una
 * prueba— pueden coexistir sin pisarse los tokens.
 */
import crypto from 'node:crypto'
import { logger } from '../logger.mjs'

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded'
const HTTP_FOUND = 302

/** El par PKCE: el verificador se guarda, el reto viaja en la autorización. */
function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/**
 * Une las cookies de todas las respuestas del flujo. ICONICS reparte estado de
 * sesión entre varias (antifalsificación, correlación de autorización) y el
 * paso siguiente falla si le llega solo la última.
 */
function collectCookies(responses) {
  return responses
    .flatMap(response => response.headers.getSetCookie?.() ?? [])
    .map(cookie => cookie.split(';')[0])
    .join('; ')
}

/** Los `Location` del servidor llegan a veces relativos y a veces absolutos. */
function toAbsoluteUrl(origin, location) {
  if (location.startsWith('http')) return location
  return origin + (location.startsWith('/') ? '' : '/') + location
}

function extractHiddenField(html, name) {
  return html.match(new RegExp(`name="${name}"[^>]*value="([^"]+)"`))?.[1]
}

/** El HTML llega con entidades escapadas; la URL hay que devolverla cruda. */
function decodeHtmlAmpersands(value) {
  return value?.replace(/&amp;/g, '&')
}

async function postForm(url, fields, { cookies } = {}) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': FORM_CONTENT_TYPE,
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: new URLSearchParams(fields),
    redirect: 'manual',
  })
}

/**
 * Recorre el flujo completo de login y devuelve la respuesta de tokens.
 * Cada paso está separado para que el error diga en cuál se rompió.
 */
async function performInteractiveLogin(config) {
  const { endpoints, clientId, scope, username, password, origin } = config
  const pkce = createPkcePair()

  // 1. Petición de autorización: responde con un redirect a la página de login.
  const authorizeParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: endpoints.redirectUri,
    response_type: 'code',
    scope,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
  })
  const authorizeResponse = await fetch(`${endpoints.authorize}?${authorizeParams}`, {
    redirect: 'manual',
  })

  const loginPageLocation = authorizeResponse.headers.get('location')
  if (!loginPageLocation) {
    throw new Error('El endpoint de autorización de ICONICS no redirigió al login.')
  }

  // 2. Página de login: de ahí salen el token antifalsificación y el ReturnUrl.
  const loginPageResponse = await fetch(toAbsoluteUrl(origin, loginPageLocation), {
    headers: { Cookie: collectCookies([authorizeResponse]) },
    redirect: 'manual',
  })
  const loginHtml = await loginPageResponse.text()
  const csrfToken = extractHiddenField(loginHtml, '__RequestVerificationToken')
  const returnUrl = decodeHtmlAmpersands(extractHiddenField(loginHtml, 'ReturnUrl'))

  if (!csrfToken || !returnUrl) {
    throw new Error('Could not find CSRF token or return URL on ICONICS login page')
  }

  // 3. Credenciales. Un 302 es el éxito; cualquier otra cosa es rechazo.
  const loginResponse = await postForm(
    endpoints.login,
    {
      ReturnUrl: returnUrl,
      Username: username,
      Password: password,
      __RequestVerificationToken: csrfToken,
      button: 'login',
    },
    { cookies: collectCookies([authorizeResponse, loginPageResponse]) }
  )

  if (loginResponse.status !== HTTP_FOUND) {
    throw new Error(
      `ICONICS login failed (status ${loginResponse.status}). Check ICONICS_USERNAME and ICONICS_PASSWORD.`
    )
  }

  // 4. Se vuelve a autorización, ya con sesión, para recoger el código.
  const authorizedResponse = await fetch(
    toAbsoluteUrl(origin, decodeHtmlAmpersands(loginResponse.headers.get('location'))),
    {
      headers: { Cookie: collectCookies([authorizeResponse, loginPageResponse, loginResponse]) },
      redirect: 'manual',
    }
  )

  const codeLocation = authorizedResponse.headers.get('location')
  if (!codeLocation?.includes('code=')) {
    throw new Error('Authorization did not return a code. Check user permissions.')
  }

  // 5. Canje del código por tokens. El `Location` se normaliza a absoluto
  //    igual que los anteriores: `new URL()` sobre uno relativo lanza.
  return exchange(endpoints.token, {
    grant_type: 'authorization_code',
    client_id: clientId,
    code: new URL(toAbsoluteUrl(origin, codeLocation)).searchParams.get('code'),
    redirect_uri: endpoints.redirectUri,
    code_verifier: pkce.verifier,
  })
}

async function exchange(tokenEndpoint, fields) {
  const response = await postForm(tokenEndpoint, fields)

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Token exchange failed (${response.status}): ${detail}`)
  }
  return response.json()
}

export function createAuthenticator(config) {
  let accessToken = ''
  let refreshToken = ''
  let expiresAtMs = 0
  /**
   * Login en curso. Sin esto, las peticiones que llegan juntas en frío
   * arrancaban cada una su propio flujo de seis viajes de red contra el
   * servidor de seguridad; ahora todas esperan al mismo.
   */
  let pendingAuthentication = null

  const skewMs = config.limits.tokenExpirySkewSeconds * 1000
  const iconics = config.iconics

  function hasValidToken() {
    return Boolean(accessToken) && Date.now() < expiresAtMs
  }

  function storeTokens(tokens) {
    accessToken = tokens.access_token
    if (tokens.refresh_token) refreshToken = tokens.refresh_token
    expiresAtMs = Date.now() + tokens.expires_in * 1000 - skewMs
    logger.info('ICONICS OIDC token obtained', { expiresIn: tokens.expires_in })
  }

  /**
   * Renueva con el refresh token si lo hay y, si el servidor lo rechaza,
   * cae a un login completo. El `refreshToken` se limpia antes de reintentar
   * para que el fallback no pueda repetirse en bucle.
   */
  async function authenticate() {
    if (refreshToken) {
      try {
        storeTokens(
          await exchange(iconics.endpoints.token, {
            grant_type: 'refresh_token',
            client_id: iconics.clientId,
            refresh_token: refreshToken,
          })
        )
        return
      } catch (error) {
        logger.warn('Token refresh failed, performing full login', { reason: error.message })
        refreshToken = ''
      }
    }

    storeTokens(await performInteractiveLogin(iconics))
  }

  async function getAccessToken() {
    if (hasValidToken()) return accessToken
    if (!iconics.canAuthenticate) return ''

    // Comparte el intento en vuelo entre todos los que llegan a la vez.
    pendingAuthentication ??= authenticate().finally(() => {
      pendingAuthentication = null
    })

    await pendingAuthentication
    return accessToken
  }

  /**
   * Cabeceras de autorización para una llamada a la API.
   *
   * Un fallo de autenticación se registra y devuelve cabeceras vacías en vez
   * de propagarse: la llamada sale sin token y el servidor responde 401, que
   * es un diagnóstico más útil que un 502 genérico del puente.
   */
  async function authorizationHeaders() {
    try {
      const token = await getAccessToken()
      return token ? { Authorization: `Bearer ${token}` } : {}
    } catch (error) {
      logger.error('Failed to obtain ICONICS token', { err: error })
      return {}
    }
  }

  return { authorizationHeaders, hasValidToken }
}
