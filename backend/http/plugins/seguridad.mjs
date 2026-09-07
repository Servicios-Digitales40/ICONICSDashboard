/**
 * Cabeceras de seguridad, CORS y límite de peticiones.
 *
 * ── LAS CABECERAS SON NUEVAS ───────────────────────────────────────
 *
 * El puente no enviaba NINGUNA: ni CSP, ni `X-Frame-Options`, ni
 * `X-Content-Type-Options`. Un tablero de planta sin `X-Frame-Options` se
 * puede meter en un iframe de otra página, y como el navegador que lo abre
 * está dentro de la red y el puente mantiene una sesión privilegiada contra
 * ICONICS, los clics del operador valen sobre la planta. Es la misma clase de
 * agujero que el `Access-Control-Allow-Origin: *` que ya se quitó de
 * `cors.mjs`, y se tapa igual: negando por defecto.
 *
 * El defecto sigue siendo negar todo framing (`frame-ancestors 'none'` +
 * `X-Frame-Options: DENY`). Un integrador que necesita empotrar el tablero
 * en su propio portal declara su origen exacto en `FRAME_ANCESTORS` — nunca
 * un comodín, mismo esquema que `CORS_ORIGINS`. Ver `readFrameAncestors` en
 * `config.mjs`.
 *
 * ── `connect-src` Y EL MÓDULO QUE NO FUNCIONABA ────────────────────
 *
 * `connect-src 'self'` fue correcto mientras el tablero sólo hablara con su
 * puente. El módulo de Predicción (Plan 19) llama desde el navegador a un
 * Django en otra máquina, así que servido desde aquí ese `fetch` se bloqueaba
 * —y sin error en la página—: el módulo aparecía caído. `CONNECT_ORIGINS` lo
 * declara por origen exacto, con el mismo criterio de siempre.
 *
 * ── CORS ───────────────────────────────────────────────────────────
 *
 * La lista sigue **vacía por defecto**, que era la decisión importante del
 * módulo anterior y se conserva entera. En producción el backend sirve el
 * bundle desde su mismo origen y no necesita CORS en absoluto; el comodín
 * sólo servía para que cualquier página abierta en un navegador de la planta
 * pudiera llamar a la API por la espalda del usuario.
 *
 * Se devuelve el origen concreto y nunca `*`, para que la respuesta siga
 * siendo válida el día que se envíen credenciales — que es justo lo que hará
 * falta cuando entre la autenticación de usuarios.
 *
 * ── LÍMITE DE PETICIONES ───────────────────────────────────────────
 *
 * No protege de un atacante decidido —para eso está la autenticación del
 * proxy inverso—, sino de lo que sí ocurre solo: una pestaña con un bucle de
 * recarga, un script de pruebas olvidado, o una vista con un `useEffect` mal
 * cerrado sondeando a 50 Hz. Cualquiera de los tres convierte al puente en un
 * generador de carga contra el servidor de planta.
 *
 * Cubre sólo `/api/`. Los estáticos quedan fuera a propósito: abrir el tablero
 * son decenas de peticiones de archivos en un segundo, y contarlas gastaría la
 * cuota del cliente antes de que la primera vista llegue a pedir un dato.
 *
 * ── Y POR QUÉ UN CUBO ÚNICO NO VALÍA (Plan 22 F4 · SEG-07) ─────────
 *
 * Porque contaba por igual una lectura cacheada de 2 ms y una consulta al
 * asistente que ocupa la GPU dos minutos. Con un solo techo hay que elegir: o
 * es bajo —y un wallboard sondeando agota la cuota que necesitaba quien iba a
 * preguntar— o es alto, y entonces no protege de lo caro. Son dos recursos
 * distintos y necesitan dos cuentas distintas.
 *
 * Tres familias, en `familiaDeRuta`. La escritura sobre planta se queda
 * deliberadamente en la del medio: es barata para el puente, pero no es una
 * lectura y aflojarle el techo sería regalar algo que nadie pidió.
 */
import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'

/**
 * ¿Hay un proxy inverso delante que el puente no sabe que existe?
 *
 * Es el segundo filo de SEG-07, y no se ve en el código: con
 * `TRUST_PROXY=false`, `request.ip` es la del proxy para TODOS los clientes.
 * La planta entera cuenta como una sola IP —se queda sin cuota a la vez— y el
 * diario de accionamientos (F3) anota la IP del proxy en vez de la de quien
 * pulsó el botón.
 *
 * Función aparte del gancho que la usa para poder probar la CONDICIÓN sin
 * capturar líneas de log: lo que importa aquí es cuándo se avisa, no por qué
 * canal sale el aviso.
 */
export function hayProxySinDeclarar(config, cabeceras = {}) {
  return !config.trustProxy && Boolean(cabeceras['x-forwarded-for'])
}

/** El texto del aviso, aparte para que la prueba compruebe que dice qué hacer. */
export const AVISO_PROXY =
  'Llegan peticiones con X-Forwarded-For pero TRUST_PROXY=false: hay un proxy inverso ' +
  'delante y el puente no lo sabe. Todos los clientes cuentan como una sola IP para el ' +
  'límite de peticiones —la planta entera se queda sin cuota a la vez— y el diario de ' +
  'accionamientos anota la IP del proxy en vez de la de quien pulsó el botón. ' +
  'Arranca con TRUST_PROXY=true si ese proxy es de confianza.'

/**
 * A qué familia de límite pertenece una ruta.
 *
 * ── POR QUÉ POR PREFIJO Y NO RUTA POR RUTA ─────────────────────────
 *
 * Es la lección del Plan 20 F5, donde la guarda `autenticar` la llevaban trece
 * de treinta y tres rutas porque cada una tenía que acordarse. Una ruta nueva
 * bajo `/api/chat/` hereda el techo estricto por estar donde está, no porque
 * alguien lo recuerde — y olvidar un límite no rompe nada visible, sólo deja
 * un camino caro sin techo.
 *
 *  - `lecturas`: `data` e `history` de `/api/iconics/`. Son las DOS que un
 *    tablero abierto sondea en bucle, y las dos van por la caché por punto
 *    (Plan 21 F4): la que llega dentro del TTL cuesta milisegundos y no toca
 *    la planta.
 *  - `ia`: `/api/chat` y `/api/voz`. Cada petición ocupa la GPU, y la cola
 *    (`ia/conversacion/cola.mjs`) las atiende de una en una: mil encoladas no
 *    van más rápido, sólo hacen esperar más al que llegue detrás.
 *  - `normal`: todo lo demás, con el techo de siempre.
 *
 * ── POR QUÉ NO TODO `/api/iconics/` ES «LECTURAS» ──────────────────
 *
 * Porque la cuota generosa se justifica por dos cosas A LA VEZ —que la
 * petición sea barata y que algo la repita solo— y el resto de esa carpeta no
 * cumple ninguna de las dos:
 *
 *  · `write` y `alarms/acknowledge` MUEVEN la instalación. Que para el puente
 *    sean baratas no las hace merecedoras de un techo más alto.
 *  · `browse`, `points`, `userinfo` y `alarms` van al servidor sin caché, y
 *    ninguna se sondea: las dispara alguien pulsando algo. Con el techo normal
 *    van sobradas.
 *
 * La primera versión de esta función daba la cuota generosa a todo
 * `/api/iconics/` menos las escrituras, y lo destapó una prueba que ya
 * existía: `iconics.test.mjs` baja `RATE_LIMIT_MAX` a 3 y espera un 429 en
 * `userinfo`. Dejó de llegar. La prueba tenía razón.
 */
export function familiaDeRuta(url = '') {
  if (url.startsWith('/api/chat') || url.startsWith('/api/voz')) return 'ia'
  if (url.startsWith('/api/iconics/data') || url.startsWith('/api/iconics/history')) return 'lecturas'
  return 'normal'
}

async function seguridadPlugin(fastify, { config }) {
  /* ── Cabeceras ──────────────────────────────────────────────────── */

  const frameAncestors = config.frameAncestors.length > 0
    ? config.frameAncestors
    : ["'none'"]

  /*
   * A dónde puede llamar el tablero desde el navegador. `'self'` siempre —el
   * puente— más lo que declare `CONNECT_ORIGINS`, que hoy es el backend
   * predictivo del módulo de Predicción (ver `readConnectOrigins` en
   * `config.mjs`). Con la variable vacía queda exactamente como estaba.
   */
  const connectSrc = ["'self'", ...config.connectOrigins]

  /*
   * Un origen `http:` declarado en un puente que sirve por HTTPS es contenido
   * mixto: el navegador lo bloquea AUNQUE la CSP lo permita, y en la pantalla
   * se ve igual que si la CSP siguiera cerrada — el módulo aparece caído sin
   * decir por qué, que es justo el fallo que `CONNECT_ORIGINS` viene a
   * resolver. Se avisa al arrancar porque es el único momento en que alguien
   * está mirando.
   *
   * Se detecta por `isProduction` y no por si hay TLS montado, porque el
   * puente no sabe si tiene un proxy inverso con HTTPS delante — que es el
   * despliegue normal en planta.
   */
  const inseguros = config.connectOrigins.filter(o => o.startsWith('http://'))
  if (config.isProduction && inseguros.length > 0) {
    fastify.log.warn(
      { origenes: inseguros },
      `CONNECT_ORIGINS declara ${inseguros.length} origen(es) por http:// (${inseguros.join(', ')}). ` +
        'Si este puente se sirve por HTTPS, el navegador los bloqueará por contenido mixto ' +
        'aunque la CSP los permita, y la pantalla que los use aparecerá caída sin explicación. ' +
        'Sirve ese servicio por HTTPS, o pásalo por el puente como se hace con ICONICS.'
    )
  }

  await fastify.register(helmet, {
    /*
     * La CSP se declara a mano porque la de helmet por defecto rompe el
     * tablero: el bundle de Vite carga estilos en línea, y la vista 3D
     * (`@react-three/fiber`) crea blobs para los shaders y los workers.
     */
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // `unsafe-inline` en estilos: Vite inyecta el CSS crítico en línea y
        // los componentes usan `style=`. Quitarlo dejaría el tablero sin
        // formato. En scripts NO se admite, que es donde importa.
        // `fonts.googleapis.com` porque `index.css` importa Plus Jakarta
        // Sans, Inter e IBM Plex Mono de Google Fonts.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        scriptSrc: ["'self'"],
        // `blob:` es para los workers y las texturas de la vista 3D; `data:`
        // para los SVG en línea del plano de planta.
        imgSrc: ["'self'", 'data:', 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        // `'self'` más lo que declare `CONNECT_ORIGINS`. Ese «algún día» que
        // anunciaba este comentario llegó con el módulo de Predicción, y
        // llegó sin que nadie tocara esta línea: el `fetch` salía bloqueado
        // por el navegador y en silencio. Ahora el origen se declara y se ve.
        connectSrc,
        // `fonts.gstatic.com` sirve los archivos .woff2 que referencia el CSS
        // de `fonts.googleapis.com` de arriba.
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        // `'none'` salvo que `FRAME_ANCESTORS` declare un origen exacto: ver
        // el porqué en la cabecera de `readFrameAncestors` en `config.mjs`.
        frameAncestors,
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    /*
     * HSTS sólo en producción y sólo si se sirve por HTTPS. Activarlo en
     * desarrollo deja el navegador recordando que `localhost` es HTTPS
     * durante meses, y eso rompe el dev server de forma difícil de
     * diagnosticar (hay que borrar el estado HSTS del navegador a mano).
     */
    hsts: config.isProduction && !config.tlsVerificationDisabled
      ? { maxAge: 15552000, includeSubDomains: true }
      : false,
    /*
     * `crossOriginEmbedderPolicy` desactivado: exige que todo recurso externo
     * declare CORP, y el tablero carga imágenes y fuentes del propio build sin
     * esa cabecera. Activarlo dejaría la pantalla sin iconos.
     */
    crossOriginEmbedderPolicy: false,
    /*
     * `DENY` mientras `FRAME_ANCESTORS` esté vacío: es la versión heredada de
     * `frame-ancestors 'none'` para los navegadores que no leen CSP. Con
     * `FRAME_ANCESTORS` declarado se desactiva del todo en vez de mandar
     * `ALLOW-FROM` — la cabecera admite un solo origen y la ignoran los
     * navegadores modernos, así que dejarla activa sólo daría una falsa
     * sensación de protección; el permiso real lo da `frame-ancestors`.
     */
    frameguard: config.frameAncestors.length > 0 ? false : { action: 'deny' },
  })

  /* ── CORS ───────────────────────────────────────────────────────── */

  const origenesPermitidos = new Set(config.corsOrigins)

  await fastify.register(cors, {
    /*
     * Con la lista vacía no se emite ninguna cabecera de CORS y el navegador
     * bloquea por su cuenta cualquier llamada desde otro origen — que es el
     * comportamiento correcto cuando el backend sirve su propio frontend.
     */
    origin: (origen, callback) => {
      if (origenesPermitidos.size === 0) return callback(null, false)
      if (!origen) return callback(null, false)
      callback(null, origenesPermitidos.has(origen.replace(/\/+$/, '')))
    },
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    /*
     * Preparado para la autenticación de usuarios: cuando el frontend mande
     * una cookie de sesión o un `Authorization`, el navegador exige esta
     * cabecera. Es inofensiva mientras no haya credenciales que enviar, y
     * evita tener que recordar el motivo de un fallo de CORS ese día.
     */
    credentials: true,
    /*
     * `Vary: Origin` lo pone el plugin: sin él, una caché intermedia puede
     * servirle a un origen la respuesta que se autorizó para otro.
     */
    strictPreflight: false,
  })

  /* ── Límite de peticiones ───────────────────────────────────────── */

  /*
   * El aviso del proxy sin declarar (ver `hayProxySinDeclarar`). No se puede
   * comprobar al arrancar —hasta que no llega una petición no se sabe si hay
   * un proxy delante— así que se comprueba en la primera que trae
   * `X-Forwarded-For`, y se avisa UNA vez. Repetirlo por petición convertiría
   * el aviso en ruido de log, que es la forma segura de que nadie lo lea.
   */
  let proxyAvisado = false
  if (!config.trustProxy) {
    fastify.addHook('onRequest', async request => {
      if (proxyAvisado || !hayProxySinDeclarar(config, request.headers)) return
      proxyAvisado = true
      request.log.warn(
        { xForwardedFor: request.headers['x-forwarded-for'], ip: request.ip },
        AVISO_PROXY
      )
    })
  }

  await fastify.register(rateLimit, {
    /*
     * Global, y las rutas que deben quedar fuera lo dicen con
     * `config: { rateLimit: false }` — hoy sólo las sondas de salud.
     *
     * Con `global: false` habría que acordarse de activarlo en cada ruta
     * nueva, y olvidarlo no rompe nada visible: simplemente esa ruta queda sin
     * techo. El defecto tiene que ser el seguro, igual que en `ICONICS_READ_ONLY`.
     */
    global: true,
    max: config.limits.rateLimitMax,
    timeWindow: config.limits.rateLimitWindowMs,
    /*
     * Detrás de un proxy inverso, la IP del socket es la del proxy para TODOS
     * los clientes: sin `trustProxy` el límite contaría a la planta entera
     * como uno solo y la cortaría a todos a la vez. Fastify resuelve `request.ip`
     * leyendo `X-Forwarded-For` sólo cuando `trustProxy` está activo, que es
     * justo la condición correcta —esa cabecera la escribe cualquiera, y si el
     * puente estuviera expuesto directamente permitiría saltarse el límite
     * cambiándola en cada petición.
     */
    keyGenerator: request => request.ip,
    /*
     * Tiene que devolver un `Error` con `statusCode`, no un objeto plano: lo
     * que se devuelve aquí se LANZA, y un objeto sin `statusCode` acaba en el
     * caso genérico de `plugins/errores.mjs` y sale como un 500 —el cliente
     * vería una avería del servidor en vez de "espera unos segundos"—.
     */
    errorResponseBuilder: (request, contexto) => {
      const error = new Error('Demasiadas peticiones. Inténtalo de nuevo en unos segundos.')
      error.statusCode = 429
      error.reintentarEnSegundos = Math.ceil(contexto.ttl / 1000)
      return error
    },
    onExceeded: request => {
      const familia = familiaDeRuta(request.url)
      request.log.warn(
        { ruta: request.url, ip: request.ip, familia, limite: config.limits.rateLimitPorFamilia[familia] },
        `Límite de peticiones (familia «${familia}») superado por ${request.ip} en ${request.url}: ` +
          `más de ${config.limits.rateLimitPorFamilia[familia]} en ${Math.round(config.limits.rateLimitWindowMs / 1000)} s. ` +
          (familia === 'ia'
            ? 'Cada petición de esta familia ocupa la GPU: el techo es estricto a propósito.'
            : 'Suele ser una pestaña recargando en bucle o un sondeo mal cerrado en el frontend.')
      )
    },
  })
}

export default fp(seguridadPlugin, { name: 'seguridad' })
