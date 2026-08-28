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
 *  - **El tope de muestras y la paginación real** (`X-ICO-MAX-ITEM-COUNT` /
 *    `X-ICO-CONTINUATION`, Plan 15 §0-1): pedir más intervalo del que caben
 *    100 puntos en una página YA NO se recorta en silencio — `readHistory`
 *    sigue páginas sucesivas, igual que el cliente real, hasta agotar el
 *    rango o el mismo presupuesto (`maxHistoryPaginas`/`maxHistoryMs`) que
 *    usa `iconics/client.mjs`. Antes de la Fase 1 este transporte cortaba en
 *    la primera página y ponía `hasMore`, sin encadenar — con el cliente
 *    real siguiendo la continuación de verdad, un fake que se quedara ahí
 *    dejaría de ejercitar exactamente el camino que Plan 15 vino a arreglar.
 *  - **Calidad mala y huecos**, con la misma probabilidad que usa el
 *    simulador del frontend (`lib/iconics/caos.js`, `CAOS_SUAVE`) — no se
 *    importa de ahí porque es un módulo de React; se repite el NÚMERO, no el
 *    código.
 *
 * ── LAS DOS MÁQUINAS ─────────────────────────────────────────────────
 *
 * Sirve DOS árboles, y con dos modelos físicos separados:
 *
 *   ac:TDCON/DEMO/SENSORES/…   el tanque      → `shared/eva/simulador.js`
 *   ac:TDCON/Motors/01/…       vibraciones    → `shared/eva/simuladorVibraciones.js`
 *   ae:/DEMO VIBRACIONES=…     sus contadores → idem
 *
 * El segundo se añadió después: hasta entonces, `ICONICS_FAKE=true` dejaba los
 * veintiún puntos de vibración cayendo en la rama de «punto de escritura» —se
 * respondían con `value: null` y calidad BUENA—, que es la peor de las
 * respuestas posibles: la pantalla no veía un fallo, veía una máquina que
 * contesta y no dice nada.
 *
 * Los dos árboles se resuelven por separado y no se mezclan nunca en la misma
 * función. Son dos instalaciones sin un punto en común, y la cabecera de
 * `shared/eva/vibraciones.js` explica largo por qué cruzarlas sería un error de
 * fondo y no de estilo.
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
import { RAIZ_VIB, todosLosPuntos as todosLosPuntosVib } from '../../shared/eva/vibraciones.js'
import { valorVibracionEn } from '../../shared/eva/simuladorVibraciones.js'
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
 * Calidad con la que el servidor real sirve un punto de vibración que ha
 * dejado de entregar: `0x08000000`, y **sin campo `value`**. Está medida —es
 * la que se vio el 26-08-2026 cuando quince de veintiún puntos se apagaron a
 * la vez—, y se reproduce con esa forma exacta y no como un cero con calidad
 * mala. El fallo que esto protege es un `?? 0` río abajo convirtiendo «no
 * contesta» en «vibración nula, todo perfecto».
 */
const QUALITY_SIN_DATO = 0x08000000

/**
 * Lectura falsa de un punto del árbol de VIBRACIONES, o `null` si el punto no
 * es de ese árbol —y entonces le toca a otra rama de `readPoint`—.
 *
 * `valorVibracionEn` distingue tres cosas y aquí se traducen las tres: punto
 * ajeno (`undefined`), punto propio que ahora no entrega (`null`) y valor.
 */
function lecturaVibracion(name, t, rnd) {
  const valor = valorVibracionEn(name, t)
  if (valor === undefined) return null
  if (valor === null) return { pointName: name, quality: QUALITY_SIN_DATO }
  if (rnd() < CAOS.malaCalidad) return { pointName: name, value: 0, quality: QUALITY_BAD_UA }
  return { pointName: name, value: valor, quality: QUALITY_GOOD_UA }
}

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
 * Una PÁGINA de la serie histórica de una clave entre dos instantes, desde
 * el punto `offset` de la rejilla — el equivalente falso al servidor real
 * paginando con `X-ICO-CONTINUATION` (Plan 15 §0-1). Sirve hasta
 * `MAX_UPSTREAM_ITEMS` puntos empezando en `offset`; `siguienteOffset` es
 * `null` cuando esa página llega al final de la rejilla.
 */
function paginaDe(clave, startMs, endMs, pasoMs, offset, rnd) {
  const totalPuntos = Math.max(1, Math.round((endMs - startMs) / pasoMs))
  const fin = Math.min(offset + MAX_UPSTREAM_ITEMS, totalPuntos)

  const data = []
  for (let i = offset; i < fin; i++) {
    const cierre = startMs + (i + 1) * pasoMs
    if (rnd() < CAOS.ausente) continue

    let value = mediaDelTramo(clave, cierre - pasoMs, cierre)
    let quality = QUALITY_GOOD_UA
    if (rnd() < CAOS.malaCalidad) { quality = QUALITY_BAD_UA; value = 0 }

    data.push({ timestamp: new Date(cierre).toISOString(), value, quality })
  }
  return { data, siguienteOffset: fin < totalPuntos ? fin : null }
}

/**
 * Presupuesto de paginación por defecto, igual al de `config.mjs`
 * (`DEFAULTS.maxHistoryPaginas`/`maxHistoryMs`) — repetido aquí porque este
 * módulo no siempre recibe `config` (`app.mjs` construye el fake sin él
 * hasta que algo lo necesite), y "el simulador no pagina de verdad" sería
 * peor que un valor por defecto que coincide con el real.
 */
const PRESUPUESTO_POR_DEFECTO = { maxHistoryPaginas: 20, maxHistoryMs: 20000 }

/**
 * @param {object} [opciones]
 * @param {() => number} [opciones.ahora]  inyectable para pruebas
 * @param {() => number} [opciones.rnd]    inyectable para pruebas — Math.random por defecto
 * @param {{maxHistoryPaginas?: number, maxHistoryMs?: number}} [opciones.limits] mismo presupuesto que usa el cliente real
 */
export function createFakeIconicsClient({ ahora = () => Date.now(), rnd = Math.random, limits } = {}) {
  const { maxHistoryPaginas, maxHistoryMs } = { ...PRESUPUESTO_POR_DEFECTO, ...limits }
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

    const vib = lecturaVibracion(name, ahora(), rnd)
    if (vib) {
      if (rnd() < CAOS.ausente) return { ok: false, status: 404, error: 'Point not found.' }
      return { ok: true, status: 200, pointName: name, payload: vib }
    }

    // Fuera de los dos catálogos: es un punto de escritura (`CONTROL`) o uno
    // que no existe. Los dos se sirven igual — lo último escrito, o `null` si
    // nunca se escribió — porque el servidor real tampoco distingue las dos
    // cosas en una lectura sencilla.
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
        continue
      }

      const vib = lecturaVibracion(name, t, rnd)
      if (vib) {
        byPointName[name] = { ok: true, status: 200, payload: vib }
        continue
      }

      // Fuera de los dos catálogos: punto de escritura, o inexistente.
      byPointName[name] = {
        ok: true, status: 200,
        payload: { pointName: name, value: escritos.get(name) ?? null, quality: QUALITY_GOOD_UA },
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
   *
   * Sigue páginas sucesivas (`paginaDe`) con el MISMO contrato y el MISMO
   * presupuesto que `iconics/client.mjs` — ver la cabecera del archivo sobre
   * por qué esto dejó de cortarse en la primera página con la Fase 1 del
   * Plan 15.
   */
  async function readHistory({ pointName: nombrePunto, startDate, endDate, interval }) {
    const clave = parsePointName(nombrePunto)
    if (!clave) {
      /*
       * Un punto de VIBRACIONES tampoco tiene serie aquí, y el error dice por
       * qué: el grupo `DEMO 3` del Hyper Historian está definido pero no
       * entrega —HTTP 500 en sus 119 tags el 25-08-2026, y `esHistorizada`
       * sigue en `false` en `shared/eva/vibraciones.js` hasta que la
       * configuración deje de moverse—. Servir aquí una serie inventada
       * enseñaría al asistente a pedir tendencias de esta máquina, que es
       * exactamente lo que ese archivo prohíbe afirmar todavía.
       */
      if (valorVibracionEn(nombrePunto, ahora()) !== undefined) {
        return {
          ok: false, status: 500,
          error: 'ICONICS History request failed: point is not being collected.',
        }
      }
      return { ok: false, status: 500, error: 'ICONICS History request failed: unknown point.' }
    }

    const claveServida = esHistorizada(clave) ? clave : CLAVE_CRUZADA

    const startMs = new Date(startDate).getTime()
    const endMs = new Date(endDate).getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return { ok: false, status: 400, error: 'ICONICS History request failed: invalid range.' }
    }

    const pasoMs = Math.max(1000, intervaloAMs(interval))

    const inicioReloj = Date.now()
    const data = []
    let offset = 0
    let siguienteOffset = 0
    let paginasPedidas = 0
    let truncada = false
    let motivoCorte = null

    while (paginasPedidas < maxHistoryPaginas) {
      if (paginasPedidas > 0 && Date.now() - inicioReloj > maxHistoryMs) {
        truncada = true
        motivoCorte = `se alcanzó el plazo de ${maxHistoryMs} ms tras ${paginasPedidas} página(s).`
        break
      }

      const pagina = paginaDe(claveServida, startMs, endMs, pasoMs, offset, rnd)
      paginasPedidas += 1
      data.push(...pagina.data)
      siguienteOffset = pagina.siguienteOffset

      if (siguienteOffset === null) break
      offset = siguienteOffset
    }

    // `siguienteOffset` sigue apuntando a más rejilla si el bucle salió por
    // presupuesto (páginas o plazo) en vez de por agotar la serie — el mismo
    // criterio que `hasMore` del cliente real: "queda algo por leer que esta
    // llamada no trajo", sea culpa del servidor o del propio presupuesto.
    if (siguienteOffset !== null && paginasPedidas >= maxHistoryPaginas && !truncada) {
      truncada = true
      motivoCorte = `se alcanzó el tope de ${maxHistoryPaginas} páginas.`
    }

    return {
      ok: true,
      status: 200,
      data,
      hasMore: siguienteOffset !== null,
      paginas: paginasPedidas,
      truncada,
      motivoCorte,
    }
  }

  /** Sin alarmas configuradas para este árbol (Plan 14 §6): lista vacía siempre. */
  async function readAlarmHistory() {
    return { ok: true, status: 200, alarms: [] }
  }

  async function acknowledgeAlarms(eventIds) {
    return { ok: true, status: 200, result: { acknowledged: eventIds.length } }
  }

  /**
   * Enumerar el árbol devuelve los puntos de LA rama pedida, no la unión de
   * las dos. Es lo que hace el servidor —`ac:TDCON/DEMO/SENSORES/` y
   * `ac:TDCON/Motors/01/` son ramas hermanas— y también lo que evita que quien
   * explore el tanque se encuentre acelerómetros de otra máquina en la lista.
   * Sin ruta, se enumeran las dos: es la raíz.
   */
  async function browse(path) {
    const p = path ?? ''
    const puntos = []
    if (!p || RAIZ.startsWith(p) || p.startsWith(RAIZ)) puntos.push(...TODOS_LOS_PUNTOS)
    if (!p || RAIZ_VIB.startsWith(p) || p.startsWith(RAIZ_VIB)) puntos.push(...todosLosPuntosVib())
    return { ok: true, status: 200, payload: puntos }
  }

  async function search(text) {
    const q = String(text ?? '').toLowerCase()
    return {
      ok: true, status: 200,
      payload: [...TODOS_LOS_PUNTOS, ...todosLosPuntosVib()].filter(p => p.toLowerCase().includes(q)),
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
