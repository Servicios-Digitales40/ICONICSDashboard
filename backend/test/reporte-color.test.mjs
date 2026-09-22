/**
 * El color de una fila del PDF sale de la CLAVE de estado, no del texto (B11).
 *
 * Hasta el 22-09-2026 `reporte.mjs` buscaba «crit», «ok» o «normal» dentro
 * del rótulo. Las etiquetas del dominio son «Fuera de límite», «En aviso»,
 * «En banda», «Sin dato»: la primera y la tercera no casaban con nada y
 * salían en gris, igual que «sin criterio». Un PDF que pinta gris una señal
 * fuera de límite es peor que uno sin color.
 *
 * Se prueba la función exportada, sin dibujar: dibujar exigiría leer el PDF.
 */
import { describe, expect, it } from 'vitest'
import { colorDeFila } from '../ia/reporte.mjs'
import { ESTADOS } from '../../shared/eva/tanque/estado.js'

const ROJO = '#C0392B'
const AMBAR = '#C07A00'
const VERDE = '#1E7E34'

describe('colorDeFila', () => {
  it('con clave, el color sale de la clave y el texto no importa', () => {
    expect(colorDeFila({ clave: 'critico', estado: 'Fuera de límite' })).toBe(ROJO)
    expect(colorDeFila({ clave: 'atencion', estado: 'En aviso' })).toBe(AMBAR)
    expect(colorDeFila({ clave: 'nominal', estado: 'En banda' })).toBe(VERDE)
    /* Un texto que engañaría al respaldo por palabras no gana a la clave. */
    expect(colorDeFila({ clave: 'nominal', estado: 'crítico según alguien' })).toBe(VERDE)
  })

  it('las etiquetas del dominio que antes salían en gris ya no salen en gris', () => {
    /* Las cinco del dominio, con su clave: ninguna «pide atención» queda gris. */
    for (const e of Object.values(ESTADOS)) {
      const color = colorDeFila({ clave: e.key, estado: e.label })
      if (e.key === 'critico') expect(color).toBe(ROJO)
      else if (e.key === 'atencion') expect(color).toBe(AMBAR)
      else if (e.key === 'nominal') expect(color).toBe(VERDE)
      else expect(color).not.toBe(ROJO)
    }
  })

  it('sin dato y en reposo van en gris: no son un veredicto', () => {
    expect(colorDeFila({ clave: 'sin_dato', estado: 'Sin dato' })).not.toBe(VERDE)
    expect(colorDeFila({ clave: 'reposo', estado: 'En reposo' })).not.toBe(VERDE)
  })

  it('sin clave cae al respaldo por palabras, que ahora también entiende las etiquetas del dominio', () => {
    expect(colorDeFila({ estado: 'Fuera de límite' })).toBe(ROJO)
    expect(colorDeFila({ estado: 'En banda' })).toBe(VERDE)
    expect(colorDeFila({ estado: 'zona D · daño' })).toBe(ROJO)
    expect(colorDeFila({ estado: '—' })).not.toBe(VERDE)
    expect(colorDeFila('En aviso')).toBe(AMBAR)
  })

  it('una clave que no conoce no inventa color: respaldo, y si no, gris', () => {
    expect(colorDeFila({ clave: 'inventada', estado: '—' })).not.toBe(VERDE)
    expect(colorDeFila({ clave: 'inventada', estado: 'Fuera de límite' })).toBe(ROJO)
  })
})
