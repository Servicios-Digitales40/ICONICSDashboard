/**
 * El registro de plantillas y el normalizador del `tipo` (Plan 44 F3, D4), y
 * que las cinco pendientes están declaradas con su motivo.
 */
import { describe, expect, it } from 'vitest'

import { CATALOGO, PLANTILLAS, TIPOS, TIPOS_DISPONIBLES, plantillaDe, tipoDeReporte } from '../../ia/reportes/plantillas/index.mjs'
import { BLOQUES } from '../../ia/reportes/compositor.mjs'
import { etiquetasDeReporte } from '../../ia/i18n/etiquetasReporte.mjs'

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
  it('nueve tipos, el catálogo primero; tres disponibles hoy y cinco declaradas con motivo en los dos idiomas', () => {
    expect(TIPOS).toEqual([CATALOGO, 'tecnico', 'vibraciones', 'lectura-de-sensores', 'riesgos', 'alarmas', 'ingenieria', 'energias', 'predicciones'])
    expect(TIPOS_DISPONIBLES).toEqual(['tecnico', 'vibraciones', 'lectura-de-sensores'])
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

  it('cada plantilla disponible tiene sus rótulos en los dos idiomas', () => {
    for (const idioma of ['es', 'en']) {
      const etq = etiquetasDeReporte(idioma)
      for (const clave of ['tecnico', 'vibraciones', 'sensores']) {
        expect(etq.plantillas[clave].titulo).toMatch(/[A-Z]/)
        expect(Object.keys(etq.plantillas[clave].secciones).length).toBeGreaterThanOrEqual(6)
      }
      expect(etq.plantillas.comun.prioridad.critico).toBeTruthy()
    }
  })
})
