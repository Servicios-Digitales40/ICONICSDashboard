/**
 * Rutas del cierre de diagnóstico (Plan 16 Fase 5).
 *
 * ── QUÉ SE PRUEBA AQUÍ, Y QUÉ NO ────────────────────────────────────
 *
 * El CONTRATO HTTP: qué cuerpo se acepta, qué rechaza y con qué código.
 *
 * ── ESTE ARCHIVO EVITABA ESCRIBIR, Y ERA UN SÍNTOMA (Plan 45 F2.1) ──
 *
 * La cabecera decía aquí que `datos/aprendizaje.json` «NO tiene una variable
 * de entorno que lo reubique, así que `montarApp()` no puede aislarlo», y de
 * ahí que ninguna prueba de este archivo llegara a escribir: un caso VÁLIDO
 * habría escrito sobre la bitácora de quien corriera la suite.
 *
 * Las dos mitades de esa frase eran ciertas y la conclusión, al revés. Lo que
 * faltaba no era una prueba menos: era la variable. Ahora existe
 * (`APRENDIZAJE_RUTA` → `config.diario.aprendizaje.ruta`), `montarApp()` la
 * apunta a la carpeta temporal como ya hacía con `MAQUINAS_RUTA`, y
 * `registerCasosRoutes` la recibe. Y de paso se cerró el defecto que ese
 * hueco escondía: la ruta por defecto era RELATIVA al `cwd`, así que el
 * backend arrancado desde la raíz y la suite corriendo desde `backend/`
 * escribían en DOS archivos distintos.
 *
 * Así que el POST sí se prueba de punta a punta aquí abajo: se registra un
 * caso y se lee de vuelta por `GET`.
 *
 * La escritura del ALMACÉN —que `registrarCaso` guarda lo que le llega, que
 * un caso rico y uno simple conviven en el mismo archivo— se sigue probando
 * en `scripts/verificar-casos-cierre.mjs`, contra una `ruta` temporal, igual
 * que `verificar-casos.mjs` prueba `casos.mjs`. Las formas que `CrearCasoSchema`
 * SÍ acepta —`disparador`, `causaReal`, `muestraSensores` sin lista fija de
 * claves— se prueban en `test/esquemas.test.mjs`, junto a los demás
 * esquemas: no hace falta montar la app entera para probar un `.parse()`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { json, montarApp } from '../ayudas.mjs'

let appsAbiertas = []
afterEach(async () => {
  await Promise.all(appsAbiertas.map(a => a.close()))
  appsAbiertas = []
})

function conRegistro(montaje) {
  appsAbiertas.push(montaje.app)
  return montaje
}

function postCaso(app, body) {
  return app.inject({ method: 'POST', url: '/api/casos', payload: body })
}

const CASO_MINIMO = {
  sistema: 'tanque',
  sintoma: 'La bomba giraba contra una salida cerrada.',
  solucion: 'Se liberó la válvula de impulsión, agarrotada.',
}

describe('POST /api/casos', () => {
  it('sin `sintoma` → 400', async () => {
    const { app } = conRegistro(await montarApp())
    const { sintoma, ...sinSintoma } = CASO_MINIMO
    const r = await postCaso(app, sinSintoma)
    expect(r.statusCode).toBe(400)
  })

  it('`sintoma` demasiado corto → 400, con el mismo mínimo que la voz', async () => {
    const { app } = conRegistro(await montarApp())
    const r = await postCaso(app, { ...CASO_MINIMO, sintoma: 'corto' })
    expect(r.statusCode).toBe(400)
    expect(json(r).error).toMatch(/sintoma/)
  })

  it('sin `solucion` → 400', async () => {
    const { app } = conRegistro(await montarApp())
    const { solucion, ...sinSolucion } = CASO_MINIMO
    const r = await postCaso(app, sinSolucion)
    expect(r.statusCode).toBe(400)
  })

  it('un `sistema` que no existe → 400, no se adivina ni se ignora', async () => {
    const { app } = conRegistro(await montarApp())
    const r = await postCaso(app, { ...CASO_MINIMO, sistema: 'calderas' })
    expect(r.statusCode).toBe(400)
  })

  it('un `disparador.tipo` que no es "riesgo" ni "peticion" → 400', async () => {
    const { app } = conRegistro(await montarApp())
    const r = await postCaso(app, {
      ...CASO_MINIMO,
      disparador: { tipo: 'otro' },
    })
    expect(r.statusCode).toBe(400)
  })
})

describe('GET /api/casos', () => {
  it('devuelve la bitácora con su recuento, sin exigir autenticación', async () => {
    // Lectura, como `GET /api/rag/documentos`. La bitácora que ve esta app es
    // la de su carpeta temporal (ver la cabecera), así que arranca VACÍA: es
    // una afirmación que se puede hacer, y antes no.
    const { app } = conRegistro(await montarApp())
    const r = await app.inject({ method: 'GET', url: '/api/casos' })

    expect(r.statusCode).toBe(200)
    const cuerpo = json(r)
    expect(cuerpo.ok).toBe(true)
    expect(Array.isArray(cuerpo.casos)).toBe(true)
    expect(cuerpo.total).toBe(cuerpo.casos.length)
    expect(cuerpo.total).toBe(0)
  })
})

describe('POST /api/casos, de punta a punta (Plan 45 F2.1)', () => {
  /*
   * La prueba que este archivo no podía tener: un caso VÁLIDO que se escribe
   * y se lee de vuelta.
   *
   * Vigila dos cosas a la vez. La obvia es el contrato: que un cuerpo bueno
   * devuelve 201 y que lo guardado sale por el GET. La otra es la AISLACIÓN:
   * el GET de aquí arriba exige que la bitácora arranque vacía, así que si
   * alguien quita `APRENDIZAJE_RUTA` de `montarApp()` la suite deja de pasar
   * en cualquier máquina que tenga casos de verdad, en vez de escribir en
   * ellos en silencio. Que era lo que pasaba.
   */
  it('registra un caso, lo devuelve con 201, y sale en la bitácora', async () => {
    const { app } = conRegistro(await montarApp())

    const alta = await app.inject({
      method: 'POST',
      url: '/api/casos',
      payload: {
        sistema: 'tanque',
        sintoma: 'Vibración alta en el apoyo del lado acople.',
        solucion: 'Se reapretó la bancada.',
        resuelto: true,
      },
    })

    expect(alta.statusCode).toBe(201)
    const creado = json(alta).caso
    expect(creado.id).toMatch(/^interv-/)
    expect(creado.resuelto).toBe(true)

    const lista = await app.inject({ method: 'GET', url: '/api/casos' })
    expect(json(lista).total).toBe(1)
    expect(json(lista).casos[0].id).toBe(creado.id)
  })
})

describe('PATCH /api/casos/:id', () => {
  /*
   * Ninguna de estas llega a ESCRIBIR, y eso es deliberado: dos se cortan en
   * el esquema y la tercera se corta en «no existe», antes de guardar. Un
   * archivado válido tocaría el archivo real de quien corra las pruebas —el
   * mismo motivo por el que aquí tampoco hay un POST válido—. El camino
   * completo, contra una `ruta` temporal, vive en `scripts/verificar-casos.mjs`.
   */
  function patchCaso(app, id, body) {
    return app.inject({ method: 'PATCH', url: `/api/casos/${id}`, payload: body })
  }

  it('sin `archivado` → 400: la misma ruta archiva y devuelve, hay que decir cuál', async () => {
    const { app } = conRegistro(await montarApp())
    const r = await patchCaso(app, 'interv-loquesea', {})
    expect(r.statusCode).toBe(400)
  })

  it('`archivado` que no es booleano → 400', async () => {
    const { app } = conRegistro(await montarApp())
    const r = await patchCaso(app, 'interv-loquesea', { archivado: 'sí' })
    expect(r.statusCode).toBe(400)
  })

  it('un id que no existe → 404, no un 500 ni un silencio', async () => {
    // Que alguien archive dos veces desde dos pestañas no es un fallo del
    // servidor. Se contesta 404 y se dice qué id no se encontró.
    const { app } = conRegistro(await montarApp())
    const r = await patchCaso(app, 'interv-no-existe-jamas-0000', { archivado: true })

    expect(r.statusCode).toBe(404)
    expect(json(r).error).toContain('interv-no-existe-jamas-0000')
  })
})
