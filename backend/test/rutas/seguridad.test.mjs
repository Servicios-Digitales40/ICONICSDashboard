/**
 * Cabeceras de seguridad, CORS y las guardas de escritura.
 *
 * Las cabeceras son NUEVAS: el puente no enviaba ninguna. Estas pruebas
 * existen para que no vuelvan a desaparecer sin que nadie se entere — que es
 * exactamente como faltaban.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { json, montarApp } from '../ayudas.mjs'

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

  it('no deja llamar a ningún otro origen si no se declara ninguno', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/health/live' })
    expect(respuesta.headers['content-security-policy']).toMatch(/connect-src 'self'(;|$)/)
  })

  it('deja llamar al origen declarado en CONNECT_ORIGINS', async () => {
    /*
     * El módulo de Predicción llama desde el navegador a su Django en otra
     * máquina. Sin esto, el navegador bloqueaba ese `fetch` y sin error en la
     * página: el módulo aparecía caído sin decir por qué.
     */
    const { app: conConnect } = await montarApp({ CONNECT_ORIGINS: 'http://10.10.17.13:8000' })

    const respuesta = await conConnect.inject({ method: 'GET', url: '/api/health/live' })
    expect(respuesta.headers['content-security-policy']).toMatch(
      /connect-src 'self' http:\/\/10\.10\.17\.13:8000/
    )

    await conConnect.close()
  })

  it('permite el framing sólo desde el origen declarado en FRAME_ANCESTORS', async () => {
    const { app: conFrame } = await montarApp({ FRAME_ANCESTORS: 'https://localhost:3001' })

    const respuesta = await conFrame.inject({ method: 'GET', url: '/api/health/live' })
    expect(respuesta.headers['content-security-policy']).toMatch(
      /frame-ancestors https:\/\/localhost:3001/
    )
    // `X-Frame-Options` sólo admite un origen y ya no lo respetan los
    // navegadores modernos: con FRAME_ANCESTORS declarado se desactiva del
    // todo para no dar una falsa sensación de protección.
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

describe('autenticación (todavía apagada)', () => {
  it('deja pasar y marca al peticionario como anónimo', async () => {
    // Mientras `AUTH_HABILITADA` sea falso, las guardas declaradas en las
    // rutas no deben estorbar.
    const respuesta = await app.inject({ method: 'GET', url: '/api/health/live' })
    expect(respuesta.statusCode).toBe(200)
  })

  it('el servidor NO arranca si se pide autenticación sin implementarla', async () => {
    /*
     * Puerta deliberada: dejarlo pasar con un aviso significaría que alguien
     * pide autenticación, ve el servidor levantar, y cree que está protegido.
     */
    await expect(montarApp({ AUTH_HABILITADA: 'true' })).rejects.toThrow(/no está implementada/)
  })
})
