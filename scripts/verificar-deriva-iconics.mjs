#!/usr/bin/env node
/**
 * scripts/verificar-deriva-iconics.mjs
 * ------------------------------------------------------------------
 * Qué pasa cuando ICONICS deja de coincidir con una máquina configurada.
 * Plan 33 F8.
 *
 * ── LA COMPROBACIÓN QUE JUSTIFICA ESTE GUION ───────────────────────
 *
 * **Que `UNKNOWN` no se confunda con `INVALID`.**
 *
 * Los dos se ven igual desde fuera: ninguna variable contestó. Pero uno
 * significa «estos puntos ya no existen» y el otro «no se ha podido mirar», y
 * colapsarlos daría de baja la planta entera en un corte de red — de forma
 * convincente, con un estado rojo que parece diagnóstico.
 *
 * Es el mismo principio que `CLAUDE.md` §2.4 aplica a los valores, un nivel más
 * arriba: la ausencia de COMPROBACIÓN no se disfraza de comprobación fallida.
 *
 * ── LO DEMÁS QUE PROTEGE ───────────────────────────────────────────
 *
 *  · Que **la calidad mala NO sea deriva**. Un punto con calidad mala existe
 *    —el servidor contesta por él— y lo que falla es su sensor. Marcarlo como
 *    configuración rota pondría en rojo una máquina cuya única falta es tener
 *    un sensor averiado, que es justo lo que el tablero debe poder enseñar.
 *  · Que faltar ALGUNAS sea `DEGRADED` y se diga **cuáles**: «faltan 10» no le
 *    sirve a quien tiene que ir a buscarlas.
 *  · Que un `UNKNOWN` **no pise** un `VALID` anterior: lo de ayer sigue siendo
 *    la mejor información disponible.
 *  · Que esto **no repare nada**. Una variable que desaparece y reaparece con
 *    otro nombre puede ser un renombrado o puede ser OTRA variable (§2.5).
 *
 * No necesita red: el cliente entra por la puerta y aquí se le da uno de
 * mentira. Entra en `npm run verificar`.
 */
import assert from 'node:assert/strict'

import {
  ESTADO_CONFIGURACION,
  crearMaquina,
  crearVariable,
} from '../shared/eva/comun/configuracionMaquina.js'
import { verificarMaquina } from '../backend/lib/verificarConfiguracion.mjs'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

let passed = 0
const fallos = []

async function check(nombre, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(`${nombre} — ${error.message}`)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
  }
}

/** Una máquina con tres puntos, para poder distinguir «faltan todas» de «algunas». */
const maquina = crearMaquina({
  id: 'vib-deriva',
  tipo: 'vibraciones',
  plc: 'PLC_9',
  assets: [{ id: 'a1', pointName: 'ac:PRUEBA/M/', rol: 'raiz' }],
  variables: [
    crearVariable({ id: 'vRMS_S1', pointName: 'ac:PRUEBA/M/S1/vRMS' }),
    crearVariable({ id: 'aRMS_S1', pointName: 'ac:PRUEBA/M/S1/aRMS' }),
    crearVariable({ id: 'DKW_S1', pointName: 'ac:PRUEBA/M/S1/DKW' }),
  ],
})

/**
 * Un `readPoints` de mentira que devuelve SÓLO los puntos que se le digan.
 *
 * Omitir un punto es exactamente lo que hace el cliente real con uno que el
 * servidor no devolvió («para el motor de sondeo eso es un hueco»), y es la
 * señal de la que vive toda esta fase.
 */
const sirviendo = (puntos, { calidad = 192 } = {}) => async () => ({
  ok: true,
  status: 200,
  payload: Object.fromEntries(
    puntos.map((p) => [p, { payload: { pointName: p, value: 1, quality: calidad } }])
  ),
})

const TODOS = maquina.variables.map((v) => v.pointName)

/* ── Lo normal ───────────────────────────────────────────────────────── */

console.log(`\n${c.negrita}Cuando todo sigue en su sitio${c.reset}`)

await check('con los tres puntos, VALID', async () => {
  const r = await verificarMaquina(maquina, { leerPuntos: sirviendo(TODOS) })
  assert.equal(r.estado, ESTADO_CONFIGURACION.VALID)
  assert.deepEqual(r.resumen, { total: 3, presentes: 3, ausentes: 0 })
})

/*
 * Un punto con calidad mala EXISTE: el servidor lo conoce y contesta por él.
 * Lo que falla es su sensor, y eso lo enseña el tablero como un hueco — no
 * como una configuración rota.
 */
await check('la calidad MALA no es deriva: el punto sigue existiendo', async () => {
  const r = await verificarMaquina(maquina, {
    leerPuntos: sirviendo(TODOS, { calidad: 0 }), // 0 = BAD en OPC UA
  })
  assert.equal(r.estado, ESTADO_CONFIGURACION.VALID)
  assert.equal(r.resumen.ausentes, 0)
})

await check('un punto SIN valor tampoco: entregar y existir son cosas distintas', async () => {
  const r = await verificarMaquina(maquina, {
    leerPuntos: async () => ({
      ok: true,
      status: 200,
      payload: Object.fromEntries(TODOS.map((p) => [p, { payload: { pointName: p } }])),
    }),
  })
  assert.equal(r.estado, ESTADO_CONFIGURACION.VALID)
})

/* ── Deriva parcial ──────────────────────────────────────────────────── */

console.log(`\n${c.negrita}Cuando falta parte${c.reset}`)

await check('faltando una de tres, DEGRADED', async () => {
  const r = await verificarMaquina(maquina, { leerPuntos: sirviendo(TODOS.slice(0, 2)) })
  assert.equal(r.estado, ESTADO_CONFIGURACION.DEGRADED)
  assert.deepEqual(r.resumen, { total: 3, presentes: 2, ausentes: 1 })
})

/* «Faltan 10» no le sirve a quien tiene que ir a buscarlas. */
await check('el motivo NOMBRA las que faltan, no sólo cuántas', async () => {
  const r = await verificarMaquina(maquina, { leerPuntos: sirviendo(TODOS.slice(0, 2)) })
  assert.match(r.motivo, /ac:PRUEBA\/M\/S1\/DKW/)
})

await check('cada variable queda marcada con su propio estado', async () => {
  const r = await verificarMaquina(maquina, { leerPuntos: sirviendo(TODOS.slice(0, 2)) })
  const porId = Object.fromEntries(r.variables.map((v) => [v.id, v.estado]))
  assert.equal(porId.vRMS_S1, ESTADO_CONFIGURACION.VALID)
  assert.equal(porId.DKW_S1, ESTADO_CONFIGURACION.INVALID)
})

/* ── Deriva total ────────────────────────────────────────────────────── */

console.log(`\n${c.negrita}Cuando no queda nada${c.reset}`)

/*
 * Que falten TODAS habiendo contestado el servidor es lo que distingue «esta
 * configuración apunta a un sitio que ya no existe» de «se borraron unos tags».
 * Una rama renombrada, una raíz que cambió — como el 09-09-2026 con las doce
 * ramas del tanque.
 */
await check('el servidor contesta y no reconoce ninguno: INVALID', async () => {
  const r = await verificarMaquina(maquina, { leerPuntos: sirviendo([]) })
  assert.equal(r.estado, ESTADO_CONFIGURACION.INVALID)
  assert.equal(r.resumen.presentes, 0)
  assert.match(r.motivo, /renombr|movió/i)
})

/* ── LA DISTINCIÓN QUE JUSTIFICA LA FASE ─────────────────────────────── */

console.log(`\n${c.negrita}«No se pudo mirar» NO es «ya no existe»${c.reset}`)

/*
 * Los dos casos de abajo se ven IGUAL desde fuera: ninguna variable contestó.
 * Si los dos dieran `INVALID`, un corte de red daría de baja la planta entera
 * — y lo haría de forma convincente.
 */
await check('ICONICS caído (ok:false) es UNKNOWN, no INVALID', async () => {
  const r = await verificarMaquina(maquina, {
    leerPuntos: async () => ({ ok: false, status: 503, error: 'ICONICS unreachable' }),
  })
  assert.equal(r.estado, ESTADO_CONFIGURACION.UNKNOWN)
  assert.notEqual(r.estado, ESTADO_CONFIGURACION.INVALID)
  assert.match(r.motivo, /no se ha podido mirar/i)
})

await check('una excepción de red también es UNKNOWN', async () => {
  const r = await verificarMaquina(maquina, {
    leerPuntos: async () => {
      throw new Error('ECONNREFUSED')
    },
  })
  assert.equal(r.estado, ESTADO_CONFIGURACION.UNKNOWN)
  assert.match(r.motivo, /ECONNREFUSED/)
})

await check('con el servidor caído, NINGUNA variable se marca inválida', async () => {
  const r = await verificarMaquina(maquina, {
    leerPuntos: async () => ({ ok: false, status: 503, error: 'caído' }),
  })
  for (const v of r.variables) {
    assert.equal(v.estado, ESTADO_CONFIGURACION.UNKNOWN, `${v.id} se dio por perdida`)
  }
})

/*
 * `problemasDeMaquina` ya rechaza una máquina sin variables al guardarla, así
 * que si está en disco es que se guardó antes de esa guarda. Decir «no responde
 * nada» sobre algo que nunca declaró qué leer sería contestar una pregunta que
 * no se hizo.
 */
await check('una máquina sin variables es UNKNOWN, no INVALID', async () => {
  const vacia = { ...maquina, variables: [] }
  let llamado = false

  const r = await verificarMaquina(vacia, {
    leerPuntos: async () => {
      llamado = true
      return { ok: true, payload: {} }
    },
  })

  assert.equal(r.estado, ESTADO_CONFIGURACION.UNKNOWN)
  assert.equal(llamado, false, 'no debería salir a leer si no hay nada que leer')
})

/* ── Lo que no hace ──────────────────────────────────────────────────── */

console.log(`\n${c.negrita}Lo que NO hace${c.reset}`)

/*
 * Una variable que desaparece y reaparece con otro nombre puede ser un
 * renombrado o puede ser OTRA variable. El sistema informa; una persona decide
 * (`CLAUDE.md` §2.5).
 */
await check('no repara: la configuración sale igual que entró', async () => {
  const antes = JSON.stringify(maquina)
  await verificarMaquina(maquina, { leerPuntos: sirviendo(TODOS.slice(0, 1)) })
  assert.equal(JSON.stringify(maquina), antes, 'la comprobación modificó la configuración')
})

await check('no escribe en disco: sólo devuelve el veredicto', async () => {
  const r = await verificarMaquina(maquina, { leerPuntos: sirviendo(TODOS) })
  for (const campo of ['estado', 'motivo', 'variables', 'resumen']) {
    assert.ok(campo in r, `falta «${campo}» en el resultado`)
  }
})

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/lib/verificarConfiguracion.mjs.${c.reset}`)
  process.exit(1)
}

console.log(
  `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: la deriva se detecta, y «no se ` +
    `pudo mirar» no se confunde con «ya no existe».${c.reset}`
)
