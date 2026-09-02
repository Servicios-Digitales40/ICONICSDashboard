#!/usr/bin/env node
/**
 * scripts/purgar-casos-invalidos.mjs
 * ------------------------------------------------------------------
 * Elimina, de `datos/aprendizaje.json`, las intervenciones cuyo `sistema` no
 * es uno de `SISTEMA_IDS` ni `null` — Plan 17 Fase 0 (G4), decisión §3·7.
 *
 * ── POR QUÉ EXISTE, Y POR QUÉ NO ES UNA MIGRACIÓN ───────────────────
 *
 * La auditoría del 01-09-2026 midió 2 de 5 intervenciones reales con
 * `sistema: "grupo de bombeo"`, un id que no existe. El filtro de
 * `casos.mjs` compara `sistema` por igualdad exacta y va ANTES de puntuar
 * (Plan 16 §2·2), así que esos registros son invisibles para toda búsqueda,
 * en silencio, desde el día en que se escribieron.
 *
 * El plan decide PURGAR, no migrar: el sistema no está en producción y esos
 * registros son de prueba. Reasignarlos a un sistema adivinado inventaría un
 * dato que nadie confirmó. La ventana para purgar sin coste se cierra el día
 * que entre el primer caso real — a partir de ahí, un id inválido es un
 * incidente que investigar, no basura que tirar. La validación de
 * `registrar_intervencion` (Fase 0, ver `backend/ia/herramientas/aprendizaje/
 * index.mjs`) impide que vuelva a ocurrir hacia adelante; este script es
 * sólo el barrido hacia atrás, y una vez ejecutado no debería hacer falta
 * otra vez.
 *
 * ── QUÉ HACE, PASO A PASO ────────────────────────────────────────────
 *
 *  1. Lee `datos/aprendizaje.json` con el mismo lector que usan las
 *     herramientas (`leerAprendizaje`) — ninguna copia propia de la ruta.
 *  2. Sin argumentos: sólo LISTA qué encontraría y por qué. No toca nada.
 *  3. Con `--ejecutar`: escribe una copia de seguridad con marca de tiempo
 *     junto al archivo, y sólo entonces sobrescribe el original sin los
 *     registros inválidos.
 *
 * No se ejecuta solo. `--ejecutar` es un paso deliberado, después de leer el
 * informe — mismo criterio que `revisar-propuestas.mjs aprobar`.
 *
 * ── USO ───────────────────────────────────────────────────────────
 *
 *   node scripts/purgar-casos-invalidos.mjs             ver qué se borraría
 *   node scripts/purgar-casos-invalidos.mjs --ejecutar   borrar de verdad
 */
import { writeFile } from 'node:fs/promises'

import { SISTEMA_IDS } from '../shared/eva/comun/sistemas.js'
import { RUTA_APRENDIZAJE, leerAprendizaje } from '../backend/ia/herramientas/aprendizaje/index.mjs'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', ambar: '\x1b[33m',
  gris: '\x1b[90m', negrita: '\x1b[1m', reset: '\x1b[0m',
}

function esValido(sistema) {
  return sistema === null || sistema === undefined || SISTEMA_IDS.includes(sistema)
}

const almacen = await leerAprendizaje()
const total = almacen.intervenciones.length

const invalidas = almacen.intervenciones.filter((i) => !esValido(i.sistema))
const validas = almacen.intervenciones.filter((i) => esValido(i.sistema))

console.log(`\n${c.negrita}Purga de casos con sistema inválido${c.reset}`)
console.log(`${c.gris}${RUTA_APRENDIZAJE} · ${total} intervención(es) en total${c.reset}`)
console.log(`${c.gris}Sistemas válidos: ${SISTEMA_IDS.join(', ')} (y sin sistema = toda la planta)${c.reset}\n`)

if (!invalidas.length) {
  console.log(`${c.verde}Nada que purgar: todas las intervenciones tienen un \`sistema\` válido.${c.reset}\n`)
  process.exit(0)
}

console.log(`${c.rojo}${c.negrita}${invalidas.length} de ${total} intervención(es) con un \`sistema\` que no existe:${c.reset}`)
for (const i of invalidas) {
  console.log(`\n  ${c.rojo}${i.id}${c.reset}  ${c.gris}${i.fecha}${c.reset}`)
  console.log(`    sistema: ${c.ambar}"${i.sistema}"${c.reset}`)
  console.log(`    síntoma: ${i.sintoma}`)
}

const ejecutar = process.argv.includes('--ejecutar')

if (!ejecutar) {
  console.log(`\n${c.gris}Esto no ha tocado nada. Para purgar de verdad:${c.reset}`)
  console.log(`  node scripts/purgar-casos-invalidos.mjs --ejecutar\n`)
  process.exit(1)
}

const marca = new Date().toISOString().replace(/[:.]/g, '-')
const rutaCopia = `${RUTA_APRENDIZAJE}.antes-de-purga-${marca}.json`

await writeFile(rutaCopia, JSON.stringify(almacen, null, 2), 'utf8')
console.log(`\n${c.gris}Copia de seguridad: ${rutaCopia}${c.reset}`)

const purgado = { ...almacen, intervenciones: validas }
await writeFile(RUTA_APRENDIZAJE, JSON.stringify(purgado, null, 2), 'utf8')

console.log(`${c.verde}${c.negrita}Purgadas ${invalidas.length} intervención(es). Quedan ${validas.length}.${c.reset}`)
console.log(`${c.gris}La copia de seguridad conserva las ${total} originales, por si hace falta revisar alguna.${c.reset}\n`)
