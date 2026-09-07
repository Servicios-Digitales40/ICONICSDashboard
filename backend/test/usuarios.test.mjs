/**
 * El censo de usuarios (`http/usuarios.mjs`, Plan 22 F6).
 *
 * Dos cosas distintas, y las dos importan por el mismo motivo: son las que
 * deciden si una persona puede entrar el día que se encienda
 * `AUTH_HABILITADA`, y un fallo aquí no se ve hasta ese día.
 *
 *  · El derivado de `scrypt` — que la clave correcta entre y ninguna otra.
 *  · El parseo de `AUTH_USUARIOS` — que una entrada mal escrita **falle al
 *    arrancar**, y no deje a alguien fuera en silencio.
 */
import { describe, expect, it } from 'vitest'

import { claveCoincide, hashDeClave, leerUsuarios } from '../http/usuarios.mjs'

describe('hashDeClave y claveCoincide', () => {
  it('la clave correcta coincide', async () => {
    const hash = await hashDeClave('la-clave-de-ana')
    expect(await claveCoincide('la-clave-de-ana', hash)).toBe(true)
  })

  it('otra clave no', async () => {
    const hash = await hashDeClave('la-clave-de-ana')
    expect(await claveCoincide('la-clave-de-anb', hash)).toBe(false)
    expect(await claveCoincide('', hash)).toBe(false)
  })

  it('la misma clave da hashes DISTINTOS: la sal es por usuario', async () => {
    // Sin sal por usuario, dos personas con la misma contraseña se delatan
    // mutuamente con sólo mirar el entorno.
    const a = await hashDeClave('igual')
    const b = await hashDeClave('igual')

    expect(a).not.toBe(b)
    expect(await claveCoincide('igual', a)).toBe(true)
    expect(await claveCoincide('igual', b)).toBe(true)
  })

  it('el hash no contiene la clave por ningún lado', async () => {
    const hash = await hashDeClave('contrasena-reconocible')
    expect(hash).not.toContain('contrasena-reconocible')
    expect(hash.startsWith('scrypt$')).toBe(true)
  })

  it('un hash con formato roto devuelve false en vez de lanzar', async () => {
    // Delante hay alguien intentando entrar, no un desarrollador: una
    // excepción aquí sería un 500 que cuenta que algo interno está mal.
    for (const roto of ['', 'nada', 'scrypt$solo-una-parte', 'otro$sal$hash', null, undefined]) {
      expect(await claveCoincide('x', roto)).toBe(false)
    }
  })
})

describe('leerUsuarios', () => {
  const HASH = 'scrypt$' + 'a'.repeat(32) + '$' + 'b'.repeat(128)

  it('sin variable, censo vacío y sin error: es el estado por defecto', () => {
    expect(leerUsuarios(undefined).size).toBe(0)
    expect(leerUsuarios('').size).toBe(0)
    expect(leerUsuarios('   ').size).toBe(0)
  })

  it('lee varias entradas con sus roles', () => {
    const censo = leerUsuarios(`ana:operador,supervisor:${HASH};juan:operador:${HASH}`)

    expect([...censo.keys()]).toEqual(['ana', 'juan'])
    expect(censo.get('ana').roles).toEqual(['operador', 'supervisor'])
    expect(censo.get('juan').roles).toEqual(['operador'])
  })

  it('tolera espacios alrededor, que es como queda al partir una línea larga', () => {
    const censo = leerUsuarios(` ana : operador : ${HASH} ; juan : operador : ${HASH} `)
    expect([...censo.keys()]).toEqual(['ana', 'juan'])
  })

  it('una entrada con campos de menos falla, y dice cómo generarla', () => {
    expect(() => leerUsuarios(`ana:${HASH}`)).toThrow(/hash-clave/)
  })

  it('un id repetido falla: cuál gana dependería del orden', () => {
    expect(() => leerUsuarios(`ana:operador:${HASH};ana:supervisor:${HASH}`))
      .toThrow(/aparece dos veces/)
  })

  it('un usuario sin roles falla: entraría y no podría hacer nada', () => {
    expect(() => leerUsuarios(`ana::${HASH}`)).toThrow(/ningún rol/)
  })

  it('una contraseña en claro donde va el hash falla, y lo dice con esas palabras', () => {
    // Es el error que alguien va a cometer, y el que peor se descubre solo:
    // el servidor arrancaría y nadie podría entrar.
    expect(() => leerUsuarios('ana:operador:micontrasena')).toThrow(/en claro/)
  })

  it('el mensaje de error no vuelca el hash entero en el log', () => {
    // Un hash no es un secreto como la clave, pero llenar una línea de error
    // con 160 caracteres de hexadecimal esconde el mensaje que importa.
    try {
      leerUsuarios(`ana:${HASH}`)
      throw new Error('debería haber fallado')
    } catch (error) {
      expect(error.message).not.toContain(HASH)
      expect(error.message).toContain('…')
    }
  })
})
