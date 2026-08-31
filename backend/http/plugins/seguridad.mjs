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
 */
import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'

async function seguridadPlugin(fastify, { config }) {
  /* ── Cabeceras ──────────────────────────────────────────────────── */

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
        // El tablero habla con su propio origen y nada más. Si algún día el
        // frontend llama directamente a otro servicio, va aquí y se ve.
        connectSrc: ["'self'"],
        // `fonts.gstatic.com` sirve los archivos .woff2 que referencia el CSS
        // de `fonts.googleapis.com` de arriba.
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
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
     * `DENY` y no el `SAMEORIGIN` que trae helmet por defecto: el tablero no
     * se empotra a sí mismo en ningún sitio, así que no hay nada que permitir.
     * Es la versión heredada de `frame-ancestors 'none'` de la CSP, para los
     * navegadores que no la aplican; dejarla más laxa que la CSP haría que la
     * protección dependiera de cuál de las dos lea el navegador.
     */
    frameguard: { action: 'deny' },
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
      request.log.warn(
        { ruta: request.url, ip: request.ip, limite: config.limits.rateLimitMax },
        `Límite de peticiones superado por ${request.ip} en ${request.url}: ` +
          `más de ${config.limits.rateLimitMax} en ${Math.round(config.limits.rateLimitWindowMs / 1000)} s. ` +
          'Suele ser una pestaña recargando en bucle o un sondeo mal cerrado en el frontend.'
      )
    },
  })
}

export default fp(seguridadPlugin, { name: 'seguridad' })
