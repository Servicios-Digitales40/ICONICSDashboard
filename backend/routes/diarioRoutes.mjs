/**
 * El diario de accionamientos, por HTTP. Plan 25 F1.
 *
 *   GET /api/diario?desde=&hasta=&limite=&cursor=    quién accionó qué, y cuándo
 *
 * ── POR QUÉ NO EXISTÍA HASTA HOY, Y POR QUÉ HACE FALTA AHORA ───────
 *
 * El diario (SEG-08, Plan 22 F3) era de **sólo escritura**: `controlRoutes` y el
 * acuse de alarmas anotaban en `datos/diario-accionamientos.jsonl`, y nadie
 * podía leerlo sin entrar al servidor con un `cat`. Eso bastaba mientras su
 * único propósito fuera responder meses después a «por qué arrancó la bomba a
 * las tres de la mañana» con alguien delante de la máquina.
 *
 * La vista de Turno (Plan 25 F2) y el cuaderno de planta (F8) necesitan esos
 * mismos hechos EN PANTALLA. La alternativa —que la vista se inventara de dónde
 * saca lo que pasó— choca de frente con §2.5.
 *
 * ── POR QUÉ LLEVA `exigirRol` SIENDO LECTURA ───────────────────────
 *
 * Porque este backend no le pone rol a las lecturas —`GET /api/casos`,
 * `/api/diagnostico` y `GET /api/rag/documentos` no lo llevan— y ésta es la
 * excepción, a propósito.
 *
 * Cada entrada trae `ip` y `usuario`: no dice sólo qué pasó en la instalación,
 * dice **quién lo hizo y desde dónde**. Eso es un registro de personas, no de
 * proceso, y merece el mismo trato que la escritura que lo generó. Que hoy
 * `AUTH_HABILITADA` esté en `false` no cambia el criterio: se declara ahora
 * para que el día que se encienda esta ruta ya esté del lado correcto — no al
 * revés, que es cómo veinte rutas se quedaron sin guarda antes del Plan 20 F5.
 *
 * La guarda de autenticación NO se declara aquí: la pone el ámbito donde se
 * registran las rutas de API (`app.mjs`), para todas a la vez, y
 * `test/rutas/guardas.test.mjs` recorre el inventario real para que no haya
 * huecos. Lo que sí se declara ruta a ruta es `exigirRol`, que es donde hay
 * criterio.
 *
 * ── LO QUE ESTA RUTA NO HACE ───────────────────────────────────────
 *
 * No escribe. El diario lo escriben quienes accionan —`controlRoutes` con la IP
 * y el usuario, el acuse de alarmas por su lado—, cada uno en el momento en que
 * la orden ocurrió. Una ruta que dejara *añadir* entradas al diario permitiría
 * escribir historia que no pasó, que es exactamente lo contrario de para qué
 * existe un diario de accionamientos.
 */
import { DiarioQuerySchema } from '../http/esquemas.mjs'
import { CODIGOS, responderError } from '../http/codigos.mjs'

export function registerDiarioRoutes(fastify, { diario }) {
  fastify.get(
    '/api/diario',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('operador')],
      schema: { querystring: DiarioQuerySchema },
    },
    async (request, reply) => {
      if (!diario) {
        return reply.code(503).send({
          ok: false,
          error: 'Este servidor no tiene el diario de accionamientos montado.',
          codigo: CODIGOS.ERROR_DIARIO_SIN_MONTAR,
        })
      }

      const { desde, hasta, limite, cursor } = request.query

      /*
       * Un rango al revés se rechaza en vez de devolver una lista vacía: vacío
       * se lee como «no pasó nada en esas horas», que es una afirmación sobre
       * la instalación. Esto es un error de quien pregunta (§2.4).
       */
      if (desde && hasta && desde.getTime() > hasta.getTime()) {
        return responderError(
          reply, 400, CODIGOS.ERROR_VALIDACION,
          '"desde" es posterior a "hasta": el rango está invertido.'
        )
      }

      try {
        const { entradas, total, cursor: siguiente, podas } = await diario.leer({
          desde: desde ?? null,
          hasta: hasta ?? null,
          limite,
          cursor,
        })

        return {
          ok: true,
          entradas,
          total,
          cursor: siguiente,
          /*
           * `podas` viaja aunque sea 0. Una poda dice que faltan entradas que
           * SÍ existieron, y quien lee el diario tiene que poder distinguir
           * «no pasó nada» de «ya no está guardado» sin adivinarlo.
           */
          podas,
        }
      } catch (error) {
        /*
         * Aquí sí se propaga, al revés que en `anotar()`: cuando se anota, la
         * bomba ya se accionó y perder la línea es preferible a decirle al
         * operador que su orden falló. Leyendo no hay nada que salvar — una
         * lectura que falla y devuelve `[]` diría que el turno estuvo tranquilo.
         */
        request.log.error({ error: error.message }, 'No se pudo leer el diario de accionamientos.')
        return responderError(
          reply, 500, CODIGOS.ERROR_SERVER,
          'No se pudo leer el diario de accionamientos.'
        )
      }
    }
  )
}
