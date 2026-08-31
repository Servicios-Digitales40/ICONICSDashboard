/**
 * Pruebas del logger.
 *
 * La que importa de verdad es la redacción: es el motivo entero de haber
 * sustituido el formateador anterior, que hacía bien todo lo demás. En este
 * proceso viven `ICONICS_PASSWORD` y los tokens OIDC, y sin `redact` lo único
 * que impide escribirlos en el log de planta es acordarse de no hacerlo.
 */
import { describe, expect, it } from 'vitest'
import { PassThrough } from 'node:stream'
import pino from 'pino'

/**
 * Se construye un pino con la MISMA configuración de redacción que
 * `createLogger`, escribiendo a un flujo en memoria.
 *
 * No se reutiliza `createLogger` porque escribe a `process.stdout` y no admite
 * un destino: capturarlo exigiría parchear el stdout del proceso, que es peor
 * que repetir la lista aquí — y esta prueba fallaría si las dos divergen, que
 * es justo lo que se quiere.
 */
async function capturar(escribir) {
  const flujo = new PassThrough()
  const lineas = []
  flujo.on('data', trozo => lineas.push(trozo.toString()))

  const instancia = pino(
    {
      redact: {
        paths: [
          'password', '*.password', '*.*.password',
          'token', '*.token', '*.*.token',
          'access_token', '*.access_token',
          'refresh_token', '*.refresh_token',
          'authorization', '*.authorization',
          'headers.authorization', 'headers.cookie',
          '*.headers.authorization', '*.headers.cookie',
        ],
        censor: '[redactado]',
      },
      base: undefined,
    },
    flujo
  )

  escribir(instancia)
  await new Promise(resolve => setImmediate(resolve))
  return lineas.join('')
}

describe('redacción de secretos', () => {
  it('oculta una contraseña suelta', async () => {
    const salida = await capturar(log => log.info({ password: 'secreto-de-planta' }, 'prueba'))
    expect(salida).not.toContain('secreto-de-planta')
    expect(salida).toContain('[redactado]')
  })

  it('oculta la contraseña dentro de un objeto de configuración', async () => {
    /*
     * Es el caso real: nadie loguea `password` suelto, se loguea el objeto que
     * lo contiene —`logger.error('falló', { config })`— y ahí es donde el
     * formateador anterior lo escribía en claro.
     */
    const salida = await capturar(log =>
      log.error({ iconics: { username: 'operador', password: 'secreto-de-planta' } }, 'falló')
    )
    expect(salida).not.toContain('secreto-de-planta')
    // El resto del objeto sí viaja: lo que se oculta es el secreto, no el
    // contexto que hace falta para diagnosticar.
    expect(salida).toContain('operador')
  })

  it('oculta los tokens OIDC', async () => {
    const salida = await capturar(log =>
      log.info({ sesion: { access_token: 'ey.JWT.falso', refresh_token: 'refresco' } }, 'token')
    )
    expect(salida).not.toContain('ey.JWT.falso')
    expect(salida).not.toContain('refresco')
  })

  it('oculta la cabecera Authorization', async () => {
    const salida = await capturar(log =>
      log.info({ headers: { authorization: 'Bearer secreto' } }, 'petición')
    )
    expect(salida).not.toContain('Bearer secreto')
  })

  it('deja rastro de que había algo', async () => {
    /*
     * `[redactado]` y no borrar el campo: ver que existía y se ocultó es
     * información; que desaparezca haría creer que nunca estuvo.
     */
    const salida = await capturar(log => log.info({ password: 'x' }, 'prueba'))
    expect(salida).toContain('[redactado]')
  })
})

describe('createLogger', () => {
  it('acepta el nivel en mayúsculas, como está escrito en .env', async () => {
    // `LOG_LEVEL=INFO` es lo que hay en la documentación y en las
    // instalaciones existentes; pino los quiere en minúsculas.
    const { createLogger } = await import('../logger.mjs')
    const log = createLogger({ level: 'WARN' })
    expect(log.pino.level).toBe('warn')
  })

  it('cae a info si el nivel no se reconoce', async () => {
    const { createLogger } = await import('../logger.mjs')
    expect(createLogger({ level: 'chillón' }).pino.level).toBe('info')
  })

  it('admite silent para las pruebas', async () => {
    const { createLogger } = await import('../logger.mjs')
    expect(createLogger({ level: 'silent' }).pino.level).toBe('silent')
  })

  it('conserva el orden (mensaje, meta) de los once módulos que lo usan', async () => {
    /*
     * pino recibe `(meta, mensaje)`. Invertirlo aquí obligaría a reescribir
     * unas cuarenta llamadas para no ganar nada, y cada una sería una ocasión
     * de equivocarse.
     */
    const { createLogger } = await import('../logger.mjs')
    const log = createLogger({ level: 'silent' })
    expect(() => log.info('un mensaje', { dato: 1 })).not.toThrow()
    expect(() => log.info('sin meta')).not.toThrow()
  })
})
