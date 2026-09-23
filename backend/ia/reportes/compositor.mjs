/**
 * El compositor por bloques de los reportes por plantilla (Plan 44, D2).
 *
 * ── UN SOLO COMPOSITOR, OCHO PLANTILLAS ──────────────────────────────
 *
 * Las ocho maquetas que entregó el usuario (`docs/plantillas-reportes/`)
 * comparten una anatomía: portada con arte y «chips» de dato, y un cuerpo
 * hecho de seis tipos de bloque —tarjetas de indicador, tabla, gráfica,
 * cuadro de texto, lista y firmas—. Este archivo sabe dibujar esos bloques y
 * NADA del contenido: qué secciones lleva un reporte técnico y de dónde sale
 * cada cifra lo dice su plantilla (`plantillas/<tipo>.mjs`) y lo traen los
 * recolectores (`recolectores.mjs`). Añadir la novena plantilla es escribir
 * un módulo de datos, no tocar esto.
 *
 * ── LO QUE FALTA SE DIBUJA, NO SE OMITE (D3) ────────────────────────
 *
 * Una sección cuya fuente no existe en esta máquina llega con `ausente:
 * motivo` y se dibuja con su título y ese motivo, en gris. Una sección con
 * dato pero vacía (una tabla sin filas, una lista sin elementos) se trata
 * igual, con el texto genérico de `etq.sinDatos`. Nunca se rellena con el
 * ejemplo de la maqueta. El MANIFIESTO que devuelve esta función dice qué
 * secciones salieron con dato y cuáles no, para que la herramienta se lo
 * cuente al modelo y las pruebas lo afirmen sin leer el PDF (D8).
 *
 * ── LO QUE NO ESTÁ EN WinAnsi SE DIBUJA (D13) ───────────────────────
 *
 * Las maquetas usan ▲ y ▼ para la variación de un indicador. Helvetica, la
 * fuente estándar de pdfkit, no los tiene: saldrían como cuadrados. Aquí los
 * triángulos son polígonos. `·`, `—`, `°` y `%` sí están y se escriben.
 *
 * Importa `pdfkit` (vía `lienzo.mjs`) en la cabecera: sólo se carga con un
 * `await import()` desde dentro de la herramienta, igual que `reporte.mjs`.
 */
import { join } from 'node:path'

import {
  ALTO_BLOQUE_GRAFICO,
  ALTO_PAGINA,
  ANCHO_PAGINA,
  ANCHO_TEXTO,
  AZUL,
  CAJA_SUAVE,
  CIAN,
  CLARO,
  CLARO_TENUE,
  GRIS,
  LEMA_PIE,
  LIMITE_INFERIOR,
  MARGEN,
  TEXTO,
  cargarMarca,
  colorDeFila,
  dibujarGrafico,
  dimensionesPng,
  generarFolio,
  leerMarca,
  nuevoDocumento,
  sellarPaginas,
  sinPaginacion,
  tituloSeccion,
} from './lienzo.mjs'

/** Los tipos de bloque que este compositor sabe dibujar. */
export const BLOQUES = Object.freeze(['indicadores', 'tabla', 'graficas', 'texto', 'lista', 'firmas'])

const VERDE = '#1E7E34'
const ROJO = '#C0392B'

/* ── Portada ─────────────────────────────────────────────────────────── */

/** El arte de la portada de un tipo, o `null` si no está (la portada sale igual). */
export function cargarArte(nombre) {
  if (!nombre) return null
  const buffer = leerMarca(join('portadas', `${nombre}.png`))
  if (!buffer) return null
  const dim = dimensionesPng(buffer)
  return dim ? { buffer, ...dim } : null
}

function fondoAzul(doc, marca) {
  if (marca.fondo) {
    doc.image(marca.fondo, 0, 0, { cover: [ANCHO_PAGINA, ALTO_PAGINA] })
  } else {
    doc.save().rect(0, 0, ANCHO_PAGINA, ALTO_PAGINA).fill(AZUL).restore()
  }
  doc.save().fillColor(AZUL).fillOpacity(0.55).rect(0, 0, ANCHO_PAGINA, ALTO_PAGINA).fill().restore()
}

function pieDePortada(doc) {
  const yPie = ALTO_PAGINA - 70
  doc.save().moveTo((ANCHO_PAGINA - 200) / 2, yPie).lineTo((ANCHO_PAGINA + 200) / 2, yPie)
    .lineWidth(0.75).strokeColor(CIAN).stroke().restore()
  doc.font('Helvetica').fontSize(9).fillColor(CLARO)
    .text(LEMA_PIE, MARGEN, yPie + 8, { width: ANCHO_TEXTO, align: 'center', lineBreak: false })
}

/** La pastilla del folio, centrada en `x..x+ancho`. Devuelve la `y` donde termina. */
function pastillaFolio(doc, etq, folio, x, ancho, y) {
  doc.font('Helvetica-Bold').fontSize(10.5)
  const etiqueta = `${etq.folio}   ${folio}`
  const anchoPastilla = doc.widthOfString(etiqueta) + 26
  const xPastilla = x + (ancho - anchoPastilla) / 2
  doc.save().roundedRect(xPastilla, y, anchoPastilla, 22, 11).lineWidth(1).strokeColor(CIAN).stroke().restore()
  doc.fillColor(CLARO).text(etiqueta, xPastilla, y + 6, { width: anchoPastilla, align: 'center', lineBreak: false })
  return y + 22
}

/** Un «chip» de dato de la portada: etiqueta pequeña arriba, valor debajo. */
function chip(doc, { etiqueta, valor }, x, y, ancho) {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(CLARO_TENUE)
  doc.text(recortar(doc, String(etiqueta).toUpperCase(), ancho), x, y, { lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(CLARO)
  const texto = valor === null || valor === undefined || valor === '' ? '—' : String(valor)
  const alto = doc.heightOfString(texto, { width: ancho })
  doc.text(texto, x, y + 11, { width: ancho })
  return y + 11 + alto
}

/**
 * Portada «banner»: el arte del tipo como franja ancha arriba (la maqueta del
 * Técnico), título y lema centrados, los chips en fila, y el folio.
 */
function portadaBanner(doc, marca, arte, etq, { titulo, lema, instalacion, chips, generadoEl, folio }) {
  fondoAzul(doc, marca)
  let y = 110
  const imagen = arte ?? (marca.banner ? { buffer: marca.banner, ancho: 905, alto: 461 } : null)
  if (imagen) {
    const anchoBanner = 470
    const altoBanner = anchoBanner * (imagen.alto / imagen.ancho)
    doc.image(imagen.buffer, (ANCHO_PAGINA - anchoBanner) / 2, y, { width: anchoBanner })
    y += altoBanner + 40
  }
  doc.font('Helvetica-BoldOblique').fontSize(26).fillColor(CLARO)
    .text(titulo, MARGEN, y, { width: ANCHO_TEXTO, align: 'center' })
  if (lema) {
    doc.moveDown(0.4).font('Helvetica').fontSize(12).fillColor(CLARO_TENUE)
      .text(lema, MARGEN, doc.y, { width: ANCHO_TEXTO, align: 'center' })
  }
  if (instalacion) {
    doc.moveDown(1).font('Helvetica-Bold').fontSize(15).fillColor(CIAN)
      .text(instalacion, MARGEN, doc.y, { width: ANCHO_TEXTO, align: 'center' })
  }
  y = doc.y + 26
  if (chips?.length) {
    const cols = Math.min(chips.length, 4)
    const anchoChip = (ANCHO_TEXTO - 12 * (cols - 1)) / cols
    let yFin = y
    chips.slice(0, 4).forEach((c, i) => {
      const x = MARGEN + i * (anchoChip + 12)
      doc.save().rect(x, y - 6, 2, 32).fill(CIAN).restore()
      yFin = Math.max(yFin, chip(doc, c, x + 8, y, anchoChip - 8))
    })
    y = yFin + 22
  }
  if (generadoEl) {
    doc.font('Helvetica').fontSize(10).fillColor(CLARO_TENUE)
      .text(etq.generadoEl(generadoEl), MARGEN, y, { width: ANCHO_TEXTO, align: 'center' })
    y = doc.y + 14
  }
  if (folio) pastillaFolio(doc, etq, folio, MARGEN, ANCHO_TEXTO, y)
  pieDePortada(doc)
}

/**
 * Portada «lateral»: el arte vertical a la izquierda en un panel, y a la
 * derecha el título, el lema, los chips apilados y el folio (las otras siete
 * maquetas). Sin arte, el panel no se dibuja y el bloque de texto se centra.
 */
function portadaLateral(doc, marca, arte, etq, { titulo, lema, instalacion, chips, generadoEl, folio }) {
  fondoAzul(doc, marca)
  const yArriba = 96
  const altoPanel = ALTO_PAGINA - yArriba - 130
  let xTexto = MARGEN
  let anchoTexto = ANCHO_TEXTO
  if (arte) {
    /* El arte a su proporción, dentro de un panel de alto fijo: nunca se aplasta. */
    const anchoPanel = Math.min(250, altoPanel * (arte.ancho / arte.alto))
    const altoArte = anchoPanel * (arte.alto / arte.ancho)
    const yArte = yArriba + (altoPanel - altoArte) / 2
    doc.save().roundedRect(MARGEN - 8, yArriba - 8, anchoPanel + 16, altoPanel + 16, 10)
      .fillOpacity(0.35).fill(AZUL).restore()
    doc.save().roundedRect(MARGEN, yArte, anchoPanel, altoArte, 6).clip()
      .image(arte.buffer, MARGEN, yArte, { width: anchoPanel }).restore()
    xTexto = MARGEN + anchoPanel + 34
    anchoTexto = ANCHO_PAGINA - MARGEN - xTexto
  }

  let y = yArriba
  if (marca.banner) {
    const anchoBanner = Math.min(200, anchoTexto)
    doc.image(marca.banner, xTexto, y, { width: anchoBanner })
    y += anchoBanner * (461 / 905) + 26
  }
  doc.font('Helvetica-BoldOblique').fontSize(24).fillColor(CLARO)
    .text(titulo, xTexto, y, { width: anchoTexto })
  if (lema) {
    doc.moveDown(0.3).font('Helvetica').fontSize(11).fillColor(CLARO_TENUE)
      .text(lema, xTexto, doc.y, { width: anchoTexto })
  }
  if (instalacion) {
    doc.moveDown(0.9).font('Helvetica-Bold').fontSize(14).fillColor(CIAN)
      .text(instalacion, xTexto, doc.y, { width: anchoTexto })
  }
  y = doc.y + 24
  for (const c of chips ?? []) {
    doc.save().rect(xTexto, y - 4, 2, 28).fill(CIAN).restore()
    y = chip(doc, c, xTexto + 8, y, anchoTexto - 8) + 16
  }
  if (generadoEl) {
    doc.font('Helvetica').fontSize(9.5).fillColor(CLARO_TENUE)
      .text(etq.generadoEl(generadoEl), xTexto, y + 4, { width: anchoTexto })
    y = doc.y + 16
  }
  if (folio) pastillaFolio(doc, etq, folio, xTexto, anchoTexto, Math.min(y, ALTO_PAGINA - 130))
  pieDePortada(doc)
}

/* ── Bloques ─────────────────────────────────────────────────────────── */

/** Texto en gris bajo el título, para lo que la sección quiere matizar. */
function notaDeSeccion(doc, nota) {
  doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(GRIS)
    .text(nota, MARGEN, doc.y, { width: ANCHO_TEXTO })
  doc.fillColor(TEXTO)
  doc.moveDown(0.4)
}

/** La sección sin dato: su motivo, en una caja gris. Se ve; no se calla. */
function ausencia(doc, motivo) {
  doc.font('Helvetica-Oblique').fontSize(10)
  const alto = doc.heightOfString(motivo, { width: ANCHO_TEXTO - 24 }) + 16
  if (doc.y + alto > LIMITE_INFERIOR) doc.addPage()
  const y = doc.y
  doc.save().roundedRect(MARGEN, y, ANCHO_TEXTO, alto, 4).fill('#F5F6F8').restore()
  doc.save().rect(MARGEN, y, 4, alto).fill(GRIS).restore()
  doc.fillColor(GRIS).text(motivo, MARGEN + 14, y + 8, { width: ANCHO_TEXTO - 24 })
  doc.fillColor(TEXTO)
  doc.x = MARGEN
  doc.y = y + alto
  doc.moveDown(0.6)
}

/**
 * Un texto recortado a UNA línea que quepa en `ancho`, con «…» si sobra.
 *
 * Medido, no confiado: `lineBreak: false` + `ellipsis: true` de pdfkit dejó
 * pasar una etiqueta de dos líneas en la primera tarjeta que se miró a ojo
 * (23-09-2026), y lo que había debajo quedó tapado. Se mide con la fuente y
 * el tamaño ACTIVOS en `doc`, así que hay que fijarlos antes de llamar.
 */
function recortar(doc, texto, ancho) {
  const t = String(texto ?? '')
  if (doc.widthOfString(t) <= ancho) return t
  let corte = t.length
  while (corte > 0 && doc.widthOfString(`${t.slice(0, corte).trimEnd()}…`) > ancho) corte -= 1
  return corte > 0 ? `${t.slice(0, corte).trimEnd()}…` : ''
}

/**
 * Un texto partido por palabras en hasta `max` líneas que quepan en `ancho`;
 * la última se recorta con «…» si aún sobra. Para etiquetas y cabeceras, que
 * caben en dos líneas pero no en una («Valor característico de daño»).
 */
function lineas(doc, texto, ancho, max = 2) {
  const palabras = String(texto ?? '').split(/\s+/).filter(Boolean)
  const salida = []
  let actual = ''
  for (const p of palabras) {
    const candidata = actual ? `${actual} ${p}` : p
    if (doc.widthOfString(candidata) <= ancho || !actual) {
      actual = candidata
    } else {
      salida.push(actual)
      actual = p
      if (salida.length === max - 1) break
    }
  }
  if (actual) {
    /* Lo que no entró en las líneas anteriores se junta en la última y se recorta. */
    const resto = palabras.slice(salida.join(' ').split(/\s+/).filter(Boolean).length).join(' ')
    salida.push(recortar(doc, salida.length === max - 1 ? resto : actual, ancho))
  }
  return salida.slice(0, max)
}

/** Dibuja `lineas` una debajo de otra desde `y`; devuelve la `y` final. */
function textoEnLineas(doc, textos, x, y, alto) {
  textos.forEach((l, i) => doc.text(l, x, y + i * alto, { lineBreak: false }))
  return y + textos.length * alto
}

/** ▲ o ▼ dibujados: pdfkit no tiene esos glifos en Helvetica (D13). */
function triangulo(doc, x, y, signo, color) {
  const l = 6
  doc.save().fillColor(color)
  if (signo > 0) doc.polygon([x, y + l], [x + l, y + l], [x + l / 2, y]).fill()
  else doc.polygon([x, y], [x + l, y], [x + l / 2, y + l]).fill()
  doc.restore()
}

/**
 * Tarjetas de indicador, hasta cuatro por fila: etiqueta, valor grande con
 * unidad, un subtítulo, y la variación con su triángulo si la hay.
 *
 * @param {{etiqueta: string, valor: string|number|null, unidad?: string|null, sub?: string|null,
 *   variacion?: {signo: number, texto: string}|null}[]} items
 */
function indicadores(doc, items, etq) {
  /* Tres filas fijas: etiqueta (hasta 2 líneas), valor, subtítulo (hasta 2
     líneas) con la variación a la derecha de la primera. Alto fijo para que
     las cuatro tarjetas de una fila midan lo mismo aunque una use una línea. */
  const ALTO = 88
  const GAP = 10
  const SANGRIA = 10
  const Y_ETIQUETA = 8
  const Y_VALOR = 30
  const Y_SUB = 58
  for (let i = 0; i < items.length; i += 4) {
    const fila = items.slice(i, i + 4)
    const cols = fila.length
    const ancho = (ANCHO_TEXTO - GAP * (cols - 1)) / cols
    const util = ancho - SANGRIA - 8 // lo que cabe entre la barra cian y el borde derecho
    if (doc.y + ALTO > LIMITE_INFERIOR) doc.addPage()
    const y = doc.y
    fila.forEach((it, j) => {
      const x = MARGEN + j * (ancho + GAP)
      const xi = x + SANGRIA
      doc.save().roundedRect(x, y, ancho, ALTO, 5).fill(CAJA_SUAVE).restore()
      doc.save().rect(x, y, 3, ALTO).fill(CIAN).restore()

      /* Fila 1: la etiqueta, hasta dos líneas medidas a mano (ver `lineas`). */
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRIS)
      textoEnLineas(doc, lineas(doc, String(it.etiqueta).toUpperCase(), util, 2), xi, y + Y_ETIQUETA, 9.5)

      /* Fila 2: el valor grande y, si cabe, la unidad a su derecha. */
      const sinValor = it.valor === null || it.valor === undefined || it.valor === ''
      const valor = sinValor ? etq.sinValor : String(it.valor)
      doc.font('Helvetica-Bold').fontSize(sinValor ? 14 : 17).fillColor(sinValor ? GRIS : AZUL)
      const valorRecortado = recortar(doc, valor, util)
      doc.text(valorRecortado, xi, y + Y_VALOR, { lineBreak: false })
      if (!sinValor && it.unidad) {
        const anchoValor = doc.widthOfString(valorRecortado)
        const libre = util - anchoValor - 4
        if (libre > 12) {
          doc.font('Helvetica').fontSize(9).fillColor(GRIS)
          doc.text(recortar(doc, String(it.unidad), libre), xi + anchoValor + 4, y + Y_VALOR + 6, { lineBreak: false })
        }
      }

      /* Fila 3: la variación a la derecha (se mide primero) y el subtítulo a la
         izquierda en lo que queda, hasta dos líneas. Nada se pisa. */
      let anchoVar = 0
      const hayVariacion = it.variacion && Number.isFinite(it.variacion.signo) && it.variacion.texto
      if (hayVariacion) {
        doc.font('Helvetica-Bold').fontSize(8)
        const textoVar = recortar(doc, it.variacion.texto, util * 0.6)
        anchoVar = doc.widthOfString(textoVar) + (it.variacion.signo !== 0 ? 10 : 0) + 6
        const xVar = x + ancho - 8 - doc.widthOfString(textoVar)
        /* Sólo la dirección: en una máquina subir puede ser malo o bueno según la
           señal, y este compositor no juzga. Gris para el cero, marca para el resto. */
        const color = it.variacion.signo === 0 ? GRIS : it.variacion.signo > 0 ? ROJO : VERDE
        if (it.variacion.signo !== 0) triangulo(doc, xVar - 9, y + Y_SUB + 1, it.variacion.signo, color)
        doc.fillColor(color).text(textoVar, xVar, y + Y_SUB, { lineBreak: false })
      }
      /* Con variación, el subtítulo tiene UNA línea en lo que ella deja; sin
         variación, hasta dos líneas a todo el ancho. */
      doc.font('Helvetica').fontSize(8).fillColor(GRIS)
      textoEnLineas(doc, hayVariacion ? lineas(doc, it.sub ?? '', util - anchoVar, 1) : lineas(doc, it.sub ?? '', util, 2), xi, y + Y_SUB, 10)
    })
    doc.x = MARGEN
    doc.y = y + ALTO + GAP
  }
  doc.fillColor(TEXTO)
  doc.moveDown(0.3)
}

/**
 * Tabla con columnas declaradas. Los anchos son PESOS (proporciones del ancho
 * de texto), la cabecera se repite al cambiar de página, y una fila entra
 * entera o pasa entera. Una fila con `color` (una clave de estado del dominio)
 * lleva un punto de ese color y su columna de estado en ese color.
 *
 * @param {{columnas: {clave: string, titulo: string, ancho?: number, align?: 'left'|'right', estado?: boolean}[],
 *   filas: {celdas: Record<string, string|number|null>, color?: string|null}[], pie?: string|null}} tabla
 */
function tabla(doc, { columnas, filas, pie }, etq) {
  const pesoTotal = columnas.reduce((s, c) => s + (c.ancho ?? 1), 0)
  const SANGRIA = 12 // para el punto de color
  const anchos = columnas.map((c) => ((c.ancho ?? 1) / pesoTotal) * (ANCHO_TEXTO - SANGRIA))
  const xs = anchos.reduce((acc, a, i) => [...acc, (i === 0 ? MARGEN + SANGRIA : acc[i - 1] + anchos[i - 1])], [])

  const RELLENO = 8 // entre el texto de una celda y el de la siguiente
  const cabecera = () => {
    const y = doc.y
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GRIS)
    /* Hasta dos líneas por título, medidas a mano («Última calibración» no cabe en una). */
    const titulos = columnas.map((c, i) => lineas(doc, String(c.titulo).toUpperCase(), anchos[i] - RELLENO, 2))
    const filasTitulo = Math.max(...titulos.map((t) => t.length))
    columnas.forEach((c, i) => {
      titulos[i].forEach((l, k) => {
        doc.text(l, xs[i] + 2, y + k * 10, { width: anchos[i] - RELLENO, align: c.align ?? 'left', lineBreak: false })
      })
    })
    doc.y = y + 10 * filasTitulo + 4
    doc.save().moveTo(MARGEN, doc.y - 2).lineTo(ANCHO_PAGINA - MARGEN, doc.y - 2).lineWidth(0.5).strokeColor('#D5DEEA').stroke().restore()
    doc.y += 2
  }

  /* La cabecera nunca se queda sola al pie: si no cabe ella más una fila, la
     tabla entera arranca en la página siguiente (visto el 23-09-2026). */
  if (doc.y + 60 > LIMITE_INFERIOR) doc.addPage()
  cabecera()
  doc.font('Helvetica').fontSize(9.5)
  for (const fila of filas) {
    const textos = columnas.map((c) => {
      const v = fila.celdas?.[c.clave]
      return v === null || v === undefined || v === '' ? etq.sinValor : String(v)
    })
    const alto = Math.max(...textos.map((t, i) => doc.heightOfString(t, { width: anchos[i] - RELLENO }))) + 6
    if (doc.y + alto > LIMITE_INFERIOR) {
      doc.addPage()
      cabecera()
      doc.font('Helvetica').fontSize(9.5)
    }
    const y = doc.y
    const color = fila.color ? colorDeFila({ clave: fila.color, estado: '' }) : null
    if (color) doc.save().circle(MARGEN + 4, y + 6, 2.5).fill(color).restore()
    columnas.forEach((c, i) => {
      const esEstado = Boolean(c.estado) && color
      doc.font(esEstado ? 'Helvetica-Bold' : 'Helvetica').fillColor(esEstado ? color : TEXTO)
        .text(textos[i], xs[i] + 2, y, { width: anchos[i] - RELLENO, align: c.align ?? 'left' })
    })
    doc.y = y + alto
    doc.save().moveTo(MARGEN, doc.y - 1).lineTo(ANCHO_PAGINA - MARGEN, doc.y - 1).lineWidth(0.25).strokeColor('#E6ECF3').stroke().restore()
  }
  doc.x = MARGEN
  doc.fillColor(TEXTO)
  if (pie) {
    doc.moveDown(0.2)
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GRIS).text(pie, MARGEN, doc.y, { width: ANCHO_TEXTO })
    doc.fillColor(TEXTO)
  }
  doc.moveDown(0.6)
}

/**
 * Párrafos con su procedencia: cada uno lleva un rótulo pequeño («Síntesis
 * del sistema», «Redacción del asistente») para que lo medido y lo redactado
 * no se lean igual (D9).
 *
 * @param {{rotulo?: string|null, texto: string}[]} parrafos
 */
function texto(doc, parrafos) {
  for (const p of parrafos) {
    doc.font('Helvetica').fontSize(10.5)
    const alto = doc.heightOfString(p.texto, { width: ANCHO_TEXTO - 24 }) + 18 + (p.rotulo ? 12 : 0)
    if (doc.y + alto > LIMITE_INFERIOR) doc.addPage()
    const y = doc.y
    doc.save().roundedRect(MARGEN, y, ANCHO_TEXTO, alto, 4).fill(CAJA_SUAVE).restore()
    doc.save().rect(MARGEN, y, 4, alto).fill(CIAN).restore()
    let yTexto = y + 9
    if (p.rotulo) {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRIS)
        .text(String(p.rotulo).toUpperCase(), MARGEN + 14, yTexto, { width: ANCHO_TEXTO - 24, lineBreak: false })
      yTexto += 12
    }
    doc.font('Helvetica').fontSize(10.5).fillColor(TEXTO).text(p.texto, MARGEN + 14, yTexto, { width: ANCHO_TEXTO - 24 })
    doc.x = MARGEN
    doc.y = y + alto
    doc.moveDown(0.5)
  }
}

function lista(doc, items) {
  doc.font('Helvetica').fontSize(10).fillColor(TEXTO)
  for (const it of items) {
    const alto = doc.heightOfString(`•  ${it}`, { width: ANCHO_TEXTO })
    if (doc.y + alto > LIMITE_INFERIOR) doc.addPage()
    doc.text(`•  ${it}`, MARGEN, doc.y, { width: ANCHO_TEXTO })
  }
  doc.moveDown(0.6)
}

/**
 * Tres cajas de firma en fila: el nombre encima de la línea si se sabe, y el
 * rol debajo. Quien elabora es el asistente; quien revisa y aprueba firma a
 * mano (D10).
 *
 * @param {{rol: string, nombre?: string|null}[]} items
 */
function firmas(doc, items) {
  const ALTO = 58
  const GAP = 14
  const cols = Math.max(1, Math.min(items.length, 3))
  const ancho = (ANCHO_TEXTO - GAP * (cols - 1)) / cols
  if (doc.y + ALTO > LIMITE_INFERIOR) doc.addPage()
  const y = doc.y
  items.slice(0, 3).forEach((it, i) => {
    const x = MARGEN + i * (ancho + GAP)
    if (it.nombre) {
      doc.font('Helvetica').fontSize(9).fillColor(TEXTO)
        .text(it.nombre, x, y + 20, { width: ancho, align: 'center' })
    }
    doc.save().moveTo(x, y + 38).lineTo(x + ancho, y + 38).lineWidth(0.75).strokeColor(GRIS).stroke().restore()
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GRIS)
      .text(String(it.rol).toUpperCase(), x, y + 43, { width: ancho, align: 'center', lineBreak: false })
  })
  doc.x = MARGEN
  doc.y = y + ALTO
  doc.fillColor(TEXTO)
}

/**
 * Cuánto necesita una sección para que su título no se quede solo al pie:
 * el título más su PRIMER bloque. Una sección de gráficas necesita una
 * gráfica entera; una de tarjetas, una fila de tarjetas; una tabla, su
 * cabecera y una fila. Si no cabe, la sección entera pasa de página.
 */
function alturaMinima(seccion) {
  const TITULO = 48
  if (seccion.ausente) return TITULO + 40
  switch (seccion.bloque) {
    case 'graficas': return TITULO + (seccion.items?.[0]?.svg ? ALTO_BLOQUE_GRAFICO : 80)
    case 'indicadores': return TITULO + 100
    case 'tabla': return TITULO + 70
    case 'firmas': return TITULO + 70
    default: return TITULO + 40
  }
}

/** ¿Trae algo que dibujar este bloque? Lo vacío se pinta como ausencia. */
function tieneDato(seccion) {
  switch (seccion.bloque) {
    case 'indicadores': return (seccion.items?.length ?? 0) > 0
    case 'tabla': return (seccion.filas?.length ?? 0) > 0 && (seccion.columnas?.length ?? 0) > 0
    case 'graficas': return (seccion.items?.length ?? 0) > 0
    case 'texto': return (seccion.parrafos?.length ?? 0) > 0
    case 'lista': return (seccion.items?.length ?? 0) > 0
    case 'firmas': return (seccion.items?.length ?? 0) > 0
    default: return false
  }
}

/* ── El documento entero ─────────────────────────────────────────────── */

/**
 * Compone el PDF de una plantilla a partir de un MODELO DE DOCUMENTO ya
 * resuelto: todo el texto llega en el idioma final, y ninguna cifra se
 * calcula aquí.
 *
 * @param {object} args
 * @param {{ id: string, folioPrefijo: string|null, portada: { arte: string|null, disposicion: 'banner'|'lateral' } }} args.plantilla
 * @param {object} args.documento
 * @param {string} args.documento.titulo        el título del tipo, ya en su idioma
 * @param {string|null} [args.documento.lema]
 * @param {string} args.documento.instalacion   el nombre de la máquina
 * @param {{etiqueta: string, valor: string|number|null}[]} [args.documento.chips]
 * @param {string} [args.documento.generadoEl]
 * @param {string} [args.documento.folio]       si no llega, se genera con el prefijo del tipo
 * @param {Array<{id: string, titulo: string, bloque: string, nota?: string|null, ausente?: string|null}>} args.documento.secciones
 * @param {object} args.etq  `etiquetasDeReporte(idioma)`
 * @returns {Promise<{pdf: Buffer, paginas: number, folio: string,
 *   secciones: {id: string, bloque: string, conDato: boolean, motivo: string|null}[]}>}
 */
export async function componerPorPlantilla({ plantilla, documento, etq }) {
  const folio = documento.folio || generarFolio(new Date(), plantilla.folioPrefijo ?? null)
  const { doc, cerrado } = nuevoDocumento()
  const marca = cargarMarca()
  const arte = cargarArte(plantilla.portada?.arte)

  const datosPortada = {
    titulo: documento.titulo,
    lema: documento.lema ?? null,
    instalacion: documento.instalacion ?? null,
    chips: documento.chips ?? [],
    generadoEl: documento.generadoEl ?? null,
    folio,
  }
  sinPaginacion(doc, () => {
    if (plantilla.portada?.disposicion === 'banner') portadaBanner(doc, marca, arte, etq, datosPortada)
    else portadaLateral(doc, marca, arte, etq, datosPortada)
  })

  doc.addPage()

  const manifiesto = []
  for (const seccion of documento.secciones ?? []) {
    if (!BLOQUES.includes(seccion.bloque)) {
      throw new Error(`La sección «${seccion.id}» pide un bloque que el compositor no conoce: ${seccion.bloque}`)
    }
    if (doc.y + alturaMinima(seccion) > LIMITE_INFERIOR) doc.addPage()
    tituloSeccion(doc, seccion.titulo)
    if (seccion.nota) notaDeSeccion(doc, seccion.nota)

    const motivo = seccion.ausente ?? (tieneDato(seccion) ? null : etq.sinDatos)
    if (motivo) {
      ausencia(doc, motivo)
      manifiesto.push({ id: seccion.id, bloque: seccion.bloque, conDato: false, motivo })
      continue
    }
    switch (seccion.bloque) {
      case 'indicadores': indicadores(doc, seccion.items, etq); break
      case 'tabla': tabla(doc, seccion, etq); break
      case 'graficas': for (const g of seccion.items) dibujarGrafico(doc, g, etq); break
      case 'texto': texto(doc, seccion.parrafos); break
      case 'lista': lista(doc, seccion.items); break
      case 'firmas': firmas(doc, seccion.items); break
      default: break
    }
    manifiesto.push({ id: seccion.id, bloque: seccion.bloque, conDato: true, motivo: null })
  }

  sellarPaginas(doc, marca, etq, folio)
  const paginas = doc.bufferedPageRange().count
  doc.end()
  const pdf = await cerrado
  return { pdf, paginas, folio, secciones: manifiesto }
}
