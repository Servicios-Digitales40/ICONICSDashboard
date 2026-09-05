/**
 * Ninguna ruta de la API se queda sin la guarda de autenticación.
 *
 * ── POR QUÉ ESTA PRUEBA Y NO UNA REVISIÓN ──────────────────────────
 *
 * Porque el fallo que persigue no se ve leyendo el diff que lo introduce.
 * Alguien añade `POST /api/algo` en un archivo de rutas nuevo, se olvida de la
 * guarda, y todo funciona igual: las pruebas de esa ruta pasan, el tablero la
 * usa, y nadie se entera. La consecuencia llega meses después, el día que se
 * ponga `AUTH_HABILITADA=true` y esa ruta —sólo esa— siga abierta.
 *
 * Antes del Plan 20 F5 la guarda se declaraba ruta por ruta y faltaba en
 * veinte de las treinta y tres. Ahora la pone el ámbito en `app.mjs`, y esto es
 * lo que impide que vuelva a haber un hueco: recorre el inventario REAL de
 * rutas registradas —no una lista escrita a mano aquí, que sería el mismo
 * problema con otro nombre— y comprueba que cada una pasa por `autenticar`.
 *
 * ── CÓMO SE OBSERVA ────────────────────────────────────────────────
 *
 * `autenticar` se resuelve en cada petición (`instancia.autenticar(...)` dentro
 * del hook), así que sustituirlo después de `ready()` por un envoltorio que
 * anota la URL es suficiente para ver por dónde pasa. No hace falta que la
 * autenticación esté implementada: lo que se comprueba es que la guarda CORRE,
 * no lo que decide.
 */
import { describe, expect, it } from 'vitest'
import { montarApp } from '../ayudas.mjs'

/** Las que quedan fuera a propósito, con el motivo. Ver el hook en `app.mjs`. */
const SIN_GUARDA = [/^\/api\/health/]

/**
 * Un cuerpo cualquiera para los métodos que lo llevan.
 *
 * No tiene que ser válido: la validación del esquema corre DESPUÉS de
 * `onRequest`, así que un 400 sirve igual de bien que un 200 para demostrar
 * que la guarda se ejecutó antes.
 */
const CUERPO = { sonda: 'guardas.test.mjs' }

describe('la guarda de autenticación cubre toda la API', () => {
  it('cada ruta de /api/ pasa por `autenticar`, salvo las sondas de salud', async () => {
    const { app } = await montarApp()

    const vistas = new Set()
    const original = app.autenticar
    app.autenticar = async (request, reply) => {
      vistas.add(request.url.split('?')[0])
      return original(request, reply)
    }

    const inventario = app.inventarioApi()
    expect(inventario.length).toBeGreaterThan(20)

    const sinGuarda = []
    for (const { url, metodos } of inventario) {
      if (SIN_GUARDA.some(patron => patron.test(url))) continue

      const metodo = metodos[0]
      await app.inject({
        method: metodo,
        url,
        ...(metodo === 'GET' || metodo === 'DELETE' ? {} : { payload: CUERPO }),
      })

      if (!vistas.has(url)) sinGuarda.push(`${metodo} ${url}`)
    }

    expect(
      sinGuarda,
      `Estas rutas no pasan por la guarda de autenticación:\n  ${sinGuarda.join('\n  ')}\n\n` +
        'Si es a propósito, añádela a SIN_GUARDA con su motivo; si no, comprueba que se ' +
        'registra dentro del ámbito guardado de `app.mjs`.'
    ).toEqual([])

    app.autenticar = original
    await app.close()
  })

  it('las sondas de salud quedan fuera, que es lo que permite reiniciar sin sesión', async () => {
    const { app } = await montarApp()

    let llamada = false
    const original = app.autenticar
    app.autenticar = async (request, reply) => {
      llamada = true
      return original(request, reply)
    }

    const respuesta = await app.inject({ method: 'GET', url: '/api/health/live' })

    expect(respuesta.statusCode).toBe(200)
    expect(llamada).toBe(false)

    app.autenticar = original
    await app.close()
  })

  it('deja `request.usuario` relleno en una ruta de sólo lectura', async () => {
    /*
     * Varias rutas registran `usuario: request.usuario?.id` en sus logs de
     * escritura. Con la guarda sólo en algunas, ese campo salía vacío según por
     * dónde se hubiera entrado — y un registro de auditoría que a veces trae el
     * usuario y a veces no es peor que uno que nunca lo trae, porque el hueco
     * parece un dato.
     */
    const { app } = await montarApp()

    let usuario = null
    const original = app.autenticar
    app.autenticar = async (request, reply) => {
      await original(request, reply)
      usuario = request.usuario
    }

    await app.inject({ method: 'GET', url: '/api/iconics/data?pointName=ac:TDCON/DEMO/SENSORES/NIVEL' })

    expect(usuario).toEqual({ id: 'anonimo', roles: ['operador'], autenticado: false })

    app.autenticar = original
    await app.close()
  })
})
