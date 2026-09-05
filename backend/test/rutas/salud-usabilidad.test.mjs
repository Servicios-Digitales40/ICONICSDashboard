import { afterAll, describe, expect, it } from 'vitest'
import { json, montarApp } from '../ayudas.mjs'

const { app } = await montarApp({
  IA_BASE: 'http://127.0.0.1:9',
  IA_WHISPER_BASE: 'http://127.0.0.1:9',
  IA_DOCS_DIR: 'Documentos/Manuales',
  RAG_UPLOAD_ENABLED: 'true',
})

afterAll(async () => app.close())

describe('estado operativo para la interfaz', () => {
  it('declara entorno, modo de control y capacidades sin exponer secretos', async () => {
    const cuerpo = json(await app.inject({ method: 'GET', url: '/api/health' }))
    expect(cuerpo.simulated).toBe(true)
    expect(cuerpo.readOnly).toBe(true)
    expect(cuerpo.capabilities).toMatchObject({
      assistant: true,
      voice: true,
      manuals: true,
      manualUpload: true,
      conversationExport: true,
    })
    expect(JSON.stringify(cuerpo)).not.toContain('127.0.0.1:9')
  })
})
