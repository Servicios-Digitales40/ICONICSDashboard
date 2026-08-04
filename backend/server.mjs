/**
 * Punto de entrada del backend puente hacia ICONICS.
 *
 * Sólo hace tres cosas: leer la configuración, montar la app y escuchar. Toda
 * la lógica está en los módulos que compone.
 *
 *   node --env-file=.env.local backend/server.mjs
 */
import { createServer } from 'node:http'
import { createApp } from './app.mjs'
import { loadConfig } from './config.mjs'
import { logger } from './logger.mjs'

const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM']

function start() {
  let config
  try {
    config = loadConfig()
  } catch (error) {
    logger.error('Configuración inválida, el servidor no arranca', { err: error })
    process.exit(1)
  }

  const server = createServer(createApp(config))

  server.listen(config.port, '0.0.0.0', () => {
    logger.info('ICONICS bridge started', {
      port: config.port,
      iconicsBase: config.iconics.apiBase || null,
      defaultPoint: config.iconics.defaultPointName || null,
      staticDir: config.staticDir,
    })

    if (!config.iconics.isConfigured) {
      logger.warn('ICONICS_API_BASE sin configurar: la API responderá 500', {})
    } else if (!config.iconics.canAuthenticate) {
      logger.warn('Sin credenciales ICONICS: las peticiones saldrán sin token', {})
    }
  })

  server.on('error', error => {
    logger.error('No se pudo abrir el puerto', { port: config.port, err: error })
    process.exit(1)
  })

  // Cierre ordenado: deja terminar las peticiones en curso en vez de cortarlas
  // a mitad, que es lo que hace un `process.exit` directo.
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => {
      logger.info('Cerrando el servidor', { signal })
      server.close(() => process.exit(0))
    })
  }
}

start()
