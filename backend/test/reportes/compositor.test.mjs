/**
 * El compositor por bloques (Plan 44 F1, D8): se prueba el MANIFIESTO y la
 * forma del archivo, no los bytes del PDF. No hay parser de PDF en el backend
 * y no se añade uno; lo que el manifiesto dice es lo que la herramienta le
 * cuenta al modelo, así que es lo que importa que sea verdad.
 */
import { describe, expect, it } from 'vitest'

import { componerPorPlantilla, cargarArte, BLOQUES } from '../../ia/reportes/compositor.mjs'
import { generarFolio } from '../../ia/reportes/lienzo.mjs'
import { etiquetasDeReporte } from '../../ia/i18n/etiquetasReporte.mjs'

const etq = etiquetasDeReporte('es')
const PLANTILLA = { id: 'prueba', folioPrefijo: 'PRU', portada: { arte: 'tecnico', disposicion: 'banner' } }

const seccionesDeMuestra = () => [
  { id: 'kpis', titulo: '1. Indicadores', bloque: 'indicadores', items: [
    { etiqueta: 'Velocidad eficaz máx.', valor: '2,41', unidad: 'mm/s', sub: 'Lado libre', variacion: { signo: 1, texto: '+0,12' } },
    { etiqueta: 'Sin lectura', valor: null, unidad: 'mm/s', sub: 'Lado acople', variacion: null },
  ] },
  { id: 'tabla', titulo: '2. Tabla', bloque: 'tabla',
    columnas: [{ clave: 'a', titulo: 'Variable', ancho: 3 }, { clave: 'b', titulo: 'Valor', align: 'right' }, { clave: 'e', titulo: 'Estado', estado: true }],
    filas: [{ celdas: { a: 'vRMS', b: '2,4', e: 'En banda' }, color: 'nominal' }, { celdas: { a: 'aRMS', b: null, e: '—' } }],
    pie: 'La severidad se deriva del rol.' },
  { id: 'texto', titulo: '3. Texto', bloque: 'texto', parrafos: [{ rotulo: 'Síntesis', texto: 'Todo en banda.' }, { texto: 'Sin rótulo.' }] },
  { id: 'lista', titulo: '4. Lista', bloque: 'lista', items: ['una', 'dos'] },
  { id: 'firmas', titulo: '5. Firmas', bloque: 'firmas', items: [{ rol: 'Elaboró', nombre: 'Asistente' }, { rol: 'Revisó' }, { rol: 'Aprobó' }] },
]

describe('componerPorPlantilla', () => {
  it('escribe un PDF de verdad, con portada más las páginas de contenido, y un manifiesto por sección', async () => {
    const r = await componerPorPlantilla({
      plantilla: PLANTILLA,
      documento: { titulo: 'REPORTE DE PRUEBA', lema: 'Lema', instalacion: 'Máquina X', chips: [{ etiqueta: 'Periodo', valor: 'hoy' }], generadoEl: '23/09/2026 10:00', secciones: seccionesDeMuestra() },
      etq,
    })
    expect(r.pdf.subarray(0, 4).toString()).toBe('%PDF')
    expect(r.paginas).toBeGreaterThanOrEqual(2)
    expect(r.folio).toMatch(/^TDCON-PRU-\d{8}-[0-9A-F]{4}$/)
    expect(r.secciones.map((s) => [s.id, s.conDato])).toEqual([
      ['kpis', true], ['tabla', true], ['texto', true], ['lista', true], ['firmas', true],
    ])
  })

  it('una sección ausente se dibuja con su motivo y sale así en el manifiesto; una vacía, con el texto genérico', async () => {
    const r = await componerPorPlantilla({
      plantilla: { ...PLANTILLA, portada: { arte: null, disposicion: 'lateral' } },
      documento: { titulo: 'T', instalacion: 'M', secciones: [
        { id: 'espectro', titulo: 'Espectro', bloque: 'graficas', ausente: 'El módulo publica vigilancias del espectro, no el espectro.' },
        { id: 'vacia', titulo: 'Tabla vacía', bloque: 'tabla', columnas: [{ clave: 'a', titulo: 'A' }], filas: [] },
        { id: 'nota', titulo: 'Con nota', bloque: 'lista', nota: 'Una nota bajo el título.', items: ['x'] },
      ] },
      etq,
    })
    expect(r.secciones).toEqual([
      { id: 'espectro', bloque: 'graficas', conDato: false, motivo: 'El módulo publica vigilancias del espectro, no el espectro.' },
      { id: 'vacia', bloque: 'tabla', conDato: false, motivo: etq.sinDatos },
      { id: 'nota', bloque: 'lista', conDato: true, motivo: null },
    ])
  })

  it('una tabla de sesenta filas pagina: más páginas que una de dos, y ninguna fila se pierde', async () => {
    const filas = (n) => Array.from({ length: n }, (_, i) => ({ celdas: { a: `fila ${i}`, b: String(i) } }))
    const componer = (n) => componerPorPlantilla({
      plantilla: PLANTILLA,
      documento: { titulo: 'T', instalacion: 'M', secciones: [
        { id: 't', titulo: 'Tabla', bloque: 'tabla', columnas: [{ clave: 'a', titulo: 'A' }, { clave: 'b', titulo: 'B' }], filas: filas(n) },
      ] },
      etq,
    })
    const [corta, larga] = await Promise.all([componer(2), componer(60)])
    expect(corta.paginas).toBe(2)
    expect(larga.paginas).toBeGreaterThan(corta.paginas)
    expect(larga.secciones[0].conDato).toBe(true)
  })

  it('sin arte la portada sale igual (tolerancia de la marca), y con un arte que existe se carga con sus medidas', async () => {
    expect(cargarArte('no-existe')).toBeNull()
    expect(cargarArte(null)).toBeNull()
    const arte = cargarArte('tecnico')
    expect(arte).toMatchObject({ ancho: 667, alto: 295 })
    const r = await componerPorPlantilla({
      plantilla: { id: 'x', folioPrefijo: null, portada: { arte: 'no-existe', disposicion: 'lateral' } },
      documento: { titulo: 'T', instalacion: 'M', secciones: [] },
      etq,
    })
    expect(r.pdf.subarray(0, 4).toString()).toBe('%PDF')
    expect(r.paginas).toBe(2)
    /* Sin prefijo, el folio de siempre. */
    expect(r.folio).toMatch(/^TDCON-\d{8}-[0-9A-F]{4}$/)
  })

  it('un bloque desconocido es un error de programación, no una sección en blanco', async () => {
    await expect(componerPorPlantilla({
      plantilla: PLANTILLA,
      documento: { titulo: 'T', instalacion: 'M', secciones: [{ id: 'x', titulo: 'X', bloque: 'matriz' }] },
      etq,
    })).rejects.toThrow(/matriz/)
    expect(BLOQUES).not.toContain('matriz')
  })
})

describe('generarFolio con prefijo', () => {
  it('lleva el prefijo del tipo entre TDCON y la fecha; sin prefijo, la forma de siempre', () => {
    const f = new Date(2026, 8, 23)
    expect(generarFolio(f, 'TEC')).toMatch(/^TDCON-TEC-20260923-[0-9A-F]{4}$/)
    expect(generarFolio(f)).toMatch(/^TDCON-20260923-[0-9A-F]{4}$/)
  })
})
