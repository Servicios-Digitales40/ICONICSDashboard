/**
 * El diagnóstico — Plan 16 Fase 3. Junta las tres fuentes y puntúa.
 *
 * Fuente #1 (datos en vivo) ya la calculó `evaluarRiesgos`/
 * `evaluarRiesgosVibracion` antes de llegar aquí: este módulo no vuelve a
 * leer sensores, recibe el `riesgoId` de un riesgo YA activo. Fuente #2
 * (manuales) es `indiceDocumentos.buscar()`. Fuente #3 (casos) es
 * `indiceCasos.buscarCasosSimilares()`. Las candidatas en sí —qué causas
 * puede tener cada riesgo— son la semilla transcrita de `causas.js`.
 *
 * ── EL CÓDIGO PUNTÚA, EL MODELO SÓLO NARRA ──────────────────────────
 *
 * `diagnosticar()` es aritmética determinista: mismas tres fuentes, mismo
 * resultado, reproducible a las 3 de la mañana y a mediodía. Es la misma
 * frontera que ya defiende `riesgos.js` entre evidencia e hipótesis — un
 * modelo de lenguaje no decide si algo puede reventar, y tampoco decide qué
 * causa es más probable. La Fase 4 le pasa esta lista YA ordenada y con
 * instrucción de no reordenarla.
 *
 * ── "DATOS 0…3": DE DÓNDE SALE EL NÚMERO ────────────────────────────
 *
 * Todas las causas de un mismo riesgo comparten la MISMA evidencia de
 * sensores —es la verdad física, no un defecto de la derivación; ver
 * "Lo que la semilla no puede dar" en el plan— así que el término `datos`
 * no distingue entre causas de un mismo riesgo, sólo entre riesgos: un
 * riesgo respaldado por tres señales corroborantes (`necesita.length`) pesa
 * más que uno que dispara con una sola. El suelo en 1 —nunca 0— es porque el
 * riesgo, por definición, YA está activo cuando se pide su diagnóstico: hay
 * SIEMPRE al menos un dato confirmándolo, aunque la regla no declare su
 * `necesita` estáticamente (`asimetria-entre-apoyos` compara canales
 * dinámicos y declara `necesita: []`, pero no por eso tiene menos evidencia
 * detrás).
 *
 * ── "MANUAL 0…2" Y "CASOS 0…2 / −1": LOS UMBRALES SON UNA DECISIÓN ──
 *
 * `buscar()` y `buscarCasosSimilares()` devuelven, además del `score`
 * mezclado que ordena (0,6 coseno / 0,4 BM25, o BM25 solo), la magnitud
 * ABSOLUTA por separado —`coseno` o `scoreCrudo`, según haya embeddings—.
 * Convertirla en 0/1/2 exige un corte, y no hay un corte "correcto": aquí
 * se usa el mismo criterio en las dos fuentes —`UMBRAL_COSENO_*`/
 * `UMBRAL_BM25_*`, ver `puntosDeScore` más abajo— para que "manual" y
 * "casos" hablen el mismo idioma. Si en producción resulta que el corte es
 * demasiado fino o demasiado grueso, se ajusta aquí, en un solo sitio: no
 * hace falta tocar `documentos.mjs` ni `casos.mjs`.
 */
import { causasDe } from '../../shared/eva/causas.js'
import { REGLAS as REGLAS_TANQUE } from '../../shared/eva/riesgos.js'
import { REGLAS as REGLAS_VIBRACION } from '../../shared/eva/riesgosVibracion.js'
import { logger } from '../logger.mjs'

const REGLAS_POR_SISTEMA = {
  tanque: REGLAS_TANQUE,
  vibraciones: REGLAS_VIBRACION,
}

/**
 * ── EL CORTE ES SOBRE MAGNITUD ABSOLUTA, NO SOBRE EL RANKING (PLAN 17 §G2) ──
 *
 * `indiceDocumentos.buscar()`/`indiceCasos.buscarCasosSimilares()` devuelven
 * un `score` normalizado a 0-1 CONTRA EL MEJOR DE ESA CONSULTA —es lo que
 * hace falta para el RANKING, mezclando BM25 y coseno—, pero usarlo también
 * para decidir PUNTOS era el defecto medido en la auditoría del 01-09-2026:
 * dividir por el máximo garantiza que el mejor resultado de CUALQUIER
 * consulta saque 1,00, aunque el encaje sea flojo. Tres causas de tanque
 * probadas sacaron `manual: 2` siempre, incluso con el índice de casos
 * vacío — un término que vale lo mismo para todos no desempata nada.
 *
 * El corte pasa a hacerse sobre una magnitud ABSOLUTA, distinta según haya
 * embeddings o no:
 *
 *  - Con embeddings: el `coseno` suelto (Plan 17 Fase 3b) — es
 *    verdaderamente absoluto, no depende de cuántos documentos haya
 *    indexados. `UMBRAL_COSENO_*` son los mismos 0,55/0,20 de siempre:
 *    documentados como razonables por el proyecto, y siguen `PROVISIONAL:
 *    true` hasta que se midan contra un servidor de embeddings real —F3b,
 *    no hecha todavía—.
 *  - Sin embeddings: el `scoreCrudo` de BM25 (Plan 17 Fase 3a).
 *    `UMBRAL_BM25_*` son **PROVISIONAL, con una reserva más fuerte que la
 *    de arriba**: no hay un solo PDF real en esta copia de trabajo contra
 *    el que calibrar (`Documentos/` sólo tiene `Reportes/`), así que se
 *    derivaron de un corpus SINTÉTICO —cuatro párrafos de manual escritos a
 *    mano sobre causas reales de `causas.js`, más ruido hasta ~45
 *    fragmentos para aproximar la escala que midió la auditoría—. Y hay un
 *    motivo por el que esto importa más de lo que parece: el score CRUDO de
 *    BM25 **no es invariante al tamaño del corpus** —su término `idf` crece
 *    con el número de documentos para un término raro—, así que un umbral
 *    fijo aquí se descalibra según crezca `Documentacion/`, algo que NO le
 *    pasa al corte por coseno. `F7a` (recalibrar contra la distribución
 *    real) no es opcional para este par de umbrales: es la única forma de
 *    que dejen de ser una suposición razonada y pasen a ser una medida.
 */
const UMBRAL_COSENO_FUERTE = 0.55
const UMBRAL_COSENO_DEBIL = 0.2
const UMBRAL_BM25_FUERTE = 8
const UMBRAL_BM25_DEBIL = 2

/**
 * @param {{coseno?: number, scoreCrudo?: number}} [resultado] de `buscar()`/
 *   `buscarCasosSimilares()` — `undefined` cuenta como "sin respaldo".
 */
function puntosDeScore(resultado) {
  if (!resultado) return 0
  if (resultado.coseno !== undefined) {
    if (resultado.coseno >= UMBRAL_COSENO_FUERTE) return 2
    if (resultado.coseno >= UMBRAL_COSENO_DEBIL) return 1
    return 0
  }
  const crudo = resultado.scoreCrudo ?? 0
  if (crudo >= UMBRAL_BM25_FUERTE) return 2
  if (crudo >= UMBRAL_BM25_DEBIL) return 1
  return 0
}

/** "Fuerte" para lo que en `respaldoDeCasos` decide si un caso encontrado
 *  por texto entra siquiera a competir — mismo corte que el de 2 puntos,
 *  para que "manual" y "casos" seleccionen con el mismo criterio. */
function esFuerte(resultado) {
  return puntosDeScore(resultado) >= 2
}

function reglaDe(sistema, riesgoId) {
  const reglas = REGLAS_POR_SISTEMA[sistema]
  if (!reglas) throw new TypeError(`diagnosticar necesita un "sistema" conocido; llegó "${sistema}".`)
  return reglas.find(r => r.id === riesgoId) ?? null
}

/**
 * `Math.max(…, 1)`: ver la cabecera del archivo — un riesgo activo siempre
 * tiene al menos un dato detrás, aunque `necesita` esté vacío.
 */
function datosDe(regla) {
  return Math.min(Math.max(regla.necesita?.length ?? 0, 1), 3)
}

/**
 * Cuánto respalda el manual a UNA causa: se busca con su título y sus
 * términos —no con el síntoma del riesgo entero, que traería fragmentos
 * genéricos del riesgo y no de la causa concreta—.
 *
 * `sistema` se propaga a `buscar()` (Plan 17 Fase 3a, G7): sin él, un
 * manual de vibraciones podía respaldar una causa del tanque, la misma
 * asimetría que `casos.mjs` ya no tiene desde el Plan 16.
 */
async function respaldoDelManual(indiceDocumentos, sistema, causa) {
  if (!indiceDocumentos) return { puntos: 0, fragmentos: [] }
  const consulta = [causa.titulo, ...(causa.terminosManual ?? [])].join(' ')
  try {
    const fragmentos = await indiceDocumentos.buscar(consulta, { top: 2, sistema })
    // El objeto entero, no sólo `.score`: `puntosDeScore` decide sobre
    // `coseno`/`scoreCrudo` (absolutos), no sobre el `score` normalizado
    // que sólo sirve para ordenar — ver la cabecera de este archivo.
    return { puntos: puntosDeScore(fragmentos[0]), fragmentos }
  } catch (error) {
    logger.warn('Búsqueda en manuales falló durante un diagnóstico; se cuenta como sin respaldo', {
      causa: causa.id,
      error: error.message,
    })
    return { puntos: 0, fragmentos: [] }
  }
}

/**
 * Cuánto respaldan los casos previos a UNA causa. `buscarCasosSimilares` ya
 * filtra por sistema Y por riesgo —no hay filtro que repetir aquí—.
 *
 * ── EMPAREJAMIENTO EXACTO PRIMERO, PLAN 17 FASE 2 (G3) ──────────────
 *
 * Antes de nada, se mira si el caso trae el id estructurado de la Fase 5 del
 * Plan 16: `causaReal.tipo === causa.id` CONFIRMA esta causa tal cual —no
 * "se parece", ES esta causa, porque un técnico lo escribió—; `diagnostico.
 * propuesta === causa.id` con `diagnosticoCorrecto === false` la REFUTA —el
 * sistema propuso esta causa y un técnico dijo, con el campo estructurado
 * que existe para decirlo, que no era—. Ninguna de las dos depende del
 * score de texto: un id no compite por parecido.
 *
 * Sólo lo que NO trae esos campos —todo lo registrado por voz o chat, y el
 * histórico de antes de la Fase 5— cae a la proxy de texto de siempre: "el
 * texto de recuperación se parece lo bastante al título de la causa". Es la
 * proxy que `diagnostico.mjs` llevaba meses llamando "la mejor disponible
 * hoy" en su cabecera — deja de serlo en cuanto hay un id que mirar en su
 * lugar, y se queda como red de seguridad para cuando no lo hay.
 *
 * Medido en la auditoría del 01-09-2026: `consigna-variador-alta` fue
 * refutada DOS VECES (dos cierres con `diagnostico.propuesta` igual a esa
 * causa y `diagnosticoCorrecto:false`) y seguía saliendo en banda ALTO,
 * porque `resuelto` —"se arregló"— no es `diagnosticoCorrecto` —"acertamos"—
 * y el emparejamiento por texto no siempre encontraba el caso que la
 * refutaba. Con el emparejamiento exacto, una causa refutada resta, no sólo
 * dice "no confirmada".
 *
 * ── DOS NIVELES DE PESO EN LA PROXY DE TEXTO, PLAN 17 FASE 1 (G1) ───
 *
 * Para lo que SÍ cae a texto —sin campos estructurados—, sigue el filtro de
 * la Fase 1: `disparador.riesgoId === riesgoId` pesa completo (tope 2); sin
 * `disparador` pesa reducido (tope 1, nunca 2). Los dos topes —el exacto y
 * el de texto— se combinan sin superar el tope global de 2: "casos 0…2"
 * sigue siendo la promesa del módulo. La resta —fallidos por `resuelto` o
 * refutados por `diagnosticoCorrecto`— no tiene tope en ningún caso: cada
 * señal negativa, de la fuente que sea, cuenta entera.
 */
async function respaldoDeCasos(indiceCasos, sistema, riesgoId, causa) {
  if (!indiceCasos) return { puntos: 0, casos: [] }
  const consulta = [causa.titulo, ...(causa.terminosManual ?? [])].join(' ')
  try {
    const encontrados = await indiceCasos.buscarCasosSimilares({ sistema, riesgoId, texto: consulta, top: 5 })

    const confirmados = encontrados.filter(c => c.causaReal?.tipo === causa.id)
    const refutados = encontrados.filter(
      c => c.diagnostico?.propuesta === causa.id && c.diagnosticoCorrecto === false
    )
    const idsExactos = new Set([...confirmados, ...refutados].map(c => c.id))

    // La proxy de texto, sólo para lo que no tiene emparejamiento exacto.
    const porTexto = encontrados.filter(c => !idsExactos.has(c.id) && esFuerte(c))
    const confirmaElRiesgo = c => c.disparador?.riesgoId === riesgoId
    const fuertesTexto = porTexto.filter(confirmaElRiesgo)
    const debilesTexto = porTexto.filter(c => !confirmaElRiesgo(c))

    const funcionaronFuertes =
      confirmados.filter(c => c.resuelto !== false).length +
      fuertesTexto.filter(c => c.resuelto !== false).length
    const funcionaronDebiles = debilesTexto.filter(c => c.resuelto !== false).length

    const positivos = Math.min(
      Math.min(funcionaronFuertes, 2) + Math.min(funcionaronDebiles, 1),
      2
    )

    // Dos motivos de resta, independientes y ambos sin tope: un intento que
    // no funcionó (`resuelto:false`, de cualquier nivel) y una causa
    // refutada por id (`diagnosticoCorrecto:false` sobre ESTA causa
    // propuesta) — un mismo caso puede aportar los dos si además falló.
    const fallaronPorResuelto =
      confirmados.filter(c => c.resuelto === false).length +
      porTexto.filter(c => c.resuelto === false).length
    const puntos = positivos - fallaronPorResuelto - refutados.length

    return { puntos, casos: [...confirmados, ...refutados, ...porTexto] }
  } catch (error) {
    logger.warn('Búsqueda en casos falló durante un diagnóstico; se cuenta como sin respaldo', {
      causa: causa.id,
      error: error.message,
    })
    return { puntos: 0, casos: [] }
  }
}

/**
 * ── SIN RECALIBRAR TODAVÍA — PLAN 17 FASE 7a, BLOQUEADA POR FALTA DE DATOS ──
 *
 * Los cortes `>=5`/`>=3` son los de siempre, de antes de este plan. La Fase
 * 3a (G2/G7/G8) cambió cómo se calculan `manual` y `casos` — ya no
 * "casi siempre 2" ni cruzados entre riesgos —, y el plan pedía recalibrar
 * estos cortes "contra la salida real del motor sobre los manuales y los
 * casos que haya en disco ese día". No hay disco que mirar: esta copia de
 * trabajo no tiene ni un PDF real (`Documentos/` sólo tiene `Reportes/`) ni
 * un `datos/aprendizaje.json` (gitignored, no existe). Cambiar estos números
 * sin esa medición sería sustituir una suposición por otra, no calibrar —
 * exactamente el defecto que este plan vino a corregir, con otros dígitos.
 * `scripts/verificar-calibracion.mjs` deja escrita y probada la herramienta
 * que hace la medición en cuanto haya `Documentacion/` real; lo que falta es
 * el disco, no el código.
 */
function bandaDe(total, fuentesActivas) {
  if (total >= 5 && fuentesActivas >= 2) return 'alto'
  if (total >= 3) return 'medio'
  return 'bajo'
}

/**
 * @param {object} deps
 * @param {{buscar: Function}} [deps.indiceDocumentos] de `documentos.mjs`
 * @param {{buscarCasosSimilares: Function}} [deps.indiceCasos] de `casos.mjs`
 */
export function createMotorDiagnostico({ indiceDocumentos, indiceCasos } = {}) {
  /**
   * @param {{sistema: string, riesgoId: string}} entrada
   * @returns {Promise<{
   *   sistema: string, riesgoId: string,
   *   diagnosticEventId: string,  // uno por CADA llamada, ver la cabecera del archivo
   *   huerfano: boolean,          // true si el riesgo no tiene causas transcritas
   *   causas: object[],           // ordenadas, la más respaldada primero
   * }>}
   */
  async function diagnosticar({ sistema, riesgoId }) {
    if (!riesgoId) throw new TypeError('diagnosticar necesita "riesgoId".')
    const regla = reglaDe(sistema, riesgoId)
    if (!regla) {
      throw new TypeError(`"${riesgoId}" no es un riesgo de "${sistema}" — no hay nada que diagnosticar.`)
    }

    /*
     * Plan 17 Fase 5 (G10): identifica ESTE momento de pedir el diagnóstico,
     * no el contenido — no rompe el determinismo del que habla la cabecera
     * de este archivo. Dos llamadas idénticas siguen dando exactamente las
     * mismas `causas`; sólo el id de evento cambia entre una y otra, porque
     * es lo único que ES distinto: un momento distinto. Mismo generador que
     * `crearIntervencion` (`shared/eva/aprendizaje.js`) por la misma razón:
     * dos eventos en el mismo milisegundo no pueden compartir id.
     */
    const diagnosticEventId = `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    const candidatas = causasDe(riesgoId)
    if (!candidatas) {
      // Ningún riesgo activo se queda callado: si no hay causas transcritas
      // todavía, el diagnóstico lo DICE, no devuelve una lista vacía sin más
      // explicación que un caller distraído confunda con "sin sospechosos".
      return { sistema, riesgoId, diagnosticEventId, huerfano: true, causas: [] }
    }

    const datos = datosDe(regla)

    const causas = await Promise.all(candidatas.map(async causa => {
      const [manual, casos] = await Promise.all([
        respaldoDelManual(indiceDocumentos, sistema, causa),
        respaldoDeCasos(indiceCasos, sistema, riesgoId, causa),
      ])
      const total = datos + manual.puntos + casos.puntos
      const fuentesActivas = [datos > 0, manual.puntos > 0, casos.puntos > 0].filter(Boolean).length

      return {
        id: causa.id,
        titulo: causa.titulo,
        componente: causa.componente,
        origen: causa.origen,
        provisional: causa.provisional,
        respaldo: { datos, manual: manual.puntos, casos: casos.puntos, total },
        banda: bandaDe(total, fuentesActivas),
        // `texto`/`hash` y `resumen` — Plan 17 Fase 5 (G10): antes sólo
        // viajaba la referencia (qué documento, qué página; qué id, qué
        // fecha). Nadie podía verificar una cita sin salir del sistema —y,
        // como midió la auditoría del 01-09-2026 (§9.2/H1), cuando alguien
        // por fin va a mirar, a veces el respaldo resulta ser de otro
        // riesgo—. `hash` es el del CONTENIDO del fragmento, no del PDF
        // entero: distingue el trozo exacto cuando una página se parte en
        // varios, y avisa si el PDF cambió desde que se citó.
        manualCitado: manual.fragmentos.map(({ archivo, pagina, texto, hash }) => ({ archivo, pagina, texto, hash })),
        casosCitados: casos.casos.map(({ id, fecha, resuelto, sintoma, causa }) => ({
          id, fecha, resuelto, resumen: causa ?? sintoma,
        })),
      }
    }))

    // Empate estable a propósito: `Array.prototype.sort` de Node es estable,
    // así que dos causas con el mismo total quedan en el orden de `causas.js`
    // —determinismo real, no "probablemente el mismo orden la mayoría de las
    // veces"—.
    causas.sort((a, b) => b.respaldo.total - a.respaldo.total)

    return { sistema, riesgoId, diagnosticEventId, huerfano: false, causas }
  }

  return { diagnosticar }
}
