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
 * ── ESTE ARCHIVO NO SABE CUÁNTAS MÁQUINAS HAY ────────────────────────
 *
 * Y es deliberado. Quien lo sabe es `shared/eva/sistemas.js`; aquí se pregunta
 * al registro por el valor de un punto (`valorSimuladoDe`) y por las ramas que
 * enumerar (`SISTEMAS`), sin nombrar ninguna instalación.
 *
 * Antes eran `if`s por máquina repartidos por cinco funciones —`readPoint`,
 * `readPoints`, `browse`, `search`, `readHistory`—, y el fallo que eso produce
 * ya se ha visto DOS veces en este proyecto: la máquina que nace después no
 * está en las ramas, cae en la de «punto de escritura» y sale con
 * `value: null` y calidad BUENA. La pantalla no ve un fallo — ve una máquina
 * que contesta y no dice nada. Con tres máquinas serían quince ramas y la
 * tercera lo habría repetido.
 *
 * Lo que NO cambia es que las máquinas siguen sin mezclarse: `browse` enumera
 * la rama pedida y no la unión, cada punto se resuelve contra el sistema al que
 * pertenece, y `sistemas.js` lleva su propia advertencia sobre por qué cruzar
 * dos instalaciones sería un error de fondo y no de estilo. Generalizar el
 * código no es unificar el dato.
 *
 * ── LO QUE NO HACE ───────────────────────────────────────────────────
 *
 * No simula latencia de red ni fallos de petición: el chat ya tiene su propia
 * variabilidad de tiempo (30-90 s contra el modelo) y sumarle otra al
 * transporte sólo complicaría diagnosticar cuál de las dos está fallando en
 * una prueba manual. Quien quiera ensayar un ICONICS caído para esto ya tiene
 * `client: null` o desenchufar `ICONICS_API_BASE` sin `ICONICS_FAKE`.
 */
import { esHistorizada, parsePointName } from '../../shared/eva/senales.js'
import { MAX_PUNTOS } from '../../shared/eva/historia.js'
import { mediaDelTramo } from '../../shared/eva/simulador.js'
import { SISTEMAS, sistemaDePunto, valorSimuladoDe } from '../../shared/eva/sistemas.js'
import { QUALITY_BAD_UA, QUALITY_GOOD_UA, QUALITY_SIN_DATO } from '../../shared/quality.js'

/**
 * Probabilidades de caos, calcadas de `CAOS_SUAVE` en
 * `react-dashboard/src/lib/iconics/caos.js`. El número se repite y no se
 * importa: aquel módulo tira de rutas de Vite que este proceso Node no
 * resuelve, y son cuatro constantes, no una librería.
 */
const CAOS = { malaCalidad: 0.02, ausente: 0.01 }

/**
 * Lectura falsa de un punto de CUALQUIER máquina dada de alta, o `null` si no
 * es de ninguna —y entonces le toca a la rama de punto de escritura—.
 *
 * ── POR QUÉ ESTO LO DECIDE EL REGISTRO Y NO UN `if` ────────────────
 *
 * Porque antes eran `if`s, uno por máquina, repetidos en cinco funciones de
 * este archivo. Con dos máquinas ya se había visto fallar dos veces: la que
 * nacía después caía en la rama de escritura y salía con `value: null` y
 * calidad BUENA, así que la pantalla no veía un fallo — veía una máquina que
 * contesta y no dice nada. Con quince ramas, la tercera lo habría repetido.
 *
 * Ahora el que sabe qué máquinas hay es `shared/eva/sistemas.js`, y este
 * archivo no se entera de cuántas son.
 *
 * `valorSimuladoDe` distingue tres cosas y aquí se traducen las tres: punto
 * ajeno (`undefined`), punto propio que ahora no entrega (`null`) y valor.
 */
function lecturaSimulada(name, t, rnd) {
  const valor = valorSimuladoDe(name, t)
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

    const lectura = lecturaSimulada(name, ahora(), rnd)
    if (lectura) {
      if (rnd() < CAOS.ausente) return { ok: false, status: 404, error: 'Point not found.' }
      return { ok: true, status: 200, pointName: name, payload: lectura }
    }

    // Fuera de todos los catálogos: es un punto de escritura (`CONTROL`) o uno
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
      // Un punto ausente de la respuesta es un hueco, no un error — igual que
      // hace `read()` del simulador del frontend con `chaos.ausente`.
      if (rnd() < CAOS.ausente) continue

      const lectura = lecturaSimulada(name, t, rnd)
      byPointName[name] = {
        ok: true, status: 200,
        // Fuera de todos los catálogos: punto de escritura, o inexistente.
        payload: lectura ?? { pointName: name, value: escritos.get(name) ?? null, quality: QUALITY_GOOD_UA },
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
       * El punto puede ser de OTRA máquina dada de alta, y entonces el error
       * dice por qué. El caso vivo es vibraciones: el grupo `DEMO 3` del Hyper
       * Historian está definido pero no entrega —HTTP 500 en sus 119 tags el
       * 25-08-2026, y su `esHistorizada` sigue en `false` hasta que la
       * configuración deje de moverse—. Servir aquí una serie inventada
       * enseñaría al asistente a pedir tendencias de una máquina que todavía
       * no las tiene.
       *
       * Se pregunta al REGISTRO y no a un catálogo concreto: una máquina nueva
       * sin historia entra sola en este camino, y el día que alguna la tenga,
       * `esHistorizada` de su entrada será lo único que haya que mirar.
       */
      const otro = sistemaDePunto(nombrePunto)
      if (otro?.parse(nombrePunto)) {
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
   * todas. Es lo que hace el servidor —las raíces de cada máquina son ramas
   * hermanas— y también lo que evita que quien explore el tanque se encuentre
   * acelerómetros de otra máquina en la lista. Sin ruta, se enumeran todas:
   * es la raíz.
   */
  async function browse(path) {
    const p = path ?? ''
    const puntos = []
    for (const sistema of SISTEMAS) {
      const tocado = !p || sistema.raices.some(r => r.startsWith(p) || p.startsWith(r))
      if (tocado) puntos.push(...sistema.puntos())
    }
    return { ok: true, status: 200, payload: puntos }
  }

  async function search(text) {
    const q = String(text ?? '').toLowerCase()
    const todos = SISTEMAS.flatMap(s => s.puntos())
    return { ok: true, status: 200, payload: todos.filter(p => p.toLowerCase().includes(q)) }
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
