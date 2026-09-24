/**
 * El registro de plantillas y el normalizador del `tipo` (Plan 44 F3, D4), y
 * que las cinco pendientes están declaradas con su motivo.
 */
import { describe, expect, it } from 'vitest'

import { CATALOGO, PLANTILLAS, TIPOS, TIPOS_DISPONIBLES, plantillaDe, tipoDeReporte } from '../../ia/reportes/plantillas/index.mjs'
import { firmasDe } from '../../ia/reportes/plantillas/comun.mjs'
import { BLOQUES } from '../../ia/reportes/compositor.mjs'
import { etiquetasDeReporte } from '../../ia/i18n/etiquetasReporte.mjs'
import { TIPOS as TIPOS_DE_MAQUINA } from '../../../shared/eva/tipos/index.js'

/**
 * Lo que `recolectar` devuelve cuando una máquina no trajo nada, con la forma
 * completa. Sirve para comprobar la ESTRUCTURA de un documento —qué secciones
 * lleva, qué columnas declara— sin montar una máquina ni un historiador.
 */
const DATOS_VACIOS = {
  ok: true,
  lectura: { ok: true },
  estado: { senales: [], grupos: [], estadoGeneral: null, dominio: null },
  senales: [],
  grupos: [],
  riesgos: null,
  matriz: null,
  eventos: null,
  medidas: [],
  principales: [],
  series: new Map(),
  anteriores: new Map(),
  banderas: { activas: [], sinLectura: 0 },
  historizada: () => false,
  metaDe: () => null,
  bandaDe: () => null,
}

describe('tipoDeReporte', () => {
  it('reconoce el id exacto, con guiones o con espacios, y sin acentos ni mayúsculas', () => {
    expect(tipoDeReporte('tecnico')).toEqual({ tipo: 'tecnico' })
    expect(tipoDeReporte('Técnico')).toEqual({ tipo: 'tecnico' })
    expect(tipoDeReporte('lectura-de-sensores')).toEqual({ tipo: 'lectura-de-sensores' })
    expect(tipoDeReporte('lectura de sensores')).toEqual({ tipo: 'lectura-de-sensores' })
    expect(tipoDeReporte('catalogo')).toEqual({ tipo: CATALOGO })
  })

  it('entiende los sinónimos de la tabla §1.2 del plan, en español y en inglés', () => {
    expect(tipoDeReporte('reporte de sensores')).toEqual({ tipo: 'lectura-de-sensores' })
    expect(tipoDeReporte('el CMS de la última semana')).toEqual({ tipo: 'vibraciones' })
    expect(tipoDeReporte('technical report')).toEqual({ tipo: 'tecnico' })
    expect(tipoDeReporte('reporte de vibración del motor')).toEqual({ tipo: 'vibraciones' })
    expect(tipoDeReporte('análisis de riesgos')).toEqual({ tipo: 'riesgos' })
    expect(tipoDeReporte('eventos de alarma')).toEqual({ tipo: 'alarmas' })
    expect(tipoDeReporte('engineering')).toEqual({ tipo: 'ingenieria' })
    expect(tipoDeReporte('consumo eléctrico')).toEqual({ tipo: 'energias' })
    expect(tipoDeReporte('pronóstico de fallas')).toEqual({ tipo: 'predicciones' })
  })

  it('dos tipos en la misma frase es ambiguo; nada reconocible es null; «técnico de planta» es UNO', () => {
    expect(tipoDeReporte('reporte técnico de alarmas')).toEqual({ ambiguo: ['tecnico', 'alarmas'] })
    expect(tipoDeReporte('reporte técnico de planta')).toEqual({ tipo: 'tecnico' })
    expect(tipoDeReporte('un pdf bonito')).toBeNull()
    expect(tipoDeReporte('')).toBeNull()
    expect(tipoDeReporte(undefined)).toBeNull()
  })
})

describe('el registro', () => {
  it('nueve tipos, el catálogo primero; cinco disponibles hoy y tres declaradas con motivo en los dos idiomas', () => {
    expect(TIPOS).toEqual([CATALOGO, 'tecnico', 'vibraciones', 'lectura-de-sensores', 'riesgos', 'alarmas', 'ingenieria', 'energias', 'predicciones'])
    expect(TIPOS_DISPONIBLES).toEqual(['tecnico', 'vibraciones', 'lectura-de-sensores', 'riesgos', 'alarmas'])
    expect(plantillaDe(CATALOGO)).toBeNull()
    for (const [id, p] of Object.entries(PLANTILLAS)) {
      expect(p.id).toBe(id)
      expect(typeof p.folioPrefijo).toBe('string')
      expect(['banner', 'lateral']).toContain(p.portada.disposicion)
      expect(typeof p.claves).toBe('function')
      if (p.disponible) {
        expect(typeof p.documento).toBe('function')
      } else {
        for (const idioma of ['es', 'en']) {
          const motivo = p.motivo(etiquetasDeReporte(idioma))
          expect(typeof motivo).toBe('string')
          expect(motivo.length).toBeGreaterThan(20)
        }
        /* El esqueleto transcrito de la maqueta: bloques que el compositor conoce. */
        expect(p.secciones.length).toBeGreaterThanOrEqual(5)
        for (const s of p.secciones) expect(BLOQUES).toContain(s.bloque)
      }
    }
  })

  it('todo tipo de máquina declara sus indicadores principales, por roles que existen en él (§1.1)', () => {
    /* Sin esto, las tarjetas caen en «las primeras cuatro medidas» del orden
       del estado, que no es una decisión de nadie. Un tipo nuevo tiene que
       decir cuáles son las suyas. */
    for (const tipo of TIPOS_DE_MAQUINA) {
      expect(Array.isArray(tipo.indicadores), `${tipo.id} no declara indicadores`).toBe(true)
      expect(tipo.indicadores.length).toBeGreaterThanOrEqual(1)
      expect(tipo.indicadores.length).toBeLessThanOrEqual(4)
      for (const rol of tipo.indicadores) expect(tipo.roles[rol], `${tipo.id}: el indicador ${rol} no es un rol suyo`).toBeTruthy()
    }
  })

  it('ningún título de columna se corta con el ancho que su plantilla le da (F4)', async () => {
    /* ── POR QUÉ ESTA PRUEBA EXISTE ────────────────────────────────
     * Los anchos de columna son PESOS, y el compositor recorta el título
     * que no cabe («IMPACTO» salía «IMPAC…», «SEVERIDAD» salía «SEVERID…»).
     * Eso sólo se veía abriendo el PDF, y sólo si a uno se le ocurría
     * mirar esa tabla. Aquí se mide con la misma fuente y el mismo cálculo
     * que usa el dibujo, para que el corte falle en la tanda y no en la
     * reunión donde alguien abre el reporte.
     *
     * Se permiten DOS renglones —el compositor los dibuja— y se comprueba
     * que el título entre entero en ellos. */
    const { default: PDFDocument } = await import('pdfkit')
    const ANCHO_TEXTO = 595.28 - 2 * 42 // A4 menos los márgenes del lienzo
    const SANGRIA = 12
    const RELLENO = 8

    const doc = new PDFDocument({ size: 'A4', margin: 42 })
    const cabeErrores = []

    for (const idioma of ['es', 'en']) {
      const etq = etiquetasDeReporte(idioma)
      for (const p of Object.values(PLANTILLAS).filter((x) => x.disponible)) {
        /* Un documento con lo mínimo: sólo interesan `columnas`, que no
           dependen de los datos. */
        const secciones = p.documento(DATOS_VACIOS, {
          etq, idioma, entrada: { nombre: 'M' }, ventana: { etiqueta: 'hoy', inicio: new Date(0), fin: new Date(1) },
          generadoEl: 'hoy', explicacion: null, usuario: null,
        }).secciones

        for (const s of secciones.filter((x) => x.bloque === 'tabla' && x.columnas)) {
          const pesoTotal = s.columnas.reduce((a, c) => a + (c.ancho ?? 1), 0)
          for (const c of s.columnas) {
            const ancho = ((c.ancho ?? 1) / pesoTotal) * (ANCHO_TEXTO - SANGRIA) - RELLENO
            doc.font('Helvetica-Bold').fontSize(8.5)
            const titulo = String(c.titulo).toUpperCase()
            /* Cabe si entra en una línea, o si sus palabras reparten en dos
               sin que ninguna sea más ancha que la columna. */
            const palabras = titulo.split(' ')
            const cabe = doc.widthOfString(titulo) <= ancho
              || (palabras.length > 1 && palabras.every((w) => doc.widthOfString(w) <= ancho))
            if (!cabe) cabeErrores.push(`${idioma}/${p.id}/${s.id}: «${titulo}» en ${ancho.toFixed(0)}pt`)
          }
        }
      }
    }
    doc.end()
    expect(cabeErrores).toEqual([])
  })

  it('«Elaboró» lleva a quien preguntó si hay sesión; sin ella, el asistente (D10, §6.1)', () => {
    const etq = etiquetasDeReporte('es')
    expect(firmasDe(etq, 'moises')[0]).toEqual({ rol: 'Elaboró', nombre: 'moises · vía el asistente de planta TDCON' })
    expect(firmasDe(etq)[0]).toEqual({ rol: 'Elaboró', nombre: 'Asistente de planta TDCON · generado automáticamente' })
    expect(firmasDe(etq, null).slice(1).map((f) => f.nombre)).toEqual([null, null])
  })

  it('cada plantilla disponible tiene sus rótulos en los dos idiomas', () => {
    for (const idioma of ['es', 'en']) {
      const etq = etiquetasDeReporte(idioma)
      for (const clave of ['tecnico', 'vibraciones', 'sensores', 'riesgos', 'alarmas']) {
        expect(etq.plantillas[clave].titulo).toMatch(/[A-Z]/)
        expect(Object.keys(etq.plantillas[clave].secciones).length).toBeGreaterThanOrEqual(5)
      }
      expect(etq.plantillas.comun.prioridad.critico).toBeTruthy()
    }
  })
})
