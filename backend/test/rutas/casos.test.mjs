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
