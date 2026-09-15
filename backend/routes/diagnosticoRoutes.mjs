/**
 * El diagnóstico de un riesgo, por HTTP. Plan 16 Fase 5 (UI A).
 *
 *   GET /api/diagnostico?sistema=&riesgoId=    las causas candidatas, puntuadas
 *
 * ── PARA QUÉ EXISTE, SI YA HAY UNA HERRAMIENTA DE CHAT ──────────────
 *
 * `diagnosticar_falla` (Plan 16 Fase 4) le da el mismo resultado al MODELO,
 * para que lo narre. Esta ruta le da el mismo resultado —literalmente el
 * mismo `motorDiagnostico.diagnosticar()`, ninguna lógica propia— a la
 * pantalla de cierre de diagnóstico (`CierreDiagnostico.jsx`), que necesita
 * la lista de causas para PRE-RELLENAR el formulario sin pasar por una
 * conversación con el modelo — el técnico no está ahí para charlar, está
 * ahí para cerrar un caso.
 *
 * La guarda de autenticación ya NO se declara aquí, y no porque se haya
 * quitado: desde el Plan 20 F5 la pone el ámbito donde se registran las rutas
 * de API (`app.mjs`), para las treinta y tres a la vez. Esta cabecera decía
 * que las rutas de sólo lectura no la llevaban — y ese criterio, aplicado ruta
 * por ruta, dejó veinte sin guarda de las que nadie llevaba la cuenta.
 *
 * Lo que sigue sin llevar esta ruta es `exigirRol`: leer un diagnóstico ya
 * calculado no acciona nada.
 */
import { z } from 'zod'
import { SISTEMA_IDS } from '../../shared/eva/comun/sistemas.js'
import { CODIGOS, responderError } from '../http/codigos.mjs'

/**
 * ── `valoresSensores` POR FIN TIENE QUIEN LO TRAIGA (PLAN 28 F1) ────
 *
 * `diagnosticar()` admite `valoresSensores` desde el Plan 17 F4 —es lo que le
 * permite citar la frase de `datos` con cifras— y su JSDoc decía, medido el
 * 09-09-2026, que **no lo traía NADIE**: esta ruta era la única entrada de
 * producción y su Zod sólo dejaba pasar `sistema` y `riesgoId`. Un camino
 * escrito, probado y nunca recorrido.
 *
 * Llega como JSON en la query porque este endpoint es un GET y la muestra es
 * un objeto pequeño —las señales que declara el `necesita` de una regla, no la
 * planta entera—. Si alguna vez crece, el sitio correcto es un POST, no un
 * query string más largo.
 *
 * Es OPCIONAL y sigue siéndolo: sin él el diagnóstico es exactamente el de
 * siempre. Lo que cambia es que ahora la frase de `datos` y el snapshot pueden
 * llevar las lecturas de verdad cuando quien llama las tiene a mano.
 */
const ValoresSensoresSchema = z
  .string()
  .transform((texto, ctx) => {
    try {
      const objeto = JSON.parse(texto)
      if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) {
        ctx.addIssue({ code: 'custom', message: '"valoresSensores" tiene que ser un objeto JSON.' })
        return z.NEVER
      }
      return objeto
    } catch {
      ctx.addIssue({ code: 'custom', message: '"valoresSensores" no es JSON válido.' })
      return z.NEVER
    }
  })
  .optional()

const DiagnosticoQuerySchema = z.object({
  sistema: z.enum(SISTEMA_IDS, { error: 'Falta o no reconozco "sistema".' }),
  riesgoId: z.string().min(1, 'Falta "riesgoId".'),
  valoresSensores: ValoresSensoresSchema,
})

export function registerDiagnosticoRoutes(fastify, { motorDiagnostico }) {
  fastify.get(
    '/api/diagnostico',
    { schema: { querystring: DiagnosticoQuerySchema } },
    async (request, reply) => {
      if (!motorDiagnostico) {
        return reply.code(503).send({
          ok: false,
          error: 'Este servidor no tiene el motor de diagnóstico montado.',
          codigo: CODIGOS.ERROR_MOTOR_SIN_MONTAR,
        })
      }

      try {
        const resultado = await motorDiagnostico.diagnosticar(request.query)
        return { ok: true, ...resultado }
      } catch (error) {
        // `diagnosticar()` lanza TypeError ante un riesgoId que no encaja
        // con el sistema — un error de quien llama, no del motor.
        return responderError(reply, 400, CODIGOS.ERROR_DIAGNOSTICO, error.message)
      }
    }
  )
}
