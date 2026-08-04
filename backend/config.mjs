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
  /** Se renueva el token con este margen para no usarlo ya caducado en vuelo. */
  tokenExpirySkewSeconds: 60,
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

  return Object.freeze({
    port: readPort(env.PORT),
    staticDir: readStaticDir(env.STATIC_DIR),
    logLevel: (env.LOG_LEVEL ?? DEFAULTS.logLevel).toUpperCase(),

    iconics: Object.freeze({
      apiBase,
      origin,
      username: env.ICONICS_USERNAME ?? '',
      password: env.ICONICS_PASSWORD ?? '',
      defaultPointName: env.ICONICS_POINT_NAME ?? '',
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
    }),
  })
}
