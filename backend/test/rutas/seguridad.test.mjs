/**
 * Cabeceras de seguridad, CORS y las guardas de escritura.
 *
 * Las cabeceras son NUEVAS: el puente no enviaba ninguna. Estas pruebas
 * existen para que no vuelvan a desaparecer sin que nadie se entere — que es
 * exactamente como faltaban.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { json, montarApp, montarAppSinSesion } from '../ayudas.mjs'

const { app } = await montarApp()
afterAll(() => app.close())

describe('cabeceras de seguridad', () => {
  it('impide que el tablero se meta en un iframe ajeno', async () => {
    /*
     * Sin esto, una página cualquiera puede empotrar el tablero y recoger los
     * clics del operador. Como el navegador que lo abre está dentro de la red
     * y el puente mantiene una sesión privilegiada contra ICONICS, esos clics
     * valen sobre la planta.
     */
    const respuesta = await app.inject({ method: 'GET', url: '/api/health/live' })
    /*
     * `DENY`, no `SAMEORIGIN`: la cabecera heredada tiene que ser tan estricta
     * como el `frame-ancestors 'none'` de la CSP, o la protección dependería
     * de cuál de las dos aplique el navegador.
     */
    expect(respuesta.headers['x-frame-options']).toBe('DENY')
    expect(respuesta.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/)
  })

  it('impide que el navegador adivine el tipo de contenido', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/health/live' })
    expect(respuesta.headers['x-content-type-options']).toBe('nosniff')
  })

  it('declara una CSP que no admite scripts de otros orígenes', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/health/live' })
    const csp = respuesta.headers['content-security-policy']
    expect(csp).toMatch(/script-src 'self'/)
    // `unsafe-inline` en scripts sería la puerta que la CSP viene a cerrar.
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
  })

  it('deja pasar los estilos en línea, que el tablero necesita', async () => {
    // Vite inyecta el CSS crítico en línea; sin esto la pantalla sale sin
    // formato, que es peor que el riesgo que se evita.
    const respuesta = await app.inject({ method: 'GET', url: '/api/health/live' })
    expect(respuesta.headers['content-security-policy']).toMatch(
      /style-src[^;]*'unsafe-inline'/
    )
  })
})

describe('FRAME_ANCESTORS', () => {
  it('con la lista vacía, sigue en frame-ancestors \'none\' y X-Frame-Options DENY', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/health/live' })
    expect(respuesta.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/)
    expect(respuesta.headers['x-frame-options']).toBe('DENY')
  })

  it('declarado, se sustituye \'none\' por \'self\' + los orígenes exactos', async () => {
    const { app: conFrame } = await montarApp({ FRAME_ANCESTORS: 'https://bms-server' })
    const respuesta = await conFrame.inject({ method: 'GET', url: '/api/health/live' })
    const csp = respuesta.headers['content-security-policy']
    expect(csp).toMatch(/frame-ancestors 'self' https:\/\/bms-server/)
    expect(csp).not.toMatch(/frame-ancestors 'none'/)
    await conFrame.close()
  })

  it('con la lista vacía, NO añade \'self\': sin SSO silencioso que ofrecer, no hay motivo', async () => {
    // 'self' sólo tiene sentido para el iframe oculto de /auth/silencioso, que
    // no existe sin FRAME_ANCESTORS. Añadirlo siempre sería relajar la CSP sin
    // que nada lo necesite.
    const respuesta = await app.inject({ method: 'GET', url: '/api/health/live' })
    expect(respuesta.headers['content-security-policy']).not.toMatch(/frame-ancestors[^;]*'self'/)
  })

  it('nunca acepta el comodín: el arranque falla, no lo filtra en silencio', async () => {
    // A diferencia de CORS_ORIGINS (donde un '*' es inofensivo por comparar
    // por igualdad exacta), aquí la lista se inyecta TAL CUAL en la CSP:
    // "frame-ancestors *" es un comodín de verdad y dejaría enmarcar la app
    // desde cualquier sitio. Se falla ruidoso al arrancar, como con
    // ICONICS_API_BASE inválido.
    await expect(montarApp({ FRAME_ANCESTORS: '*' })).rejects.toThrow(/FRAME_ANCESTORS/)
  })

  it('con SSO_REDIRECT_URI y un ICONICS real, frame-src permite abrir el iframe oculto hacia ICONICS', async () => {
    const { app: conSso } = await montarAppSinSesion({
      FRAME_ANCESTORS: 'https://bms-server',
      SSO_REDIRECT_URI: 'http://localhost:3001/auth/silencioso',
      ICONICS_FAKE: 'false',
      ICONICS_API_BASE: 'https://bms-server/fwxapi/rest/v1',
    })
    const respuesta = await conSso.inject({ method: 'GET', url: '/api/health/live' })
    expect(respuesta.headers['content-security-policy']).toMatch(/frame-src 'self' https:\/\/bms-server/)
    await conSso.close()
  })

  it('sin SSO_REDIRECT_URI, no hay frame-src propio: default-src ya prohíbe todo iframe saliente', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/health/live' })
    expect(respuesta.headers['content-security-policy']).not.toMatch(/frame-src/)
  })

  it('con orígenes declarados, X-Frame-Options se retira en vez de mentir con ALLOW-FROM', async () => {
    // Ningún navegador moderno respeta ALLOW-FROM (Chrome nunca lo
    // implementó): dejarlo puesto no protegería nada y daría la falsa
    // impresión de una segunda barrera. La CSP de arriba es la que de verdad
    // se aplica.
    const { app: conFrame } = await montarApp({ FRAME_ANCESTORS: 'https://bms-server' })
    const respuesta = await conFrame.inject({ method: 'GET', url: '/api/health/live' })
    expect(respuesta.headers['x-frame-options']).toBeUndefined()
    await conFrame.close()
  })
})

describe('CORS', () => {
  it('no autoriza ningún origen cuando la lista está vacía', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/health/live',
      headers: { origin: 'https://sitio-cualquiera.example' },
    })
    expect(respuesta.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('autoriza sólo los orígenes declarados', async () => {
    const { app: conCors } = await montarApp({ CORS_ORIGINS: 'http://localhost:5173' })

    const permitido = await conCors.inject({
      method: 'GET',
      url: '/api/health/live',
      headers: { origin: 'http://localhost:5173' },
    })
    expect(permitido.headers['access-control-allow-origin']).toBe('http://localhost:5173')

    const denegado = await conCors.inject({
      method: 'GET',
      url: '/api/health/live',
      headers: { origin: 'http://otro.example' },
    })
    expect(denegado.headers['access-control-allow-origin']).toBeUndefined()

    await conCors.close()
  })

  it('nunca responde con el comodín', async () => {
    /*
     * El comodín es lo que había antes en TODA respuesta, y es lo que permitía
     * que cualquier página abierta en un navegador de planta llamara a la API
     * por la espalda del usuario.
     */
    const { app: conCors } = await montarApp({ CORS_ORIGINS: 'http://localhost:5173' })
    const respuesta = await conCors.inject({
      method: 'GET',
      url: '/api/health/live',
      headers: { origin: 'http://localhost:5173' },
    })
    expect(respuesta.headers['access-control-allow-origin']).not.toBe('*')
    await conCors.close()
  })
})

describe('modo solo lectura', () => {
  it('rechaza la escritura con 403 y dice cómo habilitarla', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/iconics/write',
      payload: { pointName: 'ac:TDCON/DEMO/SENSORES/Bomba', value: 1 },
    })

    expect(respuesta.statusCode).toBe(403)
    // El mensaje nombra la variable: sin eso hay que ir a buscar al código qué
    // se cambia para permitirlo.
    expect(json(respuesta).error).toMatch(/ICONICS_READ_ONLY/)
  })

  it('responde 403 y NO el index.html de la SPA', async () => {
    /*
     * Es lo peor de los dos mundos y el motivo de que la ruta se registre
     * aunque esté prohibida: si no existiera, la petición caería al respaldo
     * de la SPA y devolvería el index.html con un 200 — el cliente no escribe
     * nada y cree que sí.
     */
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/iconics/write',
      payload: { pointName: 'ac:TDCON/DEMO/SENSORES/Bomba', value: 1 },
    })
    expect(respuesta.statusCode).not.toBe(200)
    expect(respuesta.headers['content-type']).toMatch(/json/)
  })

  it('rechaza también el reconocimiento de alarmas', async () => {
    const respuesta = await app.inject({
      method: 'PUT',
      url: '/api/iconics/alarms/acknowledge',
      payload: { eventIds: ['1'] },
    })
    expect(respuesta.statusCode).toBe(403)
  })

  it('la lectura sigue funcionando', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/iconics/userinfo' })
    expect(respuesta.statusCode).toBeLessThan(400)
  })
})

describe('autenticación', () => {
  /*
   * Las dos pruebas que había aquí describían el mundo anterior —una guarda
   * que dejaba pasar a todos, y un `AUTH_HABILITADA=true` que impedía
   * arrancar— y desaparecieron con él (Plan 20 Fase 1). El grueso de la
   * autenticación se prueba en `sesion.test.mjs`; lo que queda aquí es la
   * frontera con la SEGURIDAD de transporte, que es de lo que va este archivo.
   */
  it('las sondas de salud quedan fuera de la guarda', async () => {
    for (const url of ['/api/health/live', '/api/health', '/api/health/ready']) {
      const respuesta = await app.inject({ method: 'GET', url, headers: { cookie: '' } })
      expect(respuesta.statusCode, `${url} debería responder sin sesión`).toBe(200)
    }
  })

  it('la cookie de sesión es httpOnly y SameSite=Strict', async () => {
    /*
     * `httpOnly` es lo único que impide que un XSS en la página del asistente
     * se lleve la sesión, y esta aplicación renderiza markdown escrito por un
     * modelo de lenguaje. `SameSite=Strict` es lo que cubre el CSRF que la
     * cookie introduce. Si alguien las quita, esto lo dice.
     */
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/sesion',
      payload: { usuario: 'quien.sea', contrasena: 'lo-que-sea' },
    })
    const puesta = [respuesta.headers['set-cookie']].flat().join(';')
    expect(puesta).toMatch(/HttpOnly/i)
    expect(puesta).toMatch(/SameSite=Strict/i)
  })
})
