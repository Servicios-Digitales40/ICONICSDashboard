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
 * la cabecera de `intervenciones` en `shared/eva/comun/aprendizaje.js`). Eso quita
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
 *
 * ── EL AISLAMIENTO POR RIESGO, PLAN 17 FASE 1 (G1) ──────────────────
 *
 * `sistema` protegía el cruce entre MÁQUINAS y dejaba abierto el cruce entre
 * RIESGOS de la misma máquina: la auditoría del 01-09-2026 midió un
 * diagnóstico de `derrame` citando dos casos de `sobrepresion` como
 * respaldo, porque los dos son del `tanque` y el texto se parecía lo
 * bastante. `disparador.riesgoId` se guarda desde la Fase 5 del Plan 16 y no
 * se consultaba.
 *
 * `riesgoId` es OPCIONAL —al revés que `sistema`— porque `registrar_
 * intervencion` (la puerta de voz/chat) nunca lo rellena: sólo lo trae un
 * cierre completo (`POST /api/casos`). Un caso sin `disparador` no es un
 * caso de OTRO riesgo, es un caso del que no se sabe. Filtrar tan duro como
 * `sistema` condenaría a todos los casos de voz a la invisibilidad — el
 * mismo fallo que la Fase 0 le cerró a `registrar_intervencion`, con otro
 * disfraz.
 *
 * Por eso el filtro aquí es de DOS niveles, no de uno:
 *   - `disparador.riesgoId` DISTINTO del pedido → EXCLUIDO, igual de duro
 *     que `sistema`. Es la parte que corrige la auditoría.
 *   - Sin `disparador` (o sin `riesgoId` dentro) → se queda. No se sabe de
 *     qué riesgo era, y "no se sabe" no es "es de otro".
 * El tercer nivel —pesar MENOS un caso sin `disparador`— no es cosa de este
 * módulo: `buscarCasosSimilares` sólo excluye y puntúa por parecido: quien
 * decide cuántos PUNTOS vale cada nivel es `diagnostico.mjs·respaldoDeCasos`,
 * que ya recibe el objeto completo de la intervención (con o sin
 * `disparador`) en cada resultado.
 */
import { join } from 'node:path'
import { logger } from '../../logger.mjs'
import { textoDeRecuperacion } from '../../../shared/eva/comun/casos.js'
import { intervencionesVigentes } from '../../../shared/eva/comun/aprendizaje.js'
import { leerAprendizaje } from '../herramientas/aprendizaje/index.mjs'
import { indexarTerminos, puntuarBm25 } from '../indices/bm25.mjs'
import {
  coseno,
  crearMotorEmbeddings,
  guardarCacheEmbeddings,
  hashDeTexto,
  leerCacheEmbeddings,
} from '../indices/embeddings.mjs'

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

  /**
   * Huella de QUÉ intervenciones había la última vez: el hash de sus ids en
   * orden.
   *
   * ── POR QUÉ NO BASTA EL RECUENTO, DESDE QUE SE PUEDE ARCHIVAR ─────
   *
   * Esto era `ultimoRecuento`, un número, y era correcto mientras la
   * bitácora sólo APILARA: sin bajas, un cambio de longitud significa
   * siempre «hay una o más nuevas». `PATCH /api/casos/:id` rompió esa
   * invariante de la peor forma posible: archivar **no cambia la longitud
   * en absoluto**, así que el recuento no veía nada y el índice seguía
   * sirviendo el caso archivado hasta el siguiente reinicio. En silencio:
   * la búsqueda contestaba igual, sólo que con lo que ya se había retirado.
   *
   * El hash detecta las cuatro cosas —alta, archivado, devolución y
   * sustitución— y no cuesta prácticamente nada: `asegurarAlDia` ya lee y
   * parsea el archivo entero para poder contarlo, así que el número nunca
   * ahorró esa E/S. Lo único que se añade es recorrer una lista que ya está
   * en memoria.
   */
  let huellaDeIds = null

  /**
   * Los ids, en orden, más si están archivados. El orden cuenta a propósito:
   * reordenar el archivo a mano también es un cambio que el índice debería
   * ver.
   *
   * El `#a` no es adorno: **archivar no cambia ni la longitud ni los ids**.
   * Una huella hecha sólo de ids sería tan ciega a un archivado como el
   * recuento lo era a un borrado, y por la misma razón. Es la trampa de este
   * módulo, y ha mordido una vez ya.
   */
  function huellaDe(intervenciones) {
    return hashDeTexto(intervenciones.map(i => (i.archivado ? `${i.id}#a` : i.id)).join('|'))
  }

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
      // La huella se calcula sobre TODAS —incluidas las archivadas—, porque
      // archivar es justo el cambio que hay que detectar. Lo que se indexa,
      // en cambio, son sólo las vigentes.
      huellaDeIds = huellaDe(intervenciones)
      const vigentes = intervencionesVigentes(intervenciones)

      const nuevoMapa = new Map()
      const pendientesEmbeber = []

      for (const intervencion of vigentes) {
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
   * que `asegurarAlDia` en `documentos.mjs`: comprobar la huella es barato
   * —un `readFile` de un JSON de unos kilobytes—, así que se limita a cada
   * `MS_ENTRE_COMPROBACIONES` y no a cada pregunta.
   */
  async function asegurarAlDia() {
    if (!cargado) return recargar()

    const ahora = Date.now()
    if (ahora - ultimaComprobacion < MS_ENTRE_COMPROBACIONES) return
    ultimaComprobacion = ahora

    const intervenciones = await leerIntervenciones()
    if (huellaDe(intervenciones) === huellaDeIds) return

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
   * `riesgoId` es OPCIONAL —ver la cabecera del archivo, Plan 17 Fase 1—:
   * sin él, el comportamiento es el de siempre (útil para "¿nos ha pasado
   * algo parecido?" sobre toda la planta). Con él, se excluye —ANTES de
   * puntuar, mismo criterio que `sistema`— cualquier caso cuyo
   * `disparador.riesgoId` sea de OTRO riesgo. Un caso sin `disparador` no se
   * excluye: no se sabe de qué riesgo era, y eso no es lo mismo que saber
   * que es de otro.
   *
   * Mismo híbrido que `documentos.mjs`: BM25 siempre —es lo que encuentra
   * «VF-02» o «K14» tal cual, que un embedding disuelve en un vector
   * parecido a cualquier otra referencia de componente— y, si hay servidor
   * de embeddings, se mezcla 60/40 a favor de lo semántico, que es lo que
   * encuentra «se quedaba pegada» cuando el caso antiguo dice «no cerraba
   * del todo».
   */
  async function buscarCasosSimilares({ sistema, riesgoId, texto, top = 3 } = {}) {
    if (sistema === undefined) {
      throw new TypeError('buscarCasosSimilares necesita "sistema" explícito (o null para toda la planta).')
    }

    await asegurarAlDia()
    if (!casosProcesados.size) return []

    // El filtro de sistema va ANTES de puntuar — ver la cabecera del
    // archivo. Un caso de otro sistema no entra ni siquiera a competir.
    let delSistema = [...casosProcesados.values()].filter(
      c => c.intervencion.sistema === sistema
    )

    // El filtro de riesgo, mismo criterio: ANTES de puntuar. Sólo EXCLUYE lo
    // que sabe que es de otro riesgo; lo que no lo dice, se queda.
    if (riesgoId !== undefined) {
      delSistema = delSistema.filter(c => {
        const riesgoDelCaso = c.intervencion.disparador?.riesgoId
        return riesgoDelCaso === undefined || riesgoDelCaso === riesgoId
      })
    }

    if (!delSistema.length) return []

    const lexico = puntuarBm25(delSistema, texto)
    if (!lexico.length) return []

    /*
     * Normalizado a 0-1 contra el mejor de ESTA consulta, para el RANKING.
     * `scoreCrudo` se conserva aparte (Plan 17 Fase 3, G2) — mismo motivo
     * que en `documentos.mjs`: dividir por el máximo garantiza un 1,00 al
     * mejor resultado de CUALQUIER consulta, y es lo que hacía que
     * `manual`/`casos` casi nunca bajaran de 2 puntos en `diagnostico.mjs`.
     */
    const maximo = Math.max(...lexico.map(c => c.score), 1e-9)
    let puntuados = lexico.map(c => ({ ...c, scoreCrudo: c.score, score: c.score / maximo }))

    if (usaEmbeddings) {
      const vectorConsulta = await motor.embeberUno(texto).catch(error => {
        logger.warn('Embedding de la consulta de casos falló; se busca sólo por texto', {
          error: error.message,
        })
        return null
      })

      if (vectorConsulta) {
        // `coseno` suelto, mismo criterio que `documentos.mjs`: es la
        // magnitud absoluta que corta `puntosDeScore`, el mezclado `score`
        // sigue siendo sólo para el orden.
        puntuados = puntuados.map(c => {
          if (!c.vector) return c
          const cosenoValor = coseno(vectorConsulta, c.vector)
          return { ...c, coseno: cosenoValor, score: 0.6 * cosenoValor + 0.4 * c.score }
        })
      }
    }

    return puntuados
      .sort((a, b) => b.score - a.score)
      .slice(0, top)
      .filter(c => c.score > 0)
      .map(formatearResultado)
  }

  function formatearResultado(caso) {
    return {
      ...caso.intervencion, score: caso.score, scoreCrudo: caso.scoreCrudo,
      ...(caso.coseno !== undefined ? { coseno: caso.coseno } : {}),
    }
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
