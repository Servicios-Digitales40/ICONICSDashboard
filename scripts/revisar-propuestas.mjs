#!/usr/bin/env node
/**
 * scripts/revisar-propuestas.mjs
 * ------------------------------------------------------------------
 * Las reglas que el asistente ha propuesto, para que una persona decida.
 *
 * ── POR QUÉ EXISTE ESTE PASO, Y POR QUÉ NO SE AUTOMATIZA ───────────
 *
 * Porque una regla de riesgo decide si una pantalla de planta dice «riesgo de
 * derrame», y equivocarse cuesta en las dos direcciones: una regla inventada
 * que salta sin motivo se desactiva a la semana y se lleva por delante la
 * credibilidad de las que sí valen; una que calle cuando debía hablar deja
 * tranquilo a quien no debería estarlo.
 *
 * Y hay una razón medida, no teórica: contra este mismo servidor, el modelo
 * local dijo tres veces seguidas «velocidad eficaz 1,13 mm/s» leyendo la
 * ACELERACIÓN —otra magnitud, otras unidades— con total aplomo. Quien confunde
 * un campo no puede firmar el criterio con el que se para una bomba.
 *
 * Lo que el asistente SÍ aporta, y es mucho: mira semanas de datos, ve un
 * patrón que a nadie se le había ocurrido, y lo deja redactado con su
 * evidencia para que alguien lo juzgue en treinta segundos en vez de
 * descubrirlo en seis meses.
 *
 * ── LO QUE ESTE SCRIPT NO HACE ─────────────────────────────────────
 *
 * Aprobar una propuesta **no la convierte en regla**. Marca la decisión, y
 * quien la aprueba escribe la regla en `shared/eva/tanque/riesgos.js` con su prueba
 * en `scripts/verificar-riesgos.mjs`. Ese último paso es a mano a propósito:
 * una regla sin prueba es una regla que nadie ha comprobado que dispare cuando
 * debe y calle cuando no.
 *
 * ── USO ───────────────────────────────────────────────────────────
 *
 *   node scripts/revisar-propuestas.mjs                 ver las pendientes
 *   node scripts/revisar-propuestas.mjs --todas         ver también las cerradas
 *   node scripts/revisar-propuestas.mjs aprobar prop-x  marcar como aprobada
 *   node scripts/revisar-propuestas.mjs rechazar prop-x "por qué"
 *   node scripts/revisar-propuestas.mjs aplicada prop-x cuando ya es código
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import { pendientes } from '../shared/eva/comun/aprendizaje.js'
// Misma ruta y mismo lector que usan las herramientas del asistente y
// `casos.mjs` (Plan 16) — no una copia propia. Duplicar la ruta fue lo que
// una vez dejó al asistente guardando en un sitio y a este script mirando
// en otro, sin un solo error por ningún lado. Ver la cabecera de
// `backend/ia/herramientas/aprendizaje/index.mjs`.
import { RUTA_APRENDIZAJE, leerAprendizaje } from '../backend/ia/herramientas/aprendizaje/index.mjs'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', ambar: '\x1b[33m',
  gris: '\x1b[90m', negrita: '\x1b[1m', reset: '\x1b[0m',
}

const RUTA = RUTA_APRENDIZAJE
const leer = leerAprendizaje

async function guardar(almacen) {
  await mkdir(dirname(RUTA), { recursive: true })
  await writeFile(RUTA, JSON.stringify(almacen, null, 2), 'utf8')
}

const COLOR = { critico: c.rojo, atencion: c.ambar, informativo: c.gris }

function mostrar(p) {
  const col = COLOR[p.severidad] ?? c.gris
  console.log(`\n${col}${c.negrita}${p.titulo}${c.reset}`)
  console.log(`${c.gris}${p.id} · ${p.severidad} · ${p.sistema ?? 'sin sistema'} · ${p.estado} · propuesta por ${p.origen}${c.reset}`)
  console.log(`\n  ${c.negrita}Cuándo${c.reset}      ${p.condicion}`)
  console.log(`  ${c.negrita}Señales${c.reset}     ${p.senales.join(', ')}`)
  console.log(`  ${c.negrita}Evidencia${c.reset}   ${p.evidencia}`)
  console.log(`  ${c.negrita}Llevaría a${c.reset}  ${p.consecuencia}`)
  if (p.accion) console.log(`  ${c.negrita}Revisar${c.reset}     ${p.accion}`)
  if (p.motivo) console.log(`  ${c.gris}Motivo del rechazo: ${p.motivo}${c.reset}`)
}

const [accion, id, ...resto] = process.argv.slice(2)
const almacen = await leer()

/* ── Cambiar el estado de una ────────────────────────────────────── */

if (['aprobar', 'rechazar', 'aplicada'].includes(accion)) {
  const p = almacen.propuestas.find((x) => x.id === id)
  if (!p) {
    console.log(`\n${c.rojo}No hay ninguna propuesta con id «${id}».${c.reset}\n`)
    process.exit(1)
  }

  p.estado = accion === 'aprobar' ? 'aprobada' : accion === 'rechazar' ? 'rechazada' : 'aplicada'
  p.decidida = new Date().toISOString()
  if (accion === 'rechazar') p.motivo = resto.join(' ') || 'sin motivo declarado'

  await guardar(almacen)
  mostrar(p)

  if (p.estado === 'aprobada') {
    console.log(`\n${c.ambar}${c.negrita}Aprobada — pero todavía NO vigila nada.${c.reset}`)
    console.log('Falta escribirla como regla, y ese paso es a mano a propósito:')
    console.log(`  ${c.gris}1.${c.reset} añádela a shared/eva/tanque/riesgos.js`)
    console.log(`  ${c.gris}2.${c.reset} escribe su prueba en scripts/verificar-riesgos.mjs —incluida`)
    console.log(`     la de que NO salta cuando no debe, que es la mitad que se olvida—`)
    console.log(`  ${c.gris}3.${c.reset} node scripts/revisar-propuestas.mjs aplicada ${p.id}`)
  }
  console.log()
  process.exit(0)
}

/* ── Listar ──────────────────────────────────────────────────────── */

const todas = accion === '--todas'
const lista = todas ? almacen.propuestas : pendientes(almacen)

console.log(`\n${c.negrita}Propuestas del asistente${c.reset}`)
console.log(`${c.gris}${RUTA} · ${almacen.propuestas.length} en total, ${pendientes(almacen).length} pendientes${c.reset}`)

if (!lista.length) {
  console.log(`\n${c.gris}${todas ? 'No hay ninguna propuesta todavía.' : 'Nada pendiente de revisar.'}${c.reset}`)
  console.log(`${c.gris}El asistente las crea con la herramienta proponer_regla cuando observa`)
  console.log(`un patrón que hoy no está cubierto.${c.reset}\n`)
  process.exit(0)
}

for (const p of lista) mostrar(p)

console.log(`\n${c.gris}Para decidir:${c.reset}`)
console.log(`  node scripts/revisar-propuestas.mjs aprobar  ${lista[0].id}`)
console.log(`  node scripts/revisar-propuestas.mjs rechazar ${lista[0].id} "el caudal ya lo cubre obstruccion"`)
console.log()
