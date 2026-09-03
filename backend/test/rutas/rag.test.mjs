/**
 * Rutas del catálogo de manuales (Plan 16 Fase 1).
 *
 * Lo que importa comprobar aquí no es el índice —eso ya lo cubre
 * `scripts/verificar-documentos.mjs` contra la implementación real— sino el
 * CONTRATO HTTP: que subir sin `RAG_UPLOAD_ENABLED` se niegue, que un nombre
 * hostil no escriba fuera de la carpeta, que dos manuales con el mismo
 * nombre no se pisen, y que archivar mueva el archivo de verdad en vez de
 * sólo marcar una bandera en el JSON.
 */
import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { json, montarApp } from '../ayudas.mjs'

/** Un `montarApp` con su propia carpeta de documentación, aislada de
 *  `reportesDir` y de la de cualquier otra prueba. */
async function montarConDocs(extra = {}) {
  const docsDir = await mkdtemp(join(tmpdir(), 'rag-test-'))
  const { app, config } = await montarApp({ IA_DOCS_DIR: docsDir, ...extra })
  return { app, config, docsDir }
}

function subir(app, nombre, contenido, { sistema, titulo } = {}) {
  const params = new URLSearchParams({ nombre })
  if (sistema) params.set('sistema', sistema)
  if (titulo) params.set('titulo', titulo)

  return app.inject({
    method: 'POST',
    url: `/api/rag/documentos?${params}`,
    headers: { 'content-type': 'application/octet-stream' },
    payload: Buffer.from(contenido),
  })
}

const UUID_INEXISTENTE = '00000000-0000-0000-0000-000000000000'

let appsAbiertas = []
afterEach(async () => {
  await Promise.all(appsAbiertas.map(a => a.close()))
  appsAbiertas = []
})

/** Registra la app para cerrarla en `afterEach`, y la devuelve tal cual. */
function conRegistro(montaje) {
  appsAbiertas.push(montaje.app)
  return montaje
}

describe('GET /api/rag/documentos', () => {
  it('sin IA_DOCS_DIR dice que no está configurado', async () => {
    const { app } = conRegistro(await montarApp())
    const r = await app.inject({ method: 'GET', url: '/api/rag/documentos' })

    expect(r.statusCode).toBe(200)
    const cuerpo = json(r)
    expect(cuerpo.configurado).toBe(false)
    expect(cuerpo.manuales).toEqual([])
  })

  it('con la carpeta vacía, lista vacía y modo BM25', async () => {
    const { app } = conRegistro(await montarConDocs())
    const r = await app.inject({ method: 'GET', url: '/api/rag/documentos' })

    const cuerpo = json(r)
    expect(cuerpo.configurado).toBe(true)
    expect(cuerpo.manuales).toEqual([])
    expect(cuerpo.modo).toBe('BM25')
  })
})

describe('POST /api/rag/documentos', () => {
  it('403 si RAG_UPLOAD_ENABLED no está activado (el defecto)', async () => {
    const { app } = conRegistro(await montarConDocs())
    const r = await subir(app, 'manual.txt', 'contenido')

    expect(r.statusCode).toBe(403)
    expect(json(r).error).toMatch(/RAG_UPLOAD_ENABLED/)
  })

  it('503 si no hay IA_DOCS_DIR, aunque la carga esté habilitada', async () => {
    const { app } = conRegistro(await montarApp({ RAG_UPLOAD_ENABLED: 'true' }))
    const r = await subir(app, 'manual.txt', 'contenido')

    expect(r.statusCode).toBe(503)
    expect(json(r).error).toMatch(/IA_DOCS_DIR/)
  })

  it('sube un manual, lo añade al catálogo y lo escribe en disco', async () => {
    const { app, docsDir } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const r = await subir(app, 'manual.txt', 'La válvula de impulsión debe revisarse.', {
      sistema: 'tanque',
      titulo: 'Manual de la bomba',
    })

    expect(r.statusCode).toBe(201)
    const { manual } = json(r)
    expect(manual.archivo).toBe('manual.txt')
    expect(manual.sistema).toBe('tanque')
    expect(manual.titulo).toBe('Manual de la bomba')
    expect(manual.version).toBe(1)
    expect(manual.estado).toBe('activo')

    const enDisco = await readFile(join(docsDir, 'manual.txt'), 'utf8')
    expect(enDisco).toMatch(/válvula de impulsión/)
  })

  it('rechaza una extensión que el índice no sabría leer', async () => {
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const r = await subir(app, 'instalador.exe', 'contenido')

    expect(r.statusCode).toBe(400)
    expect(json(r).error).toMatch(/[Ee]xtensión/)
  })

  it('rechaza un sistema que no existe en el registro', async () => {
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const r = await subir(app, 'manual.txt', 'contenido', { sistema: 'sistema-inventado' })

    expect(r.statusCode).toBe(400)
    expect(json(r).error).toMatch(/sistema/)
  })

  it('sin `sistema`, el manual queda para toda la planta', async () => {
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const r = await subir(app, 'general.txt', 'procedimiento de arranque')

    expect(json(r).manual.sistema).toBeNull()
  })

  it('un nombre con recorrido de rutas se sanea, y no escribe fuera de la carpeta', async () => {
    const { app, docsDir } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const r = await subir(app, '../../fuera-de-la-carpeta.txt', 'contenido hostil')

    expect(r.statusCode).toBe(201)
    const { manual } = json(r)
    expect(manual.archivo).not.toMatch(/\.\./)
    expect(manual.archivo).not.toMatch(/[/\\]/)

    // Y el archivo está DENTRO de docsDir, no un nivel por encima.
    const dentro = await readdir(docsDir)
    expect(dentro).toContain(manual.archivo)
  })

  it('dos manuales con el mismo nombre no se pisan', async () => {
    const { app, docsDir } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const primero = json(await subir(app, 'manual.txt', 'contenido del primero'))
    const segundo = json(await subir(app, 'manual.txt', 'contenido del segundo'))

    expect(primero.manual.archivo).not.toBe(segundo.manual.archivo)

    const primeroEnDisco = await readFile(join(docsDir, primero.manual.archivo), 'utf8')
    expect(primeroEnDisco).toBe('contenido del primero')
  })

  it('un archivo vacío da 400', async () => {
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const r = await subir(app, 'vacio.txt', '')

    expect(r.statusCode).toBe(400)
  })
})

describe('PUT /api/rag/documentos', () => {
  it('reemplaza el contenido y sube la versión', async () => {
    const { app, docsDir } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const subida = json(await subir(app, 'manual.txt', 'versión uno'))

    const r = await app.inject({
      method: 'PUT',
      url: `/api/rag/documentos?id=${subida.manual.id}`,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('versión dos'),
    })

    expect(r.statusCode).toBe(200)
    const { manual } = json(r)
    expect(manual.version).toBe(2)
    expect(manual.id).toBe(subida.manual.id)

    const enDisco = await readFile(join(docsDir, 'manual.txt'), 'utf8')
    expect(enDisco).toBe('versión dos')
  })

  it('un id que no existe da 404', async () => {
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const r = await app.inject({
      method: 'PUT',
      url: `/api/rag/documentos?id=${UUID_INEXISTENTE}`,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('contenido'),
    })

    expect(r.statusCode).toBe(404)
  })

  it('un id con formato inválido da 400, sin tocar disco', async () => {
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const r = await app.inject({
      method: 'PUT',
      url: '/api/rag/documentos?id=no-es-un-uuid',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('contenido'),
    })

    expect(r.statusCode).toBe(400)
  })

  it('un manual archivado no se puede reemplazar', async () => {
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const subida = json(await subir(app, 'manual.txt', 'contenido'))
    await app.inject({ method: 'PATCH', url: `/api/rag/documentos?id=${subida.manual.id}` })

    const r = await app.inject({
      method: 'PUT',
      url: `/api/rag/documentos?id=${subida.manual.id}`,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('nuevo contenido'),
    })

    expect(r.statusCode).toBe(400)
    expect(json(r).error).toMatch(/archivado/)
  })
})

describe('PATCH /api/rag/documentos', () => {
  it('archiva: mueve el archivo a `.archivados/` y lo marca en el catálogo', async () => {
    const { app, docsDir } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const subida = json(await subir(app, 'manual.txt', 'contenido'))

    const r = await app.inject({ method: 'PATCH', url: `/api/rag/documentos?id=${subida.manual.id}` })

    expect(r.statusCode).toBe(200)
    expect(json(r).manual.estado).toBe('archivado')

    // Ya no está en la carpeta que lee el índice...
    const dentro = await readdir(docsDir)
    expect(dentro).not.toContain('manual.txt')

    // ...pero sigue en disco, sin borrarse. Ver la cabecera de `manuales.mjs`.
    const archivados = await readdir(join(docsDir, '.archivados'))
    expect(archivados).toContain('manual.txt')
  })

  it('accion=asignar cambia la máquina del manual, sin archivarlo', async () => {
    /*
     * El filtro por sistema de `documentos.mjs·buscar()` estaba montado desde
     * el Plan 17 F3a (G7) y no había forma de asignar nada: medido el
     * 03-09-2026, los nueve manuales del manifiesto estaban en «toda la
     * planta», así que el filtro no filtraba y un diagnóstico de vibraciones
     * podía respaldarse en el manual de la bomba.
     */
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const subida = json(await subir(app, 'manual.txt', 'contenido'))
    expect(subida.manual.sistema).toBeNull()

    const r = await app.inject({
      method: 'PATCH',
      url: `/api/rag/documentos?id=${subida.manual.id}&accion=asignar&sistema=vibraciones`,
    })

    expect(r.statusCode).toBe(200)
    expect(json(r).manual.sistema).toBe('vibraciones')
    // Lo que la `accion` explícita protege: asignar no puede archivar.
    expect(json(r).manual.estado).toBe('activo')

    const listado = json(await app.inject({ method: 'GET', url: '/api/rag/documentos' }))
    expect(listado.manuales.find(m => m.id === subida.manual.id).sistema).toBe('vibraciones')
  })

  it('asignar con `sistema` vacío devuelve el manual a toda la planta', async () => {
    /*
     * Vacío es un valor CON significado, y es justo el que rompería un diseño
     * que dedujera la acción de los parámetros presentes: sin `accion`
     * explícita, «reasignar a toda la planta» sería indistinguible de
     * «archivar». Ver la cabecera de `ArchivarManualQuerySchema`.
     */
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const subida = json(await subir(app, 'manual.txt', 'contenido', { sistema: 'tanque' }))
    expect(subida.manual.sistema).toBe('tanque')

    const r = await app.inject({
      method: 'PATCH',
      url: `/api/rag/documentos?id=${subida.manual.id}&accion=asignar&sistema=`,
    })

    expect(r.statusCode).toBe(200)
    expect(json(r).manual.sistema).toBeNull()
    expect(json(r).manual.estado).toBe('activo')
  })

  it('asignar a un sistema que no existe da 400 y no toca el manual', async () => {
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const subida = json(await subir(app, 'manual.txt', 'contenido', { sistema: 'tanque' }))

    const r = await app.inject({
      method: 'PATCH',
      url: `/api/rag/documentos?id=${subida.manual.id}&accion=asignar&sistema=compresor`,
    })

    expect(r.statusCode).toBe(400)

    const listado = json(await app.inject({ method: 'GET', url: '/api/rag/documentos' }))
    expect(listado.manuales.find(m => m.id === subida.manual.id).sistema).toBe('tanque')
  })

  it('sin `accion`, el PATCH sigue archivando como siempre', async () => {
    // Compatibilidad: `accion` por defecto es `archivar`, así que las llamadas
    // que ya existían —incluida la del frontend— siguen significando lo mismo.
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const subida = json(await subir(app, 'manual.txt', 'contenido'))

    const r = await app.inject({ method: 'PATCH', url: `/api/rag/documentos?id=${subida.manual.id}` })

    expect(r.statusCode).toBe(200)
    expect(json(r).manual.estado).toBe('archivado')
  })

  it('un manual archivado ya no aparece con fragmentos en el listado', async () => {
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const subida = json(await subir(app, 'manual.txt', 'contenido'))
    await app.inject({ method: 'PATCH', url: `/api/rag/documentos?id=${subida.manual.id}` })

    const r = await app.inject({ method: 'GET', url: '/api/rag/documentos' })
    const listado = json(r).manuales.find(m => m.id === subida.manual.id)

    expect(listado.estado).toBe('archivado')
    expect(listado.fragmentos).toBeNull()
  })

  it('un id que no existe da 404', async () => {
    const { app } = conRegistro(await montarConDocs({ RAG_UPLOAD_ENABLED: 'true' }))
    const r = await app.inject({ method: 'PATCH', url: `/api/rag/documentos?id=${UUID_INEXISTENTE}` })

    expect(r.statusCode).toBe(404)
  })
})
