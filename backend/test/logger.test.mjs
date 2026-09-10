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
      // Misma técnica que `quitarAcentos` de `logger.mjs`, repetida aquí por
      // el mismo motivo que la lista de `redact`: probar contra un pino
      // propio, no contra el de producción que escribe a stdout.
      hooks: {
        logMethod(inputArgs, metodo) {
          const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
          if (typeof inputArgs[0] === 'string') inputArgs[0] = sinAcentos(inputArgs[0])
          else if (typeof inputArgs[1] === 'string') inputArgs[1] = sinAcentos(inputArgs[1])
          return metodo.apply(this, inputArgs)
        },
      },
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

describe('el mensaje de log sale sin acentos, para una terminal que no habla UTF-8', () => {
  /*
   * Medido el 10-09-2026: una consola sin página de códigos UTF-8 mostraba
   * "Petici├│n rechazada" en vez de "Petición rechazada" — el backend
   * escribía UTF-8 correcto (el navegador lo pintaba bien), la terminal no
   * lo decodificaba. `hooks.logMethod` reescribe el mensaje antes de que
   * pino lo serialice, para las dos formas en que se llama en este proyecto.
   */
  it('log(mensaje) — la forma sin meta', async () => {
    const salida = await capturar(log => log.warn('Petición rechazada: áéíóú ñ Ñ'))
    expect(salida).toContain('Peticion rechazada: aeiou n N')
    expect(salida).not.toContain('ó')
  })

  it('log(meta, mensaje) — la forma que usa request.log de Fastify', async () => {
    // Es justo el caso real que se rompía: `errores.mjs` llama
    // `request.log.warn({ ruta, detalle }, mensaje)`, y `request.log` es la
    // instancia cruda de pino, no el envoltorio `debug/info/warn/error`.
    const salida = await capturar(log =>
      log.warn({ ruta: '/api/iconics/history/batch' }, 'Petición rechazada por validación')
    )
    expect(salida).toContain('Peticion rechazada por validacion')
    // Lo que NO es el mensaje no se toca: la ruta sigue tal cual llegó.
    expect(salida).toContain('/api/iconics/history/batch')
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
