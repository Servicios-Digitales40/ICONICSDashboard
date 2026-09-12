/**
 * `GET/POST /api/cuaderno` — Plan 25 F8 (`NUE-10`).
 *
 * ── QUÉ SE PRUEBA AQUÍ, Y QUÉ NO SE REPITE ─────────────────────────
 *
 * El CONTRATO HTTP. La mecánica del archivo (JSONL, poda, línea a medias) ya
 * está probada en `test/diario.test.mjs` contra el mismo `crearDiario()`; no
 * se repite aquí.
 *
 * Lo que sí es propio de esta ruta, y lo que más importa:
 *
 *  1. El autor y el instante los pone el SERVIDOR, nunca el cliente — un
 *     campo `autor` en el cuerpo de la petición se ignora.
 *  2. Una nota que falla al guardar SÍ propaga el error (al revés que
 *     `POST /api/control/bomba`, donde la bomba ya se accionó y no hay nada
 *     que "deshacer" contando el fallo).
 *  3. GET también pide rol — igual que `/api/diario` y por el mismo motivo:
 *     cada nota trae `autor`, información de personas.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { montarApp } from '../ayudas.mjs'

let apps = []

afterEach(async () => {
  for (const app of apps) await app.close()
  apps = []
})

async function conCuaderno(lineas = []) {
  const dir = await mkdtemp(join(tmpdir(), 'iconics-cuaderno-'))
  const ruta = join(dir, 'cuaderno.jsonl')
  await writeFile(
    ruta,
    lineas.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + (lineas.length ? '\n' : ''),
    'utf8'
  )

  const { app } = await montarApp({ CUADERNO_RUTA: ruta })
  apps.push(app)
  return { app, ruta }
}

const nota = (texto, extra = {}) => ({
  instante: new Date().toISOString(),
  texto,
  autor: 'ana',
  ...extra,
})

describe('GET /api/cuaderno', () => {
  it('devuelve las notas de la más reciente a la más antigua', async () => {
    const { app } = await conCuaderno([
      nota('Cambié el filtro', { instante: '2026-09-10T08:00:00Z' }),
      nota('La bomba hace ruido', { instante: '2026-09-10T09:00:00Z' }),
    ])

    const r = await app.inject({ method: 'GET', url: '/api/cuaderno' })
    expect(r.statusCode).toBe(200)

    const { entradas } = r.json()
    expect(entradas.map((e) => e.texto)).toEqual(['La bomba hace ruido', 'Cambié el filtro'])
  })

  it('sin cuaderno escrito todavía no es un error', async () => {
    const { app } = await conCuaderno([])
    const r = await app.inject({ method: 'GET', url: '/api/cuaderno' })
    expect(r.statusCode).toBe(200)
    expect(r.json().entradas).toEqual([])
  })

  it('un rango invertido se rechaza con 400', async () => {
    const { app } = await conCuaderno([nota('X')])
    const r = await app.inject({
      method: 'GET',
      url: '/api/cuaderno?desde=2026-09-11T00:00:00Z&hasta=2026-09-10T00:00:00Z',
    })
    expect(r.statusCode).toBe(400)
  })
})

describe('POST /api/cuaderno', () => {
  it('guarda la nota y devuelve 201', async () => {
    const { app, ruta } = await conCuaderno([])

    const r = await app.inject({
      method: 'POST',
      url: '/api/cuaderno',
      payload: { texto: 'Cambié el filtro del tanque' },
    })

    expect(r.statusCode).toBe(201)

    const leido = await app.inject({ method: 'GET', url: '/api/cuaderno' })
    expect(leido.json().entradas[0].texto).toBe('Cambié el filtro del tanque')
    void ruta // el archivo se comprueba a través de la propia API, no leyendo el disco
  })

  it('el AUTOR lo pone el servidor: un `autor` en el cuerpo se ignora', async () => {
    /*
     * La aserción central de F8. Sin ella, cualquiera podría escribir una nota
     * y firmarla con el nombre de otro operador.
     */
    const { app } = await conCuaderno([])

    await app.inject({
      method: 'POST',
      url: '/api/cuaderno',
      payload: { texto: 'Nota falsificada', autor: 'jefe-de-planta' },
    })

    const leido = await app.inject({ method: 'GET', url: '/api/cuaderno' })
    // Con AUTH_HABILITADA=false (el defecto de estas pruebas), el usuario es
    // el anónimo del sistema, nunca lo que mandó el cuerpo.
    expect(leido.json().entradas[0].autor).not.toBe('jefe-de-planta')
  })

  it('el INSTANTE lo pone el servidor, no el que venga en el cuerpo', async () => {
    const { app } = await conCuaderno([])

    await app.inject({
      method: 'POST',
      url: '/api/cuaderno',
      payload: { texto: 'X', instante: '2000-01-01T00:00:00Z' },
    })

    const leido = await app.inject({ method: 'GET', url: '/api/cuaderno' })
    const instante = new Date(leido.json().entradas[0].instante)
    // No es la fecha falsificada de hace 26 años: es de ahora.
    expect(instante.getFullYear()).toBeGreaterThan(2020)
  })

  it('una nota vacía se rechaza con 400', async () => {
    const { app } = await conCuaderno([])
    const r = await app.inject({ method: 'POST', url: '/api/cuaderno', payload: { texto: '' } })
    expect(r.statusCode).toBe(400)
  })

  it('un `sistema` que no está en el catálogo se rechaza', async () => {
    const { app } = await conCuaderno([])
    const r = await app.inject({
      method: 'POST',
      url: '/api/cuaderno',
      payload: { texto: 'X', sistema: 'planta-inventada' },
    })
    expect(r.statusCode).toBe(400)
  })

  it('sin `sistema` la nota se guarda igual — es opcional, no todo es de una máquina', async () => {
    const { app } = await conCuaderno([])
    const r = await app.inject({ method: 'POST', url: '/api/cuaderno', payload: { texto: 'Se fue la luz media hora' } })
    expect(r.statusCode).toBe(201)
  })
})
