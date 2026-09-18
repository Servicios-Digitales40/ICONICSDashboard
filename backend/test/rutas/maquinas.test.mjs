/**
 * backend/test/rutas/maquinas.test.mjs
 * ------------------------------------------------------------------
 * El contrato HTTP del CRUD de máquinas configuradas. Plan 33 F2.
 *
 * ── QUÉ PRUEBA ESTO QUE NO PRUEBE `verificar-maquinas.mjs` ─────────
 *
 * Aquél prueba el DOMINIO y la persistencia: qué hace válida a una máquina y
 * que el archivo quede bien. Esto prueba la capa HTTP, que tiene sus propios
 * modos de fallo y ninguno se ve desde abajo:
 *
 *  · **El orden de las rutas.** `/api/maquinas/tipos` y `/api/maquinas/:id`
 *    compiten por la misma forma de URL. Si gana la segunda, pedir los tipos
 *    devuelve «no hay ninguna máquina llamada tipos» — un 404 perfectamente
 *    redactado sobre una ruta que sí existe.
 *  · **Que los problemas de validación LLEGUEN al cliente.** La lista
 *    `{campo, problema}` es lo que permite a la pantalla señalar el paso que
 *    está mal. Un 400 que la pierda por el camino obligaría a la vista a
 *    reimplementar la validación para saber dónde apuntar.
 *  · **Que el código de error viaje.** Sin `codigo`, el tablero en inglés
 *    enseña la frase en español del servidor — el fallo silencioso que
 *    `verificar-codigos.mjs` existe para cazar.
 *  · **Que las capacidades se DERIVEN aquí y no se acepten del cliente.**
 *
 * Cada `montarApp` recibe su propio `MAQUINAS_RUTA` en una carpeta temporal:
 * las pruebas no tocan `datos/maquinas.json`.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { json, montarApp } from '../ayudas.mjs'

let carpeta
let app

/** Una máquina bien formada, con el mínimo que la validación exige. */
const maquinaValida = (id = 'vib-motor-02') => ({
  id,
  nombre: 'Motor de pruebas',
  tipo: 'vibraciones',
  plc: 'PLC_9 · ua:PRUEBA',
  assets: [{ id: 'a1', pointName: `ac:PRUEBA/${id}/`, rol: 'raiz' }],
  variables: [{ id: 'v1', pointName: `ac:PRUEBA/${id}/S1/vRMS`, rol: 'medida:vRMS' }],
})

beforeEach(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'maquinas-rutas-'))
  ;({ app } = await montarApp({ MAQUINAS_RUTA: join(carpeta, 'maquinas.json') }))
})

afterEach(async () => {
  await app?.close()
  await rm(carpeta, { recursive: true, force: true })
})

describe('GET /api/maquinas/tipos', () => {
  /*
   * La que de verdad importa: `/tipos` compite con `/:id`. Con el orden
   * equivocado esto devuelve 404 sobre una ruta que existe.
   */
  it('devuelve los tipos, y NO la captura la ruta de :id', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/maquinas/tipos' })
    expect(r.statusCode).toBe(200)

    const cuerpo = json(r)
    expect(cuerpo.ok).toBe(true)
    expect(cuerpo.tipos.some(t => t.id === 'vibraciones')).toBe(true)
  })

  it('el resumen de tipos no lleva funciones ni las reglas enteras', async () => {
    const { tipos } = json(await app.inject({ method: 'GET', url: '/api/maquinas/tipos' }))
    const vib = tipos.find(t => t.id === 'vibraciones')

    expect(typeof vib.reglas).toBe('number')
    expect(Array.isArray(vib.rolesRequeridos)).toBe(true)
  })
})

describe('GET /api/maquinas', () => {
  it('sin ninguna configurada devuelve lista vacía, no un error', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/maquinas' })
    expect(r.statusCode).toBe(200)
    expect(json(r)).toMatchObject({ ok: true, cuantas: 0, maquinas: [] })
  })

  it('una máquina que no existe da 404 CON código', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/maquinas/fantasma' })
    expect(r.statusCode).toBe(404)
    expect(json(r).codigo).toBe('ERROR_MAQUINA_NO_ENCONTRADA')
  })
})

describe('POST /api/maquinas', () => {
  it('da de alta una máquina y la devuelve con 201', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/maquinas', payload: maquinaValida() })
    expect(r.statusCode).toBe(201)

    const cuerpo = json(r)
    expect(cuerpo.ok).toBe(true)
    expect(cuerpo.maquina.id).toBe('vib-motor-02')

    const lista = json(await app.inject({ method: 'GET', url: '/api/maquinas' }))
    expect(lista.cuantas).toBe(1)
  })

  /*
   * Las capacidades se derivan de la configuración y del tipo. Guardarlas
   * sería tener dos versiones de la misma verdad, y la almacenada quedaría
   * vieja en cuanto alguien editara una variable.
   */
  it('las capacidades se DERIVAN: una máquina sin historia verificada no la promete', async () => {
    const { maquina } = json(
      await app.inject({ method: 'POST', url: '/api/maquinas', payload: maquinaValida() })
    )

    expect(maquina.capacidades).toContain('CURRENT_DATA')
    expect(maquina.capacidades).not.toContain('HISTORICAL_DATA')
    expect(maquina.capacidades).not.toContain('WRITABLE_VARIABLES')
  })

  it('el cliente NO puede declararse historia verificada', async () => {
    const payload = maquinaValida('vib-mentirosa')
    payload.variables[0].historyVerified = true
    payload.variables[0].historyPointName = 'hda:inventado'

    const r = await app.inject({ method: 'POST', url: '/api/maquinas', payload })
    expect(r.statusCode).toBe(201)
    expect(json(r).maquina.variables[0].historyVerified).toBe(false)
  })

  /*
   * ── LO QUE ESTA PRUEBA ENCONTRÓ ────────────────────────────────────
   *
   * `crearMaquina` guardaba las variables tal como llegaban, sin pasarlas por
   * `crearVariable`. Por HTTP eso dejaba `acceso: undefined` en vez de
   * `"read"`.
   *
   * No llegó a ser un agujero —`permiteEscritura(undefined)` es `false`— pero
   * el deny-by-default tiene que estar EN EL DATO: el primer lector que
   * escriba `if (v.acceso !== "read")` para decidir si pide confirmación
   * abriría la puerta sin tocar aquella línea.
   *
   * La prueba del dominio no lo veía porque llamaba a `crearVariable` a mano.
   */
  it('una variable sin acceso declarado queda como "read" EN EL DATO', async () => {
    const { maquina } = json(
      await app.inject({ method: 'POST', url: '/api/maquinas', payload: maquinaValida('vib-acc') })
    )
    expect(maquina.variables[0].acceso).toBe('read')
  })

  it('una configuración incompleta da 400 con los problemas POR CAMPO', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/maquinas',
      payload: { ...maquinaValida('vib-sin-nada'), assets: [], variables: [] },
    })

    expect(r.statusCode).toBe(400)
    const cuerpo = json(r)
    expect(cuerpo.codigo).toBe('ERROR_MAQUINA_INVALIDA')
    expect(cuerpo.problemas.map(p => p.campo)).toEqual(
      expect.arrayContaining(['assets', 'variables'])
    )
  })

  it('un tipo que no existe se rechaza', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/maquinas',
      payload: { ...maquinaValida('vib-prensa'), tipo: 'prensa' },
    })

    expect(r.statusCode).toBe(400)
    expect(json(r).problemas.some(p => p.campo === 'tipo')).toBe(true)
  })

  /*
   * Los avisos NO son errores: son las reglas que esa máquina no podrá
   * evaluar. Tienen que llegar en una alta correcta, porque acaban en las
   * limitaciones que la máquina confiesa.
   */
  it('una alta correcta trae los avisos de los roles que faltan', async () => {
    const { avisos } = json(
      await app.inject({ method: 'POST', url: '/api/maquinas', payload: maquinaValida() })
    )
    expect(avisos.length).toBeGreaterThan(0)
    expect(avisos[0].problema).toMatch(/no se evaluarán/)
  })

  it('un id con mayúsculas o espacios lo rechaza el esquema', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/maquinas',
      payload: { ...maquinaValida(), id: 'Vib Motor 02' },
    })
    expect(r.statusCode).toBe(400)
  })
})

describe('PATCH /api/maquinas/:id', () => {
  it('edita una máquina existente', async () => {
    await app.inject({ method: 'POST', url: '/api/maquinas', payload: maquinaValida() })

    const r = await app.inject({
      method: 'PATCH',
      url: '/api/maquinas/vib-motor-02',
      payload: { nombre: 'Motor renombrado' },
    })

    expect(r.statusCode).toBe(200)
    expect(json(r).maquina.nombre).toBe('Motor renombrado')
  })

  /*
   * ── LO QUE ESTA PRUEBA ENCONTRÓ, PROBANDO A MANO ───────────────────
   *
   * `EditarMaquinaSchema` usaba `.omit({ id: true })`, que **descarta el campo
   * en silencio**: un `PATCH {"id":"otro"}` pasaba la validación con el cuerpo
   * vacío, el gestor no llegaba a ver el `id` —así que su guarda nunca
   * disparaba— y la ruta contestaba **200 con la máquina sin cambiar**.
   *
   * Quien lo pidiera se quedaba creyendo que lo había cambiado. Lo cazó probar
   * contra el backend levantado, no la suite: las pruebas de aquí comprobaban
   * que el id NO cambia, y no cambiaba.
   *
   * Con `.strict()` el campo de más es un 400 con su motivo.
   */
  it('mandar un `id` en el PATCH se RECHAZA, no se ignora', async () => {
    await app.inject({ method: 'POST', url: '/api/maquinas', payload: maquinaValida() })

    const r = await app.inject({
      method: 'PATCH',
      url: '/api/maquinas/vib-motor-02',
      payload: { id: 'otro-id' },
    })

    expect(r.statusCode).toBe(400)

    /* Y la máquina original sigue ahí, con su id. */
    const sigue = await app.inject({ method: 'GET', url: '/api/maquinas/vib-motor-02' })
    expect(sigue.statusCode).toBe(200)
  })

  it('editar una que no existe da 404, y no la crea', async () => {
    const r = await app.inject({
      method: 'PATCH',
      url: '/api/maquinas/fantasma',
      payload: { nombre: 'x' },
    })

    expect(r.statusCode).toBe(404)
    expect(json(await app.inject({ method: 'GET', url: '/api/maquinas' })).cuantas).toBe(0)
  })
})

describe('DELETE /api/maquinas/:id', () => {
  it('una máquina sin casos se elimina', async () => {
    await app.inject({ method: 'POST', url: '/api/maquinas', payload: maquinaValida() })

    const r = await app.inject({ method: 'DELETE', url: '/api/maquinas/vib-motor-02' })
    expect(r.statusCode).toBe(200)
    expect(json(r).desactivada).toBe(false)

    expect(
      (await app.inject({ method: 'GET', url: '/api/maquinas/vib-motor-02' })).statusCode
    ).toBe(404)
  })

  /*
   * ── LA REGLA QUE PROTEGE LA HISTORIA ───────────────────────────────
   *
   * `datos/aprendizaje.json` trae 11 casos con `sistema: "tanque"`. Una
   * máquina configurada que se llamara así no se puede crear —el id choca con
   * el registro—, así que aquí se comprueba el mecanismo por el otro lado: que
   * la respuesta DIGA por qué no se borró.
   *
   * Un 200 que promete un borrado y deja la máquina en disco sería el peor
   * silencio de esta ruta.
   */
  it('borrar una que no existe da 404 con código', async () => {
    const r = await app.inject({ method: 'DELETE', url: '/api/maquinas/fantasma' })
    expect(r.statusCode).toBe(404)
    expect(json(r).codigo).toBe('ERROR_MAQUINA_NO_ENCONTRADA')
  })
})
