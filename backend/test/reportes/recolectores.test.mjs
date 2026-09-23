/**
 * Los recolectores (Plan 44 F2): forma pura, sin red. Lo que importa aquí es
 * lo que NO se inventa: una señal sin lectura sigue siendo `null`, una serie
 * sin período anterior no tiene variación, y «sin criterio» no es «en banda».
 */
import { describe, expect, it } from 'vitest'

import {
  banderasActivas, desvioPorciento, familiaDe, formatear, medidasDe, peorEstadoDe, principalesDe, recolectar, recuentoDe, variacionDe,
} from '../../ia/reportes/recolectores.mjs'
import { etiquetasDeReporte } from '../../ia/i18n/etiquetasReporte.mjs'

const META = {
  vRMS_S1: { rol: 'medida:vRMS', label: 'Velocidad eficaz · S1', unidad: 'mm/s', decimales: 3 },
  vRMS_S2: { rol: 'medida:vRMS', label: 'Velocidad eficaz · S2', unidad: 'mm/s', decimales: 3 },
  aRMS_S1: { rol: 'medida:aRMS', label: 'Aceleración eficaz · S1', unidad: 'm/s²', decimales: 3 },
  DKW_S1: { rol: 'medida:DKW', label: 'Valor de daño · S1', unidad: '', decimales: 3 },
  frecuencia: { rol: 'variador:frecuencia', label: 'Frecuencia', unidad: 'Hz', decimales: 1 },
  Alarma_S1: { rol: 'bandera:alarma', label: 'Alarma · S1', unidad: '', decimales: 0 },
}
const metaDe = (k) => META[k] ?? null
const SENALES = [
  { clave: 'vRMS_S1', valor: 1.2, estado: 'nominal', grupo: 'S1', unidad: 'mm/s', decimales: 3, label: META.vRMS_S1.label },
  { clave: 'vRMS_S2', valor: 2.9, estado: 'atencion', grupo: 'S2', unidad: 'mm/s', decimales: 3, label: META.vRMS_S2.label },
  { clave: 'aRMS_S1', valor: null, estado: 'sin_dato', grupo: 'S1', unidad: 'm/s²', decimales: 3, label: META.aRMS_S1.label },
  { clave: 'DKW_S1', valor: 1.01, estado: null, grupo: 'S1', unidad: '', decimales: 3, label: META.DKW_S1.label },
  { clave: 'frecuencia', valor: 50, estado: null, grupo: 'variador', unidad: 'Hz', decimales: 1, label: 'Frecuencia' },
]

describe('las piezas puras', () => {
  it('familiaDe, formatear y medidasDe', () => {
    expect(familiaDe('medida:vRMS')).toBe('medida')
    expect(familiaDe(null)).toBeNull()
    expect(formatear(1.23456, 3)).toBe('1.235')
    expect(formatear(null)).toBeNull()
    expect(formatear('x')).toBeNull()
    expect(medidasDe(SENALES, metaDe)).toEqual(['vRMS_S1', 'vRMS_S2', 'aRMS_S1', 'DKW_S1'])
  })

  it('principalesDe: una por rol declarado, la MAYOR de los apoyos, y sin lectura si ninguno lee', () => {
    const tipo = { indicadores: ['medida:vRMS', 'medida:aRMS', 'variador:frecuencia', 'medida:inexistente'] }
    const p = principalesDe({ senales: SENALES, metaDe, tipo })
    expect(p.map((x) => x.clave)).toEqual(['vRMS_S2', 'aRMS_S1', 'frecuencia'])
    expect(p[1].senal.valor).toBeNull()
  })

  it('principalesDe sin declaración: las familias medida en su orden, hasta el tope', () => {
    const p = principalesDe({ senales: SENALES, metaDe, tipo: {}, tope: 2 })
    expect(p.map((x) => x.rol)).toEqual(['medida:vRMS', 'medida:aRMS'])
    expect(p[0].clave).toBe('vRMS_S2')
  })

  it('variacionDe: signo, diferencia y texto; cero bajo medio decimal; null sin promedio', () => {
    expect(variacionDe({ promedio: 2.0 }, { promedio: 1.5 }, { decimales: 2, unidad: 'mm/s' })).toEqual({ signo: 1, diferencia: 0.5, texto: '+0.50 mm/s' })
    expect(variacionDe({ promedio: 1.0 }, { promedio: 1.004 }, { decimales: 2 }).signo).toBe(0)
    expect(variacionDe({ promedio: 1.0 }, { promedio: 1.2 }, { decimales: 1 }).signo).toBe(-1)
    expect(variacionDe(null, { promedio: 1 })).toBeNull()
    expect(variacionDe({ promedio: 1 }, null)).toBeNull()
  })

  it('desvioPorciento y peorEstadoDe/recuentoDe: sin criterio no es en banda', () => {
    expect(desvioPorciento(1.1, 1.0)).toBeCloseTo(10)
    expect(desvioPorciento(null, 1)).toBeNull()
    expect(desvioPorciento(1, 0)).toBeNull()
    expect(peorEstadoDe(SENALES)).toBe('atencion')
    expect(peorEstadoDe([{ estado: null }, { estado: 'sin_dato' }])).toBeNull()
    expect(recuentoDe(SENALES)).toEqual({ total: 5, conLectura: 4, sinLectura: 1, fuera: 0, aviso: 1, enBanda: 1 })
  })

  it('banderasActivas lee el dominio por roles: true/1 activa, null sin lectura, 0 inactiva', () => {
    const tipo = { roles: {
      'bandera:alarma': { familia: 'bandera', ambito: 'apoyo', clave: 'alarma', tipo: 'booleano', label: 'Alarma' },
      'bandera:offset': { familia: 'bandera', ambito: 'apoyo', clave: 'offset', tipo: 'real', label: 'Offset' },
      'variador:fallo': { familia: 'variador', ambito: 'maquina', clave: 'fallo', tipo: 'booleano', label: 'Fallo' },
      'medida:vRMS': { familia: 'medida', ambito: 'apoyo', clave: 'vRMS' },
    } }
    const estado = { dominio: { canales: { S1: { alarma: true, offset: 0.4 }, S2: { alarma: 0 }, S3: { alarma: null } }, variador: { fallo: 1 } } }
    const r = banderasActivas({ estado, tipo })
    expect(r.activas.map((a) => `${a.canal}:${a.clave}`)).toEqual(['S1:alarma', 'null:fallo'])
    expect(r.sinLectura).toBe(1)
    expect(banderasActivas({ estado: {}, tipo })).toEqual({ activas: [], sinLectura: 0 })
  })
})

describe('recolectar', () => {
  const etq = etiquetasDeReporte('es')
  const ventana = { inicio: new Date('2026-09-23T00:00:00Z'), fin: new Date('2026-09-23T06:00:00Z'), etiqueta: 'las últimas 6 horas' }
  const entrada = {
    id: 'm', nombre: 'M', metaDe, esHistorizada: (k) => k === 'vRMS_S1' || k === 'vRMS_S2',
  }
  const tipo = { indicadores: ['medida:vRMS', 'medida:aRMS'], bandaDe: (rol) => (rol === 'medida:vRMS' ? { aviso: 1.8, alarma: 4.5 } : null), roles: {} }
  const plantilla = { claves: ({ medidas }) => medidas }
  const muestras = (n, base) => Array.from({ length: n }, (_, i) => ({ t: new Date(ventana.inicio.getTime() + i * 600_000), valor: base + i * 0.01 }))

  it('lee sólo las claves historizadas que la plantilla pide, resume cada serie, y trae el período anterior de las principales', async () => {
    const leidas = []
    const fuentes = {
      leerMaquina: async () => ({ ok: true, estado: { senales: SENALES, grupos: [{ id: 'S1', label: 'Lado acople' }], dominio: {}, estadoGeneral: 'atencion' } }),
      evaluarRiesgos: () => ({ activos: [], noEvaluables: [], evaluadas: 3 }),
      leerSerie: async (clave, v) => { leidas.push([clave, v.inicio.toISOString()]); return { muestras: clave === 'vRMS_S2' && v.inicio < ventana.inicio ? [] : muestras(6, 1), diasLeidos: 1, diasTotal: 1 } },
      graficar: () => '<svg/>',
    }
    const d = await recolectar({ entrada, tipo, plantilla, ventana, etq, idioma: 'es', fuentes })
    expect(d.ok).toBe(true)
    expect([...d.series.keys()].sort()).toEqual(['vRMS_S1', 'vRMS_S2'])
    expect(d.series.get('vRMS_S1').resumen.promedio).toBeCloseTo(1.025, 3)
    expect(d.series.get('vRMS_S1').svg).toBe('<svg/>')
    expect(d.series.get('vRMS_S1').cobertura).toEqual({ diasLeidos: 1, diasTotal: 1, completa: true })
    /* Principales: vRMS (la mayor, S2) y aRMS (sin serie: no se lee su anterior). */
    expect(d.principales.map((p) => p.clave)).toEqual(['vRMS_S2', 'aRMS_S1'])
    expect(d.anteriores.has('vRMS_S2')).toBe(true)
    expect(d.anteriores.get('vRMS_S2')).toBeNull() // el anterior no trajo muestras: null, no un resumen vacío
    expect(d.anteriores.has('aRMS_S1')).toBe(false)
    /* El período anterior es de la misma duración y termina donde empieza el actual. */
    const anterior = leidas.find(([k, ini]) => k === 'vRMS_S2' && ini !== ventana.inicio.toISOString())
    expect(anterior[1]).toBe('2026-09-22T18:00:00.000Z')
    expect(d.riesgos.evaluadas).toBe(3)
  })

  it('una serie sin muestras sale con nota y sin resumen; sin lectura de la máquina, ok:false con el error', async () => {
    const fuentes = {
      leerMaquina: async () => ({ ok: true, estado: { senales: SENALES, grupos: [], dominio: {}, estadoGeneral: null } }),
      evaluarRiesgos: () => ({ activos: [], noEvaluables: [], evaluadas: 0 }),
      leerSerie: async () => ({ muestras: [], diasLeidos: 0, diasTotal: 1 }),
      graficar: () => '<svg/>',
    }
    const d = await recolectar({ entrada, tipo, plantilla, ventana, etq, idioma: 'es', fuentes })
    expect(d.series.get('vRMS_S1')).toMatchObject({ svg: null, resumen: null, nota: 'Sin muestras de Velocidad eficaz · S1 en las últimas 6 horas.' })

    const caida = await recolectar({ entrada, tipo, plantilla, ventana, etq, idioma: 'es', fuentes: { ...fuentes, leerMaquina: async () => ({ ok: false, error: 'timeout' }) } })
    expect(caida).toEqual({ ok: false, error: 'timeout' })
  })
})
