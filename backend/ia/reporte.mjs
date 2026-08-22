/**
 * Composición del PDF de `generar_reporte` (Plan 14 Fase 5).
 *
 * Este módulo importa `pdfkit` y `svg-to-pdfkit` en la cabecera, y eso SÍ es
 * correcto aquí —al contrario que en `herramientas.mjs`—: el archivo entero
 * sólo se carga con `await import('./reporte.mjs')` desde dentro de la
 * herramienta, nunca desde el arranque del backend. Si las dependencias no
 * están instaladas, ese `import()` falla y `herramientas.mjs` lo captura sin
 * tumbar el proceso — es la misma lección que dejó `chartjs-node-canvas`.
 */
import PDFDocument from 'pdfkit'
import SVGtoPDF from 'svg-to-pdfkit'

const MARGEN = 50
const ANCHO_GRAFICO = 495 // A4 (595pt) menos los dos márgenes

/**
 * @param {object} datos
 * @param {string} datos.instalacion
 * @param {string} datos.periodo Etiqueta ya resuelta, ej. "los últimos 8 días".
 * @param {string} datos.generadoEl Fecha/hora local, legible.
 * @param {{titulo: string, unidad: string|null, svg: string, resumen: object|null, nota: string|null}[]} datos.graficos
 * @param {{senal: string, valor: number|string|null, unidad: string|null, estado: string}[]} datos.tablaActual
 * @param {string[]} datos.notas
 * @returns {Promise<Buffer>}
 */
export async function componerReportePdf({
  instalacion,
  periodo,
  generadoEl,
  graficos,
  tablaActual,
  notas,
}) {
  const doc = new PDFDocument({ margin: MARGEN, size: 'A4' })
  const trozos = []
  doc.on('data', trozo => trozos.push(trozo))
  const cerrado = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)))
    doc.on('error', reject)
  })

  doc.fontSize(20).text(instalacion, { align: 'left' })
  doc.fontSize(12).fillColor('#555').text(`Período: ${periodo}`)
  doc.text(`Generado el: ${generadoEl}`)
  doc.fillColor('#000')
  doc.moveDown()

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
    if (doc.y > doc.page.height - 320) doc.addPage()

    doc.fontSize(14).text(grafico.titulo, { underline: true })
    doc.moveDown(0.3)

    if (grafico.svg) {
      SVGtoPDF(doc, grafico.svg, MARGEN, doc.y, { width: ANCHO_GRAFICO, preserveAspectRatio: 'xMidYMid meet' })
      doc.y += 260 // alto real del SVG (320) menos lo que SVGtoPDF ya desplazó de sobra
    }

    doc.fontSize(10).fillColor('#555')
    if (grafico.resumen) {
      const r = grafico.resumen
      const unidad = grafico.unidad ? ` ${grafico.unidad}` : ''
      doc.text(
        `Mínimo ${r.minimo}${unidad} · Máximo ${r.maximo}${unidad} · Promedio ${r.promedio}${unidad} ` +
          `· ${r.muestras} muestras`
      )
    } else if (grafico.nota) {
      doc.text(grafico.nota)
    }
    doc.fillColor('#000')
    doc.moveDown()
  }

  if (notas.length) {
    if (doc.y > doc.page.height - 150) doc.addPage()
    doc.fontSize(11).fillColor('#a33')
    doc.text('Notas', { underline: true })
    for (const nota of notas) doc.text(`• ${nota}`)
    doc.fillColor('#000')
  }

  doc.end()
  return cerrado
}
