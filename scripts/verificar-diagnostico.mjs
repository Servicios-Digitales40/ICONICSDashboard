#!/usr/bin/env node
/**
 * scripts/verificar-diagnostico.mjs
 * ------------------------------------------------------------------
 * El motor de diagnóstico (Plan 16 Fase 3): junta Fuente #1 (el propio
 * riesgo, ya activo), Fuente #2 (`indiceDocumentos.buscar()`) y Fuente #3
 * (`indiceCasos.buscarCasosSimilares()`), puntúa cada causa candidata de
 * `causas.js` y devuelve la lista ordenada.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 *  - Determinismo: las mismas tres fuentes, dos veces, dan EXACTAMENTE la
 *    misma salida — es la propiedad que justifica que puntúe el código y no
 *    el modelo.
 *  - Ningún riesgo ACTIVO se queda callado: todo `id` de `REGLAS` (tanque y
 *    vibraciones) o tiene causas candidatas y el diagnóstico las devuelve, o
 *    no las tiene y el diagnóstico lo DICE (`huerfano: true`), nunca una
 *    lista vacía sin explicación.
 *  - Aislamiento: un `riesgoId` que no pertenece al `sistema` pedido, o un
 *    `sistema` que no existe, no se adivina — se rechaza.
 *  - El tope que impide que la memoria se vuelva dogma: los casos previos,
 *    sin manual y con el mínimo de datos, no alcanzan ALTO solos.
 *  - Un caso `resuelto:false` resta, no sólo dice "no encontrado".
 *
 * No usa red, embeddings, ni disco: `indiceDocumentos`/`indiceCasos` son
 * dobles de prueba que implementan sólo `buscar()`/`buscarCasosSimilares()`.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-diagnostico.mjs
 */
import assert from 'node:assert/strict'

import {
  UMBRAL_BM25_FUERTE,
  UMBRAL_BM25_DEBIL,
  createMotorDiagnostico,
} from '../backend/ia/motor/diagnostico.mjs'

/** Un encaje FUERTE y uno DÉBIL, derivados del corte vigente en vez de
 *  escritos a mano: lo que este guion prueba es la aritmética, y un número
 *  literal aquí se pondría rojo en cada recalibración sin que nada falle. */
const FUERTE = UMBRAL_BM25_FUERTE + 1
const DEBIL = UMBRAL_BM25_DEBIL + 0.5
import { causasDe } from '../shared/eva/comun/causas.js'
import { REGLAS as REGLAS_TANQUE } from '../shared/eva/tanque/riesgos.js'
import { REGLAS as REGLAS_VIBRACION } from '../shared/eva/vibraciones/riesgosVibracion.js'

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

/* ── dobles de prueba ─────────────────────────────────────────────────── */

/**
 * Un `indiceDocumentos` de mentira: `scoreCrudo` fijo por causa, según su
 * `id`. Es `scoreCrudo` —no `score`— a propósito, Plan 17 Fase 3a (G2):
 * `puntosDeScore` corta sobre la magnitud absoluta, y el `score`
 * normalizado (que este doble ni siquiera necesita simular) sólo ordena.
 */
function manualFalso(scoreCrudoPorCausa = {}) {
  return {
    async buscar(consulta) {
      for (const [pista, scoreCrudo] of Object.entries(scoreCrudoPorCausa)) {
        if (consulta.includes(pista)) {
          return [{ archivo: 'manual-de-prueba.pdf', pagina: 1, texto: consulta, scoreCrudo }]
        }
      }
      return []
    },
  }
}

/** Un `indiceCasos` de mentira: casos fijos, ignorando el texto de consulta. */
function casosFalsos(casos = []) {
  return {
    async buscarCasosSimilares({ sistema }) {
      return casos.filter(c => c.sistema === sistema)
    },
  }
}

/**
 * Un `evaluadorTemporal` de mentira: devuelve SIEMPRE la misma respuesta
 * configurada, sin mirar la firma —el motor sólo lo invoca cuando la causa
 * declaró `firmaTemporal` (ver `respaldoTemporal` en `diagnostico.mjs`), así
 * que una causa SIN firma queda en 0 pase lo que pase aquí; eso ya prueba
 * el filtro sin que el doble tenga que distinguir de qué causa se trata.
 */
function evaluadorTemporalFalso(respuesta) {
  return { async evaluar() { return respuesta } }
}

const SIN_FUENTES = createMotorDiagnostico({})

/* ── Determinismo ─────────────────────────────────────────────────────── */

console.log('\n── Mismas entradas, misma salida ─────────────────────────────')

await check('dos llamadas idénticas devuelven exactamente el mismo CONTENIDO', async () => {
  const indiceDocumentos = manualFalso({ 'impulsión cerrada': FUERTE })
  const indiceCasos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, scoreCrudo: FUERTE },
  ])
  const motor = createMotorDiagnostico({ indiceDocumentos, indiceCasos })

  const a = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  const b = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  // `diagnosticEventId` (Plan 17 Fase 5) identifica el MOMENTO de pedir el
  // diagnóstico, no su contenido — es lo único que puede, y debe, cambiar
  // entre dos llamadas idénticas. Todo lo demás sigue siendo exactamente
  // igual: es la propiedad que justifica que puntúe el código y no el modelo.
  assert.notEqual(a.diagnosticEventId, b.diagnosticEventId, 'dos llamadas debían tener eventos distintos')
  const { diagnosticEventId: _a, ...contenidoA } = a
  const { diagnosticEventId: _b, ...contenidoB } = b
  assert.deepEqual(contenidoA, contenidoB)
})

/* ── Ningún riesgo activo queda huérfano ────────────────────────────────── */

console.log('\n── Ningún riesgo activo se queda callado ─────────────────────')

await check('todo riesgo de tanque tiene causas, o el diagnóstico dice `huerfano`', async () => {
  for (const regla of REGLAS_TANQUE) {
    const resultado = await SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: regla.id })
    const candidatas = causasDe(regla.id)
    if (candidatas) {
      assert.equal(resultado.huerfano, false, `${regla.id}: tiene causas pero salió huérfano`)
      assert.equal(resultado.causas.length, candidatas.length, `${regla.id}: perdió candidatas por el camino`)
    } else {
      assert.equal(resultado.huerfano, true, `${regla.id}: no tiene causas y no lo dijo`)
      assert.deepEqual(resultado.causas, [])
    }
  }
})

await check('todo riesgo de vibraciones tiene causas, o el diagnóstico dice `huerfano`', async () => {
  for (const regla of REGLAS_VIBRACION) {
    const resultado = await SIN_FUENTES.diagnosticar({ sistema: 'vibraciones', riesgoId: regla.id })
    const candidatas = causasDe(regla.id)
    if (candidatas) {
      assert.equal(resultado.huerfano, false, `${regla.id}: tiene causas pero salió huérfano`)
      assert.equal(resultado.causas.length, candidatas.length, `${regla.id}: perdió candidatas por el camino`)
    } else {
      assert.equal(resultado.huerfano, true, `${regla.id}: no tiene causas y no lo dijo`)
    }
  }
})

/* ── Aislamiento ──────────────────────────────────────────────────────── */

console.log('\n── Un riesgoId que no encaja no se adivina ───────────────────')

await check('un `riesgoId` de vibraciones pedido con `sistema: "tanque"` se rechaza', async () => {
  await assert.rejects(
    () => SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: 'vibracion-en-alarma' }),
    TypeError,
  )
})

await check('un `sistema` inexistente se rechaza', async () => {
  await assert.rejects(
    () => SIN_FUENTES.diagnosticar({ sistema: 'calderas', riesgoId: 'derrame' }),
    TypeError,
  )
})

/* ── El tope que impide que la memoria se vuelva dogma ──────────────────── */

console.log('\n── Los casos solos no llegan a ALTO ──────────────────────────')

await check('casos fuertes sin manual, con el mínimo de datos, no pasan de MEDIO o suben a ALTO sólo junto a datos altos', async () => {
  // agua-caliente: `necesita` de 1 señal → datos = 1. Con 2 casos fuertes y
  // sin manual: total = 1 + 0 + 2 = 3 → MEDIO, nunca ALTO sin más respaldo.
  const casos = [
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, scoreCrudo: FUERTE },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, scoreCrudo: FUERTE },
  ]
  const motor = createMotorDiagnostico({ indiceCasos: casosFalsos(casos) })
  const resultado = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  for (const causa of resultado.causas) {
    assert.ok(causa.respaldo.total <= 3, `${causa.id}: casos solos llegaron a ${causa.respaldo.total}`)
    assert.notEqual(causa.banda, 'alto')
  }
})

console.log('\n── Casos sin `disparador` pesan menos que los confirmados ────')

/*
 * `casos.mjs` ya EXCLUYE los casos de otro riesgo antes de que este módulo
 * los vea (probado con el índice real en `verificar-casos.mjs`); lo que se
 * comprueba aquí es lo que le toca a ESTE módulo, Plan 17 Fase 1 (G1): un
 * caso confirmado del mismo riesgo (`disparador.riesgoId` coincide) pesa
 * más que uno que llegó por parecido de texto sin decir de qué riesgo era
 * —el caso normal para todo lo registrado por voz o chat, que nunca trae
 * `disparador`—.
 */

await check('dos casos CONFIRMADOS del mismo riesgo llegan al tope de 2, como antes', async () => {
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, scoreCrudo: FUERTE, disparador: { riesgoId: 'agua-caliente' } },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, scoreCrudo: FUERTE, disparador: { riesgoId: 'agua-caliente' } },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  assert.equal(resultado.causas[0].respaldo.casos, 2)
})

await check('dos casos SIN `disparador` (voz/chat) topan en 1, nunca llegan a 2', async () => {
  // Mismo texto, mismos scores que el caso anterior — la única diferencia es
  // que estos no dicen de qué riesgo eran, como cualquier intervención
  // registrada por voz. Sin la Fase 1, esto puntuaba 2 igual que arriba.
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, scoreCrudo: FUERTE },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, scoreCrudo: FUERTE },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  assert.equal(resultado.causas[0].respaldo.casos, 1, 'sin disparador, dos casos no debían pesar como si confirmaran')
})

await check('un confirmado + uno sin `disparador` siguen sin superar el tope de 2', async () => {
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, scoreCrudo: FUERTE, disparador: { riesgoId: 'agua-caliente' } },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, scoreCrudo: FUERTE },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  assert.equal(resultado.causas[0].respaldo.casos, 2, 'el confirmado + el débil debían completar el tope, no superarlo')
})

console.log('\n── El emparejamiento exacto por id (Plan 17 Fase 2, G3) ──────')

/*
 * `causaReal.tipo`/`diagnostico.propuesta` son ids estructurados de la Fase
 * 5 del Plan 16: no compiten por parecido de texto, así que estos casos de
 * prueba llevan `score: 0` a propósito —por debajo de CUALQUIER umbral—
 * para demostrar que el emparejamiento exacto no depende del score.
 */

await check('`causaReal.tipo` confirma la causa aunque el score de texto sea 0', async () => {
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      causaReal: { tipo: 'aporte-termico-externo' } },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, score: 0,
      causaReal: { tipo: 'aporte-termico-externo' } },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })
  const causa = resultado.causas.find(c => c.id === 'aporte-termico-externo')

  assert.equal(causa.respaldo.casos, 2, 'dos confirmaciones exactas debían llegar al tope, sin depender del score')
})

await check('`diagnostico.propuesta` + `diagnosticoCorrecto:false` refuta la causa, aunque `resuelto:true`', async () => {
  // El técnico dijo que la avería se arregló (resuelto:true) PERO que la
  // causa propuesta no era la correcta (diagnosticoCorrecto:false) — son dos
  // preguntas distintas, y la que importa aquí es la segunda.
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      diagnostico: { propuesta: 'aporte-termico-externo' }, diagnosticoCorrecto: false },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })
  const causa = resultado.causas.find(c => c.id === 'aporte-termico-externo')

  assert.equal(causa.respaldo.casos, -1, 'una refutación exacta debía restar, aunque el intento se diera por resuelto')
})

await check('una causa refutada DOS VECES baja de banda ella sola — el escenario medido en la auditoría', async () => {
  // Reproduce lo medido el 01-09-2026: `consigna-variador-alta` fue
  // refutada en dos cierres distintos y seguía saliendo en banda ALTO
  // porque nada restaba por `diagnosticoCorrecto:false`. bomba-sin-salida
  // tiene `necesita` de 3 señales → datos=3; sin casos ni manual, total=3
  // (MEDIO, una sola fuente). Dos refutaciones deben bajarlo a BAJO.
  const sinCasos = await createMotorDiagnostico({}).diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  const causaSinCasos = sinCasos.causas.find(c => c.id === 'valvula-impulsion-cerrada')
  assert.equal(causaSinCasos.respaldo.total, 3)
  assert.equal(causaSinCasos.banda, 'medio')

  const casosRefutando = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      diagnostico: { propuesta: 'valvula-impulsion-cerrada' }, diagnosticoCorrecto: false },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, score: 0,
      diagnostico: { propuesta: 'valvula-impulsion-cerrada' }, diagnosticoCorrecto: false },
  ])
  const conRefutaciones = await createMotorDiagnostico({ indiceCasos: casosRefutando }).diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  const causaRefutada = conRefutaciones.causas.find(c => c.id === 'valvula-impulsion-cerrada')

  assert.equal(causaRefutada.respaldo.casos, -2)
  assert.equal(causaRefutada.respaldo.total, 1)
  assert.notEqual(causaRefutada.banda, 'medio', 'dos refutaciones debían bajarla de banda, sola')
  assert.equal(causaRefutada.banda, 'bajo')
})

await check('confirmación exacta y refutación de OTRA causa no se mezclan', async () => {
  // Un mismo lote de casos puede confirmar una causa Y refutar otra del
  // mismo riesgo a la vez — son juicios independientes, uno por causa.
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      causaReal: { tipo: 'aporte-termico-externo' } },
    { id: 'c2', sistema: 'tanque', fecha: '2026-01-02', resuelto: true, score: 0,
      diagnostico: { propuesta: 'falta-renovacion-de-agua' }, diagnosticoCorrecto: false },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  const confirmada = resultado.causas.find(c => c.id === 'aporte-termico-externo')
  const refutada = resultado.causas.find(c => c.id === 'falta-renovacion-de-agua')

  assert.equal(confirmada.respaldo.casos, 1)
  assert.equal(refutada.respaldo.casos, -1)
})

console.log('\n── Un caso que NO funcionó resta ─────────────────────────────')

await check('un caso `resuelto:false` baja el total en vez de sumarlo', async () => {
  const casosOk = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, scoreCrudo: FUERTE },
  ])
  const casosMal = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: false, scoreCrudo: FUERTE },
  ])

  const conOk = await createMotorDiagnostico({ indiceCasos: casosOk }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })
  const conMal = await createMotorDiagnostico({ indiceCasos: casosMal }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  assert.ok(conMal.causas[0].respaldo.casos < conOk.causas[0].respaldo.casos)
  assert.ok(conMal.causas[0].respaldo.casos < 0, 'un intento fallido debía restar, no sólo no sumar')
})

/* ── El manual desempata entre causas del mismo riesgo ──────────────────── */

console.log('\n── El manual desempata causas que comparten evidencia ────────')

await check('la causa que el manual nombra queda primera, aunque los datos empaten', async () => {
  const candidatas = causasDe('bomba-sin-salida')
  const objetivo = candidatas[1] // "sin-recirculacion-minima"
  const indiceDocumentos = manualFalso({ [objetivo.titulo]: FUERTE })

  const resultado = await createMotorDiagnostico({ indiceDocumentos }).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
  })

  assert.equal(resultado.causas[0].id, objetivo.id)
  assert.ok(resultado.causas[0].respaldo.manual > resultado.causas[1].respaldo.manual)
})

/* ── Evidencia en frases, Plan 17 Fase 4 (G6) ───────────────────────── */

console.log('\n── La evidencia son frases, no sólo el entero (G6) ────────────')

await check('el manual con respaldo aporta una frase en `evidenciaAFavor`, con su cita', async () => {
  const indiceDocumentos = manualFalso({ 'impulsión cerrada': FUERTE })
  const resultado = await createMotorDiagnostico({ indiceDocumentos }).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
  })

  const causa = resultado.causas.find(cc => cc.id === 'valvula-impulsion-cerrada')
  const entrada = causa.evidenciaAFavor.find(e => e.fuente === 'manual')
  assert.ok(entrada, 'debía haber una entrada de manual en evidenciaAFavor')
  assert.match(entrada.referencia, /manual-de-prueba\.pdf/)
})

await check('un caso CONFIRMADO aporta una frase en `evidenciaAFavor`', async () => {
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      causa: 'La válvula quedó agarrotada.', causaReal: { tipo: 'valvula-impulsion-cerrada' } },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
  })

  const causa = resultado.causas.find(cc => cc.id === 'valvula-impulsion-cerrada')
  const entrada = causa.evidenciaAFavor.find(e => e.fuente === 'casos')
  assert.ok(entrada, 'debía haber una entrada de casos en evidenciaAFavor')
  assert.equal(entrada.referencia, 'c1')
  assert.match(entrada.texto, /agarrotada/)
})

await check('un caso REFUTADO aporta una frase en `evidenciaEnContra`, no sólo resta un punto', async () => {
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      diagnostico: { propuesta: 'valvula-impulsion-cerrada' },
      causaReal: { tipo: 'sin-recirculacion-minima' }, diagnosticoCorrecto: false },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
  })

  const causa = resultado.causas.find(cc => cc.id === 'valvula-impulsion-cerrada')
  assert.equal(causa.evidenciaAFavor.length, 0)
  assert.equal(causa.evidenciaEnContra.length, 1)
  assert.equal(causa.evidenciaEnContra[0].referencia, 'c1')
  assert.match(causa.evidenciaEnContra[0].texto, /sin-recirculacion-minima/)
})

await check('sin `valoresSensores`, no hay frase de `datos` — pero el PUNTO de datos no cambia', async () => {
  const sinValores = await SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  const conValores = await SIN_FUENTES.diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
    valoresSensores: { flujoInstantaneo: 0.01, presionRelativa: 4.2, cargaMotor: 78 },
  })

  const causaSin = sinValores.causas.find(cc => cc.id === 'valvula-impulsion-cerrada')
  const causaCon = conValores.causas.find(cc => cc.id === 'valvula-impulsion-cerrada')

  assert.equal(causaSin.evidenciaAFavor.some(e => e.fuente === 'datos'), false)
  assert.equal(causaCon.evidenciaAFavor.some(e => e.fuente === 'datos'), true)
  assert.match(causaCon.evidenciaAFavor.find(e => e.fuente === 'datos').texto, /78/)
  // El respaldo numérico —lo que decide la banda— es el mismo con o sin la
  // frase: `valoresSensores` sólo añade texto, nunca cambia un punto.
  assert.equal(causaSin.respaldo.datos, causaCon.respaldo.datos)
  assert.equal(causaSin.banda, causaCon.banda)
})

await check('sin ningún respaldo, evidenciaAFavor/EnContra son arrays vacíos, nunca `undefined`', async () => {
  const resultado = await SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  for (const causa of resultado.causas) {
    assert.deepEqual(causa.evidenciaAFavor, [])
    assert.deepEqual(causa.evidenciaEnContra, [])
  }
})

/* ── El conflicto se enseña, Plan 17 Fase 4 (G9) ────────────────────── */

console.log('\n── El conflicto entre fuentes se enseña, no se resuelve (G9) ──')

await check('cuando el manual respalda a la 1ª y los casos a la 2ª, `conflicto: true`', async () => {
  const indiceDocumentos = manualFalso({ 'impulsión cerrada': FUERTE })
  const indiceCasos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      causaReal: { tipo: 'sin-recirculacion-minima' } },
  ])
  const resultado = await createMotorDiagnostico({ indiceDocumentos, indiceCasos }).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
  })

  // El manual respalda valvula-impulsion-cerrada; el caso confirmado
  // respalda sin-recirculacion-minima — dos fuentes, dos causas distintas.
  assert.equal(resultado.conflicto, true)
})

await check('cuando la misma fuente respalda a las dos, no hay conflicto que enseñar', async () => {
  const indiceDocumentos = manualFalso({ 'impulsión cerrada': FUERTE, 'recirculación mínima': FUERTE })
  const resultado = await createMotorDiagnostico({ indiceDocumentos }).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
  })

  assert.equal(resultado.conflicto, false)
})

await check('con una sola causa candidata, no hay con qué entrar en conflicto', async () => {
  // `derrame` sólo tiene una causa transcrita (`corte-nivel-alto-no-actua`).
  const resultado = await SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: 'derrame' })
  assert.equal(resultado.causas.length, 1)
  assert.equal(resultado.conflicto, false)
})

await check('un riesgo huérfano no tiene conflicto (ni causas que comparar)', async () => {
  const resultado = await SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: 'variador-en-manual' })
  assert.equal(resultado.huerfano, true)
  assert.equal(resultado.conflicto, false)
})

/* ── El cuarto término, Plan 17 Fase 6 (G5) ─────────────────────────── */

console.log('\n── El término temporal entra en el total y la evidencia ───────')

await check('sólo la causa con `firmaTemporal` consulta al evaluador — la otra queda en 0', async () => {
  // De las dos causas de bomba-sin-salida, sólo sin-recirculacion-minima
  // declara firmaTemporal (shared/eva/comun/causas.js) — el doble siempre
  // "encuentra" tendencia, y aun así valvula-impulsion-cerrada debe quedar
  // en temporal:0, porque `respaldoTemporal` ni la llama sin firma.
  const evaluadorTemporal = evaluadorTemporalFalso({
    puntos: 2,
    evidenciaAFavor: [{ fuente: 'temporal', texto: 'subió', referencia: 'temperaturaTanque' }],
    evidenciaEnContra: [],
  })
  // El evaluador viaja en la LLAMADA, no en la construcción (Plan 20 Fase 1):
  // el motor es singleton y el evaluador lee ICONICS con el token de una
  // sesión concreta. Ver la cabecera de `ia/motor/diagnostico.mjs`.
  const resultado = await createMotorDiagnostico({}).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida', evaluadorTemporal,
  })

  const conFirma = resultado.causas.find(cc => cc.id === 'sin-recirculacion-minima')
  const sinFirma = resultado.causas.find(cc => cc.id === 'valvula-impulsion-cerrada')

  assert.equal(conFirma.respaldo.temporal, 2)
  assert.equal(sinFirma.respaldo.temporal, 0)
})

await check('`temporal` suma al total y cuenta como fuente activa', async () => {
  const evaluadorTemporal = evaluadorTemporalFalso({
    puntos: 2, evidenciaAFavor: [{ fuente: 'temporal', texto: 'x', referencia: 'y' }], evidenciaEnContra: [],
  })
  const sinTemporal = await createMotorDiagnostico({}).diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  const conTemporal = await createMotorDiagnostico({}).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida', evaluadorTemporal,
  })

  const antes = sinTemporal.causas.find(cc => cc.id === 'sin-recirculacion-minima')
  const despues = conTemporal.causas.find(cc => cc.id === 'sin-recirculacion-minima')

  assert.equal(despues.respaldo.total, antes.respaldo.total + 2)
  assert.equal(despues.evidenciaAFavor.some(e => e.fuente === 'temporal'), true)
})

await check('sin `evaluadorTemporal` montado, `temporal` sale en 0 sin lanzar', async () => {
  const resultado = await SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  for (const causa of resultado.causas) assert.equal(causa.respaldo.temporal, 0)
})

await check('un evaluador que lanza no rompe el diagnóstico: temporal=0, sin evidencia', async () => {
  const evaluadorTemporal = { async evaluar() { throw new Error('El historiador no contesta') } }
  const resultado = await createMotorDiagnostico({ evaluadorTemporal }).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
  })
  const conFirma = resultado.causas.find(cc => cc.id === 'sin-recirculacion-minima')
  assert.equal(conFirma.respaldo.temporal, 0)
  assert.equal(conFirma.evidenciaAFavor.length, 0)
})

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/motor/diagnostico.mjs o shared/eva/comun/causas.js.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: el diagnóstico se mantiene.${c.reset}`)
