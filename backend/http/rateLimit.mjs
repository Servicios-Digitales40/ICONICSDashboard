/**
 * Límite de peticiones por cliente.
 *
 * No protege de un atacante decidido —para eso está la autenticación del
 * proxy inverso—, sino de lo que sí ocurre solo: una pestaña con un bucle de
 * recarga, un script de pruebas olvidado, o una vista con un `useEffect` mal
 * cerrado sondeando a 50 Hz. Cualquiera de los tres convierte al puente en un
 * generador de carga contra el servidor de planta.
 *
 * Ventana fija y contador en memoria: es el algoritmo más simple que resuelve
 * el problema. Su defecto conocido es que admite hasta el doble del tope en el
 * cruce de dos ventanas; para lo que aquí se persigue —cortar un bucle
 * desbocado, no repartir cuota— es irrelevante, y un contador deslizante
 * costaría estado por petición en vez de por cliente.
 */

/**
 * Techo de clientes vigilados a la vez. Existe para que el mapa no crezca sin
 * fin si alguna vez llegan peticiones desde muchas IPs distintas: al tocarlo
 * se barren las ventanas ya caducadas, que en operación normal son casi todas.
 */
const MAX_TRACKED_CLIENTS = 5000

/**
 * @param {object} options
 * @param {number} options.windowMs
 * @param {number} options.max Peticiones permitidas por ventana y cliente.
 * @param {boolean} options.trustProxy Leer `X-Forwarded-For` en vez del socket.
 */
export function createRateLimiter({ windowMs, max, trustProxy }) {
  /** @type {Map<string, { count: number, windowStartedAt: number }>} */
  const clients = new Map()

  /**
   * Detrás de un proxy inverso, `socket.remoteAddress` es el proxy para todos
   * los clientes: sin `trustProxy` el límite contaría a la planta entera como
   * uno solo y la cortaría a todos a la vez. Se lee el PRIMER elemento de
   * `X-Forwarded-For`, que es el cliente original; los siguientes son los
   * proxies intermedios.
   *
   * Y sólo con `trustProxy`, porque esa cabecera la escribe cualquiera: si el
   * puente estuviera expuesto directamente, confiar en ella permitiría
   * saltarse el límite cambiándola en cada petición.
   */
  function clientKey(request) {
    if (trustProxy) {
      const forwarded = request.headers['x-forwarded-for']
      if (forwarded) return String(forwarded).split(',')[0].trim()
    }
    return request.socket.remoteAddress ?? 'unknown'
  }

  function prune(now) {
    for (const [key, entry] of clients) {
      if (now - entry.windowStartedAt >= windowMs) clients.delete(key)
    }
  }

  /**
   * @returns {{ allowed: boolean, retryAfterSeconds: number }}
   */
  function check(request) {
    const now = Date.now()
    const key = clientKey(request)
    const entry = clients.get(key)

    if (!entry || now - entry.windowStartedAt >= windowMs) {
      if (clients.size >= MAX_TRACKED_CLIENTS) prune(now)
      clients.set(key, { count: 1, windowStartedAt: now })
      return { allowed: true, retryAfterSeconds: 0 }
    }

    entry.count += 1
    if (entry.count <= max) return { allowed: true, retryAfterSeconds: 0 }

    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.windowStartedAt + windowMs - now) / 1000),
    }
  }

  return { check }
}
