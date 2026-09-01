/**
 * Índice de casos previos — Fuente #3 del diagnóstico (Plan 16 Fase 2), junto
 * a los datos en vivo (Fuente #1, `evaluarRiesgos`) y los manuales (Fuente
 * #2, `documentos.mjs`).
 *
 * ── DE DÓNDE SALEN LOS CASOS ─────────────────────────────────────────
 *
 * De `datos/aprendizaje.json`, el mismo archivo que ya llena
 * `registrar_intervencion` por voz y por chat (Plan 16 Fase 0 del backlog de
 * Gustavo4, antes de este plan). Este módulo no añade ninguna forma nueva de
 * registrar un caso: sólo hace que los que ya existen se puedan encontrar
 * por PARECIDO, no sólo por fecha —que es todo lo que ofrecía
 * `hechos_de_la_planta` hasta ahora—.
 *
 * ── POR QUÉ ES INCREMENTAL "GRATIS", A DIFERENCIA DE `documentos.mjs` ──
 *
 * Una intervención, una vez guardada, no se edita — «lo que pasó, pasó» (ver
 * la cabecera de `intervenciones` en `shared/eva/aprendizaje.js`). Eso quita
 * de encima la mitad del problema que resolvió la Fase 0 para los manuales:
 * allí un ARCHIVO puede cambiar de contenido sin cambiar de nombre, y hacía
 * falta una huella (tamaño + fecha) para saberlo. Aquí basta con el `id`: si
 * ya está en `casosProcesados`, es EXACTAMENTE el mismo texto de siempre, sin
 * excepción posible. Sólo hace falta detectar intervenciones NUEVAS —ids que
 * no estaban la última vez— y embeber sólo ésas.
 *
 * ── EL AISLAMIENTO ENTRE SISTEMAS NO ES OPCIONAL ────────────────────
 *
 * `buscarCasosSimilares` filtra por `sistema` ANTES de puntuar, no después.
 * Es la misma regla que protege `sistemas.js` en todo el proyecto: un caso
 * del tanque no puede aparecer en un diagnóstico de vibraciones aunque el
 * embedding los encuentre parecidos —«vibración alta» y «presión alta» se
 * parecen en un espacio vectorial y no tienen nada que ver en la planta—.
 * Filtrar ANTES del ranking, no ordenarlo entero y cortar después, es lo que
 * garantiza que un caso de otro sistema ni se calcula: no hay puntuación que
 * pueda colarlo por error.
 */
import { join } from 'node:path'
import { logger } from '../logger.mjs'
import { textoDeRecuperacion } from '../../shared/eva/casos.js'
import { leerAprendizaje } from './herramientas/aprendizaje/index.mjs'
import { indexarTerminos, puntuarBm25 } from './bm25.mjs'
import {
  coseno,
  crearMotorEmbeddings,
  guardarCacheEmbeddings,
  hashDeTexto,
  leerCacheEmbeddings,
} from './embeddings.mjs'

/**
 * Cada cuánto se mira si hay intervenciones nuevas en el almacén, en
 * milisegundos. Mismo criterio que `MS_ENTRE_COMPROBACIONES` de
 * `documentos.mjs`: quien acaba de contar una reparación por voz no debería
 * tener que esperar mucho a que la búsqueda la encuentre, pero mirar el
 * archivo en cada pregunta sería trabajo de sobra sobre un JSON de unos
 * kilobytes que casi nunca cambia entre dos preguntas seguidas.
 */
const MS_ENTRE_COMPROBACIONES = 10000

/**
 * Caché de embeddings de los casos, aparte de la de `documentos.mjs`
 * (`datos/embeddings-cache.json`). Comparten el motor de `embeddings.mjs`,
 * no el archivo: mezclar vectores de fragmentos de manual con vectores de
 * intervenciones en un solo JSON no aportaría nada, y complicaría inspeccionar
 * cada caché por separado el día que alguien necesite hacerlo a mano.
 */
const RUTA_CACHE_CASOS = join('datos', 'embeddings-cache-casos.json')

/**
 * @param {object} opciones
 * @param {string} [opciones.embeddingBase]   servidor de embeddings; vacío = índice inerte
 * @param {string} [opciones.embeddingModelo]
 * @param {string} [opciones.rutaCache]       por defecto `datos/embeddings-cache-casos.json`
 * @param {string} [opciones.rutaAprendizaje] por defecto la misma que usan las
 *   herramientas de aprendizaje; las pruebas la sustituyen por un archivo temporal
 */
export function createIndiceCasos({
  embeddingBase = '',
  embeddingModelo = 'local',
  rutaCache = RUTA_CACHE_CASOS,
  rutaAprendizaje,
} = {}) {
  /** Lo ya procesado, por id de intervención: `id → { intervencion, texto,
   *  hash, vector? }`. Una intervención nunca cambia de contenido una vez
   *  creada, así que estar en este mapa YA significa "sigue siendo válido
   *  tal cual" — no hace falta comparar nada más. */
  let casosProcesados = new Map()

  let cargando = null
  let cargado = false
  let ultimaComprobacion = 0

  const usaEmbeddings = Boolean(embeddingBase)
  const motor = crearMotorEmbeddings({ embeddingBase, embeddingModelo })

  let cacheEmbeddings = { modelo: null, vectores: {} }
  let cacheEmbeddingsCargada = false

  /** Cuántas intervenciones había la última vez que se miró — el atajo
   *  barato para "¿hay algo nuevo?" antes de reprocesar nada. No basta por sí
   *  solo como huella perfecta —sólo se APILAN intervenciones, nunca se
   *  borran, así que un cambio de longitud SIEMPRE significa "hay una o más
   *  nuevas"— pero es exactamente lo que hace falta para ese caso, con un
   *  coste de comparación de un número. */
  let ultimoRecuento = -1

  async function leerIntervenciones() {
    const almacen = await leerAprendizaje(rutaAprendizaje)
    return almacen.intervenciones ?? []
  }

  async function recargar() {
    if (cargando) return cargando

    cargando = (async () => {
      if (usaEmbeddings && !cacheEmbeddingsCargada) {
        cacheEmbeddings = await leerCacheEmbeddings(rutaCache)
        // Vectores de OTRO modelo no sirven — mismo criterio que
        // `documentos.mjs`: cambiar de modelo de embeddings invalida la
        // caché entera en vez de mezclar dos espacios semánticos.
        if (cacheEmbeddings.modelo !== embeddingModelo) {
          cacheEmbeddings = { modelo: embeddingModelo, vectores: {} }
        }
        cacheEmbeddingsCargada = true
      }

      const intervenciones = await leerIntervenciones()
      ultimoRecuento = intervenciones.length

      const nuevoMapa = new Map()
      const pendientesEmbeber = []

      for (const intervencion of intervenciones) {
        const previo = casosProcesados.get(intervencion.id)
        if (previo) {
          nuevoMapa.set(intervencion.id, previo)
          continue
        }

        const texto = textoDeRecuperacion(intervencion)
        const caso = {
          intervencion,
          texto,
          hash: hashDeTexto(texto),
          ...indexarTerminos(texto),
        }
        nuevoMapa.set(intervencion.id, caso)
        if (usaEmbeddings) pendientesEmbeber.push(caso)
      }

      casosProcesados = nuevoMapa

      if (usaEmbeddings && pendientesEmbeber.length) {
        await motor.asegurarVectores(pendientesEmbeber, cacheEmbeddings)
        await guardarCacheEmbeddings(rutaCache, cacheEmbeddings).catch(error => {
          logger.warn('No se pudo guardar la caché de embeddings de casos en disco', {
            error: error.message,
          })
        })
      }

      cargado = true

      logger.info(
        `Índice de casos actualizado: ${casosProcesados.size} intervención(es) ` +
          `(${pendientesEmbeber.length} nueva(s)) (${usaEmbeddings ? 'embeddings + BM25' : 'sólo BM25'})`,
        {
          total: casosProcesados.size,
          nuevas: pendientesEmbeber.length,
          modo: usaEmbeddings ? 'embeddings + BM25' : 'BM25',
        }
      )
    })().finally(() => {
      cargando = null
    })

    return cargando
  }

  /**
   * Se asegura de que el índice refleja lo que hay AHORA en el almacén. Igual
   * que `asegurarAlDia` en `documentos.mjs`: comprobar el recuento es barato
   * —un `readFile` de un JSON de unos kilobytes—, así que se limita a cada
   * `MS_ENTRE_COMPROBACIONES` y no a cada pregunta.
   */
  async function asegurarAlDia() {
    if (!cargado) return recargar()

    const ahora = Date.now()
    if (ahora - ultimaComprobacion < MS_ENTRE_COMPROBACIONES) return
    ultimaComprobacion = ahora

    const intervenciones = await leerIntervenciones()
    if (intervenciones.length === ultimoRecuento) return

    return recargar()
  }

  /**
   * Los casos más parecidos a `texto`, del sistema indicado — nunca de otro.
   *
   * `sistema` es OBLIGATORIO a propósito: no tiene un valor por defecto que
   * signifique "cualquier sistema", porque ese valor por defecto es
   * precisamente el error que este módulo existe para impedir. Quien
   * pregunte por toda la planta debe pedirlo con `sistema: null` explícito
   * —que sí es válido, y encuentra los casos que tampoco pertenecen a un
   * sistema concreto—, nunca por omisión.
   *
   * Mismo híbrido que `documentos.mjs`: BM25 siempre —es lo que encuentra
   * «VF-02» o «K14» tal cual, que un embedding disuelve en un vector
   * parecido a cualquier otra referencia de componente— y, si hay servidor
   * de embeddings, se mezcla 60/40 a favor de lo semántico, que es lo que
   * encuentra «se quedaba pegada» cuando el caso antiguo dice «no cerraba
   * del todo».
   */
  async function buscarCasosSimilares({ sistema, texto, top = 3 } = {}) {
    if (sistema === undefined) {
      throw new TypeError('buscarCasosSimilares necesita "sistema" explícito (o null para toda la planta).')
    }

    await asegurarAlDia()
    if (!casosProcesados.size) return []

    // El filtro de sistema va ANTES de puntuar — ver la cabecera del
    // archivo. Un caso de otro sistema no entra ni siquiera a competir.
    const delSistema = [...casosProcesados.values()].filter(
      c => c.intervencion.sistema === sistema
    )
    if (!delSistema.length) return []

    const lexico = puntuarBm25(delSistema, texto)
    if (!lexico.length) return []

    // Normalizado a 0-1 contra el mejor de ESTA consulta: el score crudo de
    // BM25 no tiene techo fijo y no se puede comparar con el coseno.
    const maximo = Math.max(...lexico.map(c => c.score), 1e-9)
    let puntuados = lexico.map(c => ({ ...c, score: c.score / maximo }))

    if (usaEmbeddings) {
      const vectorConsulta = await motor.embeberUno(texto).catch(error => {
        logger.warn('Embedding de la consulta de casos falló; se busca sólo por texto', {
          error: error.message,
        })
        return null
      })

      if (vectorConsulta) {
        puntuados = puntuados.map(c => ({
          ...c,
          score: c.vector ? 0.6 * coseno(vectorConsulta, c.vector) + 0.4 * c.score : c.score,
        }))
      }
    }

    return puntuados
      .sort((a, b) => b.score - a.score)
      .slice(0, top)
      .filter(c => c.score > 0)
      .map(formatearResultado)
  }

  function formatearResultado(caso) {
    return { ...caso.intervencion, score: caso.score }
  }

  /** Qué hay indexado, para poder decírselo sin adivinar — mismo criterio que
   *  `estado()` en `documentos.mjs`. */
  function estado() {
    return {
      cargado,
      total: casosProcesados.size,
      modo: usaEmbeddings ? 'embeddings + BM25' : 'BM25',
      indexando: cargando !== null,
      progreso: cargando !== null ? motor.progresoActual() : null,
    }
  }

  return { buscarCasosSimilares, recargar, estado }
}
