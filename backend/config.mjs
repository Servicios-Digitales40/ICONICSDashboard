/**
 * Configuración del backend puente: única lectura de `process.env`.
 *
 * Ningún otro módulo toca el entorno. Eso es lo que permite instanciar el
 * servidor con una configuración de prueba (`loadConfig({ ... })`) sin
 * ensuciar variables globales, y es también lo que hace que el arranque
 * falle *aquí* —con un mensaje que dice qué variable está mal— en vez de
 * reventar más tarde con un `TypeError: Invalid URL` sin contexto.
 */
import { isAbsolute, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const BACKEND_DIR = fileURLToPath(new URL('.', import.meta.url))
const PROJECT_ROOT = normalize(join(BACKEND_DIR, '..'))

/** Salida de `vite build`, que vive dentro del propio frontend. */
const DEFAULT_STATIC_DIR = join('react-dashboard', 'dist')

const DEFAULTS = {
  port: 3001,
  logLevel: 'INFO',
  /** Cuerpo máximo aceptado en POST/PUT. Evita que un cliente agote la RAM. */
  maxRequestBodyBytes: 1024 * 1024,
  /** `X-ICO-MAX-ITEM-COUNT` para historia y alarmas. */
  maxUpstreamItems: 100,
  /** Ventana máxima que se puede pedir a `/api/iconics/alarms`. */
  maxAlarmHours: 48,
  /** Corte del ping de salud: un servidor colgado no debe colgar `/api/health`. */
  healthTimeoutMs: 5000,
  /**
   * Corte de CUALQUIER llamada saliente hacia ICONICS.
   *
   * El modo de fallo de un servidor saturado no es rechazar la conexión, es
   * aceptarla y no contestar. Sin este corte la petición se quedaba colgada
   * indefinidamente, y con varias pantallas sondeando eso acumula sockets
   * hasta tumbar el puente. 15 s es holgado para la llamada más cara medida
   * (historia de un día agregada) y muy inferior al timeout del navegador.
   */
  upstreamTimeoutMs: 15000,
  /** Se renueva el token con este margen para no usarlo ya caducado en vuelo. */
  tokenExpirySkewSeconds: 60,
  /**
   * Vida de la caché de lecturas en lote.
   *
   * El sondeo del frontend agrupa muy bien DENTRO de un navegador, pero son
   * ~4 peticiones/min por CADA pantalla encendida, todas pidiendo los mismos
   * tags. Con esta ventana, diez wallboards son una sola llamada a ICONICS en
   * vez de diez. Es muy inferior a la cadencia de sondeo (15 s), así que no
   * añade retraso perceptible al dato.
   */
  batchCacheTtlMs: 2000,
  /** Ventana y tope del limitador por IP. */
  rateLimitWindowMs: 60000,
  rateLimitMax: 300,
}

/** Cliente OIDC que ICONICS 11.x trae dado de alta de fábrica. */
const OIDC_CLIENT_ID = 'in_house_client'
const OIDC_SCOPE = 'openid fwxserver offline_access'

function readPort(rawValue) {
  if (!rawValue) return DEFAULTS.port

  // El 0 se admite: es como se pide "cualquier puerto libre", que es lo que
  // quieren las pruebas para no chocar entre ejecuciones.
  const port = Number(rawValue)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT debe ser un entero entre 0 y 65535 (recibido: "${rawValue}")`)
  }
  return port
}

function readOrigin(apiBase) {
  if (!apiBase) return ''

  try {
    return new URL(apiBase).origin
  } catch {
    throw new Error(`ICONICS_API_BASE no es una URL absoluta válida (recibido: "${apiBase}")`)
  }
}

/**
 * Entero de entorno, con mínimo. Mismo criterio que `readPort`: una variable
 * mal escrita impide el arranque diciendo cuál es, en vez de convertirse en
 * `NaN` y producir un timeout que vence siempre o una caché que nunca acierta.
 */
function readInteger(name, rawValue, fallback, minimum = 0) {
  if (rawValue === undefined || rawValue === '') return fallback

  const value = Number(rawValue)
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} debe ser un entero >= ${minimum} (recibido: "${rawValue}")`)
  }
  return value
}

/**
 * Booleano de entorno. Sólo `'true'` y `'false'` son válidos: aceptar `1`,
 * `yes` o `on` invita a escribir `ICONICS_READ_ONLY=1` y a que un typo como
 * `ICONICS_READ_ONLY=flase` se lea silenciosamente como el valor por defecto.
 */
function readBoolean(name, rawValue, fallback) {
  if (rawValue === undefined || rawValue === '') return fallback
  if (rawValue === 'true') return true
  if (rawValue === 'false') return false
  throw new Error(`${name} debe ser "true" o "false" (recibido: "${rawValue}")`)
}

/**
 * Orígenes autorizados a llamar a la API desde otro origen.
 *
 * Vacío por defecto, y ese defecto importa: antes se respondía
 * `Access-Control-Allow-Origin: *` en TODA respuesta, no sólo en el preflight.
 * En producción el backend sirve el bundle desde su mismo origen y no
 * necesita CORS en absoluto; el comodín sólo servía para que cualquier página
 * abierta en un navegador de la planta pudiera llamar a la API por la espalda
 * del usuario. El dev server de Vite —que sí es otro origen— se declara aquí.
 */
function readCorsOrigins(rawValue) {
  return Object.freeze(
    (rawValue ?? '')
      .split(',')
      .map(origin => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  )
}

/**
 * `NODE_TLS_REJECT_UNAUTHORIZED=0` desactiva la verificación de certificados
 * del proceso ENTERO, no sólo de las llamadas a ICONICS. Es la mitigación
 * documentada como R-13 y el descuido más fácil de cometer: basta con que el
 * `.env` de desarrollo viaje al servidor.
 *
 * En producción impide el arranque; fuera de ella sólo se avisa, porque los
 * certificados autofirmados de ICONICS lo hacen necesario mientras no esté
 * instalada la CA.
 */
function checkTlsVerification(env, isProduction) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED !== '0') return false

  if (isProduction) {
    throw new Error(
      'NODE_TLS_REJECT_UNAUTHORIZED=0 desactiva la verificación de certificados de todo el ' +
        'proceso y no puede usarse en producción. Instala la CA del servidor ICONICS y apunta ' +
        'NODE_EXTRA_CA_CERTS a ella.'
    )
  }
  return true
}

function readStaticDir(rawValue) {
  const relativeOrAbsolute = rawValue || DEFAULT_STATIC_DIR
  return normalize(
    isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : join(PROJECT_ROOT, relativeOrAbsolute)
  )
}

/**
 * Rutas del servidor ICONICS derivadas del origen.
 *
 * `apiBase` apunta a `/fwxapi/rest/v1`, pero seguridad, echo y systeminfo
 * cuelgan de otras ramas del mismo host: por eso se derivan del origen y no
 * de la base, en un solo sitio en vez de recomponerlas en cada llamada.
 */
function buildEndpoints(origin, apiBase) {
  if (!origin) return {}

  return {
    authorize: `${origin}/fwxserverweb/security/connect/authorize`,
    token: `${origin}/fwxserverweb/security/connect/token`,
    login: `${origin}/fwxserverweb/security/account/login`,
    redirectUri: `${origin}/fwxapi/swagger/oauth2-redirect.html`,
    echo: `${origin}/fwxapi/echo/v1`,
    userInfo: `${origin}/fwxapi/systeminfo/v1/UserInfo`,
    data: `${apiBase}/Data`,
    dataBrowse: `${apiBase}/Data/Browse`,
    dataSearch: `${apiBase}/Data/Search`,
    dataWrite: `${apiBase}/Data/Write`,
    history: `${apiBase}/History`,
    alarmHistory: `${apiBase}/AlarmHistory`,
    alarmState: `${apiBase}/Alarm/SetAlarmState`,
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {Readonly<object>} configuración inmutable
 */
export function loadConfig(env = process.env) {
  const apiBase = (env.ICONICS_API_BASE ?? '').replace(/\/+$/, '')
  const origin = readOrigin(apiBase)
  const isProduction = env.NODE_ENV === 'production'

  return Object.freeze({
    port: readPort(env.PORT),
    staticDir: readStaticDir(env.STATIC_DIR),
    logLevel: (env.LOG_LEVEL ?? DEFAULTS.logLevel).toUpperCase(),
    isProduction,
    /**
     * Qué build corre. Lo inyecta el empaquetado desde `git describe`; sin él
     * vale `dev`. Es lo primero que hace falta cuando alguien reporta que un
     * número está mal: saber si esa pantalla ya tiene el arreglo.
     */
    version: env.APP_VERSION || 'dev',
    tlsVerificationDisabled: checkTlsVerification(env, isProduction),
    corsOrigins: readCorsOrigins(env.CORS_ORIGINS),
    /**
     * Detrás de un proxy inverso, `socket.remoteAddress` es el proxy para
     * TODOS los clientes: sin esto el limitador contaría a la planta entera
     * como una sola IP. Se activa a propósito y sólo cuando hay un proxy
     * delante, porque `X-Forwarded-For` lo falsifica cualquiera si el puente
     * está expuesto directamente.
     */
    trustProxy: readBoolean('TRUST_PROXY', env.TRUST_PROXY, false),

    iconics: Object.freeze({
      apiBase,
      origin,
      username: env.ICONICS_USERNAME ?? '',
      password: env.ICONICS_PASSWORD ?? '',
      defaultPointName: env.ICONICS_POINT_NAME ?? '',
      /**
       * Escritura y reconocimiento de alarmas deshabilitados.
       *
       * Por defecto **sí**, y el defecto es la decisión importante: el puente
       * mantiene una sesión privilegiada contra ICONICS, así que una
       * instalación que nadie configuró no debe poder escribir en la planta.
       * Es la misma lección que el frontend aprendió con `VITE_ICONICS_FAKE`:
       * el defecto tiene que ser el seguro, y lo peligroso se pide a propósito.
       */
      readOnly: readBoolean('ICONICS_READ_ONLY', env.ICONICS_READ_ONLY, true),
      isConfigured: Boolean(apiBase),
      canAuthenticate: Boolean(origin && env.ICONICS_USERNAME && env.ICONICS_PASSWORD),
      clientId: OIDC_CLIENT_ID,
      scope: OIDC_SCOPE,
      endpoints: Object.freeze(buildEndpoints(origin, apiBase)),
    }),

    /** Contexto de cabecera que sirve `/api/context` mientras no haya sesión real. */
    context: Object.freeze({
      usuario: env.DEFAULT_USUARIO ?? 'Operador',
      linea: env.DEFAULT_LINEA ?? 'Linea 1',
      equipo: env.DEFAULT_EQUIPO ?? 'Equipo principal',
      turno: env.DEFAULT_TURNO ?? 'Matutino',
      rendimiento: env.DEFAULT_RENDIMIENTO ?? '84%',
    }),

    limits: Object.freeze({
      maxRequestBodyBytes: DEFAULTS.maxRequestBodyBytes,
      maxUpstreamItems: DEFAULTS.maxUpstreamItems,
      maxAlarmHours: DEFAULTS.maxAlarmHours,
      healthTimeoutMs: DEFAULTS.healthTimeoutMs,
      tokenExpirySkewSeconds: DEFAULTS.tokenExpirySkewSeconds,

      /*
       * Los cuatro siguientes se pueden ajustar por entorno. Son los que
       * dependen de cómo se comporte ESTA planta —latencia del servidor,
       * cuántas pantallas hay encendidas— y no tiene sentido que obliguen a
       * recompilar. El resto son invariantes del protocolo o de la memoria
       * del proceso, y se quedan como constantes.
       */
      upstreamTimeoutMs: readInteger(
        'UPSTREAM_TIMEOUT_MS', env.UPSTREAM_TIMEOUT_MS, DEFAULTS.upstreamTimeoutMs, 1
      ),
      /** 0 desactiva la caché de lote. */
      batchCacheTtlMs: readInteger(
        'BATCH_CACHE_TTL_MS', env.BATCH_CACHE_TTL_MS, DEFAULTS.batchCacheTtlMs
      ),
      rateLimitWindowMs: readInteger(
        'RATE_LIMIT_WINDOW_MS', env.RATE_LIMIT_WINDOW_MS, DEFAULTS.rateLimitWindowMs, 1
      ),
      rateLimitMax: readInteger('RATE_LIMIT_MAX', env.RATE_LIMIT_MAX, DEFAULTS.rateLimitMax, 1),
    }),
  })
}
