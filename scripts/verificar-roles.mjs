#!/usr/bin/env node
/**
 * scripts/verificar-roles.mjs
 * ------------------------------------------------------------------
 * La jerarquía de roles del tablero. Plan 35 F1.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Porque esta tabla decide quién puede accionar una bomba, y sus dos modos de
 * fallo son asimétricos:
 *
 *   DE MENOS   un administrador que no puede escribir en el cuaderno. Molesto
 *              y visible: alguien se queja el primer día.
 *   DE MÁS     un visualizador que puede accionar la planta. **No se ve**: la
 *              pantalla funciona, nadie se queja, y el día que importa ya es
 *              tarde.
 *
 * Así que la mitad de lo que hay aquí comprueba lo que NO debe pasar, y en
 * particular que un rol desconocido —una errata en `AUTH_USUARIOS`— no abra
 * ninguna puerta.
 *
 * El defecto que motivó la fase era del primer tipo, y estaba en producción
 * esperando: medido el 21-09-2026 con los tres roles en vivo, un
 * `administrador` recibía 403 al escribir en el cuaderno, al accionar la bomba
 * y al cerrar un caso.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-roles.mjs
 */
import assert from 'node:assert/strict'

import {
  alcanza,
  esRolConocido,
  ROL,
  ROLES,
  rolesAlcanzados,
  rolPrincipal,
} from '../shared/roles.js'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

let passed = 0
const fallos = []

function check(nombre, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(`${nombre} — ${error.message}`)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
  }
}

console.log(`\n${c.negrita}La jerarquía de roles${c.reset}\n`)

/* ── La cadena ───────────────────────────────────────────────────────── */

check('cada rol se alcanza a sí mismo', () => {
  for (const rol of ROLES) {
    assert.ok(alcanza([rol], rol), `«${rol}» no se alcanza a sí mismo`)
  }
})

check('el administrador alcanza los tres: es jerarquía PURA', () => {
  /*
   * Decidido el 21-09-2026. La alternativa —que gestionar y accionar fueran
   * competencias separadas— se descartó: quien lee «acceso completo» espera
   * poder hacer lo que hace su subordinado.
   *
   * La consecuencia se fija aquí a propósito: un administrador PUEDE accionar
   * la planta. Si algún día eso deja de ser cierto, esta prueba falla y obliga
   * a reabrir la decisión en vez de descubrirla en un incidente.
   */
  for (const rol of ROLES) {
    assert.ok(alcanza([ROL.ADMINISTRADOR], rol), `el administrador no alcanza «${rol}»`)
  }
})

check('el operador alcanza al visualizador, y no al administrador', () => {
  assert.ok(alcanza([ROL.OPERADOR], ROL.VISUALIZADOR))
  assert.ok(alcanza([ROL.OPERADOR], ROL.OPERADOR))
  assert.equal(alcanza([ROL.OPERADOR], ROL.ADMINISTRADOR), false)
})

check('el visualizador NO alcanza nada por encima de sí mismo', () => {
  /* El que más caro sale equivocar: un visualizador que accione la planta no
     produce ningún síntoma hasta el día que importa. */
  assert.ok(alcanza([ROL.VISUALIZADOR], ROL.VISUALIZADOR))
  assert.equal(alcanza([ROL.VISUALIZADOR], ROL.OPERADOR), false)
  assert.equal(alcanza([ROL.VISUALIZADOR], ROL.ADMINISTRADOR), false)
})

check('el defecto que motivó la fase: el admin alcanza lo del operador', () => {
  /*
   * Medido el 21-09-2026 contra el backend real, con `exigirRol` comparando
   * por igualdad: `POST /api/cuaderno`, `POST /api/control/bomba` y
   * `POST /api/casos` devolvían 403 a un administrador.
   */
  for (const accion of [ROL.OPERADOR, ROL.VISUALIZADOR]) {
    assert.ok(alcanza([ROL.ADMINISTRADOR], accion))
  }
})

/* ── Deny by default ─────────────────────────────────────────────────── */

check('un rol DESCONOCIDO no alcanza nada, ni a sí mismo', () => {
  /*
   * No es un caso de borde: es lo que pasa con una errata en `AUTH_USUARIOS`
   * —`operadores`, `Administrador` con mayúscula— y es justo cuando más caro
   * sale equivocarse hacia el lado permisivo.
   */
  assert.equal(alcanza(['operadores'], ROL.OPERADOR), false)
  assert.equal(alcanza(['Administrador'], ROL.ADMINISTRADOR), false)
  assert.equal(alcanza(['inventado'], 'inventado'), false)
})

check('exigir un rol que no existe NO lo concede a nadie', () => {
  /* Una ruta que pida `exigirRol('supervisor')` por error tiene que cerrarse,
     no abrirse a todos. */
  assert.equal(alcanza([ROL.ADMINISTRADOR], 'supervisor'), false)
})

check('sin roles, o con una lista que no es lista, no se alcanza nada', () => {
  for (const entrada of [null, undefined, [], 'administrador', {}, 0]) {
    assert.equal(alcanza(entrada, ROL.VISUALIZADOR), false, `entrada: ${JSON.stringify(entrada)}`)
  }
})

check('un rol desconocido entre otros válidos no invalida los válidos', () => {
  assert.ok(alcanza([ROL.OPERADOR, 'tipografiado'], ROL.VISUALIZADOR))
  assert.equal(alcanza([ROL.VISUALIZADOR, 'tipografiado'], ROL.OPERADOR), false)
})

/* ── Varios roles a la vez ───────────────────────────────────────────── */

check('`AUTH_USUARIOS` admite varios roles, y suman', () => {
  /* El formato ya lo soporta: `ana:supervisor,operador:<hash>`. Con jerarquía
     hace falta menos, pero seguir soportándolo no cuesta nada. */
  assert.ok(alcanza([ROL.VISUALIZADOR, ROL.OPERADOR], ROL.OPERADOR))
})

/* ── Lo derivado ─────────────────────────────────────────────────────── */

check('`rolesAlcanzados` expande la herencia, en orden de capacidad', () => {
  assert.deepEqual(rolesAlcanzados([ROL.ADMINISTRADOR]), [
    ROL.ADMINISTRADOR, ROL.OPERADOR, ROL.VISUALIZADOR,
  ])
  assert.deepEqual(rolesAlcanzados([ROL.OPERADOR]), [ROL.OPERADOR, ROL.VISUALIZADOR])
  assert.deepEqual(rolesAlcanzados([]), [])
  assert.deepEqual(rolesAlcanzados(['inventado']), [])
})

check('`rolPrincipal` da el más alto, para rotular y no para decidir', () => {
  assert.equal(rolPrincipal([ROL.VISUALIZADOR, ROL.ADMINISTRADOR]), ROL.ADMINISTRADOR)
  assert.equal(rolPrincipal([ROL.VISUALIZADOR]), ROL.VISUALIZADOR)
  assert.equal(rolPrincipal(['inventado']), null)
  assert.equal(rolPrincipal(null), null)
})

check('`esRolConocido` distingue los tres de cualquier otra cosa', () => {
  for (const rol of ROLES) assert.ok(esRolConocido(rol))
  for (const no of ['supervisor', 'ADMIN', '', null, undefined]) {
    assert.equal(esRolConocido(no), false, `«${no}» no debería ser conocido`)
  }
})

/* ── La forma de la tabla ────────────────────────────────────────────── */

check('son TRES roles, y están en orden descendente de capacidad', () => {
  assert.equal(ROLES.length, 3)
  /* El orden importa para `rolPrincipal` y para presentarlos. Si alguien
     añade un cuarto, esto obliga a decidir dónde va en vez de dejarlo al
     final por defecto. */
  assert.deepEqual([...ROLES], [ROL.ADMINISTRADOR, ROL.OPERADOR, ROL.VISUALIZADOR])
})

check('la tabla es inmutable: nadie amplía sus permisos en caliente', () => {
  assert.throws(() => { ROLES.push('superusuario') })
  assert.throws(() => { ROL.ADMINISTRADOR = 'otro' })
})

/* ── Resumen ─────────────────────────────────────────────────────────── */

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa shared/roles.js.${c.reset}`)
  process.exit(1)
}
console.log(
  `${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `${ROLES.length} roles, con jerarquía pura y deny by default.${c.reset}`,
)
