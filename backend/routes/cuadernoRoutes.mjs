/**
 * El cuaderno de planta, por HTTP. Plan 25 F8 (`NUE-10`).
 *
 *   GET  /api/cuaderno?desde=&hasta=&limite=&cursor=   las notas, más reciente primero
 *   POST /api/cuaderno                                  añade una nota
 *
 * ── QUÉ ES, Y QUÉ NO ES ─────────────────────────────────────────────
 *
 * Notas de una PERSONA delante de la máquina — «cambié el filtro», «la bomba
 * hace ruido al arrancar» — junto a los hechos del diario de accionamientos
 * (F1). No es el mismo archivo: el diario es lo que el SISTEMA registró
 * (`lib/diario.mjs`, la instancia `cuaderno` es OTRA, ver `app.mjs`); esto es
 * lo que dice una persona, sin que nada lo confirme. Mezclarlos borraría la
 * diferencia entre un hecho y una afirmación (ver `config.mjs`, bloque
 * `cuaderno:`).
 *
 * ── SIN GUARDA DE ESCRITURA PROPIA, A PROPÓSITO ─────────────────────
 *
 * Mismo criterio que `casosRoutes.mjs`: escribe en un JSON/JSONL nuestro, no
 * en el PLC ni sube un archivo arbitrario, así que no necesita
 * `ICONICS_READ_ONLY` ni una bandera propia. Sólo pide autenticación y el rol
 * `operador`, igual que las demás rutas que escriben algo que no es la planta.
 *
 * ── POR QUÉ `exigirRol` TAMBIÉN EN LA LECTURA ───────────────────────
 *
 * Mismo motivo que `GET /api/diario` (F1): cada nota trae `autor`, y eso es
 * información de personas, no sólo de la instalación. Es la SEGUNDA excepción
 * de este backend a «las lecturas no llevan rol» — y por el mismo motivo que
 * la primera.
 *
 * ── EL AUTOR Y LA HORA NO LOS PONE EL CLIENTE ───────────────────────
 *
 * Los pone el servidor: `request.usuario?.id` (con `AUTH_HABILITADA=false`,
 * hoy, siempre `"anonimo"` — honesto, porque no hay identidad real todavía) y
 * el reloj de `crearDiario()`. Un campo `autor` que aceptara lo que mande el
 * cliente sería un campo que cualquiera puede falsificar, y «quién lo dijo» es
 * precisamente lo que un cuaderno no puede dejar en sus manos.
 *
 * ── POR QUÉ UNA NOTA QUE FALLA AL GUARDAR SÍ SE PROPAGA ─────────────
 *
 * Al revés que `anotar()` en el diario de accionamientos: ahí la bomba YA se
 * accionó, y un 500 le mentiría al operador sobre si su orden se ejecutó. Aquí
 * no hay ningún "ya pasó" que proteger — si la nota no se guardó, la persona
 * necesita saberlo para volver a intentarlo, no creer que quedó escrita.
 */
import { CuadernoNotaSchema, CuadernoQuerySchema } from '../http/esquemas.mjs'
import { CODIGOS, responderError } from '../http/codigos.mjs'

export function registerCuadernoRoutes(fastify, { cuaderno }) {
  fastify.get(
    '/api/cuaderno',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('operador')],
      schema: { querystring: CuadernoQuerySchema },
    },
    async (request, reply) => {
      if (!cuaderno) {
        return reply.code(503).send({
          ok: false,
          error: 'Este servidor no tiene el cuaderno de planta montado.',
          codigo: CODIGOS.ERROR_CUADERNO_SIN_MONTAR,
        })
      }

      const { desde, hasta, limite, cursor } = request.query

      // Mismo criterio que /api/diario: un rango invertido se rechaza, no se
      // contesta con una lista vacía que se leería como «nadie escribió nada».
      if (desde && hasta && desde.getTime() > hasta.getTime()) {
        return responderError(
          reply, 400, CODIGOS.ERROR_VALIDACION,
          '"desde" es posterior a "hasta": el rango está invertido.'
        )
      }

      try {
        const { entradas, total, cursor: siguiente, podas } = await cuaderno.leer({
          desde: desde ?? null,
          hasta: hasta ?? null,
          limite,
          cursor,
        })

        return { ok: true, entradas, total, cursor: siguiente, podas }
      } catch (error) {
        request.log.error({ error: error.message }, 'No se pudo leer el cuaderno de planta.')
        return responderError(reply, 500, CODIGOS.ERROR_SERVER, 'No se pudo leer el cuaderno de planta.')
      }
    }
  )

  fastify.post(
    '/api/cuaderno',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('operador')],
      schema: { body: CuadernoNotaSchema },
    },
    async (request, reply) => {
      if (!cuaderno) {
        return reply.code(503).send({
          ok: false,
          error: 'Este servidor no tiene el cuaderno de planta montado.',
          codigo: CODIGOS.ERROR_CUADERNO_SIN_MONTAR,
        })
      }

      const { texto, sistema } = request.body

      const { ok, error } = await cuaderno.anotar({
        texto,
        ...(sistema ? { sistema } : {}),
        // NUNCA del cliente: ver la cabecera.
        autor: request.usuario?.id ?? 'anonimo',
      })

      if (!ok) {
        request.log.error({ error }, 'No se pudo guardar la nota del cuaderno de planta.')
        return responderError(reply, 500, CODIGOS.ERROR_SERVER, 'No se pudo guardar la nota. Vuelve a intentarlo.')
      }

      return reply.code(201).send({ ok: true })
    }
  )
}
