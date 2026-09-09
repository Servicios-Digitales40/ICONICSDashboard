/**
 * Composición del PDF de `generar_reporte` y del export de conversación,
 * con la identidad de marca TDCON III.0 (Plan 14 Fase 5; portada y marca añadidas
 * el 09-09-2026).
 *
 * Este módulo importa `pdfkit` y `svg-to-pdfkit` en la cabecera, y eso SÍ es
 * correcto aquí —al contrario que en `herramientas.mjs`—: el archivo entero
 * sólo se carga con `await import('./reporte.mjs')` desde dentro de la
 * herramienta, nunca desde el arranque del backend. Si las dependencias no
 * están instaladas, ese `import()` falla y `herramientas.mjs` lo captura sin
 * tumbar el proceso — es la misma lección que dejó `chartjs-node-canvas`.
 *
 * ── LA MARCA VIVE EN `ia/marca/`, Y SU AUSENCIA NO TRUENA ────────────
 *
 * La portada usa tres imágenes —`portada-fondo.png`, `banner.png` (con fondo
 * transparente) y `cintillo.png`— que se leen de `ia/marca/`. Si alguna falta,
 * el reporte se genera IGUAL sin esa pieza (fondo azul liso, sin banner, o
 * cintillo dibujado en vectores): la regla de la casa es «lo que falta se dice,
 * no se finge», y aquí eso significa que un reporte nunca deja de salir por no
 * encontrar un logo. Los PNG tienen que ser PNG de verdad —pdfkit no lee WebP—.
 *
 * ── POR QUÉ `bufferPages` Y EL SELLADO AL FINAL ─────────────────────
 *
 * El cintillo de cabecera y el pie con «Página X de Y» se estampan al final,
 * recorriendo las páginas ya escritas (`bufferPageRange` + `switchToPage`), y
 * NO en un `pageAdded`. Es la única forma de poner el TOTAL de páginas en el
 * pie —no se sabe hasta que el contenido terminó— y de saltarse la PORTADA,
 * que no lleva cintillo. El contenido se escribe con un margen superior que
 * deja libre la franja del cintillo, así que estamparlo después nunca pisa
 * texto. La portada se dibuja con coordenadas absolutas, ignorando el margen.
 *
 * ── POR QUÉ EL LAYOUT NUNCA CONFÍA EN QUE `doc.y` "YA ESTÁ BIEN" ──────
 *
 * `SVGtoPDF(doc, svg, x, y, …)` dibuja en las coordenadas `x, y` que se le
 * pasan, PERO NO TOCA `doc.y`: para pdfkit, el cursor del flujo de texto no
 * se ha movido. La primera versión de este archivo compensaba a mano con
 * `doc.y += 260`, un número inventado que no coincidía con la altura real
 * del gráfico ni con el margen inferior de la página — así que el siguiente
 * `doc.text()` podía disparar la paginación AUTOMÁTICA de pdfkit (por
 * desbordar el margen) mientras el gráfico ya se había dibujado en la
 * página anterior. Resultado: título, gráfico y resumen de una misma señal
 * repartidos en páginas distintas, o el resumen de una señal solapado con
 * el título de la siguiente.
 *
 * La regla aquí es: antes de dibujar un bloque (título + gráfico + resumen)
 * se calcula su alto exacto y se decide la página ENTERA de una vez; y tras
 * dibujar el SVG, `doc.y` se fija a mano al alto real del gráfico — nunca a
 * un número aproximado.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

import PDFDocument from 'pdfkit'
import SVGtoPDF from 'svg-to-pdfkit'

const MARGEN = 50
const ANCHO_PAGINA = 595.28 // A4 en puntos
const ALTO_PAGINA = 841.89

/* El cintillo (1276×189) se dibuja a sangre, así que su alto sale de su propia
 * proporción al ancho de página. El margen superior del contenido lo deja
 * libre; el inferior reserva sitio para el pie. */
const ALTO_CINTILLO = Math.round(ANCHO_PAGINA * (189 / 1276)) // ≈ 88
const MARGEN_SUP = ALTO_CINTILLO + 20
const MARGEN_INF = 56
const LIMITE_INFERIOR = ALTO_PAGINA - MARGEN_INF

const ANCHO_TEXTO = ANCHO_PAGINA - MARGEN * 2
const ANCHO_GRAFICO = ANCHO_TEXTO

/** El SVG de `renderizarGraficoSerie` es siempre 640×320: mismo ratio aquí. */
const ALTO_GRAFICO = Math.round(ANCHO_GRAFICO * (320 / 640))

const RESERVA_TITULO = 24
// El resumen numérico más la frase de interpretación, que puede envolver a
// una segunda línea si la señal no tiene unidad corta.
const RESERVA_RESUMEN = 52
const RESERVA_ENTRE_BLOQUES = 14
const ALTO_BLOQUE_GRAFICO = RESERVA_TITULO + ALTO_GRAFICO + RESERVA_RESUMEN + RESERVA_ENTRE_BLOQUES

/* ── Paleta de marca ──────────────────────────────────────────────── */
const AZUL = '#081838' // marino de portada y cabeceras (muestreado del cintillo TDCON)
const CIAN = '#2E9BE6' // acento azul-cian (muestreado del texto de marca, aclarado para contraste)
const CLARO = '#EAF2FB' // texto sobre azul
const CLARO_TENUE = '#9FB3CE' // texto secundario sobre azul
const TEXTO = '#1B2430' // cuerpo sobre blanco
const GRIS = '#7A8AA0' // texto apagado / pie
const CAJA_SUAVE = '#F1F6FC' // fondo del recuadro de resumen

const LEMA_PIE = 'TDCON III.0 · Tecnología, Desarrollo y Control 4.0'

/* ── Carga de la marca (tolerante a que falte) ────────────────────── */
const RUTA_MARCA = join(dirname(fileURLToPath(import.meta.url)), 'marca')

function leerMarca(nombre) {
  try {
    return readFileSync(join(RUTA_MARCA, nombre))
  } catch {
    return null // Falta la pieza: se dibuja el reemplazo en vectores.
  }
}

function cargarMarca() {
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
function generarFolio(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  const ymd = `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}`
  const cola = randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()
  return `TDCON-${ymd}-${cola}`
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
function sinPaginacion(doc, fn) {
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
function dibujarPortada(doc, marca, { titulo, subtitulo, instalacion, periodo, generadoEl, folio }) {
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
      .text(`Generado el ${generadoEl}`, MARGEN, doc.y, { width: ANCHO_TEXTO, align: 'center' })
  }
  if (folio) {
    // El folio en una "pastilla" cian tenue, para que se lea como un dato de
    // trazabilidad y no como una línea más del subtítulo.
    doc.moveDown(0.9)
    doc.font('Helvetica-Bold').fontSize(10.5)
    const etiqueta = `FOLIO   ${folio}`
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
function dibujarCintillo(doc, marca) {
  if (marca.cintillo) {
    doc.image(marca.cintillo, 0, 0, { width: ANCHO_PAGINA })
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
function dibujarPie(doc, numero, total, folio) {
  const y = ALTO_PAGINA - 40
  doc.save()
  doc.moveTo(MARGEN, y).lineTo(ANCHO_PAGINA - MARGEN, y).lineWidth(0.75).strokeColor(CIAN).stroke()
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
    .text(folio ? `Folio ${folio}` : LEMA_PIE, MARGEN, y + 6, { width: 320, align: 'left', lineBreak: false })
  doc.text(`Página ${numero} de ${total}`, ANCHO_PAGINA - MARGEN - 160, y + 6,
    { width: 160, align: 'right', lineBreak: false })
  doc.restore()
}

/** Estampa cintillo y pie en todas las páginas de contenido (la 0 es portada). */
function sellarPaginas(doc, marca, folio) {
  const rango = doc.bufferedPageRange()
  const total = rango.count - 1 // sin contar la portada
  for (let i = 1; i < rango.count; i++) {
    doc.switchToPage(rango.start + i)
    sinPaginacion(doc, () => {
      dibujarCintillo(doc, marca)
      dibujarPie(doc, i, total, folio)
    })
  }
}

/** Título de sección: barra cian + texto marino. Deja el cursor listo debajo. */
function tituloSeccion(doc, texto) {
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
function cajaResumen(doc, texto) {
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
function colorEstado(estado = '') {
  const e = String(estado).toLowerCase()
  if (/(crit|alarm|daño|dano|peligro|zona d)/.test(e)) return '#C0392B'
  if (/(aten|aviso|advert|borde|zona c)/.test(e)) return '#C07A00'
  if (/(ok|normal|nueva|admisible|buena|sano|bien|zona a|zona b)/.test(e)) return '#1E7E34'
  return GRIS
}

/* ── Andamio común de documento ───────────────────────────────────── */
function nuevoDocumento() {
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

/**
 * @param {object} datos
 * @param {string} datos.instalacion
 * @param {string} datos.periodo Etiqueta ya resuelta, ej. "los últimos 8 días".
 * @param {string} datos.generadoEl Fecha/hora local, legible.
 * @param {{titulo: string, unidad: string|null, svg: string, resumen: object|null, tendencia: object|null, interpretacion: string|null, nota: string|null}[]} datos.graficos
 * @param {{senal: string, valor: number|string|null, unidad: string|null, estado: string}[]} datos.tablaActual
 * @param {string[]} datos.notas
 * @param {string|null} [datos.explicacion] Comentario del MODELO, aparte de `interpretacion`.
 * @returns {Promise<Buffer>}
 */
export async function componerReportePdf({
  instalacion,
  periodo,
  generadoEl,
  graficos,
  tablaActual,
  notas,
  explicacion,
  folio,
}) {
  const folioFinal = folio || generarFolio()
  const { doc, cerrado } = nuevoDocumento()
  const marca = cargarMarca()

  sinPaginacion(doc, () => dibujarPortada(doc, marca, {
    titulo: 'REPORTE TÉCNICO',
    subtitulo: 'Monitoreo y análisis de planta',
    instalacion,
    periodo,
    generadoEl,
    folio: folioFinal,
  }))

  doc.addPage() // primera página de contenido

  // Comentario del MODELO, si lo hay — distinto de `interpretacion`, que pone
  // el propio backend en cada gráfico más abajo. Con su procedencia dicha,
  // para no dejar que se lea como si fuera una cifra medida.
  if (explicacion) {
    tituloSeccion(doc, 'Resumen del asistente')
    cajaResumen(doc, explicacion)
  }

  if (tablaActual.length) {
    tituloSeccion(doc, 'Valores actuales (sin serie histórica)')

    // Encabezado de columnas.
    let yFila = doc.y
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GRIS)
    doc.text('SEÑAL', MARGEN + 14, yFila, { width: 250, lineBreak: false })
    doc.text('VALOR', MARGEN + 270, yFila, { width: 110, lineBreak: false })
    doc.text('ESTADO', MARGEN + 385, yFila, { width: ANCHO_TEXTO - 385, align: 'right', lineBreak: false })
    doc.y = yFila + 15
    doc.save().moveTo(MARGEN, doc.y - 3).lineTo(ANCHO_PAGINA - MARGEN, doc.y - 3)
      .lineWidth(0.5).strokeColor('#D5DEEA').stroke().restore()

    for (const fila of tablaActual) {
      if (doc.y + 16 > LIMITE_INFERIOR) doc.addPage()
      yFila = doc.y
      const valor = fila.valor === null || fila.valor === undefined ? 'sin dato' : fila.valor
      const unidad = fila.unidad ? ` ${fila.unidad}` : ''
      const col = colorEstado(fila.estado)

      doc.save().circle(MARGEN + 4, yFila + 6, 2.5).fill(col).restore()
      doc.font('Helvetica').fontSize(10.5).fillColor(TEXTO)
        .text(String(fila.senal), MARGEN + 14, yFila, { width: 250, lineBreak: false })
      doc.text(`${valor}${unidad}`, MARGEN + 270, yFila, { width: 110, lineBreak: false })
      doc.font('Helvetica-Bold').fillColor(col)
        .text(String(fila.estado), MARGEN + 385, yFila, { width: ANCHO_TEXTO - 385, align: 'right', lineBreak: false })
      doc.y = yFila + 16
    }
    doc.x = MARGEN
    doc.moveDown(0.6)
  }

  if (graficos.length) tituloSeccion(doc, 'Tendencias')
  for (const grafico of graficos) {
    // Todo el bloque —título, gráfico, resumen— entra junto o se pasa
    // entero a la siguiente página. Nunca a medias.
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
    // Fijado al alto REAL del gráfico, nunca a lo que haya dejado SVGtoPDF:
    // esa función no mueve `doc.y`, así que sin esto el siguiente texto se
    // escribiría encima del propio gráfico.
    doc.y = yGrafico + ALTO_GRAFICO + 8

    doc.font('Helvetica').fontSize(10).fillColor(GRIS)
    if (grafico.resumen) {
      const r = grafico.resumen
      const unidad = grafico.unidad ? ` ${grafico.unidad}` : ''
      doc.text(
        `Mínimo ${r.minimo}${unidad} · Máximo ${r.maximo}${unidad} · Promedio ${r.promedio}${unidad} ` +
          `· ${r.muestras} muestras`,
        MARGEN, doc.y, { width: ANCHO_TEXTO }
      )
      if (grafico.interpretacion) doc.text(grafico.interpretacion, MARGEN, doc.y, { width: ANCHO_TEXTO })
    } else if (grafico.nota) {
      doc.text(grafico.nota, MARGEN, doc.y, { width: ANCHO_TEXTO })
    }
    doc.fillColor(TEXTO)
    doc.moveDown()
  }

  if (notas.length) {
    const altoNotas = 24 + notas.length * 14
    if (doc.y + altoNotas > LIMITE_INFERIOR) doc.addPage()
    tituloSeccion(doc, 'Notas y avisos')
    doc.font('Helvetica').fontSize(10).fillColor(TEXTO)
    for (const nota of notas) doc.text(`•  ${nota}`, MARGEN, doc.y, { width: ANCHO_TEXTO })
  }

  sellarPaginas(doc, marca, folioFinal)
  doc.end()
  return cerrado
}

/**
 * PDF de una conversación completa con el asistente (botón «Exportar PDF»
 * del panel de chat).
 *
 * A diferencia de `componerReportePdf`, aquí el contenido es texto de
 * turnos, no gráficos SVG: no hay que fijar `doc.y` a mano tras dibujar un
 * SVG que no lo mueve —ver la cabecera de este archivo—, así que basta la
 * paginación AUTOMÁTICA de pdfkit entre un `doc.text()` y el siguiente.
 *
 * @param {object} datos
 * @param {string} datos.instalacion
 * @param {string} datos.generadoEl Fecha/hora local, legible.
 * @param {{rol: 'usuario'|'asistente', texto: string}[]} datos.turnos
 * @returns {Promise<Buffer>}
 */
export async function componerConversacionPdf({ instalacion, generadoEl, turnos, folio }) {
  const folioFinal = folio || generarFolio()
  const { doc, cerrado } = nuevoDocumento()
  const marca = cargarMarca()

  sinPaginacion(doc, () => dibujarPortada(doc, marca, {
    titulo: 'REPORTE DE CONVERSACIÓN',
    subtitulo: 'Diálogo con el asistente de planta',
    instalacion,
    periodo: null,
    generadoEl,
    folio: folioFinal,
  }))

  doc.addPage()

  for (const turno of turnos) {
    const esUsuario = turno.rol === 'usuario'
    doc.font('Helvetica-Bold').fontSize(11).fillColor(esUsuario ? CIAN : AZUL)
      .text(esUsuario ? 'Operador' : 'Asistente', MARGEN, doc.y, { width: ANCHO_TEXTO })
    doc.font('Helvetica').fontSize(10.5).fillColor(TEXTO)
      .text(turno.texto, MARGEN, doc.y, { width: ANCHO_TEXTO, align: 'left' })
    doc.moveDown()
  }

  sellarPaginas(doc, marca, folioFinal)
  doc.end()
  return cerrado
}
