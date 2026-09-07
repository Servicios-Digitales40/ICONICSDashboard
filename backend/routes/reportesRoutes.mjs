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
import { esDelUsuario, verificarEnlace } from '../lib/enlacesFirmados.mjs'

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

/**
 * Cada motivo de rechazo, con su código y su frase.
 *
 * ── POR QUÉ NO SON TODOS UN 404 ────────────────────────────────────
 *
 * Porque llevan a arreglos distintos, y el plan lo pedía por escrito: un
 * enlace caducado se arregla pidiendo otro —y quien lo lea tiene que saber que
 * **caducó**, no que el reporte no existe— mientras que uno sin firma o con
 * una firma mala significa que ese enlace nunca fue válido.
 *
 * **No hay período de gracia para los enlaces sin firmar**, y es una decisión:
 * un plazo de gracia sobre una guarda es la guarda apagada con pasos de más, y
 * el coste aquí está acotado —los reportes se purgan a los 30 días y volver a
 * pedir uno es una frase al asistente—. El mensaje lo dice, que era la otra
 * mitad de lo que pedía el plan: no basta con que esté en el código.
 */
const RECHAZOS = {
  caducado: {
    codigo: 410,
    error:
      'Este enlace de descarga ha caducado. El reporte puede seguir existiendo: pídele al ' +
      'asistente que te genere el enlace otra vez.',
  },
  sinFirma: {
    codigo: 403,
    error:
      'Este enlace no lleva firma. Desde que los enlaces de descarga caducan, los antiguos —sin ' +
      'firmar— ya no sirven, y no hay período de gracia. Pídele al asistente que te genere uno nuevo.',
  },
  firma: {
    codigo: 403,
    error: 'La firma de este enlace no es válida. Pídele al asistente que te genere uno nuevo.',
  },
}

function responderAlRechazo(reply, motivo) {
  const { codigo, error } = RECHAZOS[motivo] ?? RECHAZOS.firma
  return reply.code(codigo).send({ ok: false, error })
}

export function registerReportesRoutes(fastify, { config }) {
  /*
   * Sin secreto no se firma nada y la ruta se comporta como antes de esta
   * fase. No se genera uno al vuelo: ver el porqué en `config.reportes`, y el
   * aviso de arranque en `server.mjs`.
   */
  const secreto = config.reportes.firmaSecreto

  fastify.get(
    '/api/reportes',
    {
      /*
       * Esto no lee la planta: ENTREGA un documento ya generado, con cifras de
       * proceso dentro y con lo que se habló en una conversación. Es la única
       * ruta de sólo lectura de este backend que devuelve algo que alguien
       * compuso, así que lleva el rol declarado igual que las escrituras.
       *
       * La guarda de sesión no está aquí: la pone el ámbito, en `app.mjs`, para
       * las treinta y tres rutas a la vez. Ver su comentario.
       */
      onRequest: [fastify.exigirRol('operador')],
      schema: { querystring: ReporteQuerySchema },
    },
    async (request, reply) => {
      const { id, expira, firma, u } = request.query

      /*
       * La firma se comprueba ANTES de mirar el disco: si el enlace no salió
       * de aquí, no tiene por qué enterarse de si ese id existe.
       */
      if (secreto) {
        const veredicto = verificarEnlace({ id, expira, firma, usuario: u, secreto })

        if (!veredicto.ok) {
          request.log.warn(
            { id, motivo: veredicto.motivo, ip: request.ip, usuario: request.usuario?.id },
            `Descarga rechazada de ${id}: ${veredicto.motivo}`
          )
          return responderAlRechazo(reply, veredicto.motivo)
        }

        /*
         * Y el enlace es de quien lo pidió. Con `AUTH_HABILITADA=false` los dos
         * lados valen `anonimo` y esto no niega nada; el día que se encienda,
         * empieza a negar sin tocar una línea. Ver `lib/enlacesFirmados.mjs`.
         */
        if (!esDelUsuario(u, request.usuario?.id)) {
          request.log.warn(
            { id, delEnlace: u, quienPide: request.usuario?.id, ip: request.ip },
            `Descarga rechazada de ${id}: el enlace se emitió para otra persona`
          )
          return reply.code(403).send({
            ok: false,
            error: 'Este enlace se emitió para otro usuario. Pídele al asistente que te genere el tuyo.',
          })
        }
      }

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
