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
 * Ahora se encola (`ia/cola.mjs`). El flujo SSE se abre de inmediato y el que
 * espera recibe su puesto en la fila —«hay 2 consultas por delante»— y luego su
 * respuesta, sola, cuando le toca. El 503 se reserva para cuando la fila es tan
 * larga que esperar dejaría de tener sentido.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RequestBodyError, readJsonBody } from '../http/requestBody.mjs'
import { sendError, sendJson } from '../http/responses.mjs'
import { logger } from '../logger.mjs'

/** Longitud máxima de una pregunta. Más que esto no es una pregunta. */
const MAX_PREGUNTA = 2000

export function registerChatRoutes(router, { config, chat, cola }) {

  router.get('/api/chat', ({ response }) => {
    sendJson(response, 200, {
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
    })
  })

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
  router.put('/api/chat/modelo', async ({ request, response }) => {
    if (!config.ia.isConfigured) {
      return sendError(response, 503, 'El asistente no está configurado en este servidor.')
    }
    if (!config.ia.modelos.length) {
      return sendError(
        response, 409,
        'Este servidor sirve un solo modelo. Para poder elegir, arranca llama-server con ' +
        '--models-preset y declara los nombres en IA_MODELOS.'
      )
    }

    const { atendiendo, enEspera } = cola.estado()
    if (atendiendo || enEspera) {
      return sendError(
        response, 409,
        'Hay una consulta en curso. El modelo se cambia para todas las pantallas, así que ' +
        'espera a que termine e inténtalo otra vez.'
      )
    }

    let cuerpo
    try {
      cuerpo = await readJsonBody(request, config.limits.maxRequestBodyBytes)
    } catch (error) {
      if (error instanceof RequestBodyError) return sendError(response, error.statusCode, error.message)
      throw error
    }

    const modelo = String(cuerpo?.modelo ?? '').trim()
    if (!modelo) return sendError(response, 400, 'Falta el modelo.')

    if (!chat.usarModelo(modelo)) {
      return sendError(
        response, 400,
        `"${modelo}" no está en los modelos de este servidor: ${config.ia.modelos.join(', ')}.`
      )
    }

    sendJson(response, 200, { ok: true, modelo: chat.modeloActivo() })
  })

  router.post('/api/chat', async ({ request, response }) => {
    if (!config.ia.isConfigured) {
      return sendError(
        response, 503,
        'El asistente no está configurado en este servidor. Falta la variable IA_BASE.'
      )
    }

    let cuerpo
    try {
      cuerpo = await readJsonBody(request, config.limits.maxRequestBodyBytes)
    } catch (error) {
      if (error instanceof RequestBodyError) return sendError(response, error.statusCode, error.message)
      throw error
    }

    const pregunta = String(cuerpo?.pregunta ?? '').trim()
    if (!pregunta) return sendError(response, 400, 'Falta la pregunta.')
    if (pregunta.length > MAX_PREGUNTA) {
      return sendError(response, 400, `La pregunta no puede pasar de ${MAX_PREGUNTA} caracteres.`)
    }

    // El hilo anterior, para que «¿y el día anterior?» signifique algo. Lo
    // recorta `chat.responder()`, que es donde vive el criterio de cuánto
    // contexto vale la pena pagar; aquí solo se comprueba que sea una lista.
    const historial = Array.isArray(cuerpo?.historial) ? cuerpo.historial : []

    /* ── A partir de aquí la respuesta es un flujo ─────────────────── */

    const abortador = new AbortController()

    // Si el usuario cierra la pestaña o pulsa cancelar, se aborta también la
    // petición al modelo. Sin esto, llama-server sigue generando tokens para
    // nadie y bloquea la siguiente pregunta durante el minuto que le quede.
    //
    // Se escucha en `response` y NO en `request`: el cuerpo ya se consumió
    // entero unas líneas más arriba, así que el stream de petición ya emitió
    // su `close` y un manejador registrado ahora no se ejecutaría jamás. El
    // de la respuesta sigue vivo hasta que la conexión se cierra, y el
    // `writableEnded` distingue "el cliente se fue" de "terminamos nosotros".
    response.on('close', () => {
      if (!response.writableEnded) abortador.abort()
    })

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Sin esto, un proxy inverso —IIS en el servidor de planta— puede
      // acumular el flujo entero y entregarlo de golpe al final, que es
      // exactamente lo que el streaming venía a evitar.
      'X-Accel-Buffering': 'no',
    })

    const emitir = evento => {
      if (response.writableEnded) return
      response.write(`data: ${JSON.stringify(evento)}\n\n`)
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
          if (porDelante > 0) emitir({ tipo: 'cola', porDelante })
        },
        ejecutar: () => chat.responder({
          pregunta,
          historial,
          signal: abortador.signal,
          onEvento: emitir,
        }),
      })

      emitir({ tipo: 'fin', ...resumen, duracionMs: Date.now() - empezado })

      // La PREGUNTA va en el log a propósito (Plan 7, Fase B). Sin ella, una
      // línea de registro dice que no hizo falta herramienta pero no qué se
      // preguntó, y no hay forma de saber qué herramienta falta. Con ella, una
      // semana en planta contesta esa pregunta con datos.
      logger.info('Chat respondido', {
        pregunta,
        ...resumen,
        duracionMs: Date.now() - empezado,
      })
    } catch (error) {
      // Cancelar no es un error que reportar: el cliente ya se fue.
      const cancelado = error?.name === 'AbortError' || abortador.signal.aborted

      if (!cancelado) {
        logger.error('Chat falló', { pregunta, err: error, duracionMs: Date.now() - empezado })
        emitir({ tipo: 'error', mensaje: mensajeDeFallo(error, config.ia.timeoutMs) })
      }
    } finally {
      if (!response.writableEnded) response.end()
    }
  })

  /**
   * Exporta a PDF la conversación tal como está en pantalla — el botón
   * «Exportar PDF» del panel de chat, no una herramienta del modelo.
   *
   * JSON simple, sin streaming (a diferencia de `POST /api/chat`): esto no
   * llama al modelo, sólo compone un documento con turnos que el cliente ya
   * tiene. Mismo directorio y mismo mecanismo de descarga que los reportes
   * de `generar_reporte` (`backend/ia/reporte.mjs`, `GET /api/reportes`):
   * no hace falta un endpoint de descarga nuevo.
   */
  router.post('/api/chat/exportar', async ({ request, response }) => {
    let cuerpo
    try {
      cuerpo = await readJsonBody(request, config.limits.maxRequestBodyBytes)
    } catch (error) {
      if (error instanceof RequestBodyError) return sendError(response, error.statusCode, error.message)
      throw error
    }

    const turnos = Array.isArray(cuerpo?.historial) ? cuerpo.historial : []
    const validos = turnos.filter(
      t => t && (t.rol === 'usuario' || t.rol === 'asistente') && typeof t.texto === 'string' && t.texto.trim()
    )
    if (!validos.length) return sendError(response, 400, 'No hay conversación que exportar.')

    // Carga perezosa, mismo motivo que en `herramientas.mjs::generar_reporte`:
    // si pdfkit no está instalado, esto falla aquí sin tumbar el backend.
    let reporteMod
    try {
      reporteMod = await import('../ia/reporte.mjs')
    } catch (error) {
      return sendError(
        response, 503,
        `La exportación a PDF no está disponible ahora mismo: falta instalar las dependencias del ` +
        `backend. (${error.message})`
      )
    }

    if (!config.reportes?.dir) {
      return sendError(response, 503, 'La exportación de conversaciones no está configurada en este servidor.')
    }

    const pdf = await reporteMod.componerConversacionPdf({
      instalacion: 'Sistema de agua industrial',
      generadoEl: new Date().toLocaleString('es-MX'),
      turnos: validos,
    })

    const id = randomUUID()
    await mkdir(config.reportes.dir, { recursive: true })
    await writeFile(join(config.reportes.dir, `${id}.pdf`), pdf)

    logger.info('Conversación exportada a PDF', { turnos: validos.length })
    sendJson(response, 200, { ok: true, url: `/api/reportes?id=${id}` })
  })
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
