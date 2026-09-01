/**
 * `GET /api/diagnostico` (Plan 16 Fase 5, UI A).
 *
 * A diferencia de `casos.test.mjs`, aquí SÍ se prueba contra el motor real:
 * es una ruta de LECTURA —nunca escribe en `datos/aprendizaje.json`—, así
 * que no hay archivo de verdad que proteger. `motorDiagnostico` ya lo monta
 * `app.mjs` sin condición (Plan 16 Fase 4), con `indiceDocumentos: null` en
 * las pruebas —no hay `IA_DOCS_DIR`— y sin `IA_EMBEDDING_BASE`, así que
 * corre sobre BM25 solo, sin red.
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

describe('GET /api/diagnostico', () => {
  it('sin `sistema` → 400', async () => {
    const { app } = conRegistro(await montarApp())
    const r = await app.inject({ method: 'GET', url: '/api/diagnostico?riesgoId=bomba-sin-salida' })
    expect(r.statusCode).toBe(400)
  })

  it('un `sistema` que no existe → 400', async () => {
    const { app } = conRegistro(await montarApp())
    const r = await app.inject({ method: 'GET', url: '/api/diagnostico?sistema=calderas&riesgoId=x' })
    expect(r.statusCode).toBe(400)
  })

  it('sin `riesgoId` → 400', async () => {
    const { app } = conRegistro(await montarApp())
    const r = await app.inject({ method: 'GET', url: '/api/diagnostico?sistema=tanque' })
    expect(r.statusCode).toBe(400)
  })

  it('un `riesgoId` que no es de ese sistema → 400, no tumba el servidor', async () => {
    const { app } = conRegistro(await montarApp())
    const r = await app.inject({
      method: 'GET',
      url: '/api/diagnostico?sistema=tanque&riesgoId=vibracion-en-alarma',
    })
    expect(r.statusCode).toBe(400)
  })

  it('un riesgo con causas transcritas devuelve la lista ordenada', async () => {
    const { app } = conRegistro(await montarApp())
    const r = await app.inject({
      method: 'GET',
      url: '/api/diagnostico?sistema=tanque&riesgoId=bomba-sin-salida',
    })

    expect(r.statusCode).toBe(200)
    const cuerpo = json(r)
    expect(cuerpo.ok).toBe(true)
    expect(cuerpo.huerfano).toBe(false)
    expect(cuerpo.causas.length).toBeGreaterThan(0)
    // Ordenadas de más a menos respaldo, sin reordenar aquí.
    for (let i = 1; i < cuerpo.causas.length; i++) {
      expect(cuerpo.causas[i - 1].respaldo.total).toBeGreaterThanOrEqual(cuerpo.causas[i].respaldo.total)
    }
  })
})
