/**
 * Rutas del cierre de diagnóstico (Plan 16 Fase 5).
 *
 * ── QUÉ SE PRUEBA AQUÍ, Y QUÉ NO ────────────────────────────────────
 *
 * Sólo el CONTRATO HTTP: qué cuerpo se acepta, qué rechaza y con qué
 * código. Ninguna prueba de aquí llega a escribir en disco a propósito —a
 * diferencia de `IA_DOCS_DIR`/`IA_REPORTES_DIR`/`IA_BACKLOG_CHAT_DIR`,
 * `datos/aprendizaje.json` NO tiene una variable de entorno que lo
 * reubique (Plan 16: `datos/` es lo que el backend necesita para sí mismo,
 * no una carpeta de contenido que alguien vaya a mover), así que
 * `montarApp()` no puede aislarlo como aísla las demás. Un caso VÁLIDO
 * escribiría sobre el archivo de verdad de quien corra las pruebas — el
 * mismo motivo por el que `registrar_intervencion` tampoco tiene una
 * prueba de escritura real en este árbol.
 *
 * La escritura de verdad —que `registrarCaso` guarda lo que le llega, que
 * un caso rico y uno simple conviven en el mismo archivo— se prueba en
 * `scripts/verificar-casos-cierre.mjs`, contra una `ruta` temporal, igual
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
    // Lectura, como `GET /api/rag/documentos`. No se afirma NADA sobre el
    // contenido: esta prueba corre contra el `datos/aprendizaje.json` real
    // de quien la ejecuta —ver la cabecera— y atarla a un caso concreto la
    // haría fallar en otra máquina por un motivo que no es un defecto.
    const { app } = conRegistro(await montarApp())
    const r = await app.inject({ method: 'GET', url: '/api/casos' })

    expect(r.statusCode).toBe(200)
    const cuerpo = json(r)
    expect(cuerpo.ok).toBe(true)
    expect(Array.isArray(cuerpo.casos)).toBe(true)
    expect(cuerpo.total).toBe(cuerpo.casos.length)
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
