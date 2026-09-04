/**
 * SSO silencioso: el asistente empotrado como iframe en el HMI nativo de
 * ICONICS entra sin pedir usuario y contraseña otra vez.
 *
 * Lo que SÍ se prueba aquí con el transporte falso: que la función se apaga
 * limpio en las dos condiciones que la desactivan (`ICONICS_FAKE=true`, sin
 * `SSO_REDIRECT_URI`), que la URL que arma tiene la forma correcta, y que un
 * canje que falla no tira la app abajo.
 *
 * Lo que NO se prueba aquí: que ICONICS de verdad conteste `code=...` con
 * `prompt=none` cuando hay sesión — eso se confirmó a mano contra un servidor
 * real el 04-09-2026 (ver la cabecera de `iconics/authenticator.mjs`) y no
 * tiene equivalente en el transporte falso, que no implementa un servidor de
 * seguridad. `scripts/verificar-sesion.mjs` es candidato a ampliarse el día
 * que el ICONICS falso también simule el flujo OIDC completo.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { json, montarApp, montarAppSinSesion } from '../ayudas.mjs'

const { app } = await montarApp()
afterAll(() => app.close())

describe('GET /api/sesion/silenciosa/iniciar', () => {
  it('deshabilitado con ICONICS_FAKE=true, aunque haya SSO_REDIRECT_URI', async () => {
    const { app: conFake } = await montarApp({
      SSO_REDIRECT_URI: 'http://localhost:3001/auth/silencioso',
    })
    const respuesta = await conFake.inject({ method: 'GET', url: '/api/sesion/silenciosa/iniciar' })
    expect(json(respuesta)).toEqual({ habilitado: false })
    await conFake.close()
  })

  it('deshabilitado sin SSO_REDIRECT_URI, con transporte real', async () => {
    const { app: sinRedirect } = await montarAppSinSesion({
      ICONICS_FAKE: 'false',
      // `.invalid` (RFC 2606) nunca resuelve: estas pruebas comprueban el
      // manejo del error, no un ICONICS real — no dependen de red.
      ICONICS_API_BASE: 'https://sesion-silenciosa.invalid/fwxapi/rest/v1',
    })
    const respuesta = await sinRedirect.inject({ method: 'GET', url: '/api/sesion/silenciosa/iniciar' })
    expect(json(respuesta)).toEqual({ habilitado: false })
    await sinRedirect.close()
  })

  it('habilitado con SSO_REDIRECT_URI y transporte real: arma la URL con prompt=none', async () => {
    const { app: conRedirect } = await montarAppSinSesion({
      ICONICS_FAKE: 'false',
      // `.invalid` (RFC 2606) nunca resuelve: estas pruebas comprueban el
      // manejo del error, no un ICONICS real — no dependen de red.
      ICONICS_API_BASE: 'https://sesion-silenciosa.invalid/fwxapi/rest/v1',
      SSO_REDIRECT_URI: 'http://localhost:3001/auth/silencioso',
    })
    const respuesta = await conRedirect.inject({ method: 'GET', url: '/api/sesion/silenciosa/iniciar' })
    const cuerpo = json(respuesta)

    expect(cuerpo.habilitado).toBe(true)
    expect(cuerpo.url).toContain('prompt=none')
    expect(cuerpo.url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fauth%2Fsilencioso')
    expect(cuerpo.url).toContain('code_challenge_method=S256')
    // 32 bytes en base64url son 43 caracteres sin relleno.
    expect(cuerpo.verificador).toMatch(/^[\w-]{43}$/)
    await conRedirect.close()
  })

  it('cada intento trae un verificador PKCE distinto', async () => {
    const { app: conRedirect } = await montarAppSinSesion({
      ICONICS_FAKE: 'false',
      // `.invalid` (RFC 2606) nunca resuelve: estas pruebas comprueban el
      // manejo del error, no un ICONICS real — no dependen de red.
      ICONICS_API_BASE: 'https://sesion-silenciosa.invalid/fwxapi/rest/v1',
      SSO_REDIRECT_URI: 'http://localhost:3001/auth/silencioso',
    })
    const a = json(await conRedirect.inject({ method: 'GET', url: '/api/sesion/silenciosa/iniciar' }))
    const b = json(await conRedirect.inject({ method: 'GET', url: '/api/sesion/silenciosa/iniciar' }))
    expect(a.verificador).not.toBe(b.verificador)
    await conRedirect.close()
  })
})

describe('POST /api/sesion/silenciosa', () => {
  it('501 si el servidor no tiene SSO silencioso configurado', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/sesion/silenciosa',
      payload: { code: 'x', verificador: 'y' },
    })
    expect(respuesta.statusCode).toBe(501)
  })

  it('un canje que ICONICS rechaza da 401, no 500', async () => {
    const { app: conRedirect } = await montarAppSinSesion({
      ICONICS_FAKE: 'false',
      // `.invalid` (RFC 2606) nunca resuelve: estas pruebas comprueban el
      // manejo del error, no un ICONICS real — no dependen de red.
      ICONICS_API_BASE: 'https://sesion-silenciosa.invalid/fwxapi/rest/v1',
      SSO_REDIRECT_URI: 'http://localhost:3001/auth/silencioso',
    })
    const respuesta = await conRedirect.inject({
      method: 'POST',
      url: '/api/sesion/silenciosa',
      payload: { code: 'codigo-inventado', verificador: 'verificador-inventado' },
    })
    expect(respuesta.statusCode).toBe(401)
    expect(json(respuesta).ok).toBe(false)
    await conRedirect.close()
  })

  it('rechaza un cuerpo sin code o sin verificador', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/sesion/silenciosa',
      payload: { code: 'x' },
    })
    expect(respuesta.statusCode).toBe(400)
  })
})

describe('el buzón del iframe oculto', () => {
  it('GET /auth/silencioso sirve HTML que carga silencioso.js con ruta RELATIVA', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/auth/silencioso',
      headers: { cookie: '' },
    })
    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.headers['content-type']).toMatch(/text\/html/)
    // Relativa a propósito: un backend detrás de un proxy inverso bajo
    // subruta (ej. /asistente/) rompería con una ruta absoluta — ver la
    // cabecera de sesionRoutes.mjs.
    expect(respuesta.body).toContain('src="silencioso.js"')
    expect(respuesta.body).not.toContain('src="/auth/silencioso.js"')
  })

  it('GET /auth/silencioso.js manda el code y el error al padre por postMessage', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/auth/silencioso.js',
      headers: { cookie: '' },
    })
    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.headers['content-type']).toMatch(/javascript/)
    expect(respuesta.body).toContain('postMessage')
    expect(respuesta.body).toContain("'sso-silencioso'")
  })

  it('las dos rutas quedan fuera de la guarda de sesión: no hay sesión antes de tenerla', async () => {
    const html = await app.inject({ method: 'GET', url: '/auth/silencioso', headers: { cookie: '' } })
    const js = await app.inject({ method: 'GET', url: '/auth/silencioso.js', headers: { cookie: '' } })
    expect(html.statusCode).not.toBe(401)
    expect(js.statusCode).not.toBe(401)
  })
})
