/**
 * Descarga de los PDF que genera `generar_reporte` (Plan 14 Fase 5) O la
 * exportación de chat (Plan 16) — una sola ruta para las dos.
 *
 * Por query string y no `/api/reportes/:id`: todo lo demás en esta API ya va
 * así (`/api/iconics/data?pointName=...`), y cambiarlo ahora rompería los
 * enlaces que el asistente ya ha devuelto en conversaciones anteriores.
 *
 * ── DOS CARPETAS, UNA RUTA ───────────────────────────────────────────
 *
 * `generar_reporte` escribe en `config.reportes.dir`; exportar chat escribe
 * en `config.backlogChat.dir` (Plan 16 las separó: una es trabajo del
 * asistente sobre una pregunta de datos, la otra un registro de lo hablado).
 * El nombre del archivo no dice de cuál viene —es sólo un UUID—, así que esta
 * ruta prueba la primera carpeta y, si no está ahí, la segunda. Es seguro
 * porque `randomUUID()` no repite entre las dos: no hace falta que el `id`
 * lleve marcada su procedencia para que esto no colisione.
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

/** El primer archivo `<dir>/<id>.pdf` que exista, probando las carpetas en
 *  orden. `null` si ninguna lo tiene. */
async function localizarPdf(carpetas, id) {
  for (const dir of carpetas) {
    if (!dir) continue
    const ruta = join(dir, `${id}.pdf`)
    try {
      const stats = await stat(ruta)
      if (stats.isFile()) return { ruta, stats, dir }
    } catch {
      // No está en esta carpeta; se prueba la siguiente.
    }
  }
  return null
}

export function registerReportesRoutes(fastify, { config }) {
  fastify.get(
    '/api/reportes',
    { schema: { querystring: ReporteQuerySchema } },
    async (request, reply) => {
      const { id } = request.query
      const carpetas = [config.reportes.dir, config.backlogChat?.dir]

      const encontrado = await localizarPdf(carpetas, id)

      if (!encontrado) {
        /*
         * Los reportes se purgan por antigüedad, así que un 404 aquí es el
         * caso NORMAL para un enlace viejo, no una avería. Se registra como
         * info y con las DOS carpetas —para no obligar a adivinar cuál de
         * las dos faltaba—, que es lo que hace falta saber si alguien dice
         * que ningún reporte se descarga: casi siempre es que `IA_REPORTES_DIR`
         * o `IA_BACKLOG_CHAT_DIR` apuntan a otro sitio del que se cree.
         */
        request.log.info(
          { id, carpetas, motivo: 'no está en ninguna de las carpetas de PDF' },
          `Reporte ${id} no disponible (probablemente purgado por antigüedad, o el id es de otra sesión)`
        )
        return reply
          .code(404)
          .send({ ok: false, error: 'Reporte no encontrado (puede haberse purgado por antigüedad).' })
      }

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="reporte-${id}.pdf"`)
        .header('Content-Length', String(encontrado.stats.size))
        .send(createReadStream(encontrado.ruta))
    }
  )
}
