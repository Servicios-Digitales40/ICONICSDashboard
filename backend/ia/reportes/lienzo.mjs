/**
 * El lienzo de los reportes PDF: la marca TDCON, la portada, el cintillo, el
 * pie con folio y página, los títulos de sección y la caja de resumen. Todo
 * lo que un documento necesita ANTES de saber qué cuenta.
 *
 * ── POR QUÉ EXISTE (Plan 44 F1) ─────────────────────────────────────
 *
 * Vivía dentro de `ia/reporte.mjs`, que tenía UNA plantilla. Al haber ocho
 * tipos de reporte (`reportes/plantillas/`), las primitivas se sacaron aquí
 * tal cual —sin reescribir una sola— para que `reporte.mjs` (el catálogo de
 * hoy y la conversación exportada) y `reportes/compositor.mjs` (las
 * plantillas nuevas) dibujen con la misma marca y las mismas medidas. Las
 * comprobaciones de `generar_reporte` pasaron antes y después del traslado
 * sin tocarlas.
 *
 * Los porqués de cada pieza (por qué `bufferPages`, por qué el sellado va al
 * final, por qué el cintillo se recorta y no se aplasta) siguen en el
 * comentario de cada función; la regla de la casa —la marca que falta se
 * dibuja en vectores, nunca truena— también.
 *
 * Importa `pdfkit` en la cabecera, y eso es correcto por la misma razón que
 * en `reporte.mjs`: sólo se carga con un `await import()` desde dentro de
 * la herramienta, nunca al arrancar el backend.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

import PDFDocument from 'pdfkit'
import SVGtoPDF from 'svg-to-pdfkit'

export const MARGEN = 50
export const ANCHO_PAGINA = 595.28 // A4 en puntos
export const ALTO_PAGINA = 841.89

/* El cintillo se dibuja a sangre. A su proporción natural (bastante más
 * ancha que alta) se comía casi tanto sitio como el gráfico de la página,
 * así que se fija un alto menor y se RECORTA la imagen —nunca se aplasta—:
 * `dibujarCintillo` la dibuja a su ancho completo y centrada verticalmente
 * dentro de este alto, con un `clip()` que descarta lo que sobra arriba y
 * abajo. El margen superior del contenido lo deja libre; el inferior
 * reserva sitio para el pie. */
export const ALTO_CINTILLO = 52
export const MARGEN_SUP = ALTO_CINTILLO + 20
export const MARGEN_INF = 56
export const LIMITE_INFERIOR = ALTO_PAGINA - MARGEN_INF

export const ANCHO_TEXTO = ANCHO_PAGINA - MARGEN * 2
export const ANCHO_GRAFICO = ANCHO_TEXTO

/** El SVG de `renderizarGraficoSerie` es siempre 640×320: mismo ratio aquí. */
export const ALTO_GRAFICO = Math.round(ANCHO_GRAFICO * (320 / 640))

export const RESERVA_TITULO = 24
// El resumen numérico más la frase de interpretación, que puede envolver a
// una segunda línea si la señal no tiene unidad corta.
export const RESERVA_RESUMEN = 52
export const RESERVA_ENTRE_BLOQUES = 14
export const ALTO_BLOQUE_GRAFICO = RESERVA_TITULO + ALTO_GRAFICO + RESERVA_RESUMEN + RESERVA_ENTRE_BLOQUES

/* ── Paleta de marca ──────────────────────────────────────────────── */
export const AZUL = '#081838' // marino de portada y cabeceras (muestreado del cintillo TDCON)
export const CIAN = '#2E9BE6' // acento azul-cian (muestreado del texto de marca, aclarado para contraste)
export const CLARO = '#EAF2FB' // texto sobre azul
export const CLARO_TENUE = '#9FB3CE' // texto secundario sobre azul
export const TEXTO = '#1B2430' // cuerpo sobre blanco
export const GRIS = '#7A8AA0' // texto apagado / pie
export const CAJA_SUAVE = '#F1F6FC' // fondo del recuadro de resumen

export const LEMA_PIE = 'TDCON III.0 · Tecnología, Desarrollo y Control 4.0'

/* ── Carga de la marca (tolerante a que falte) ────────────────────── */
export const RUTA_MARCA = join(dirname(fileURLToPath(import.meta.url)), '..', 'marca')

export function leerMarca(nombre) {
  try {
    return readFileSync(join(RUTA_MARCA, nombre))
  } catch {
    return null // Falta la pieza: se dibuja el reemplazo en vectores.
  }
}

/**
 * Ancho y alto reales de un PNG, leídos de su IHDR (bytes 16-23: dos enteros
 * de 4 bytes, big-endian). Nunca se confía en un tamaño de memoria o de
 * comentario: el archivo de `ia/marca/` lo reemplaza quien administra la
 * marca, y un comentario con el tamaño de la versión anterior queda
 * desactualizado en el mismo instante en que alguien sube un PNG distinto —
 * medido: `cintillo.png` es hoy 1022×251, no 1276×189.
 */
export function dimensionesPng(buffer) {
  if (!buffer || buffer.length < 24) return null
  return { ancho: buffer.readUInt32BE(16), alto: buffer.readUInt32BE(20) }
}

export function cargarMarca() {
  return {
    fondo: leerMarca('portada-fondo.png'),
    banner: leerMarca('banner.png'),
    cintillo: leerMarca('cintillo.png'),
  }
}

/**
 * Folio único del reporte: `TDCON-AAAAMMDD-XXXX`.
 *
 * Se genera aquí si el llamador no pasa uno, para que TODO reporte salga con
 * su folio sin depender de que nadie se acuerde de ponerlo. Lleva la fecha
 * —lo que un folio de planta necesita para ordenarse— y cuatro caracteres de
 * un UUID como cola, que hace la colisión improbable sin necesidad de un
 * contador persistido (esto es un módulo de composición, no debe escribir en
 * disco). Si algún día se quiere numeración estrictamente consecutiva, el
 * llamador pasa `datos.folio` con su propia secuencia y esto no interviene.
 */
export function generarFolio(fecha = new Date(), prefijo = null) {
  const p = (n) => String(n).padStart(2, '0')
  const ymd = `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}`
  const cola = randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()
  /* El prefijo del TIPO de reporte (Plan 44, D5): `TDCON-TEC-…`, `TDCON-SEN-…`.
     Sin prefijo, el folio de siempre — el catálogo y la conversación no cambian. */
  return prefijo ? `TDCON-${prefijo}-${ymd}-${cola}` : `TDCON-${ymd}-${cola}`
}

/* ── Piezas de marca reutilizadas por las dos portadas y páginas ──── */

/**
 * Ejecuta `fn` con los márgenes de la página anulados.
 *
 * La portada, el cintillo y el pie dibujan en posición ABSOLUTA, a menudo
 * cerca del borde inferior. pdfkit, al escribir texto cuya `y` cae por debajo
 * del margen inferior, añade una página automática (`continueOnNewPage`) —y lo
 * hace aunque se le pase `lineBreak:false`—. Eso metía páginas en blanco: un
 * pie de dos líneas creaba dos páginas fantasma por hoja. Anular los márgenes
 * mientras se dibujan estas piezas quita el disparador; se restauran después,
 * así que el flujo normal del contenido no se entera.
 */
export function sinPaginacion(doc, fn) {
  const m = doc.page.margins
  const previo = { top: m.top, bottom: m.bottom, left: m.left, right: m.right }
  m.top = 0; m.bottom = 0; m.left = 0; m.right = 0
  try {
    fn()
  } finally {
    m.top = previo.top; m.bottom = previo.bottom; m.left = previo.left; m.right = previo.right
  }
}

/** Portada: fondo azul a sangre, banner centrado y bloque de título claro. */
export function dibujarPortada(doc, marca, etq, { titulo, subtitulo, instalacion, periodo, generadoEl, folio }) {
  if (marca.fondo) {
    doc.image(marca.fondo, 0, 0, { cover: [ANCHO_PAGINA, ALTO_PAGINA] })
  } else {
    doc.save().rect(0, 0, ANCHO_PAGINA, ALTO_PAGINA).fill(AZUL).restore()
  }
  // Velo azul semitransparente sobre el fondo (lleno de circuitos y ondas):
  // lo calma para que el banner y los títulos resalten y se lean claros.
  doc.save().fillColor(AZUL).fillOpacity(0.4).rect(0, 0, ANCHO_PAGINA, ALTO_PAGINA).fill().restore()

  let y = 250
  if (marca.banner) {
    // Grande y arriba: el banner es lo primero que se ve, con aire alrededor.
    const anchoBanner = 470
    const altoBanner = anchoBanner * (461 / 905)
    const yBanner = 118
    doc.image(marca.banner, (ANCHO_PAGINA - anchoBanner) / 2, yBanner, { width: anchoBanner })
    y = yBanner + altoBanner + 44
  }

  doc.font('Helvetica-BoldOblique').fontSize(27).fillColor(CLARO)
    .text(titulo, MARGEN, y, { width: ANCHO_TEXTO, align: 'center' })
  if (subtitulo) {
    doc.moveDown(0.5).font('Helvetica').fontSize(12).fillColor(CLARO_TENUE)
      .text(subtitulo, MARGEN, doc.y, { width: ANCHO_TEXTO, align: 'center' })
  }

  doc.moveDown(1.2)
  if (instalacion) {
    doc.font('Helvetica-Bold').fontSize(15).fillColor(CIAN)
      .text(instalacion, MARGEN, doc.y, { width: ANCHO_TEXTO, align: 'center' })
  }
  if (periodo) {
    doc.moveDown(0.4).font('Helvetica').fontSize(11.5).fillColor(CLARO)
      .text(periodo, MARGEN, doc.y, { width: ANCHO_TEXTO, align: 'center' })
  }
  if (generadoEl) {
    doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor(CLARO_TENUE)
      .text(etq.generadoEl(generadoEl), MARGEN, doc.y, { width: ANCHO_TEXTO, align: 'center' })
  }
  if (folio) {
    // El folio en una "pastilla" cian tenue, para que se lea como un dato de
    // trazabilidad y no como una línea más del subtítulo.
    doc.moveDown(0.9)
    doc.font('Helvetica-Bold').fontSize(10.5)
    const etiqueta = `${etq.folio}   ${folio}`
    const anchoPastilla = doc.widthOfString(etiqueta) + 26
    const xPastilla = (ANCHO_PAGINA - anchoPastilla) / 2
    const yPastilla = doc.y
    doc.save()
    doc.roundedRect(xPastilla, yPastilla, anchoPastilla, 22, 11)
      .lineWidth(1).strokeColor(CIAN).stroke()
    doc.restore()
    doc.fillColor(CLARO).text(etiqueta, xPastilla, yPastilla + 6,
      { width: anchoPastilla, align: 'center', lineBreak: false })
    doc.y = yPastilla + 22
  }

  // Firma de marca al pie de la portada.
  const yPie = ALTO_PAGINA - 70
  doc.save().moveTo((ANCHO_PAGINA - 200) / 2, yPie).lineTo((ANCHO_PAGINA + 200) / 2, yPie)
    .lineWidth(0.75).strokeColor(CIAN).stroke().restore()
  doc.font('Helvetica').fontSize(9).fillColor(CLARO)
    .text(LEMA_PIE, MARGEN, yPie + 8, { width: ANCHO_TEXTO, align: 'center', lineBreak: false })
}

/** Cintillo de cabecera de una página de contenido (imagen a sangre, o vector). */
export function dibujarCintillo(doc, marca) {
  if (marca.cintillo) {
    /*
     * La imagen es más ancha que alta: a todo el ancho de página su alto
     * natural es mayor que `ALTO_CINTILLO`. Se dibuja a su escala natural
     * —nunca se aplasta, eso distorsionaría el logo— y se recorta con
     * `clip()` a la franja que sí cabe, centrada verticalmente para no
     * perder el logo si queda más arriba o más abajo del centro.
     *
     * El alto natural sale de los píxeles REALES del archivo (`dimensionesPng`),
     * no de un número de comentario: `cintillo.png` cambió de 1276×189 a
     * 1022×251 sin que nada en el código se enterara hasta que se midió a
     * mano el 14-09-2026 — la franja llevaba tiempo mal centrada.
     */
    const dim = dimensionesPng(marca.cintillo)
    const altoNatural = dim ? ANCHO_PAGINA * (dim.alto / dim.ancho) : ALTO_CINTILLO
    doc.save()
    doc.rect(0, 0, ANCHO_PAGINA, ALTO_CINTILLO).clip()
    /* La imagen ABIERTA una vez (`sellarPaginas`), no el buffer: pdfkit sólo
       reutiliza una imagen si le llega el mismo objeto; con el buffer incrusta
       una copia del PNG por página (Plan 44 F3, medido: 358 KB × páginas). */
    doc.image(marca.cintilloAbierto ?? marca.cintillo, 0, (ALTO_CINTILLO - altoNatural) / 2, { width: ANCHO_PAGINA })
    doc.restore()
    return
  }
  doc.save()
  doc.rect(0, 0, ANCHO_PAGINA, ALTO_CINTILLO).fill(AZUL)
  doc.rect(0, ALTO_CINTILLO - 3, ANCHO_PAGINA, 3).fill(CIAN)
  doc.font('Helvetica-Bold').fontSize(15).fillColor(CLARO)
    .text('TDCON III.0', ANCHO_PAGINA - MARGEN - 200, ALTO_CINTILLO / 2 - 9,
      { width: 200, align: 'right', lineBreak: false })
  doc.restore()
}

/** Pie con el folio (trazabilidad) a la izquierda y el número de página a la derecha. */
export function dibujarPie(doc, etq, numero, total, folio) {
  const y = ALTO_PAGINA - 40
  doc.save()
  doc.moveTo(MARGEN, y).lineTo(ANCHO_PAGINA - MARGEN, y).lineWidth(0.75).strokeColor(CIAN).stroke()
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
    .text(folio ? `${etq.folioPie} ${folio}` : LEMA_PIE, MARGEN, y + 6,
      { width: 320, align: 'left', lineBreak: false })
  doc.text(etq.paginaDe(numero, total), ANCHO_PAGINA - MARGEN - 160, y + 6,
    { width: 160, align: 'right', lineBreak: false })
  doc.restore()
}

/** Estampa cintillo y pie en todas las páginas de contenido (la 0 es portada). */
export function sellarPaginas(doc, marca, etq, folio) {
  const rango = doc.bufferedPageRange()
  const total = rango.count - 1 // sin contar la portada
  /*
   * ── EL CINTILLO SE INCRUSTA UNA VEZ, NO UNA POR PÁGINA ──────────────
   *
   * `doc.image(buffer)` abre y registra el PNG cada vez que se llama: un
   * reporte de ocho páginas llevaba ocho copias de 358 KB del mismo cintillo
   * (medido el 23-09-2026: 4,4 MB un técnico de la espejo). Abrirlo aquí una
   * vez y pasar el objeto hace que pdfkit lo referencie desde cada página.
   */
  const marcaSellado = marca.cintillo ? { ...marca, cintilloAbierto: doc.openImage(marca.cintillo) } : marca
  for (let i = 1; i < rango.count; i++) {
    doc.switchToPage(rango.start + i)
    sinPaginacion(doc, () => {
      dibujarCintillo(doc, marcaSellado)
      dibujarPie(doc, etq, i, total, folio)
    })
  }
}

/** Título de sección: barra cian + texto marino. Deja el cursor listo debajo. */
export function tituloSeccion(doc, texto) {
  doc.moveDown(0.4)
  const y = doc.y
  doc.save().rect(MARGEN, y + 2, 4, 12).fill(CIAN).restore()
  doc.font('Helvetica-Bold').fontSize(13).fillColor(AZUL)
    .text(texto, MARGEN + 10, y, { width: ANCHO_TEXTO - 10 })
  doc.x = MARGEN
  doc.font('Helvetica').fontSize(10.5).fillColor(TEXTO)
  doc.moveDown(0.3)
}

/** Recuadro suave con borde cian, para el comentario del asistente. */
export function cajaResumen(doc, texto) {
  const w = ANCHO_TEXTO
  doc.font('Helvetica').fontSize(10.5).fillColor(TEXTO)
  const alto = doc.heightOfString(texto, { width: w - 24 }) + 18
  if (doc.y + alto > LIMITE_INFERIOR) doc.addPage()
  const y = doc.y
  doc.save()
  doc.roundedRect(MARGEN, y, w, alto, 4).fill(CAJA_SUAVE)
  doc.rect(MARGEN, y, 4, alto).fill(CIAN)
  doc.restore()
  doc.fillColor(TEXTO).font('Helvetica').fontSize(10.5)
    .text(texto, MARGEN + 14, y + 9, { width: w - 24 })
  doc.x = MARGEN
  doc.y = y + alto
  doc.moveDown(0.6)
}

/** Color según el estado de una señal, por palabras clave. */
/** Color por CLAVE de estado, la del dominio (`shared/eva/tanque/estado.js`). */
export const COLOR_POR_CLAVE = Object.freeze({
  critico: '#C0392B',
  atencion: '#C07A00',
  nominal: '#1E7E34',
  reposo: GRIS,
  sin_dato: GRIS,
})

/**
 * El color de una fila de la tabla de valores actuales.
 *
 * ── POR LA CLAVE, Y SÓLO DE RESPALDO POR LAS PALABRAS (B11, 22-09-2026) ──
 *
 * Hasta hoy el color se decidía buscando «crit», «ok» o «normal» dentro del
 * texto del estado. Las etiquetas del dominio son «Fuera de límite», «En
 * aviso», «En banda», «Sin dato»: la primera y la tercera no casaban con
 * ningún patrón y salían en GRIS, igual que «sin criterio». Un PDF que pinta
 * gris una señal fuera de límite es peor que uno sin color.
 *
 * La fila lleva ahora `clave` —`critico`, `atencion`, `nominal`…— además de
 * la etiqueta, y el color sale de ahí. El texto libre queda sólo para filas
 * que llegan sin clave (las que arma otro código o un idioma que no conoce
 * las etiquetas), y ahí las palabras siguen siendo lo único que hay.
 *
 * Exportada para poder probarla sin dibujar un PDF.
 */
export function colorDeFila(fila) {
  if (fila && typeof fila === 'object' && fila.clave && COLOR_POR_CLAVE[fila.clave]) {
    return COLOR_POR_CLAVE[fila.clave]
  }
  return colorEstado(typeof fila === 'object' && fila ? fila.estado : fila)
}

export function colorEstado(estado = '') {
  const e = String(estado).toLowerCase()
  if (/(crit|alarm|daño|dano|peligro|zona d|fuera de l)/.test(e)) return '#C0392B'
  if (/(aten|aviso|advert|borde|zona c)/.test(e)) return '#C07A00'
  if (/(ok|normal|nueva|admisible|buena|sano|bien|zona a|zona b|en banda)/.test(e)) return '#1E7E34'
  return GRIS
}


/**
 * Un bloque de gráfica: título, el SVG de la serie, y debajo el resumen
 * numérico, la cobertura si no es completa, y la interpretación en código.
 *
 * Entra entero o pasa entero a la página siguiente: nunca a medias. Y tras
 * dibujar el SVG, `doc.y` se fija al alto REAL del gráfico, porque `SVGtoPDF`
 * no mueve el cursor (ver la cabecera de `reporte.mjs`). Vivía inline en
 * `componerReportePdf`; se sacó para que las plantillas del Plan 44 dibujen
 * la misma gráfica que el catálogo.
 *
 * @param {{titulo: string, unidad: string|null, svg: string|null, resumen: object|null,
 *   cobertura: {diasLeidos: number, diasTotal: number, completa: boolean}|null,
 *   interpretacion: string|null, nota: string|null}} grafico
 */
export function dibujarGrafico(doc, grafico, etq) {
  if (doc.y + ALTO_BLOQUE_GRAFICO > LIMITE_INFERIOR) doc.addPage()

  doc.font('Helvetica-Bold').fontSize(12).fillColor(AZUL)
    .text(grafico.titulo, MARGEN, doc.y, { width: ANCHO_TEXTO })
  doc.moveDown(0.3)

  const yGrafico = doc.y
  if (grafico.svg) {
    SVGtoPDF(doc, grafico.svg, MARGEN, yGrafico, {
      width: ANCHO_GRAFICO,
      height: ALTO_GRAFICO,
      preserveAspectRatio: 'xMidYMid meet',
    })
  }
  doc.y = yGrafico + ALTO_GRAFICO + 8

  doc.font('Helvetica').fontSize(10).fillColor(GRIS)
  if (grafico.resumen) {
    const r = grafico.resumen
    const unidad = grafico.unidad ? ` ${grafico.unidad}` : ''
    doc.text(etq.resumenGrafico(r, unidad), MARGEN, doc.y, { width: ANCHO_TEXTO })
    /* La cobertura va JUNTO al promedio: es lo que dice si ese promedio se
       puede leer como el del período (Plan 21 F7). */
    if (grafico.cobertura && !grafico.cobertura.completa) {
      doc.fillColor('#9A6410').text(etq.coberturaParcial(grafico.cobertura), MARGEN, doc.y, { width: ANCHO_TEXTO })
      doc.fillColor(GRIS)
    }
    if (grafico.interpretacion) doc.text(grafico.interpretacion, MARGEN, doc.y, { width: ANCHO_TEXTO })
  } else if (grafico.nota) {
    doc.text(grafico.nota, MARGEN, doc.y, { width: ANCHO_TEXTO })
  }
  doc.fillColor(TEXTO)
  doc.x = MARGEN
  doc.moveDown()
}

/* ── Andamio común de documento ───────────────────────────────────── */
export function nuevoDocumento() {
  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: MARGEN_SUP, bottom: MARGEN_INF, left: MARGEN, right: MARGEN },
  })
  const trozos = []
  doc.on('data', trozo => trozos.push(trozo))
  const cerrado = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)))
    doc.on('error', reject)
  })
  return { doc, cerrado }
}
