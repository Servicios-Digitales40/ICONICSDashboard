/**
 * Ruta de accionamiento directo sobre la planta: encender/apagar la bomba
 * desde un botón del tablero, sin pasar por el asistente de IA.
 *
 * Pasa por `herramientas.ejecutar('controlar_bomba', …)`, la MISMA función
 * que usa el chat, para no duplicar ninguna de sus dos guardas (solo
 * lectura, nivel de tanque) ni su relectura de confirmación tras escribir.
 */
import { readJsonBody, RequestBodyError } from '../http/requestBody.mjs'
import { sendError, sendJson } from '../http/responses.mjs'
import { logger } from '../logger.mjs'

export function registerControlRoutes(router, { config, herramientas }) {
  router.post('/api/control/bomba', async ({ request, response }) => {
    let cuerpo
    try {
      cuerpo = await readJsonBody(request, config.limits.maxRequestBodyBytes)
    } catch (error) {
      if (error instanceof RequestBodyError) return sendError(response, error.statusCode, error.message)
      throw error
    }

    const encender = cuerpo?.encender
    if (typeof encender !== 'boolean') {
      return sendError(response, 400, 'Falta decir si hay que encender (true) o apagar (false) la bomba.')
    }

    const resultado = await herramientas.ejecutar('controlar_bomba', { encender })

    if (!resultado.ok) {
      const status = /ICONICS_READ_ONLY/.test(resultado.error ?? '') ? 403 : 409
      logger.warn('Control de bomba rechazado', { encender, motivo: resultado.error })
      return sendError(response, status, resultado.error ?? 'No se pudo accionar la bomba.')
    }

    logger.info('Control de bomba', { encender, accion: resultado.accion })
    sendJson(response, 200, { ok: true, accion: resultado.accion, tag: resultado.tag })
  })
}
