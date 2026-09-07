/**
 * Rutas propias del puente: salud y contexto de cabecera.
 */
import { PointNameQuerySchema } from '../http/esquemas.mjs'

/**
 * Tres estados, no dos, porque son tres situaciones con tres arreglos
 * distintos: `ok` todo bien; `degraded` se llega al servidor pero no hay token
 * válido (credenciales o permisos); `error` no se llega (red, servicio caído
 * o `ICONICS_API_BASE` sin configurar).
 */
function resolveStatus({ reachable, tokenValid }) {
  if (!reachable) return 'error'
  return tokenValid ? 'ok' : 'degraded'
}

/**
 * Cómo está un servicio que este puente necesita.
 *
 * ── POR QUÉ «NO CONFIGURADO» ES UN ESTADO Y NO UN ERROR ────────────
 *
 * Porque una instalación mínima —sin asistente, sin dictado, sin manuales— es
 * legítima y permanente, no una avería a medio arreglar. Pintarla en rojo
 * enseñaría a ignorar el rojo. Lo que sí hace falta es que la pantalla pueda
 * decir QUÉ variable lo encendería, que es la única información accionable.
 *
 * ── EL FALLO QUE ESTA FUNCIÓN TUVO, Y QUE HAY QUE NO REPETIR ───────
 *
 * Esto decía `ok = true` como valor por defecto **y ningún llamador pasaba
 * `ok` nunca**. Así que el ternario se reducía a `configurado ? 'ok' :
 * 'no_configurado'`: el parámetro estaba muerto y la pantalla no decía
 * «funciona», decía «tiene su variable de entorno puesta».
 *
 * Se vio en planta el 07-09-2026: el panel daba el asistente y el dictado por
 * FUNCIONANDO mientras el chat, en la misma pantalla, contestaba «No se puede
 * contactar con llama-server». Comprobado después: los dos servicios estaban
 * caídos y ninguno se había contactado jamás desde aquí.
 *
 * Por eso `responde` ya no tiene valor por defecto: es obligatorio. Un
 * servicio nuevo que se añada a este panel no compila —bueno, no pasa la
 * prueba— sin decir cómo se comprueba que está vivo, que es justo la pregunta
 * que nadie se hizo la primera vez.
 *
 * `no_responde` es un estado propio y no `error`: son dos cosas distintas.
 * «Está configurado y no contesta» se arregla levantando ese servicio; un
 * error sería que contesta mal.
 */
function servicio({ nombre, configurado, variable, responde, motivo = null, detalle = null, extra = {} }) {
  if (!configurado) {
    return { nombre, estado: 'no_configurado', variable, ...(detalle ? { detalle } : {}), ...extra }
  }

  return {
    nombre,
    estado: responde ? 'ok' : 'no_responde',
    ...(responde ? {} : { detalle: motivo ? `No responde: ${motivo}.` : 'No responde.' }),
    ...(responde && detalle ? { detalle } : {}),
    ...extra,
  }
}

/**
 * Qué contar del origen de datos, que es el único servicio con dos preguntas.
 *
 * ── CONTESTAR NO ES ENTREGAR ───────────────────────────────────────
 *
 * `ping()` demuestra que `/echo` responde. Con eso solo, esta tarjeta estuvo
 * en verde mientras la planta no mandaba un solo valor — que es el caso que
 * abrió esta revisión. Así que se miran las dos cosas por separado:
 *
 *  1. ¿Se alcanza el servidor y el token vale? Eso ya lo sabía la ruta y se
 *     tiraba: se calculaba para el `status` global y no llegaba aquí.
 *  2. ¿Llegan valores? Lo dice la telemetría de la última lectura real
 *     (`client.estadoLecturas()`, añadida a los dos transportes).
 *
 * ── `null` NO ES CERO, OTRA VEZ ────────────────────────────────────
 *
 * «Todavía nadie ha pedido una lectura» es el estado normal de un puente
 * recién arrancado sin ninguna pantalla abierta, y NO es una avería: se dice
 * con esas palabras en vez de pintarlo en rojo. Distinto de «hace once
 * minutos que no llega un valor», que sí lo es.
 */
function estadoDeLosDatos({ config, connectivity, tokenValid, lecturas, ahora }) {
  const base = {
    nombre: 'Origen de datos',
    soloLectura: config.iconics.readOnly,
    ultimaLectura: lecturas?.ultima ?? null,
  }

  if (config.iconics.fake) {
    return {
      ...base,
      estado: 'simulado',
      detalle: 'ICONICS_FAKE=true: los valores los genera el simulador. NINGÚN dato es real.',
    }
  }

  const donde = config.iconics.origin || 'ICONICS'

  if (!connectivity.reachable) {
    return {
      ...base,
      estado: 'error',
      detalle: `No se alcanza ${donde}${connectivity.reason ? `: ${connectivity.reason}` : '.'}`,
    }
  }

  if (!tokenValid) {
    return {
      ...base,
      estado: 'degraded',
      detalle: `Se alcanza ${donde} pero no hay token válido: las lecturas saldrían sin autenticar. ` +
        'Revisa ICONICS_USERNAME / ICONICS_PASSWORD y los permisos de ese usuario.',
    }
  }

  const ultima = lecturas?.ultima ?? null

  if (!ultima) {
    return {
      ...base,
      estado: 'ok',
      detalle: `Se alcanza ${donde} y el token es válido. Todavía no se ha pedido ninguna lectura ` +
        'en vivo desde que arrancó el puente.',
    }
  }

  const segundos = Math.round((ahora - new Date(ultima.instante).getTime()) / 1000)
  /* «de los 1 puntos pedidos» se lee mal, y esta frase la lee un técnico. */
  const pedidos = ultima.puntosPedidos === 1 ? '1 punto pedido' : `${ultima.puntosPedidos} puntos pedidos`

  /*
   * El caso que motivó todo esto: el servidor contesta y no entrega valores.
   * Ninguna cifra de aquí es un umbral inventado — cero de los pedidos es
   * cero, sin margen que discutir.
   */
  if (ultima.conValor === 0) {
    return {
      ...base,
      estado: 'error',
      detalle: `Se alcanza ${donde} y el token es válido, pero la última lectura (hace ${segundos} s) ` +
        `no trajo NI UN valor de ${pedidos}.`,
    }
  }

  if (ultima.conValor < ultima.puntosPedidos || ultima.conCalidadBuena < ultima.puntosPedidos) {
    return {
      ...base,
      estado: 'degraded',
      detalle: `Lecturas reales de ${donde}, pero incompletas: de ${pedidos} hace ${segundos} s, ` +
        `${ultima.conValor} trajeron valor y ${ultima.conCalidadBuena} ` +
        'con calidad aceptable.',
    }
  }

  return {
    ...base,
    estado: 'ok',
    detalle: `Lecturas reales de ${donde}. La última, hace ${segundos} s: ` +
      `${ultima.conValor}/${ultima.puntosPedidos} puntos con valor y calidad buena.`,
  }
}

export function registerSystemRoutes(
  fastify,
  { config, client, authenticator, startedAt, chat, cola, voz, indiceDocumentos }
) {
  const uptimeSeconds = () => Math.floor((Date.now() - startedAt) / 1000)

  /**
   * ¿Respira el proceso? No pregunta nada a ICONICS, y ese es todo el punto:
   * es la sonda del orquestador, que corre cada pocos segundos para siempre.
   * Con la de abajo, un contenedor sondeando cada 10 s son 8 640 pings
   * diarios contra el servidor de planta sólo para saber si Node está vivo —y
   * peor: reiniciaría el contenedor por una avería que no es suya, cuando lo
   * único que pasa es que ICONICS está caído.
   *
   * Queda FUERA del límite de peticiones (`config: { rateLimit: false }`): la
   * sonda del orquestador llega desde una sola IP y a ritmo fijo, y gastarle
   * cuota significaría que un reinicio del contenedor empieza con la sonda ya
   * limitada.
   */
  fastify.get('/api/health/live', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    version: config.version,
    uptimeSeconds: uptimeSeconds(),
    timestamp: new Date().toISOString(),
  }))

  /**
   * ¿Puede este puente servir datos de verdad? Sí llama a ICONICS. Es la que
   * mira el monitor y la que se abre cuando alguien dice "no carga".
   */
  async function readiness(request) {
    /*
     * Las tres comprobaciones EN PARALELO, y no una detrás de otra.
     *
     * Cada una tiene su propio corte de unos segundos, así que en serie una
     * pantalla de salud con los tres servicios caídos tardaría la suma —doce o
     * quince segundos— y parecería colgada justo cuando alguien la abre porque
     * algo va mal. En paralelo tarda lo que el más lento.
     *
     * `/api/health/live` sigue sin preguntar nada a nadie: es la sonda del
     * orquestador y ésa no puede pagar tres llamadas salientes cada diez
     * segundos. Ver su comentario.
     */
    const [connectivity, asistente, dictado] = await Promise.all([
      client.ping(),
      chat?.comprobar?.() ?? Promise.resolve({ configurado: false, responde: false, motivo: null }),
      voz?.comprobar?.() ?? Promise.resolve({ configurado: false, responde: false, motivo: null }),
    ])

    const tokenValid = authenticator.hasValidToken()
    const status = resolveStatus({ reachable: connectivity.reachable, tokenValid })

    /*
     * Un estado que no es `ok` se registra con el motivo y con el arreglo. Es
     * la línea que se busca cuando alguien dice "no carga": sin ella hay que
     * abrir la ruta a mano para enterarse de lo mismo.
     */
    if (status === 'error') {
      request.log.warn(
        { estado: status, iconicsBase: config.iconics.apiBase || null, motivo: connectivity.reason },
        `El puente NO alcanza a ICONICS (${config.iconics.apiBase || 'ICONICS_API_BASE sin configurar'}): ` +
          `${connectivity.reason ?? 'sin detalle'}. Revisa que el servidor de planta responda y que la ruta sea la correcta.`
      )
    } else if (status === 'degraded') {
      request.log.warn(
        { estado: status, usuario: config.iconics.username || null },
        'Se alcanza ICONICS pero NO hay token válido: las lecturas saldrán sin autenticar. ' +
          'Revisa ICONICS_USERNAME / ICONICS_PASSWORD y los permisos de ese usuario.'
      )
    }

    const indice = indiceDocumentos?.estado() ?? null

    return {
      status,
      version: config.version,
      iconicsReachable: connectivity.reachable,
      tokenValid,
      readOnly: config.iconics.readOnly,
      uptimeSeconds: uptimeSeconds(),
      timestamp: new Date().toISOString(),
      ...(connectivity.reason ? { reason: connectivity.reason } : {}),

      /*
       * ── EL ESTADO DE LOS DEMÁS SERVICIOS (Plan 20 F10) ─────────────
       *
       * Los campos de arriba se mantienen tal cual porque hay guiones y
       * documentación que los usan; esto se AÑADE, no los sustituye.
       *
       * Lo que sigue es lo que hoy hay que averiguar leyendo logs por SSH
       * cuando alguien dice que «va raro»: si el asistente está montado y qué
       * modelo tiene puesto, si hay cola, si el índice de manuales llegó a
       * cargarse, y —el más importante de todos— si este puente está sirviendo
       * DATOS INVENTADOS.
       */
      /*
       * Los dos relojes en juego, y el hueco del desfase (Plan 21 F6). Es lo
       * primero que hay que mirar cuando una ventana horaria trae datos del
       * momento equivocado, y hasta ahora no se podía ver desde fuera.
       */
      relojes: {
        servidor: config.relojes.servidor,
        planta: config.relojes.planta,
        /* `false` significa «nadie lo declaró, se da por hecho que coinciden». */
        plantaDeclarada: config.relojes.plantaDeclarada,
        coinciden: config.relojes.servidor === config.relojes.planta,
        ahora: new Date().toISOString(),
        /*
         * Cuánto se separa el reloj del puente del del historiador. `null` NO
         * es cero: es que no se ha medido, y medirlo necesita la planta
         * (Plan 26). Ponerlo a 0 aquí sería afirmar que están sincronizados
         * sin haberlo comprobado — §2.5.
         */
        desfaseConHistorianMs: null,
      },

      servicios: {
        /*
         * `ICONICS_FAKE` primero y con nombre propio. Es el estado en el que
         * NINGÚN dato es real, y la cabecera de `config.mjs` ya dice que el
         * arranque debería anunciarlo bien alto: aquí también, porque una
         * pantalla de planta con datos simulados y sin avisar es peor que una
         * pantalla apagada.
         */
        datos: estadoDeLosDatos({
          config,
          connectivity,
          tokenValid,
          lecturas: client.estadoLecturas?.() ?? null,
          ahora: Date.now(),
        }),
        asistente: servicio({
          nombre: 'Asistente',
          configurado: config.ia.isConfigured,
          variable: 'IA_BASE',
          responde: asistente.responde,
          motivo: asistente.motivo,
          detalle: config.ia.isConfigured ? null : 'El chat responde 503 y el tablero funciona igual.',
          extra: config.ia.isConfigured
            ? {
              modelo: chat?.modeloActivo?.() ?? null,
              modelosDisponibles: config.ia.modelos,
              maxPasos: config.ia.maxPasos,
              cola: cola?.estado?.() ?? null,
            }
            : {},
        }),
        dictado: servicio({
          nombre: 'Dictado por voz',
          configurado: config.ia.whisper.isConfigured,
          variable: 'IA_WHISPER_BASE',
          responde: dictado.responde,
          motivo: dictado.motivo,
          extra: config.ia.whisper.isConfigured ? { idioma: config.ia.whisper.idioma } : {},
        }),
        documentacion: servicio({
          nombre: 'Manuales de planta',
          configurado: Boolean(indice),
          variable: 'IA_DOCS_DIR',
          /*
           * Éste no se contacta con nadie: es un índice en memoria de este
           * mismo proceso, así que «responde» es tanto como «existe». La
           * pregunta interesante —si llegó a cargarse— va en `cargado`, y NO
           * es un fallo: se construye a la primera búsqueda para no retrasar
           * el arranque.
           */
          responde: true,
          extra: indice
            ? {
              cargado: indice.cargado,
              indexando: indice.indexando,
              modo: indice.modo,
              documentos: indice.documentos.length,
              fragmentos: indice.documentos.reduce((n, d) => n + d.fragmentos, 0),
              ilegibles: indice.ilegibles?.length ?? 0,
              /*
               * `cargado: false` NO es un error: el índice se construye
               * perezosamente para no retrasar el arranque del puente, que
               * sirve pantallas que no dependen del asistente. Decirlo aquí
               * evita que la vista lo pinte en rojo.
               */
              detalle: indice.cargado
                ? null
                : 'El índice se carga a la primera búsqueda; todavía no se ha pedido ninguna.',
            }
            : {},
        }),
      },
    }
  }

  // `/api/health` se mantiene como estaba —con `status`, `iconicsReachable` y
  // `tokenValid`— porque ya hay documentación y guiones que la usan; `ready`
  // es el nombre que dice lo que hace. Son la misma ruta con dos nombres, no
  // dos comportamientos.
  fastify.get('/api/health', { config: { rateLimit: false } }, readiness)
  fastify.get('/api/health/ready', { config: { rateLimit: false } }, readiness)

  fastify.get(
    '/api/context',
    { schema: { querystring: PointNameQuerySchema } },
    async request => {
      const pointName = request.query.pointName ?? config.iconics.defaultPointName

      return {
        context: config.context,
        iconics: pointName ? await client.readPoint(pointName) : null,
      }
    }
  )
}
