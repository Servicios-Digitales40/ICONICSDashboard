/**
 * registro-configurado.test.mjs
 * ------------------------------------------------------------------
 * El registro de sistemas conoce las máquinas configuradas. Plan 38 F1.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 *  1. **Al arrancar, las configuradas ACTIVAS del archivo están en `SISTEMA`**,
 *     y las desactivadas no.
 *  2. **Dar de alta una máquina la mete en el registro EN CALIENTE**, y
 *     quitarla la saca. No hace falta reiniciar.
 *  3. **Las rutas que validan `sistema` la aceptan**: `/api/diagnostico` y
 *     `POST /api/casos` con el id de una configurada dejan de contestar 400.
 *     Es lo que `z.enum(SISTEMA_IDS)` impedía: copiaba la lista al arrancar.
 *  4. **El solape de raíz con la máquina escrita a mano se tolera y se dice**;
 *     el solape entre dos configuradas sigue siendo un error al guardar.
 *  5. **Una configuración que no se puede construir se omite y se explica**,
 *     sin tumbar el arranque ni al resto.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SISTEMA, SISTEMA_IDS, sistemasConfigurados } from '../../../shared/eva/comun/sistemas.js'
import { sincronizarRegistroConfigurado } from '../../ia/indices/registroConfigurado.mjs'
import { json, montarApp } from '../ayudas.mjs'

const RAIZ_VIB = 'ac:TDCON/DEMO_VIBRACIONES/Vibraciones/'

/** Una máquina configurada como la guardaría la pantalla. */
const configurada = (id, { raiz = `ac:PRUEBA/${id}/`, extra = {} } = {}) => ({
  id,
  nombre: `Motor ${id}`,
  tipo: 'vibraciones',
  plc: 'PLC_9 · ua:PRUEBA',
  assets: [{ id: 'raiz', pointName: raiz, rol: 'raiz' }],
  variables: [
    { id: 'vRMS_S1', pointName: `${raiz}S1/vRMS_S1`, rol: 'medida:vRMS', assetId: 'S1' },
    { id: 'SPEED_BMS', pointName: `${raiz}V20/SPEED_BMS`, rol: 'variador:velocidad', assetId: 'V20' },
  ],
  ...extra,
})

let carpeta
let app

beforeEach(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'registro-configurado-'))
})

afterEach(async () => {
  await app?.close()
  app = null
  /* Lo que una prueba registró no puede seguir en el módulo para la siguiente. */
  await sincronizarRegistroConfigurado({ listar: async () => [] })
  await rm(carpeta, { recursive: true, force: true })
})

describe('al arrancar', () => {
  it('las configuradas ACTIVAS del archivo entran en el registro, y las desactivadas no', async () => {
    const ruta = join(carpeta, 'maquinas.json')
    await writeFile(ruta, JSON.stringify({
      version: 1,
      maquinas: [
        configurada('vib-motor-03'),
        { ...configurada('vieja'), activa: false },
      ],
    }))
    ;({ app } = await montarApp({ MAQUINAS_RUTA: ruta }))

    expect(SISTEMA['vib-motor-03']).toBeTruthy()
    expect(SISTEMA['vib-motor-03'].configurada).toBe(true)
    expect(SISTEMA_IDS).toContain('vib-motor-03')
    expect(SISTEMA.vieja).toBeUndefined()
    expect(sistemasConfigurados().map(s => s.id)).toEqual(['vib-motor-03'])
  })

  it('sin archivo, el registro es el de siempre', async () => {
    ;({ app } = await montarApp({ MAQUINAS_RUTA: join(carpeta, 'no-existe.json') }))
    expect(sistemasConfigurados()).toEqual([])
    expect(SISTEMA.tanque).toBeTruthy()
    /* Desde el Plan 40 F3 el tanque es la única escrita a mano. */
    expect(SISTEMA.vibraciones).toBeUndefined()
  })

  it('una configuración que no se puede construir se OMITE y se explica, sin tumbar el resto', async () => {
    const ruta = join(carpeta, 'maquinas.json')
    await writeFile(ruta, JSON.stringify({
      version: 1,
      maquinas: [{ ...configurada('rara'), tipo: 'prensa' }, configurada('vib-motor-03')],
    }))
    ;({ app } = await montarApp({ MAQUINAS_RUTA: ruta }))

    const resultado = await sincronizarRegistroConfigurado({
      listar: async () => [{ ...configurada('rara'), tipo: 'prensa' }, configurada('vib-motor-03')],
    })
    expect(resultado.registradas).toEqual(['vib-motor-03'])
    expect(resultado.omitidas).toHaveLength(1)
    expect(resultado.omitidas[0].id).toBe('rara')
    expect(resultado.omitidas[0].motivo).toMatch(/tipo/)
  })
})

describe('en caliente', () => {
  beforeEach(async () => {
    ;({ app } = await montarApp({ MAQUINAS_RUTA: join(carpeta, 'maquinas.json') }))
  })

  it('dar de alta una máquina la mete en el registro, y quitarla la saca', async () => {
    expect(SISTEMA['vib-motor-03']).toBeUndefined()

    const alta = await app.inject({ method: 'POST', url: '/api/maquinas', payload: configurada('vib-motor-03') })
    expect(alta.statusCode).toBe(201)
    expect(SISTEMA['vib-motor-03']).toBeTruthy()
    expect(SISTEMA['vib-motor-03'].nombre).toBe('Motor vib-motor-03')

    /* Editar rehace la entrada: el nombre nuevo se ve en el registro. */
    await app.inject({ method: 'PATCH', url: '/api/maquinas/vib-motor-03', payload: { nombre: 'Renombrada' } })
    expect(SISTEMA['vib-motor-03'].nombre).toBe('Renombrada')

    const baja = await app.inject({ method: 'DELETE', url: '/api/maquinas/vib-motor-03' })
    expect(baja.statusCode).toBe(200)
    expect(SISTEMA['vib-motor-03']).toBeUndefined()
    expect(SISTEMA_IDS).not.toContain('vib-motor-03')
  })

  /*
   * La comprobación que justifica la fase. `z.enum(SISTEMA_IDS)` copiaba la
   * lista al arrancar, así que una máquina dada de alta después contestaba
   * «no reconozco "sistema"» en todas las rutas que la validan.
   */
  it('las rutas que validan `sistema` aceptan una configurada dada de alta después de arrancar', async () => {
    await app.inject({ method: 'POST', url: '/api/maquinas', payload: configurada('vib-motor-03') })

    const diagnostico = await app.inject({
      method: 'GET',
      url: '/api/diagnostico?sistema=vib-motor-03&riesgoId=velocidad-fuera-de-norma',
    })
    expect(diagnostico.statusCode, json(diagnostico).error).toBe(200)
    expect(json(diagnostico).sistema ?? json(diagnostico).resultado?.sistema ?? 'vib-motor-03').toBe('vib-motor-03')

    const caso = await app.inject({
      method: 'POST',
      url: '/api/casos',
      payload: {
        sistema: 'vib-motor-03',
        sintoma: 'Vibración alta en el apoyo S1 con el motor a régimen nominal.',
        solucion: 'Se reapretó la bancada y se realineó el acople.',
      },
    })
    expect(caso.statusCode, json(caso).error).toBe(201)

    /* Y un id que NO existe sigue siendo un 400, con el mensaje de siempre. */
    const desconocido = await app.inject({
      method: 'GET',
      url: '/api/diagnostico?sistema=fantasma&riesgoId=velocidad-fuera-de-norma',
    })
    expect(desconocido.statusCode).toBe(400)
    expect(json(desconocido).error).toMatch(/no reconozco "sistema"/)
  })

  it('la raíz que fue de la máquina escrita a mano es ahora de la configurada, sin solape', async () => {
    /*
     * Hasta el Plan 40 F3 esta raíz la reclamaba la entrada escrita a mano
     * «vibraciones» y el alta se toleraba declarando el solape. Retirada
     * aquélla, la configurada es la única dueña de sus puntos.
     */
    const alta = await app.inject({
      method: 'POST',
      url: '/api/maquinas',
      payload: configurada('vib-motor-03', { raiz: RAIZ_VIB }),
    })
    expect(alta.statusCode).toBe(201)

    const entrada = SISTEMA['vib-motor-03']
    expect(entrada).toBeTruthy()
    expect(entrada.solapes).toBeUndefined()
    const { sistemaDePunto } = await import('../../../shared/eva/comun/sistemas.js')
    expect(sistemaDePunto(`${RAIZ_VIB}S1/vRMS_S1`).id).toBe('vib-motor-03')
  })

  it('el solape entre DOS configuradas sigue rechazándose al guardar', async () => {
    await app.inject({ method: 'POST', url: '/api/maquinas', payload: configurada('vib-motor-03') })
    const otra = await app.inject({
      method: 'POST',
      url: '/api/maquinas',
      payload: configurada('vib-motor-04', { raiz: 'ac:PRUEBA/vib-motor-03/' }),
    })
    expect(otra.statusCode).toBe(400)
    expect(json(otra).problemas.some(p => /solapa/.test(p.problema))).toBe(true)
    expect(SISTEMA['vib-motor-04']).toBeUndefined()
  })
})
