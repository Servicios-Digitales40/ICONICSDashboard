/**
 * El catálogo de manuales de planta, por HTTP. Plan 16 Fase 1.
 *
 *   GET    /api/rag/documentos                        qué hay, con su estado de indexación
 *   POST   /api/rag/documentos?nombre=&sistema=&titulo=  sube uno nuevo
 *   PUT    /api/rag/documentos?id=                     reemplaza el contenido de uno existente
 *   PATCH  /api/rag/documentos?id=                     lo archiva
 *
 * No hay DELETE. Ver la cabecera de `backend/ia/manuales.mjs`.
 *
 * ── POR QUÉ EL CUERPO DE SUBIR/REEMPLAZAR SON BYTES, NO JSON ────────
 *
 * Mismo criterio que `/api/voz`: el archivo llega tal cual —`Content-Type:
 * application/octet-stream`—, sin envolverlo en base64 dentro de un JSON, que
 * infla el cuerpo en un tercio, y sin traer una librería de multipart para un
 * caso de uso que no la necesita: un archivo, sin más campos que los que ya
 * caben en la query string. El parser que lo convierte a `Buffer` es el
 * compartido de `http/plugins/cuerpoCrudo.mjs` —no se registra otro aquí; ver
 * su cabecera para por qué dos rutas no pueden tener cada una el suyo—, y
 * `bodyLimit` en cada ruta de abajo es lo que recorta su techo genérico al
 * tamaño real que admite un manual.
 *
 * ── POR QUÉ ESTAS TRES RUTAS COMPARTEN GUARDA ────────────────────────
 *
 * Subir, reemplazar y archivar cambian lo que este servidor tiene escrito en
 * disco. Las tres se niegan igual, y por el mismo motivo, si falta
 * `IA_DOCS_DIR` (no hay dónde escribir) o si `RAG_UPLOAD_ENABLED` sigue en su
 * valor por defecto (nadie ha decidido que este servidor acepte cambios en su
 * catálogo de manuales). Ver la cabecera de `ragUploadEnabled` en
 * `backend/config.mjs` para por qué `ICONICS_READ_ONLY` no basta.
 */
import {
  ArchivarManualQuerySchema,
  ReemplazarManualQuerySchema,
  SubirManualQuerySchema,
} from '../http/esquemas.mjs'
import { MAX_BYTES } from '../ia/documentos.mjs'

/**
 * Guarda de `Content-Length` ANTES de leer el cuerpo, para que un archivo
 * demasiado grande dé un 413 que LLEGA al cliente en vez de un socket
 * cortado a medio subir. Es la misma lección, documentada con más detalle,
 * que ya costó aprender en `vozRoutes.mjs`.
 */
function rechazarSiExcede(maxBytes) {
  return async (request, reply) => {
    const declarado = Number(request.headers['content-length'] ?? 0)
    if (declarado > maxBytes) {
      const mb = Math.round(maxBytes / 1024 / 1024)
      return reply.code(413).send({
        ok: false,
        error: `El archivo supera el límite de ${mb} MB.`,
      })
    }
  }
}

/** Las dos guardas que comparten las tres rutas de escritura: dónde escribir,
 *  y si este servidor acepta escribir ahí. Devuelve `null` cuando puede
 *  seguir; si no, ya envió la respuesta y quien llama debe devolver eso. */
function negarSiNoSePuedeEscribir(config, gestorManuales, reply) {
  if (!gestorManuales) {
    reply.code(503).send({
      ok: false,
      error: 'Este servidor no tiene documentación de planta configurada (falta IA_DOCS_DIR).',
    })
    return true
  }
  if (!config.ia.ragUploadEnabled) {
    reply.code(403).send({
      ok: false,
      error:
        'La carga de manuales está desactivada en este servidor. Actívala con RAG_UPLOAD_ENABLED=true.',
    })
    return true
  }
  return false
}

export function registerRagRoutes(fastify, { config, indiceDocumentos, gestorManuales }) {
  fastify.get('/api/rag/documentos', async () => {
    const manuales = gestorManuales ? await gestorManuales.listar() : []
    const estadoIndice = indiceDocumentos?.estado() ?? null

    // Los fragmentos y el motivo de ilegible salen del ÍNDICE, no del
    // catálogo: son lo que el índice de verdad extrajo de cada archivo, y es
    // la única forma honesta de decir «este manual está roto» — el catálogo
    // por sí solo no sabe si un PDF se pudo leer.
    const fragmentosPorArchivo = new Map((estadoIndice?.documentos ?? []).map(d => [d.archivo, d.fragmentos]))
    const motivoIlegiblePorArchivo = new Map((estadoIndice?.ilegibles ?? []).map(i => [i.archivo, i.motivo]))

    return {
      ok: true,
      configurado: Boolean(indiceDocumentos),
      cargaHabilitada: config.ia.ragUploadEnabled,
      modo: estadoIndice?.modo ?? null,
      indexando: estadoIndice?.indexando ?? false,
      progreso: estadoIndice?.progreso ?? null,
      manuales: manuales.map(m => ({
        ...m,
        fragmentos: m.estado === 'activo' ? fragmentosPorArchivo.get(m.archivo) ?? 0 : null,
        motivoIlegible: m.estado === 'activo' ? motivoIlegiblePorArchivo.get(m.archivo) ?? null : null,
      })),
    }
  })

  fastify.post(
    '/api/rag/documentos',
    {
      bodyLimit: MAX_BYTES,
      onRequest: [fastify.autenticar, fastify.exigirRol('operador'), rechazarSiExcede(MAX_BYTES)],
      schema: { querystring: SubirManualQuerySchema },
    },
    async (request, reply) => {
      if (negarSiNoSePuedeEscribir(config, gestorManuales, reply)) return

      const bytes = request.body
      if (!Buffer.isBuffer(bytes) || !bytes.length) {
        return reply.code(400).send({ ok: false, error: 'No ha llegado ningún archivo.' })
      }

      const { nombre, sistema, titulo } = request.query
      const resultado = await gestorManuales.subir({
        bytes,
        nombreOriginal: nombre,
        sistema: sistema || null,
        titulo: titulo || null,
        subidoPor: request.usuario?.id ?? 'desconocido',
      })

      if (!resultado.ok) {
        return reply.code(400).send({ ok: false, error: resultado.error })
      }

      request.log.info(
        { id: resultado.manual.id, archivo: resultado.manual.archivo, usuario: request.usuario?.id },
        `Manual subido: ${resultado.manual.archivo} (${bytes.length} bytes, sistema=${resultado.manual.sistema ?? 'toda la planta'})`
      )

      return reply.code(201).send({ ok: true, manual: resultado.manual })
    }
  )

  fastify.put(
    '/api/rag/documentos',
    {
      bodyLimit: MAX_BYTES,
      onRequest: [fastify.autenticar, fastify.exigirRol('operador'), rechazarSiExcede(MAX_BYTES)],
      schema: { querystring: ReemplazarManualQuerySchema },
    },
    async (request, reply) => {
      if (negarSiNoSePuedeEscribir(config, gestorManuales, reply)) return

      const bytes = request.body
      if (!Buffer.isBuffer(bytes) || !bytes.length) {
        return reply.code(400).send({ ok: false, error: 'No ha llegado ningún archivo.' })
      }

      const resultado = await gestorManuales.reemplazar({
        id: request.query.id,
        bytes,
        subidoPor: request.usuario?.id ?? 'desconocido',
      })

      if (!resultado.ok) {
        const noExiste = /No hay ningún manual/.test(resultado.error)
        return reply.code(noExiste ? 404 : 400).send({ ok: false, error: resultado.error })
      }

      request.log.info(
        { id: resultado.manual.id, version: resultado.manual.version, usuario: request.usuario?.id },
        `Manual reemplazado: ${resultado.manual.archivo} → versión ${resultado.manual.version}`
      )

      return { ok: true, manual: resultado.manual }
    }
  )

  fastify.patch(
    '/api/rag/documentos',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('operador')],
      schema: { querystring: ArchivarManualQuerySchema },
    },
    async (request, reply) => {
      if (negarSiNoSePuedeEscribir(config, gestorManuales, reply)) return

      const resultado = await gestorManuales.archivar({ id: request.query.id })

      if (!resultado.ok) {
        const noExiste = /No hay ningún manual/.test(resultado.error)
        return reply.code(noExiste ? 404 : 400).send({ ok: false, error: resultado.error })
      }

      request.log.info(
        { id: resultado.manual.id, usuario: request.usuario?.id },
        `Manual archivado: ${resultado.manual.archivo}`
      )

      return { ok: true, manual: resultado.manual }
    }
  )
}
