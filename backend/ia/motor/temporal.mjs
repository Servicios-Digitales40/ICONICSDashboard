/**
 * El cuarto término del diagnóstico: `temporal` — Plan 17 Fase 6 (G5).
 *
 * ── POR QUÉ NO ES LA HERRAMIENTA `diagnostico({sintoma})` ────────────
 *
 * `historia_de_senal`, `correlacionar_senales` y `pronostico.js` existen y
 * funcionan desde hace tiempo, pero viven dentro de la herramienta
 * `diagnostico({sintoma})`, que arma un DOSSIER EN PROSA para que el modelo
 * lo lea — «la corriente bajó, luego la presión subió», redactado, no
 * medido. Meter esa herramienta dentro de `motorDiagnostico.diagnosticar()`
 * rompería el determinismo que sostiene todo lo demás (ver la cabecera de
 * `diagnostico.mjs`): un dossier en prosa no es una función pura de sus
 * entradas de la misma forma que `evaluarRiesgos()` sí lo es.
 *
 * En su lugar, una CAUSA declara una firma temporal —qué señal, en qué
 * dirección, en qué ventana— y este módulo la evalúa con aritmética pura
 * sobre la serie: pendiente por mínimos cuadrados, signo, ventana. Nada de
 * lenguaje natural entra en la decisión; el lenguaje natural sólo describe
 * lo que la aritmética ya decidió, igual que `regla.evidencia(v)`.
 *
 * ── POR QUÉ ES LA FUENTE QUE DE VERDAD DISCRIMINA ────────────────────
 *
 * `datos` comparte la MISMA evidencia entre todas las causas de un riesgo
 * —verdad física, no defecto—. `manual` puede acabar igual de parejo entre
 * dos causas con manuales igual de buenos. Una TENDENCIA en el tiempo, en
 * cambio, es propia del MECANISMO de una causa concreta: una válvula que se
 * cierra es un cambio de estado; una recirculación que falta es un
 * calentamiento progresivo. Dos causas del mismo riesgo con la misma
 * evidencia instantánea pueden tener firmas temporales distintas.
 *
 * ── EL UMBRAL DE RUIDO ES RELATIVO, NO ABSOLUTO ──────────────────────
 *
 * Un umbral absoluto de pendiente (p.ej. "más de 0,5 unidades/hora") no
 * sirve entre `presionRelativa` (escala de unos pocos bar) y
 * `temperaturaTanque` (escala de decenas de °C) — es el MISMO error que
 * `UMBRAL_BM25_*` en `diagnostico.mjs` (Plan 17 Fase 3a): un número que no
 * es invariante a la escala de lo que mide. Aquí se evita desde el
 * principio: el cambio se mide como fracción del valor de partida
 * (`UMBRAL_CAMBIO_RELATIVO`), no como unidades por hora.
 */
import { logger } from '../../logger.mjs'

/** Puntos mínimos para que una pendiente signifique algo — con menos, una
 *  serie es dos números y una línea recta entre ellos no es una tendencia,
 *  es un trazo. */
const PUNTOS_MINIMOS = 3

/**
 * Cambio mínimo, como fracción del valor de PARTIDA de la ventana, para
 * contar como tendencia real y no como ruido de sensor.
 *
 * ── MEDIDO CONTRA ICONICS REAL (02-09-2026), F7c ────────────────────
 *
 * 36 ventanas de 1 h —la que declara la única `firmaTemporal` de
 * `causas.js`— leídas como las lee este módulo, no agregadas: resolución
 * real de 15 min, 4 puntos por ventana.
 *
 *   temperaturaTanque  n=9  p50 0,0094 · p75 0,0115 · p90 0,0131 · max 0,0131
 *   nivelTanque        n=9  p50 0,0145 · p75 0,0203 · p90 0,0451 · max 0,0451
 *   tensionLinea       n=9  p50 0,0199 · p75 0,0310 · p90 0,0712 · max 0,0712
 *
 * 0,05 **se queda**, y ahora por una razón medida: está ~4x por encima del
 * ruido de `temperaturaTanque` en operación tranquila, y por encima de
 * TODAS las ventanas observadas, así que el ruido no lo cruza. Deja de ser
 * una suposición y pasa a estar corroborado — pero no se declara cerrado:
 * n=9 de un solo tramo tranquilo dice que no habrá falsos positivos, no
 * dice que no se pierda una tendencia real lenta. Para eso hace falta ver
 * un episodio de verdad.
 *
 * Un dato operativo que salió de la misma medida: **27 de las 36 ventanas
 * no llegaban a `PUNTOS_MINIMOS`**. El historiador sólo guarda densidad de
 * 15 min en las horas recientes; más atrás, una ventana de 1 h no junta
 * tres puntos y `tendenciaDe` devuelve `null`. Es el comportamiento
 * correcto —silencio, no una dirección inventada— pero significa que el
 * cuarto término sólo opina sobre el pasado inmediato.
 */
const UMBRAL_CAMBIO_RELATIVO = 0.05

/**
 * Cuán pequeño puede ser el valor de PARTIDA, frente al mayor de la
 * ventana, antes de que el cambio relativo deje de significar nada.
 *
 * ── POR QUÉ EXISTE: MEDIDO, NO IMAGINADO ────────────────────────────
 *
 * `cambioRelativo` divide por el valor inicial. Si ese valor es ~0 —una
 * bomba parada, un caudal en reposo— la división explota: medido contra
 * ICONICS real el 02-09-2026, `flujoInstantaneo` dio cambios relativos de
 * hasta **2,2 millones** en ventanas de 1 h. El `Math.max(..., 1e-6)` de
 * abajo evita el infinito, no el disparate.
 *
 * Hoy no muerde: la única `firmaTemporal` declarada es sobre
 * `temperaturaTanque`, que nunca parte de cero. Muerde el día que alguien
 * declare una sobre caudal o presión — y entonces CADA arranque de bomba
 * sería una «tendencia» con la máxima confianza posible, que es el peor
 * falso positivo imaginable para este término.
 *
 * La salida correcta es el silencio, no un número enorme: si la ventana
 * arranca prácticamente en cero, no hay una fracción del inicio que
 * signifique algo, y este módulo ya sabe decir «sin tendencia clara».
 */
const BASE_MINIMA_RELATIVA = 0.01

const TOPE_PUNTOS = 2

/**
 * Pendiente por mínimos cuadrados, en unidades de la señal por hora.
 * `null` si no hay dispersión en el tiempo (todos los puntos en el mismo
 * instante — no debería pasar con datos reales, pero una serie de mentira
 * en una prueba sí puede construirlo).
 */
function pendienteLineal(datos) {
  const n = datos.length
  const t0 = datos[0].t.getTime()
  const xs = datos.map(d => (d.t.getTime() - t0) / 3600000) // horas desde el primer punto
  const ys = datos.map(d => d.valor)
  const mediaX = xs.reduce((a, b) => a + b, 0) / n
  const mediaY = ys.reduce((a, b) => a + b, 0) / n

  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mediaX) * (ys[i] - mediaY)
    den += (xs[i] - mediaX) ** 2
  }
  if (den === 0) return null
  return num / den
}

/**
 * Una serie → `{sube: true|false} | null`. `null` es "sin tendencia clara
 * que declarar" —silencio, no una dirección forzada— cuando faltan puntos o
 * el cambio no llega al umbral relativo.
 */
function tendenciaDe(datos) {
  if (datos.length < PUNTOS_MINIMOS) return null

  const m = pendienteLineal(datos)
  if (m === null) return null

  const horas = (datos[datos.length - 1].t.getTime() - datos[0].t.getTime()) / 3600000
  const cambioTotal = m * horas

  /*
   * Una ventana que arranca prácticamente en cero no tiene un «inicio»
   * contra el que medir una fracción — ver `BASE_MINIMA_RELATIVA`. Se calla
   * en vez de devolver un cambio relativo astronómico.
   */
  const mayor = Math.max(...datos.map(d => Math.abs(d.valor)))
  const base = Math.abs(datos[0].valor)
  if (mayor > 0 && base < mayor * BASE_MINIMA_RELATIVA) return null
  if (base === 0) return null

  const cambioRelativo = cambioTotal / base

  if (Math.abs(cambioRelativo) < UMBRAL_CAMBIO_RELATIVO) return null
  return { sube: cambioTotal > 0 }
}

const NOMBRE_DIRECCION = { sube: 'subió', baja: 'bajó' }

/**
 * @param {{leerSerie: Function}} historia  de `crearAyudantesDeHistoria`
 *   (`herramientas/lib/historia.mjs`) — el MISMO ayudante que ya usan las
 *   herramientas de históricos, no un cliente propio.
 */
/**
 * ── LA SEGUNDA CLASE DE FIRMA: UN FLANCO, NO UNA PENDIENTE (PLAN 30) ──
 *
 * Todo lo de arriba mide TENDENCIAS: mínimos cuadrados sobre una señal
 * analógica, `sube` o `baja`. Eso deja fuera a la evidencia que de verdad
 * separa la mayoría de las causas del tanque, y está medido: tras el Plan 29,
 * ONCE riesgos tienen dos o más causas y ninguna forma de desempatarlas,
 * porque lo que las distingue no es una pendiente sino un BIT.
 *
 *   `marcha-en-seco`  nivel bajo + `nivelBajoBajo` ACTIVA   → falta agua de verdad
 *                     nivel bajo + `nivelBajoBajo` INACTIVA → la protección no ve
 *
 * Las dos cursan con el nivel cayendo, así que una firma de tendencia sobre
 * `nivelTanque` les daría el MISMO punto a ambas. La alarma del PLC las separa
 * limpiamente. Ese razonamiento ya estaba escrito en tres comentarios de
 * `causas.js` desde el Plan 29 — en prosa, que el código no puede leer. Esto lo
 * hace ejecutable.
 *
 * ── POR QUÉ NO ES UN QUINTO TÉRMINO ──────────────────────────────────
 *
 * Porque un sumando nuevo sube el máximo teórico de 9 a 11 y obligaría a
 * recalibrar `bandaDe()`, que sigue BLOQUEADO a propósito por falta de corpus
 * real (Plan 17 F7a). Y porque las dos firmas contestan a la misma pregunta
 * —«¿qué dice el pasado reciente sobre esta causa?»—: una mirando una
 * pendiente, otra mirando un flanco. Comparten término y comparten tope.
 *
 * ── POR QUÉ LA SERIE SE PIDE EN CRUDO ────────────────────────────────
 *
 * Porque promediar una booleana no la degrada, la BORRA: el cubo de un
 * agregado vale 0,5 —ni 0 ni 1— y eso nunca es un flanco. Está medido en
 * `historia.mjs`: con `Average` salen 0 flancos en las nueve alarmas del
 * tanque; en crudo, 7 en `faltaDePresion` en 24 h. Por eso aquí se pasa
 * `{ crudo: true }` y en `evaluar()` no.
 */

/** Cuántas muestras hacen falta para opinar sobre un estado discreto.
 *  Menos exigente que `PUNTOS_MINIMOS`: una pendiente necesita tres puntos
 *  para ser una recta, pero «la alarma estuvo activa» se sostiene con una sola
 *  muestra que lo diga. Lo que NO se tolera es cero: sin muestras no hay
 *  ventana que mirar, y eso es silencio, no «inactiva». */
const MUESTRAS_MINIMAS_ESTADO = 1

/**
 * ── ESTE HISTORIADOR GRABA LAS ALARMAS POR EXCEPCIÓN ─────────────────
 *
 * Medido el 15-09-2026 sobre `nivelAlto`, 24 h en crudo: veinte muestras, y
 * seis de ellas son pulsos de UN SEGUNDO (15:23:05 a 1, 15:23:07 a 0). Entre
 * las 18:25 de ayer y ahora, NADA. No es que la señal no exista: es que sólo
 * se apunta cuando cambia.
 *
 * Eso rompe la intuición de la ventana corta. Pedir `nivelAlto` en 2 h
 * devuelve CERO muestras —`enRango` recorta lo que cae fuera, y con razón:
 * sin agregado el servidor devuelve la muestra límite del historiador entero,
 * que colada al principio de una ventana sería un flanco inventado—. Cero
 * muestras no significa «la alarma estuvo inactiva»: significa «no cambió
 * dentro de esta ventana», y el estado real puede ser cualquiera de los dos.
 *
 * De ahí la ventana MÍNIMA. Una firma de estado sobre este historiador
 * necesita mirar lo bastante atrás como para alcanzar el último cambio; por
 * debajo de eso, la respuesta honesta no es un veredicto sino silencio. 24 h
 * es lo medido: con esa ventana `nivelAlto` trae sus veinte muestras.
 *
 * No se convierte en «si está vacío, asume inactiva». Eso es exactamente
 * disfrazar de dato una ausencia (§2.4) — y en el peor sentido, porque
 * afirmaría que una protección NO actuó, que es media acusación.
 */
const VENTANA_MINIMA_ESTADO_H = 24

/**
 * ¿Coincide lo observado en la ventana con lo que la firma declara?
 *
 * `estado` puede ser:
 *   "activa" / "inactiva"  para señales booleanas (`naturaleza: "alarma"`)
 *   un número              para las de `naturaleza: "estado"` (`estadoS1 === 3`)
 *
 * ── EL `0` DEL PLC NO ES UN ESTADO, Y AQUÍ TAMPOCO ───────────────────
 *
 * `estadoSx` declara `1: Apagado · 2: En marcha · 3: Error · 4: Mantenimiento`,
 * y su propia nota dice que `0` es el valor inicial del PLC, tratado como sin
 * dato. Se compara por IGUALDAD contra el valor declarado, nunca por «distinto
 * de», así que un `0` recién arrancado no puede hacerse pasar por ninguno de
 * los cuatro. Es §2.4 aplicado a un estado discreto, el mismo criterio que
 * siguen las reglas del Plan 29 F4.
 */
function cumpleEstado(datos, estado) {
  if (typeof estado === 'number') {
    return datos.some(d => Number(d.valor) === estado)
  }
  // Booleana: "activa" es cualquier muestra distinta de cero en la ventana;
  // "inactiva" exige que NINGUNA lo esté — no basta con que la última no lo
  // esté, porque una alarma que entró y salió dentro de la ventana SÍ ocurrió.
  const huboActiva = datos.some(d => Number(d.valor) !== 0)
  return estado === 'activa' ? huboActiva : !huboActiva
}

export function createEvaluadorTemporal({ historia }) {
  /**
   * @param {Array<{senal: string, direccion: 'sube'|'baja', ventanaH: number}>} [firma]
   * @param {string} sistemaId
   * @returns {Promise<{
   *   puntos: number,               // 0..2 — cuántos ítems de la firma coincidieron
   *   evidenciaAFavor: object[],    // {fuente:'temporal', texto, referencia}
   *   evidenciaEnContra: object[],  // ídem, cuando la tendencia real es la OPUESTA a la declarada
   * }>}
   */
  async function evaluar(firma, sistemaId) {
    if (!firma?.length) return { puntos: 0, evidenciaAFavor: [], evidenciaEnContra: [] }

    const evidenciaAFavor = []
    const evidenciaEnContra = []
    let favorables = 0

    for (const item of firma) {
      const ahora = new Date()
      const ventana = { inicio: new Date(ahora.getTime() - item.ventanaH * 3600000), fin: ahora }

      let resultado
      try {
        resultado = await historia.leerSerie(item.senal, ventana, sistemaId)
      } catch (error) {
        logger.warn('leerSerie falló evaluando una firma temporal; se cuenta como sin dato', {
          senal: item.senal, error: error.message,
        })
        continue
      }

      if (!resultado.ok || resultado.datos.length < PUNTOS_MINIMOS) continue // silencio: no hay criterio

      const tendencia = tendenciaDe(resultado.datos)
      if (!tendencia) continue // plano o insuficiente: silencio, no una dirección forzada

      const direccionReal = tendencia.sube ? 'sube' : 'baja'
      const coincide = direccionReal === item.direccion
      const texto = `La señal "${item.senal}" ${NOMBRE_DIRECCION[direccionReal]} en las últimas ${item.ventanaH} h.`

      /*
       * `plantilla` es la MISMA frase por claves, para que el tablero pueda
       * escribirla en su idioma. `texto` se queda porque es lo que consume el
       * modelo, que narra en español o en inglés pero lee siempre esto. Ver
       * la cabecera de `diagnostico.mjs`.
       */
      const plantilla = { clave: 'tendencia', senal: item.senal, direccion: direccionReal, ventanaH: item.ventanaH }

      if (coincide) {
        favorables++
        evidenciaAFavor.push({ fuente: 'temporal', texto, referencia: item.senal, plantilla })
      } else {
        evidenciaEnContra.push({
          fuente: 'temporal',
          texto: `${texto} La firma de esta causa declaraba dirección "${item.direccion}".`,
          referencia: item.senal,
          plantilla: { ...plantilla, clave: 'tendenciaContraria', declarada: item.direccion },
        })
      }
    }

    return { puntos: Math.min(favorables, TOPE_PUNTOS), evidenciaAFavor, evidenciaEnContra }
  }

  /**
   * La firma de ESTADO DISCRETO — Plan 30. Misma forma de contrato que
   * `evaluar()`: puntos 0..2, evidencia a favor y en contra, y silencio cuando
   * no hay con qué opinar.
   *
   * @param {Array<{senal: string, estado: 'activa'|'inactiva'|number, ventanaH: number}>} [firma]
   * @param {string} sistemaId
   */
  async function evaluarEstado(firma, sistemaId) {
    if (!firma?.length) return { puntos: 0, evidenciaAFavor: [], evidenciaEnContra: [] }

    const evidenciaAFavor = []
    const evidenciaEnContra = []
    let favorables = 0

    for (const item of firma) {
      const ahora = new Date()
      /*
       * La ventana se ENSANCHA al mínimo si la firma pide menos — ver
       * `VENTANA_MINIMA_ESTADO_H`. No se rechaza la firma ni se avisa: con
       * grabación por excepción, una ventana corta no es un error de quien la
       * declaró, es una ventana que no alcanza el último cambio. Se mira más
       * atrás y se dice en la frase cuánto se miró, que es lo que el técnico
       * necesita para juzgar la evidencia.
       */
      const ventanaH = Math.max(item.ventanaH, VENTANA_MINIMA_ESTADO_H)
      const ventana = { inicio: new Date(ahora.getTime() - ventanaH * 3600000), fin: ahora }

      let resultado
      try {
        // `crudo: true` NO es opcional aquí — ver la cabecera de esta sección.
        resultado = await historia.leerSerie(item.senal, ventana, sistemaId, { crudo: true })
      } catch (error) {
        logger.warn('leerSerie falló evaluando una firma de estado; se cuenta como sin dato', {
          senal: item.senal, error: error.message,
        })
        continue
      }

      if (!resultado.ok || resultado.datos.length < MUESTRAS_MINIMAS_ESTADO) continue // silencio

      const coincide = cumpleEstado(resultado.datos, item.estado)
      const declarado = typeof item.estado === 'number' ? `estado ${item.estado}` : item.estado

      /*
       * La frase describe lo que la firma DECLARABA y si se cumplió, no el
       * valor crudo: «la alarma X estuvo activa» es lo que el técnico necesita
       * leer, no «la serie de X trajo un 1». El valor sigue disponible en el
       * historiador para quien quiera contrastarlo.
       */
      // `ventanaH` y no `item.ventanaH`: es la que de verdad se miró. Citar la
      // declarada sería decirle al técnico que la evidencia cubre dos horas
      // cuando cubre veinticuatro.
      const texto = coincide
        ? `La señal "${item.senal}" estuvo en ${declarado} en las últimas ${ventanaH} h.`
        : `La señal "${item.senal}" NO estuvo en ${declarado} en las últimas ${ventanaH} h.`

      const plantilla = {
        clave: coincide ? 'estado' : 'estadoContrario',
        senal: item.senal,
        estado: String(declarado),
        ventanaH,
      }

      if (coincide) {
        favorables++
        evidenciaAFavor.push({ fuente: 'temporal', texto, referencia: item.senal, plantilla })
      } else {
        /*
         * EN CONTRA de verdad, no silencio: si una causa declara que su alarma
         * tuvo que activarse y no se activó, eso PESA en contra de esa causa.
         * Es exactamente lo que distingue «la protección no ve» de «ve y nadie
         * actuó», y callarlo dejaría las dos causas empatadas otra vez.
         */
        evidenciaEnContra.push({ fuente: 'temporal', texto, referencia: item.senal, plantilla })
      }
    }

    return { puntos: Math.min(favorables, TOPE_PUNTOS), evidenciaAFavor, evidenciaEnContra }
  }

  return { evaluar, evaluarEstado }
}
