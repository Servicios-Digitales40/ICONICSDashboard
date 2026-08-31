/**
 * Logger estructurado del backend puente, sobre pino.
 *
 * ── POR QUÉ PINO Y NO EL FORMATEADOR A MANO ────────────────────────
 *
 * El anterior hacía bien las dos cosas visibles —texto en TTY, JSON fuera— y
 * se sustituye por una que NO se puede hacer por convención: la redacción de
 * secretos. En este proceso viven `ICONICS_PASSWORD` y los tokens OIDC de
 * `iconics/authenticator.mjs`; con el formateador anterior, un
 * `logger.error('falló', { config })` los escribía en claro en el log de
 * planta, y lo único que lo impedía era acordarse de no hacerlo. `redact` lo
 * hace estructuralmente imposible.
 *
 * ── LA API NO CAMBIA ───────────────────────────────────────────────
 *
 * pino recibe `(meta, mensaje)` y aquí se sigue llamando `(mensaje, meta)`,
 * que es como lo invocan los once módulos que lo usan. Se conserva ese orden
 * a propósito: invertirlo obligaría a reescribir ~40 llamadas para no ganar
 * nada, y cada una sería una ocasión de equivocarse.
 *
 * ── CÓMO SE ESCRIBEN LOS MENSAJES ──────────────────────────────────
 *
 * Un mensaje de log se lee dos veces: cuando todo va bien, de reojo, y cuando
 * algo se rompió, buscando qué. La segunda es la que manda. Por eso:
 *
 *   - El mensaje dice QUÉ PASÓ, no qué función se ejecutó. «Chat respondido»
 *     no; «Consulta del asistente resuelta en 42 s con 2 herramientas» sí.
 *   - Un fallo lleva SIEMPRE el arreglo, o dónde mirarlo. Un `ECONNREFUSED`
 *     sin decir a qué host es una hora perdida.
 *   - Los datos van en `meta`, no interpolados en el texto: así el recolector
 *     puede filtrar por `puerto` o `pointName` sin parsear cadenas.
 */
import pino from 'pino'

/** Umbral por defecto si `LOG_LEVEL` viene vacío o con un valor desconocido. */
const DEFAULT_LEVEL = 'info'

/**
 * `silent` apaga el logger entero. Existe para las pruebas: varias provocan
 * fallos a propósito —un llama-server que no responde— y sus trazas taparían
 * el resultado de verdad.
 */
const NIVELES_VALIDOS = new Set(['debug', 'info', 'warn', 'error', 'silent'])

/**
 * Rutas que nunca deben aparecer en un log, por muy anidadas que vengan.
 *
 * La lista es de rutas de pino, no de nombres sueltos: `*.password` cubre
 * `config.iconics.password` y cualquier otro objeto con esa clave a un nivel
 * de profundidad, que es como llegan aquí (nadie loguea `password` suelto,
 * se loguea el objeto que lo contiene).
 *
 * `censor` deja rastro a propósito: ver `[redactado]` dice que el campo
 * existía y se ocultó; borrarlo haría creer que nunca estuvo.
 */
const CAMPOS_SECRETOS = [
  'password',
  '*.password',
  '*.*.password',
  'token',
  '*.token',
  '*.*.token',
  'access_token',
  '*.access_token',
  'refresh_token',
  '*.refresh_token',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'headers.cookie',
  '*.headers.authorization',
  '*.headers.cookie',
]

/**
 * `LOG_LEVEL` se escribía en mayúsculas (`INFO`) en `.env.local` y en la
 * documentación; pino los quiere en minúsculas. Se normaliza aquí para que
 * las instalaciones existentes sigan arrancando igual tras el cambio.
 */
function normalizarNivel(nivel) {
  const limpio = String(nivel ?? '').trim().toLowerCase()
  return NIVELES_VALIDOS.has(limpio) ? limpio : DEFAULT_LEVEL
}

/**
 * Un `Error` en `meta.err` se serializa a `{}` con `JSON.stringify`. pino trae
 * un serializador propio para eso, pero sólo se aplica si el campo se llama
 * `err`; aquí se normaliza antes para no depender de que quien loguea acierte
 * con el nombre, y para conservar el `code` de los errores de red de Node
 * (`ECONNREFUSED`, `ENOTFOUND`), que es justo el dato que se busca al
 * diagnosticar un fallo de conexión.
 */
function normalizarMeta(meta) {
  if (!meta || typeof meta !== 'object') return {}
  if (!(meta.err instanceof Error)) return meta

  const { err, ...resto } = meta
  return {
    ...resto,
    err: {
      mensaje: err.message,
      tipo: err.name,
      ...(err.code ? { code: err.code } : {}),
      ...(err.cause?.message ? { causa: err.cause.message } : {}),
      stack: err.stack,
    },
  }
}

/**
 * En TTY (desarrollo) el log se lee a ojo, así que se colorea y se pone la
 * hora corta. Fuera de TTY (servicio, contenedor) sale ndjson, que es lo que
 * un recolector sabe indexar.
 *
 * `pino-pretty` es una devDependency: en producción esta rama no se toma
 * nunca, y si faltara el paquete el logger seguiría funcionando en JSON.
 */
function construirTransporte() {
  if (!process.stdout.isTTY) return undefined

  return {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      /*
       * `reqId` se oculta en terminal —es ruido cuando se lee una línea tras
       * otra— pero SÍ viaja en el JSON de producción, que es donde sirve para
       * seguir una petición entera entre las de otros operadores.
       */
      ignore: 'pid,hostname,reqId',
      /*
       * NO se declara `messageFormat`: con él, pino-pretty imprime los
       * metadatos SIN SU CLAVE —se veían líneas sueltas como `: 8` y `: 200`,
       * ilegibles— porque deja de reconocerlos como el objeto que acompaña al
       * mensaje. El formato por defecto ya pinta `clave: valor`.
       */
      singleLine: false,
    },
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.level] Umbral mínimo: debug | info | warn | error.
 */
export function createLogger({ level = DEFAULT_LEVEL } = {}) {
  const instancia = pino({
    level: normalizarNivel(level),
    redact: { paths: CAMPOS_SECRETOS, censor: '[redactado]' },
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: construirTransporte(),
  })

  return {
    debug: (mensaje, meta) => instancia.debug(normalizarMeta(meta), mensaje),
    info: (mensaje, meta) => instancia.info(normalizarMeta(meta), mensaje),
    warn: (mensaje, meta) => instancia.warn(normalizarMeta(meta), mensaje),
    error: (mensaje, meta) => instancia.error(normalizarMeta(meta), mensaje),
    /** Lo llama la raíz de composición cuando ya conoce `config.logLevel`. */
    setLevel: siguiente => { instancia.level = normalizarNivel(siguiente) },
    /** La instancia cruda, para dársela a Fastify como su logger nativo. */
    pino: instancia,
  }
}

/**
 * Instancia compartida. El logger es la única dependencia que no se inyecta:
 * hacerlo obligaría a pasarlo por todas las factorías para no ganar nada, ya
 * que ningún módulo cambia de comportamiento según cómo se registre.
 *
 * Nace leyendo `LOG_LEVEL` para que los mensajes anteriores al arranque ya
 * respeten el umbral, y `createApp()` lo reajusta con el de la configuración.
 */
export const logger = createLogger({ level: process.env.LOG_LEVEL })
