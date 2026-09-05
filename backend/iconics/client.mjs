/**
 * Cliente de la API REST de FrameWorX (ICONICS).
 *
 * Todas las operaciones devuelven un mismo sobre —`{ ok, status, ... }`— y
 * ninguna lanza: el que llama decide el código HTTP mirando el sobre, sin
 * try/catch repetido en cada ruta.
 *
 * Antes, cada una de las ocho llamadas repetía el mismo bloque de veinte
 * líneas (fetch, olfatear el `content-type`, parsear, envolver el error,
 * medir el tiempo). Ese bloque vive ahora una sola vez en `request()`, y cada
 * operación se queda con lo único que la distingue: la URL, el cuerpo y cómo
 * se llama su fallo.
 */
import { logger } from '../logger.mjs'

const JSON_CONTENT_TYPE = 'application/json'
const NOT_CONFIGURED = Object.freeze({
  ok: false,
  status: 500,
  error: 'ICONICS_API_BASE is not configured.',
})

/** Cabecera propietaria que limita cuántas muestras devuelve el servidor. */
const MAX_ITEM_COUNT_HEADER = 'X-ICO-MAX-ITEM-COUNT'
/** Su presencia indica que la respuesta se truncó y queda más por leer. */
const CONTINUATION_HEADER = 'X-ICO-CONTINUATION'

/** ICONICS responde JSON casi siempre, pero devuelve texto plano en errores. */
async function parsePayload(response) {
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes(JSON_CONTENT_TYPE) ? response.json() : response.text()
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : 'Unexpected proxy error.'
}

/**
 * Unos pocos nombres de punto, para que quepan en una línea.
 *
 * La lista entera va en los metadatos; esto es lo que se lee de un vistazo.
 */
function resumirNombres(nombres, cuantos = 3) {
  const corto = nombres.slice(0, cuantos).join(', ')
  return nombres.length > cuantos ? `${corto} y ${nombres.length - cuantos} más` : corto
}

/**
 * El motivo que da ICONICS, resumido para que quepa en una línea de log.
 *
 * El sobre entero ya viaja en `upstreamPayload`; esto es lo que se lee de un
 * vistazo. ICONICS contesta unas veces JSON con `detail` o `message`, y otras
 * texto plano —un volcado de excepción de .NET de varios miles de
 * caracteres—, así que se recorta.
 */
function motivoDelServidor(payload) {
  if (!payload) return 'sin detalle'

  const texto = typeof payload === 'string'
    ? payload
    : (payload.detail ?? payload.message ?? payload.error ?? JSON.stringify(payload))

  const limpio = String(texto).replace(/\s+/g, ' ').trim()
  if (!limpio) return 'sin detalle'
  return limpio.length > 200 ? `${limpio.slice(0, 200)}…` : limpio
}

export function createIconicsClient(config, authenticator) {
  const { endpoints, isConfigured, origin } = config.iconics
  const {
    maxUpstreamItems, healthTimeoutMs, upstreamTimeoutMs, batchCacheTtlMs,
    maxHistoryPaginas, maxHistoryMs,
    historyCacheTtlMs, historyCacheMax, historyCacheMargenMs,
  } = config.limits

  /**
   * Única llamada saliente del backend. Normaliza autenticación, parseo,
   * errores y traza.
   *
   * @param {object} options
   * @param {string|URL} options.url
   * @param {string} [options.method]
   * @param {object} [options.headers]   Cabeceras extra sobre las de auth.
   * @param {object} [options.json]      Cuerpo a serializar como JSON.
   * @param {string} options.failure     Mensaje si el servidor responde !2xx.
   * @param {string} [options.event]     Qué operación es, para la traza.
   * @param {(ms:number)=>string} [options.describir]
   *   Compone la línea del log a partir de la duración. Recibe los ms porque
   *   el dato que más se busca en una traza de lectura es cuánto tardó, y
   *   ponerlo en la frase evita tener que cruzarlo con los metadatos.
   *
   *   Existe en vez de registrar `event` a secas porque una etiqueta —«ICONICS
   *   batch fetch»— dice qué función corrió, no qué se leyó: con veinte
   *   líneas iguales en pantalla no hay forma de saber cuál era la señal que
   *   iba mal.
   * @param {object} [options.meta]      Contexto adicional para la traza.
   */
  async function request({ url, method = 'GET', headers = {}, json, failure, event, describir, meta = {} }) {
    const startedAt = Date.now()

    try {
      const authHeaders = await authenticator.authorizationHeaders()
      const response = await fetch(url, {
        method,
        headers: {
          ...authHeaders,
          ...headers,
          ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(json === undefined ? {} : { body: JSON.stringify(json) }),
        // Toda salida pasa por aquí, así que este corte las cubre todas. Sin
        // él, un ICONICS que acepta la conexión y no contesta —el modo de
        // fallo de un servidor saturado, no el de uno caído— dejaba la
        // petición colgada para siempre y el socket ocupado con ella.
        signal: AbortSignal.timeout(upstreamTimeoutMs),
      })

      const payload = await parsePayload(response)
      const durationMs = Date.now() - startedAt

      /*
       * Las lecturas que van bien se registran en `debug`, no en `info`.
       *
       * El tablero hace decenas por pantalla y en `info` tapaban todo lo
       * demás —que es lo que se veía en planta: páginas de «ICONICS batch
       * fetch» seguidas—. Lo que de verdad hace falta saber en marcha normal
       * son los fallos y lo lento, y de eso ya hablan las ramas de abajo y el
       * `onResponse` de `app.mjs`. Con `LOG_LEVEL=debug` vuelven a aparecer,
       * que es cuando se quieren: depurando.
       */
      if (response.ok && (describir || event)) {
        logger.debug(describir ? describir(durationMs) : event, {
          ...meta,
          status: response.status,
          durationMs,
        })
      }

      /*
       * Sólo se traza el camino feliz: un fallo sale como ERROR justo debajo
       * con el motivo del servidor, y trazarlo también en `debug` ponía la
       * misma petición dos veces en pantalla —una diciendo que se leyó y otra
       * que falló—, que es exactamente lo que confunde al depurar.
       */
      if (!response.ok) {
        // El mensaje que ve el usuario (`failure`) es genérico a propósito
        // (ver cabecera del archivo); el motivo real que da ICONICS solo
        // interesa para diagnóstico, así que va al log, no al sobre.
        logger.error(
          `ICONICS rechazó ${event ?? 'la petición'} con un ${response.status}: ${motivoDelServidor(payload)}`,
          { ...meta, status: response.status, upstreamPayload: payload }
        )
        return { ok: false, status: response.status, error: failure, payload }
      }
      return { ok: true, status: response.status, payload, headers: response.headers }
    } catch (error) {
      const ms = Date.now() - startedAt
      logger.error(
        error?.name === 'TimeoutError'
          ? `ICONICS no respondió a ${event ?? 'la petición'} en ${upstreamTimeoutMs} ms. ` +
            'Suele ser un servidor de planta saturado, no caído: acepta la conexión y no contesta.'
          : `No se pudo contactar con ICONICS para ${event ?? 'la petición'} tras ${ms} ms: ` +
            `${error?.message ?? error}. Revisa que ${origin || 'ICONICS_API_BASE'} sea alcanzable.`,
        { ...meta, durationMs: ms, err: error }
      )

      // El corte se distingue del resto de fallos de red: 504 y un mensaje que
      // dice cuánto se esperó. "El servidor tardó más de 15 s" y "no se pudo
      // conectar" se arreglan en sitios distintos, y un 502 genérico los
      // confunde justo cuando hay prisa por saber cuál de los dos es.
      if (error?.name === 'TimeoutError') {
        return {
          ok: false,
          status: 504,
          error: `ICONICS no respondió en ${upstreamTimeoutMs} ms.`,
        }
      }
      return { ok: false, status: 502, error: toErrorMessage(error) }
    }
  }

  /** Envoltorio para operaciones cuya respuesta es `{ ok, status, payload }`. */
  async function requestPayload(options) {
    if (!isConfigured) return NOT_CONFIGURED

    const result = await request(options)
    if (!result.ok) return result
    return { ok: true, status: result.status, payload: result.payload }
  }

  function withParams(endpoint, params) {
    const url = new URL(endpoint)
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value)
    }
    return url
  }

  /* ── Lectura ──────────────────────────────────────────────────────── */

  async function readPoint(pointName) {
    if (!isConfigured) return NOT_CONFIGURED
    if (!pointName) return { ok: false, status: 400, error: 'pointName is required.' }

    const result = await request({
      url: withParams(endpoints.data, { pointName }),
      failure: 'ICONICS API request failed.',
      event: `la lectura de ${pointName}`,
      describir: ms => `Leído ${pointName} en ${ms} ms`,
      meta: { pointName },
    })

    if (!result.ok) return result
    return { ok: true, status: result.status, payload: result.payload, pointName }
  }

  /**
   * Lee muchos puntos en una sola llamada (`POST /Data`).
   * Devuelve un mapa indexado por `pointName`, que es la forma que espera el
   * motor de sondeo del frontend.
   */
  async function fetchPoints(pointNames) {
    const result = await request({
      url: endpoints.data,
      method: 'POST',
      json: { pointName: pointNames },
      failure: 'ICONICS batch request failed.',
      event: `la lectura en lote de ${pointNames.length} señales`,
      /*
       * Se nombran las señales, no sólo cuántas: con el tablero abierto son
       * lotes de ocho cada pocos segundos, y «8 señales» repetido no permite
       * distinguir la pantalla de planta de la de vibraciones cuando una de
       * las dos va mal. Se recorta a tres para que la línea siga siendo una
       * línea.
       */
      describir: ms =>
        `Leídas ${pointNames.length} señales en ${ms} ms (${resumirNombres(pointNames)})`,
      meta: { senales: pointNames.length, puntos: pointNames },
    })

    if (!result.ok) return result

    const byPointName = {}
    if (Array.isArray(result.payload)) {
      for (const item of result.payload) {
        byPointName[item.pointName] = { ok: true, status: 200, payload: item }
      }
    }
    return { ok: true, status: 200, payload: byPointName }
  }

  /**
   * Caché muy corta de las lecturas en vivo, POR PUNTO.
   *
   * El motor de sondeo agrupa muy bien DENTRO de un navegador —una petición
   * por ciclo con la unión de los tags que las vistas montadas necesitan—,
   * pero eso es por CADA pantalla encendida, y todas piden casi lo mismo. Con
   * diez wallboards en planta, ICONICS recibía diez veces la misma consulta.
   *
   * ── POR QUÉ DEJÓ DE INDEXARSE POR CONJUNTO (Plan 21 F4) ────────────
   *
   * Porque la clave era el conjunto ENTERO de puntos, ordenado y unido. Eso
   * hace que dos lecturas compartan caché **sólo si piden exactamente lo
   * mismo**: la pantalla del tanque (8 puntos) y la de vibraciones (73) no
   * comparten nada, lo cual está bien porque no se solapan — pero tampoco
   * comparten nada dos vistas de la MISMA máquina que se solapen en el 90 %,
   * ni la vista completa con la que sólo mira un activo.
   *
   * Y empeora con el catálogo: el número de conjuntos distintos que se pueden
   * pedir crece con las combinaciones de vistas montadas, no con el número de
   * puntos. Cada vista nueva multiplica las claves posibles; cada punto nuevo
   * sólo suma una.
   *
   * Indexando por punto, el coste deja de depender de cómo se agrupen las
   * vistas: se pide a ICONICS lo que falte, agrupado en UNA llamada, y lo que
   * ya está fresco no se vuelve a pedir aunque venga en otro conjunto.
   *
   * ── LO QUE NO CAMBIA ───────────────────────────────────────────────
   *
   * El sobre que se devuelve, punto por punto. Si el lote que hacía falta
   * falla, se devuelve ESE fallo tal cual —y no una respuesta parcial— porque
   * es lo que hoy ve el frontend y lo que `/api/iconics/data/batch` traduce a
   * un código HTTP. Una lectura a medias que se presentara como buena sería
   * justo la clase de mentira que este proyecto persigue.
   *
   * Se guarda la PROMESA del lote y no su resultado: así las peticiones que
   * llegan mientras la llamada está en vuelo esperan a esa misma llamada en
   * vez de arrancar la suya. Es el mismo patrón que `pendingAuthentication` en
   * el autenticador, y por la misma razón.
   *
   * La ventana (2 s) es un orden de magnitud menor que la cadencia de sondeo,
   * así que ningún dato llega más viejo de lo que ya llegaba. Una escritura
   * puede leerse desactualizada durante esos 2 s; no se invalida por punto
   * porque el único escritor es la vista de Data, que no está en producción.
   */
  const puntoCache = new Map()

  function podarPuntoCache(ahora) {
    for (const [punto, entrada] of puntoCache) {
      if (entrada.expiraEn <= ahora) puntoCache.delete(punto)
    }
  }

  /** Quita del caché los puntos de un lote que falló, sin tocar los de otro. */
  function olvidar(puntos, lote) {
    for (const punto of puntos) {
      if (puntoCache.get(punto)?.lote === lote) puntoCache.delete(punto)
    }
  }

  /**
   * Compone la respuesta a partir de las entradas ya resueltas.
   *
   * Recibe las entradas CAPTURADAS antes de esperar a nada: si se releyeran
   * del mapa después del `await`, un lote que falló entre medias las habría
   * borrado y esta función devolvería un `ok: true` sin esos puntos — es decir,
   * una lectura incompleta presentada como buena.
   */
  async function componer(entradas) {
    const lotes = new Set()
    for (const [, entrada] of entradas) if (entrada) lotes.add(entrada.lote)

    const resultados = await Promise.all([...lotes])

    /*
     * Si CUALQUIERA de los lotes implicados falló, falla la lectura entera. Es
     * el comportamiento de siempre y se conserva a propósito: quien pide ocho
     * señales y recibe seis sin saberlo pinta una pantalla con dos huecos que
     * parecen datos ausentes de la planta, cuando lo que pasó es que el puente
     * no pudo leer.
     */
    const fallo = resultados.find(resultado => !resultado?.ok)
    if (fallo) return fallo

    const porLote = new Map()
    for (let i = 0; i < resultados.length; i++) porLote.set([...lotes][i], resultados[i])

    const byPointName = {}
    for (const [punto, entrada] of entradas) {
      if (!entrada) continue
      const item = porLote.get(entrada.lote)?.payload?.[punto]
      // Un punto que el servidor no devolvió se omite, igual que antes: para
      // el motor de sondeo eso es un hueco, que es lo que es.
      if (item) byPointName[punto] = item
    }

    return { ok: true, status: 200, payload: byPointName }
  }

  function readPoints(pointNames) {
    if (!isConfigured) return Promise.resolve(NOT_CONFIGURED)
    if (batchCacheTtlMs <= 0) return fetchPoints(pointNames)

    const ahora = Date.now()
    podarPuntoCache(ahora)

    const faltantes = pointNames.filter(punto => {
      const entrada = puntoCache.get(punto)
      return !(entrada && entrada.expiraEn > ahora)
    })

    if (faltantes.length) {
      // UNA sola llamada con todo lo que falte, venga de donde venga: es lo
      // que hace que trocear las vistas no multiplique las peticiones.
      const lote = fetchPoints(faltantes)
      const expiraEn = ahora + batchCacheTtlMs
      for (const punto of faltantes) puntoCache.set(punto, { expiraEn, lote })

      /*
       * Un fallo no se cachea: mantener 2 s el error de una caída momentánea
       * retrasaría la recuperación de todas las pantallas a la vez, y el
       * siguiente ciclo de sondeo llega enseguida de todos modos.
       */
      lote.then(
        resultado => { if (!resultado?.ok) olvidar(faltantes, lote) },
        () => olvidar(faltantes, lote)
      )
    }

    // Capturado AHORA, antes de esperar: ver la cabecera de `componer`.
    return componer(pointNames.map(punto => [punto, puntoCache.get(punto)]))
  }

  /* ── Serie histórica del Hyper Historian ──────────────────────────
   *
   * Son DOS funciones desde el Plan 20 F6, y la separación es la que hace
   * legible la caché: `readHistory` decide si hace falta salir al servidor y
   * `leerHistoriaDelServidor` sale. Todo lo que sigue —la paginación, el
   * presupuesto, la normalización de las dos formas de respuesta— es de la
   * segunda; lo de la primera está en su propio comentario, justo debajo.
   *
   * Normaliza las dos formas en que el servidor devuelve la serie —envuelta en
   * `historicalSamples` o como muestras sueltas— a una sola lista
   * `{ timestamp, value, quality }`, para que el frontend no tenga que
   * conocer ambas.
   *
   * ── SIGUE `X-ICO-CONTINUATION` DE VERDAD (Plan 15 Fase 1) ──────────
   *
   * Antes de esto, una sola llamada se quedaba en la primera página (hasta
   * `maxUpstreamItems` muestras) y `hasMore` sólo avisaba de que había más,
   * sin traerlas. Medido contra el servidor real (Plan 15 §0): el token SÍ
   * pagina —reenviarlo trae páginas sucesivas sin repetir ninguna muestra,
   * en crudo y en agregado— así que no hace falta simular la profundidad
   * troceando el rango en varias llamadas HTTP distintas desde quien
   * consulta: se resuelve aquí, una vez, para las tres capas que hoy lo
   * repiten (`Demo-EVA/data/historia.js`, `ia/conversacion/herramientas.mjs`, y el propio
   * script de sondeo).
   *
   * El bucle corta por lo primero que se cumpla de `maxHistoryPaginas`,
   * `maxHistoryMs` (el plazo TOTAL de la cadena, distinto de
   * `upstreamTimeoutMs` que corta cada `fetch` individual), o que el
   * servidor deje de mandar continuación. `hasMore` conserva su significado
   * de siempre —"queda algo por leer que esta llamada no trajo"— sea porque
   * el servidor lo dice o porque el propio presupuesto cortó antes;
   * `truncada`/`motivoCorte` son los campos NUEVOS que distinguen cuál de
   * las dos cosas pasó, para quien lo necesite sin romper a quien sólo mira
   * `hasMore`.
   */
  /**
   * Caché de tramos históricos YA CERRADOS.
   *
   * ── QUÉ SE CACHEA, Y QUÉ NO ────────────────────────────────────────
   *
   * Sólo lo que no puede cambiar. Un tramo cuyo `endDate` pasó hace más de
   * `historyCacheMargenMs` es inmutable por definición: nadie escribe una
   * muestra con fecha de ayer. Lo que toca «ahora» NO entra, porque el
   * historiador escribe con retraso y cachear el borde congelaría un hueco que
   * se iba a llenar solo.
   *
   * Tampoco entra una lectura TRUNCADA. Si el presupuesto de páginas o de
   * tiempo cortó la serie, guardarla sería fijar un recorte accidental —el de
   * un momento en que el servidor iba lento— durante toda la vida de la
   * entrada, y las gráficas siguientes heredarían esa cobertura sin motivo.
   * Un fallo tampoco: el siguiente en pedirlo tiene derecho a que se intente
   * otra vez.
   *
   * ── POR QUÉ AQUÍ Y NO EN LA RUTA ───────────────────────────────────
   *
   * Porque `POST /api/iconics/history/batch` trocea la ventana y llama a esta
   * misma función una vez por (señal × tramo). Cacheando aquí, los dos caminos
   * —el tramo suelto y la ventana troceada— comparten entradas: la pantalla de
   * «Gráficas» de la segunda pestaña no vuelve a pedir ni un tramo.
   *
   * Se guarda la PROMESA, igual que en `batchCache` y por el mismo motivo: dos
   * pantallas que abren la misma vista a la vez esperan a la misma llamada en
   * vez de arrancar cada una la suya.
   */
  const historyCache = new Map()

  function historyKey({ pointName, startDate, endDate, aggregate, interval }) {
    return [pointName, startDate, endDate, aggregate ?? '', interval ?? ''].join('|')
  }

  /** ¿Es un tramo que ya no puede cambiar? Ver `historyCacheMargenMs`. */
  function tramoCerrado(endDate) {
    if (!endDate) return false
    const fin = new Date(endDate).getTime()
    if (!Number.isFinite(fin)) return false
    return fin < Date.now() - historyCacheMargenMs
  }

  /**
   * Deja la caché por debajo del tope, tirando primero lo caducado y, si no
   * basta, lo más viejo.
   *
   * `Map` conserva el orden de inserción, así que «lo más viejo» es lo primero
   * que devuelve el iterador — no hace falta guardar marcas de uso ni ordenar
   * nada. No es una LRU: no es lo mismo, y aquí no importa, porque todo lo que
   * hay dentro vale lo mismo (un tramo que ya no cambia) y lo que se busca es
   * un techo de memoria, no una tasa de acierto óptima.
   */
  function podarHistoryCache(ahora) {
    for (const [clave, entrada] of historyCache) {
      if (entrada.expiraEn <= ahora) historyCache.delete(clave)
    }
    while (historyCache.size >= historyCacheMax) {
      const primera = historyCache.keys().next()
      if (primera.done) break
      historyCache.delete(primera.value)
    }
  }

  async function readHistory(opciones) {
    if (!isConfigured) return NOT_CONFIGURED

    if (historyCacheTtlMs <= 0 || !tramoCerrado(opciones.endDate)) {
      return leerHistoriaDelServidor(opciones)
    }

    const ahora = Date.now()
    const clave = historyKey(opciones)
    const cacheada = historyCache.get(clave)
    if (cacheada && cacheada.expiraEn > ahora) return cacheada.promesa

    const promesa = leerHistoriaDelServidor(opciones)
    podarHistoryCache(ahora)
    historyCache.set(clave, { expiraEn: ahora + historyCacheTtlMs, promesa })

    promesa
      .then(resultado => {
        // Ver la cabecera: ni los fallos ni las series truncadas se guardan.
        if (!resultado?.ok || resultado.truncada) historyCache.delete(clave)
      })
      .catch(() => historyCache.delete(clave))

    return promesa
  }

  async function leerHistoriaDelServidor({ pointName, startDate, endDate, aggregate, interval }) {
    if (!isConfigured) return NOT_CONFIGURED

    const inicio = Date.now()
    const data = []
    let continuation
    let paginasPedidas = 0
    let truncada = false
    let motivoCorte = null

    while (paginasPedidas < maxHistoryPaginas) {
      if (paginasPedidas > 0 && Date.now() - inicio > maxHistoryMs) {
        truncada = true
        motivoCorte = `se alcanzó el plazo de ${maxHistoryMs} ms tras ${paginasPedidas} página(s).`
        break
      }

      const result = await request({
        url: withParams(endpoints.history, {
          pointName,
          startDate,
          endDate,
          aggregateName: aggregate,
          processingInterval: interval,
        }),
        headers: {
          [MAX_ITEM_COUNT_HEADER]: String(maxUpstreamItems),
          ...(continuation ? { [CONTINUATION_HEADER]: continuation } : {}),
        },
        failure: 'ICONICS History request failed.',
        event: `la página ${paginasPedidas + 1} del historial de ${pointName}`,
        describir: ms =>
          `Historial de ${pointName}: página ${paginasPedidas + 1} en ${ms} ms`,
        meta: { pointName, pagina: paginasPedidas + 1 },
      })
      paginasPedidas += 1

      if (!result.ok) {
        // Una página intermedia que falla no descarta las anteriores: se
        // cuenta como el motivo del corte y se devuelve lo que ya se tiene.
        // Fallar la serie entera por un fallo en, digamos, la página 15 de
        // 20 sería peor que una gráfica con una cobertura declarada.
        if (paginasPedidas === 1) return result
        truncada = true
        motivoCorte = `la página ${paginasPedidas} falló: ${result.error ?? 'error del servidor'}.`
        break
      }

      data.push(...normalizeHistorySamples(result.payload))
      continuation = result.headers.get(CONTINUATION_HEADER)
      if (!continuation) break
    }

    if (continuation && paginasPedidas >= maxHistoryPaginas) {
      truncada = true
      motivoCorte = `se alcanzó el tope de ${maxHistoryPaginas} páginas.`
    }

    return {
      ok: true,
      status: 200,
      data,
      hasMore: Boolean(continuation),
      paginas: paginasPedidas,
      truncada,
      motivoCorte,
    }
  }

  function browse(path) {
    return requestPayload({
      url: withParams(endpoints.dataBrowse, { path }),
      failure: 'ICONICS browse failed.',
      event: `la exploración de ${path || 'la raíz'}`,
      describir: ms =>
        path ? `Explorada la rama ${path} en ${ms} ms` : `Explorada la raíz del árbol en ${ms} ms`,
      meta: { path },
    })
  }

  function search(text) {
    return requestPayload({
      url: withParams(endpoints.dataSearch, { text }),
      failure: 'ICONICS points search failed.',
      event: `la búsqueda de "${text}"`,
      describir: ms => `Buscado "${text}" en el catálogo (${ms} ms)`,
      meta: { text },
    })
  }

  function readUserInfo() {
    return requestPayload({
      url: endpoints.userInfo,
      failure: 'ICONICS UserInfo request failed.',
      event: 'la consulta del usuario',
      describir: ms => `Consultado el usuario de la sesión ICONICS en ${ms} ms`,
    })
  }

  /* ── Escritura ────────────────────────────────────────────────────── */

  /**
   * Envío común a `POST /Data/Write`, que atiende tanto una escritura suelta
   * como un lote: para el servidor las dos son la misma lista de `WriteItem`.
   * Lo único que cambia es cómo se traza y cómo se presenta el resultado.
   */
  async function sendWrite(items, trace) {
    if (!isConfigured) return NOT_CONFIGURED

    const result = await request({
      url: endpoints.dataWrite,
      method: 'POST',
      json: items,
      ...trace,
    })

    if (!result.ok) return result
    return {
      ok: true,
      status: 200,
      results: Array.isArray(result.payload) ? result.payload : [result.payload],
    }
  }

  /**
   * Escribe un punto. Sirve además para disparar los Data Manipulators de
   * GridWorX, escribiendo `true` en su punto `.@@Execute`.
   */
  async function writePoint(pointName, value) {
    const result = await sendWrite([{ pointName, value }], {
      failure: 'ICONICS write request failed.',
      event: `la escritura de ${pointName}`,
      describir: ms => `Escrito ${pointName} = ${value} en ${ms} ms`,
      meta: { pointName, valor: value },
    })

    if (!result.ok) return result
    return { ok: true, status: 200, result: result.results[0] }
  }

  function writePoints(items) {
    return sendWrite(items, {
      failure: 'ICONICS batch write request failed.',
      event: `la escritura de ${items.length} puntos`,
      describir: ms =>
        `Escritos ${items.length} puntos en ${ms} ms (${resumirNombres(items.map(i => i.pointName))})`,
      meta: { puntos: items.length, nombres: items.map(i => i.pointName) },
    })
  }

  /* ── Alarmas ──────────────────────────────────────────────────────── */

  async function readAlarmHistory({ pointName, startDate, endDate }) {
    if (!isConfigured) return NOT_CONFIGURED

    const result = await request({
      url: withParams(endpoints.alarmHistory, { pointName, startDate, endDate }),
      headers: { [MAX_ITEM_COUNT_HEADER]: String(maxUpstreamItems) },
      failure: 'ICONICS AlarmHistory request failed.',
      event: `el historial de alarmas${pointName ? ` de ${pointName}` : ''}`,
      describir: ms =>
        `Leídas las alarmas${pointName ? ` de ${pointName}` : ' de toda la planta'} en ${ms} ms`,
      meta: { pointName },
    })

    if (!result.ok) return result
    return { ok: true, status: 200, alarms: Array.isArray(result.payload) ? result.payload : [] }
  }

  async function acknowledgeAlarms(eventIds, comment) {
    if (!isConfigured) return NOT_CONFIGURED

    const result = await request({
      url: endpoints.alarmState,
      method: 'PUT',
      json: { operation: 'Acknowledge', eventIds, comment },
      failure: 'ICONICS ACK request failed.',
      event: `el reconocimiento de ${eventIds.length} alarma(s)`,
      describir: ms => `Reconocidas ${eventIds.length} alarma(s) en ${ms} ms`,
      meta: { alarmas: eventIds.length },
    })

    if (!result.ok) return result
    return { ok: true, status: 200, result: result.payload }
  }

  /* ── Diagnóstico ──────────────────────────────────────────────────── */

  /**
   * Ping a `/fwxapi/echo/v1`, que no exige autenticación. Comprueba solo que
   * el servidor está en pie: distinguir "no se llega" de "se llega pero no
   * autentica" es justo lo que hace útil a `/api/health`.
   */
  async function ping() {
    if (!isConfigured) return { reachable: false, reason: 'ICONICS_API_BASE not configured' }

    try {
      const response = await fetch(endpoints.echo, {
        signal: AbortSignal.timeout(healthTimeoutMs),
      })
      return { reachable: response.ok, httpStatus: response.status }
    } catch (error) {
      return {
        reachable: false,
        reason: error.name === 'TimeoutError' ? 'timeout' : toErrorMessage(error),
      }
    }
  }

  return {
    acknowledgeAlarms,
    browse,
    ping,
    readAlarmHistory,
    readHistory,
    readPoint,
    readPoints,
    readUserInfo,
    search,
    writePoint,
    writePoints,
  }
}

/**
 * Aplana la respuesta de `/History` a una lista de muestras.
 *
 * La versión anterior *asignaba* (`samples = ...`) dentro del bucle, así que
 * con más de un punto en la respuesta solo sobrevivían las muestras del
 * último. Aquí se acumulan.
 */
function normalizeHistorySamples(payload) {
  if (!Array.isArray(payload)) return []

  const samples = []
  for (const item of payload) {
    if (Array.isArray(item.historicalSamples)) {
      samples.push(
        ...item.historicalSamples.map(sample => ({
          timestamp: sample.timestamp,
          value: sample.value,
          quality: sample.quality ?? 0,
        }))
      )
    } else if (item.timestamp !== undefined && item.value !== undefined) {
      samples.push({ timestamp: item.timestamp, value: item.value, quality: item.quality ?? 0 })
    }
  }
  return samples
}
