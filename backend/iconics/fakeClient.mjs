/**
 * Transporte falso de ICONICS, para trabajar sin servidor de planta.
 *
 * ── PARA QUÉ (Plan 14 §7.1) ─────────────────────────────────────────
 *
 * El simulador vivía sólo en el frontend (`Demo-EVA/data/simulador.js`): sin
 * `ICONICS_API_BASE` alcanzable, las herramientas del asistente
 * devuelven error y no hay forma de ejercitar el bucle de chat con datos.
 * `ICONICS_FAKE=true` lo levanta también aquí, con la MISMA FIRMA que
 * `iconics/client.mjs` (`readPoint`, `readPoints`, `writePoint`, `writePoints`,
 * `readHistory`, `readAlarmHistory`, `acknowledgeAlarms`, `browse`, `search`,
 * `readUserInfo`, `ping`), así que `app.mjs` sólo tiene que elegir cuál de los
 * dos construir — nada más del backend se entera de la diferencia.
 *
 * La física —cómo se mueve cada señal— es la MISMA función pura que usa el
 * simulador del frontend: `shared/eva/tanque/simulador.js`. Lo que es propio de AQUÍ
 * es reproducir el comportamiento del SERVIDOR, no sólo el de la señal:
 *
 *  - **Las tres señales que devuelven la serie de OTRA.** Medido contra el
 *    servidor real (ver cabecera de `shared/eva/comun/historia.js`): pedir la
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
 * Y es deliberado. Quien lo sabe es `shared/eva/comun/sistemas.js`; aquí se pregunta
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
import { SENALES, esHistorizada, parsePointName, parsePuntoHistorico } from '../../shared/eva/tanque/senales.js'
import { MAX_PUNTOS } from '../../shared/eva/comun/historia.js'
import { mediaDelTramo } from '../../shared/eva/tanque/simulador.js'
import { SISTEMAS, sistemaDePunto, valorSimuladoDe } from '../../shared/eva/comun/sistemas.js'
/*
 * El catálogo de la instalación de la DEMO (Plan 40 F3): la máquina de
 * vibraciones ya no está escrita en el registro, pero el SERVIDOR que este
 * transporte imita sí publica sus tags y sus series, haya o no una
 * configurada que los reclame. Sin esto, arrancar con ICONICS_FAKE=true y sin
 * maquinas.json daría un árbol sin vibraciones que explorar ni configurar.
 */
import { CATALOGO_VIBRACIONES } from '../../shared/eva/vibraciones/catalogoDemo.js'
import { QUALITY_BAD_UA, QUALITY_GOOD_UA, QUALITY_SIN_DATO, isGoodQuality } from '../../shared/quality.js'

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
 * Ahora el que sabe qué máquinas hay es `shared/eva/comun/sistemas.js`, y este
 * archivo no se entera de cuántas son.
 *
 * `valorSimuladoDe` distingue tres cosas y aquí se traducen las tres: punto
 * ajeno (`undefined`), punto propio que ahora no entrega (`null`) y valor.
 */
function lecturaSimulada(name, t, rnd) {
  /* Primero el registro (una configurada trae su propia física); SÓLO si nadie
     lo reclama (undefined), el catálogo de la demo, que es lo que el servidor
     real publica. Un `null` del registro es «declarado, sin dato» y se respeta:
     con `??` el catálogo lo habría pisado. */
  const delRegistro = valorSimuladoDe(name, t)
  const valor = delRegistro === undefined ? CATALOGO_VIBRACIONES.modelo(name, t) : delRegistro
  if (valor === undefined) return null
  if (valor === null) return { pointName: name, quality: QUALITY_SIN_DATO }
  if (rnd() < CAOS.malaCalidad) return { pointName: name, value: 0, quality: QUALITY_BAD_UA }
  return { pointName: name, value: valor, quality: QUALITY_GOOD_UA }
}

/**
 * ¿Es un punto de MANDO (`naturaleza: "mando"` del catálogo, hoy sólo
 * `CONTROL`, Plan 27 F3)? Estos no pasan por `lecturaSimulada`: no tienen
 * física propia que simular —son una orden del operador, no una medida—, así
 * que su lectura tiene que reflejar lo último ESCRITO, igual que hace este
 * transporte con cualquier punto ajeno a todos los catálogos. Sin esta
 * guarda, `CONTROL` entraría al catálogo (F3) con un valor simulado propio y
 * `controlar_bomba` dejaría de poder confirmar sus propias escrituras contra
 * el transporte falso — la relectura vería la física, nunca la orden.
 */
function esMando(name) {
  return SENALES[parsePointName(name)]?.naturaleza === 'mando'
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
/**
 * La media de un tramo para un punto EN VIVO de cualquier máquina que no sea
 * el tanque (Plan 39 F2): se muestrea su simulación unas veces dentro del
 * tramo y se promedia, que es lo que hace `Average` en el historiador. Si la
 * máquina simulada está parada en todo el tramo —`valorSimuladoDe` da
 * `null`— no hay muestra, que es exactamente lo que devuelve el servidor
 * real de un tramo sin registro: nada, no un cero.
 */
const SUBMUESTRAS_SIMULADAS = 4
function mediaSimulada(puntoEnVivo, desdeMs, hastaMs) {
  const paso = (hastaMs - desdeMs) / SUBMUESTRAS_SIMULADAS
  let suma = 0
  let n = 0
  for (let i = 0; i < SUBMUESTRAS_SIMULADAS; i++) {
    const v = valorSimuladoDe(puntoEnVivo, desdeMs + (i + 0.5) * paso)
    if (typeof v === 'number' && Number.isFinite(v)) { suma += v; n += 1 }
    else if (typeof v === 'boolean') { suma += v ? 1 : 0; n += 1 }
  }
  return n ? suma / n : null
}

/**
 * De qué máquina y qué clave es un nombre `hda:` que no es del tanque.
 *
 * Se pregunta al REGISTRO: la entrada cuya `series.punto(clave)` sea
 * exactamente ese nombre. Devuelve también el punto EN VIVO con que se
 * simula la serie —la única forma de darle valores—; una configurada con tags
 * ajenos a toda máquina escrita a mano no tiene simulación, y entonces no
 * hay serie que servir.
 *
 * ── QUIÉN DECIDE SI EL TAG «SE RECOLECTA» (Plan 42 F2) ─────────────
 *
 * El mismo nombre `hda:` puede estar en DOS entradas: la máquina configurada
 * que lo declara y el catálogo del tipo (`CATALOGO_VIBRACIONES`), que hace de
 * «servidor» del falso. Sus `esHistorizada` significan cosas distintas: en la
 * configurada es «el sondeo ya la verificó»; en el catálogo es «el grupo del
 * historiador la registra». Para decidir si el servidor falso SIRVE la serie
 * manda la segunda: si sólo mandara la primera, una máquina recién dada de
 * alta —ninguna serie verificada— no podría sondearse nunca contra el falso,
 * porque el falso le negaría las series que el sondeo necesita para
 * verificarlas. Por eso, entre las entradas que conocen el nombre, se prefiere
 * la que lo historiza; si ninguna lo hace, se devuelve la primera y quien
 * llama contesta el 500 de «no se recolecta» — el caso de una configurada con
 * su propio grupo que el catálogo no conoce (`verificar-transporte-falso`).
 */
function serieDeOtraMaquina(nombrePunto) {
  let primera = null
  for (const sistema of [...SISTEMAS, CATALOGO_VIBRACIONES]) {
    if (sistema.id === 'tanque') continue
    const clave = sistema.claves().find(k => sistema.series.punto(k) === nombrePunto)
    if (!clave) continue
    const enVivo = sistema.puntos().find(p => {
      const d = sistema.parse(p)
      return d && (d.canal ? `${d.clave}_${d.canal}` : d.clave) === clave
    })
    const candidata = { sistema, clave, enVivo: enVivo ?? null }
    if (sistema.esHistorizada(clave) && candidata.enVivo) return candidata
    primera ??= candidata
  }
  return primera
}

function paginaDe(mediaDe, startMs, endMs, pasoMs, offset, rnd) {
  const totalPuntos = Math.max(1, Math.round((endMs - startMs) / pasoMs))
  const fin = Math.min(offset + MAX_UPSTREAM_ITEMS, totalPuntos)

  const data = []
  for (let i = offset; i < fin; i++) {
    const cierre = startMs + (i + 1) * pasoMs
    if (rnd() < CAOS.ausente) continue

    let value = mediaDe(cierre - pasoMs, cierre)
    if (value === null || value === undefined) continue
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
/**
 * El árbol de `browse` derivado del registro. Ver la cabecera de `browse`.
 *
 * Devuelve dos índices: `hijos` (carpeta → nodos directos) y `hojas` (los
 * puntos finales, para contestar `[]` al explorarlos).
 */
export function construirArbolFalso(sistemas) {
  const hijos = new Map()
  const hojas = new Set()
  const BARRA = String.fromCharCode(92)

  const anadir = (carpeta, nodo) => {
    if (!hijos.has(carpeta)) hijos.set(carpeta, [])
    const lista = hijos.get(carpeta)
    if (!lista.some(n => n.pointName === nodo.pointName)) lista.push(nodo)
  }

  /* `ac:TDCON/DEMO/SENSORES/Tension` → carpetas `ac:`, `ac:TDCON/`, …, hoja al final.
     Una carpeta declarada como raíz sin hojas directas se registra vacía. */
  const enVivo = (punto, { soloCarpeta = false } = {}) => {
    const cuerpo = punto.slice('ac:'.length)
    const trozos = cuerpo.split('/')
    let carpeta = 'ac:'
    for (let i = 0; i < trozos.length; i++) {
      const seg = trozos[i]
      if (!seg) continue
      const esUltimo = i === trozos.length - 1
      const esCarpeta = !esUltimo || soloCarpeta
      const pointName = esCarpeta ? `${carpeta}${seg}/` : `${carpeta}${seg}`
      anadir(carpeta, { pointName, shortName: seg, class: esCarpeta ? 1 : 0 })
      if (esCarpeta) {
        if (!hijos.has(pointName)) hijos.set(pointName, [])
        carpeta = pointName
      } else {
        hojas.add(pointName)
      }
    }
  }

  /* `hda:\Configuration\GRUPO\S1:vRMS_S1` → carpetas hasta `…\S1\`, tag al final. */
  const historico = tag => {
    const dosPuntos = tag.lastIndexOf(':')
    if (dosPuntos <= 'hda'.length) return
    const ruta = tag.slice('hda:'.length, dosPuntos)
    const nombre = tag.slice(dosPuntos + 1)
    /* Las carpetas del historiador NO llevan contrabarra final (medido el
       21-09-2026: con ella el servidor real contesta 500). `hda:` es la raíz. */
    const trozos = ruta.split(BARRA).filter(Boolean)
    let carpeta = 'hda:'
    for (const seg of trozos) {
      const pointName = `${carpeta}${BARRA}${seg}`
      anadir(carpeta, { pointName, shortName: seg, class: 1 })
      carpeta = pointName
    }
    anadir(carpeta, { pointName: tag, shortName: nombre, class: 0 })
    hojas.add(tag)
  }

  /* `ae:/AREA=Contador` → el área lista sus hijos con el marcador delante. */
  const alarma = punto => {
    const marca = punto.search(/[=.\\]/)
    if (marca === -1) return
    const area = punto.slice(0, marca)
    anadir('ae:', { pointName: area, shortName: area.slice('ae:/'.length), class: 1 })
    anadir(area, { pointName: punto, shortName: punto.slice(marca), class: 0 })
    hojas.add(punto)
  }

  for (const sistema of sistemas) {
    for (const raiz of sistema.raices ?? []) {
      if (raiz.startsWith('ac:')) enVivo(raiz, { soloCarpeta: true })
    }
    for (const punto of sistema.puntos()) {
      if (punto.startsWith('ac:')) enVivo(punto)
      else if (punto.startsWith('ae:')) alarma(punto)
    }
    const series = sistema.series
    if (series?.historizadas && series?.punto) {
      for (const clave of series.historizadas()) {
        const tag = series.punto(clave)
        if (typeof tag === 'string' && tag.startsWith('hda:')) historico(tag)
      }
    }
  }

  /* Sin ruta se contesta la raíz en vivo: es lo que explora `AssetsEva`. */
  hijos.set('', hijos.get('ac:') ?? [])

  return { hijos, hojas }
}

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

    const lectura = esMando(name) ? null : lecturaSimulada(name, ahora(), rnd)
    if (lectura) {
      if (rnd() < CAOS.ausente) return { ok: false, status: 404, error: 'Point not found.' }
      return { ok: true, status: 200, pointName: name, payload: lectura }
    }

    // Sin lectura simulada: un punto de mando (`esMando`), uno fuera de todos
    // los catálogos, o uno que no existe. Los tres se sirven igual — lo
    // último escrito, o `null` si nunca se escribió — porque el servidor real
    // tampoco distingue estos casos en una lectura sencilla.
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

      const lectura = esMando(name) ? null : lecturaSimulada(name, t, rnd)
      byPointName[name] = {
        ok: true, status: 200,
        // Sin lectura simulada: punto de mando, fuera de todos los
        // catálogos, o inexistente. Ver `esMando`.
        payload: lectura ?? { pointName: name, value: escritos.get(name) ?? null, quality: QUALITY_GOOD_UA },
      }
    }

    /*
     * El falso también apunta su telemetría de lecturas. No es adorno: la
     * pantalla de salud la usa para decir cuándo llegó el último valor, y si
     * aquí faltara, en `ICONICS_FAKE` esa tarjeta diría «nunca se ha leído»
     * mientras el tablero se llena de datos. El transporte falso tiene que
     * cumplir la misma firma que el real, incluida ésta.
     */
    apuntarLectura(pointNames, byPointName)
    return { ok: true, status: 200, payload: byPointName }
  }

  /**
   * `confirmacion` y `confirmada` acompañan a toda escritura desde el Plan 21
   * F5, y este transporte tiene que darlos o miente sobre el contrato.
   *
   * Aquí siempre coinciden: el falso guarda lo escrito y lo devuelve al releer,
   * así que la escritura SIEMPRE tiene efecto. Es lo correcto para un
   * simulador —no hay PLC que pueda ignorarla— y hay que saberlo al leer una
   * prueba: el camino de «aceptada pero sin efecto» sólo se ejercita contra el
   * ICONICS falso de `verificar-backend.mjs`, que sí puede fingirlo.
   */
  function confirmacionDe(name, value) {
    return { pointName: name, pedido: value, leido: value, coincide: true }
  }

  async function writePoint(name, value) {
    escritos.set(name, value)
    return {
      ok: true,
      status: 200,
      result: { pointName: name, ok: true },
      confirmacion: confirmacionDe(name, value),
      confirmada: true,
    }
  }

  async function writePoints(items) {
    for (const { pointName: name, value } of items) escritos.set(name, value)
    return {
      ok: true, status: 200,
      results: items.map(({ pointName: name }) => ({ pointName: name, ok: true })),
      confirmacion: items.map(({ pointName: name, value }) => confirmacionDe(name, value)),
      confirmada: true,
    }
  }

  /**
   * `readHistory` reproduce el cruce de señales del servidor real: pedir la
   * serie de una clave SIN historia propia sirve la de `temperaturaTanque`
   * (ver cabecera del archivo). No hay guarda aquí a propósito — la guarda
   * vive en `herramientas.mjs` (`esHistorizada`, comprobada ANTES de salir a
   * la red) y en `shared/eva/comun/historia.js`; este transporte imita al servidor,
   * que tampoco la tiene.
   *
   * Sigue páginas sucesivas (`paginaDe`) con el MISMO contrato y el MISMO
   * presupuesto que `iconics/client.mjs` — ver la cabecera del archivo sobre
   * por qué esto dejó de cortarse en la primera página con la Fase 1 del
   * Plan 15.
   */
  async function readHistory({ pointName: nombrePunto, startDate, endDate, interval }) {
    /*
     * Plan 27 F6 (10-09-2026): el histórico del tanque ya no se pide con el
     * nombre en vivo — `puntoHistorico` construye un `hda:...` distinto para
     * casi toda señal—, así que `parsePointName` (que sólo conoce `ac:`) deja
     * de bastar. `parsePuntoHistorico` es su espejo para el nombre `hda:`.
     * Vibraciones ya necesitaba lo mismo desde antes; el tanque se suma aquí.
     */
    const clave = parsePointName(nombrePunto) ?? parsePuntoHistorico(nombrePunto)

    /** La media de cada tramo, según de quién sea el punto. */
    let mediaDe = null
    if (clave) {
      const claveServida = esHistorizada(clave) ? clave : CLAVE_CRUZADA
      mediaDe = (desde, hasta) => mediaDelTramo(claveServida, desde, hasta)
    } else {
      /*
       * El punto puede ser de OTRA máquina dada de alta (Plan 39 F2). Se
       * pregunta al REGISTRO y no a un catálogo concreto: una entrada cuya
       * `series.punto(clave)` sea este nombre. Si esa clave tiene serie
       * (`esHistorizada`) y un punto en vivo con simulación, se sirve su
       * media por tramo; si la máquina la declara pero no la historiza, el
       * mismo 500 que da el servidor real por un tag que no se recolecta.
       *
       * Hasta el 21-09-2026 aquí se negaba TODA serie que no fuera del tanque
       * con el argumento de que el grupo `DEMO 3` de vibraciones no entregaba.
       * Ese grupo ya no existe y `DEMO_VIBRACIONES` registra 36 series
       * verificadas: negarlas dejaba sin probar, contra el falso, todo lo que
       * las herramientas de historia hacen con una máquina que no es el tanque.
       */
      const otra = serieDeOtraMaquina(nombrePunto)
      if (otra?.sistema.esHistorizada(otra.clave) && otra.enVivo) {
        mediaDe = (desde, hasta) => mediaSimulada(otra.enVivo, desde, hasta)
      } else if (otra || sistemaDePunto(nombrePunto)?.parse(nombrePunto)) {
        return {
          ok: false, status: 500,
          error: 'ICONICS History request failed: point is not being collected.',
        }
      } else {
        return { ok: false, status: 500, error: 'ICONICS History request failed: unknown point.' }
      }
    }

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

      const pagina = paginaDe(mediaDe, startMs, endMs, pasoMs, offset, rnd)
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
   * Enumerar el árbol devuelve los HIJOS DIRECTOS de la rama pedida, con la
   * forma del servidor real: nodos `{ pointName, shortName }`, carpetas
   * terminadas en su separador. Plan 36 F1.
   *
   * ── POR QUÉ CAMBIÓ DE FORMA (21-09-2026) ──────────────────────────
   *
   * Hasta este plan devolvía TODOS los puntos de la máquina como cadenas
   * sueltas, sin niveles. Bastaba para «¿de qué rama es este punto?», pero
   * no para nada que RECORRA el árbol: el descubridor (`descubrirDesdeArbol`)
   * y la pantalla de configuración expanden carpeta a carpeta, leen
   * `shortName` y distinguen hoja de rama por la forma del nombre. Contra
   * el fake antiguo los dos veían un árbol vacío —cero variables, sin
   * error— que es el modo de fallo que este proyecto más detesta.
   *
   * El árbol se DERIVA de lo que el registro declara: los puntos en vivo
   * (`puntos()`), los nombres históricos de sus series (`series.punto`) y las
   * raíces. Nada se escribe a mano aquí: una máquina nueva en `sistemas.js`
   * aparece en el árbol por existir.
   *
   *   ac:   carpeta `…/S1/`   hoja `…/S1/vRMS_S1`
   *   hda:  carpeta `…\S1`   tag  `…\S1:vRMS_S1`   (sin contrabarra final)
   *   ae:   área `ae:/DEMO VIBRACIONES` → hijos con `shortName` `=Contador`
   *
   * Pedir una HOJA devuelve `ok` con lista vacía, como el servidor. Pedir
   * una rama que no existe devuelve `ok: false`, para que quien recorre lo
   * cuente como fallo y no como «rama vacía» —la distinción que `recorrer`
   * hace a propósito—.
   *
   * Sigue siendo cierto que las máquinas no se mezclan: la raíz `ac:`
   * enumera las carpetas de primer nivel de todas, pero cada rama sólo
   * devuelve lo que cuelga de ella.
   */
  const ARBOL = construirArbolFalso([...SISTEMAS, CATALOGO_VIBRACIONES])

  async function browse(path) {
    const p = path ?? ''
    if (ARBOL.hijos.has(p)) {
      return { ok: true, status: 200, payload: ARBOL.hijos.get(p) }
    }
    if (ARBOL.hojas.has(p)) return { ok: true, status: 200, payload: [] }
    return {
      ok: false,
      status: 404,
      error: `No existe la rama «${p}» en el transporte falso: ninguna máquina del registro la declara.`,
    }
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

  /** La misma telemetría que el cliente real. Ver `readPoints`, aquí arriba. */
  let ultimaLectura = null

  function apuntarLectura(pointNames, byPointName) {
    let conValor = 0
    let conCalidadBuena = 0

    for (const punto of pointNames) {
      const dato = byPointName[punto]?.payload
      if (!dato) continue
      if (dato.value !== undefined && dato.value !== null) conValor++
      if (isGoodQuality(dato.quality)) conCalidadBuena++
    }

    ultimaLectura = {
      instante: new Date().toISOString(),
      puntosPedidos: pointNames.length,
      conValor,
      conCalidadBuena,
    }
  }

  function estadoLecturas() {
    return { ultima: ultimaLectura, ultimoFallo: null }
  }

  return {
    acknowledgeAlarms, browse, estadoLecturas, ping, readAlarmHistory, readHistory,
    readPoint, readPoints, readUserInfo, search, writePoint, writePoints,
  }
}
