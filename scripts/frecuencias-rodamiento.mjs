#!/usr/bin/env node
/**
 * scripts/frecuencias-rodamiento.mjs
 * ------------------------------------------------------------------
 * Frecuencias de defecto de un rodamiento, en órdenes y en Hz, y el intervalo
 * de reengrase. Sin servidor: sólo geometría y velocidad.
 *
 * ── PARA QUÉ ──────────────────────────────────────────────────────
 *
 * Es lo que hay que meter en el SM 1281 para encender el diagnóstico de
 * rodamiento, y lo que hay que buscar en el espectro de envolvente: un pico en
 * la frecuencia de BPFO es la pista exterior, en BPFI la interior, etc. Como el
 * motor va con variador, se dan como ÓRDENES (múltiplos del giro) y se pasan a
 * Hz con la rpm del momento.
 *
 * No inventa nada: toda la aritmética vive en
 * `shared/eva/vibraciones/vidaRodamiento.js`, este guion sólo la enseña.
 *
 * ── USO ───────────────────────────────────────────────────────────
 *
 *   node scripts/frecuencias-rodamiento.mjs                 los del catálogo
 *   node scripts/frecuencias-rodamiento.mjs 6205 1750       ese, a 1750 rpm
 *   node scripts/frecuencias-rodamiento.mjs 6205 1750 --carga 1400 --horas 5000
 *       añade vida L10 y horas restantes (necesita la carga P en newtons)
 */
import {
  RODAMIENTOS,
  frecuenciasDefecto,
  intervaloReengraseHoras,
  evaluarVidaRodamiento,
} from '../shared/eva/vibraciones/vidaRodamiento.js'

const c = {
  verde: '\x1b[32m', cian: '\x1b[36m', ambar: '\x1b[33m',
  gris: '\x1b[90m', negrita: '\x1b[1m', reset: '\x1b[0m',
}

const args = process.argv.slice(2)
const opcion = (nombre) => {
  const i = args.indexOf(nombre)
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : null
}
const carga = opcion('--carga')
const horas = opcion('--horas')

// Argumentos posicionales: [rodamiento] [rpm], ignorando los --flag y su valor.
const posic = []
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) { i++; continue }
  posic.push(args[i])
}
const rodamientoPedido = posic[0] ?? null
const rpm = posic[1] ? Number(posic[1]) : null

const f4 = (n) => n.toFixed(4)
const f1 = (n) => n.toFixed(1)

function mostrar(nombre) {
  const b = RODAMIENTOS[nombre]
  if (!b) {
    console.log(`\n${c.ambar}No tengo el rodamiento "${nombre}" en el catálogo.${c.reset}`)
    console.log(`${c.gris}Los conocidos: ${Object.keys(RODAMIENTOS).join(', ')}. ` +
      `Para uno nuevo hace falta Z, Bd (mm) y Pd (mm) — añádelo a RODAMIENTOS.${c.reset}`)
    return
  }
  const fr = frecuenciasDefecto(b)
  console.log(`\n${c.negrita}${c.cian}Rodamiento ${nombre}${c.reset}  ${c.gris}(${b.fuente} · Z=${b.Z} Bd=${b.Bd}mm Pd=${b.Pd}mm calibre=${b.d}mm)${c.reset}`)
  console.log(`  ${c.gris}orden (× frecuencia de giro)${c.reset}`)
  for (const [k, v] of Object.entries(fr)) {
    const enHz = rpm ? `   ${c.verde}${f1(v * rpm / 60)} Hz${c.reset} a ${rpm} rpm` : ''
    console.log(`    ${k.padEnd(5)} ${f4(v)}${enHz}`)
  }

  if (rpm) {
    const tf = intervaloReengraseHoras({ d: b.d, rpm })
    console.log(`  ${c.gris}reengrase${c.reset}     ${tf ? `${f1(tf)} h de marcha ${c.gris}(provisional, factor típico)${c.reset}` : `${c.ambar}no aplicable a esta velocidad${c.reset}`}`)
  }

  if (carga != null && rpm) {
    const v = evaluarVidaRodamiento({ C: b.C, P: carga, rpm, horasAcumuladas: horas ?? 0 })
    if (v.evaluable) {
      console.log(`  ${c.gris}vida L10${c.reset}      ${f1(v.horasL10)} h ${c.gris}(provisional: C de catálogo, P que diste)${c.reset}`)
      if (horas != null) {
        console.log(`  ${c.gris}consumida${c.reset}     ${(v.fraccionConsumida * 100).toFixed(0)} %  ·  restan ${f1(v.horasRestantes)} h`)
      }
    } else {
      console.log(`  ${c.ambar}vida L10: ${v.motivo}${c.reset}`)
    }
  } else if (carga == null && rpm) {
    console.log(`  ${c.gris}vida L10      necesita la carga P (--carga <N>); sin ella no se calcula${c.reset}`)
  }
}

if (rodamientoPedido) {
  mostrar(rodamientoPedido)
} else {
  console.log(`${c.gris}Rodamientos del catálogo. Pasa uno y la rpm para verlos en Hz:` +
    `\n  node scripts/frecuencias-rodamiento.mjs 6205 1750${c.reset}`)
  for (const nombre of Object.keys(RODAMIENTOS)) mostrar(nombre)
}
console.log()
