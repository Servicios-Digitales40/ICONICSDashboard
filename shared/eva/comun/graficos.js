/**
 * Gráficos de una serie ya leída, para acompañar la respuesta del asistente.
 *
 * No hay modelo generativo por ninguna parte: esto son los puntos reales del
 * historiador convertidos en coordenadas. Un gráfico que el asistente
 * «dibujara» sería una alucinación con forma de dato, que es peor que no tener
 * gráfico.
 *
 * ── POR QUÉ SVG Y NO PNG ───────────────────────────────────────────
 *
 * La versión anterior usaba `chartjs-node-canvas`, y eso trae `node-canvas`:
 * un módulo nativo que en Windows exige toolchain de compilación de C++ y que
 * rompía el arranque del backend entero —el `import` fallaba y con él caía
 * `herramientas.mjs`, `app.mjs` y el servidor—. El backend de este proyecto no
 * tiene dependencias a propósito (ver `README.md`), y una que impide arrancar
 * paga muy mal el precio.
 *
 * SVG se genera con concatenación de cadenas, pesa una décima parte que el PNG
 * equivalente, el navegador lo pinta nativo y encima queda nítido a cualquier
 * zoom. La contrapartida —que no se puede incrustar en un correo tan
 * fácilmente— no aplica: esto va a un panel de chat.
 */

const ANCHO = 640
const ALTO = 320
const MARGEN = { arriba: 34, derecha: 16, abajo: 34, izquierda: 52 }

const AREA_ANCHO = ANCHO - MARGEN.izquierda - MARGEN.derecha
const AREA_ALTO = ALTO - MARGEN.arriba - MARGEN.abajo

/** Cuántas marcas se ponen en cada eje. Más que esto se solapan a 640 px. */
const MARCAS_Y = 5
const MARCAS_X = 6

const COLOR = {
  fondo: '#ffffff',
  rejilla: '#e8ebf0',
  eje: '#9aa3af',
  texto: '#3c4450',
  titulo: '#111827',
  serie: '#2563eb',
  relleno: 'rgba(37, 99, 235, 0.10)',
  aviso: '#e6a817',
  limite: '#d64545',
}

/**
 * Dibuja una serie del historiador.
 *
 * @param {{t: Date, valor: number}[]} datos  lo que devuelve `normalizar()` de historia.js
 * @param {object} opciones
 * @param {string} opciones.titulo
 * @param {string|null} [opciones.unidad]  `null` si el servidor no la declara
 * @param {object|null} [opciones.banda]   umbrales, en el formato de `bandaLegible()`
 * @returns {string} el SVG entero
 */
export function renderizarGraficoSerie(datos, { titulo, unidad, banda } = {}) {
  const puntos = (datos ?? []).filter(d => typeof d.valor === 'number' && Number.isFinite(d.valor))
  if (puntos.length < 2) {
    throw new Error('Hacen falta al menos dos muestras válidas para dibujar una serie.')
  }

  /*
   * La escala vertical la fijan LOS DATOS, no los umbrales.
   *
   * Se probó al revés —encajar siempre la banda entera— y el resultado era una
   * línea plana pegada al borde inferior en las señales que viven lejos de su
   * límite: técnicamente correcto e ilegible. Las líneas de banda que se salgan
   * del recuadro simplemente no se pintan, y el texto del asistente ya dice el
   * número.
   */
  const valores = puntos.map(p => p.valor)
  const crudoMin = Math.min(...valores)
  const crudoMax = Math.max(...valores)

  // Una serie constante daría un rango de cero y una división por cero al
  // escalar. Se le abre un margen artificial para que la línea salga centrada.
  const plano = crudoMax - crudoMin < 1e-9
  const min = plano ? crudoMin - 1 : crudoMin
  const max = plano ? crudoMax + 1 : crudoMax
  const holgura = (max - min) * 0.08
  const yMin = min - holgura
  const yMax = max + holgura

  const x = i => MARGEN.izquierda + (i / (puntos.length - 1)) * AREA_ANCHO
  const y = v => MARGEN.arriba + AREA_ALTO - ((v - yMin) / (yMax - yMin)) * AREA_ALTO

  const partes = []
  partes.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" ` +
      `viewBox="0 0 ${ANCHO} ${ALTO}" role="img" aria-label="${esc(titulo)}">`,
    `<rect width="${ANCHO}" height="${ALTO}" fill="${COLOR.fondo}"/>`,
    `<style>text{font-family:system-ui,-apple-system,'Segoe UI',sans-serif}</style>`
  )

  /* ── Título ──────────────────────────────────────────────────────── */
  const rotulo = unidad ? `${titulo} (${unidad})` : titulo
  partes.push(
    `<text x="${MARGEN.izquierda}" y="20" font-size="13" font-weight="600" ` +
      `fill="${COLOR.titulo}">${esc(rotulo)}</text>`
  )

  /* ── Rejilla y eje Y ─────────────────────────────────────────────── */
  for (let i = 0; i < MARCAS_Y; i++) {
    const v = yMin + (i / (MARCAS_Y - 1)) * (yMax - yMin)
    const py = y(v)
    partes.push(
      `<line x1="${MARGEN.izquierda}" y1="${f(py)}" x2="${MARGEN.izquierda + AREA_ANCHO}" ` +
        `y2="${f(py)}" stroke="${COLOR.rejilla}" stroke-width="1"/>`,
      `<text x="${MARGEN.izquierda - 8}" y="${f(py + 4)}" font-size="10" text-anchor="end" ` +
        `fill="${COLOR.texto}">${esc(cifra(v, yMax - yMin))}</text>`
    )
  }

  /* ── Bandas de umbral ────────────────────────────────────────────── */
  if (banda) {
    const lineaBanda = (valor, color, nombre) => {
      // «sin límite» es el texto que pone `bandaLegible()` cuando no hay tope
      // por ese lado. No es un número y no se dibuja.
      if (valor === null || valor === undefined || typeof valor !== 'number') return
      if (valor < yMin || valor > yMax) return   // fuera del recuadro: ver arriba
      const py = y(valor)
      partes.push(
        `<line x1="${MARGEN.izquierda}" y1="${f(py)}" x2="${MARGEN.izquierda + AREA_ANCHO}" ` +
          `y2="${f(py)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="6 4"/>`,
        `<text x="${MARGEN.izquierda + AREA_ANCHO - 4}" y="${f(py - 4)}" font-size="9" ` +
          `text-anchor="end" fill="${color}">${esc(nombre)}</text>`
      )
    }
    lineaBanda(numero(banda.limiteSuperior), COLOR.limite, 'límite sup.')
    lineaBanda(numero(banda.avisoSuperior), COLOR.aviso, 'aviso sup.')
    lineaBanda(numero(banda.avisoInferior), COLOR.aviso, 'aviso inf.')
    lineaBanda(numero(banda.limiteInferior), COLOR.limite, 'límite inf.')
  }

  /* ── La serie ────────────────────────────────────────────────────── */
  const camino = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${f(x(i))},${f(y(p.valor))}`).join(' ')
  const base = MARGEN.arriba + AREA_ALTO

  partes.push(
    `<path d="${camino} L${f(x(puntos.length - 1))},${base} L${f(x(0))},${base} Z" ` +
      `fill="${COLOR.relleno}" stroke="none"/>`,
    `<path d="${camino}" fill="none" stroke="${COLOR.serie}" stroke-width="2" ` +
      `stroke-linejoin="round" stroke-linecap="round"/>`
  )

  /* ── Eje X: la hora de cada marca ────────────────────────────────── */
  const paso = Math.max(1, Math.floor((puntos.length - 1) / (MARCAS_X - 1)))
  for (let i = 0; i < puntos.length; i += paso) {
    partes.push(
      `<text x="${f(x(i))}" y="${base + 16}" font-size="10" text-anchor="middle" ` +
        `fill="${COLOR.texto}">${esc(horaCorta(puntos[i].t))}</text>`
    )
  }

  /* ── Marco ───────────────────────────────────────────────────────── */
  partes.push(
    `<rect x="${MARGEN.izquierda}" y="${MARGEN.arriba}" width="${AREA_ANCHO}" ` +
      `height="${AREA_ALTO}" fill="none" stroke="${COLOR.eje}" stroke-width="1"/>`,
    // La procedencia va DENTRO de la imagen a propósito: el gráfico se puede
    // recortar y pegar en un correo, y ahí ya no lleva al lado la frase del
    // asistente que decía de dónde salen los puntos.
    `<text x="${ANCHO - MARGEN.derecha}" y="${ALTO - 6}" font-size="9" text-anchor="end" ` +
      `fill="${COLOR.eje}">Hyper Historian · ${puntos.length} muestras</text>`,
    '</svg>'
  )

  return partes.join('')
}

/* ── Auxiliares ─────────────────────────────────────────────────────── */

/**
 * Decimales según lo que abarque el eje, no fijos.
 *
 * Un eje de 0 a 100 con dos decimales llena la etiqueta de ruido; uno de 0,3 a
 * 0,4 sin decimales pinta cinco marcas que dicen «0».
 */
function cifra(v, rango) {
  const decimales = rango >= 50 ? 0 : rango >= 5 ? 1 : 2
  return v.toFixed(decimales)
}

/** Coordenada con un decimal: el SVG no gana nada con más y el archivo crece. */
function f(n) {
  return Math.round(n * 10) / 10
}

/** `bandaLegible()` mete «sin límite» donde no hay tope. Sólo pasan los números. */
function numero(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Escapa lo que va dentro de un nodo de texto.
 *
 * Los rótulos vienen del catálogo, no del usuario, pero un `&` en un nombre de
 * señal produciría un SVG mal formado que el navegador se niega a pintar — y el
 * síntoma sería un hueco en blanco sin ningún error.
 */
function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function horaCorta(iso) {
  const d = new Date(iso)
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
