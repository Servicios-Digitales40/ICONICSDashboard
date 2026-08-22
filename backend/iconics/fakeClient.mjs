/**
 * Transporte falso de ICONICS, para trabajar sin servidor de planta.
 *
 * ── PARA QUÉ (Plan 14 §7.1) ─────────────────────────────────────────
 *
 * El simulador vivía sólo en el frontend (`Demo-EVA/data/simulador.js`): sin
 * `ICONICS_API_BASE` alcanzable, las nueve herramientas del asistente
 * devuelven error y no hay forma de ejercitar el bucle de chat con datos.
 * `ICONICS_FAKE=true` lo levanta también aquí, con la MISMA FIRMA que
 * `iconics/client.mjs` (`readPoint`, `readPoints`, `writePoint`, `writePoints`,
 * `readHistory`, `readAlarmHistory`, `acknowledgeAlarms`, `browse`, `search`,
 * `readUserInfo`, `ping`), así que `app.mjs` sólo tiene que elegir cuál de los
 * dos construir — nada más del backend se entera de la diferencia.
 *
 * La física —cómo se mueve cada señal— es la MISMA función pura que usa el
 * simulador del frontend: `shared/eva/simulador.js`. Lo que es propio de AQUÍ
 * es reproducir el comportamiento del SERVIDOR, no sólo el de la señal:
 *
 *  - **Las tres señales que devuelven la serie de OTRA.** Medido contra el
 *    servidor real (ver cabecera de `shared/eva/historia.js`): pedir la
 *    historia de `cargaMotor`, `tensionLinea` o `eficienciaEnergetica`
 *    responde `ok: true` con la serie de `temperaturaTanque`, sin dar error.
 *    Un transporte falso que sólo sirviera datos buenos enseñaría un asistente
 *    que nunca choca con esa trampa — y la trampa es real.
 *  - **El tope de muestras** (`X-ICO-MAX-ITEM-COUNT`, 100 aquí): pedir más
 *    intervalo del que caben 100 puntos se recorta, con `hasMore` puesto.
 *  - **Calidad mala y huecos**, con la misma probabilidad que usa el
 *    simulador del frontend (`lib/iconics/caos.js`, `CAOS_SUAVE`) — no se
 *    importa de ahí porque es un módulo de React; se repite el NÚMERO, no el
 *    código.
 *
 * ── LO QUE NO HACE ───────────────────────────────────────────────────
 *
 * No simula latencia de red ni fallos de petición: el chat ya tiene su propia
 * variabilidad de tiempo (30-90 s contra el modelo) y sumarle otra al
 * transporte sólo complicaría diagnosticar cuál de las dos está fallando en
 * una prueba manual. Quien quiera ensayar un ICONICS caído para esto ya tiene
 * `client: null` o desenchufar `ICONICS_API_BASE` sin `ICONICS_FAKE`.
 */
import { RAIZ, TODOS_LOS_PUNTOS, esHistorizada, parsePointName } from '../../shared/eva/senales.js'
import { MAX_PUNTOS } from '../../shared/eva/historia.js'
import { mediaDelTramo, valorEn } from '../../shared/eva/simulador.js'
import { QUALITY_GOOD_UA } from '../../shared/quality.js'

/**
 * Calidad OPC-UA mala: bit alto puesto. La REST API de FrameWorX es la
 * convención que sigue este cliente falso, no la OPC-DA de `192` — es la que
 * `isGoodQuality()` y `herramientas.mjs` esperan del servidor real. Ver
 * `shared/quality.js`.
 */
const QUALITY_BAD_UA = 0x80000000

/**
 * Probabilidades de caos, calcadas de `CAOS_SUAVE` en
 * `react-dashboard/src/lib/iconics/caos.js`. El número se repite y no se
 * importa: aquel módulo tira de rutas de Vite que este proceso Node no
 * resuelve, y son cuatro constantes, no una librería.
 */
const CAOS = { malaCalidad: 0.02, ausente: 0.01 }

/**
 * Señales que el historiador cruza con `temperaturaTanque` en el servidor
 * real. `modoVdf` también carece de serie propia pero es booleana: el
 * servidor no tiene una curva numérica que devolver en su lugar y este tag
 * simplemente no aparece en el historiador, así que aquí sí se cuenta como
 * "sin serie" limpio en vez de imitar un cruce que no se ha medido.
 */
const CLAVE_CRUZADA = 'temperaturaTanque'

/** `HH:MM:SS` → milisegundos. */
function intervaloAMs(interval) {
  const [h, m, s] = String(interval ?? '00:15:00').split(':').map(Number)
  return ((h || 0) * 3600 + (m || 0) * 60 + (s || 0)) * 1000
}

/** Mismo tope que `X-ICO-MAX-ITEM-COUNT` en `client.mjs` (ver `config.mjs`). */
const MAX_UPSTREAM_ITEMS = MAX_PUNTOS

/**
 * Serie histórica de una clave entre dos instantes, con el mismo recorte por
 * `X-ICO-MAX-ITEM-COUNT` que aplica `client.mjs` al servidor real: si la
 * rejilla pedida no cabe en `MAX_PUNTOS`, se sirven las primeras y se avisa
 * con `hasMore`. Igual que el servidor real, el recorte es silencioso en los
 * DATOS — sólo `hasMore` lo delata, que es justo lo que hace `readHistory()`
 * del cliente real con la cabecera `X-ICO-CONTINUATION`.
 */
function serieDe(clave, startMs, endMs, pasoMs, rnd) {
  const totalPuntos = Math.max(1, Math.round((endMs - startMs) / pasoMs))
  const hasMore = totalPuntos > MAX_UPSTREAM_ITEMS
  const n = Math.min(totalPuntos, MAX_UPSTREAM_ITEMS)

  const data = []
  for (let i = 0; i < n; i++) {
    const cierre = startMs + (i + 1) * pasoMs
    if (rnd() < CAOS.ausente) continue

    let value = mediaDelTramo(clave, cierre - pasoMs, cierre)
    let quality = QUALITY_GOOD_UA
    if (rnd() < CAOS.malaCalidad) { quality = QUALITY_BAD_UA; value = 0 }

    data.push({ timestamp: new Date(cierre).toISOString(), value, quality })
  }
  return { data, hasMore }
}

/**
 * @param {object} [opciones]
 * @param {() => number} [opciones.ahora]  inyectable para pruebas
 * @param {() => number} [opciones.rnd]    inyectable para pruebas — Math.random por defecto
 */
export function createFakeIconicsClient({ ahora = () => Date.now(), rnd = Math.random } = {}) {
  /**
   * Puntos de escritura que no son señales del catálogo (`CONTROL`, el que usa
   * `controlar_bomba`). Cualquier punto ajeno al árbol de la demo también cae
   * aquí si alguien escribe sobre él, con el mismo criterio que el servidor
   * real: aceptar y devolver lo último escrito.
   */
  const escritos = new Map()

  async function readPoint(name) {
    if (!name) return { ok: false, status: 400, error: 'pointName is required.' }

    const clave = parsePointName(name)
    if (clave) {
      if (rnd() < CAOS.ausente) return { ok: false, status: 404, error: 'Point not found.' }
      const bad = rnd() < CAOS.malaCalidad
      return {
        ok: true, status: 200, pointName: name,
        payload: { value: bad ? 0 : valorEn(clave, ahora()), quality: bad ? QUALITY_BAD_UA : QUALITY_GOOD_UA },
      }
    }

    // Fuera del catálogo: es un punto de escritura (`CONTROL`) o uno que no
    // existe. Los dos se sirven igual — lo último escrito, o `null` si nunca
    // se escribió — porque el servidor real tampoco distingue las dos cosas
    // en una lectura sencilla.
    return {
      ok: true, status: 200, pointName: name,
      payload: { value: escritos.get(name) ?? null, quality: QUALITY_GOOD_UA },
    }
  }

  async function readPoints(pointNames) {
    const t = ahora()
    const byPointName = {}

    for (const name of pointNames) {
      const clave = parsePointName(name)

      // Un punto ausente de la respuesta es un hueco, no un error — igual que
      // hace `read()` del simulador del frontend con `chaos.ausente`.
      if (rnd() < CAOS.ausente) continue

      if (clave) {
        const bad = rnd() < CAOS.malaCalidad
        byPointName[name] = {
          ok: true, status: 200,
          payload: {
            pointName: name,
            value: bad ? 0 : valorEn(clave, t),
            quality: bad ? QUALITY_BAD_UA : QUALITY_GOOD_UA,
          },
        }
      } else {
        byPointName[name] = {
          ok: true, status: 200,
          payload: { pointName: name, value: escritos.get(name) ?? null, quality: QUALITY_GOOD_UA },
        }
      }
    }

    return { ok: true, status: 200, payload: byPointName }
  }

  async function writePoint(name, value) {
    escritos.set(name, value)
    return { ok: true, status: 200, result: { pointName: name, ok: true } }
  }

  async function writePoints(items) {
    for (const { pointName: name, value } of items) escritos.set(name, value)
    return {
      ok: true, status: 200,
      results: items.map(({ pointName: name }) => ({ pointName: name, ok: true })),
    }
  }

  /**
   * `readHistory` reproduce el cruce de señales del servidor real: pedir la
   * serie de una clave SIN historia propia sirve la de `temperaturaTanque`
   * (ver cabecera del archivo). No hay guarda aquí a propósito — la guarda
   * vive en `herramientas.mjs` (`esHistorizada`, comprobada ANTES de salir a
   * la red) y en `shared/eva/historia.js`; este transporte imita al servidor,
   * que tampoco la tiene.
   */
  async function readHistory({ pointName: nombrePunto, startDate, endDate, interval }) {
    const clave = parsePointName(nombrePunto)
    if (!clave) {
      return { ok: false, status: 500, error: 'ICONICS History request failed: unknown point.' }
    }

    const claveServida = esHistorizada(clave) ? clave : CLAVE_CRUZADA

    const startMs = new Date(startDate).getTime()
    const endMs = new Date(endDate).getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return { ok: false, status: 400, error: 'ICONICS History request failed: invalid range.' }
    }

    const pasoMs = Math.max(1000, intervaloAMs(interval))
    const { data, hasMore } = serieDe(claveServida, startMs, endMs, pasoMs, rnd)

    return { ok: true, status: 200, data, hasMore }
  }

  /** Sin alarmas configuradas para este árbol (Plan 14 §6): lista vacía siempre. */
  async function readAlarmHistory() {
    return { ok: true, status: 200, alarms: [] }
  }

  async function acknowledgeAlarms(eventIds) {
    return { ok: true, status: 200, result: { acknowledged: eventIds.length } }
  }

  async function browse(path) {
    const bajoRaiz = !path || RAIZ.startsWith(path) || path.startsWith(RAIZ)
    return { ok: true, status: 200, payload: bajoRaiz ? TODOS_LOS_PUNTOS : [] }
  }

  async function search(text) {
    const q = String(text ?? '').toLowerCase()
    return {
      ok: true, status: 200,
      payload: TODOS_LOS_PUNTOS.filter(p => p.toLowerCase().includes(q)),
    }
  }

  async function readUserInfo() {
    return { ok: true, status: 200, payload: { userName: 'ICONICS_FAKE', roles: [] } }
  }

  async function ping() {
    return { reachable: true, httpStatus: 200 }
  }

  return {
    acknowledgeAlarms, browse, ping, readAlarmHistory, readHistory,
    readPoint, readPoints, readUserInfo, search, writePoint, writePoints,
  }
}
