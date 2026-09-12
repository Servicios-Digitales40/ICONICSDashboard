/**
 * La sesión de usuario, ENCENDIDA (Plan 22 F6 · SEG-01, primera mitad).
 *
 * ── POR QUÉ ESTAS PRUEBAS Y NO OTRA COSA ───────────────────────────
 *
 * Porque el interruptor se entrega apagado —el tablero todavía no sabe pedir
 * un token, y eso es el Plan 25— y un interruptor que nadie ha accionado no es
 * un interruptor probado, es una promesa. Aquí se enciende
 * `AUTH_HABILITADA=true` y se comprueba lo que pasaría el día que se encienda
 * de verdad en planta.
 *
 * Las cuatro afirmaciones que pide el plan:
 *
 *  · sin token, 401; con token válido, pasa
 *  · un token CADUCADO se distingue de uno inválido — son dos arreglos
 *    distintos, y quien programe el tablero necesita saber cuál es
 *  · `exigirRol` niega con 403 y no con 404, que diría que la ruta no existe
 *  · las sondas de salud siguen fuera, porque un despliegue autenticado no
 *    puede reiniciarse solo porque su propia sonda responda 401
 */
import { describe, expect, it } from 'vitest'
import { createSigner } from 'fast-jwt'

import { json, montarApp } from '../ayudas.mjs'
import { hashDeClave } from '../../http/usuarios.mjs'

const SECRETO = 'un-secreto-de-pruebas-suficientemente-largo-32+'
const CLAVE = 'la-clave-de-ana'

/** El censo de las pruebas: una operadora y alguien sin ese rol. */
const censo = [
  `ana:operador,supervisor:${await hashDeClave(CLAVE)}`,
  `mirona:invitado:${await hashDeClave(CLAVE)}`,
].join(';')

const ENTORNO = {
  AUTH_HABILITADA: 'true',
  AUTH_SECRETO: SECRETO,
  AUTH_USUARIOS: censo,
  // La bomba sólo se puede accionar con escritura habilitada; sin esto, el
  // 403 del rol se confundiría con el 403 de solo lectura.
  ICONICS_READ_ONLY: 'false',
}

async function conSesion(extra = {}) {
  const { app } = await montarApp({ ...ENTORNO, ...extra })
  return app
}

async function entrar(app, usuario = 'ana', clave = CLAVE) {
  const respuesta = await app.inject({
    method: 'POST', url: '/api/auth/login', payload: { usuario, clave },
  })
  return { respuesta, cuerpo: json(respuesta) }
}

const conToken = token => ({ authorization: `Bearer ${token}` })

describe('entrar', () => {
  it('con las credenciales correctas devuelve un token y quién eres', async () => {
    const app = await conSesion()
    const { respuesta, cuerpo } = await entrar(app)

    expect(respuesta.statusCode).toBe(200)
    expect(cuerpo.ok).toBe(true)
    expect(typeof cuerpo.token).toBe('string')
    expect(cuerpo.usuario).toEqual({ id: 'ana', roles: ['operador', 'supervisor'] })
    // En minutos y no como fecha absoluta: el reloj del navegador y el del
    // puente no tienen por qué coincidir (Plan 21 F6).
    expect(cuerpo.expiraEnMinutos).toBeGreaterThan(0)

    await app.close()
  })

  it('con la clave mal, 401 — y sin decir si el usuario existía', async () => {
    const app = await conSesion()
    const malaClave = await entrar(app, 'ana', 'no-es')
    const noExiste = await entrar(app, 'nadie', 'no-es')

    expect(malaClave.respuesta.statusCode).toBe(401)
    expect(noExiste.respuesta.statusCode).toBe(401)
    // El MISMO mensaje para los dos: distinguirlos convierte el login en un
    // buscador de nombres de usuario válidos.
    expect(malaClave.cuerpo.error).toBe(noExiste.cuerpo.error)

    await app.close()
  })

  it('el login no exige sesión, que es lo obvio y por eso se comprueba', async () => {
    // Sin esta excepción declarada en `app.mjs`, la guarda del ámbito pediría
    // un token para pedir un token y no podría entrar nadie nunca.
    const app = await conSesion()
    const { respuesta } = await entrar(app)
    expect(respuesta.statusCode).not.toBe(401)
    await app.close()
  })

  it('con la autenticación apagada responde 503 y nombra la variable', async () => {
    const { app } = await montarApp()
    const respuesta = await app.inject({
      method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', clave: CLAVE },
    })

    // 503 y no 404: la ruta existe, lo que no está es la función.
    expect(respuesta.statusCode).toBe(503)
    expect(json(respuesta).error).toMatch(/AUTH_HABILITADA/)

    await app.close()
  })
})

describe('la guarda con la autenticación encendida', () => {
  it('sin token, 401', async () => {
    const app = await conSesion()
    const respuesta = await app.inject({ method: 'GET', url: '/api/context' })

    expect(respuesta.statusCode).toBe(401)
    expect(json(respuesta).caducado).toBe(false)

    await app.close()
  })

  it('con token válido, pasa', async () => {
    const app = await conSesion()
    const { cuerpo } = await entrar(app)

    const respuesta = await app.inject({
      method: 'GET', url: '/api/context', headers: conToken(cuerpo.token),
    })

    expect(respuesta.statusCode).toBe(200)
    await app.close()
  })

  it('un token CADUCADO se distingue de uno inválido', async () => {
    /*
     * Es la distinción que pide el plan, y no es cosmética: ante un caducado
     * el tablero vuelve a pedir credenciales y sigue; ante uno inválido hay
     * algo mal configurado —otro secreto, otro emisor— y volver a entrar no
     * lo arregla. El cliente tiene que poder distinguirlos SIN leer el texto,
     * por eso viaja `caducado`.
     */
    const app = await conSesion()

    // Firmado con el mismo secreto y ya vencido: es un token nuestro, sólo
    // que fuera de plazo.
    const firmar = createSigner({ key: SECRETO, expiresIn: -1000 })
    const vencido = firmar({ sub: 'ana', roles: ['operador'] })

    const caducado = await app.inject({
      method: 'GET', url: '/api/context', headers: conToken(vencido),
    })
    const invalido = await app.inject({
      method: 'GET', url: '/api/context', headers: conToken('esto.no.es-un-token'),
    })

    expect(caducado.statusCode).toBe(401)
    expect(json(caducado).caducado).toBe(true)
    expect(json(caducado).error).toMatch(/caducado|Vuelve a entrar/i)

    expect(invalido.statusCode).toBe(401)
    expect(json(invalido).caducado).toBe(false)

    await app.close()
  })

  it('un token firmado con OTRO secreto no vale', async () => {
    // La afirmación que hace útil a «con token válido, pasa»: sin esto,
    // aceptar el token bueno podría deberse a no estar verificando nada.
    const app = await conSesion()
    const otro = createSigner({ key: 'otro-secreto-igual-de-largo-pero-distinto' })

    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/context',
      headers: conToken(otro({ sub: 'ana', roles: ['operador'] })),
    })

    expect(respuesta.statusCode).toBe(401)
    await app.close()
  })

  it('las sondas de salud siguen fuera: un despliegue autenticado no se reinicia solo', async () => {
    const app = await conSesion()

    for (const url of ['/api/health/live', '/api/health/ready', '/api/health']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200)
    }

    await app.close()
  })
})

describe('exigirRol', () => {
  it('niega con 403, no con 404: la ruta existe y el problema son los permisos', async () => {
    const app = await conSesion()
    const { cuerpo } = await entrar(app, 'mirona')

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/control/bomba',
      payload: { encender: false },
      headers: conToken(cuerpo.token),
    })

    // Un 404 mandaría a quien lo ve a buscar un fallo de despliegue.
    expect(respuesta.statusCode).toBe(403)
    expect(json(respuesta).error).toMatch(/rol "operador"/)

    await app.close()
  })

  it('con el rol, la misma petición pasa de la guarda', async () => {
    const app = await conSesion()
    const { cuerpo } = await entrar(app, 'ana')

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/control/bomba',
      payload: { encender: false },
      headers: conToken(cuerpo.token),
    })

    // No se afirma 200: lo que decide eso es la planta simulada, y esta prueba
    // es sobre la guarda. Lo que importa es que ya no es 403.
    expect(respuesta.statusCode).not.toBe(403)
    expect(respuesta.statusCode).not.toBe(401)

    await app.close()
  })

  /**
   * ── EL DIARIO ES LECTURA, Y AUN ASÍ PIDE ROL (Plan 25 F1) ─────────
   *
   * Es la excepción declarada al criterio de este backend, donde las lecturas
   * —`GET /api/casos`, `/api/diagnostico`, `GET /api/rag/documentos`— no llevan
   * rol. El diario sí, porque cada entrada trae `ip` y `usuario`: no dice sólo
   * qué le pasó a la instalación, dice **quién lo hizo y desde dónde**.
   *
   * Se prueba con el interruptor encendido porque hoy está apagado, y una
   * guarda que nadie ha ejercido es una promesa, no una guarda.
   */
  it('el diario NIEGA a quien no tiene el rol, aunque sea sólo lectura', async () => {
    const app = await conSesion()
    const { cuerpo } = await entrar(app, 'mirona')

    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/diario',
      headers: conToken(cuerpo.token),
    })

    expect(respuesta.statusCode).toBe(403)

    await app.close()
  })

  it('el diario tampoco se lee SIN token', async () => {
    const app = await conSesion()

    const respuesta = await app.inject({ method: 'GET', url: '/api/diario' })

    expect(respuesta.statusCode).toBe(401)

    await app.close()
  })

  it('con el rol, el diario se lee', async () => {
    const app = await conSesion()
    const { cuerpo } = await entrar(app, 'ana')

    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/diario',
      headers: conToken(cuerpo.token),
    })

    expect(respuesta.statusCode).toBe(200)

    await app.close()
  })

  /**
   * ── EL CUADERNO ES LA SEGUNDA EXCEPCIÓN, POR EL MISMO MOTIVO (Plan 25 F8) ─
   *
   * Cada nota trae `autor`: información de personas, no sólo de la
   * instalación. Mismo criterio que el diario de accionamientos.
   */
  it('el cuaderno NIEGA a quien no tiene el rol', async () => {
    const app = await conSesion()
    const { cuerpo } = await entrar(app, 'mirona')

    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/cuaderno',
      headers: conToken(cuerpo.token),
    })

    expect(respuesta.statusCode).toBe(403)

    await app.close()
  })

  it('con el rol, el cuaderno se lee y se puede escribir en él', async () => {
    const app = await conSesion()
    const { cuerpo } = await entrar(app, 'ana')

    const lectura = await app.inject({ method: 'GET', url: '/api/cuaderno', headers: conToken(cuerpo.token) })
    expect(lectura.statusCode).toBe(200)

    const escritura = await app.inject({
      method: 'POST',
      url: '/api/cuaderno',
      payload: { texto: 'Nota de prueba' },
      headers: conToken(cuerpo.token),
    })
    expect(escritura.statusCode).toBe(201)

    await app.close()
  })
})

describe('renovar y saber quién eres', () => {
  it('renovar devuelve un token nuevo a quien ya tenía uno', async () => {
    const app = await conSesion()
    const { cuerpo } = await entrar(app)

    const respuesta = await app.inject({
      method: 'POST', url: '/api/auth/renovar', headers: conToken(cuerpo.token),
    })

    expect(respuesta.statusCode).toBe(200)
    expect(typeof json(respuesta).token).toBe('string')

    await app.close()
  })

  it('renovar sin sesión es 401: no es una puerta de atrás al login', async () => {
    const app = await conSesion()
    const respuesta = await app.inject({ method: 'POST', url: '/api/auth/renovar' })
    expect(respuesta.statusCode).toBe(401)
    await app.close()
  })

  it('la renovación relee los roles del censo, no los copia del token', async () => {
    /*
     * Si se copiaran, un token viejo se prolongaría a sí mismo con permisos
     * que a esa persona ya se le quitaron — indefinidamente, mientras siguiera
     * renovando.
     */
    const app = await conSesion()

    const firmar = createSigner({ key: SECRETO, expiresIn: '10m' })
    const inflado = firmar({ sub: 'mirona', roles: ['operador', 'supervisor', 'invitado'] })

    const respuesta = await app.inject({
      method: 'POST', url: '/api/auth/renovar', headers: conToken(inflado),
    })

    expect(json(respuesta).usuario.roles).toEqual(['invitado'])

    await app.close()
  })

  it('`/api/auth/yo` dice quién eres, y si hay autenticación siquiera', async () => {
    const app = await conSesion()
    const { cuerpo } = await entrar(app)

    const conSesionAbierta = json(await app.inject({
      method: 'GET', url: '/api/auth/yo', headers: conToken(cuerpo.token),
    }))
    expect(conSesionAbierta.usuario.id).toBe('ana')
    expect(conSesionAbierta.usuario.autenticado).toBe(true)
    expect(conSesionAbierta.habilitada).toBe(true)

    await app.close()

    // Y con el interruptor apagado, que es el estado que se entrega: el
    // tablero puede saberlo sin deducirlo del código de estado de otra ruta.
    const { app: sinAuth } = await montarApp()
    const anonimo = json(await sinAuth.inject({ method: 'GET', url: '/api/auth/yo' }))
    expect(anonimo.usuario.autenticado).toBe(false)
    expect(anonimo.habilitada).toBe(false)

    await sinAuth.close()
  })
})

describe('el arranque se niega a fingir que hay sesión', () => {
  it('sin AUTH_SECRETO no arranca, y dice cómo generar uno', async () => {
    await expect(montarApp({ AUTH_HABILITADA: 'true', AUTH_USUARIOS: censo }))
      .rejects.toThrow(/AUTH_SECRETO/)
  })

  it('con un secreto corto tampoco, y dice por qué importa la longitud', async () => {
    await expect(montarApp({
      AUTH_HABILITADA: 'true', AUTH_SECRETO: 'corto', AUTH_USUARIOS: censo,
    })).rejects.toThrow(/mínimo son 32|fuerza bruta/)
  })

  it('sin usuarios no arranca: exigir sesión sin nadie a quien dársela no deja entrar a nadie', async () => {
    await expect(montarApp({ AUTH_HABILITADA: 'true', AUTH_SECRETO: SECRETO }))
      .rejects.toThrow(/AUTH_USUARIOS/)
  })
})
