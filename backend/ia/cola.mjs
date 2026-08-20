/**
 * La cola de consultas al modelo.
 *
 * ── EL PROBLEMA QUE SUSTITUYE ──────────────────────────────────────
 *
 * `/api/chat` tenía UN hueco: si estaba ocupado, la segunda pregunta recibía un
 * 409 diciendo «hay otra consulta en curso, espera a que termine». La intención
 * era buena —dos preguntas a la vez se reparten la GPU y tardan el doble las
 * dos— pero el efecto en planta es malo: con el tablero abierto en la sala de
 * control y en el taller, el segundo que pregunta recibe un error por hacer
 * algo perfectamente razonable, y no tiene forma de saber cuándo reintentar.
 * Peor: quien recibe ese error vuelve a pulsar, y vuelve a chocar.
 *
 * ── POR QUÉ UNA COLA Y NO ATENDER EN PARALELO ──────────────────────
 *
 * Porque el hardware no da. El modelo corre parcialmente en CPU y dos
 * respuestas simultáneas no tardan lo mismo cada una: se reparten la máquina y
 * tardan el doble las dos, así que el paralelismo no gana tiempo total y
 * empeora el de cada uno.
 *
 * Lo que cambia con la cola es lo que VE quien espera: en vez de un error,
 * recibe su sitio en la fila y una respuesta que llega sola cuando le toca. La
 * conexión se mantiene abierta desde el principio, así que la pantalla puede
 * decir «eres el segundo» en lugar de quedarse muda.
 *
 * ── LO QUE NO HACE ─────────────────────────────────────────────────
 *
 * No prioriza. El orden es de llegada, sin excepciones: en una planta, decidir
 * que la pregunta de una pantalla vale más que la de otra necesita saber quién
 * pregunta, y aquí no hay sesiones.
 */
import { logger } from '../logger.mjs'

export function createCola({ maxEnEspera = 8 } = {}) {
  /**
   * Los que esperan turno, en orden de llegada.
   * @type {{ ejecutar: Function, resolver: Function, rechazar: Function,
   *          signal: AbortSignal, onPuesto: Function }[]}
   */
  const espera = []
  let atendiendo = false

  /**
   * Cuántos hay por delante de cada uno, para que la pantalla lo diga.
   *
   * Quien está en la posición `i` de la fila tiene `i` por delante en la fila,
   * más el que se esté atendiendo ahora mismo.
   */
  function avisarPuestos() {
    const enCurso = atendiendo ? 1 : 0
    espera.forEach((entrada, i) => entrada.onPuesto?.(i + enCurso))
  }

  async function siguiente() {
    if (atendiendo) return

    const entrada = espera.shift()
    if (!entrada) return

    // Quien se fue mientras esperaba no consume turno. Se descarta y se pasa
    // al siguiente sin ocupar la GPU ni un milisegundo.
    if (entrada.signal?.aborted) {
      entrada.rechazar(new DOMException('Cancelado en la cola', 'AbortError'))
      return siguiente()
    }

    atendiendo = true
    avisarPuestos()

    try {
      entrada.resolver(await entrada.ejecutar())
    } catch (error) {
      entrada.rechazar(error)
    } finally {
      atendiendo = false
      // `queueMicrotask` y no llamada directa: encadenar aquí haría que una
      // cola larga creciera la pila de llamadas una vez por consulta.
      queueMicrotask(siguiente)
    }
  }

  /**
   * Encola una consulta y devuelve su resultado cuando le toque.
   *
   * @param {object} opciones
   * @param {() => Promise<any>} opciones.ejecutar  el trabajo, ya preparado
   * @param {AbortSignal} [opciones.signal]         cancelación del cliente
   * @param {(puesto: number) => void} [opciones.onPuesto]
   *        se llama con cuántos hay por delante; 0 significa «te toca ya»
   */
  function encolar({ ejecutar, signal, onPuesto }) {
    /*
     * El tope existe para que una avería no se convierta en una espera
     * absurda. Si el modelo se cuelga y cada consulta agota su corte de tres
     * minutos, el noveno de la fila esperaría media hora para recibir un
     * error. Es mejor decirle en el momento que ahora mismo no se puede.
     */
    if (espera.length >= maxEnEspera) {
      logger.warn('La cola del asistente está llena', { enEspera: espera.length })
      return Promise.reject(
        Object.assign(new Error(
          `Hay ${espera.length} consultas esperando y el asistente atiende una cada vez. ` +
          'Inténtalo en un par de minutos.'
        ), { statusCode: 503 })
      )
    }

    return new Promise((resolver, rechazar) => {
      espera.push({ ejecutar, resolver, rechazar, signal, onPuesto })

      // El puesto se comunica ANTES de arrancar: quien llega el tercero tiene
      // que saberlo de inmediato, no cuando le toque.
      const porDelante = espera.length - 1 + (atendiendo ? 1 : 0)
      onPuesto?.(porDelante)

      siguiente()
    })
  }

  return {
    encolar,
    /** Para `GET /api/chat`, que informa de cómo está el servicio. */
    estado: () => ({ atendiendo, enEspera: espera.length }),
  }
}
