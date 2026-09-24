/**
 * El criterio de la matriz probabilidad × impacto (Plan 44, D15).
 *
 * Lo que estas pruebas protegen no es la aritmética —es trivial— sino las
 * dos negativas del criterio: que una regla sin serie NO reciba una
 * probabilidad inventada, y que un impacto heredado del nivel viaje
 * marcado como heredado para que el PDF lo pueda declarar.
 */
import { describe, expect, it } from 'vitest'

import {
  CORTES_PROBABILIDAD,
  IMPACTO_POR_NIVEL,
  armarMatriz,
  claveDeRiesgo,
  impactoDeRegla,
  observarFrecuencia,
  probabilidadDeFraccion,
  severidadDeCelda,
} from '@shared/eva/comun/matrizRiesgo.js'
import { REGLAS } from '@shared/eva/vibraciones/riesgosVibracion.js'

const t = (min) => new Date(2026, 8, 23, 10, min, 0)
const serie = (valores) => valores.map((v, i) => ({ t: t(i), valor: v }))

describe('la probabilidad se observa, no se estima', () => {
  it('traduce la fracción de tiempo activo a 1–5 por los cortes declarados', () => {
    expect(probabilidadDeFraccion(0)).toBe(1)
    expect(probabilidadDeFraccion(0.009)).toBe(1)
    expect(probabilidadDeFraccion(0.03)).toBe(2)
    expect(probabilidadDeFraccion(0.1)).toBe(3)
    expect(probabilidadDeFraccion(0.3)).toBe(4)
    expect(probabilidadDeFraccion(0.9)).toBe(5)
    expect(CORTES_PROBABILIDAD.at(-1).valor).toBe(5)
  })

  it('sin fracción utilizable devuelve null, no un 1 que parecería «es raro»', () => {
    expect(probabilidadDeFraccion(null)).toBeNull()
    expect(probabilidadDeFraccion(undefined)).toBeNull()
    expect(probabilidadDeFraccion(NaN)).toBeNull()
    expect(probabilidadDeFraccion(-1)).toBeNull()
  })

  it('cuenta los instantes en que la condición de la regla se cumple', () => {
    const regla = { id: 'r', necesita: ['vRMS'], cuando: (d) => d.vRMS > 4.5 }
    const f = observarFrecuencia(regla, new Map([['vRMS', serie([1, 1, 1, 1, 5, 6, 1, 1, 1, 1])]]))
    expect(f.fraccion).toBe(0.2)
    expect(f.cobertura.evaluados).toBe(10)
  })

  it('con dos señales empareja por cercanía y descarta el instante incompleto', () => {
    const regla = { id: 'r', necesita: ['aRMS', 'aPeak'], cuando: (d) => d.aPeak / d.aRMS > 6 }
    expect(observarFrecuencia(regla, new Map([
      ['aRMS', serie([1, 1, 1, 1])],
      ['aPeak', serie([2, 10, 2, 2])],
    ])).fraccion).toBe(0.25)

    /* La segunda señal cae un día después: ningún instante se puede evaluar,
       y eso se dice en vez de comparar lo que no coincide. */
    const lejos = new Map([['aRMS', serie([1, 1])], ['aPeak', [{ t: new Date(2026, 8, 24), valor: 9 }]]])
    expect(observarFrecuencia(regla, lejos).motivo).toMatch(/ningún instante/)
  })

  it('una regla que no mira señales, o a la que le falta una serie, sale con su motivo', () => {
    expect(observarFrecuencia({ id: 'a', necesita: [] }, new Map()).motivo).toMatch(/configuración|vigilancias/)
    expect(observarFrecuencia({ id: 'b', necesita: ['vRMS'], cuando: () => true }, new Map()).motivo).toMatch(/sin serie/)
  })

  it('un instante que hace reventar la regla no cuenta ni a favor ni en contra', () => {
    const rota = {
      id: 'r',
      necesita: ['vRMS'],
      cuando: (d) => { if (d.vRMS > 3) throw new Error('dato parcial'); return false },
    }
    const f = observarFrecuencia(rota, new Map([['vRMS', serie([1, 1, 9, 1])]]))
    expect(f.cobertura.evaluados).toBe(3)
    expect(f.fraccion).toBe(0)
  })
})

describe('el impacto lo declara la regla', () => {
  it('usa el declarado y marca cuándo se heredó del nivel', () => {
    expect(impactoDeRegla({ impacto: 4, nivel: 'atencion' })).toEqual({ impacto: 4, declarado: true })
    expect(impactoDeRegla({ nivel: 'critico' })).toEqual({ impacto: IMPACTO_POR_NIVEL.critico, declarado: false })
  })

  it('un impacto fuera de 1–5 es un error de quien escribió la regla: se hereda', () => {
    expect(impactoDeRegla({ impacto: 9, nivel: 'atencion' }).declarado).toBe(false)
    expect(impactoDeRegla({ impacto: 2.5, nivel: 'atencion' }).declarado).toBe(false)
  })

  it('TODAS las reglas de vibraciones declaran su impacto (D15)', () => {
    for (const regla of REGLAS) {
      expect(Number.isInteger(regla.impacto), `${regla.id} no declara impacto`).toBe(true)
      expect(regla.impacto, `${regla.id} fuera de 1–5`).toBeGreaterThanOrEqual(1)
      expect(regla.impacto).toBeLessThanOrEqual(5)
    }
  })
})

describe('armarMatriz', () => {
  it('sitúa lo observable, aparta lo que no lo es y avisa si algún impacto se heredó', () => {
    const m = armarMatriz(
      [
        { id: 'a', titulo: 'A', nivel: 'critico', impacto: 5 },
        { id: 'b', titulo: 'B', nivel: 'atencion' },
        { id: 'c', titulo: 'C', nivel: 'atencion', impacto: 3 },
      ],
      new Map([
        ['a', { fraccion: 0.3, cobertura: { evaluados: 10 } }],
        ['b', { fraccion: 0.001, cobertura: { evaluados: 10 } }],
      ]),
    )
    expect(m.celdas.map((c) => c.id)).toEqual(['a', 'b'])
    expect(m.celdas[0]).toMatchObject({ probabilidad: 4, impacto: 5, severidad: 'critico' })
    expect(m.celdas[1]).toMatchObject({ probabilidad: 1, impactoDeclarado: false })
    expect(m.algunoHeredado).toBe(true)
    /* La que no se pudo observar NO recibe probabilidad: recibe un motivo. */
    expect(m.sinObservar).toHaveLength(1)
    expect(m.sinObservar[0].id).toBe('c')
    expect(m.sinObservar[0].probabilidad).toBeUndefined()
    expect(m.sinObservar[0].motivo).toMatch(/sin serie/)
  })

  it('tres apoyos con la MISMA regla son tres riesgos distintos, no uno (F7)', () => {
    /*
     * ── EL DEFECTO QUE ESTA PRUEBA FIJA ───────────────────────────
     *
     * Una regla de ámbito `canal` se evalúa una vez por apoyo, y los tres
     * riesgos que produce llevan el MISMO `id` con distinto `canal`. La
     * matriz los indexaba por `id`, así que los tres compartían entrada:
     * contra planta (F7) los nueve riesgos del PDF decían «Lado acople» —el
     * primero— y la frecuencia observada de un apoyo se habría atribuido a
     * los otros dos, que es peor que el rótulo equivocado.
     */
    const mismaRegla = (canal) => ({ id: 'rodamientos-sin-vigilar', canal, titulo: 'Sin vigilar', nivel: 'critico', impacto: 4 })
    const riesgos = [mismaRegla('S1'), mismaRegla('S2'), mismaRegla('S3')]

    expect(new Set(riesgos.map(claveDeRiesgo)).size, 'las tres claves tienen que ser distintas').toBe(3)
    expect(claveDeRiesgo(riesgos[0])).toBe('rodamientos-sin-vigilar@S1')
    /* Una regla de máquina (sin canal) conserva su id a secas. */
    expect(claveDeRiesgo({ id: 'variador-en-fallo', canal: null })).toBe('variador-en-fallo')

    /* Cada apoyo recibe SU frecuencia, no la del primero. */
    const m = armarMatriz(riesgos, new Map([
      ['rodamientos-sin-vigilar@S1', { fraccion: 0.9, cobertura: { evaluados: 10 } }],
      ['rodamientos-sin-vigilar@S3', { fraccion: 0.005, cobertura: { evaluados: 10 } }],
    ]))
    expect(m.celdas.map((c) => [c.canal, c.probabilidad])).toEqual([['S1', 5], ['S3', 1]])
    /* Y el que no se pudo observar sale con SU canal, no con el del primero. */
    expect(m.sinObservar.map((s) => s.canal)).toEqual(['S2'])
  })

  it('la severidad de una celda sale del producto, no del nivel de la regla', () => {
    expect(severidadDeCelda(3, 5)).toBe('critico')
    expect(severidadDeCelda(3, 3)).toBe('atencion')
    expect(severidadDeCelda(1, 5)).toBe('informativo')
  })
})
