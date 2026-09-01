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
 * Sin guarda de autenticación, igual que `GET /api/rag/documentos`: es
 * lectura, no escritura, y las rutas de sólo lectura de este backend no la
 * llevan.
 */
import { z } from 'zod'
import { SISTEMA_IDS } from '../../shared/eva/sistemas.js'

const DiagnosticoQuerySchema = z.object({
  sistema: z.enum(SISTEMA_IDS, { error: 'Falta o no reconozco "sistema".' }),
  riesgoId: z.string().min(1, 'Falta "riesgoId".'),
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
        })
      }

      try {
        const resultado = await motorDiagnostico.diagnosticar(request.query)
        return { ok: true, ...resultado }
      } catch (error) {
        // `diagnosticar()` lanza TypeError ante un riesgoId que no encaja
        // con el sistema — un error de quien llama, no del motor.
        return reply.code(400).send({ ok: false, error: error.message })
      }
    }
  )
}
