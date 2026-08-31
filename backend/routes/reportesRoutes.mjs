/**
 * Descarga de los PDF que genera `generar_reporte` (Plan 14 Fase 5).
 *
 * Por query string y no `/api/reportes/:id`: todo lo demás en esta API ya va
 * así (`/api/iconics/data?pointName=...`), y cambiarlo ahora rompería los
 * enlaces que el asistente ya ha devuelto en conversaciones anteriores.
 *
 * El `id` se valida con un patrón de UUID ANTES de tocar el filesystem —lo
 * hace `ReporteQuerySchema`—: eso basta como guarda contra recorrido de rutas,
 * porque un valor que no cumpla el patrón ni siquiera llega a construirse
 * como ruta.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ReporteQuerySchema } from '../http/esquemas.mjs'
import { validarConsulta } from '../http/validar.mjs'

export function registerReportesRoutes(fastify, { config }) {
  fastify.get(
    '/api/reportes',
    { preHandler: validarConsulta(ReporteQuerySchema) },
    async (request, reply) => {
      const { id } = request.query
      const ruta = join(config.reportes.dir, `${id}.pdf`)

      let stats
      try {
        stats = await stat(ruta)
        if (!stats.isFile()) throw new Error('la ruta existe pero no es un archivo')
      } catch (error) {
        /*
         * Los reportes se purgan por antigüedad, así que un 404 aquí es el
         * caso NORMAL para un enlace viejo, no una avería. Se registra como
         * info y con el directorio, que es lo que hace falta saber si alguien
         * dice que ningún reporte se descarga: casi siempre es que
         * `REPORTES_DIR` apunta a otro sitio del que se cree.
         */
        request.log.info(
          { id, directorio: config.reportes.dir, motivo: error.message },
          `Reporte ${id} no disponible en ${config.reportes.dir} (probablemente purgado por antigüedad)`
        )
        return reply
          .code(404)
          .send({ ok: false, error: 'Reporte no encontrado (puede haberse purgado por antigüedad).' })
      }

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="reporte-${id}.pdf"`)
        .header('Content-Length', String(stats.size))
        .send(createReadStream(ruta))
    }
  )
}
