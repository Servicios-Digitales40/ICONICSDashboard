/**
 * Ensamblado de la aplicación: crea las dependencias, registra las rutas y
 * devuelve la instancia de Fastify lista para escuchar.
 *
 * Está separado de `server.mjs` para poder montar la app entera —con una
 * configuración de prueba— sin abrir un puerto. Con Fastify eso además da
 * `app.inject()`, que atiende una petición de principio a fin en memoria: es
 * lo que usan las pruebas de `test/rutas/`.
 *
 * ── ORDEN DE REGISTRO ──────────────────────────────────────────────
 *
 * Importa y no es arbitrario:
 *
 *   1. Seguridad (cabeceras, CORS, límite) — antes que nada, para que cubra
 *      también los errores y los estáticos.
 *   2. Errores — antes de las rutas, para que capture lo que ellas lancen.
 *   3. Autenticación — antes de las rutas, que declaran sus guardas.
 *   4. El parser de cuerpo en bruto (`cuerpoCrudo.mjs`) — antes de las rutas
 *      que lo necesitan (voz, manuales), y UNA sola vez: es lo que impide que
 *      dos rutas en archivos distintos se peleen por registrar el mismo
 *      content-type. Ver la cabecera de ese archivo.
 *   5. Rutas de API.
 *   6. Estáticos y respaldo de la SPA — al final, porque es el comodín: lo que
 *      no casó con ninguna ruta de API es una ruta del navegador.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { createChat } from './ia/conversacion/chat.mjs'
import { createCola } from './ia/conversacion/cola.mjs'
import { createIndiceDocumentos } from './ia/indices/documentos.mjs'
import { createIndiceCasos } from './ia/motor/casos.mjs'
import { createMotorDiagnostico } from './ia/motor/diagnostico.mjs'
import { createGestorManuales } from './ia/indices/manuales.mjs'
import { createEvaluadorTemporal } from './ia/motor/temporal.mjs'
import { createHerramientas } from './ia/conversacion/herramientas.mjs'
import { crearAyudantesDeHistoria } from './ia/herramientas/lib/historia.mjs'
import { createVoz } from './ia/voz.mjs'
import { createAuthenticator } from './iconics/authenticator.mjs'
import { createIconicsClient } from './iconics/client.mjs'
import { createFakeIconicsClient } from './iconics/fakeClient.mjs'
import autenticacionPlugin from './http/plugins/autenticacion.mjs'
import cuerpoCrudoPlugin from './http/plugins/cuerpoCrudo.mjs'
import erroresPlugin from './http/plugins/errores.mjs'
import seguridadPlugin from './http/plugins/seguridad.mjs'
import { logger } from './logger.mjs'
import { registerCasosRoutes } from './routes/casosRoutes.mjs'
import { registerChatRoutes } from './routes/chatRoutes.mjs'
import { registerControlRoutes } from './routes/controlRoutes.mjs'
import { registerDiagnosticoRoutes } from './routes/diagnosticoRoutes.mjs'
import { registerIconicsRoutes } from './routes/iconicsRoutes.mjs'
import { registerRagRoutes } from './routes/ragRoutes.mjs'
import { registerReportesRoutes } from './routes/reportesRoutes.mjs'
import { registerSystemRoutes } from './routes/systemRoutes.mjs'
import { registerVozRoutes } from './routes/vozRoutes.mjs'

/** Rutas que son archivos reales del build y nunca rutas de la SPA. */
const PREFIJOS_ASSET = ['/assets/']
const RUTAS_ASSET = ['/favicon.svg', '/icons.svg']

function esRutaDeAsset(pathname) {
  return PREFIJOS_ASSET.some(p => pathname.startsWith(p)) || RUTAS_ASSET.includes(pathname)
}

export async function createApp(config) {
  const startedAt = Date.now()

  logger.setLevel(config.logLevel)

  const fastify = Fastify({
    /*
     * El logger del proyecto es el de Fastify: así las líneas de las rutas y
     * las del resto del backend salen con el mismo formato, el mismo umbral y
     * la misma redacción de secretos. `request.log` hereda de aquí y añade
     * `reqId`, que es lo que permite seguir una petición entera por el log
     * cuando dos operadores preguntan a la vez.
     */
    loggerInstance: logger.pino,
    /*
     * Fastify registra por su cuenta una línea por petición y otra por
     * respuesta. Son ruido: el tablero hace decenas de peticiones por
     * pantalla, y lo que hace falta saber —qué se preguntó, qué se accionó,
     * qué falló— lo registran las rutas con contexto. Se desactivan y se deja
     * un `onResponse` propio más abajo que sólo habla cuando algo va mal.
     *
     * Fastify 5 avisa de que esta opción se mueve a `logController` y de que
     * la forma plana desaparece en la 6. Se mantiene la plana a propósito: la
     * nueva exige una instancia de `LogController`, que el paquete NO exporta
     * públicamente —sólo desde `fastify/lib/logger-factory.js`—, y depender de
     * una ruta interna para silenciar un aviso es peor que el aviso. Se cambia
     * cuando la clase sea pública o al migrar a Fastify 6.
     */
    disableRequestLogging: true,
    /*
     * Detrás de un proxy inverso, la IP del socket es la del proxy para TODOS
     * los clientes. Con esto `request.ip` pasa a ser el primer elemento de
     * `X-Forwarded-For`, que es el cliente original. Sólo cuando se declara
     * que hay un proxy delante: esa cabecera la escribe cualquiera, y si el
     * puente estuviera expuesto directamente permitiría falsear la IP.
     */
    trustProxy: config.trustProxy,
    /*
     * El tope de cuerpo deja de comprobarse en cada handler y pasa a ser del
     * servidor. El de audio es mayor y se sube por ruta en `vozRoutes`: un
     * minuto de voz en WAV de 16 kHz son casi 2 MB, y el tope de JSON
     * rechazaría media frase.
     */
    bodyLimit: config.limits.maxRequestBodyBytes,
    /*
     * `?points=a,b,c` se sigue leyendo como una cadena, que es lo que espera
     * `parsePointList`. Sin esto Fastify no cambia nada, pero dejarlo
     * explícito evita que un futuro cambio de parser rompa esa lectura en
     * silencio.
     *
     * Va dentro de `routerOptions`: al nivel de arriba está deprecado y
     * desaparece en Fastify 6.
     */
    routerOptions: {
      querystringParser: cadena => Object.fromEntries(new URLSearchParams(cadena)),
    },
  })

  /*
   * Los esquemas de las rutas (más abajo, en `routes/`) son objetos de Zod,
   * no JSON Schema: estos dos compiladores son lo que le enseña a Fastify a
   * validar y serializar contra ellos. Van antes de registrar cualquier ruta
   * porque cada ruta se compila con el compilador vigente EN EL MOMENTO de
   * registrarse, no con el que esté puesto después.
   *
   * Antes esta validación corría a mano en un `preHandler` (`http/validar.mjs`,
   * ya eliminado); ahora la hace Fastify en su propio paso de validación, lo
   * que además es lo que deja que `@fastify/swagger` lea el `schema` de cada
   * ruta y documente parámetros y cuerpo sin que nadie los transcriba a mano.
   */
  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)

  /* ── Dependencias ──────────────────────────────────────────────── */

  const authenticator = createAuthenticator(config)

  // `ICONICS_FAKE=true` (Plan 14 §7.1): el resto del backend —rutas, chat,
  // herramientas— no se entera de cuál de los dos corre, porque los dos
  // cumplen la misma firma. Con el falso arriba se avisa alto: es el único
  // modo en el que ningún dato de este proceso viene de la planta.
  if (config.iconics.fake) {
    logger.warn(
      'Sirviendo datos SIMULADOS: ningún valor de este servidor viene de la planta',
      {
        variable: 'ICONICS_FAKE=true',
        efecto: 'las ocho señales las genera shared/eva/tanque/simulador.js',
        arreglo: 'quita ICONICS_FAKE del entorno para volver a leer de ICONICS',
      }
    )
  }

  const client = config.iconics.fake
    ? createFakeIconicsClient({ limits: config.limits })
    : createIconicsClient(config, authenticator)

  // El asistente se monta siempre, pero sin `IA_BASE` sus rutas responden
  // 503 diciendo qué falta. Montarlo solo cuando está configurado dejaría
  // `/api/chat` cayendo al respaldo de la SPA, que devuelve el index.html con
  // un 200: el frontend creería que el asistente existe y que su respuesta es
  // una página HTML. Es el mismo motivo por el que la escritura en modo solo
  // lectura responde 403 y no 404.
  //
  // La documentación de planta se monta sólo si hay carpeta configurada. Sin
  // `IA_DOCS_DIR` la herramienta `consultar_documentacion` existe igual pero
  // responde que no hay documentación en este servidor — que es un hecho que el
  // asistente puede contar, y no un hueco silencioso donde se pondría a
  // contestar de memoria sobre un manual que nadie le ha dado.
  //
  // La carga es PEREZOSA a propósito: leer y trocear los PDF de una carpeta
  // grande retrasaría el arranque del puente, y el puente sirve las pantallas
  // de planta, que no dependen del asistente. El primer `buscar()` la dispara.
  const indiceDocumentos = config.ia.docsDir
    ? createIndiceDocumentos({
      carpeta: config.ia.docsDir,
      embeddingBase: config.ia.embeddingBase,
      embeddingModelo: config.ia.embeddingModelo,
    })
    : null

  // El catálogo de manuales (Plan 16 Fase 1): existe con la misma condición
  // que el índice —sin `IA_DOCS_DIR` no hay dónde escribir nada— y le pasa el
  // índice para poder disparar una reindexación de fondo justo después de
  // subir, reemplazar o archivar, en vez de esperar a la próxima comprobación
  // periódica de `documentos.mjs`.
  const gestorManuales = config.ia.docsDir
    ? createGestorManuales({ carpeta: config.ia.docsDir, indiceDocumentos })
    : null

  // El índice de casos (Plan 16 Fase 2, Fuente #3 del diagnóstico): a
  // diferencia de `indiceDocumentos`, no depende de ninguna carpeta
  // configurable — lee `datos/aprendizaje.json`, que existe siempre, aunque
  // esté vacío la primera vez—, así que se construye sin condición. Los
  // embeddings siguen siendo opcionales: sin `IA_EMBEDDING_BASE` cae a BM25
  // solo, igual que `indiceDocumentos`.
  const indiceCasos = createIndiceCasos({
    embeddingBase: config.ia.embeddingBase,
    embeddingModelo: config.ia.embeddingModelo,
  })

  // El cuarto término (Plan 17 Fase 6, G5): mismo ayudante de históricos que
  // ya usan `historia_de_senal`/`correlacionar_senales` dentro de
  // `createHerramientas()` —se construye SUELTO aquí también porque
  // `motorDiagnostico` se monta antes que las herramientas, no porque
  // comparta estado con la instancia de ahí abajo; `crearAyudantesDeHistoria`
  // es sólo una envoltura sin memoria propia sobre `client`, así que
  // construirla dos veces no duplica nada que importe—.
  const { leerSerie } = crearAyudantesDeHistoria({
    client, historyConcurrencia: config.limits.historyConcurrencia,
  })
  const evaluadorTemporal = createEvaluadorTemporal({ historia: { leerSerie } })

  // El motor de diagnóstico (Plan 16 Fase 3, + Fase 6 del Plan 17): junta
  // datos + manual + casos + temporal. Se construye siempre, aunque
  // `indiceDocumentos` sea `null` — el respaldo del manual sale en 0 sin él,
  // no es motivo para negar todo el diagnóstico, igual que
  // `limites_del_manual` no le impide funcionar a `diagnostico`.
  const motorDiagnostico = createMotorDiagnostico({ indiceDocumentos, indiceCasos, evaluadorTemporal })

  // `readOnly` se pasa porque el catálogo YA NO es de solo lectura entero:
  // `controlar_bomba` escribe, y necesita la misma puerta que usa
  // `/api/iconics/write` para negarse cuando el puente está en solo lectura.
  const herramientas = createHerramientas({
    client,
    turnos: config.ia.turnos,
    readOnly: config.iconics.readOnly,
    indiceDocumentos,
    motorDiagnostico,
    reportes: config.reportes,
    historyConcurrencia: config.limits.historyConcurrencia,
  })
  const chat = createChat({ config, herramientas })

  // Las consultas se atienden de una en una, pero NINGUNA se rechaza por eso:
  // el que llega segundo espera su turno con el flujo abierto y sabiendo
  // cuántos tiene delante. Ver la cabecera de `ia/conversacion/cola.mjs`.
  const cola = createCola()

  // El dictado se monta siempre, igual que el chat: sin `IA_WHISPER_BASE` sus
  // rutas responden 503 diciendo qué falta. Montarlas sólo cuando está
  // configurado las dejaría cayendo al respaldo de la SPA, que devuelve el
  // index.html con un 200 — y el frontend creería que existe el micrófono y que
  // una página HTML es una transcripción.
  const voz = createVoz({ config })

  /* ── Plugins ───────────────────────────────────────────────────── */

  /*
   * El límite de peticiones cubre sólo `/api/`; todo lo demás queda fuera.
   *
   * Va aquí, en la raíz y ANTES de registrar nada, porque `onRoute` sólo ve
   * las rutas del ámbito donde se declara y de los que cuelgan de él: dentro
   * del plugin de seguridad no alcanzaría a las rutas de API, que se registran
   * en su propio ámbito encapsulado — y el resultado sería un límite que no se
   * aplica a nada, sin ningún síntoma visible.
   *
   * Los estáticos quedan fuera a propósito: abrir el tablero son decenas de
   * peticiones de archivos en un segundo, y contarlas gastaría la cuota del
   * cliente antes de que la primera vista llegue a pedir un dato.
   */
  fastify.addHook('onRoute', opciones => {
    if (opciones.url?.startsWith('/api/')) return
    opciones.config = { ...opciones.config, rateLimit: false }
  })

  /*
   * ── LOS DOS RELOJES (Plan 21 F6) ───────────────────────────────────
   *
   * «Ayer a las 12» se resuelve en la hora local DEL PROCESO (ver
   * `readZonaHoraria` en `config.mjs`). Si el puente no está en la zona de la
   * planta, esa ventana sale corrida y devuelve datos reales del momento
   * equivocado — indistinguible de la respuesta correcta.
   *
   * No se corrige aquí, se DICE: corregirlo exige saber contra qué reloj fecha
   * el historiador, y eso se mide con la planta delante (Plan 26).
   */
  if (config.relojes.servidor !== config.relojes.planta) {
    logger.warn(
      {
        servidor: config.relojes.servidor,
        planta: config.relojes.planta,
      },
      `Este puente corre en ${config.relojes.servidor} y la planta está declarada en ` +
        `${config.relojes.planta}. Las preguntas por hora —«ayer a las 12»— se resuelven ` +
        'contra el reloj DEL PUENTE, así que las ventanas saldrán corridas. Hasta que se ' +
        'mida el desfase contra el historiador, despliega el puente en la zona de la planta.'
    )
  }

  await fastify.register(seguridadPlugin, { config })
  await fastify.register(erroresPlugin)
  await fastify.register(autenticacionPlugin, { config })
  await fastify.register(cuerpoCrudoPlugin)

  /*
   * Documentación de la API en `/docs`, sólo fuera de producción — igual que
   * el HSTS de `seguridadPlugin` se decide por `config.isProduction`. Un
   * puente en planta no necesita anunciar su mapa de rutas al mundo; en
   * desarrollo es donde se consulta.
   *
   * `transform: jsonSchemaTransform` es lo que traduce el `schema` de Zod de
   * cada ruta (declarado en `routes/`) al JSON Schema que espera el documento
   * OpenAPI: parámetros, cuerpo y sus reglas salen solos, sin transcribirlos
   * a mano ni mantenerlos sincronizados con `http/esquemas.mjs`.
   */
  if (!config.isProduction) {
    await fastify.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'ICONICS Dashboard API',
          description: 'Puente HTTP entre el tablero EVA y el servidor ICONICS.',
          version: config.version,
        },
      },
      transform: jsonSchemaTransform,
    })
    await fastify.register(fastifySwaggerUi, {
      routePrefix: '/docs',
    })
  }

  /**
   * Una línea por respuesta, sólo cuando merece la pena.
   *
   * Las peticiones que van bien no se registran: son decenas por pantalla y
   * ahogarían lo que sí importa. Se registra lo lento (que es lo que se acaba
   * investigando) y todo 5xx, con lo necesario para reproducirlo.
   */
  fastify.addHook('onResponse', async (request, reply) => {
    const ms = Math.round(reply.elapsedTime)

    /*
     * El 503 se excluye a propósito: en esta API no significa "el servidor
     * falló" sino "esta parte no está configurada en esta instalación" —el
     * asistente sin `IA_BASE`, el dictado sin `IA_WHISPER_BASE`—. Es un estado
     * legítimo y permanente de una instalación mínima, y registrarlo como
     * error llenaría el log de una avería que no existe. Cada ruta ya avisa
     * una vez, con la variable que falta.
     */
    if (reply.statusCode >= 500 && reply.statusCode !== 503) {
      request.log.error(
        { metodo: request.method, ruta: request.url, estado: reply.statusCode, ms, ip: request.ip },
        `Respuesta ${reply.statusCode} en ${request.method} ${request.url} tras ${ms} ms`
      )
      return
    }

    /*
     * Un segundo es mucho para una lectura de punto y normal para una consulta
     * al historiador de treinta días. No se distingue aquí: lo que se busca es
     * la lista de lo lento para poder mirarla, no un diagnóstico automático.
     */
    if (ms > 1000 && request.url.startsWith('/api/')) {
      request.log.warn(
        { metodo: request.method, ruta: request.url, estado: reply.statusCode, ms },
        `Respuesta lenta: ${request.method} ${request.url} tardó ${(ms / 1000).toFixed(1)} s`
      )
    }
  })

  /* ── Rutas de API ──────────────────────────────────────────────── */

  /**
   * Qué métodos admite cada ruta, para el 405 de más abajo.
   *
   * Se recoge con un `onRoute` en vez de mantener una lista a mano: una tabla
   * escrita aparte se queda desactualizada en cuanto alguien añade un método,
   * y el síntoma sería un `Allow` que miente.
   */
  const metodosPorRuta = new Map()
  fastify.addHook('onRoute', opciones => {
    if (!opciones.url?.startsWith('/api/')) return
    const metodos = Array.isArray(opciones.method) ? opciones.method : [opciones.method]
    const yaVistos = metodosPorRuta.get(opciones.url) ?? new Set()
    for (const metodo of metodos) {
      // `HEAD` lo añade Fastify solo con cada GET; no es un método que la API
      // ofrezca por su cuenta y anunciarlo confundiría más que ayudar.
      if (metodo !== 'HEAD') yaVistos.add(metodo)
    }
    metodosPorRuta.set(opciones.url, yaVistos)
  })

  /*
   * El mismo inventario, publicado.
   *
   * Lo usa `test/rutas/guardas.test.mjs` para recorrer TODAS las rutas de la
   * API y comprobar que ninguna se queda sin la guarda de autenticación. Sin
   * publicarlo, esa prueba tendría que llevar su propia lista de rutas — y una
   * lista de rutas escrita a mano en una prueba es exactamente el segundo
   * inventario que la guarda de ámbito viene a eliminar.
   */
  fastify.decorate('inventarioApi', () =>
    [...metodosPorRuta].map(([url, metodos]) => ({ url, metodos: [...metodos] }))
  )

  await fastify.register(async instancia => {
    /*
     * ── LA GUARDA DE AUTENTICACIÓN, EN EL ÁMBITO Y NO RUTA POR RUTA ──
     *
     * `http/plugins/autenticacion.mjs` existe porque el trabajo caro no es
     * validar un token, es decidir QUÉ RUTAS la exigen, y esa decisión se toma
     * peor a posteriori. La forma en que estaba —cada ruta declarando
     * `onRequest: [fastify.autenticar]`— cumplía eso a medias: la llevaban las
     * escrituras, y no la llevaban `/api/voz`, `/api/reportes`,
     * `/api/diagnostico`, `GET /api/rag/documentos` ni ninguna lectura de
     * `/api/iconics/*`. Trece rutas de treinta y tres.
     *
     * Y el modo de fallo de una lista así es el mismo que el de `global: false`
     * en el limitador: olvidarla en la ruta número treinta y cuatro no rompe
     * nada visible. Simplemente esa ruta queda abierta el día que se active
     * `AUTH_HABILITADA`, y para descubrirlo hay que auditar las treinta y
     * cuatro.
     *
     * Aquí la guarda es del ÁMBITO: cubre todo lo que se registre dentro,
     * incluido lo que se registre mañana. `request.usuario` queda relleno
     * SIEMPRE —hoy como el operador anónimo, ver el plugin—, así que ningún
     * `request.usuario?.id` de los que ya hay en los logs puede salir vacío
     * según por qué ruta se entró.
     *
     * Lo que NO se mueve aquí es `exigirRol`: eso sí es criterio por ruta —leer
     * el tablero lo puede hacer cualquiera en la red de planta; accionar una
     * bomba, no— y se declara donde está la consecuencia.
     */
    instancia.addHook('onRequest', async (request, reply) => {
      /*
       * Las sondas de salud quedan fuera, y por el mismo motivo por el que ya
       * están fuera del limitador: las llama el orquestador cada pocos
       * segundos, sin sesión y sin nadie delante. Exigirles token convertiría
       * un despliegue con autenticación activada en un contenedor que se
       * reinicia solo porque su propia sonda responde 401.
       */
      if (request.url.startsWith('/api/health')) return
      return instancia.autenticar(request, reply)
    })

    registerSystemRoutes(instancia, { config, client, authenticator, startedAt, chat, cola, indiceDocumentos })
    registerIconicsRoutes(instancia, { config, client })
    registerControlRoutes(instancia, { config, herramientas })
    registerChatRoutes(instancia, { config, chat, cola })
    registerVozRoutes(instancia, { config, voz })
    registerReportesRoutes(instancia, { config })
    registerRagRoutes(instancia, { config, indiceDocumentos, gestorManuales })
    registerCasosRoutes(instancia)
    registerDiagnosticoRoutes(instancia, { motorDiagnostico })
  })

  /* ── Frontend ──────────────────────────────────────────────────── */

  /*
   * `@fastify/static` sustituye a `http/staticFiles.mjs`. Lo que aquel módulo
   * resolvía a mano —el guardia contra recorrido de rutas que comparaba con el
   * separador incluido, para que `dist-backup/` no colara como descendiente de
   * `dist/`— lo hace el plugin, que además maneja `ETag`, rangos y `Last-Modified`
   * que el anterior no cubría.
   *
   * `wildcard: false` es lo que deja que el respaldo de la SPA de abajo se
   * encargue de las rutas que no son archivos.
   */
  const estaticosEmpezado = Date.now()
  await fastify.register(fastifyStatic, {
    root: config.staticDir,
    wildcard: false,
    index: false,
    /*
     * `serveDotFiles: false` es el defecto y aquí importa: el build no tiene
     * archivos ocultos, y servirlos expondría un `.env` que alguien copiara
     * por error al directorio del bundle.
     */
    serveDotFiles: false,
  })

  /*
   * ── POR QUÉ SE MIDE ESTO ───────────────────────────────────────────
   *
   * `@fastify/static` RECORRE el árbol de `root` al registrarse. Con un
   * `STATIC_DIR` bien puesto —el `dist` de Vite, unas decenas de archivos—
   * son milisegundos. Apuntado por error a un directorio con `node_modules`
   * dentro, medí SESENTA Y NUEVE SEGUNDOS de arranque, con el proceso
   * aparentemente colgado y sin una sola línea que lo explicara.
   *
   * Es un error de configuración fácil de cometer y carísimo de diagnosticar
   * a ciegas, así que el servidor lo dice él mismo.
   */
  const estaticosMs = Date.now() - estaticosEmpezado
  if (estaticosMs > 2000) {
    logger.warn(
      `Indexar los estáticos tardó ${(estaticosMs / 1000).toFixed(1)} s: STATIC_DIR apunta a un ` +
        'directorio muy grande y eso retrasa cada arranque',
      {
        staticDir: config.staticDir,
        ms: estaticosMs,
        arreglo: 'STATIC_DIR debe apuntar al build del frontend (react-dashboard/dist), ' +
          'no a una carpeta que contenga node_modules',
      }
    )
  }

  /**
   * Respaldo de la SPA: lo que no es API ni archivo del build es una ruta del
   * enrutador del navegador, y se le sirve el `index.html`.
   *
   * La distinción entre asset y ruta de SPA se mantiene: pedir
   * `/assets/inexistente.js` tiene que dar 404, no el `index.html` con un 200
   * —que es lo que hace que un error de build se manifieste como una pantalla
   * en blanco sin nada en la consola del navegador.
   */
  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      const ruta = request.url.split('?')[0]
      const admitidos = metodosPorRuta.get(ruta)

      /*
       * La ruta existe pero no con este método: 405 con `Allow`, que es la
       * respuesta correcta y distingue «no implementado» de «no existe». Sin
       * esto, un `PUT` a una ruta de sólo lectura daría 404 y quien lo depura
       * buscaría una ruta que sí está ahí.
       */
      if (admitidos?.size) {
        const permitidos = [...admitidos].join(', ')
        request.log.warn(
          { metodo: request.method, ruta, permitidos },
          `Método no admitido en ${ruta}: se pidió ${request.method} y esta ruta acepta ${permitidos}`
        )
        return reply
          .code(405)
          .header('Allow', permitidos)
          .send({
            ok: false,
            error: `El método ${request.method} no está permitido en ${ruta}. Métodos admitidos: ${permitidos}.`,
          })
      }

      request.log.warn(
        { metodo: request.method, ruta, ip: request.ip },
        `Ruta de API inexistente: ${request.method} ${request.url}`
      )
      return reply.code(404).send({
        ok: false,
        error: `No existe la ruta ${request.method} ${ruta}.`,
      })
    }

    const pathname = request.url.split('?')[0]
    if (esRutaDeAsset(pathname)) {
      return reply.code(404).send({ ok: false, error: 'Archivo no encontrado.' })
    }

    /*
     * ── SIN BUILD, UN 503 QUE LO DICE ──────────────────────────────────
     *
     * `sendFile('index.html')` sobre un `dist/` que no existe devuelve un
     * `404 Not Found` en texto plano: ni dice qué falta, ni se distingue de
     * una ruta que de verdad no existe. Quien abre el tablero ve una página en
     * blanco y no tiene por dónde empezar.
     *
     * Es una regresión de la migración a `@fastify/static`: el
     * `http/staticFiles.mjs` anterior sí devolvía un 503 explicándolo, y ese
     * contrato seguía escrito en `verificar-backend.mjs` sin que nadie lo
     * ejecutara — la rama sólo salta cuando NO hay build, y quien corría el
     * verificador siempre tenía uno compilado. Lo destapó la primera tanda de
     * CI (Plan 20 F2), que arranca de un `git clone` limpio.
     *
     * 503 y no 404 porque no es «esta ruta no existe», es «este servidor no
     * está entero todavía»: `CLAUDE.md` §2.5 — un servidor sin una pieza
     * montada se niega y explica qué falta.
     *
     * La comprobación va aquí y no al arrancar a propósito: en desarrollo el
     * bundle lo sirve Vite y `dist/` puede aparecer en cualquier momento sin
     * reiniciar el puente. Cuesta un `existsSync` en una ruta que, por
     * definición, ya es un fallo de búsqueda.
     */
    if (!existsSync(join(config.staticDir, 'index.html'))) {
      request.log.warn(
        { staticDir: config.staticDir, ruta: pathname },
        `Frontend build not found en ${config.staticDir}: se pidió ${pathname} y no hay bundle ` +
          'que servir. Compila con `npm run build` en react-dashboard/, o apunta STATIC_DIR ' +
          'al build si está en otro sitio.'
      )
      return reply.code(503).send({
        ok: false,
        error:
          `Frontend build not found. El servidor no encuentra el bundle del tablero en ` +
          `"${config.staticDir}". Compílalo con \`npm run build\` dentro de react-dashboard/, ` +
          'o apunta STATIC_DIR a donde esté. La API sigue funcionando.',
      })
    }

    return reply.sendFile('index.html')
  })

  return fastify
}
