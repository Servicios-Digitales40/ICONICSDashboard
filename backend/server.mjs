/**
 * Punto de entrada del backend puente hacia ICONICS.
 *
 * Sólo hace tres cosas: leer la configuración, montar la app y escuchar. Toda
 * la lógica está en los módulos que compone.
 *
 *   node --env-file=.env.local backend/server.mjs
 */
import { createApp } from './app.mjs'
import { loadConfig } from './config.mjs'
import { logger } from './logger.mjs'

const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM']

/**
 * Los avisos de arranque.
 *
 * Son las cosas que hay que ver en el log al levantar un servidor y
 * preguntarse «¿esto está como debería?». Se anuncian aunque sean legítimos en
 * desarrollo, porque el descuido no es activarlos: es no darse cuenta de que
 * siguen activos.
 *
 * Cada uno dice QUÉ pasa, QUÉ efecto tiene y CÓMO se cambia. Un aviso que sólo
 * nombra una variable obliga a ir a buscar qué hace esa variable.
 */
function avisarDeLaConfiguracion(config) {
  if (!config.iconics.isConfigured) {
    logger.warn(
      'ICONICS no está configurado: las rutas de datos responderán 500 y el tablero saldrá vacío',
      {
        variable: 'ICONICS_API_BASE',
        arreglo: 'apunta ICONICS_API_BASE a la API del servidor de planta, o usa ICONICS_FAKE=true para datos simulados',
      }
    )
  } else if (!config.iconics.canAuthenticate) {
    logger.warn(
      'Sin credenciales de ICONICS: las peticiones saldrán SIN token y el servidor las rechazará ' +
        'si exige autenticación',
      {
        variables: 'ICONICS_USERNAME, ICONICS_PASSWORD',
        base: config.iconics.apiBase,
      }
    )
  }

  if (!config.iconics.readOnly) {
    logger.warn(
      'La escritura sobre la planta está HABILITADA: este servidor puede accionar bombas y ' +
        'reconocer alarmas de verdad',
      {
        variable: 'ICONICS_READ_ONLY=false',
        arreglo: 'quita la variable para volver al modo seguro de solo lectura',
      }
    )
  }

  if (config.tlsVerificationDisabled) {
    logger.warn(
      'Verificación de certificados TLS DESACTIVADA en todo el proceso: cualquier certificado se ' +
        'acepta, incluido el de un intermediario',
      {
        variable: 'NODE_TLS_REJECT_UNAUTHORIZED=0',
        arreglo: 'instala la CA de ICONICS y usa NODE_EXTRA_CA_CERTS en su lugar',
      }
    )
  }

  if (config.corsOrigins.length === 0) {
    logger.debug(
      'CORS cerrado: sólo el frontend servido por este mismo puerto puede llamar a la API',
      { arreglo: 'para el dev server de Vite, añade su origen a CORS_ORIGINS' }
    )
  }

  if (!config.ia.isConfigured) {
    logger.info(
      'El asistente está apagado: /api/chat responderá 503 y el tablero funcionará sin él',
      { variable: 'IA_BASE', arreglo: 'apunta IA_BASE a llama-server para habilitarlo' }
    )
  }

  if (!config.ia.whisper.isConfigured) {
    logger.debug(
      'El dictado por voz está apagado: /api/voz responderá 503',
      { variable: 'IA_WHISPER_BASE' }
    )
  }
}

async function start() {
  let config
  try {
    config = loadConfig()
  } catch (error) {
    logger.error(
      `El servidor NO arranca porque la configuración es inválida: ${error.message}`,
      { err: error, arreglo: 'revisa .env.local contra .env.example' }
    )
    process.exit(1)
  }

  let app
  try {
    app = await createApp(config)
  } catch (error) {
    logger.error(
      `El servidor NO arranca porque falló el montaje de la aplicación: ${error.message}`,
      { err: error }
    )
    process.exit(1)
  }

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' })
  } catch (error) {
    /*
     * `EADDRINUSE` es con diferencia el fallo más común al arrancar, y el
     * mensaje de Node (`listen EADDRINUSE: address already in use`) no dice lo
     * único que hace falta saber: que hay otra copia de esto ya corriendo.
     */
    const enUso = error?.code === 'EADDRINUSE'
    logger.error(
      enUso
        ? `El puerto ${config.port} ya está ocupado: probablemente hay otra copia del puente corriendo`
        : `No se pudo abrir el puerto ${config.port}: ${error.message}`,
      {
        err: error,
        puerto: config.port,
        ...(enUso
          ? { arreglo: 'cierra la otra instancia (scripts/stop.ps1) o arranca con otro PORT' }
          : {}),
      }
    )
    process.exit(1)
  }

  /*
   * La URL, primero y en su propia línea. El servidor sirve el tablero además
   * de la API, así que quien lo arranca necesita saber dónde abrirlo; sin esto
   * sólo veía una línea de log y había que deducirlo del puerto. Es lo que
   * hace el dev server de Vite y se echaba de menos.
   */
  logger.info(`Tablero disponible en http://localhost:${config.port}`)

  logger.info(`Puente ICONICS ${config.version} escuchando en el puerto ${config.port}`, {
    version: config.version,
    puerto: config.port,
    iconicsBase: config.iconics.apiBase || null,
    puntoPorDefecto: config.iconics.defaultPointName || null,
    directorioEstaticos: config.staticDir,
    soloLectura: config.iconics.readOnly,
    origenesCors: config.corsOrigins.length,
    datosSimulados: config.iconics.fake,
    asistente: config.ia.isConfigured ? config.ia.modelos.join(', ') || 'configurado' : 'apagado',
  })

  avisarDeLaConfiguracion(config)

  // Cierre ordenado: deja terminar las peticiones en curso en vez de cortarlas
  // a mitad, que es lo que hace un `process.exit` directo. `app.close()` de
  // Fastify espera además a que los plugins liberen lo suyo.
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, async () => {
      logger.info(`Cerrando el puente por ${signal}: esperando a que terminen las peticiones en curso`)
      try {
        await app.close()
        logger.info('Puente cerrado limpiamente')
        process.exit(0)
      } catch (error) {
        logger.error(`El cierre ordenado falló: ${error.message}`, { err: error })
        process.exit(1)
      }
    })
  }
}

start()
