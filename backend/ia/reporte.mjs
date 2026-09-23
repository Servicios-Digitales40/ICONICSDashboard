/**
 * Composición del PDF de `generar_reporte` y del export de conversación,
 * con la identidad de marca TDCON III.0 (Plan 14 Fase 5; portada y marca añadidas
 * el 09-09-2026).
 *
 * Este módulo (a través de `reportes/lienzo.mjs`) importa `pdfkit` y
 * `svg-to-pdfkit` en la cabecera, y eso SÍ es correcto aquí —al contrario que
 * en `herramientas.mjs`—: el archivo entero sólo se carga con
 * `await import('./reporte.mjs')` desde dentro de la herramienta, nunca desde
 * el arranque del backend. Si las dependencias no están instaladas, ese
 * `import()` falla y `herramientas.mjs` lo captura sin tumbar el proceso — es
 * la misma lección que dejó `chartjs-node-canvas`.
 *
 * ── LAS PRIMITIVAS VIVEN EN `reportes/lienzo.mjs` (Plan 44 F1) ──────
 *
 * La marca (`ia/marca/`, tolerante a que falte una pieza), la portada, el
 * cintillo, el pie, los títulos de sección y la caja de resumen se sacaron a
 * `reportes/lienzo.mjs` tal cual, para que las ocho plantillas del Plan 44
 * (`reportes/compositor.mjs`) dibujen con las mismas medidas y la misma
 * marca que este archivo. Aquí quedan las DOS composiciones que ya existían
 * —el catálogo de una máquina y la conversación exportada— y la síntesis en
 * código que las encabeza. Ninguna cambió con el traslado.
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

import { etiquetasDeReporte } from './i18n/etiquetasReporte.mjs'

import {
  MARGEN,
  ANCHO_PAGINA,
  LIMITE_INFERIOR,
  ANCHO_TEXTO,
  AZUL,
  CIAN,
  TEXTO,
  GRIS,
  cargarMarca,
  generarFolio,
  sinPaginacion,
  dibujarPortada,
  sellarPaginas,
  tituloSeccion,
  cajaResumen,
  colorDeFila,
  nuevoDocumento,
  dibujarGrafico,
} from './reportes/lienzo.mjs'

/* Exportada desde aquí también: `test/reporte-color.test.mjs` la prueba por esta ruta. */
export { colorDeFila } from './reportes/lienzo.mjs'

/**
 * Síntesis en una frase, CALCULADA EN CÓDIGO a partir de lo que ya trae el
 * reporte — nunca depende de que el modelo escriba nada.
 *
 * Nació porque el "Resumen del asistente" sólo aparece si el modelo pasa
 * `explicacion`, y el modelo pequeño a menudo no la escribe: el reporte salía
 * sin una sola línea que lo resumiera. Esto garantiza que SIEMPRE haya un
 * arranque legible, y además es honesto cuando el historiador está caído: dice
 * cuántos gráficos se quedaron sin muestras en vez de callarlo.
 */
function sintesisAutomatica(tablaActual, graficos, idioma = 'es') {
  const partes = []
  if (tablaActual?.length) {
    /* Por clave cuando la fila la trae (B11); por palabras sólo si no. */
    const fuera = tablaActual.filter((f) =>
      f.clave ? f.clave === 'critico' || f.clave === 'atencion'
        : /crit|alarm|daño|dano|aten|aviso|zona c|zona d|fuera de l/i.test(String(f.estado))
    ).length
    const sinDato = tablaActual.filter((f) => f.valor === null || f.valor === undefined || /sin dato/i.test(String(f.estado))).length
    /*
     * «Todas en banda» sólo se puede afirmar de las filas que TIENEN criterio.
     * Una máquina configurada trae señales sin banda declarada (el variador,
     * los contadores, un nombre de equipo): su estado es «—», y decir de ellas
     * que están en banda sería afirmar algo que nadie evaluó (Plan 39 F4).
     */
    const sinCriterio = tablaActual.filter((f) => !f.estado || f.estado === '—').length
    const conCriterio = tablaActual.length - sinCriterio
    const banda = fuera
      ? (idioma === 'en' ? `, ${fuera} out of band` : `, ${fuera} fuera de banda`)
      : conCriterio
        ? (idioma === 'en'
          ? (sinCriterio ? `, the ${conCriterio} with a band criterion are in band` : ', all in band')
          : (sinCriterio ? `, las ${conCriterio} con criterio de banda están en banda` : ', todas en banda'))
        : ''
    partes.push(
      idioma === 'en'
        ? `${tablaActual.length} signal(s) with a current value` +
          banda +
          (sinCriterio ? `, ${sinCriterio} with no band criterion` : '') +
          (sinDato ? `, ${sinDato} with no data` : '')
        : `${tablaActual.length} señal(es) con valor actual` +
          banda +
          (sinCriterio ? `, ${sinCriterio} sin criterio de banda` : '') +
          (sinDato ? `, ${sinDato} sin dato` : '')
    )
  }
  if (graficos?.length) {
    const conSerie = graficos.filter((g) => g.svg).length
    const sinSerie = graficos.length - conSerie
    partes.push(
      idioma === 'en'
        ? `${conSerie} of ${graficos.length} chart(s) with historical data` +
          (sinSerie ? `; ${sinSerie} with no samples in this period` : '')
        : `${conSerie} de ${graficos.length} gráfico(s) con serie histórica` +
          (sinSerie ? `; ${sinSerie} sin muestras en el período` : '')
    )
  }
  return partes.length ? `${partes.join('. ')}.` : null
}

/**
 * @param {object} datos
 * @param {string} datos.instalacion
 * @param {string} datos.periodo Etiqueta ya resuelta, ej. "los últimos 8 días".
 * @param {string} datos.generadoEl Fecha/hora local, legible.
 * @param {{titulo: string, unidad: string|null, svg: string, resumen: object|null, tendencia: object|null, interpretacion: string|null, cobertura: object|null, nota: string|null}[]} datos.graficos
 * @param {{senal: string, valor: number|string|null, unidad: string|null, estado: string}[]} datos.tablaActual
 * @param {string[]} datos.notas
 * @param {string|null} [datos.explicacion] Comentario del MODELO, aparte de `interpretacion`.
 * @param {"es"|"en"} [datos.idioma] El del tablero (i18n del asistente, F4). El PDF
 *   se cierra antes de que el modelo escriba nada, así que este idioma llega
 *   por el llamador —`generar_reporte`—, no por el prompt.
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
  idioma = 'es',
}) {
  const etq = etiquetasDeReporte(idioma)
  const folioFinal = folio || generarFolio()
  const { doc, cerrado } = nuevoDocumento()
  const marca = cargarMarca()

  sinPaginacion(doc, () => dibujarPortada(doc, marca, etq, {
    titulo: etq.reporteTitulo,
    subtitulo: etq.reporteSubtitulo,
    instalacion,
    periodo,
    generadoEl,
    folio: folioFinal,
  }))

  doc.addPage() // primera página de contenido

  // Síntesis SIEMPRE presente, hecha en código: no depende de que el modelo
  // escriba nada. Ver `sintesisAutomatica`.
  const sintesis = sintesisAutomatica(tablaActual, graficos, idioma)
  if (sintesis) {
    tituloSeccion(doc, etq.seccionSintesis)
    cajaResumen(doc, sintesis)
  }

  // Comentario del MODELO, si lo hay — distinto de `interpretacion`, que pone
  // el propio backend en cada gráfico más abajo. Con su procedencia dicha,
  // para no dejar que se lea como si fuera una cifra medida.
  if (explicacion) {
    tituloSeccion(doc, etq.seccionResumenAsistente)
    cajaResumen(doc, explicacion)
  }

  if (tablaActual.length) {
    tituloSeccion(doc, etq.seccionValoresActuales)

    // Encabezado de columnas.
    let yFila = doc.y
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GRIS)
    doc.text(etq.colSenal, MARGEN + 14, yFila, { width: 250, lineBreak: false })
    doc.text(etq.colValor, MARGEN + 270, yFila, { width: 110, lineBreak: false })
    doc.text(etq.colEstado, MARGEN + 385, yFila, { width: ANCHO_TEXTO - 385, align: 'right', lineBreak: false })
    doc.y = yFila + 15
    doc.save().moveTo(MARGEN, doc.y - 3).lineTo(ANCHO_PAGINA - MARGEN, doc.y - 3)
      .lineWidth(0.5).strokeColor('#D5DEEA').stroke().restore()

    for (const fila of tablaActual) {
      if (doc.y + 16 > LIMITE_INFERIOR) doc.addPage()
      yFila = doc.y
      const valor = fila.valor === null || fila.valor === undefined ? etq.sinDato : fila.valor
      const unidad = fila.unidad ? ` ${fila.unidad}` : ''
      const col = colorDeFila(fila)

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

  if (graficos.length) tituloSeccion(doc, etq.seccionTendencias)
  /* Cada bloque —título, gráfico, resumen, cobertura, interpretación— lo
     dibuja `dibujarGrafico` (lienzo): entra entero o pasa entero de página,
     y la cobertura va junto al promedio, no en una nota al pie (Plan 21 F7). */
  for (const grafico of graficos) dibujarGrafico(doc, grafico, etq)

  if (notas.length) {
    const altoNotas = 24 + notas.length * 14
    if (doc.y + altoNotas > LIMITE_INFERIOR) doc.addPage()
    tituloSeccion(doc, etq.seccionNotasYAvisos)
    doc.font('Helvetica').fontSize(10).fillColor(TEXTO)
    for (const nota of notas) doc.text(`•  ${nota}`, MARGEN, doc.y, { width: ANCHO_TEXTO })
  }

  sellarPaginas(doc, marca, etq, folioFinal)
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
 * @param {"es"|"en"} [datos.idioma] El del tablero en el momento de exportar
 *   (i18n del asistente, F4) — lo manda `POST /api/chat/exportar`, no viaja
 *   con cada turno: los turnos que ya están en el idioma anterior no se
 *   retraducen, sólo la plantilla del documento (título, «Operador»/«Asistente»).
 * @returns {Promise<Buffer>}
 */
export async function componerConversacionPdf({ instalacion, generadoEl, turnos, folio, idioma = 'es' }) {
  const etq = etiquetasDeReporte(idioma)
  const folioFinal = folio || generarFolio()
  const { doc, cerrado } = nuevoDocumento()
  const marca = cargarMarca()

  sinPaginacion(doc, () => dibujarPortada(doc, marca, etq, {
    titulo: etq.conversacionTitulo,
    subtitulo: etq.conversacionSubtitulo,
    instalacion,
    periodo: null,
    generadoEl,
    folio: folioFinal,
  }))

  doc.addPage()

  for (const turno of turnos) {
    const esUsuario = turno.rol === 'usuario'
    doc.font('Helvetica-Bold').fontSize(11).fillColor(esUsuario ? CIAN : AZUL)
      .text(esUsuario ? etq.rolOperador : etq.rolAsistente, MARGEN, doc.y, { width: ANCHO_TEXTO })
    doc.font('Helvetica').fontSize(10.5).fillColor(TEXTO)
      .text(turno.texto, MARGEN, doc.y, { width: ANCHO_TEXTO, align: 'left' })
    doc.moveDown()
  }

  sellarPaginas(doc, marca, etq, folioFinal)
  doc.end()
  return cerrado
}
