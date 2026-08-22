/**
 * Descarga de los PDF que genera `generar_reporte` (Plan 14 Fase 5).
 *
 * Por query string y no `/api/reportes/:id`: `http/router.mjs` no soporta
 * segmentos de ruta a propósito (ver su cabecera), y todo lo demás en esta
 * API ya va así (`/api/iconics/data?pointName=...`).
 *
 * El `id` se valida con un patrón de UUID ANTES de tocar el filesystem: eso
 * basta como guarda contra recorrido de rutas (no hace falta el patrón
 * `isInsideRoot` de `staticFiles.mjs`, porque un valor que no cumpla el
 * patrón ni siquiera llega a construirse como ruta).
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { sendError } from '../http/responses.mjs'

const ID_VALIDO = /^[0-9a-f-]{36}$/i

export function registerReportesRoutes(router, { config }) {
  router.get('/api/reportes', async ({ response, url }) => {
    const id = url.searchParams.get('id') ?? ''
    if (!ID_VALIDO.test(id)) {
      return sendError(response, 400, 'Parámetro "id" inválido.')
    }

    const ruta = join(config.reportes.dir, `${id}.pdf`)

    try {
      const stats = await stat(ruta)
      if (!stats.isFile()) throw new Error('no es un archivo')

      response.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="reporte-${id}.pdf"`,
        'Content-Length': String(stats.size),
      })
      createReadStream(ruta).pipe(response)
    } catch {
      sendError(response, 404, 'Reporte no encontrado (puede haberse purgado por antigüedad).')
    }
  })
}
