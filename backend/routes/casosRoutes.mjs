/**
 * El cierre de un diagnóstico, por HTTP. Plan 16 Fase 5.
 *
 *   POST /api/casos    registra un caso resuelto (o no) en la bitácora
 *
 * ── LA MISMA PUERTA QUE `registrar_intervencion`, POR OTRO LADO ─────
 *
 * Esta ruta y la herramienta de voz/chat escriben en el MISMO archivo, con
 * el MISMO generador de intervención (`crearIntervencion`) — es la
 * invariante que el plan llama «las dos puertas escriben en el mismo
 * sitio» (§5, Fase 5). Lo que cambia es cuánto trae cada una: la voz trae
 * síntoma y solución dichos en una frase; este formulario, al venir de un
 * diagnóstico ya calculado por el sistema, puede traer además el riesgo
 * que lo disparó, la muestra de sensores, la causa que se propuso y su
 * respaldo, la causa REAL que confirmó el técnico y cómo terminó — la
 * parte opcional de `crearIntervencion` (ver su cabecera en
 * `shared/eva/aprendizaje.js`).
 *
 * ── SIN GUARDA DE ESCRITURA PROPIA, A PROPÓSITO ─────────────────────
 *
 * `registrar_intervencion` nunca ha necesitado `ICONICS_READ_ONLY` ni una
 * bandera propia — escribe en un JSON nuestro, no en el PLC ni sube un
 * archivo arbitrario al disco, que es lo que sí justifica
 * `RAG_UPLOAD_ENABLED` en `ragRoutes.mjs`. Esta ruta es la misma clase de
 * escritura por otra puerta, así que hereda el mismo criterio: sólo pide
 * autenticación y el rol `operador`, igual que las demás rutas que
 * escriben algo que no es la planta.
 */
import { registrarCaso } from '../ia/herramientas/aprendizaje/index.mjs'
import { CrearCasoSchema } from '../http/esquemas.mjs'

export function registerCasosRoutes(fastify) {
  fastify.post(
    '/api/casos',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('operador')],
      schema: { body: CrearCasoSchema },
    },
    async (request, reply) => {
      const resultado = await registrarCaso({
        ...request.body,
        // `origen` sin decidir por el técnico es quién autenticó la
        // petición, no "el usuario" a secas — mismo criterio que
        // `subidoPor` en `ragRoutes.mjs`.
        origen: request.body.origen ?? request.usuario?.id ?? 'el usuario',
      })

      if (!resultado.ok) {
        return reply.code(500).send({ ok: false, error: resultado.error })
      }

      request.log.info(
        {
          id: resultado.caso.id,
          sistema: resultado.caso.sistema,
          riesgoId: resultado.caso.disparador?.riesgoId ?? null,
          resuelto: resultado.caso.resuelto,
          usuario: request.usuario?.id,
        },
        `Caso cerrado: ${resultado.caso.id} (${resultado.caso.resuelto ? 'resuelto' : 'no resuelto'})`
      )

      return reply.code(201).send({ ok: true, caso: resultado.caso })
    }
  )
}
