/**
 * El asistente: `GET /api/chat` para saber si existe, `POST /api/chat` para
 * preguntarle.
 *
 * ── POR QUÉ SSE Y NO UN JSON AL FINAL ──────────────────────────────
 *
 * Una respuesta tarda entre 30 y 90 segundos con este modelo. Un `fetch` que
 * no devuelve nada durante minuto y medio es indistinguible de uno colgado:
 * el operador pulsa otra vez, y ahora hay dos preguntas compitiendo por la
 * misma GPU. Con SSE la pantalla recibe el primer estado en milisegundos y
 * los tokens conforme se generan.
 *
 * ── UNA CONSULTA A LA VEZ, PERO SIN RECHAZAR NINGUNA ───────────────
 *
 * El modelo corre parcialmente en CPU y una sola GPU. Dos preguntas
 * simultáneas no tardan lo mismo cada una: se reparten el hardware y tardan el
 * doble las dos, así que atenderlas en paralelo no gana tiempo total.
 *
 * Antes, la segunda recibía un 409 diciendo que esperara. Con el tablero
 * abierto en la sala de control y en el taller eso es el caso NORMAL, no el
 * raro: quien pregunta el segundo recibe un error por hacer algo razonable, no
 * sabe cuándo reintentar, y lo natural es que vuelva a pulsar y vuelva a
 * chocar.
 *
 * Ahora se encola (`ia/conversacion/cola.mjs`). El flujo SSE se abre de inmediato y el que
 * espera recibe su puesto en la fila —«hay 2 consultas por delante»— y luego su
 * respuesta, sola, cuando le toca. El 503 se reserva para cuando la fila es tan
 * larga que esperar dejaría de tener sentido.
 *
 * ── POR QUÉ ESTA RUTA SE SALE DE FASTIFY ───────────────────────────
 *
 * `reply.hijack()` entrega el socket crudo y desactiva el ciclo normal de
 * respuesta. Es deliberado y es la única ruta que lo hace: un flujo SSE se
 * escribe token a token durante minutos, y el serializador de Fastify está
 * pensado para componer UNA respuesta y enviarla. Escribir sobre `reply.raw`
 * es exactamente lo que hacía el servidor anterior, así que el comportamiento
 * de streaming —el que ya costó descubrir con los proxies— queda intacto.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CambiarModeloSchema, ChatSchema, ExportarChatSchema } from '../http/esquemas.mjs'
import { firmarEnlace } from '../lib/enlacesFirmados.mjs'
import { CODIGOS, responderError } from '../http/codigos.mjs'
import { etiquetasDeReporte } from '../ia/i18n/etiquetasReporte.mjs'

export function registerChatRoutes(fastify, { config, chat, cola, diarioConversaciones = null }) {
  /**
   * Una línea por turno, en disco (Plan 23 F6 · IA-10).
   *
   * ── POR QUÉ NO BASTA EL LOG ────────────────────────────────────────
   *
   * Justo debajo hay un `request.log.info` con la pregunta y el resumen, y es
   * bueno — pero es un log: rota, se pierde al reiniciar el contenedor, y en
   * una instalación sin destino persistente configurado no queda nada. Esto es
   * lo mismo que `lib/diario.mjs` hace con los accionamientos, aplicado a la
   * otra pregunta que se hace meses después: «¿qué se le preguntó al asistente
   * y por dónde fue a mirar?».
   *
   * ── QUÉ ENTRA Y QUÉ NO ─────────────────────────────────────────────
   *
   * El nombre de cada herramienta y sus argumentos, NO sus resultados. Los
   * resultados son datos de planta —a veces series enteras— y duplicarlos en
   * disco no añade nada: con el nombre y los argumentos se reconstruye la
   * consulta y se vuelve a ejecutar si hace falta, que es exactamente lo que
   * hace `medir-asistente.mjs`. Es la misma frontera que defiende
   * `separarAdjuntos` en `chat.mjs`.
   *
   * No lanza: cuando se anota, el turno ya se contestó. Mismo criterio que el
   * diario de accionamientos.
   */
  async function anotarTurno(request, entrada) {
    if (!diarioConversaciones) return
    const { ok, error } = await diarioConversaciones.anotar(entrada)
    if (!ok) {
      request.log.error(
        { error },
        'No se pudo anotar el turno en el diario de conversaciones. La respuesta SÍ se entregó; ' +
          'lo que falta es su constancia en disco. Revisa permisos y espacio en `datos/`.'
      )
    }
  }


  fastify.get('/api/chat', async () => ({
    ok: true,
    habilitado: config.ia.isConfigured,
    modelo: config.ia.isConfigured ? chat.modeloActivo() : null,
    /*
     * El catálogo elegible. Vacío significa «no ofrezcas selector», que es lo
     * correcto en una instalación con un solo modelo: un desplegable de una
     * sola opción es peor que ninguno. Ver `readModelos` en `config.mjs`.
     */
    modelos: config.ia.isConfigured ? config.ia.modelos : [],
    /*
     * `ocupado` se mantiene por compatibilidad con clientes anteriores, pero
     * ya no significa «no puedes preguntar»: significa «hay alguien delante».
     * Un frontend viejo que lo lea seguirá pintando el aviso; el nuevo pinta
     * el puesto en la fila, que es más útil.
     */
    ocupado: cola.estado().atendiendo,
    enEspera: cola.estado().enEspera,
  }))

  /**
   * Cambia el modelo activo, para TODAS las pantallas.
   *
   * Es un `PUT` y no un `POST` porque es idempotente: pedir dos veces el mismo
   * modelo deja el servidor igual que pedirlo una.
   *
   * ── POR QUÉ SE RECHAZA MIENTRAS HAY UNA CONSULTA EN CURSO ──────────
   *
   * Porque cambiar el modelo a mitad de un turno lo parte por dentro: el bucle
   * de `chat.mjs` hace la pasada de herramientas con un modelo y la de redactar
   * con otro, sobre unos `tool_calls` que el segundo no emitió. Encima, con el
   * router cargando bajo demanda, ese cambio descarga de la VRAM el modelo que
   * está generando ahora mismo. Un 409 aquí es honesto: la consulta de alguien
   * está en marcha y esto puede esperar diez segundos.
   */
  fastify.put(
    '/api/chat/modelo',
    {
      /*
       * Cambiar el modelo afecta a todas las pantallas de la planta, así que
       * el día que haya usuarios no debería poder hacerlo cualquiera. Ver
       * `http/plugins/autenticacion.mjs`.
       */
      onRequest: [fastify.autenticar, fastify.exigirRol('operador')],
      schema: { body: CambiarModeloSchema },
    },
    async (request, reply) => {
      if (!config.ia.isConfigured) {
        return reply
          .code(503)
          .send({
            ok: false,
            error: 'El asistente no está configurado en este servidor.',
            codigo: CODIGOS.ERROR_IA_SIN_CONFIGURAR,
          })
      }
      if (!config.ia.modelos.length) {
        return responderError(
          reply, 409, CODIGOS.ERROR_MODELO_UNICO,
          'Este servidor sirve un solo modelo. Para poder elegir, arranca llama-server con ' +
          '--models-preset y declara los nombres en IA_MODELOS.',
        )
      }

      const { atendiendo, enEspera } = cola.estado()
      if (atendiendo || enEspera) {
        return responderError(
          reply, 409, CODIGOS.ERROR_CONSULTA_EN_CURSO,
          'Hay una consulta en curso. El modelo se cambia para todas las pantallas, así que ' +
          'espera a que termine e inténtalo otra vez.',
        )
      }

      const { modelo } = request.body

      if (!chat.usarModelo(modelo)) {
        return reply.code(400).send({
          ok: false,
          error: `"${modelo}" no está en los modelos de este servidor: ${config.ia.modelos.join(', ')}.`,
          codigo: CODIGOS.ERROR_MODELO_DESCONOCIDO,
        })
      }

      request.log.info(
        { modelo, ip: request.ip },
        `Modelo del asistente cambiado a "${modelo}" para todas las pantallas (petición de ${request.ip})`
      )

      return { ok: true, modelo: chat.modeloActivo() }
    }
  )

  fastify.post(
    '/api/chat',
    { schema: { body: ChatSchema } },
    async (request, reply) => {
      if (!config.ia.isConfigured) {
        request.log.warn(
          { variable: 'IA_BASE' },
          'Se preguntó al asistente pero no está configurado: falta IA_BASE, que debe apuntar a ' +
            'llama-server (p. ej. http://localhost:8080).'
        )
        return reply.code(503).send({
          ok: false,
          error: 'El asistente no está configurado en este servidor. Falta la variable IA_BASE.',
          codigo: CODIGOS.ERROR_IA_SIN_CONFIGURAR,
        })
      }

      const { pregunta, historial, idioma, conversacionId, contexto } = request.body

      /* ── A partir de aquí la respuesta es un flujo ─────────────────── */

      const abortador = new AbortController()

      /*
       * `hijack()` antes de escribir nada: a partir de aquí Fastify no toca
       * esta respuesta, ni para serializarla ni para cerrarla. Todo lo que
       * siga escribe sobre el socket crudo, igual que hacía el servidor
       * anterior.
       */
      reply.hijack()
      const raw = reply.raw

      // Si el usuario cierra la pestaña o pulsa cancelar, se aborta también la
      // petición al modelo. Sin esto, llama-server sigue generando tokens para
      // nadie y bloquea la siguiente pregunta durante el minuto que le quede.
      //
      // Se escucha en la respuesta y NO en la petición: el cuerpo ya se
      // consumió al validarlo, así que el stream de petición ya emitió su
      // `close` y un manejador registrado ahora no se ejecutaría jamás. El de
      // la respuesta sigue vivo hasta que la conexión se cierra, y el
      // `writableEnded` distingue "el cliente se fue" de "terminamos nosotros".
      raw.on('close', () => {
        if (!raw.writableEnded) abortador.abort()
      })

      raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Sin esto, un proxy inverso —IIS en el servidor de planta— puede
        // acumular el flujo entero y entregarlo de golpe al final, que es
        // exactamente lo que el streaming venía a evitar.
        'X-Accel-Buffering': 'no',
      })

      /*
       * ── DÓNDE SE FIRMA UN ENLACE DE DESCARGA (Plan 22 F7 · SEG-09) ──
       *
       * Aquí, en la salida, y no en `generar_reporte`. La herramienta corre
       * dentro del bucle del modelo y no sabe —ni tiene por qué— quién hizo la
       * pregunta; esta ruta sí, porque tiene `request.usuario`. Firmar en la
       * frontera deja las 22 herramientas sin enterarse de que existe una
       * firma, que es donde tiene que quedarse ese detalle.
       *
       * El adjunto viaja como `{ tipo: 'adjunto', adjunto: { url, ... } }` —ver
       * `separarAdjuntos` en `chat.mjs`, y el comentario sobre por qué va
       * anidado—, así que se reescribe su `url` al pasar.
       */
      const emitir = evento => {
        if (raw.writableEnded) return
        raw.write(`data: ${JSON.stringify(firmarSiEsDescarga(evento, config, request))}\n\n`)
      }

      const empezado = Date.now()
      try {
        /*
         * La consulta se encola. El flujo ya está abierto, así que quien espera
         * ve su puesto en la fila desde el primer momento en vez de una pantalla
         * muda o un error.
         *
         * `onPuesto` puede llamarse varias veces —cada vez que alguien de
         * delante termina— y el cliente pinta el último valor. Un 0 significa
         * «te toca ya» y se traduce al estado normal de «Pensando…», que lo
         * emite el propio bucle del chat un instante después.
         */
        const resumen = await cola.encolar({
          signal: abortador.signal,
          onPuesto: (porDelante) => {
            if (porDelante > 0) {
              request.log.debug(
                { porDelante, pregunta },
                `Consulta encolada: ${porDelante} por delante en la fila del asistente`
              )
              emitir({ tipo: 'cola', porDelante })
            }
          },
          ejecutar: () => chat.responder({
            pregunta,
            historial,
            signal: abortador.signal,
            onEvento: emitir,
            /*
             * La clave de la caché entre turnos (Plan 23 F1). Viaja tal cual:
             * esta ruta no lo interpreta ni lo registra —es opaco, y no
             * identifica a nadie—, sólo lo pasa. Un cliente que no lo mande
             * responde igual, sin caché.
             */
            conversacionId,
            /*
             * El idioma que tiene puesto el tablero de quien pregunta. El
             * modelo contesta en él; nada de lo que hay debajo cambia. Ver
             * `instrucciones()` en `ia/conversacion/chat.mjs`.
             */
            idioma,
            /*
             * Desde qué pantalla se pregunta (Plan 24 F7 · `USO-07`). Viaja
             * tal cual, validado ya por `ChatSchema` con Zod — que es la
             * puerta que el Plan 23 F0 (`IA-04`) puso justo para esto: una
             * entrada nueva al bucle no se cuela sin validar.
             */
            contexto,
          }),
        })

        const duracionMs = Date.now() - empezado
        emitir({ tipo: 'fin', ...resumen, duracionMs })

        /*
         * La PREGUNTA va en el log a propósito (Plan 7, Fase B). Sin ella, una
         * línea de registro dice que no hizo falta herramienta pero no qué se
         * preguntó, y no hay forma de saber qué herramienta falta. Con ella, una
         * semana en planta contesta esa pregunta con datos.
         */
        const herramientas = resumen?.herramientas?.length ?? 0
        request.log.info(
          { pregunta, ...resumen, duracionMs },
          `Consulta del asistente resuelta en ${(duracionMs / 1000).toFixed(1)} s ` +
            `con ${herramientas} herramienta(s): «${pregunta.slice(0, 80)}${pregunta.length > 80 ? '…' : ''}»`
        )

        await anotarTurno(request, {
          resultado: resumen?.bloqueada ? 'bloqueada' : 'contestada',
          pregunta,
          herramientas: resumen?.herramientas ?? [],
          modelo: chat.modeloActivo(),
          idioma,
          duracionMs,
          /*
           * ── LAS SEÑALES CON LAS QUE SE MEDIRÁ UN ROUTER (Plan 23) ──────
           *
           * `IA-08` proponía elegir modelo por conversación según lo compleja
           * que pareciera la pregunta. Se descartó —choca con que el modelo
           * activo sea global por VRAM, y con que `IA_MODELOS` venga vacío por
           * defecto— pero la pregunta de fondo sigue siendo buena: ¿hay
           * preguntas que de verdad necesiten el modelo grande?
           *
           * Eso no se contesta suponiendo. Estas tres son exactamente las
           * señales baratas que aquella heurística iba a usar, y guardarlas
           * permite MEDIRLO con semanas de uso real antes de decidir nada:
           * si las preguntas largas o las que gastan varias rondas son las
           * lentas, un router tendría algo que decidir; si no, no.
           *
           * Es el mismo orden que `medir-calibracion.mjs` impuso para los
           * umbrales del motor: primero se mide, después se pone el número.
           */
          caracteresPregunta: pregunta.length,
          rondas: resumen?.rondas ?? null,
          turnosDeContexto: resumen?.turnosRecordados ?? 0,
          /* Un resumen con `ok` en falso significa que alguna herramienta
             falló, no que el turno se cayera: el asistente contestó igual,
             contando lo que no pudo leer. Se distingue porque son dos cosas
             distintas al leer el diario. */
          conFalloDeHerramienta: resumen?.ok === false,
        })
      } catch (error) {
        const duracionMs = Date.now() - empezado
        // Cancelar no es un error que reportar: el cliente ya se fue.
        const cancelado = error?.name === 'AbortError' || abortador.signal.aborted

        /*
         * El turno que NO llegó a contestarse se anota igual, y con su causa.
         *
         * Un diario que sólo guardara los turnos buenos daría a entender que
         * en las horas en que el modelo estuvo caído nadie preguntó nada —el
         * mismo motivo por el que el diario de accionamientos guarda los
         * rechazos—. Y es justo lo que se busca al abrirlo: «esa tarde que iba
         * mal, ¿qué pasaba?».
         */
        await anotarTurno(request, {
          resultado: cancelado ? 'cancelada' : 'error',
          pregunta,
          modelo: chat.modeloActivo(),
          idioma,
          duracionMs,
          ...(cancelado ? {} : { motivo: error?.message ?? String(error) }),
        })

        if (cancelado) {
          request.log.debug(
            { pregunta, duracionMs },
            `El operador canceló la consulta tras ${(duracionMs / 1000).toFixed(1)} s`
          )
        } else {
          request.log.error(
            { pregunta, err: error, duracionMs, iaBase: config.ia.base, modelo: chat.modeloActivo() },
            `La consulta al asistente falló tras ${(duracionMs / 1000).toFixed(1)} s: ` +
              `${error?.message ?? error}. Modelo "${chat.modeloActivo()}" en ${config.ia.base}.`
          )
          emitir({ tipo: 'error', mensaje: mensajeDeFallo(error, config.ia.timeoutMs) })
        }
      } finally {
        if (!raw.writableEnded) raw.end()
      }
    }
  )

  /**
   * Exporta a PDF la conversación tal como está en pantalla — el botón
   * «Exportar PDF» del panel de chat, no una herramienta del modelo.
   *
   * JSON simple, sin streaming (a diferencia de `POST /api/chat`): esto no
   * llama al modelo, sólo compone un documento con turnos que el cliente ya
   * tiene. Escribe en `config.backlogChat.dir` —no en `config.reportes.dir`,
   * que es de `generar_reporte` (Plan 16 separó las dos carpetas: una es
   * trabajo del asistente, la otra un registro de lo hablado)— pero
   * `GET /api/reportes` sigue siendo la única ruta de descarga para las dos:
   * no hace falta un endpoint nuevo, sólo mirar en el sitio que toque.
   */
  fastify.post(
    '/api/chat/exportar',
    { schema: { body: ExportarChatSchema } },
    async (request, reply) => {
      const { historial: turnos, idioma } = request.body

      if (!config.backlogChat?.dir) {
        request.log.warn(
          { variable: 'IA_BACKLOG_CHAT_DIR' },
          'Se pidió exportar una conversación pero IA_BACKLOG_CHAT_DIR no está configurado: no hay ' +
            'dónde escribir el PDF.'
        )
        return reply.code(503).send({
          ok: false,
          error: 'La exportación de conversaciones no está configurada en este servidor.',
          codigo: CODIGOS.ERROR_PDF_SIN_CONFIGURAR,
        })
      }

      // Carga perezosa, mismo motivo que en `herramientas.mjs::generar_reporte`:
      // si pdfkit no está instalado, esto falla aquí sin tumbar el backend.
      let reporteMod
      try {
        reporteMod = await import('../ia/reporte.mjs')
      } catch (error) {
        request.log.error(
          { err: error },
          'No se pudo cargar el generador de PDF: falta instalar las dependencias del backend ' +
            '(pdfkit, svg-to-pdfkit). Ejecuta `npm install` dentro de backend/.'
        )
        return reply.code(503).send({
          ok: false,
          error:
            'La exportación a PDF no está disponible ahora mismo: falta instalar las dependencias ' +
            `del backend. (${error.message})`,
          codigo: CODIGOS.ERROR_PDF_SIN_DEPENDENCIAS,
        })
      }

      /*
       * `es-MX`/`en-US` sólo cambian el FORMATO de la fecha (orden, coma vs.
       * «a las»), no el idioma del reloj de la planta — mismo criterio que
       * el resto de i18n del asistente: el separador es del idioma, la hora
       * es la que es.
       */
      const pdf = await reporteMod.componerConversacionPdf({
        instalacion: etiquetasDeReporte(idioma).instalacion,
        generadoEl: new Date().toLocaleString(idioma === 'en' ? 'en-US' : 'es-MX'),
        turnos,
        idioma,
      })

      const id = randomUUID()
      await mkdir(config.backlogChat.dir, { recursive: true })
      await writeFile(join(config.backlogChat.dir, `${id}.pdf`), pdf)

      request.log.info(
        { turnos: turnos.length, id, bytes: pdf.length },
        `Conversación de ${turnos.length} turnos exportada a PDF (${Math.round(pdf.length / 1024)} kB, id ${id})`
      )

      return { ok: true, url: enlaceDeDescarga(id, config, request) }
    }
  )
}

/**
 * La URL de descarga de un PDF, firmada si hay con qué (Plan 22 F7).
 *
 * Sin `firmaSecreto` devuelve la de siempre, sin firma: es el comportamiento
 * anterior a esta fase, y el arranque ya avisa de que los enlaces no caducan.
 * No se genera un secreto al vuelo — ver `config.reportes`.
 */
function enlaceDeDescarga(id, config, request) {
  const { firmaSecreto, enlaceMinutos } = config.reportes
  if (!firmaSecreto) return `/api/reportes?id=${id}`

  return firmarEnlace({
    id,
    // `anonimo` mientras la autenticación esté apagada, y el enlace queda atado
    // a él — que no ata nada, pero el día que se encienda ata sin tocar esto.
    usuario: request.usuario?.id ?? 'anonimo',
    minutos: enlaceMinutos,
    secreto: firmaSecreto,
  })
}

/**
 * Firma la URL de un adjunto de descarga que va camino de la pantalla.
 *
 * Toca sólo los adjuntos con `url` de `/api/reportes`: un adjunto de gráfico
 * lleva un SVG y ninguna URL que firmar, y el resto de eventos del flujo
 * pasan tal cual.
 */
function firmarSiEsDescarga(evento, config, request) {
  const url = evento?.adjunto?.url
  if (evento?.tipo !== 'adjunto' || typeof url !== 'string') return evento

  const id = url.match(/^\/api\/reportes\?id=([0-9a-f-]{36})$/i)?.[1]
  if (!id) return evento

  return {
    ...evento,
    adjunto: { ...evento.adjunto, url: enlaceDeDescarga(id, config, request) },
  }
}

/**
 * Traduce el fallo a algo que un operador pueda accionar. Los tres modos que
 * se ven en planta se arreglan en sitios distintos, y un mensaje genérico
 * obliga a averiguar cuál es antes de poder hacer nada.
 */
function mensajeDeFallo(error, timeoutMs) {
  if (error?.name === 'TimeoutError') {
    return `El asistente no respondió en ${Math.round(timeoutMs / 1000)} s. ` +
      'Con este modelo una respuesta tarda entre 30 y 90 s; si se repite, revisa que ' +
      'llama-server siga en marcha y no esté atendiendo otra cosa.'
  }

  const texto = String(error?.message ?? '')
  if (/ECONNREFUSED|fetch failed/i.test(texto)) {
    return 'No se puede contactar con llama-server. El tablero funciona igual; ' +
      'solo el asistente no está disponible.'
  }

  return `El asistente falló: ${texto}`
}
