/**
 * La bitácora de intervenciones, por HTTP. Plan 16 Fase 5 (el cierre) y la
 * pantalla de revisión que se añadió después.
 *
 *   GET    /api/casos       la bitácora entera, de la más reciente atrás
 *   POST   /api/casos       registra un caso resuelto (o no)
 *   PATCH  /api/casos/:id   archiva uno, o lo devuelve — ver `archivarCaso`
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
 * `shared/eva/comun/aprendizaje.js`).
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
import { archivarCaso, listarCasos, registrarCaso } from '../ia/herramientas/aprendizaje/index.mjs'
import { ArchivarCasoSchema, CasoPorIdParamsSchema, CrearCasoSchema } from '../http/esquemas.mjs'

export function registerCasosRoutes(fastify) {
  /**
   * La bitácora entera, para la pantalla de revisión (`CasosRag.jsx`).
   *
   * Sin guarda de autenticación, igual que `GET /api/rag/documentos` y
   * `GET /api/diagnostico`: es lectura, y las rutas de sólo lectura de este
   * backend no la llevan. La ESCRITURA de al lado sí.
   *
   * Devuelve el registro completo de cada caso, sin recortar campos: la
   * pantalla enseña la muestra de sensores y el desglose del diagnóstico
   * propuesto, y decidir aquí qué es «lo importante» obligaría a tocar el
   * backend cada vez que la vista quiera enseñar un campo más.
   */
  fastify.get('/api/casos', { onRequest: [fastify.autenticar] }, async () => {
    const casos = await listarCasos()
    return { ok: true, total: casos.length, casos }
  })

  /**
   * Archivar una intervención, o devolverla. Ver `archivarCaso` en
   * `ia/herramientas/aprendizaje/index.mjs` para por qué la baja es
   * archivar y no borrar.
   *
   * `PATCH` y no `DELETE` porque no se borra nada, y porque la MISMA ruta
   * hace las dos direcciones según `archivado`. Es también el verbo con el
   * que se archiva un manual (`PATCH /api/rag/documentos`): las dos bajas
   * de la sección RAG se piden igual.
   *
   * Misma guarda que el POST —autenticación y rol `operador`—: es
   * escritura, y de la que más importa, porque un caso archivado deja de
   * respaldar diagnósticos futuros.
   */
  fastify.patch(
    '/api/casos/:id',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('operador')],
      schema: { params: CasoPorIdParamsSchema, body: ArchivarCasoSchema },
    },
    async (request, reply) => {
      const { archivado } = request.body
      const resultado = await archivarCaso(request.params.id, { archivado })

      if (!resultado.ok) {
        return reply.code(500).send({ ok: false, error: resultado.error })
      }
      if (!resultado.encontrado) {
        return reply.code(404).send({
          ok: false,
          error: `No hay ninguna intervención con id "${request.params.id}".`,
        })
      }

      request.log.info(
        { id: resultado.caso.id, archivado, usuario: request.usuario?.id },
        `Caso ${archivado ? 'archivado' : 'devuelto a la bitácora activa'}: ${resultado.caso.id}`
      )

      return { ok: true, caso: resultado.caso }
    }
  )

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
