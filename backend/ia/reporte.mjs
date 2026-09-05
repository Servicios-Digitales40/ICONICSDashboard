/**
 * Composición del PDF de `generar_reporte` (Plan 14 Fase 5).
 *
 * Este módulo importa `pdfkit` y `svg-to-pdfkit` en la cabecera, y eso SÍ es
 * correcto aquí —al contrario que en `herramientas.mjs`—: el archivo entero
 * sólo se carga con `await import('./reporte.mjs')` desde dentro de la
 * herramienta, nunca desde el arranque del backend. Si las dependencias no
 * están instaladas, ese `import()` falla y `herramientas.mjs` lo captura sin
 * tumbar el proceso — es la misma lección que dejó `chartjs-node-canvas`.
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
import PDFDocument from 'pdfkit'
import SVGtoPDF from 'svg-to-pdfkit'

const MARGEN = 50
const ANCHO_PAGINA = 595.28 // A4 en puntos
const ALTO_PAGINA = 841.89
const ANCHO_GRAFICO = ANCHO_PAGINA - MARGEN * 2

/** El SVG de `renderizarGraficoSerie` es siempre 640×320: mismo ratio aquí. */
const ALTO_GRAFICO = Math.round(ANCHO_GRAFICO * (320 / 640))

const RESERVA_TITULO = 24
// El resumen numérico más la frase de interpretación, que puede envolver a
// una segunda línea si la señal no tiene unidad corta.
const RESERVA_RESUMEN = 52
const RESERVA_ENTRE_BLOQUES = 14
const ALTO_BLOQUE_GRAFICO = RESERVA_TITULO + ALTO_GRAFICO + RESERVA_RESUMEN + RESERVA_ENTRE_BLOQUES

/**
 * @param {object} datos
 * @param {string} datos.instalacion
 * @param {string} datos.periodo Etiqueta ya resuelta, ej. "los últimos 8 días".
 * @param {string} datos.generadoEl Fecha/hora local, legible.
 * @param {{titulo: string, unidad: string|null, svg: string, resumen: object|null, tendencia: object|null, interpretacion: string|null, cobertura: object|null, nota: string|null}[]} datos.graficos
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
}) {
  const doc = new PDFDocument({ margin: MARGEN, size: 'A4' })
  const trozos = []
  doc.on('data', trozo => trozos.push(trozo))
  const cerrado = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)))
    doc.on('error', reject)
  })

  doc.fontSize(20).fillColor('#000').text(instalacion, { align: 'left' })
  doc.fontSize(12).fillColor('#555').text(`Período: ${periodo}`)
  doc.text(`Generado el: ${generadoEl}`)
  doc.fillColor('#000')
  doc.moveDown()

  // Comentario del MODELO, si lo hay — distinto de `interpretacion`, que pone
  // el propio backend en cada gráfico más abajo. Con su procedencia dicha,
  // para no dejar que se lea como si fuera una cifra medida.
  if (explicacion) {
    doc.fontSize(11).fillColor('#333').text('Comentario del asistente', { underline: true })
    doc.fontSize(10.5).fillColor('#000').text(explicacion)
    doc.moveDown()
  }

  if (tablaActual.length) {
    doc.fontSize(14).text('Valores actuales (sin serie histórica)', { underline: true })
    doc.moveDown(0.5)
    doc.fontSize(11)
    for (const fila of tablaActual) {
      const valor = fila.valor === null || fila.valor === undefined ? 'sin dato' : fila.valor
      const unidad = fila.unidad ? ` ${fila.unidad}` : ''
      doc.text(`${fila.senal}: ${valor}${unidad} — ${fila.estado}`)
    }
    doc.moveDown()
  }

  for (const grafico of graficos) {
    // Todo el bloque —título, gráfico, resumen— entra junto o se pasa
    // entero a la siguiente página. Nunca a medias.
    if (doc.y + ALTO_BLOQUE_GRAFICO > ALTO_PAGINA - MARGEN) doc.addPage()

    doc.fontSize(14).fillColor('#000').text(grafico.titulo, { underline: true })
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

    doc.fontSize(10).fillColor('#555')
    if (grafico.resumen) {
      const r = grafico.resumen
      const unidad = grafico.unidad ? ` ${grafico.unidad}` : ''
      doc.text(
        `Mínimo ${r.minimo}${unidad} · Máximo ${r.maximo}${unidad} · Promedio ${r.promedio}${unidad} ` +
          `· ${r.muestras} muestras`
      )
      /*
       * La cobertura va JUNTO al promedio y no en una nota al pie, porque es
       * lo que dice si ese promedio se puede leer como el del período. Un
       * rango de diez días con cinco vacíos da un promedio real de cinco días
       * presentado como el de diez.
       */
      if (grafico.cobertura && !grafico.cobertura.completa) {
        doc.fillColor('#9A6410').text(
          `Sólo ${grafico.cobertura.diasLeidos} de los ${grafico.cobertura.diasTotal} días del ` +
            'rango tienen registro en el historiador: estas cifras son de esos días, no del ' +
            'período entero.'
        )
        doc.fillColor('#555')
      }
      if (grafico.interpretacion) doc.text(grafico.interpretacion)
    } else if (grafico.nota) {
      doc.text(grafico.nota)
    }
    doc.fillColor('#000')
    doc.moveDown()
  }

  if (notas.length) {
    const altoNotas = 24 + notas.length * 14
    if (doc.y + altoNotas > ALTO_PAGINA - MARGEN) doc.addPage()
    doc.fontSize(11).fillColor('#a33').text('Notas', { underline: true })
    doc.fontSize(10)
    for (const nota of notas) doc.text(`• ${nota}`)
    doc.fillColor('#000')
  }

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
export async function componerConversacionPdf({ instalacion, generadoEl, turnos }) {
  const doc = new PDFDocument({ margin: MARGEN, size: 'A4' })
  const trozos = []
  doc.on('data', trozo => trozos.push(trozo))
  const cerrado = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)))
    doc.on('error', reject)
  })

  doc.fontSize(20).fillColor('#000').text(instalacion, { align: 'left' })
  doc.fontSize(12).fillColor('#555').text('Conversación con el asistente')
  doc.text(`Generado el: ${generadoEl}`)
  doc.fillColor('#000')
  doc.moveDown()

  for (const turno of turnos) {
    const esUsuario = turno.rol === 'usuario'
    doc
      .fontSize(11)
      .fillColor(esUsuario ? '#1a5fb4' : '#333')
      .text(esUsuario ? 'Operador' : 'Asistente', { underline: true })
    doc.fontSize(10.5).fillColor('#000').text(turno.texto, { align: 'left' })
    doc.moveDown()
  }

  doc.end()
  return cerrado
}
