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
 * contar como tendencia real y no como ruido de sensor. PROVISIONAL: 0,05
 * (5 %) es una suposición razonada —el mismo criterio de honestidad que
 * `UMBRAL_BM25_*`—, no una medida contra ruido real de estos sensores en
 * concreto. Se recalibra cuando haya series reales largas que mirar (F7c
 * del plan, cuando haya ICONICS real).
 */
const UMBRAL_CAMBIO_RELATIVO = 0.05

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
  const base = Math.max(Math.abs(datos[0].valor), 1e-6)
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

      if (coincide) {
        favorables++
        evidenciaAFavor.push({ fuente: 'temporal', texto, referencia: item.senal })
      } else {
        evidenciaEnContra.push({
          fuente: 'temporal',
          texto: `${texto} La firma de esta causa declaraba dirección "${item.direccion}".`,
          referencia: item.senal,
        })
      }
    }

    return { puntos: Math.min(favorables, TOPE_PUNTOS), evidenciaAFavor, evidenciaEnContra }
  }

  return { evaluar }
}
