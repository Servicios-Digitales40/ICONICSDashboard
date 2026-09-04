/**
 * El registro de sesiones: quién está dentro y con qué pila de ICONICS.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO (PLAN 20 FASE 1) ───────────────────
 *
 * Porque `app.mjs` construía UNA vez, al arrancar, la cadena
 * `authenticator → client → herramientas → chat`, cerrada sobre
 * `ICONICS_USERNAME`/`ICONICS_PASSWORD` del entorno. Eso es una identidad de
 * máquina: todo el mundo leía la planta como el mismo usuario.
 *
 * Con el login nativo, esa cadena pasa a ser **por persona**, y algo tiene que
 * saber cuántas hay vivas, cuándo caducan y cuándo se liberan. Eso es este
 * archivo, y nada más que eso.
 *
 * ── LO QUE ESTE ARCHIVO NO SABE, A PROPÓSITO ───────────────────────
 *
 * No sabe qué es ICONICS, ni qué es un chat, ni qué es una herramienta. Recibe
 * `crearPila(credenciales)` y lo llama. Esa inversión no es purismo:
 *
 *  - Permite probar el ciclo de vida entero —caducidad, tope, cierre, que dos
 *    sesiones no se pisen— sin levantar ni un cliente de ICONICS.
 *  - Impide que la mecánica de sesión y la de planta se enreden, que es como
 *    se llega a un registro que "casi" sabe leer un punto.
 *
 * ── DÓNDE VIVE LA CONTRASEÑA, Y POR QUÉ ES INEVITABLE ──────────────
 *
 * En memoria del proceso, dentro de la pila que construye `crearPila`, hasta
 * que la sesión se cierra o caduca.
 *
 * No es un descuido: ICONICS sólo admite Authorization Code + PKCE, y cuando
 * el servidor rechaza un `refresh_token` la única salida es **rehacer el login
 * completo**, que necesita la contraseña otra vez. Guardar sólo los tokens
 * dejaría al técnico expulsado a mitad de turno sin motivo visible.
 *
 * Lo que sí se hace, porque sí depende de nosotros:
 *
 *  - `logger.mjs` redacta `contrasena`/`password` igual que ya redactaba los
 *    tokens, así que no puede acabar en una línea de log ni por accidente.
 *  - Nunca viaja en una respuesta HTTP: lo que sale es el id de sesión.
 *  - La sesión caduca por inactividad y el tope de sesiones vivas acota
 *    cuántas contraseñas puede haber en memoria a la vez.
 *
 * Queda declarado como hueco conocido en `docs/PLAN-20-ASISTENTE.md` §8.1: no
 * está mitigado frente a un volcado de memoria del servidor.
 *
 * ── EL TOPE NO ES PARANOIA ─────────────────────────────────────────
 *
 * Cada sesión son unas credenciales, unos tokens y una pila de objetos. Sin
 * tope, un cliente que llame a `POST /api/sesion` en bucle con credenciales
 * válidas agota la memoria del puente — y el puente sirve el asistente entero.
 * `SESION_MAX` lo acota con un número explícito en vez de descubrirlo en
 * planta.
 */
import crypto from 'node:crypto'
import { logger } from '../logger.mjs'

/**
 * 32 bytes de entropía criptográfica, en base64url.
 *
 * No es un JWT y no lleva nada dentro: es una llave opaca que sólo significa
 * algo contra este registro. Esa opacidad es la razón de que cerrar sesión
 * funcione de verdad —un JWT sigue siendo válido hasta que caduca, aunque el
 * servidor ya no quiera a ese usuario— y de que no haya nada que un cliente
 * pueda leer, manipular o falsificar sin adivinar 256 bits.
 */
function nuevoId() {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * @param {object} opciones
 * @param {(credenciales: {usuario: string, contrasena: string}, tokens: object)
 *   => Promise<object>|object} opciones.crearPila Construye lo que esta sesión
 *   necesita para hablar con ICONICS. Lo que devuelva se entrega tal cual en
 *   `resolver()`; si trae un método `cerrar()`, se llama al liberar.
 * @param {number} opciones.ttlMs Inactividad tras la cual una sesión muere.
 * @param {number} opciones.maximo Sesiones vivas simultáneas admitidas.
 * @param {() => number} [opciones.ahora] Reloj inyectable. Existe para que las
 *   pruebas de caducidad no tengan que esperar una hora de verdad.
 */
export function crearRegistroDeSesiones({ crearPila, ttlMs, maximo, ahora = Date.now }) {
  if (typeof crearPila !== 'function') {
    throw new TypeError('crearRegistroDeSesiones necesita `crearPila(credenciales, tokens)`.')
  }

  /** @type {Map<string, {id, usuario, pila, creadaEn, ultimoUsoEn}>} */
  const sesiones = new Map()

  const haCaducado = sesion => ahora() - sesion.ultimoUsoEn > ttlMs

  /**
   * Suelta la pila de una sesión.
   *
   * Un `cerrar()` que lance no puede impedir que la sesión se olvide: si el
   * cliente de ICONICS falla al soltarse, la alternativa sería dejar la sesión
   * viva para siempre en el mapa — una fuga garantizada para evitar una
   * posible.
   */
  function liberar(sesion, motivo) {
    try {
      sesion.pila?.cerrar?.()
    } catch (error) {
      logger.warn('Al cerrar la pila de una sesión saltó un error; la sesión se olvida igual', {
        usuario: sesion.usuario, motivo, error: error.message,
      })
    }
    sesiones.delete(sesion.id)
  }

  /**
   * Quita las caducadas. Se llama en cada `resolver()` y en cada `crear()`:
   * no hace falta un temporizador de fondo para un mapa de decenas de
   * entradas, y un `setInterval` en un módulo que las pruebas montan y tiran
   * decenas de veces es una fuga de temporizadores esperando a pasar.
   */
  function barrer() {
    for (const sesion of sesiones.values()) {
      if (haCaducado(sesion)) liberar(sesion, 'caducada')
    }
  }

  return {
    /**
     * Da de alta una sesión ya validada.
     *
     * Recibe los tokens que `probarCredenciales` acaba de obtener: quien llama
     * ya comprobó contra ICONICS que estas credenciales sirven. Este registro
     * no valida nada — no sabría cómo, y ése es justo el punto.
     *
     * @throws {RangeError} si se alcanzó `SESION_MAX`. Es un error de
     *   capacidad, no de credenciales, y quien lo traduce a HTTP tiene que
     *   distinguirlo: un 503 dice "vuelve luego", un 401 diría "te
     *   equivocaste de contraseña", que sería mentira.
     */
    crear({ usuario, contrasena, tokens = null }) {
      barrer()

      if (sesiones.size >= maximo) {
        throw new RangeError(
          `El puente ya tiene ${sesiones.size} sesiones abiertas, que es el máximo configurado ` +
            `(SESION_MAX=${maximo}). Espera a que alguna caduque o sube el tope.`
        )
      }

      const sesion = {
        id: nuevoId(),
        usuario,
        pila: crearPila({ usuario, contrasena }, tokens),
        creadaEn: ahora(),
        ultimoUsoEn: ahora(),
      }
      sesiones.set(sesion.id, sesion)

      logger.info(`Sesión abierta para ${usuario}`, { usuario, activas: sesiones.size })
      return { id: sesion.id, usuario, expiraEn: sesion.ultimoUsoEn + ttlMs }
    },

    /**
     * La sesión de un id, o `null` si no existe o caducó.
     *
     * Leerla **renueva su inactividad**: el TTL cuenta desde el último uso, no
     * desde el login. Alguien que lleva dos horas preguntando no debe ser
     * expulsado por un tope de una hora — lo que el tope persigue es la sesión
     * de quien cerró el navegador y se fue.
     */
    resolver(id) {
      if (!id) return null
      barrer()

      const sesion = sesiones.get(id)
      if (!sesion) return null

      sesion.ultimoUsoEn = ahora()
      return sesion
    },

    /** Cierre explícito (logout). `false` si ese id ya no estaba. */
    cerrar(id) {
      const sesion = sesiones.get(id)
      if (!sesion) return false

      liberar(sesion, 'logout')
      logger.info(`Sesión cerrada para ${sesion.usuario}`, {
        usuario: sesion.usuario, activas: sesiones.size,
      })
      return true
    },

    /** Cuántas hay vivas ahora mismo. Lo publica `/api/health`. */
    activas() {
      barrer()
      return sesiones.size
    },

    /**
     * Cierra todas. La usa el apagado ordenado del servidor: sin esto, un
     * `SIGTERM` dejaría las pilas sin soltar durante el cierre.
     */
    cerrarTodas() {
      for (const sesion of [...sesiones.values()]) liberar(sesion, 'apagado')
    },
  }
}
