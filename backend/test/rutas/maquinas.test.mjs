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

import { createGestorMaquinas } from '../../ia/indices/maquinas.mjs'
import { ID_ESPEJO, configuracionEspejo } from '../../../scripts/lib/configuracionEspejo.mjs'
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

/*
 * ── LEER SÍ; DECIDIR NO (Plan 37 F1) ─────────────────────────────────
 *
 * El tablero de una máquina configurada lo mira cualquiera con sesión, y para
 * pintarlo necesita su configuración. Un visualizador lee la lista; lo que no
 * puede es dar de alta, editar ni borrar.
 */
describe('un visualizador y las máquinas configuradas', () => {
  it('puede LEER la lista y la ficha, y no puede escribir', async () => {
    await app.close()
    ;({ app } = await montarApp({
      MAQUINAS_RUTA: join(carpeta, 'maquinas.json'),
      AUTH_HABILITADA: 'true',
      AUTH_SECRETO: 'clave-de-pruebas-suficientemente-larga-32',
      AUTH_USUARIOS: 'miron:visualizador:scrypt$00$00;admin:administrador:scrypt$00$00',
    }))
    const admin = app.jwt.sign({ sub: 'admin', roles: ['administrador'] })
    const miron = app.jwt.sign({ sub: 'miron', roles: ['visualizador'] })

    await app.inject({
      method: 'POST', url: '/api/maquinas', payload: maquinaValida(),
      headers: { authorization: `Bearer ${admin}` },
    })

    const lista = await app.inject({ method: 'GET', url: '/api/maquinas', headers: { authorization: `Bearer ${miron}` } })
    expect(lista.statusCode).toBe(200)
    expect(json(lista).cuantas).toBe(1)

    const ficha = await app.inject({ method: 'GET', url: '/api/maquinas/vib-motor-02', headers: { authorization: `Bearer ${miron}` } })
    expect(ficha.statusCode).toBe(200)

    for (const [method, url, payload] of [
      ['POST', '/api/maquinas', maquinaValida('otra')],
      ['PATCH', '/api/maquinas/vib-motor-02', { nombre: 'x' }],
      ['DELETE', '/api/maquinas/vib-motor-02', undefined],
      ['POST', '/api/maquinas/vib-motor-02/verificar', undefined],
    ]) {
      const r = await app.inject({ method, url, payload, headers: { authorization: `Bearer ${miron}` } })
      expect(r.statusCode, `${method} ${url}`).toBe(403)
    }
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

  /*
   * F9 del backlog de frontend (22-09-2026). `limitaciones` mezcla las que
   * escribió una persona con las que deriva la validación; quien EDITA
   * necesita las suyas aparte, o las derivadas se re-grabarían como propias.
   */
  it('las limitaciones PROPIAS viajan aparte de la lista mezclada', async () => {
    const propia = 'El motor gira sin carga acoplada.'
    const { maquina } = json(
      await app.inject({ method: 'POST', url: '/api/maquinas', payload: { ...maquinaValida(), limitaciones: [propia] } })
    )

    expect(maquina.limitacionesPropias).toEqual([propia])
    expect(maquina.limitaciones).toContain(propia)
    /* Y la mezclada trae además lo que la validación sabe: es más larga. */
    expect(maquina.limitaciones.length).toBeGreaterThan(1)
    expect(maquina.limitaciones.filter((l) => l === propia)).toHaveLength(1)
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

  /*
   * ── LO CARO DE EDITAR: NO PERDER LO QUE YA SE SABÍA (Plan 36 F3) ──
   *
   * La pantalla manda la lista de variables ENTERA y sin `historyVerified`
   * —el esquema lo rechaza a propósito—. Antes de `fusionarVariables`, un
   * PATCH para añadir una variable dejaba las demás sin verificación, sin
   * error: la máquina seguía válida, sólo que ciega para su pasado.
   */
  it('añadir una variable CONSERVA la verificación de las que ya estaban', async () => {
    const payload = maquinaValida()
    payload.variables[0].historyPointName = 'hda:g:vRMS_S1'
    await app.inject({ method: 'POST', url: '/api/maquinas', payload })

    /* Se gana la verificación por el camino que sí puede darla: anotándola
       como lo haría el sondeo. */
    const gestorMaquinas = createGestorMaquinas({ ruta: join(carpeta, 'maquinas.json') })
    const guardada = await gestorMaquinas.obtener('vib-motor-02')
    await gestorMaquinas.anotarRevision('vib-motor-02', {
      estado: guardada.estado,
      variables: guardada.variables.map(v => ({ ...v, historyVerified: true })),
    })

    const r = await app.inject({
      method: 'PATCH',
      url: '/api/maquinas/vib-motor-02',
      payload: {
        variables: [
          { id: 'v1', pointName: 'ac:PRUEBA/vib-motor-02/S1/vRMS', historyPointName: 'hda:g:vRMS_S1', rol: 'medida:vRMS' },
          { id: 'v2', pointName: 'ac:PRUEBA/vib-motor-02/S1/aRMS', rol: 'medida:aRMS' },
        ],
      },
    })
    expect(r.statusCode).toBe(200)

    const { variables } = json(r).maquina
    expect(variables).toHaveLength(2)
    expect(variables.find(v => v.id === 'v1').historyVerified).toBe(true)
    /* La nueva nace con los valores seguros, como en el alta. */
    const nueva = variables.find(v => v.id === 'v2')
    expect(nueva.historyVerified).toBe(false)
    expect(nueva.acceso).toBe('read')
  })

  /*
   * Destapado usándola el 21-09-2026: una máquina comprobada con 24 variables,
   * editada a 44, seguía diciendo `VALID` con 20 en `UNKNOWN`. El veredicto
   * era sobre otra lista.
   */
  it('añadir un punto que nadie ha comprobado devuelve la máquina a UNKNOWN; re-guardar igual no', async () => {
    await app.inject({ method: 'POST', url: '/api/maquinas', payload: maquinaValida() })
    await app.inject({ method: 'POST', url: '/api/maquinas/vib-motor-02/verificar' })
    const comprobada = json(await app.inject({ method: 'GET', url: '/api/maquinas/vib-motor-02' }))
    expect(comprobada.maquina.estado).not.toBe('UNKNOWN')

    /* La misma lista, otra vez: el veredicto sigue valiendo. */
    const igual = await app.inject({
      method: 'PATCH',
      url: '/api/maquinas/vib-motor-02',
      payload: { variables: [{ id: 'v1', pointName: 'ac:PRUEBA/vib-motor-02/S1/vRMS', rol: 'medida:vRMS' }] },
    })
    expect(json(igual).maquina.estado).toBe(comprobada.maquina.estado)

    /* Un punto nuevo: el veredicto ya no habla de esta máquina. */
    const ampliada = await app.inject({
      method: 'PATCH',
      url: '/api/maquinas/vib-motor-02',
      payload: {
        variables: [
          { id: 'v1', pointName: 'ac:PRUEBA/vib-motor-02/S1/vRMS', rol: 'medida:vRMS' },
          { id: 'v2', pointName: 'ac:PRUEBA/vib-motor-02/S1/aRMS', rol: 'medida:aRMS' },
        ],
      },
    })
    expect(json(ampliada).maquina.estado).toBe('UNKNOWN')
    /* Pero la variable que sí se comprobó conserva su propio estado. */
    expect(json(ampliada).maquina.variables.find(v => v.id === 'v1').estado).not.toBe('UNKNOWN')
  })

  it('cambiar el punto histórico de una variable RETIRA su verificación', async () => {
    const payload = maquinaValida()
    payload.variables[0].historyPointName = 'hda:g:vRMS_S1'
    await app.inject({ method: 'POST', url: '/api/maquinas', payload })

    const gestorMaquinas = createGestorMaquinas({ ruta: join(carpeta, 'maquinas.json') })
    const guardada = await gestorMaquinas.obtener('vib-motor-02')
    await gestorMaquinas.anotarRevision('vib-motor-02', {
      estado: guardada.estado,
      variables: guardada.variables.map(v => ({ ...v, historyVerified: true })),
    })

    const r = await app.inject({
      method: 'PATCH',
      url: '/api/maquinas/vib-motor-02',
      payload: {
        variables: [
          { id: 'v1', pointName: 'ac:PRUEBA/vib-motor-02/S1/vRMS', historyPointName: 'hda:g:OTRA', rol: 'medida:vRMS' },
        ],
      },
    })
    expect(r.statusCode).toBe(200)
    /* Lo que se sondeó era OTRA serie: la nueva no puede heredar su marca. */
    expect(json(r).maquina.variables[0].historyVerified).toBe(false)
  })

  it('las tres raíces (`arboles`) se guardan y vuelven, para reabrir la máquina donde se marcó', async () => {
    const arboles = { enVivo: 'ac:PRUEBA/vib-motor-02/', historico: 'hda:g:', alarmas: null }
    const r = await app.inject({
      method: 'POST',
      url: '/api/maquinas',
      payload: { ...maquinaValida(), arboles },
    })
    expect(r.statusCode).toBe(201)
    expect(json(r).maquina.arboles).toEqual(arboles)

    const leida = json(await app.inject({ method: 'GET', url: '/api/maquinas/vib-motor-02' }))
    expect(leida.maquina.arboles).toEqual(arboles)
  })
})

/*
 * ── EL DESCUBRIMIENTO CONTRA EL TRANSPORTE FALSO (Plan 36 F1) ──────
 *
 * Hasta el Plan 36 no se podía probar aquí: el fake devolvía todos los
 * puntos como cadenas planas y el descubridor veía un árbol VACÍO sin error.
 * Con el `browse` jerárquico, la ruta entera se ejercita sin planta.
 */
describe('POST /api/maquinas/descubrir', () => {
  it('propone las variables de la máquina de vibraciones recorriendo el fake', async () => {
    const B = String.fromCharCode(92)
    const r = await app.inject({
      method: 'POST',
      url: '/api/maquinas/descubrir',
      payload: {
        raizEnVivo: 'ac:TDCON/DEMO_VIBRACIONES/Vibraciones/',
        raizHistorico: `hda:${B}Configuration${B}DEMO_VIBRACIONES${B}`,
        areaAlarmas: 'ae:/DEMO VIBRACIONES',
        tipo: 'vibraciones',
      },
    })
    expect(r.statusCode).toBe(200)

    const cuerpo = json(r)
    expect(cuerpo.estado).toBe('VALID')
    expect(cuerpo.resumen.enVivo).toBeGreaterThan(50)
    expect(cuerpo.resumen.emparejados).toBeGreaterThan(0)
    expect(cuerpo.resumen.conRol).toBeGreaterThan(50)
    expect(cuerpo.alarmas.contadores.length).toBeGreaterThanOrEqual(4)

    /* Toda propuesta nace sin promesas. */
    for (const v of cuerpo.variables) {
      expect(v.historyVerified).toBe(false)
      expect(v.acceso).toBe('read')
    }
    const vrms = cuerpo.variables.find(v => v.id === 'vRMS_S1')
    expect(vrms.rol).toBe('medida:vRMS')
    expect(vrms.assetId).toBe('S1')
    expect(vrms.historyPointName).toContain('S1:vRMS_S1')
  })

  it('una raíz que no existe es UNKNOWN con motivo, no una máquina sin variables', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/maquinas/descubrir',
      payload: { raizEnVivo: 'ac:NO/EXISTE/' },
    })
    expect(r.statusCode).toBe(200)
    const cuerpo = json(r)
    expect(cuerpo.estado).toBe('UNKNOWN')
    expect(cuerpo.variables).toEqual([])
    expect(cuerpo.motivo).toMatch(/No se pudo recorrer/)
  })
})

/*
 * ── LA DERIVA, POR HTTP (Plan 33 F8) ───────────────────────────────
 *
 * `verificar-deriva-iconics.mjs` prueba el VEREDICTO con un cliente de
 * mentira. Esto prueba lo que sólo se ve desde la ruta: que el resultado se
 * anote —o no—, y qué se le devuelve a la pantalla.
 *
 * ── POR QUÉ AQUÍ NO SE AFIRMA EL VEREDICTO ─────────────────────────
 *
 * `montarApp` levanta con `ICONICS_FAKE=true`, y el transporte falso
 * **devuelve cualquier punto que le pidan** —un tag fuera de todos los
 * catálogos sale con `value: null` y calidad buena, ver `readPoints` en
 * `fakeClient.mjs`—. O sea: contra el falso, una configuración inventada sale
 * `VALID`, y eso es correcto: para ese servidor, esos puntos existen.
 *
 * Además tiene un `CAOS.ausente` aleatorio que omite puntos de vez en cuando,
 * así que afirmar `VALID` a secas haría esta prueba intermitente — el defecto
 * que costó la tanda del 17-09.
 *
 * Así que aquí se comprueba el CONTRATO DE LA RUTA —qué campos vuelven, que se
 * anote, que un 404 sea 404— y el VEREDICTO se prueba en
 * `verificar-deriva-iconics.mjs`, con un cliente de mentira que sí puede
 * simular un punto borrado.
 */
describe('POST /api/maquinas/:id/verificar', () => {
  it('una máquina que no existe da 404 con código', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/maquinas/fantasma/verificar' })
    expect(r.statusCode).toBe(404)
    expect(json(r).codigo).toBe('ERROR_MAQUINA_NO_ENCONTRADA')
  })

  it('comprueba, devuelve un estado conocido y lo ANOTA', async () => {
    await app.inject({ method: 'POST', url: '/api/maquinas', payload: maquinaValida() })

    const r = await app.inject({ method: 'POST', url: '/api/maquinas/vib-motor-02/verificar' })
    expect(r.statusCode).toBe(200)

    const cuerpo = json(r)
    expect(['VALID', 'DEGRADED', 'INVALID']).toContain(cuerpo.estado)
    expect(cuerpo.anotado).toBe(true)

    /* Y queda en disco, para que la pantalla lo vea sin volver a comprobar. La
       máquina nace `UNKNOWN`, así que haber salido de ahí ya dice que la
       comprobación llegó al archivo. */
    const guardada = json(await app.inject({ method: 'GET', url: '/api/maquinas/vib-motor-02' }))
    expect(guardada.maquina.estado).not.toBe('UNKNOWN')
    expect(guardada.maquina.revisada).toBeTruthy()
  })

  it('la respuesta trae el contrato entero: motivo, resumen y ausentes', async () => {
    await app.inject({ method: 'POST', url: '/api/maquinas', payload: maquinaValida() })

    const cuerpo = json(
      await app.inject({ method: 'POST', url: '/api/maquinas/vib-motor-02/verificar' })
    )

    expect(typeof cuerpo.motivo).toBe('string')
    expect(cuerpo.motivo.length).toBeGreaterThan(0)
    expect(cuerpo.resumen.total).toBe(1)
    expect(cuerpo.resumen.presentes + cuerpo.resumen.ausentes).toBe(1)

    /*
     * `ausentes` trae SÓLO las que faltan —devolver las 73 para decir que 70
     * están bien es ruido— y cada una con su `pointName`: quien tiene que ir a
     * buscarlas necesita el nombre, no el conteo.
     */
    expect(cuerpo.ausentes).toHaveLength(cuerpo.resumen.ausentes)
    for (const v of cuerpo.ausentes) expect(v.pointName).toBeTruthy()
  })
})

describe('POST /api/maquinas/:id/sondear', () => {
  /*
   * Plan 42 F2. Se da de alta la ESPEJO —la fixture de la máquina de
   * vibraciones— porque el falso sólo simula la serie de una máquina que esté
   * en el registro, y el alta la registra. El falso sirve todas sus series
   * sobre UNA rejilla, así que una bandera plana (`alarma_S2`: el apoyo 2 no
   * supera la banda de alarma) comparte marcas con una medida que varía. Es
   * el caso medido en planta el 22-09-2026, servido sin red.
   */
  const espejo = () => {
    const { configurada } = configuracionEspejo()
    /* Lo que el alta no acepta: el estado lo pone la validación, y `arboles`
       nulo no es «sin árboles», es «no viene». */
    const { estado: _estado, arboles: _arboles, ...alta } = configurada
    return alta
  }
  const ID = ID_ESPEJO

  it('una bandera constante con las marcas de una propia sale REGISTRADA, y la causa viaja', async () => {
    const alta = await app.inject({ method: 'POST', url: '/api/maquinas', payload: espejo() })
    expect(alta.statusCode).toBe(201)

    const cuerpo = json(await app.inject({ method: 'POST', url: `/api/maquinas/${ID}/sondear` }))
    expect(cuerpo.ok).toBe(true)
    expect(cuerpo.resumen.constantes).toBeGreaterThan(0)
    expect(cuerpo.resumen.verificadas).toBeGreaterThan(cuerpo.resumen.constantes)
    expect(cuerpo.motivo).toMatch(/\d+ propias, \d+ constantes/)
    expect(cuerpo.anotado).toBe(true)
    /* Las registradas están verificadas, así que NO van entre las pendientes. */
    expect(cuerpo.pendientes.some((p) => p.causa === 'registrada-constante')).toBe(false)

    /* Y queda en disco CON el cómo: es lo que `construirSistema` necesita para
       redactar la limitación de que no se distingue de otra constante. */
    const { maquina } = json(await app.inject({ method: 'GET', url: `/api/maquinas/${ID}` }))
    const constantes = maquina.variables.filter((v) => v.historyVerifiedComo === 'registrada-constante')
    expect(constantes).toHaveLength(cuerpo.resumen.constantes)
    for (const v of constantes) expect(v.historyVerified).toBe(true)
    expect(maquina.variables.find((v) => v.id === 'vRMS_S1').historyVerifiedComo).toBe('serie-propia')
    /* Y la CAUSA queda persistida con el veredicto (Plan 42.5 D11): la que el
       sondeo dio para cada variable, verificada o no, sobrevive a recargar. */
    expect(maquina.variables.find((v) => v.id === 'vRMS_S1').historyCausa).toBe('serie-propia')
    for (const c of constantes) expect(c.historyCausa).toBe('registrada-constante')
    for (const p of cuerpo.pendientes) {
      const persistida = maquina.variables.find((v) => v.id === p.id)
      expect(persistida.historyCausa).toBe(p.causa)
      expect(persistida.historyCompartidaCon).toEqual(p.compartidaCon ?? [])
    }
    expect(maquina.capacidades).toContain('HISTORICAL_DATA')
    const limitacion = maquina.limitaciones.find((l) => /constantes/.test(l) && /REGISTRADAS/.test(l))
    expect(limitacion).toBeTruthy()
    expect(limitacion).toContain(constantes[0].id)
  })

  it('editar la máquina CONSERVA el cómo de la verificación; cambiar el punto histórico lo retira', async () => {
    await app.inject({ method: 'POST', url: '/api/maquinas', payload: espejo() })
    const sondeo = json(await app.inject({ method: 'POST', url: `/api/maquinas/${ID}/sondear` }))
    expect(sondeo.resumen.constantes).toBeGreaterThan(0)

    const { variables } = espejo()
    let r = json(await app.inject({ method: 'PATCH', url: `/api/maquinas/${ID}`, payload: { variables } }))
    const constantes = r.maquina.variables.filter((v) => v.historyVerifiedComo === 'registrada-constante')
    expect(constantes).toHaveLength(sondeo.resumen.constantes)
    for (const c of constantes) expect(c.historyCausa).toBe('registrada-constante')

    const objetivo = variables.find((v) => v.id === constantes[0].id)
    objetivo.historyPointName = 'hda:\\Configuration\\OTRO_GRUPO\\X:Y'
    r = json(await app.inject({ method: 'PATCH', url: `/api/maquinas/${ID}`, payload: { variables } }))
    const retirada = r.maquina.variables.find((v) => v.id === objetivo.id)
    expect(retirada.historyVerified).toBe(false)
    expect(retirada.historyVerifiedComo).toBe(null)
    /* La causa se retira con el cómo: lo sondeado fue OTRA serie. */
    expect(retirada.historyCausa).toBe(null)
    expect(retirada.historyCompartidaCon).toEqual([])
  })

  it('el cliente NO puede declarar el cómo de la verificación', async () => {
    const payload = maquinaValida('vib-mentirosa-2')
    payload.variables[0].historyPointName = 'hda:inventado'
    payload.variables[0].historyVerified = true
    payload.variables[0].historyVerifiedComo = 'registrada-constante'
    payload.variables[0].historyCausa = 'serie-propia'
    const { maquina } = json(await app.inject({ method: 'POST', url: '/api/maquinas', payload }))
    expect(maquina.variables[0].historyVerified).toBe(false)
    expect(maquina.variables[0].historyVerifiedComo).toBe(null)
    expect(maquina.variables[0].historyCausa).toBe(null)
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
   * La bitácora de este despliegue nació con casos de `sistema: "tanque"`
   * (Plan 42.5 F3 la puede vaciar), y una máquina configurada que se llamara
   * así no se puede crear —el id choca con el registro—, así que aquí se
   * comprueba el mecanismo por el otro lado: que la respuesta DIGA por qué no
   * se borró. Con la bitácora vacía, toda máquina pasa a ser borrable de
   * verdad: es el comportamiento esperado, no un fallo.
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

describe('assets con nombre y alias (Plan 42.5 F6, D15)', () => {
  const conApoyo = () => {
    const m = maquinaValida()
    m.assets.push({
      id: 'S1', pointName: 'ac:PRUEBA/vib-motor-02/S1/', rol: 'secundario',
      nombre: 'Lado acople', alias: [' acople chiquito ', 'acople chiquito', 'lado del motor'],
    })
    return m
  }

  it('el alta guarda nombre y alias limpios, y la edición los conserva o los cambia', async () => {
    const alta = await app.inject({ method: 'POST', url: '/api/maquinas', payload: conApoyo() })
    expect([200, 201]).toContain(alta.statusCode)
    expect(json(alta).maquina.assets.find((a) => a.id === 'S1')).toMatchObject({
      nombre: 'Lado acople', alias: ['acople chiquito', 'lado del motor'],
    })

    /* Editar otra cosa mandando los assets tal cual: nada se pierde. */
    const igual = await app.inject({
      method: 'PATCH', url: '/api/maquinas/vib-motor-02',
      payload: { nombre: 'Otro nombre', assets: json(alta).maquina.assets },
    })
    expect(igual.statusCode).toBe(200)
    expect(json(igual).maquina.assets.find((a) => a.id === 'S1')).toMatchObject({
      nombre: 'Lado acople', alias: ['acople chiquito', 'lado del motor'],
    })

    const cambiado = await app.inject({
      method: 'PATCH', url: '/api/maquinas/vib-motor-02',
      payload: { assets: json(alta).maquina.assets.map((a) => (a.id === 'S1' ? { ...a, alias: ['acople pequeño'] } : a)) },
    })
    expect(cambiado.statusCode).toBe(200)
    expect(json(cambiado).maquina.assets.find((a) => a.id === 'S1').alias).toEqual(['acople pequeño'])
  })

  it('un alias vacío se rechaza con 400, no se guarda en silencio', async () => {
    const m = conApoyo()
    m.assets[1].alias = ['']
    const r = await app.inject({ method: 'POST', url: '/api/maquinas', payload: m })
    expect(r.statusCode).toBe(400)
  })
})
