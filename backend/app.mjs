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
import { createGestorMaquinas } from './ia/indices/maquinas.mjs'
import { createEvaluadorTemporal } from './ia/motor/temporal.mjs'
import { crearNarrador } from './ia/motor/narrador.mjs'
import { createHerramientas } from './ia/conversacion/herramientas.mjs'
import { crearAyudantesDeHistoria } from './ia/herramientas/lib/historia.mjs'
import { createVoz } from './ia/voz.mjs'
import { createAuthenticator } from './iconics/authenticator.mjs'
import { createIconicsClient } from './iconics/client.mjs'
import { createFakeIconicsClient } from './iconics/fakeClient.mjs'
import autenticacionPlugin from './http/plugins/autenticacion.mjs'
import cuerpoCrudoPlugin from './http/plugins/cuerpoCrudo.mjs'
import erroresPlugin from './http/plugins/errores.mjs'
import seguridadPlugin, { familiaDeRuta } from './http/plugins/seguridad.mjs'
import { crearDiario } from './lib/diario.mjs'
import { logger } from './logger.mjs'
import { registerAuthRoutes } from './routes/authRoutes.mjs'
import { registerCasosRoutes } from './routes/casosRoutes.mjs'
import { registerMaquinasRoutes } from './routes/maquinasRoutes.mjs'
/* Sólo para CONTAR cuántos casos nombran una máquina antes de darla de baja.
   Ver el cableado de `registerMaquinasRoutes` más abajo. */
import { listarCasos } from './ia/herramientas/aprendizaje/index.mjs'
import { registerChatRoutes } from './routes/chatRoutes.mjs'
import { registerControlRoutes } from './routes/controlRoutes.mjs'
import { registerDiagnosticoRoutes } from './routes/diagnosticoRoutes.mjs'
import { registerDiarioRoutes } from './routes/diarioRoutes.mjs'
import { registerCuadernoRoutes } from './routes/cuadernoRoutes.mjs'
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
  const motorSinDiario = createMotorDiagnostico({ indiceDocumentos, indiceCasos, evaluadorTemporal })

  /*
   * El diario de DIAGNÓSTICOS (Plan 28 F2): una línea por diagnóstico
   * resuelto, con el snapshot de evidencia que lo sostiene. Cuarto uso de
   * `lib/diario.mjs` y por el mismo motivo que los otros tres — el porqué de
   * que sea un archivo aparte está en el bloque `diagnosticos:` de
   * `config.mjs`.
   *
   * Se crea AQUÍ y no junto a sus tres hermanos, más abajo: el motor lo
   * envuelve justo debajo, y una dependencia declarada después de su uso es
   * una que se rompe en cuanto alguien reordene el archivo.
   */
  const diarioDiagnosticos = crearDiario({
    ruta: config.diario.diagnosticos.ruta,
    maxBytes: config.diario.diagnosticos.maxBytes,
    diasRetencion: config.diario.diagnosticos.dias,
  })

  /*
   * ── EL DIARIO SE ENVUELVE AQUÍ, NO SE PASA A CADA CONSUMIDOR ────────
   *
   * Plan 28 F2. El motor tiene DOS consumidores —`GET /api/diagnostico` para
   * la vista de cierre y `diagnosticar_falla` para el chat— y los dos tienen
   * que quedar registrados. Pasarles el diario y confiar en que cada uno anote
   * es el mismo defecto que el Plan 20 F5 ya corrigió con las guardas de
   * autenticación: *la llevaban trece de treinta y tres, y olvidarla en la
   * siguiente no rompía nada visible*. Un consumidor nuevo que no anotara
   * dejaría un hueco silencioso en la auditoría.
   *
   * Envolviendo `diagnosticar()` una sola vez, registrarse deja de ser algo
   * que haya que acordarse de hacer: quien llame al motor queda anotado por
   * construcción.
   *
   * ── Y NO SE ANOTA DENTRO DEL MOTOR, QUE SERÍA LO OTRO OBVIO ─────────
   *
   * Porque `ia/motor/diagnostico.mjs` se prueba en Node sin tocar disco, y
   * meterle un `appendFile` lo ataría a un sistema de archivos que no
   * necesita. Es la misma frontera que mantiene `snapshot.mjs` separado de la
   * escritura (Plan 28 F1).
   */
  const motorDiagnostico = {
    async diagnosticar(entrada) {
      const t0 = Date.now()
      const resultado = await motorSinDiario.diagnosticar(entrada)

      /*
       * `anotar` NUNCA lanza —devuelve `{ok:false}`— por decisión de
       * `lib/diario.mjs`: quien llama ya tiene su diagnóstico, y tumbarlo
       * porque el disco esté lleno sería perder lo útil por no poder guardar
       * la copia. Se registra el fallo en el log, que es el otro sitio donde
       * queda constancia.
       */
      const anotacion = await diarioDiagnosticos.anotar({
        tipo: 'diagnostico',
        sistema: resultado.sistema,
        riesgoId: resultado.riesgoId,
        diagnosticEventId: resultado.diagnosticEventId,
        huerfano: resultado.huerfano,
        /*
         * `estado` y `senalesVetadas` (F3 y F4) se archivan aquí porque este
         * envoltorio se escribió en la F2, ANTES de que existieran, y al
         * añadirlos al motor nadie los trajo al diario. Lo destapó la F7 al
         * agregar: `porEstado` daba «3 completos» mientras `fuentesCaidas`
         * decía que dos habían perdido el manual — dos afirmaciones
         * contradictorias sacadas del mismo archivo, porque el campo faltaba y
         * la métrica caía a un valor por defecto.
         *
         * Es la clase de defecto que sólo se ve cuando algo LEE lo que se
         * escribió. Guardar de más no se nota; guardar de menos tampoco, hasta
         * que alguien pregunta.
         */
        estado: resultado.estado ?? null,
        ...(resultado.conflicto ? { conflicto: true } : {}),
        ...(resultado.senalesVetadas ? { senalesVetadas: resultado.senalesVetadas } : {}),
        // Sólo el veredicto de cada causa, no la causa entera: el título y el
        // componente están en `causas.js` y no cambian, así que archivarlos
        // sería copiar el catálogo en cada línea.
        causas: (resultado.causas ?? []).map(c => ({
          id: c.id, banda: c.banda, respaldo: c.respaldo,
        })),
        snapshot: resultado.snapshot ?? null,
        duracionMs: Date.now() - t0,
      })

      if (!anotacion.ok) {
        logger.warn(
          'No se pudo anotar el diagnóstico en su diario; el resultado sí se entregó',
          { error: anotacion.error, diagnosticEventId: resultado.diagnosticEventId }
        )
      }

      return resultado
    },
  }

  // `readOnly` se pasa porque el catálogo YA NO es de solo lectura entero:
  // `controlar_bomba` escribe, y necesita la misma puerta que usa
  // `/api/iconics/write` para negarse cuando el puente está en solo lectura.
  /*
   * El diario de accionamientos (Plan 22 F3). Se construye SIEMPRE, también
   * en solo lectura: un intento rechazado por `ICONICS_READ_ONLY` es
   * exactamente una de las líneas que interesa tener — alguien pulsó el botón
   * y el puente dijo que no.
   *
   * Sube por delante de las herramientas desde el Plan 23 F6: `controlar_bomba`
   * también anota, así que la factoría tiene que recibirlo. No depende de nada
   * de lo que se construye en medio.
   */
  const diario = crearDiario({
    ruta: config.diario.ruta,
    maxBytes: config.diario.maxBytes,
    diasRetencion: config.diario.dias,
  })

  /*
   * El diario de CONVERSACIONES (Plan 23 F6): una línea por turno del
   * asistente. Archivo aparte del de accionamientos —son dos dominios y dos
   * lectores distintos, ver el bloque `diario:` de `config.mjs`— y el mismo
   * mecanismo de `lib/diario.mjs` debajo.
   */
  const diarioConversaciones = crearDiario({
    ruta: config.diario.conversaciones.ruta,
    maxBytes: config.diario.conversaciones.maxBytes,
    diasRetencion: config.diario.conversaciones.dias,
  })

  /*
   * El CUADERNO de planta (Plan 25 F8 · `NUE-10`): notas de una PERSONA, no
   * accionamientos del sistema. Archivo aparte de los otros dos diarios —el
   * porqué está en el bloque `cuaderno:` de `config.mjs`— y el mismo
   * mecanismo de `lib/diario.mjs` debajo.
   */
  const cuaderno = crearDiario({
    ruta: config.diario.cuaderno.ruta,
    maxBytes: config.diario.cuaderno.maxBytes,
    diasRetencion: config.diario.cuaderno.dias,
  })

  /*
   * Las MÁQUINAS CONFIGURADAS (Plan 33 F2).
   *
   * Se construye siempre, aunque el archivo no exista: leer una configuración
   * que no está devuelve la lista vacía, y eso es lo correcto —todavía no se
   * ha configurado ninguna—, no un error. Igual que `aprendizaje.json`.
   *
   * **Nadie lo consume todavía**, y es deliberado: el registro sigue leyendo
   * sus dos máquinas escritas a mano. Construir entradas de `SISTEMAS` a partir
   * de esto es la F3, y separar las dos fases es lo que permite que un fallo
   * aquí no pueda confundirse con una regresión del tablero.
   */
  const gestorMaquinas = createGestorMaquinas({ ruta: config.maquinas.ruta })


  const herramientas = createHerramientas({
    client,
    turnos: config.ia.turnos,
    readOnly: config.iconics.readOnly,
    indiceDocumentos,
    motorDiagnostico,
    reportes: config.reportes,
    historyConcurrencia: config.limits.historyConcurrencia,
    diario,
    cuaderno,
  })
  const chat = createChat({ config, herramientas })

  /*
   * ── EL NARRADOR DE AVISOS (PLAN 31 F2) ─────────────────────────────
   *
   * Se monta SIEMPRE, igual que el chat: sin `IA_BASE` no lanza, devuelve
   * `texto: null` con su motivo y la vista enseña el diagnóstico sin narrar.
   * Montarlo condicionalmente obligaría a la ruta a distinguir entre «no hay
   * narrador» y «el narrador no pudo», que son la misma respuesta para quien
   * mira la pantalla.
   *
   * No pasa por `chat`: narrar un diagnóstico ya calculado no necesita el
   * catálogo de herramientas —unos 14 000 tokens por turno— y con herramientas
   * en la mano el modelo podría rediagnosticar, que es justo lo que §2.3
   * prohíbe. Ver la cabecera de `ia/motor/narrador.mjs`.
   */
  const narrador = crearNarrador({ config })

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
   *
   * Desde el Plan 22 F4 el mismo gancho reparte además el techo POR FAMILIA
   * —lecturas, IA, el resto— en vez de dejar que un cubo único cuente igual
   * una lectura cacheada y una consulta que ocupa la GPU. Se hace aquí y no
   * ruta por ruta por lo mismo que la guarda de autenticación es del ámbito
   * (§2.11): una ruta nueva hereda su techo por estar donde está, no porque
   * alguien se acuerde. Ver `familiaDeRuta` en `plugins/seguridad.mjs`.
   */
  fastify.addHook('onRoute', opciones => {
    if (!opciones.url?.startsWith('/api/')) {
      opciones.config = { ...opciones.config, rateLimit: false }
      return
    }

    /*
     * Una ruta que ya se declaró fuera del límite —las sondas de salud— se
     * respeta: `false` no es una familia, es una exención con su motivo
     * escrito en `systemRoutes.mjs`, y pisarla aquí la metería de vuelta.
     */
    if (opciones.config?.rateLimit === false) return

    const familia = familiaDeRuta(opciones.url)
    opciones.config = {
      ...opciones.config,
      rateLimit: {
        max: config.limits.rateLimitPorFamilia[familia],
        timeWindow: config.limits.rateLimitWindowMs,
      },
    }
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

      /*
       * Y el login, por lo obvio y por eso mismo fácil de olvidar: exigir una
       * sesión para pedir una sesión no lo puede cumplir nadie. Sólo `login`
       * —`renovar` y `yo` parten de una que ya existe y sí pasan por aquí.
       */
      if (request.url.startsWith('/api/auth/login')) return

      return instancia.autenticar(request, reply)
    })

    registerAuthRoutes(instancia, { config })
    registerSystemRoutes(instancia, { config, client, authenticator, startedAt, chat, cola, voz, indiceDocumentos })
    registerIconicsRoutes(instancia, { config, client, diario })
    registerControlRoutes(instancia, { config, herramientas, diario })
    registerChatRoutes(instancia, { config, chat, cola, diarioConversaciones })
    registerVozRoutes(instancia, { config, voz })
    registerReportesRoutes(instancia, { config })
    registerRagRoutes(instancia, { config, indiceDocumentos, gestorManuales })
    registerCasosRoutes(instancia)
    /*
     * El contador de casos entra POR LA PUERTA y no lo consulta la ruta por su
     * cuenta: así el CRUD de configuración no necesita el motor de casos para
     * existir, y se puede montar en una prueba sin él.
     *
     * Qué hace con el número está en `maquinasRoutes.mjs`: con casos, una baja
     * DESACTIVA en vez de borrar. Borrar dejaría esas intervenciones apuntando
     * a un sistema que el backend no reconoce.
     */
    registerMaquinasRoutes(instancia, {
      gestorMaquinas,
      contarCasosDe: async id =>
        (await listarCasos()).filter(c => c?.sistema === id).length,
      /* Para `POST /api/maquinas/:id/verificar` (Plan 33 F8): contrastar la
         configuración contra ICONICS necesita leer sus puntos. Es el MISMO
         cliente que el resto del backend —con su caché de lote y su
         concurrencia acotada—, no uno propio. */
      client,
    })
    registerDiagnosticoRoutes(instancia, { motorDiagnostico, diarioDiagnosticos, narrador })
    // El MISMO `diario` que escriben `iconicsRoutes` y `controlRoutes`: esta
    // ruta lo lee, y dos instancias apuntando al mismo archivo sería pedir que
    // una lea a medio escribir de la otra.
    registerDiarioRoutes(instancia, { diario })
    registerCuadernoRoutes(instancia, { cuaderno })
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
