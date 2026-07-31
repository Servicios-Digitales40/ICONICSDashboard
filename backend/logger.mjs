/**
 * Structured logger for ReactEmbebido backend.
 * Outputs JSON lines in non-TTY environments (production, Docker).
 * Outputs readable colored text in TTY (development terminal).
 */

const LEVELS = { INFO: 0, WARN: 1, ERROR: 2 }

const TTY_COLORS = {
  INFO: '\x1b[36m',   // cyan
  WARN: '\x1b[33m',   // yellow
  ERROR: '\x1b[31m',  // red
  RESET: '\x1b[0m',
  DIM: '\x1b[2m',
}

function formatMeta(meta) {
  if (!meta || Object.keys(meta).length === 0) return ''
  return ' ' + Object.entries(meta)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ')
}

function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString()

  if (process.stdout.isTTY) {
    const color = TTY_COLORS[level] ?? TTY_COLORS.RESET
    const dim = TTY_COLORS.DIM
    const reset = TTY_COLORS.RESET
    const metaStr = formatMeta(meta)
    const line = `${dim}${timestamp}${reset} ${color}${level.padEnd(5)}${reset} ${message}${metaStr}`
    if (level === 'ERROR') {
      console.error(line)
    } else {
      console.log(line)
    }
  } else {
    const entry = { timestamp, level, message, ...meta }
    const line = JSON.stringify(entry)
    if (level === 'ERROR') {
      process.stderr.write(line + '\n')
    } else {
      process.stdout.write(line + '\n')
    }
  }
}

export const logger = {
  info: (message, meta) => log('INFO', message, meta),
  warn: (message, meta) => log('WARN', message, meta),
  error: (message, meta) => {
    // If meta contains an Error object, serialize it properly
    if (meta?.err instanceof Error) {
      meta = { ...meta, err: meta.err.message, stack: meta.err.stack }
    }
    log('ERROR', message, meta)
  },
}

// LEVELS exported for potential filtering in future
export { LEVELS }
