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
import { leerTurnos } from '../shared/periodo.js'

const BACKEND_DIR = fileURLToPath(new URL('.', import.meta.url))
const PROJECT_ROOT = normalize(join(BACKEND_DIR, '..'))

/** Salida de `vite build`, que vive dentro del propio frontend. */
const DEFAULT_STATIC_DIR = join('react-dashboard', 'dist')

const DEFAULTS = {
  port: 3001,
  logLevel: 'INFO',
  /** Inactividad, en minutos, tras la cual una sesión de persona muere. */
  sesionTtlMinutos: 60,
  /** Sesiones de persona vivas a la vez. Ver `config.sesion.maximo`. */
  sesionMax: 32,
  /** Cuerpo máximo aceptado en POST/PUT. Evita que un cliente agote la RAM. */
  maxRequestBodyBytes: 1024 * 1024,
  /** `X-ICO-MAX-ITEM-COUNT` para historia y alarmas. */
  maxUpstreamItems: 100,
  /**
   * Presupuesto de `readHistory` al seguir `X-ICO-CONTINUATION` (Plan 15
   * Fase 1). Cada página son hasta `maxUpstreamItems` muestras — con el
   * defecto de 100, `maxHistoryPaginas: 20` son hasta 2.000 muestras por
   * consulta, sin necesidad de trocear el rango en varias peticiones HTTP
   * distintas desde el frontend/asistente para conseguir esa profundidad.
   */
  maxHistoryPaginas: 20,
  /**
   * Corte de TIEMPO TOTAL para una cadena de páginas, distinto de
   * `upstreamTimeoutMs`: ese corta cada `fetch` individual; este corta la
   * cadena entera. Veinte páginas de 100-200 ms cada una son 2-4 s en el
   * caso normal, pero un servidor lento con 20 páginas podría sumar minutos
   * sin este tope.
   */
  maxHistoryMs: 20000,
  /**
   * Cuántos tramos de `leerSerieEnRango()` (`ia/conversacion/herramientas.mjs`) se piden a
   * la vez (Plan 15 Fase 3). Antes de esto un rango de 30 días eran 30
   * peticiones simultáneas contra el historiador, y con la Fase 1 cada una
   * puede ser hasta `maxHistoryPaginas` peticiones HTTP por debajo — sin este
   * tope, levantar la ventana de lectura (Fase 4) multiplicaría la carga
   * contra el servidor de producción en vez de sólo la profundidad leída. 6
   * es el valor sugerido por el propio plan: acota la carga sin alargar de
   * forma perceptible una consulta de un mes (30 tramos ÷ 6 = 5 tandas).
   */
  historyConcurrencia: 6,
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
  /**
   * Corte de la llamada al modelo de lenguaje.
   *
   * Deliberadamente NO reutiliza `upstreamTimeoutMs`: son dos escalas
   * distintas. 15 s es holgado para ICONICS y ridículo para un modelo de 9B
   * que corre parcialmente en CPU, donde una respuesta con herramientas son
   * dos pasadas y puede irse a 90 s. Compartir la variable cortaría todas las
   * respuestas del asistente por sistema.
   */
  iaTimeoutMs: 180000,
  /** Tope de tokens de la respuesta. Con este presupuesto, cada token se paga. */
  iaMaxTokens: 512,
  /**
   * Herramientas encadenadas por pregunta. Tres cubre el diagnóstico completo
   * —estado, historia de la señal sospechosa y manual— sin dejar que un modelo
   * indeciso se quede consultando en bucle mientras el operador espera.
   */
  iaMaxPasos: 3,
  /**
   * Corte de una transcripción de voz.
   *
   * Escala propia, como `iaTimeoutMs`: en CPU, `whisper small` tarda algo menos
   * que la duración del audio, así que 60 s cubren holgadamente el minuto de
   * voz que admite `maxAudioBytes`. En GPU sobra de largo.
   */
  whisperTimeoutMs: 60000,
  /**
   * Audio máximo aceptado, en bytes: unos 3 minutos de WAV de 16 kHz mono.
   *
   * NO reutiliza `maxRequestBodyBytes` (1 MB): ese tope está pensado para JSON
   * y rechazaría media frase dictada. Va aparte para que subir el techo del
   * audio no suba de paso el de todos los POST de la API.
   */
  maxAudioBytes: 6 * 1024 * 1024,
  /**
   * Carpeta de salida de los PDF de `generar_reporte` (Plan 14 Fase 5).
   *
   * Dentro de `Documentos/`, no de `datos/` (Plan 16): `datos/` es para lo que
   * el backend necesita para sí mismo entre reinicios —caché, aprendizaje— y
   * un reporte es lo contrario, algo que alguien pidió para llevárselo. Las
   * dos carpetas conviven bajo `Documentos/` con la exportación de chat, que
   * es el mismo tipo de PDF por otro camino: ver `DEFAULTS.backlogChatDir`.
   */
  reportesDir: join('Documentos', 'Reportes'),
  /** Antigüedad, en días, a partir de la cual un reporte se purga solo. */
  reportesMaxDias: 30,
  /**
   * Carpeta de salida de los PDF que exporta el botón «Exportar PDF» del
   * chat (`POST /api/chat/exportar`).
   *
   * Hasta el Plan 16 compartía carpeta con `generar_reporte` —los dos
   * escribían en `reportesDir`, distinguidos sólo por el UUID del nombre—, lo
   * que mezclaba dos cosas de origen distinto bajo un mismo rótulo: uno es
   * TRABAJO del asistente sobre una pregunta de datos, el otro es un REGISTRO
   * de lo que se habló. `GET /api/reportes` sigue siendo la única ruta de
   * descarga para los dos —ver `reportesRoutes.mjs`—, y sigue siendo seguro
   * porque el UUID del nombre no puede repetirse entre las dos carpetas.
   */
  backlogChatDir: join('Documentos', 'BacklogChat'),
}

/*
 * `IA_MAQUINAS_CON_HISTORIA` se retiró al pasar el asistente al sistema de
 * agua.
 *
 * Declaraba qué máquinas de Resonac tenían tags «Is Collected», y era
 * configurable con razón: eso cambia marcando una casilla en el Data
 * Historian, sin tocar código. En la instalación de agua no es lo mismo — a
 * tres de las ocho señales el historiador les devuelve **la serie de otra**,
 * y eso no se arregla marcando una casilla ni se puede permitir que lo
 * desactive una variable de entorno mal escrita. Vive como hecho medido en
 * `shared/eva/tanque/senales.js` (campo `historizado`). Ver `backend/ia/conversacion/herramientas.mjs`.
 */

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
 * `FRAME_ANCESTORS` NO puede reusar `readCorsOrigins`: ahí un `*` literal es
 * inofensivo porque se compara por igualdad exacta contra un `Origin` real,
 * que un navegador nunca manda como el string "*". Aquí la lista se inyecta
 * TAL CUAL en la CSP como `frame-ancestors <lista>`, donde `*` es sintaxis de
 * comodín de verdad — dejarlo pasar abriría exactamente el agujero que
 * CLAUDE.md §2.9 prohíbe para CORS, sólo que en la puerta de enfrente. Se
 * falla ruidoso en vez de filtrarlo en silencio: la misma regla que
 * `ICONICS_API_BASE` inválido.
 */
function readFrameAncestors(rawValue) {
  const origenes = readCorsOrigins(rawValue)
  const comodin = origenes.find(o => o.includes('*'))
  if (comodin) {
    throw new Error(
      `FRAME_ANCESTORS no admite comodines (recibido: "${comodin}"). ` +
      'Lista los orígenes exactos, separados por comas — igual que CORS_ORIGINS.'
    )
  }
  return origenes
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

/**
 * Base de llama-server, sin barra final. Vacío significa «sin asistente», no
 * es un error: es el estado por defecto de una instalación normal.
 */
function readIaBase(rawValue) {
  if (!rawValue) return ''

  try {
    return new URL(rawValue).origin
  } catch {
    throw new Error(`IA_BASE no es una URL absoluta válida (recibido: "${rawValue}")`)
  }
}

/**
 * El catálogo de modelos elegibles y cuál se usa por defecto.
 *
 * Devuelve siempre las dos cosas juntas porque no son independientes: el
 * defecto es el primero de la lista, y calcularlos por separado invita a que
 * se contradigan.
 *
 * `lista` vacía es el estado normal de una instalación con un solo modelo, y
 * significa «no ofrezcas elección». No es lo mismo que una lista de un
 * elemento: con un elemento hay un selector con una sola opción, que es peor
 * que ninguno.
 *
 * Los nombres se dejan TAL CUAL —sin normalizar mayúsculas ni acentos— porque
 * son identificadores de otro sistema: `qwen-3.5-4B` y `qwen-3.5-4b` son
 * distintos para el router de llama-server, y "arreglar" el que escribió el
 * operador lo llevaría a un modelo que no pidió. Los duplicados sí se quitan:
 * son un descuido al editar el `.env`, no una intención.
 */
function readModelos(env) {
  const lista = Object.freeze([
    ...new Set(
      (env.IA_MODELOS ?? '')
        .split(',')
        .map(nombre => nombre.trim())
        .filter(Boolean)
    ),
  ])

  return {
    lista,
    porDefecto: lista[0] || env.IA_MODELO || 'local',
  }
}

/**
 * Carpeta de documentación. Vacío significa «sin documentación», no es un
 * error: es el estado por defecto de una instalación normal, igual que
 * `IA_BASE`.
 */
function readDocsDir(rawValue) {
  if (!rawValue) return ''
  return normalize(isAbsolute(rawValue) ? rawValue : join(PROJECT_ROOT, rawValue))
}

/**
 * Carpeta de salida de los reportes PDF. A diferencia de `readDocsDir`, vacío
 * NO significa «desactivado» — `generar_reporte` no depende de un sistema
 * externo ni de credenciales, sólo de disco, así que siempre tiene un sitio
 * donde escribir. La carpeta se crea sola en la primera escritura.
 */
function readReportesDir(rawValue) {
  const relativeOrAbsolute = rawValue || DEFAULTS.reportesDir
  return normalize(
    isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : join(PROJECT_ROOT, relativeOrAbsolute)
  )
}

/**
 * Carpeta de salida de los PDF de exportación de chat. Mismo criterio que
 * `readReportesDir` —vacío no es «desactivado», sólo cae al valor por
 * defecto— y a propósito NO reutiliza esa función: son dos configuraciones
 * que hoy comparten forma pero describen carpetas distintas, y una futura
 * diferencia entre ellas (otro `maxDias`, por ejemplo) no debe obligar a
 * separarlas retroactivamente.
 */
function readBacklogChatDir(rawValue) {
  const relativeOrAbsolute = rawValue || DEFAULTS.backlogChatDir
  return normalize(
    isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : join(PROJECT_ROOT, relativeOrAbsolute)
  )
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
  const iconicsFake = readBoolean('ICONICS_FAKE', env.ICONICS_FAKE, false)
  const modelos = readModelos(env)

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
     * Orígenes autorizados a EMPOTRAR esta aplicación en un `<iframe>` propio
     * (`frame-ancestors` de la CSP). Vacío por defecto —nadie puede
     * enmarcarnos—, con el mismo formato y la misma lectura que
     * `CORS_ORIGINS`: es la misma clase de decisión, "quién puede montarse
     * encima de esta app", sólo que una es para peticiones y la otra para
     * ventanas. Existe porque un panel HMI de ICONICS (AnyGlass/GraphWorX)
     * puede querer mostrar el asistente como una pantalla más de su propio
     * proyecto, empotrada en un iframe — ver docs/PLAN-20-ASISTENTE.md.
     */
    frameAncestors: readFrameAncestors(env.FRAME_ANCESTORS),
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
      /**
       * Transporte simulado (Plan 14 §7.1): sirve las ocho señales de
       * `shared/eva/tanque/simulador.js` sin salir a la red, con la MISMA firma que
       * `iconics/client.mjs`. Pensado para trabajar en el asistente, el
       * historiador y el resto del backend sin depender de que el servidor
       * de planta esté alcanzable — que es justo lo que bloqueaba antes las
       * fases 2, 4 y 5 mientras llegaba la máquina de IA. Ver
       * `iconics/fakeClient.mjs`.
       *
       * No es un secreto que haya que ocultar en producción: al revés, con
       * `ICONICS_FAKE=true` el arranque debería anunciarlo bien alto, porque
       * es el modo en el que NINGÚN dato es real. `app.mjs` decide con esto
       * qué cliente construir.
       */
      fake: iconicsFake,
      // Con el transporte falso no hace falta ICONICS_API_BASE: no hay a
      // dónde conectarse. Misma regla que ICONICS_READ_ONLY: el peligro (usar
      // datos inventados) se pide a propósito con la otra variable, no con
      // esta.
      isConfigured: Boolean(apiBase) || iconicsFake,
      canAuthenticate: Boolean(origin && env.ICONICS_USERNAME && env.ICONICS_PASSWORD),
      clientId: OIDC_CLIENT_ID,
      scope: OIDC_SCOPE,
      endpoints: Object.freeze(buildEndpoints(origin, apiBase)),
      /**
       * SSO silencioso (Plan 20, HMI embebido): la `redirect_uri` que recibe
       * el `code` cuando el navegador YA tiene sesión de ICONICS (porque
       * entró por su HMI nativo — AnyGlass/GraphWorX) y esta app vive
       * empotrada ahí en un `<iframe>`. VACÍO por defecto y la función entera
       * queda apagada sin él: la URL tiene que coincidir EXACTA con una de
       * las registradas a mano en ICONICS (Workbench → Security → Global
       * Settings → Web Login → "In-house application Relying Party Redirect
       * URIs"), y una que no coincida no falla aquí — falla en ICONICS, con
       * un error que no dice qué backend lo pidió. Mejor no ofrecer el
       * intento que ofrecerlo roto.
       */
      ssoRedirectUri: env.SSO_REDIRECT_URI || null,
    }),

    /**
     * Asistente de lenguaje natural (Plan 6).
     *
     * `IA_BASE` vacío —el defecto— apaga el chat entero: `/api/chat` responde
     * 503 diciendo que no está configurado y el tablero funciona igual. Es la
     * misma regla de la casa que `ICONICS_READ_ONLY` y `CORS_ORIGINS`: una
     * instalación que nadie configuró no expone un asistente a medias.
     */
    ia: Object.freeze({
      base: readIaBase(env.IA_BASE),
      isConfigured: Boolean(env.IA_BASE),
      timeoutMs: readInteger('IA_TIMEOUT_MS', env.IA_TIMEOUT_MS, DEFAULTS.iaTimeoutMs, 1),
      maxTokens: readInteger('IA_MAX_TOKENS', env.IA_MAX_TOKENS, DEFAULTS.iaMaxTokens, 1),
      /**
       * Modelo por defecto, y el catálogo de los que se pueden elegir.
       *
       * ── ESTO ERA UN SOLO NOMBRE, Y ERA INFORMATIVO ─────────────────
       *
       * Aquí ponía «llama-server sirve un solo modelo; el nombre es
       * informativo», y era verdad: arrancado con `-m ruta.gguf`, el campo
       * `model` del cuerpo lo ignora, así que daba igual lo que dijera esta
       * variable. Dejó de serlo al arrancar el servidor con `--models-preset`,
       * que expone varios modelos bajo un router y **sí** honra el `model` de
       * cada petición. El nombre pasó de etiqueta a interruptor.
       *
       * `IA_MODELOS` es la lista de los elegibles, separados por comas, y el
       * PRIMERO es el que se usa cuando nadie pide otro. Tienen que ser los
       * identificadores exactos que publica `GET /v1/models` del servidor —
       * que son los nombres de sección del `.ini` de presets, p. ej.
       * `qwen-3.5-4B`. Un nombre que no exista allí no da error: el router
       * cae en su modelo por defecto, y entonces el selector diría una cosa
       * mientras responde otra. Por eso `/api/chat/modelos` los contrasta
       * contra el servidor en vez de creerse esta lista a ciegas.
       *
       * Vacío deja el comportamiento de siempre: se manda `IA_MODELO` (o
       * 'local') y no se ofrece ninguna elección, que es lo correcto para una
       * instalación con un `-m` de toda la vida.
       */
      modelo: modelos.porDefecto,
      modelos: modelos.lista,

      /**
       * Carpeta de documentación de planta: manuales, hojas de datos,
       * procedimientos. Vacío —el defecto— apaga la herramienta
       * `consultar_documentacion`, que entonces dice que no hay documentación
       * configurada en vez de inventarse una respuesta.
       *
       * Se admite relativa a la raíz del proyecto para que `.env.local` no
       * tenga que llevar una ruta absoluta de esta máquina concreta.
       */
      docsDir: readDocsDir(env.IA_DOCS_DIR),

      /**
       * Segundo servidor, sólo para embeddings.
       *
       * **Vacío por defecto, y ese defecto es la decisión.** llama-server sirve
       * un modelo a la vez: el que atiende el chat no puede además generar
       * embeddings, y pedírselos devuelve los de un modelo generativo, que para
       * buscar son malos. Sin esto, la documentación se busca con BM25 —léxico,
       * sin servidor, sin dependencias—, que en manuales técnicos acierta
       * porque quien pregunta usa el vocabulario del manual. Con esto apuntando
       * a un llama-server arrancado con `--embedding` sobre un modelo de
       * embeddings, se mezclan los dos.
       */
      embeddingBase: readIaBase(env.IA_EMBEDDING_BASE),
      embeddingModelo: env.IA_EMBEDDING_MODELO || 'local',

      /**
       * ¿Se puede subir un manual nuevo desde el tablero (Plan 16 Fase 1)?
       *
       * **Apagado por defecto, y el defecto importa.** `ICONICS_READ_ONLY` NO
       * cubre esto: protege escrituras contra el PLC, no escrituras en el
       * disco de este backend, que es de lo que se trata aquí. Sin su propia
       * bandera, subir manuales quedaría habilitado por accidente en
       * cualquier instalación que ya tenga `ICONICS_READ_ONLY=false` para
       * otra cosa —controlar la bomba, por ejemplo— aunque nadie haya
       * decidido que este servidor deba aceptar archivos de nadie.
       *
       * Con `IA_DOCS_DIR` vacío da igual lo que valga esto: sin carpeta de
       * documentación no hay dónde subir nada, y la ruta lo dice así en vez
       * de escribir en un directorio que no existe.
       */
      ragUploadEnabled: readBoolean('RAG_UPLOAD_ENABLED', env.RAG_UPLOAD_ENABLED, false),

      /**
       * Cuántas herramientas puede encadenar el modelo para una sola pregunta.
       *
       * Antes era una fija y no era configurable, porque el bucle sólo daba dos
       * pasadas. Ese tope hacía imposible la pregunta que más importa —«¿por
       * qué falló esto?»—, que necesita el estado, la historia de la señal
       * sospechosa y el manual: tres lecturas, no una.
       *
       * Es configurable porque el precio lo pone el hardware, no el código: en
       * una GPU holgada cada paso son segundos y cuatro salen gratis; en una de
       * 8 GB con el modelo a medias en CPU, cuatro pasos son dos minutos de
       * espera y quizá se prefiera bajarlo a dos.
       */
      maxPasos: readInteger('IA_MAX_PASOS', env.IA_MAX_PASOS, DEFAULTS.iaMaxPasos, 1),
      /**
       * Horario de turnos, `manana=6-14,tarde=14-22,noche=22-6`.
       *
       * **Vacío por defecto, y ese defecto es la decisión.** Sin el horario
       * real de esta planta, un turno inventado devolvería datos verdaderos
       * de las horas equivocadas, que es indistinguible de la respuesta
       * correcta — el peor modo de fallo posible aquí. Con esto vacío,
       * preguntar por un turno responde que no está configurado.
       */
      turnos: Object.freeze(leerTurnos(env.IA_TURNOS)),

      /**
       * Dictado y notas de voz, contra `whisper-server`.
       *
       * `IA_WHISPER_BASE` vacío —el defecto— apaga el micrófono: la ruta
       * responde 503 diciendo qué falta y el panel no pinta el botón. Misma
       * regla de la casa que `IA_BASE` y `IA_DOCS_DIR`: una instalación que
       * nadie configuró no expone una función a medias.
       */
      whisper: Object.freeze({
        base: readIaBase(env.IA_WHISPER_BASE),
        isConfigured: Boolean(env.IA_WHISPER_BASE),
        /**
         * Idioma del dictado. Fijo en español y NO 'auto' a propósito: con
         * detección automática, una frase corta y con ruido de planta se
         * confunde a menudo con portugués o italiano, y entonces la
         * transcripción sale traducida a un idioma que nadie pidió. Quien
         * necesite otro idioma lo declara.
         */
        idioma: env.IA_WHISPER_IDIOMA || 'es',
        timeoutMs: readInteger(
          'IA_WHISPER_TIMEOUT_MS', env.IA_WHISPER_TIMEOUT_MS, DEFAULTS.whisperTimeoutMs, 1
        ),
      }),
    }),

    /**
     * Reportes PDF (Plan 14 Fase 5). `dir` es donde se guardan y desde donde
     * los sirve `GET /api/reportes`; `maxDias` es el umbral de la purga
     * perezosa que `generar_reporte` dispara en cada escritura, mismo
     * criterio que `pruneBatchCache` en `iconics/client.mjs`.
     */
    reportes: Object.freeze({
      dir: readReportesDir(env.IA_REPORTES_DIR),
      maxDias: readInteger('IA_REPORTES_MAX_DIAS', env.IA_REPORTES_MAX_DIAS, DEFAULTS.reportesMaxDias, 1),
    }),

    /**
     * PDF de exportación de chat (Plan 16), separado de `reportes` desde que
     * dejaron de compartir carpeta. Sin `maxDias`: a diferencia de un reporte
     * de datos, una conversación exportada es una decisión explícita de
     * alguien de guardarla, y purgarla sola por antigüedad se llevaría por
     * delante justo lo que se pidió conservar.
     */
    backlogChat: Object.freeze({
      dir: readBacklogChatDir(env.IA_BACKLOG_CHAT_DIR),
    }),

    /** Metadatos configurables de la ruta autenticada `/api/context`; no son mediciones. */
    context: Object.freeze({
      usuario: env.DEFAULT_USUARIO ?? 'Operador',
      linea: env.DEFAULT_LINEA ?? 'Linea 1',
      equipo: env.DEFAULT_EQUIPO ?? 'Equipo principal',
      turno: env.DEFAULT_TURNO ?? 'Matutino',
      rendimiento: env.DEFAULT_RENDIMIENTO ?? '84%',
    }),

    limits: Object.freeze({
      maxRequestBodyBytes: DEFAULTS.maxRequestBodyBytes,
      maxAudioBytes: DEFAULTS.maxAudioBytes,
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
      maxHistoryPaginas: readInteger(
        'HISTORY_MAX_PAGINAS', env.HISTORY_MAX_PAGINAS, DEFAULTS.maxHistoryPaginas, 1
      ),
      maxHistoryMs: readInteger(
        'HISTORY_MAX_MS', env.HISTORY_MAX_MS, DEFAULTS.maxHistoryMs, 1
      ),
      historyConcurrencia: readInteger(
        'HISTORY_CONCURRENCIA', env.HISTORY_CONCURRENCIA, DEFAULTS.historyConcurrencia, 1
      ),
    }),

    /**
     * Sesiones de persona (Plan 20 Fase 1).
     *
     * ── NO HAY `AUTH_HABILITADA`, Y ES DELIBERADO ──────────────────────
     *
     * Hasta el 03-09-2026 aquí vivía un interruptor que encendía una
     * autenticación que no existía. Ahora existe y **no se puede apagar**: el
     * técnico entra con su usuario de ICONICS, y sin esas credenciales no hay
     * token con el que leer la planta. Una petición sin sesión no es "una
     * petición sin autenticar", es una que no podría hacer nada. Ver
     * `http/plugins/autenticacion.mjs`.
     *
     * Los dos números de abajo acotan lo que una sesión cuesta: cada una
     * mantiene en memoria unas credenciales, unos tokens y una pila de objetos
     * hacia ICONICS.
     */
    sesion: Object.freeze({
      /**
       * Inactividad tras la cual una sesión muere, en minutos.
       *
       * Cuenta desde el ÚLTIMO USO, no desde el login: quien lleva dos horas
       * preguntando no debe caerse por un tope de una. Lo que este número
       * persigue es la sesión de quien cerró el navegador y se fue — y con
       * ella, su contraseña en memoria del proceso.
       */
      ttlMs: readInteger(
        'SESION_TTL_MINUTOS', env.SESION_TTL_MINUTOS, DEFAULTS.sesionTtlMinutos, 1
      ) * 60_000,
      /**
       * Sesiones vivas simultáneas.
       *
       * Sin tope, llamar a `POST /api/sesion` en bucle con credenciales
       * válidas agota la memoria del puente — y el puente sirve el asistente
       * entero. 32 es holgado para una planta y sigue siendo un número que
       * cabe en memoria sin pensarlo; se sube a propósito si hace falta, no
       * por accidente.
       */
      maximo: readInteger('SESION_MAX', env.SESION_MAX, DEFAULTS.sesionMax, 1),
    }),
  })
}
