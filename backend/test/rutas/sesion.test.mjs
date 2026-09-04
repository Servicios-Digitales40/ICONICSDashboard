/**
 * La sesión de persona: entrar, salir, caducar y no pisarse (Plan 20 Fase 1).
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE APARTE ─────────────────────────────
 *
 * Porque `montarApp()` devuelve una app que ya lleva la cookie puesta, para
 * que las demás pruebas de rutas sigan probando su contrato sin repetir el
 * login. Si la autenticación se comprobara de refilón en cada archivo, no se
 * comprobaría en ninguno: aquí es el sujeto, no el decorado.
 *
 * Todo corre con `ICONICS_FAKE=true`, así que el login acepta cualquier
 * credencial no vacía —no hay servidor de seguridad contra el que validar—.
 * Lo que se prueba, por tanto, no es el flujo OIDC (eso es red real, y vive en
 * `scripts/verificar-antiguedad-historico.mjs`) sino **el ciclo de vida de la
 * sesión**, que es lo que este plan añadió y lo que puede romperse en
 * silencio.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { abrirSesion, json, montarApp } from '../ayudas.mjs'

let appsAbiertas = []
afterEach(async () => {
  await Promise.all(appsAbiertas.map(a => a.close()))
  appsAbiertas = []
})

function conRegistro(montaje) {
  appsAbiertas.push(montaje.app)
  return montaje
}

/** Petición explícitamente SIN sesión. La cabecera vacía es la salida. */
const sinSesion = opciones => ({ ...opciones, headers: { cookie: '' } })

describe('POST /api/sesion — entrar', () => {
  it('con credenciales buenas devuelve 200 y pone la cookie', async () => {
    const { app } = conRegistro(await montarApp())

    const respuesta = await app.inject(sinSesion({
      method: 'POST',
      url: '/api/sesion',
      payload: { usuario: 'ana.tecnica', contrasena: 'la-que-sea' },
    }))

    expect(respuesta.statusCode).toBe(200)
    expect(json(respuesta).usuario).toBe('ana.tecnica')
    expect([respuesta.headers['set-cookie']].flat().join(';')).toMatch(/sesion=/)
  })

  it('la contraseña no vuelve en la respuesta', async () => {
    const { app } = conRegistro(await montarApp())

    const respuesta = await app.inject(sinSesion({
      method: 'POST',
      url: '/api/sesion',
      payload: { usuario: 'ana.tecnica', contrasena: 'secreto-que-no-debe-salir' },
    }))

    expect(respuesta.body).not.toContain('secreto-que-no-debe-salir')
  })

  it('un cuerpo sin usuario o sin contraseña → 400, y no crea sesión', async () => {
    const { app } = conRegistro(await montarApp())

    /*
     * Relativo y no absoluto: `montarApp()` ya abrió la suya para que el resto
     * de pruebas de rutas funcionen. Lo que se comprueba es que un login
     * inválido no SUME ninguna — un contador fijo se rompería el día que el
     * ayudante abra dos, sin que nada esté mal.
     */
    const antes = json(await app.inject(sinSesion({ method: 'GET', url: '/api/health' }))).sesionesActivas

    for (const payload of [{ usuario: 'ana' }, { contrasena: 'x' }, { usuario: '', contrasena: 'x' }]) {
      const respuesta = await app.inject(sinSesion({ method: 'POST', url: '/api/sesion', payload }))
      expect(respuesta.statusCode, JSON.stringify(payload)).toBe(400)
    }

    const despues = json(await app.inject(sinSesion({ method: 'GET', url: '/api/health' }))).sesionesActivas
    expect(despues).toBe(antes)
  })

  it('al alcanzar SESION_MAX responde 503, no 401', async () => {
    /*
     * La distinción importa: un 401 mandaría al técnico a revisar una
     * contraseña que está bien. Esto es capacidad — «vuelve luego».
     */
    // 3 y no 2: una plaza se la queda la sesión que abre `montarApp()`.
    const { app } = conRegistro(await montarApp({ SESION_MAX: '3' }))

    const entrar = usuario => app.inject(sinSesion({
      method: 'POST', url: '/api/sesion', payload: { usuario, contrasena: 'x' },
    }))

    expect((await entrar('uno')).statusCode).toBe(200)
    expect((await entrar('dos')).statusCode).toBe(200)

    const sobrante = await entrar('tres')
    expect(sobrante.statusCode).toBe(503)
    expect(json(sobrante).error).toMatch(/SESION_MAX/)
  })
})

describe('la guarda muerde', () => {
  /*
   * La lista es el contrato: toda ruta de datos exige sesión. Si alguien añade
   * una y olvida la guarda, esta prueba no la cubrirá —no puede adivinarla—
   * pero al menos ninguna de las que hay puede perderla en silencio.
   */
  const PROTEGIDAS = [
    ['GET', '/api/iconics/data?pointName=ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE'],
    ['GET', '/api/iconics/data/batch?points=a'],
    ['GET', '/api/iconics/browse'],
    ['GET', '/api/iconics/points?query=x'],
    ['GET', '/api/iconics/userinfo'],
    ['GET', '/api/context'],
    ['GET', '/api/chat'],
    ['GET', '/api/casos'],
    ['GET', '/api/rag/documentos'],
    ['GET', '/api/voz'],
    ['GET', '/api/diagnostico?sistema=tanque&riesgoId=x'],
  ]

  it.each(PROTEGIDAS)('%s %s responde 401 sin sesión', async (method, url) => {
    const { app } = conRegistro(await montarApp())
    const respuesta = await app.inject(sinSesion({ method, url }))

    expect(respuesta.statusCode).toBe(401)
    /*
     * El `motivo` no es decoración: es lo que permite al frontend distinguir
     * «tu sesión caducó» —vuelve al login conservando el hilo— de cualquier
     * otro 401, que no debe expulsar a nadie.
     */
    expect(json(respuesta).motivo).toBe('sesion')
  })

  it('una cookie inventada no vale', async () => {
    const { app } = conRegistro(await montarApp())
    const respuesta = await app.inject({
      method: 'GET', url: '/api/casos', headers: { cookie: 'sesion=noExisteEsteId' },
    })
    expect(respuesta.statusCode).toBe(401)
  })
})

describe('GET /api/sesion — quién soy', () => {
  it('sin cookie responde 401 con motivo, no 500', async () => {
    const { app } = conRegistro(await montarApp())
    const respuesta = await app.inject(sinSesion({ method: 'GET', url: '/api/sesion' }))

    expect(respuesta.statusCode).toBe(401)
    expect(json(respuesta).motivo).toBe('sesion')
  })

  it('con cookie dice quién es', async () => {
    const { app, usuario } = conRegistro(await montarApp())
    const respuesta = await app.inject({ method: 'GET', url: '/api/sesion' })

    expect(respuesta.statusCode).toBe(200)
    expect(json(respuesta).usuario).toBe(usuario)
  })
})

describe('DELETE /api/sesion — salir', () => {
  it('la misma cookie deja de servir después del logout', async () => {
    const { app, cookie } = conRegistro(await montarApp())

    expect((await app.inject({ method: 'GET', url: '/api/casos' })).statusCode).toBe(200)

    const salida = await app.inject({ method: 'DELETE', url: '/api/sesion' })
    expect(salida.statusCode).toBe(200)

    const despues = await app.inject({ method: 'GET', url: '/api/casos', headers: { cookie } })
    expect(despues.statusCode).toBe(401)
  })

  it('cerrar una sesión que ya no existe responde 200, no 404', async () => {
    /*
     * Idempotente a propósito: los dos casos acaban en lo mismo —el usuario
     * fuera— y un 404 sólo obligaría al frontend a distinguirlos para nada.
     */
    const { app } = conRegistro(await montarApp())
    await app.inject({ method: 'DELETE', url: '/api/sesion' })

    const otraVez = await app.inject({ method: 'DELETE', url: '/api/sesion' })
    expect(otraVez.statusCode).toBe(200)
  })
})

describe('dos sesiones no se pisan', () => {
  /*
   * ── LA PRUEBA QUE JUSTIFICA TODA LA FASE ────────────────────────────
   *
   * El estado de los tokens vive en el cierre de `createAuthenticator`, no en
   * variables de módulo. Eso, que antes sólo servía para que producción y una
   * prueba coexistieran, es ahora lo que impide que la sesión de Ana lea la
   * planta con el token de Beto. Si alguien mueve ese estado a nivel de
   * módulo, esto lo dice.
   */
  it('cada cookie identifica a su propio usuario', async () => {
    const { app, servidor } = conRegistro(await montarApp())

    const ana = await abrirSesion(servidor, 'ana.tecnica')
    const beto = await abrirSesion(servidor, 'beto.tecnico')

    expect(ana.cookie).not.toBe(beto.cookie)

    const quienEs = async cookie =>
      json(await app.inject({ method: 'GET', url: '/api/sesion', headers: { cookie } })).usuario

    expect(await quienEs(ana.cookie)).toBe('ana.tecnica')
    expect(await quienEs(beto.cookie)).toBe('beto.tecnico')
  })

  it('cerrar una no cierra la otra', async () => {
    const { app, servidor } = conRegistro(await montarApp())

    const ana = await abrirSesion(servidor, 'ana.tecnica')
    const beto = await abrirSesion(servidor, 'beto.tecnico')

    await app.inject({ method: 'DELETE', url: '/api/sesion', headers: { cookie: ana.cookie } })

    expect(
      (await app.inject({ method: 'GET', url: '/api/casos', headers: { cookie: ana.cookie } })).statusCode
    ).toBe(401)
    expect(
      (await app.inject({ method: 'GET', url: '/api/casos', headers: { cookie: beto.cookie } })).statusCode
    ).toBe(200)
  })
})

describe('caducidad por inactividad', () => {
  it('una sesión inactiva más de su TTL deja de valer', async () => {
    /*
     * `SESION_TTL_MINUTOS` mínimo es 1, así que esperar de verdad costaría un
     * minuto por prueba. En vez de eso se comprueba el mecanismo donde vive
     * —el registro, con su reloj inyectable— sin montar la app: es la misma
     * separación que hay entre `verificar-calibracion` y `medir-calibracion`.
     */
    const { crearRegistroDeSesiones } = await import('../../sesiones/registro.mjs')

    let ahora = 1_000_000
    const registro = crearRegistroDeSesiones({
      crearPila: () => ({}),
      ttlMs: 60_000,
      maximo: 8,
      ahora: () => ahora,
    })

    const { id } = registro.crear({ usuario: 'ana', contrasena: 'x' })
    expect(registro.resolver(id)).not.toBeNull()

    ahora += 30_000
    expect(registro.resolver(id), 'a los 30 s sigue viva').not.toBeNull()

    // Ese `resolver` renovó la inactividad: el TTL cuenta desde el último uso.
    ahora += 45_000
    expect(registro.resolver(id), 'el uso renueva la ventana').not.toBeNull()

    ahora += 60_001
    expect(registro.resolver(id), 'sin usarla, caduca').toBeNull()
    expect(registro.activas()).toBe(0)
  })

  it('la pila de una sesión caducada se cierra', async () => {
    const { crearRegistroDeSesiones } = await import('../../sesiones/registro.mjs')

    let ahora = 0
    let cerradas = 0
    const registro = crearRegistroDeSesiones({
      crearPila: () => ({ cerrar: () => { cerradas += 1 } }),
      ttlMs: 1000,
      maximo: 8,
      ahora: () => ahora,
    })

    registro.crear({ usuario: 'ana', contrasena: 'x' })
    ahora += 2000
    registro.activas()

    expect(cerradas).toBe(1)
  })
})
