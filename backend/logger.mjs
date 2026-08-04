/**
 * Logger estructurado del backend puente.
 *
 * Dos formatos según el destino, porque son dos lectores distintos: en TTY
 * (terminal de desarrollo) escribe texto coloreado para leerlo de un vistazo;
 * fuera de TTY (servicio, contenedor) escribe una línea JSON por evento, que
 * es lo que un recolector de logs sabe indexar.
 */

/** Orden de severidad. Un nivel se emite si es >= al umbral configurado. */
const LEVELS = { INFO: 0, WARN: 1, ERROR: 2 }

const DEFAULT_LEVEL = 'INFO'

const TTY_COLORS = {
  INFO: '\x1b[36m',   // cian
  WARN: '\x1b[33m',   // ámbar
  ERROR: '\x1b[31m',  // rojo
  RESET: '\x1b[0m',
  DIM: '\x1b[2m',
}

function formatMeta(meta) {
  const entries = Object.entries(meta)
  if (entries.length === 0) return ''
  return ' ' + entries.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(' ')
}

function formatForTty(timestamp, level, message, meta) {
  const color = TTY_COLORS[level] ?? TTY_COLORS.RESET
  const { DIM: dim, RESET: reset } = TTY_COLORS
  return `${dim}${timestamp}${reset} ${color}${level.padEnd(5)}${reset} ${message}${formatMeta(meta)}`
}

function formatForCollector(timestamp, level, message, meta) {
  return JSON.stringify({ timestamp, level, message, ...meta })
}

/**
 * Un `Error` en `meta.err` se serializa a `{}` con `JSON.stringify`: hay que
 * extraer mensaje y traza a mano o el log de un fallo no dice qué falló.
 */
function normalizeMeta(meta = {}) {
  if (!(meta.err instanceof Error)) return meta
  return { ...meta, err: meta.err.message, stack: meta.err.stack }
}

function toThreshold(level) {
  return LEVELS[String(level ?? '').toUpperCase()] ?? LEVELS[DEFAULT_LEVEL]
}

/**
 * @param {object} [options]
 * @param {string} [options.level] Umbral mínimo: INFO | WARN | ERROR.
 */
export function createLogger({ level = DEFAULT_LEVEL } = {}) {
  let threshold = toThreshold(level)

  function emit(levelName, message, meta) {
    if (LEVELS[levelName] < threshold) return

    const timestamp = new Date().toISOString()
    const normalized = normalizeMeta(meta)
    const line = process.stdout.isTTY
      ? formatForTty(timestamp, levelName, message, normalized)
      : formatForCollector(timestamp, levelName, message, normalized)

    // Los errores van a stderr para poder separarlos del flujo normal al
    // redirigir la salida del servicio.
    const stream = levelName === 'ERROR' ? process.stderr : process.stdout
    stream.write(line + '\n')
  }

  return {
    info: (message, meta) => emit('INFO', message, meta),
    warn: (message, meta) => emit('WARN', message, meta),
    error: (message, meta) => emit('ERROR', message, meta),
    /** Lo llama la raíz de composición cuando ya conoce `config.logLevel`. */
    setLevel: next => { threshold = toThreshold(next) },
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

