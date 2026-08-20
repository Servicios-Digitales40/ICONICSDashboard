/**
 * Estadística y proyección sobre series de ICONICS.
 *
 * El LLM nunca ve una serie cruda, sólo estos resultados ya hechos.
 *
 * ── LA FORMA DE UNA SERIE ──────────────────────────────────────────
 *
 * Toda función que reciba «puntos» aquí espera lo que devuelve
 * `normalizar()` de `historia.js`: `{ t: Date, valor: number }`. **No** es
 * `{ timestamp, value }`, que es la forma CRUDA en que ICONICS entrega el
 * historiador, antes de filtrar por calidad.
 *
 * Se dice aquí arriba porque confundirlas no da error: `p.value` sobre un
 * punto normalizado vale `undefined`, el `filter` de validez lo descarta, y la
 * función devuelve «no hay muestras suficientes» sobre una serie que estaba
 * llena. El síntoma es un asistente que contesta que el historiador no tiene
 * datos, y se va a buscar el fallo al Data Historian, que está perfectamente.
 */

/** Media aritmética. */
export function media(valores) {
  if (!valores.length) return null
  return valores.reduce((a, b) => a + b, 0) / valores.length
}

/** Mediana. */
export function mediana(valores) {
  if (!valores.length) return null
  const orden = [...valores].sort((a, b) => a - b)
  const mitad = Math.floor(orden.length / 2)
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2
}

/** Desviación estándar poblacional. */
export function desviacionEstandar(valores, mediaYaCalculada) {
  if (valores.length < 2) return null
  const m = mediaYaCalculada ?? media(valores)
  const varianza = valores.reduce((s, v) => s + (v - m) ** 2, 0) / valores.length
  return Math.sqrt(varianza)
}

/**
 * Regresión lineal simple (mínimos cuadrados).
 * El eje X es SEGUNDOS desde la primera muestra.
 */
export function regresionLineal(puntos) {
  const validos = puntos.filter(p => typeof p.valor === 'number' && Number.isFinite(p.valor))
  if (validos.length < 3) return null

  const t0 = validos[0].t.getTime()
  const xs = validos.map(p => (p.t.getTime() - t0) / 1000)
  const ys = validos.map(p => p.valor)
  const n = xs.length

  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const sumXX = xs.reduce((s, x) => s + x * x, 0)

  const denominador = n * sumXX - sumX * sumX
  if (Math.abs(denominador) < 1e-9) return null

  const pendiente = (n * sumXY - sumX * sumY) / denominador
  const intercepto = (sumY - pendiente * sumX) / n

  const yMedia = sumY / n
  const ssTotal = ys.reduce((s, y) => s + (y - yMedia) ** 2, 0)
  const ssResiduo = ys.reduce((s, y, i) => s + (y - (pendiente * xs[i] + intercepto)) ** 2, 0)
  const r2 = ssTotal < 1e-9 ? 1 : Math.max(0, 1 - ssResiduo / ssTotal)

  const errorEstandar = Math.sqrt(ssResiduo / Math.max(1, n - 2))

  return {
    pendiente,
    intercepto,
    r2,
    errorEstandar,
    ultimoX: xs[xs.length - 1],
    t0,
  }
}

/**
 * Proyecta la recta `horizonteMinutos` más allá de la última muestra.
 * La banda es ± 1.96 errores estándar (≈ 95%).
 */
export function proyectar(regresion, horizonteMinutos, decimales = 1) {
  if (!regresion) return null
  const xFuturo = regresion.ultimoX + horizonteMinutos * 60
  const valor = regresion.pendiente * xFuturo + regresion.intercepto
  const margen = 1.96 * regresion.errorEstandar
  const r = v => +v.toFixed(decimales)
  return { valor: r(valor), valorMin: r(valor - margen), valorMax: r(valor + margen) }
}

/**
 * Muestras cuyo z-score supera el umbral: candidatas a anomalías.
 */
export function detectarAnomalias(puntos, { media: m, desv }, umbralZ = 2.5) {
  if (!desv || desv < 1e-9) return []
  return puntos
    .filter(p => typeof p.valor === 'number')
    .map(p => ({ ...p, z: Math.abs(p.valor - m) / desv }))
    .filter(p => p.z >= umbralZ)
    .map(p => ({ hora: p.t.toISOString(), valor: p.valor, z: +p.z.toFixed(2) }))
}

/** Agrupa las cuatro estadísticas que casi siempre se piden juntas. */
export function estadisticasBasicas(valores, decimales = 1) {
  const m = media(valores)
  const d = desviacionEstandar(valores, m)
  const r = v => (v === null ? null : +v.toFixed(decimales))
  return { media: r(m), mediana: r(mediana(valores)), desv: r(d), n: valores.length }
}

/* ── Correlación entre dos señales ──────────────────────────────────── */

/**
 * Coeficiente de Pearson entre dos listas ya alineadas.
 *
 * Va de -1 a 1: 1 es que suben juntas, -1 que cuando una sube la otra baja, y
 * 0 que no guardan relación lineal. Devuelve `null` si alguna de las dos es
 * constante — no es que la correlación sea cero, es que no está definida, y
 * decir «0» ahí sería afirmar que no hay relación cuando lo cierto es que no
 * se puede saber.
 */
export function correlacionPearson(xs, ys) {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null

  const mx = media(xs.slice(0, n))
  const my = media(ys.slice(0, n))

  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }

  if (dx < 1e-12 || dy < 1e-12) return null
  return num / Math.sqrt(dx * dy)
}

/**
 * Alinea dos series muestreadas en instantes distintos.
 *
 * ── POR QUÉ HACE FALTA ALINEAR ─────────────────────────────────────
 *
 * El historiador devuelve cada señal con sus propias marcas de tiempo, y
 * correlacionar los valores por POSICIÓN —la muestra 3 de una contra la 3 de
 * la otra— sólo sería correcto si las dos empezaran a la vez y con el mismo
 * intervalo. No es el caso, y el error no se ve: sale un número de correlación
 * perfectamente creíble sobre instantes que no se corresponden.
 *
 * Se emparejan por cercanía temporal, y las muestras que no encuentran pareja
 * dentro de `toleranciaMs` se descartan en vez de emparejarse con la menos mala.
 */
export function alinearSeries(serieA, serieB, toleranciaMs) {
  const a = serieA
    .filter(p => typeof p.valor === 'number' && Number.isFinite(p.valor))
    .map(p => ({ t: p.t.getTime(), v: p.valor }))
    .sort((x, y) => x.t - y.t)
  const b = serieB
    .filter(p => typeof p.valor === 'number' && Number.isFinite(p.valor))
    .map(p => ({ t: p.t.getTime(), v: p.valor }))
    .sort((x, y) => x.t - y.t)

  if (!a.length || !b.length) return { xs: [], ys: [], instantes: [] }

  const xs = [], ys = [], instantes = []
  let j = 0

  for (const punto of a) {
    // Avanza en B mientras acercarse más sea posible. Las dos listas están
    // ordenadas, así que esto recorre cada una una sola vez.
    while (j + 1 < b.length && Math.abs(b[j + 1].t - punto.t) <= Math.abs(b[j].t - punto.t)) j++
    if (Math.abs(b[j].t - punto.t) <= toleranciaMs) {
      xs.push(punto.v)
      ys.push(b[j].v)
      instantes.push(punto.t)
    }
  }

  return { xs, ys, instantes }
}

/**
 * Cómo se lee un coeficiente de correlación, en palabras.
 *
 * Existe porque el modelo tiene prohibido hacer aritmética y porque «r = 0,82»
 * no le dice nada a un operador. La frase la escribe el backend para que sea
 * siempre la misma; el modelo la copia.
 */
export function describirCorrelacion(r) {
  if (r === null) return 'no se puede calcular: alguna de las dos señales no varió en el período'

  const fuerza = Math.abs(r)
  const grado =
    fuerza >= 0.8 ? 'muy fuerte'
      : fuerza >= 0.6 ? 'fuerte'
        : fuerza >= 0.4 ? 'moderada'
          : fuerza >= 0.2 ? 'débil'
            : 'prácticamente nula'

  if (fuerza < 0.2) return `relación ${grado}: se movieron de forma independiente`
  return `relación ${grado} y ${r > 0 ? 'en el mismo sentido' : 'en sentidos opuestos'}`
}