/**
 * Ruta de accionamiento directo sobre la planta: encender/apagar la bomba
 * desde un botón del tablero, sin pasar por el asistente de IA.
 *
 * Pasa por `herramientas.ejecutar('controlar_bomba', …)`, la MISMA función
 * que usa el chat, para no duplicar ninguna de sus dos guardas (solo
 * lectura, nivel de tanque) ni su relectura de confirmación tras escribir.
 *
 * ── EL DIARIO, DESDE EL PLAN 22 F3 (SEG-08) ────────────────────────
 *
 * Cada orden —cumplida o rechazada— se anota además en
 * `datos/diario-accionamientos.jsonl`. El log de pino que ya había sigue
 * estando y no lo sustituye: uno sirve para diagnosticar el servicio y el otro
 * para contestar, meses después, por qué arrancó la bomba a las tres de la
 * mañana. El log rota y el contenedor se reinicia; el diario no.
 *
 * El motivo por el que el diario no puede tumbar la petición está en la
 * cabecera de `lib/diario.mjs`: cuando se anota, la bomba YA se accionó.
 */
import { ControlBombaSchema } from '../http/esquemas.mjs'
import { crearDiario } from '../lib/diario.mjs'

export function registerControlRoutes(fastify, { herramientas, diario = crearDiario() }) {
  fastify.post(
    '/api/control/bomba',
    {
      /*
       * Accionar una bomba es la operación de más consecuencia de toda la API.
       * Declara ya las dos guardas que hará falta el día que haya usuarios:
       * estar autenticado y tener el rol que puede escribir sobre la planta.
       * Mientras `AUTH_HABILITADA` sea falso las dos dejan pasar. Ver
       * `http/plugins/autenticacion.mjs`.
       */
      onRequest: [fastify.autenticar, fastify.exigirRol('operador')],
      schema: { body: ControlBombaSchema },
    },
    async (request, reply) => {
      const { encender } = request.body
      const accionPedida = encender ? 'encender' : 'apagar'
      const quien = { ip: request.ip, usuario: request.usuario?.id ?? null }

      const resultado = await herramientas.ejecutar('controlar_bomba', { encender })

      if (!resultado.ok) {
        const esSoloLectura = /ICONICS_READ_ONLY/.test(resultado.error ?? '')
        const status = esSoloLectura ? 403 : 409

        /*
         * El rechazo se anota igual que la orden cumplida. «No la encendí
         * porque el tanque estaba al 92 %» contesta a la misma pregunta que
         * «la encendí», y un diario que sólo guardara los éxitos daría a
         * entender que en esas horas nadie intentó nada.
         */
        await anotar(request, {
          resultado: 'rechazada',
          accion: accionPedida,
          motivo: resultado.error ?? null,
          ...quien,
        })

        request.log.warn(
          {
            accion: accionPedida,
            estado: status,
            motivo: resultado.error,
            ...quien,
          },
          esSoloLectura
            ? `Intento de ${accionPedida} la bomba rechazado: el puente está en modo solo lectura. ` +
              'Arranca con ICONICS_READ_ONLY=false para habilitar la escritura.'
            : `Intento de ${accionPedida} la bomba rechazado por una guarda de seguridad: ${resultado.error}`
        )

        return reply.code(status).send({
          ok: false,
          error: resultado.error ?? 'No se pudo accionar la bomba.',
        })
      }

      /*
       * `valorLeido` y `coinciden` no se calculan aquí: los produce la
       * relectura de confirmación del Plan 21 F5 y viajan en el sobre de la
       * escritura. El diario sólo persiste lo que hasta hoy se tiraba.
       */
      await anotar(request, {
        resultado: 'cumplida',
        accion: accionPedida,
        tag: resultado.tag,
        valorPedido: resultado.confirmacion?.pedido ?? encender,
        valorLeido: resultado.confirmacion?.leido ?? null,
        coinciden: resultado.confirmacion?.coincide ?? null,
        intentos: resultado.confirmacion?.intentos ?? null,
        ...quien,
      })

      /*
       * Una escritura sobre la planta se registra SIEMPRE y con quién la pidió.
       * Es la línea que se busca cuando alguien pregunta por qué arrancó la
       * bomba a las tres de la mañana.
       */
      request.log.info(
        {
          accion: resultado.accion,
          tag: resultado.tag,
          ...quien,
        },
        `Bomba accionada desde el tablero: ${resultado.accion} sobre ${resultado.tag} (petición de ${request.ip})`
      )

      return { ok: true, accion: resultado.accion, tag: resultado.tag }
    }
  )

  /**
   * Anota en el diario y, si no se pudo, lo dice en el log.
   *
   * El fallo NO se propaga: ver la cabecera. Pero tampoco se traga — un diario
   * que dejó de escribir sin que nadie se entere es el mismo problema que no
   * tenerlo, sólo que descubierto más tarde.
   */
  async function anotar(request, entrada) {
    const { ok, error } = await diario.anotar(entrada)
    if (!ok) {
      request.log.error(
        { error, entrada },
        'No se pudo anotar el accionamiento en el diario. La orden SÍ se ejecutó; ' +
          'lo que falta es su constancia en disco. Revisa permisos y espacio en `datos/`.'
      )
    }
  }
}
