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
import { causasDe } from '../../../shared/eva/comun/causas.js'
import { REGLAS as REGLAS_TANQUE } from '../../../shared/eva/tanque/riesgos.js'
import { REGLAS as REGLAS_VIBRACION } from '../../../shared/eva/vibraciones/riesgosVibracion.js'
import { logger } from '../../logger.mjs'

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
 *    indexados.
 *  - Sin embeddings: el `scoreCrudo` de BM25 (Plan 17 Fase 3a). El score
 *    CRUDO de BM25 **no es invariante al tamaño del corpus** —su término
 *    `idf` crece con el número de documentos para un término raro—, así que
 *    este par se descalibra según crezca `Documentacion/`, algo que NO le
 *    pasa al corte por coseno.
 *
 * ── LOS CUATRO NÚMEROS ESTÁN MEDIDOS (02-09-2026) ───────────────────
 *
 * Antes eran una suposición razonada; ahora salen de correr
 * `scripts/medir-calibracion.mjs` contra el corpus real de
 * `Documentacion/`, la bitácora real y el servidor de embeddings real.
 * n = 25 causas de `causas.js`, las de los dos sistemas.
 *
 *   coseno del mejor fragmento : min 0,291 · p25 0,361 · mediana 0,408
 *                                p75 0,430 · max 0,568
 *   BM25 crudo                 : min 0,00 · p25 0,00 · mediana 2,81
 *                                p75 5,52 · max 8,86
 *
 * Los cortes VIEJOS de coseno (0,55/0,20) repartían **2:4% · 1:96% · 0:0%**
 * — es decir, `manual` valía 1 casi siempre. Exactamente el mismo defecto
 * que midió la auditoría (un término que no desempata), con el signo
 * cambiado: antes constante 2, ahora constante 1. Los nuevos reparten
 * **2:12% · 1:64% · 0:24%**.
 *
 * `UMBRAL_COSENO_DEBIL` en 0,36 es el p25 medido, y no es un percentil
 * elegido por bonito: en este corpus el cuartil bajo son precisamente las
 * causas de VIBRACIÓN casando contra un manual de bombas —no hay manual de
 * vibraciones—, o sea ruido. El corte las manda a 0, que es lo correcto.
 *
 * ── LO QUE SIGUE SIN ESTAR CERRADO, Y HAY QUE DECIRLO ───────────────
 *
 * Siguen marcados PROVISIONAL, y con ellos **C11 sigue abierta**. La regla
 * del Plan 17 §4·F3b es explícita: mientras el umbral esté provisional,
 * nadie puede decir que C11 está cerrada. Lo medido son 2 documentos
 * ÚNICOS (4 archivos, dos pares byte a byte idénticos) y 44 fragmentos.
 * Eso alcanza para ver la FORMA de la distribución y para corregir un corte
 * que estaba demostrablemente mal; no alcanza para llamarlo calibración de
 * producción. Cuando la planta cargue sus manuales de verdad hay que
 * repetir la medida — y el guion ya está escrito para eso.
 *
 * Un apunte del propio dato: en este corpus **BM25 discrimina mejor que el
 * coseno**, porque devuelve 0,00 limpio para las causas de vibración
 * mientras el coseno les da 0,29-0,44. Es lo que se espera de un corpus sin
 * el vocabulario del dominio, y es la razón por la que el modo degradado no
 * es sólo un plan B.
 */
const UMBRAL_COSENO_FUERTE = 0.46
const UMBRAL_COSENO_DEBIL = 0.36
const UMBRAL_BM25_FUERTE = 6
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
  if (!indiceCasos) return { puntos: 0, casos: [], confirmados: [], refutados: [] }
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

    // `confirmados`/`refutados` viajan aparte —no sólo dentro de `casos`—
    // para que quien arme `evidenciaAFavor`/`evidenciaEnContra` (Plan 17
    // Fase 4, G6) sepa cuáles son cuáles sin tener que re-derivarlo.
    return { puntos, casos: [...confirmados, ...refutados, ...porTexto], confirmados, refutados }
  } catch (error) {
    logger.warn('Búsqueda en casos falló durante un diagnóstico; se cuenta como sin respaldo', {
      causa: causa.id,
      error: error.message,
    })
    return { puntos: 0, casos: [], confirmados: [], refutados: [] }
  }
}

/**
 * Cuánto respalda la TENDENCIA reciente a UNA causa — Plan 17 Fase 6 (G5),
 * el cuarto término. Sin `evaluadorTemporal` montado, o sin `firmaTemporal`
 * declarada en la causa, sale en 0 sin más: es la fuente MENOS presente de
 * las cuatro —opcional en dos sentidos, servidor y declaración—, así que su
 * ausencia no puede ser un error, sólo silencio. Ver `backend/ia/
 * temporal.mjs` para la aritmética.
 */
async function respaldoTemporal(evaluadorTemporal, sistema, causa) {
  if (!evaluadorTemporal || !causa.firmaTemporal) {
    return { puntos: 0, evidenciaAFavor: [], evidenciaEnContra: [] }
  }
  try {
    return await evaluadorTemporal.evaluar(causa.firmaTemporal, sistema)
  } catch (error) {
    logger.warn('El evaluador temporal falló durante un diagnóstico; se cuenta como sin respaldo', {
      causa: causa.id, error: error.message,
    })
    return { puntos: 0, evidenciaAFavor: [], evidenciaEnContra: [] }
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
 *
 * La Fase 6 (G5) añadió un cuarto término —`temporal`, 0..2— y con él el
 * máximo teórico sube de 7 a 9. Sigue sin tocarse por el mismo motivo:
 * recalibrar contra el máximo nuevo sin datos reales sería la misma
 * suposición con un número distinto. Es la F7c del plan, y necesita
 * ICONICS real además de manuales/casos reales — nada de eso existe aquí.
 */
function bandaDe(total, fuentesActivas) {
  if (total >= 5 && fuentesActivas >= 2) return 'alto'
  if (total >= 3) return 'medio'
  return 'bajo'
}

/**
 * Orden fijo para desempatar cuando dos fuentes respaldan por igual a la
 * misma causa — no cambia CUÁL fuente "gana" el desempate según el día.
 *
 * `datos` NO entra aquí, a propósito: es la MISMA cifra para todas las
 * causas de un mismo riesgo —"misma evidencia física", ver la cabecera del
 * archivo—, así que nunca puede ser lo que distingue el respaldo de la
 * causa 1ª del de la 2ª. Contarla igual que a `manual`/`casos` para decidir
 * la fuente dominante enmascararía un desacuerdo real entre esas dos: con
 * `datos=3` compartido y `manual=2`/`casos=0` en la 1ª causa contra
 * `manual=0`/`casos=1` en la 2ª, `datos` "ganaría" en las dos —por ser el
 * número más alto de ambas— y el conflicto entre manual y casos, que es el
 * que sí importa, quedaría invisible.
 *
 * `temporal` (Plan 17 Fase 6) SÍ entra: a diferencia de `datos`, es propio
 * de cada causa —dos causas del mismo riesgo pueden tener firmas
 * temporales distintas, o una tenerla y la otra no—, así que puede
 * legítimamente ser la fuente que distingue una causa de otra.
 */
const ORDEN_FUENTES_CONFLICTO = ['manual', 'casos', 'temporal']

/** La fuente —de las que SÍ varían por causa— que MÁS respalda a una causa,
 *  o `null` si ninguna aporta nada —"nadie respalda esto" no es una fuente
 *  con la que otra pueda entrar en conflicto—. */
function fuenteDominante(respaldo) {
  let mejor = null
  for (const fuente of ORDEN_FUENTES_CONFLICTO) {
    if (respaldo[fuente] > 0 && (mejor === null || respaldo[fuente] > respaldo[mejor])) mejor = fuente
  }
  return mejor
}

/**
 * ── EL CONFLICTO SE ENSEÑA, NO SE RESUELVE (PLAN 17 §DECISIÓN 5, G9) ──
 *
 * Hasta este plan, sensores → A / manual → B / historial → C se sumaban en
 * un número: un desacuerdo entre fuentes era matemáticamente indistinguible
 * de un acuerdo. `respaldo` ya viene desglosado por fuente desde que existe
 * este módulo (Plan 16 Fase 3); lo único que faltaba era MIRAR si la fuente
 * que más pesa en la 1ª causa es la misma que en la 2ª. El sistema no
 * seguirá eligiendo un ganador aquí tampoco: sólo lo dice, para que el
 * modelo lo narre y la UI lo muestre, en vez de fingir que todo apunta al
 * mismo sitio.
 */
function hayConflicto(causas) {
  if (causas.length < 2) return false
  const primera = fuenteDominante(causas[0].respaldo)
  const segunda = fuenteDominante(causas[1].respaldo)
  return primera !== null && segunda !== null && primera !== segunda
}

/**
 * @param {object} deps
 * @param {{buscar: Function}} [deps.indiceDocumentos] de `documentos.mjs`
 * @param {{buscarCasosSimilares: Function}} [deps.indiceCasos] de `casos.mjs`
 * @param {{evaluar: Function}} [deps.evaluadorTemporal] de `temporal.mjs`
 *   (Plan 17 Fase 6) — opcional, igual que los otros dos: sin él, `temporal`
 *   sale en 0 para toda causa, aunque declare `firmaTemporal`.
 */
export function createMotorDiagnostico({ indiceDocumentos, indiceCasos, evaluadorTemporal } = {}) {
  /**
   * @param {{sistema: string, riesgoId: string, valoresSensores?: object}} entrada
   *   `valoresSensores` es OPCIONAL (Plan 17 Fase 4, G6): el objeto `v` que
   *   `regla.cuando(v, ctx)`/`regla.evidencia(v)` esperan, con las lecturas
   *   YA leídas por quien llama. Este motor no lee sensores por su cuenta —
   *   ver la cabecera del archivo, "recibe el riesgoId de un riesgo YA
   *   activo"—, así que sin este dato no hay frase de `datos` que citar en
   *   `evidenciaAFavor`, y esa fuente simplemente no aporta ninguna entrada
   *   (el PUNTO de `datos` no depende de esto, sólo su frase).
   * @returns {Promise<{
   *   sistema: string, riesgoId: string,
   *   diagnosticEventId: string,  // uno por CADA llamada, ver la cabecera del archivo
   *   huerfano: boolean,          // true si el riesgo no tiene causas transcritas
   *   conflicto: boolean,         // Fase 4, G9: la 1ª y la 2ª causa las respalda una fuente distinta
   *   causas: object[],           // ordenadas, la más respaldada primero
   * }>}
   */
  async function diagnosticar({ sistema, riesgoId, valoresSensores } = {}) {
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
     * `crearIntervencion` (`shared/eva/comun/aprendizaje.js`) por la misma razón:
     * dos eventos en el mismo milisegundo no pueden compartir id.
     */
    const diagnosticEventId = `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    const candidatas = causasDe(riesgoId)
    if (!candidatas) {
      // Ningún riesgo activo se queda callado: si no hay causas transcritas
      // todavía, el diagnóstico lo DICE, no devuelve una lista vacía sin más
      // explicación que un caller distraído confunda con "sin sospechosos".
      return { sistema, riesgoId, diagnosticEventId, huerfano: true, conflicto: false, causas: [] }
    }

    const datos = datosDe(regla)

    // La frase de `datos`, con cifras — Plan 17 Fase 4 (G6). Sólo existe si
    // quien llama trajo `valoresSensores`: ver el JSDoc de `diagnosticar`.
    // Compartida por todas las causas del riesgo, igual que el ENTERO
    // `datos` ya lo era —misma evidencia física para todas, ver la cabecera
    // del archivo—.
    let evidenciaDatos = null
    if (valoresSensores) {
      try {
        evidenciaDatos = regla.evidencia(valoresSensores)
      } catch (error) {
        logger.warn('regla.evidencia(valoresSensores) falló; se omite la frase de datos', {
          riesgoId, error: error.message,
        })
      }
    }

    const causas = await Promise.all(candidatas.map(async causa => {
      const [manual, casos, temporal] = await Promise.all([
        respaldoDelManual(indiceDocumentos, sistema, causa),
        respaldoDeCasos(indiceCasos, sistema, riesgoId, causa),
        respaldoTemporal(evaluadorTemporal, sistema, causa),
      ])
      const total = datos + manual.puntos + casos.puntos + temporal.puntos
      const fuentesActivas =
        [datos > 0, manual.puntos > 0, casos.puntos > 0, temporal.puntos > 0].filter(Boolean).length

      /*
       * Evidencia en FRASES, no sólo el entero de `respaldo` — Plan 17
       * Fase 4 (G6). La §11 del encargo original la declara obligatoria;
       * `respaldo: {datos, manual, casos, total}` es exactamente el
       * "score=7" que esa sección declara insuficiente por sí solo.
       *
       * EN CONTRA es nuevo de verdad: hasta este plan, los tres términos
       * sólo podían SUMAR (salvo `resuelto:false`, que ya restaba). Un
       * caso refutado por id (Fase 2, G3) es la primera evidencia que
       * puede pesar EN CONTRA de una causa concreta con una frase, no sólo
       * con un punto menos en un total.
       */
      const evidenciaAFavor = []
      const evidenciaEnContra = []

      if (evidenciaDatos && datos > 0) {
        evidenciaAFavor.push({ fuente: 'datos', texto: evidenciaDatos, referencia: null })
      }
      if (manual.puntos > 0 && manual.fragmentos[0]) {
        const mejor = manual.fragmentos[0]
        evidenciaAFavor.push({
          fuente: 'manual', texto: mejor.texto, referencia: `${mejor.archivo} p.${mejor.pagina}`,
        })
      }
      for (const confirmado of casos.confirmados) {
        evidenciaAFavor.push({
          fuente: 'casos',
          texto: confirmado.causa ?? confirmado.sintoma,
          referencia: confirmado.id,
        })
      }
      for (const refutado of casos.refutados) {
        evidenciaEnContra.push({
          fuente: 'casos',
          texto: `Un técnico descartó esta causa en un cierre anterior — la causa real fue ` +
            `"${refutado.causaReal?.tipo ?? 'otra'}".`,
          referencia: refutado.id,
        })
      }
      // `temporal` (Plan 17 Fase 6, G5): frases YA construidas por
      // `temporal.mjs`, sólo hay que concatenarlas — el cuarto término es el
      // que de verdad discrimina entre causas del mismo riesgo, ver la
      // cabecera de ese archivo.
      evidenciaAFavor.push(...temporal.evidenciaAFavor)
      evidenciaEnContra.push(...temporal.evidenciaEnContra)

      return {
        id: causa.id,
        titulo: causa.titulo,
        componente: causa.componente,
        origen: causa.origen,
        provisional: causa.provisional,
        respaldo: { datos, manual: manual.puntos, casos: casos.puntos, temporal: temporal.puntos, total },
        banda: bandaDe(total, fuentesActivas),
        evidenciaAFavor,
        evidenciaEnContra,
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

    return { sistema, riesgoId, diagnosticEventId, huerfano: false, conflicto: hayConflicto(causas), causas }
  }

  return { diagnosticar }
}
