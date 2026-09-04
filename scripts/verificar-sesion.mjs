#!/usr/bin/env node
/**
 * scripts/verificar-sesion.mjs
 * ------------------------------------------------------------------
 * El ciclo completo del login nativo, por HTTP de verdad (Plan 20 Fase 1).
 *
 * ── QUÉ AÑADE SOBRE `backend/test/rutas/sesion.test.mjs` ───────────
 *
 * Aquélla usa `inject()`, que atiende la petición en memoria sin tocar la pila
 * de red. Es lo correcto para probar contratos, pero hay dos cosas que sólo se
 * ven con un socket de por medio y son justo las que el navegador va a hacer:
 *
 *  1. Que el navegador **acepte y devuelva** la cookie. `Secure` sobre HTTP,
 *     un `Path` mal puesto o un `SameSite` que el cliente no entienda no
 *     rompen `inject()` y sí rompen el login de verdad.
 *  2. Que la sesión **sobreviva a varias peticiones** sobre conexiones
 *     distintas, que es donde se vería un registro que guarda estado donde no
 *     debe.
 *
 * ── QUÉ NO PRUEBA, Y NO ES UN OLVIDO ───────────────────────────────
 *
 * El flujo OIDC contra ICONICS. Corre con `ICONICS_FAKE=true`, así que el
 * login acepta cualquier credencial no vacía. Los cinco saltos reales
 * necesitan red a planta y se comprueban con
 * `node --env-file=.env.local scripts/verificar-antiguedad-historico.mjs`.
 * Fingir aquí un servidor de seguridad sería probar nuestro propio doble.
 */
import assert from 'node:assert/strict'
import { createApp } from '../backend/app.mjs'
import { loadConfig } from '../backend/config.mjs'
import { abrirSesionHttp } from './lib/sesionHttp.mjs'

let fallos = 0

async function check(nombre, fn) {
  try {
    await fn()
    console.log(`  \x1b[32m✓\x1b[0m ${nombre}`)
  } catch (error) {
    fallos += 1
    console.log(`  \x1b[31m✗\x1b[0m ${nombre} — ${error.message}`)
  }
}

const ENTORNO = {
  PORT: '0',
  LOG_LEVEL: 'ERROR',
  ICONICS_FAKE: 'true',
  STATIC_DIR: 'react-dashboard/dist',
}

/** Levanta el puente en un puerto libre y se lo pasa a `fn`, pase lo que pase. */
async function conServidor(fn, extra = {}) {
  const server = await createApp(loadConfig({ ...ENTORNO, ...extra }))
  await server.listen({ port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${server.server.address().port}`

  try {
    return await fn(base)
  } finally {
    await server.close()
  }
}

console.log('\n── El ciclo de la sesión, por HTTP real ────────────────────')

await check('sin sesión, una ruta de datos responde 401 con motivo', async () => {
  await conServidor(async base => {
    const respuesta = await fetch(`${base}/api/casos`)
    assert.equal(respuesta.status, 401)

    const cuerpo = await respuesta.json()
    assert.equal(
      cuerpo.motivo, 'sesion',
      'el frontend distingue por `motivo` si vuelve al login o sólo avisa'
    )
  })
})

await check('la salud NO exige sesión: el monitor no tiene credenciales', async () => {
  await conServidor(async base => {
    for (const ruta of ['/api/health/live', '/api/health', '/api/health/ready']) {
      const respuesta = await fetch(`${base}${ruta}`)
      assert.equal(respuesta.status, 200, `${ruta} debería contestar sin sesión`)
    }
  })
})

await check('login → pregunta → logout → 401', async () => {
  await conServidor(async base => {
    const { pedir, cookie } = await abrirSesionHttp(base, 'ana.tecnica')
    assert.ok(cookie.includes('sesion='), 'el servidor no puso la cookie de sesión')

    const quienSoy = await (await pedir('/api/sesion')).json()
    assert.equal(quienSoy.usuario, 'ana.tecnica')

    // Una lectura de planta de verdad, con el transporte falso detrás.
    const datos = await pedir('/api/casos')
    assert.equal(datos.status, 200, 'con sesión, la ruta de datos tiene que abrir')

    assert.equal((await pedir('/api/sesion', { method: 'DELETE' })).status, 200)
    assert.equal(
      (await pedir('/api/casos')).status, 401,
      'tras el logout la MISMA cookie tiene que dejar de servir'
    )
  })
})

await check('la cookie es httpOnly y SameSite=Strict', async () => {
  await conServidor(async base => {
    const respuesta = await fetch(`${base}/api/sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'ana', contrasena: 'x' }),
    })
    const puesta = (respuesta.headers.getSetCookie?.() ?? []).join(';')

    assert.match(puesta, /HttpOnly/i, 'sin httpOnly, un XSS se lleva la sesión')
    assert.match(puesta, /SameSite=Strict/i, 'SameSite=Strict es lo que cubre el CSRF')
    assert.doesNotMatch(
      puesta, /Secure/i,
      'en desarrollo (HTTP) `Secure` impediría que el navegador devolviera la cookie'
    )
  })
})

await check('dos sesiones a la vez no se pisan', async () => {
  await conServidor(async base => {
    const ana = await abrirSesionHttp(base, 'ana.tecnica')
    const beto = await abrirSesionHttp(base, 'beto.tecnico')

    assert.notEqual(ana.cookie, beto.cookie, 'dos sesiones con la misma llave')

    const [unaA, unaB] = await Promise.all([
      ana.pedir('/api/sesion').then(r => r.json()),
      beto.pedir('/api/sesion').then(r => r.json()),
    ])
    assert.equal(unaA.usuario, 'ana.tecnica')
    assert.equal(unaB.usuario, 'beto.tecnico')

    // Cerrar una no puede tocar la otra: es el fallo que un registro con
    // estado mal colocado produciría, y no daría error, sólo expulsaría a
    // alguien sin motivo.
    await ana.pedir('/api/sesion', { method: 'DELETE' })
    assert.equal((await ana.pedir('/api/casos')).status, 401)
    assert.equal((await beto.pedir('/api/casos')).status, 200)
  })
})

await check('la salud cuenta las sesiones abiertas', async () => {
  await conServidor(async base => {
    const antes = (await (await fetch(`${base}/api/health`)).json()).sesionesActivas
    assert.equal(antes, 0, 'un puente recién levantado no tiene sesiones')

    await abrirSesionHttp(base, 'ana')
    await abrirSesionHttp(base, 'beto')

    const salud = await (await fetch(`${base}/api/health`)).json()
    assert.equal(salud.sesionesActivas, 2)
    assert.equal(
      'tokenValid' in salud, false,
      '`tokenValid` se retiró: ya no hay UN token, hay uno por persona'
    )
  })
})

await check('credenciales vacías no abren nada', async () => {
  await conServidor(async base => {
    for (const cuerpo of [{ usuario: '', contrasena: 'x' }, { usuario: 'ana', contrasena: '' }, {}]) {
      const respuesta = await fetch(`${base}/api/sesion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      assert.equal(respuesta.status, 400, `debería rechazar ${JSON.stringify(cuerpo)}`)
    }

    const salud = await (await fetch(`${base}/api/health`)).json()
    assert.equal(salud.sesionesActivas, 0, 'un login inválido no puede dejar sesión detrás')
  })
})

await check('al llegar al tope, 503 y no 401', async () => {
  await conServidor(async base => {
    await abrirSesionHttp(base, 'uno')
    await abrirSesionHttp(base, 'dos')

    const tercera = await fetch(`${base}/api/sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'tres', contrasena: 'x' }),
    })

    assert.equal(
      tercera.status, 503,
      'un 401 mandaría al técnico a revisar una contraseña que está bien'
    )
    assert.match((await tercera.json()).error, /SESION_MAX/)
  }, { SESION_MAX: '2' })
})

if (fallos > 0) {
  console.log(`\n\x1b[31m\x1b[1m${fallos} comprobación(es) fallida(s)\x1b[0m`)
  console.log('\x1b[90mRevisa backend/sesiones/registro.mjs, backend/routes/sesionRoutes.mjs y ' +
    'backend/http/plugins/autenticacion.mjs.\x1b[0m')
  process.exit(1)
}

console.log('\n\x1b[32m\x1b[1m8 comprobaciones correctas: el login nativo se mantiene.\x1b[0m')
