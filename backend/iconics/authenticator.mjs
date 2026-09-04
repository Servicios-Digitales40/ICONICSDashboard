/**
 * Autenticación OIDC contra ICONICS 11.x.
 *
 * La API REST de FrameWorX solo admite Authorization Code + PKCE, un flujo
 * pensado para que lo recorra un navegador con un humano delante. Aquí se
 * automatiza servidor a servidor: se genera el par PKCE, se pide la página de
 * login, se envían las credenciales, se cambia el código por tokens y se
 * refresca antes de que caduquen.
 *
 * ── DE QUIÉN ES ESTA SESIÓN (PLAN 20 FASE 1) ───────────────────────
 *
 * Hasta el 03-09-2026 este archivo abría el flujo con `ICONICS_USERNAME` y
 * `ICONICS_PASSWORD` del entorno: **una identidad de máquina**, una sola para
 * todo el proceso, y esta cabecera decía que era "de máquina, no de persona".
 * Ya no.
 *
 * En la rama `Asistente` las credenciales llegan **por argumento**, desde el
 * formulario de login (`routes/sesionRoutes.mjs`), y hay un autenticador por
 * sesión abierta. El cambio no es cosmético y tiene dos consecuencias que
 * conviene tener presentes al leer el resto del archivo:
 *
 *  1. Toda lectura de planta sale con el token de **la persona que preguntó**,
 *     así que ICONICS aplica sus propios permisos. Un técnico sin permiso de
 *     escritura recibe un 403 del servidor de planta, no del puente.
 *  2. El estado (tokens, caducidad) ya vivía en el cierre de la factoría y no
 *     en variables de módulo. Eso, que antes sólo servía para que producción y
 *     una prueba coexistieran, es ahora **lo que impide que dos sesiones se
 *     pisen los tokens**. Es la razón de que este cambio saliera barato: no
 *     hubo que mover estado, sólo dejar de leerlo del entorno.
 *
 * `config.iconics.username/password` siguen existiendo en `config.mjs`, pero
 * este archivo ya no los mira: los usan el transporte falso y los
 * verificadores, que necesitan una identidad sin humano delante.
 *
 * No confundir con `http/plugins/autenticacion.mjs`: aquél decide **quién
 * puede hablar con el puente**; éste, **cómo el puente habla con ICONICS**.
 * Desde el Plan 20 la respuesta a los dos sale de las mismas credenciales,
 * pero siguen siendo dos preguntas.
 *
 * ── UNA SEGUNDA VÍA, SIN FORMULARIO (HMI EMBEBIDO) ──────────────────
 *
 * `construirUrlSsoSilencioso`, `intercambiarCodigoSilencioso` y
 * `obtenerUsuarioDelToken` son un segundo camino de entrada, para cuando el
 * asistente vive empotrado como `<iframe>` dentro del HMI nativo de ICONICS:
 * ahí el navegador ya trae la cookie de sesión de ICONICS puesta, y `POST
 * /api/sesion/silenciosa` la aprovecha en vez de pedir usuario y contraseña
 * otra vez. Sus sesiones NO guardan contraseña — ver la guarda en
 * `authenticate()` más abajo — así que si el `refresh_token` algún día falla,
 * no pueden rehacer un login completo por su cuenta: fallan limpio y el
 * técnico vuelve a entrar (el intento silencioso lo intenta de nuevo solo).
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

async function postForm(url, fields, { cookies, timeoutMs } = {}) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': FORM_CONTENT_TYPE,
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: new URLSearchParams(fields),
    redirect: 'manual',
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  })
}

/**
 * Recorre el flujo completo de login y devuelve la respuesta de tokens.
 * Cada paso está separado para que el error diga en cuál se rompió.
 *
 * ── POR QUÉ CADA PASO LLEVA CORTE ──────────────────────────────────
 *
 * Los cinco saltos de este flujo salían SIN timeout. Un ICONICS que acepta la
 * conexión y no contesta —el modo de fallo de un servidor saturado, no el de
 * uno caído— dejaba el login colgado para siempre, y con él TODA petición que
 * necesitara token: el puente se quedaba mudo sin una sola línea en el log
 * que lo explicara. `client.mjs` ya se protegía de eso en sus llamadas; aquí
 * faltaba, y es peor, porque esto corre antes que cualquier lectura.
 *
 * @param {object} iconics `config.iconics`: a qué servidor y con qué cliente.
 * @param {{usuario: string, contrasena: string}} credenciales De quién es la
 *   sesión. Llegan por argumento y no del entorno — ver la cabecera.
 * @param {number} timeoutMs Corte por salto, no para el flujo entero.
 */
async function performInteractiveLogin(iconics, credenciales, timeoutMs) {
  const { endpoints, clientId, scope, origin } = iconics
  const { usuario: username, contrasena: password } = credenciales
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
    signal: AbortSignal.timeout(timeoutMs),
  })

  const loginPageLocation = authorizeResponse.headers.get('location')
  if (!loginPageLocation) {
    throw new Error('El endpoint de autorización de ICONICS no redirigió al login.')
  }

  // 2. Página de login: de ahí salen el token antifalsificación y el ReturnUrl.
  const loginPageResponse = await fetch(toAbsoluteUrl(origin, loginPageLocation), {
    headers: { Cookie: collectCookies([authorizeResponse]) },
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
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
    { cookies: collectCookies([authorizeResponse, loginPageResponse]), timeoutMs }
  )

  if (loginResponse.status !== HTTP_FOUND) {
    throw new Error(
      `ICONICS rechazó las credenciales de "${username}" (estado ${loginResponse.status}). ` +
        'Revisa el usuario y la contraseña, y que ese usuario siga habilitado en el servidor de planta.'
    )
  }

  // 4. Se vuelve a autorización, ya con sesión, para recoger el código.
  const authorizedResponse = await fetch(
    toAbsoluteUrl(origin, decodeHtmlAmpersands(loginResponse.headers.get('location'))),
    {
      headers: { Cookie: collectCookies([authorizeResponse, loginPageResponse, loginResponse]) },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    }
  )

  const codeLocation = authorizedResponse.headers.get('location')
  if (!codeLocation?.includes('code=')) {
    throw new Error('Authorization did not return a code. Check user permissions.')
  }

  // 5. Canje del código por tokens. El `Location` se normaliza a absoluto
  //    igual que los anteriores: `new URL()` sobre uno relativo lanza.
  return exchange(
    endpoints.token,
    {
      grant_type: 'authorization_code',
      client_id: clientId,
      code: new URL(toAbsoluteUrl(origin, codeLocation)).searchParams.get('code'),
      redirect_uri: endpoints.redirectUri,
      code_verifier: pkce.verifier,
    },
    timeoutMs
  )
}

async function exchange(tokenEndpoint, fields, timeoutMs) {
  const response = await postForm(tokenEndpoint, fields, { timeoutMs })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Token exchange failed (${response.status}): ${detail}`)
  }
  return response.json()
}

/**
 * Arma la URL de un intento de SSO silencioso (`prompt=none`) y el
 * verificador PKCE que hace falta para canjear el código si vuelve uno.
 *
 * ── QUÉ ES ESTO Y DE DÓNDE SALE ─────────────────────────────────────
 *
 * Cuando el asistente vive empotrado en un `<iframe>` dentro del HMI nativo
 * de ICONICS (AnyGlass/GraphWorX), el navegador YA tiene la cookie de sesión
 * de ICONICS puesta — el técnico entró una vez, por la pantalla de ICONICS.
 * `prompt=none` le pregunta al mismo servidor de identidad «¿ya hay sesión?»
 * sin mostrar ningún formulario: si la cookie está, responde con un código
 * de un solo uso; si no, con `error=login_required`. Confirmado a mano contra
 * este servidor el 04-09-2026 — no es un comportamiento documentado por
 * ICONICS, es observado.
 *
 * El frontend abre esta URL en un iframe OCULTO (no el que ve el técnico) y
 * espera la respuesta por `postMessage` desde `/auth/silencioso` — ver
 * `routes/sesionRoutes.mjs`.
 *
 * @returns {{url: string, verificador: string}|null} `null` si
 *   `SSO_REDIRECT_URI` no está configurada: sin ella no hay a dónde volver
 *   con el código, y ofrecer el intento igual sólo cambiaría un login por un
 *   error de ICONICS más confuso.
 */
export function construirUrlSsoSilencioso(config) {
  const { endpoints, clientId, scope, ssoRedirectUri } = config.iconics
  if (!ssoRedirectUri) return null

  const pkce = createPkcePair()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: ssoRedirectUri,
    response_type: 'code',
    scope,
    prompt: 'none',
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
  })
  return { url: `${endpoints.authorize}?${params}`, verificador: pkce.verifier }
}

/**
 * Canjea el código de un SSO silencioso por tokens. Es el mismo canje que el
 * paso 5 de `performInteractiveLogin` — la diferencia es que aquí el código
 * lo trajo el NAVEGADOR (via el iframe oculto), no nuestro propio scraping
 * del formulario de login.
 */
export async function intercambiarCodigoSilencioso(config, { code, codeVerifier }) {
  const { endpoints, clientId, ssoRedirectUri } = config.iconics
  return exchange(
    endpoints.token,
    {
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: ssoRedirectUri,
      code_verifier: codeVerifier,
    },
    config.limits.upstreamTimeoutMs
  )
}

/**
 * Quién es el dueño de un token, para el SSO silencioso: a diferencia del
 * login por formulario, aquí nadie escribió un usuario a mano.
 *
 * @throws {Error} si ICONICS rechaza el token o no devuelve un nombre
 *   reconocible — se prueban `userName`/`username`/`name` porque la forma
 *   exacta de `UserInfo` no está documentada públicamente y esto es más
 *   barato que asumir un único campo y romper en silencio el día que cambie.
 */
export async function obtenerUsuarioDelToken(config, accessToken) {
  const response = await fetch(config.iconics.endpoints.userInfo, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(config.limits.upstreamTimeoutMs),
  })
  if (!response.ok) {
    throw new Error(`ICONICS UserInfo respondió ${response.status} identificando al usuario del SSO silencioso.`)
  }
  const payload = await response.json()
  const usuario = payload?.userName || payload?.username || payload?.name
  if (!usuario) {
    throw new Error('ICONICS UserInfo no devolvió un nombre de usuario reconocible.')
  }
  return usuario
}

/**
 * Prueba unas credenciales contra ICONICS y devuelve sus tokens, SIN crear
 * autenticador ni guardar nada.
 *
 * ── POR QUÉ EXISTE SEPARADA DE `createAuthenticator` ───────────────
 *
 * Porque `POST /api/sesion` tiene que poder contestar «usuario o contraseña
 * incorrectos» ANTES de crear la sesión. Sin esto, el login aceptaría
 * cualquier cosa, guardaría una sesión con credenciales malas, y el rechazo
 * aparecería más tarde y disfrazado: un 401 de ICONICS en mitad de la primera
 * pregunta al asistente, que quien lo ve interpreta como «el servidor de
 * planta está caído», no como «me equivoqué de contraseña».
 *
 * Es el mismo flujo de cinco saltos que usa el autenticador; lo que cambia es
 * que aquí los tokens se devuelven y ahí se guardan.
 *
 * @throws {Error} si ICONICS rechaza, con el motivo del salto que falló.
 */
export async function probarCredenciales(config, credenciales) {
  return performInteractiveLogin(
    config.iconics, credenciales, config.limits.upstreamTimeoutMs
  )
}

/**
 * @param {object} config La configuración completa del backend.
 * @param {{usuario: string, contrasena: string}} credenciales De quién es esta
 *   sesión. Obligatorias: sin ellas no hay flujo OIDC que recorrer, y un
 *   autenticador que no puede autenticar sólo sirve para fallar más tarde y
 *   más lejos de la causa.
 * @param {object} [tokensIniciales] Los que ya devolvió `probarCredenciales`,
 *   para no repetir el flujo de cinco saltos que se acaba de recorrer. Es una
 *   optimización con efecto visible: sin ella, entrar al sistema costaría dos
 *   logins completos contra el servidor de seguridad en lugar de uno.
 */
export function createAuthenticator(config, credenciales, tokensIniciales = null) {
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
  /*
   * El MISMO corte que usan las llamadas de datos (`UPSTREAM_TIMEOUT_MS`): si
   * el servidor de planta es lento, lo es para todo, y tener dos números que
   * ajustar por separado invita a que uno se quede corto sin que se note.
   */
  const timeoutMs = config.limits.upstreamTimeoutMs

  function hasValidToken() {
    return Boolean(accessToken) && Date.now() < expiresAtMs
  }

  function storeTokens(tokens) {
    accessToken = tokens.access_token
    if (tokens.refresh_token) refreshToken = tokens.refresh_token
    expiresAtMs = Date.now() + tokens.expires_in * 1000 - skewMs
    /*
     * `debug` y no `info`: con la vida por defecto del token esto se repite
     * cada pocos minutos para siempre, y en marcha normal no dice nada que no
     * se sepa. Lo que sí importa —que la renovación FALLE— se registra abajo
     * como aviso.
     *
     * El token no viaja en los metadatos ni podría: `logger.mjs` redacta
     * `access_token` y `refresh_token` pase lo que pase.
     */
    logger.debug(
      `Token de ICONICS renovado, válido ${Math.round(tokens.expires_in / 60)} min`,
      { validoSegundos: tokens.expires_in, usuario: credenciales?.usuario || null }
    )
  }

  /*
   * Los tokens que `probarCredenciales` acaba de traer al validar el login.
   * Sin esto, entrar al sistema costaría DOS flujos completos de cinco saltos
   * contra el servidor de seguridad: uno para comprobar la contraseña y otro
   * para la primera lectura de planta.
   */
  if (tokensIniciales?.access_token) storeTokens(tokensIniciales)

  /**
   * Renueva con el refresh token si lo hay y, si el servidor lo rechaza,
   * cae a un login completo. El `refreshToken` se limpia antes de reintentar
   * para que el fallback no pueda repetirse en bucle.
   */
  async function authenticate() {
    if (refreshToken) {
      try {
        storeTokens(
          await exchange(
            iconics.endpoints.token,
            {
              grant_type: 'refresh_token',
              client_id: iconics.clientId,
              refresh_token: refreshToken,
            },
            timeoutMs
          )
        )
        return
      } catch (error) {
        logger.warn(
          `La renovación del token de ICONICS falló (${error.message}); se reintenta con un ` +
            'login completo. Si se repite en cada petición, el servidor está rechazando el ' +
            'refresh token y conviene revisar la sesión del usuario en ICONICS.',
          { motivo: error.message, usuario: credenciales?.usuario || null }
        )
        refreshToken = ''
      }
    }

    /*
     * Una sesión nacida de SSO silencioso (§ más arriba) no tiene contraseña:
     * nadie la escribió, `POST /api/sesion/silenciosa` sólo trajo un código de
     * un solo uso. Si el refresh falla, la única salida normal —rehacer el
     * login completo con usuario y contraseña— no existe aquí. Fallar con un
     * mensaje claro es preferible a mandar `Password: undefined` a ICONICS y
     * que el rechazo llegue disfrazado de «credenciales incorrectas»: el
     * técnico simplemente tiene que volver a entrar, y el intento de SSO
     * silencioso lo intentará de nuevo solo en cuanto lo haga.
     */
    if (!credenciales?.contrasena) {
      throw new Error(
        `La sesión de ${credenciales?.usuario || 'este técnico'} vino de un SSO silencioso y no ` +
          'guarda contraseña: no se puede rehacer el login. Hace falta volver a entrar.'
      )
    }

    storeTokens(await performInteractiveLogin(iconics, credenciales, timeoutMs))
  }

  async function getAccessToken() {
    if (hasValidToken()) return accessToken
    /*
     * Sin servidor al que hablar no hay token posible. Antes esto miraba
     * `canAuthenticate`, que exigía además ICONICS_USERNAME/PASSWORD en el
     * entorno; ahora las credenciales las trae la sesión, así que lo único que
     * queda por comprobar es que haya un `origin` configurado.
     */
    if (!iconics.origin || !credenciales?.usuario) return ''

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
      /*
       * Se sigue sin token a propósito: la llamada sale sin `Authorization` y
       * ICONICS responde 401, que es un diagnóstico más útil que un 502
       * genérico del puente. El mensaje lo dice para que quien lea el log no
       * crea que el puente se lo tragó.
       */
      logger.error(
        `No se pudo obtener un token de ICONICS para ${credenciales?.usuario || 'el usuario de la sesión'}: ` +
          `${error?.message ?? error}. Las peticiones saldrán SIN autenticar y ICONICS ` +
          'responderá 401. Revisa que ese usuario siga habilitado en el servidor de planta.',
        { err: error, usuario: credenciales?.usuario || null, endpoint: iconics.endpoints?.token }
      )
      return {}
    }
  }

  return { authorizationHeaders, hasValidToken }
}
