#!/usr/bin/env node
/**
 * scripts/hash-clave.mjs
 * ------------------------------------------------------------------
 * Genera la entrada de `AUTH_USUARIOS` para una persona (Plan 22 F6).
 *
 * ── POR QUÉ ESTO EXISTE ────────────────────────────────────────────
 *
 * Porque sin él, `AUTH_USUARIOS` es una variable que nadie puede rellenar. El
 * formato pide un derivado de `scrypt` con su sal, y pedirle eso a alguien a
 * mano garantiza dos cosas: que lo hará mal la primera vez, y que a la segunda
 * pondrá la contraseña en claro «mientras tanto». Es el mismo criterio por el
 * que F5 documenta cómo exportar el certificado de `bms-server`: la pieza que
 * bloquea a quien lo intenta no es la difícil, es la que nadie escribió.
 *
 * ── LA CONTRASEÑA NO SE PASA POR ARGUMENTO ─────────────────────────
 *
 * Se pide por teclado, sin eco. Un argumento de línea de órdenes queda en el
 * historial del shell, y en Linux lo ve cualquiera con `ps` mientras el
 * proceso vive. Para eso se admite además leerla de la entrada estándar, que
 * es como se automatiza sin dejar rastro:
 *
 *     echo 'la-clave' | node scripts/hash-clave.mjs ana supervisor,operador
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *     node scripts/hash-clave.mjs <id> <roles separados por comas>
 *     node scripts/hash-clave.mjs ana supervisor,operador
 *
 * Imprime la línea lista para pegar en `AUTH_USUARIOS`. No escribe en ningún
 * archivo: dónde vive el entorno es decisión del despliegue, no de un guion.
 */
import { createInterface } from 'node:readline'

import { hashDeClave } from '../backend/http/usuarios.mjs'

const c = { gris: '\x1b[90m', negrita: '\x1b[1m', amarillo: '\x1b[33m', reset: '\x1b[0m' }

const [id, roles] = process.argv.slice(2)

if (!id || !roles) {
  console.error(
    `Uso: node scripts/hash-clave.mjs <id> <roles>\n\n` +
    `  node scripts/hash-clave.mjs ana supervisor,operador\n` +
    `  node scripts/hash-clave.mjs juan operador\n\n` +
    `Los roles van separados por comas. Hoy el único que comprueba el código es\n` +
    `"operador" (\`exigirRol('operador')\` en las rutas que accionan la planta).`
  )
  process.exit(1)
}

if (id.includes(':') || id.includes(';') || roles.includes(':') || roles.includes(';')) {
  console.error(
    'Ni el id ni los roles pueden llevar ":" ni ";": son los separadores del formato, ' +
    'y con uno dentro la entrada se parte por donde no toca.'
  )
  process.exit(1)
}

/**
 * La contraseña, sin eco.
 *
 * Si la entrada no es un terminal —una tubería— se lee tal cual: es el modo
 * automatizable, y ahí no hay eco que ocultar.
 */
async function pedirClave() {
  if (!process.stdin.isTTY) {
    const trozos = []
    for await (const t of process.stdin) trozos.push(t)
    return trozos.join('').replace(/\r?\n$/, '')
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })

  // `_writeToOutput` vacío mientras se escribe la clave: readline no trae
  // modo oculto, y esto es la forma documentada de conseguirlo.
  const escribir = rl._writeToOutput.bind(rl)
  process.stdout.write('Contraseña: ')
  rl._writeToOutput = () => {}

  const clave = await new Promise(resolve => rl.question('', resolve))
  rl._writeToOutput = escribir
  process.stdout.write('\n')
  rl.close()
  return clave
}

const clave = await pedirClave()

if (!clave) {
  console.error('\nSin contraseña no hay nada que derivar.')
  process.exit(1)
}

if (clave.length < 12) {
  // Aviso, no rechazo: quién decide la política de contraseñas de una planta
  // no es este guion. Pero decirlo en el momento sí es su trabajo.
  console.error(
    `${c.amarillo}Aviso: ${clave.length} caracteres. Esto se protege con scrypt, que encarece ` +
    `probar a lo bruto, pero una clave corta sigue siendo una clave corta.${c.reset}\n`
  )
}

const hash = await hashDeClave(clave)

console.log(`${c.gris}Añade esta entrada a AUTH_USUARIOS (separa varias con ";"):${c.reset}\n`)
console.log(`${c.negrita}${id}:${roles}:${hash}${c.reset}\n`)
console.log(
  `${c.gris}Recuerda que AUTH_HABILITADA=true exige además AUTH_SECRETO (32+ caracteres).\n` +
  `Ver backend/README.md, sección de sesión de usuario.${c.reset}`
)
