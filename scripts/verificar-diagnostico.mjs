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
import { readFileSync } from 'node:fs'

import {
  CLAVES_DE_EVIDENCIA,
  UMBRAL_BM25_FUERTE,
  createMotorDiagnostico,
} from '../backend/ia/motor/diagnostico.mjs'

/** Un encaje FUERTE y uno DÉBIL, derivados del corte vigente en vez de
 *  escritos a mano: lo que este guion prueba es la aritmética, y un número
 *  literal aquí se pondría rojo en cada recalibración sin que nada falle. */
const FUERTE = UMBRAL_BM25_FUERTE + 1
import { causasDe, porQueSinCausas, SIN_CAUSAS_DELIBERADO, SIN_CAUSAS_PENDIENTE } from '../shared/eva/comun/causas.js'
import { REGLAS as REGLAS_TANQUE } from '../shared/eva/tanque/riesgos.js'
import { REGLAS as REGLAS_VIBRACION } from '../shared/eva/vibraciones/riesgosVibracion.js'
import { registrarSistema } from '../shared/eva/comun/sistemas.js'
import { construirSistema } from '../shared/eva/comun/construirSistema.js'
import { tipoDe } from '../shared/eva/tipos/index.js'
import { configuracionEspejo } from './lib/configuracionEspejo.mjs'

/* El motor resuelve las reglas de una configurada por su TIPO (Plan 38 F1);
   la máquina de vibraciones es la espejo configurada (Plan 40 F3). */
const ESPEJO = registrarSistema(
  construirSistema(configuracionEspejo({ verificadasDelCatalogo: true }).configurada, tipoDe('vibraciones')),
)

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

  /*
   * El snapshot (Plan 28 F1) tiene DOS campos que cambian por lo mismo: copia
   * el `diagnosticEventId` y sella el instante. Se apartan igual que él, y no
   * se afloja la comparación del resto — el snapshot ENTERO, fragmentos y
   * casos incluidos, tiene que salir idéntico, porque es un registro de lo
   * que se consultó y eso no depende del reloj.
   */
  const sinVolatiles = ({ diagnosticEventId, snapshot, ...resto }) => ({
    ...resto,
    ...(snapshot
      ? { snapshot: (({ diagnosticEventId: _e, momento: _m, ...s }) => s)(snapshot) }
      : {}),
  })

  assert.deepEqual(sinVolatiles(a), sinVolatiles(b))
})

await check('el snapshot no altera el resultado: las causas son las mismas con él y sin él', async () => {
  /*
   * ── LA PROPIEDAD QUE DEFINE LA F1 DEL PLAN 28 ─────────────────────
   *
   * El snapshot es OBSERVACIÓN de lo que ya ocurría, no una entrada nueva. Si
   * algún día empezara a influir en el cálculo dejaría de ser un registro y
   * pasaría a ser una fuente — y entonces habría que calibrarlo, que es justo
   * lo que no queremos.
   *
   * Se comprueba comparando las causas contra las que produce el mismo motor
   * con el snapshot apartado: cualquier diferencia significa que construirlo
   * tuvo un efecto, aunque sea de orden.
   */
  const indiceDocumentos = manualFalso({ 'impulsión cerrada': FUERTE })
  const motor = createMotorDiagnostico({ indiceDocumentos })

  const r = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  assert.ok(r.snapshot, 'el diagnóstico tiene que traer snapshot')
  assert.ok(r.causas.length > 0, 'el caso de apoyo tiene que dar causas')
  // El snapshot cita lo mismo que las causas, no algo distinto.
  const archivosEnCausas = new Set(
    r.causas.flatMap(c => (c.manualCitado ?? []).map(f => f.archivo))
  )
  for (const f of r.snapshot.fragmentosManual) {
    assert.ok(archivosEnCausas.has(f.archivo),
      `el snapshot cita "${f.archivo}", que ninguna causa cita`)
  }
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
    const resultado = await SIN_FUENTES.diagnosticar({ sistema: ESPEJO.id, riesgoId: regla.id })
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

/* ── Que la evidencia se sepa decir en los dos idiomas ─────────────────── */

/*
 * ── POR QUÉ ESTO VIVE AQUÍ Y NO EN `verificar-i18n.mjs` ────────────
 *
 * Porque aquél compara los dos diccionarios entre sí, y estas frases no
 * empiezan en un diccionario: las redacta este motor. Una plantilla nueva
 * —`plantilla: { clave: 'loQueSea' }`— pasaría la paridad sin despeinarse y
 * saldría en pantalla en español dentro de un tablero en inglés, que es
 * exactamente el modo de fallo silencioso que ya obligó a escribir
 * `verificar-textos.mjs` y `verificar-dominio.mjs`.
 *
 * Y al revés: una entrada que redactamos nosotros y se queda SIN `plantilla`
 * tampoco rompe nada — se pinta el español y ya está—. Por eso se comprueban
 * las dos direcciones.
 */
const DICCIONARIOS = Object.fromEntries(
  ['es', 'en'].map(idioma => [
    idioma,
    JSON.parse(readFileSync(
      new URL(`../react-dashboard/src/i18n/locales/${idioma}/diagnostics.json`, import.meta.url)
    )),
  ])
)

await check('cada clave de evidencia tiene su frase en los dos idiomas', () => {
  const faltan = []

  for (const [clave, donde] of Object.entries(CLAVES_DE_EVIDENCIA)) {
    /*
     * `domain` no se comprueba aquí: esa frase la escribe `shared/eva/` y su
     * inglés lo vigila `verificar-dominio.mjs`, regla por regla. Comprobarla
     * también aquí sería una segunda puerta sobre la misma cerradura.
     */
    if (donde !== 'diagnostics') continue

    for (const idioma of ['es', 'en']) {
      /*
       * Vale con que exista UNA clave con esa base: `tendencia` se escribe
       * como `tendencia_sube` y `tendencia_baja` —variantes de contexto de
       * i18next— y no tiene forma sin contexto, porque una tendencia siempre
       * va en una dirección o en la otra. Que las dos lenguas tengan LAS
       * MISMAS variantes ya lo comprueba la paridad de `verificar-i18n.mjs`.
       */
      const hay = Object.keys(DICCIONARIOS[idioma].evidence ?? {})
        .some(k => k === clave || k.startsWith(`${clave}_`))
      if (!hay) faltan.push(`${idioma}: evidence.${clave}`)
    }
  }

  assert.deepEqual(faltan, [], `sin frase: ${faltan.join(', ')}`)
})

await check('las cuatro fuentes tienen nombre en los dos idiomas', () => {
  const faltan = []
  for (const idioma of ['es', 'en']) {
    for (const fuente of ['datos', 'manual', 'casos', 'temporal']) {
      if (!DICCIONARIOS[idioma].evidence?.source?.[fuente]) faltan.push(`${idioma}: ${fuente}`)
    }
  }
  assert.deepEqual(faltan, [], `sin nombre: ${faltan.join(', ')}`)
})

await check('la evidencia que redactamos nosotros lleva `plantilla`; la que es de otro, no', async () => {
  const casos = casosFalsos([
    { id: 'c1', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      diagnostico: { propuesta: 'valvula-impulsion-cerrada' },
      causaReal: { tipo: 'sin-recirculacion-minima' }, diagnosticoCorrecto: false },
  ])
  const resultado = await createMotorDiagnostico({ indiceCasos: casos }).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
    valoresSensores: { flujoInstantaneo: 0.01, presionRelativa: 4.2, cargaMotor: 78 },
  })

  const causa = resultado.causas.find(cc => cc.id === 'valvula-impulsion-cerrada')

  const datos = causa.evidenciaAFavor.find(e => e.fuente === 'datos')
  assert.equal(datos.plantilla.clave, 'evidenciaDelRiesgo')
  assert.equal(datos.plantilla.sistema, 'tanque')
  assert.equal(datos.plantilla.riesgoId, 'bomba-sin-salida')
  // Y con qué se compuso, para poder rehacerla con las mismas cifras.
  assert.equal(datos.plantilla.valores.cargaMotor, 78)

  const refutado = causa.evidenciaEnContra.find(e => e.fuente === 'casos')
  assert.equal(refutado.plantilla.clave, 'causaDescartada')
  assert.equal(refutado.plantilla.causaReal, 'sin-recirculacion-minima')
})

await check('lo que escribió OTRO no lleva plantilla: no se le reescribe', async () => {
  /*
   * Las dos fuentes cuyo texto no es una plantilla nuestra: el fragmento
   * literal del manual —la cita tiene que poder contrastarse con el papel— y
   * lo que un técnico escribió al cerrar un caso, que son sus palabras.
   */
  const indiceDocumentos = manualFalso({ 'impulsión cerrada': FUERTE })
  const indiceCasos = casosFalsos([
    { id: 'c9', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      sintoma: 'La bomba no daba caudal', causa: 'Válvula agarrotada',
      causaReal: { tipo: 'valvula-impulsion-cerrada' } },
  ])
  const resultado = await createMotorDiagnostico({ indiceDocumentos, indiceCasos }).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
  })

  const causa = resultado.causas.find(cc => cc.id === 'valvula-impulsion-cerrada')
  const ajenas = causa.evidenciaAFavor.filter(e => e.fuente === 'manual' || e.fuente === 'casos')

  assert.ok(ajenas.length >= 2, 'debía haber una del manual y una de casos')
  for (const e of ajenas) {
    assert.equal(e.plantilla, undefined, `«${e.fuente}» no se traduce: su texto es de otro`)
  }
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
  /*
   * ── POR QUÉ ESTA PRUEBA YA NO NOMBRA UN RIESGO CONCRETO ───────────
   *
   * Nombraba `derrame`, «que sólo tiene una causa transcrita». El Plan 29 F1
   * le añadió dos —el corte que no ve y el lazo que no responde son averías
   * distintas— y esta prueba se puso en rojo sin que nada del motor hubiera
   * cambiado: afirmaba `causas.length === 1`, que es un dato del CATÁLOGO, no
   * una propiedad del motor.
   *
   * Hoy NINGÚN riesgo del tanque tiene una sola causa, y eso es precisamente
   * lo que el Plan 29 perseguía. Buscar otro riesgo de una causa para seguir
   * apoyándose en él sería volver a atar la prueba a una cifra que el
   * catálogo puede cambiar mañana — y la próxima vez tampoco estaría roto
   * nada.
   *
   * Lo que esta prueba defiende es la guarda `causas.length < 2` de
   * `hayConflicto()`, así que se construye el caso en vez de buscarlo: un
   * riesgo real, filtrado a su primera causa. Si el catálogo crece o mengua,
   * esto sigue diciendo lo mismo.
   */
  const completo = await SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: 'derrame' })
  assert.ok(completo.causas.length >= 1, 'el riesgo de apoyo tiene que tener causas')

  const { hayConflicto } = await import('../backend/ia/motor/diagnostico.mjs')
  assert.equal(hayConflicto(completo.causas.slice(0, 1)), false)
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
  const resultado = await createMotorDiagnostico({ evaluadorTemporal }).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
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
  const conTemporal = await createMotorDiagnostico({ evaluadorTemporal }).diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
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

/* ── Por qué un riesgo no tiene causas (Plan 20) ──────────────────────── */

/* ── Estados y degradación explícita, Plan 28 F3 ────────────────────── */

console.log('\n── «No respalda» y «no contestó» (Plan 28 F3) ─────────────')

/** Un índice que siempre lanza: la fuente caída. */
const indiceQueFalla = {
  buscar: async () => { throw new Error('el índice no responde') },
  buscarCasosSimilares: async () => { throw new Error('el índice no responde') },
}

await check('una fuente que RESPONDE y no respalda se distingue de una CAÍDA', async () => {
  /*
   * ── LA PROPIEDAD QUE DEFINE ESTA FASE ─────────────────────────────
   *
   * Los dos casos dan `manual: 0`. Hasta el Plan 28 F3 eran indistinguibles
   * salvo por un `logger.warn` que nadie mira al leer un diagnóstico — y un
   * diagnóstico calculado con el índice caído se presentaba idéntico a uno
   * calculado con todo en pie, con la misma banda. Eso es §2.5: degradar en
   * silencio.
   */
  const vacio = await createMotorDiagnostico({ indiceDocumentos: manualFalso({}) })
    .diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  const roto = await createMotorDiagnostico({ indiceDocumentos: indiceQueFalla })
    .diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  assert.equal(vacio.causas[0].respaldo.manual, 0)
  assert.equal(roto.causas[0].respaldo.manual, 0, 'las dos dan el mismo punto...')

  assert.equal(vacio.causas[0].estadoFuentes.manual, 'sin_respaldo')
  assert.equal(roto.causas[0].estadoFuentes.manual, 'caida', '...y ya no el mismo estado')
})

await check('el estado global se DERIVA de las fuentes, no se escribe a mano', async () => {
  /*
   * UNA caída de tres es `parcial`, y para comprobarlo hay que montar las
   * otras dos de verdad: un índice sin montar también cuenta como caído —es
   * el mismo «no se pudo consultar»—, así que pasar sólo el que falla daría
   * `insuficiente` y la prueba no distinguiría los dos estados.
   */
  const evaluadorTemporal = {
    evaluar: async () => ({ puntos: 0, evidenciaAFavor: [], evidenciaEnContra: [] }),
    evaluarEstado: async () => ({ puntos: 0, evidenciaAFavor: [], evidenciaEnContra: [] }),
  }
  const roto = await createMotorDiagnostico({
    indiceDocumentos: indiceQueFalla,
    indiceCasos: casosFalsos([]),
    evaluadorTemporal,
  }).diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  assert.equal(roto.estado, 'parcial', 'una caída de tres es parcial')
  assert.equal(roto.estadoFuentes.manual, 'caida')
  assert.equal(roto.estadoFuentes.casos, 'sin_respaldo', 'las otras dos sí contestaron')
  // Y viaja al snapshot, que es lo que audita la F2.
  assert.deepEqual(roto.snapshot.fuentesCaidas, ['manual'])
})

await check('sin NINGUNA fuente montada, el diagnóstico se declara insuficiente', async () => {
  /*
   * Con las tres caídas sólo queda `datos`, que es el MISMO para todas las
   * causas del riesgo —verdad física, ver la cabecera del archivo—. O sea que
   * no hay nada que pueda desempatarlas: el orden que sale es el del catálogo,
   * no un ranking, y presentarlo como tal sería mentir sobre su autoridad.
   */
  const r = await SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  assert.equal(r.estado, 'insuficiente')
  assert.deepEqual(r.snapshot.fuentesCaidas.sort(), ['casos', 'manual', 'temporal'])
})

await check('un riesgo huérfano es insuficiente, y no por haber fallado nada', async () => {
  const r = await SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: 'variador-en-manual' })

  assert.equal(r.huerfano, true)
  assert.equal(r.estado, 'insuficiente')
  assert.equal(r.sinCausas.deliberado, true, 'y sigue diciendo POR QUÉ no tiene causas')
})

await check('una causa SIN firma declarada no cuenta como fuente caída', async () => {
  /*
   * `agua-caliente` se quedó sin `firmaTemporal` a propósito en el Plan 29 F2
   * —sus dos causas comparten mecanismo, y una firma repetida no desempata
   * nada—. Eso es una decisión del catálogo, no un fallo: llamarlo «caída»
   * diría que falta una pieza que nadie quiso poner, y contagiaría el estado
   * global a «parcial» en un diagnóstico que está completo.
   */
  const evaluadorTemporal = { evaluar: async () => ({ puntos: 0, evidenciaAFavor: [], evidenciaEnContra: [] }) }
  const r = await createMotorDiagnostico({
    indiceDocumentos: manualFalso({}), indiceCasos: casosFalsos([]), evaluadorTemporal,
  }).diagnosticar({ sistema: 'tanque', riesgoId: 'agua-caliente' })

  assert.equal(r.causas[0].estadoFuentes.temporal, 'sin_respaldo')
  assert.equal(r.estado, 'completo', 'nada se cayó: el diagnóstico está completo')
})

/* ── El modelo de intervención, Plan 28 F6 ──────────────────────────── */

console.log('\n── `causaReal`: id y texto separados (Plan 28 F6) ─────────')

await check('la forma VIEJA (`tipo`) sigue confirmando una causa', async () => {
  /*
   * ── LO QUE NO SE PUEDE ROMPER ─────────────────────────────────────
   *
   * Una intervención no se edita —«lo que pasó, pasó»—, así que las guardadas
   * antes de esta fase van a tener sólo `tipo` para siempre. Si el motor
   * dejara de leerlas, todo el historial de cierres quedaría fuera del
   * diagnóstico sin que nadie lo notara: `respaldoDeCasos` no falla cuando no
   * encuentra, simplemente cae a la proxy de texto.
   */
  const indiceCasos = casosFalsos([
    {
      id: 'viejo', sistema: 'tanque', fecha: '2026-01-01', resuelto: true, score: 0,
      causaReal: { tipo: 'sin-recirculacion-minima' },
    },
  ])
  const r = await createMotorDiagnostico({ indiceCasos })
    .diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  const causa = r.causas.find(c => c.id === 'sin-recirculacion-minima')
  assert.ok(causa.respaldo.casos > 0, 'un cierre viejo tiene que seguir respaldando')
})

await check('la forma NUEVA (`id`/`texto`) confirma igual', async () => {
  const indiceCasos = casosFalsos([
    {
      id: 'nuevo', sistema: 'tanque', fecha: '2026-09-15', resuelto: true, score: 0,
      causaReal: { tipo: 'sin-recirculacion-minima', id: 'sin-recirculacion-minima', texto: 'Sin línea de recirculación mínima' },
    },
  ])
  const r = await createMotorDiagnostico({ indiceCasos })
    .diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  const causa = r.causas.find(c => c.id === 'sin-recirculacion-minima')
  assert.ok(causa.respaldo.casos > 0)
})

await check('una causa LIBRE (`id: null`) no confirma ninguna candidata', async () => {
  /*
   * Es la distinción que la forma vieja no podía expresar. Con `tipo` a secas,
   * un texto libre como «se rompió el codo de purga» se comparaba contra los
   * ids del catálogo: no fallaba, simplemente no acertaba nunca, y nadie podía
   * distinguir eso de «este cierre no confirma nada».
   *
   * Ahora `id: null` lo DICE, y el caso sigue disponible para la proxy de
   * texto — que es lo correcto: no confirma un id, pero su relato sigue
   * valiendo.
   */
  const indiceCasos = casosFalsos([
    {
      id: 'libre', sistema: 'tanque', fecha: '2026-09-15', resuelto: true, score: 0,
      causaReal: { tipo: 'se rompió el codo de purga', id: null, texto: 'se rompió el codo de purga' },
    },
  ])
  const r = await createMotorDiagnostico({ indiceCasos })
    .diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  for (const causa of r.causas) {
    const confirmadaPorId = (causa.evidenciaAFavor ?? [])
      .some(e => e.fuente === 'casos' && e.referencia === 'libre')
    assert.equal(confirmadaPorId, false, `«${causa.id}» no debía darse por confirmada`)
  }
})

await check('`causaRealDe` lee las dos formas sin que nadie migre nada', async () => {
  const { causaRealDe } = await import('../shared/eva/comun/aprendizaje.js')

  assert.deepEqual(causaRealDe({ causaReal: { tipo: 'algo' } }), { id: 'algo', texto: 'algo' },
    'la vieja se devuelve en ambos: sin el catálogo delante no se sabe cuál era')
  assert.deepEqual(causaRealDe({ causaReal: { id: 'x', texto: 'Equis' } }), { id: 'x', texto: 'Equis' })
  assert.deepEqual(causaRealDe({ causaReal: { id: null, texto: 'libre' } }), { id: null, texto: 'libre' })
  assert.deepEqual(causaRealDe({}), { id: null, texto: null })
  assert.deepEqual(causaRealDe(null), { id: null, texto: null })
})

/* ── La calidad como veto, Plan 28 F4 ───────────────────────────────── */

console.log('\n── Un sensor inválido no respalda nada (Plan 28 F4) ───────')

/** Las tres señales que `bomba-sin-salida` necesita, todas en buena calidad. */
const MUESTRA_SANA = {
  presionRelativa: { valor: 3, quality: 0 },
  flujoInstantaneo: { valor: 0, quality: 0 },
  cargaMotor: { valor: 55, quality: 0 },
}

await check('una señal de MALA calidad se descuenta de `datos`', async () => {
  /*
   * ── POR QUÉ SE DESCUENTA Y NO SE PONDERA ──────────────────────────
   *
   * Un sensor inválido no es evidencia débil de una falla: es AUSENCIA de
   * evidencia. Contarlo como medio punto sería disfrazar el hueco de dato,
   * que es lo que prohíbe el §2.4. Y un quinto término obligaría además a
   * recalibrar `bandaDe()`, bloqueado por falta de corpus real.
   */
  const { QUALITY_SIN_DATO } = await import('../shared/quality.js')

  const sano = await SIN_FUENTES.diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida', valoresSensores: MUESTRA_SANA,
  })
  const roto = await SIN_FUENTES.diagnosticar({
    sistema: 'tanque',
    riesgoId: 'bomba-sin-salida',
    valoresSensores: { ...MUESTRA_SANA, flujoInstantaneo: { valor: 0, quality: QUALITY_SIN_DATO } },
  })

  assert.equal(sano.causas[0].respaldo.datos, 3)
  assert.equal(roto.causas[0].respaldo.datos, 2, 'la señal vetada sale de la cuenta')
})

await check('el veto se DICE, con el nombre de la señal', async () => {
  // Un `datos` más bajo sin explicación es un número que nadie puede auditar.
  const { QUALITY_BAD_UA } = await import('../shared/quality.js')

  const r = await SIN_FUENTES.diagnosticar({
    sistema: 'tanque',
    riesgoId: 'bomba-sin-salida',
    valoresSensores: { ...MUESTRA_SANA, presionRelativa: { valor: 3, quality: QUALITY_BAD_UA } },
  })

  assert.deepEqual(r.senalesVetadas, ['presionRelativa'])
  // Y su motivo queda archivado con su código, para la F2.
  assert.equal(r.snapshot.calidades.presionRelativa.motivo, 'mala')
})

await check('las CUATRO clases de mala calidad vetan, no sólo la mala', async () => {
  /*
   * `motivoDeCalidad` distingue cuatro situaciones y las tiene medidas contra
   * el servidor real. Las cuatro son «no se pudo medir», así que las cuatro
   * vetan — incluida `desconocida`, que es la que declara que NO SABEMOS qué
   * significa ese código: darla por buena sería afirmar algo no medido (§2.5).
   */
  const q = await import('../shared/quality.js')

  for (const [nombre, quality] of [
    ['mala', q.QUALITY_BAD_UA],
    ['incierta', q.QUALITY_UNCERTAIN],
    ['sin entrega', q.QUALITY_SIN_DATO],
    ['desconocida', 7],
  ]) {
    const r = await SIN_FUENTES.diagnosticar({
      sistema: 'tanque',
      riesgoId: 'bomba-sin-salida',
      valoresSensores: { ...MUESTRA_SANA, cargaMotor: { valor: 55, quality } },
    })
    assert.deepEqual(r.senalesVetadas, ['cargaMotor'], `«${nombre}» tenía que vetar`)
  }
})

await check('la calidad YA INTERPRETADA (`motivo`) veta igual que el código crudo', async () => {
  /*
   * ── LA FORMA QUE MANDA LA PANTALLA ────────────────────────────────
   *
   * `createSenal` resuelve la calidad al recibir el valor (Plan 21 F3), así
   * que el frontend no reenvía el código crudo de OPC: manda `motivo`, ya
   * interpretado. Aceptar sólo `quality` habría dejado el veto sin poder
   * dispararse desde la vista de cierre — que es justo donde más falta hace,
   * porque ahí el técnico está a punto de confirmar la causa propuesta.
   *
   * Y `motivo: null` explícito es calidad BUENA, no ausencia: el catálogo lo
   * usa así, y confundirlo archivaría como «no consta» algo que sí se midió.
   */
  const conMotivo = {
    presionRelativa: { valor: 3, motivo: null },
    flujoInstantaneo: { valor: 0, motivo: { codigo: 'sin_entrega', texto: 'Dejó de entregar.' } },
    cargaMotor: { valor: 55, motivo: null },
  }
  const r = await SIN_FUENTES.diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida', valoresSensores: conMotivo,
  })

  assert.deepEqual(r.senalesVetadas, ['flujoInstantaneo'])
  assert.equal(r.causas[0].respaldo.datos, 2)
  assert.equal(r.snapshot.calidades.flujoInstantaneo.motivo, 'sin_entrega')
  assert.equal(r.snapshot.calidades.presionRelativa.consta, true,
    '`motivo: null` es calidad buena MEDIDA, no «no consta»')
})

await check('un número PELADO no se veta: «no consta» no es «mala»', async () => {
  /*
   * La muestra puede llegar como objeto `{valor, quality}` o como número
   * suelto —`evaluarRiesgos` pasa lo segundo—. Un número sin calidad
   * declarada no dice que la calidad sea mala: dice que no consta. Vetarlo
   * castigaría a todo el que llame con la forma de siempre.
   */
  const r = await SIN_FUENTES.diagnosticar({
    sistema: 'tanque',
    riesgoId: 'bomba-sin-salida',
    valoresSensores: { presionRelativa: 3, flujoInstantaneo: 0, cargaMotor: 55 },
  })

  assert.equal(r.senalesVetadas, undefined, 'sin calidad declarada no se veta nada')
  assert.equal(r.causas[0].respaldo.datos, 3)
})

await check('sin `valoresSensores`, el comportamiento es EXACTAMENTE el de antes', async () => {
  // El criterio de aceptación de la fase: quien no traiga muestra no nota que
  // esta fase existe.
  const r = await SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  assert.equal(r.senalesVetadas, undefined)
  assert.equal(r.causas[0].respaldo.datos, 3, 'las tres señales que declara la regla')
})

await check('el suelo de `datos` sigue en 1 aunque se vete todo', async () => {
  /*
   * Un riesgo activo tiene al menos un dato detrás por definición —algo lo
   * disparó—, y eso no cambia porque la muestra que llega DESPUÉS ya no valga.
   * Bajar a 0 diría que el riesgo se activó sin evidencia, que es falso.
   */
  const { QUALITY_SIN_DATO } = await import('../shared/quality.js')
  const todoRoto = Object.fromEntries(
    Object.keys(MUESTRA_SANA).map((k) => [k, { valor: 0, quality: QUALITY_SIN_DATO }])
  )

  const r = await SIN_FUENTES.diagnosticar({
    sistema: 'tanque', riesgoId: 'bomba-sin-salida', valoresSensores: todoRoto,
  })

  assert.equal(r.causas[0].respaldo.datos, 1)
  assert.equal(r.senalesVetadas.length, 3, 'y las tres constan como vetadas')
})

/* ── El snapshot de evidencia, Plan 28 F1 ───────────────────────────── */

console.log('\n── El snapshot de evidencia (Plan 28 F1) ──────────────────')

await check('el snapshot recoge las referencias de manual y de casos, deduplicadas', async () => {
  /*
   * Dos causas del mismo riesgo citan a menudo el MISMO trozo de manual. El
   * snapshot lo archiva una vez: dos copias de la misma referencia no añaden
   * nada que auditar y multiplican el tamaño de la línea del diario (F2).
   */
  const indiceDocumentos = manualFalso({ 'impulsión cerrada': FUERTE, 'recirculación mínima': FUERTE })
  const r = await createMotorDiagnostico({ indiceDocumentos })
    .diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  const claves = r.snapshot.fragmentosManual.map(f => `${f.archivo}|${f.pagina}|${f.hash}`)
  assert.equal(new Set(claves).size, claves.length, 'hay fragmentos repetidos en el snapshot')
})

await check('el snapshot guarda REFERENCIAS del manual, nunca el texto', async () => {
  /*
   * El `hash` es del CONTENIDO del fragmento (Plan 17 F5), así que ya sirve
   * para saber si el PDF cambió desde que se citó. Guardar además el texto
   * sería tener dos copias de la misma verdad y un sitio más donde puedan
   * discrepar — y llenaría el disco de la planta sin añadir nada.
   */
  const indiceDocumentos = manualFalso({ 'impulsión cerrada': FUERTE })
  const r = await createMotorDiagnostico({ indiceDocumentos })
    .diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  for (const f of r.snapshot.fragmentosManual) {
    assert.deepEqual(Object.keys(f).sort(), ['archivo', 'hash', 'pagina'],
      'un fragmento del snapshot sólo lleva su referencia')
  }
})

await check('sin `valoresSensores`, el snapshot lo DICE en vez de inventar una muestra', async () => {
  const r = await SIN_FUENTES.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  assert.equal(r.snapshot.valoresSensores, null)
  assert.equal(r.snapshot.calidades, null, 'sin muestra no hay calidad que declarar')
})

await check('la calidad de cada señal viaja con su código, y «no consta» no es «buena»', async () => {
  /*
   * ── EL INSUMO DE LA F4, ARCHIVADO DESDE YA ────────────────────────
   *
   * «El nivel marcaba 12 %» y «el nivel marcaba 12 % con el sensor en mala
   * calidad» son dos diagnósticos distintos, y hoy el segundo no se distingue
   * del primero seis meses después. `motivoDeCalidad` ya separa cuatro
   * situaciones y las tiene medidas contra el servidor real.
   *
   * La distinción que esta prueba fija es la tercera: una señal que llega como
   * número pelado —sin `quality`— NO se archiva como buena. Se archiva como
   * «no consta», que es lo único cierto. Darla por buena sería exactamente
   * disfrazar una ausencia (§2.4).
   */
  const { QUALITY_SIN_DATO, MOTIVO } = await import('../shared/quality.js')

  const r = await SIN_FUENTES.diagnosticar({
    sistema: 'tanque',
    riesgoId: 'bomba-sin-salida',
    valoresSensores: {
      presionRelativa: { valor: 3.1, quality: 0 },
      flujoInstantaneo: { valor: 0, quality: QUALITY_SIN_DATO },
      cargaMotor: 55,
    },
  })

  const c = r.snapshot.calidades
  assert.equal(c.presionRelativa.motivo, null, 'calidad buena: sin motivo')
  assert.equal(c.presionRelativa.consta, true)
  assert.equal(c.flujoInstantaneo.motivo, MOTIVO.SIN_ENTREGA)
  assert.equal(c.cargaMotor.consta, false, 'un número pelado no declara su calidad')
  assert.equal(c.cargaMotor.motivo, null, 'y «no consta» tampoco es un motivo malo')

  // El valor sí se archiva en las tres, venga como objeto o como número: una
  // lectura de un instante no está guardada en ningún otro sitio.
  assert.equal(r.snapshot.valoresSensores.presionRelativa, 3.1)
  assert.equal(r.snapshot.valoresSensores.cargaMotor, 55)
})

console.log('\n── El huérfano deliberado y el huérfano por transcribir ─────')

await check('todo riesgo SIN causas está clasificado, en una lista o en la otra', () => {
  /*
   * La comprobación que impide que esto vuelva a pasar.
   *
   * La cabecera de `causas.js` enumeraba desde el primer día qué riesgos se
   * dejaban fuera y por qué, pero en prosa: nadie podía comprobarla, y al
   * cruzarla con las reglas reales el 03-09-2026 aparecieron DOS huérfanos
   * que no estaban en esa lista —`alarma-del-modulo` y `aviso-del-modulo`—.
   * No por una decisión: porque no había forma de notarlo.
   *
   * Ahora una regla nueva sin causas obliga a decidir: o se declara por qué
   * no las necesita, o se admite que faltan.
   */
  const sinClasificar = []
  for (const [sistema, reglas] of [['tanque', REGLAS_TANQUE], ['vibraciones', REGLAS_VIBRACION]]) {
    for (const regla of reglas) {
      if (causasDe(regla.id)) continue
      if (!porQueSinCausas(regla.id)) sinClasificar.push(`${sistema}/${regla.id}`)
    }
  }
  assert.deepEqual(
    sinClasificar, [],
    `sin clasificar: ${sinClasificar.join(', ')} — decláralos en SIN_CAUSAS_DELIBERADO ` +
      `(con su motivo) o en SIN_CAUSAS_PENDIENTE`
  )
})

await check('nadie se clasifica en las dos listas a la vez', () => {
  // Estar en las dos sería decir «no las necesita» y «le faltan» del mismo
  // riesgo. `porQueSinCausas` daría preferencia a la primera y la
  // contradicción quedaría enterrada.
  const enAmbas = Object.keys(SIN_CAUSAS_DELIBERADO).filter(id => id in SIN_CAUSAS_PENDIENTE)
  assert.deepEqual(enAmbas, [], `declarados a la vez deliberados y pendientes: ${enAmbas.join(', ')}`)
})

await check('ninguna lista clasifica un riesgo que SÍ tiene causas', () => {
  // Un riesgo con causas transcritas no es huérfano de nada. Tenerlo aquí
  // sería una entrada muerta que nadie volvería a mirar.
  const sobran = [...Object.keys(SIN_CAUSAS_DELIBERADO), ...Object.keys(SIN_CAUSAS_PENDIENTE)]
    .filter(id => causasDe(id))
  assert.deepEqual(sobran, [], `clasificados como sin causas pero las tienen: ${sobran.join(', ')}`)
})

await check('todo motivo declarado dice algo, y de una clase conocida', () => {
  const CLASES = new Set(['informativo', 'instrumentacion', 'rango-medida'])
  for (const [id, entrada] of Object.entries(SIN_CAUSAS_DELIBERADO)) {
    assert.ok(entrada.motivo && entrada.motivo.length > 30, `«${id}» no explica por qué`)
    assert.ok(CLASES.has(entrada.clase), `«${id}» tiene la clase desconocida "${entrada.clase}"`)
  }
  for (const [id, entrada] of Object.entries(SIN_CAUSAS_PENDIENTE)) {
    assert.ok(entrada.motivo && entrada.motivo.length > 30, `«${id}» no explica qué falta`)
  }
})

await check('`variador-en-fallo` tiene causas transcritas del manual del V20', () => {
  /*
   * Salió de `SIN_CAUSAS_DELIBERADO` el 04-09-2026. El argumento para
   * excluirlo era bueno —«su código ya identifica el fallo, hay un código que
   * buscar en el manual»— y dependía de una pieza que nadie había
   * construido: la máquina publica `ultimoFallo` y ninguna herramienta lo
   * lee. El riesgo se quedaba sin causas Y sin lectura del código.
   *
   * Las cinco familias salen de la tabla «Lista de códigos de fallo» del
   * manual de servicio del SINAMICS V20, p. 272. Transcripción, no autoría —
   * la misma regla que el resto del archivo.
   */
  const causas = causasDe('variador-en-fallo')
  assert.ok(causas && causas.length >= 4, 'se quedó sin causas candidatas')

  for (const causa of causas) {
    assert.match(causa.origen, /V20/, `«${causa.id}» no dice de qué manual sale`)
    // Todas provisionales: son la FAMILIA probable, no el fallo concreto. El
    // día que se lea `ultimoFallo`, el código exacto gana a esta lista.
    assert.equal(causa.provisional, true, `«${causa.id}» debería ser provisional`)
    assert.ok(
      causa.terminosManual.some(t => /^F\d+$/.test(t)),
      `«${causa.id}» no lleva ningún código de fallo entre sus términos de búsqueda`
    )
  }

  // La que conecta con ESTA máquina: el manual describe la vigilancia de
  // carga como la que detecta fallos mecánicos en la cadena cinemática.
  assert.ok(causas.some(c => c.id === 'disparo-de-vigilancia-de-carga'))
})

await check('porQueSinCausas distingue las dos, y no inventa una tercera', () => {
  const deliberado = porQueSinCausas('variador-en-manual')
  assert.equal(deliberado.deliberado, true)
  assert.equal(deliberado.clase, 'informativo')

  const pendiente = porQueSinCausas('alarma-del-modulo')
  assert.equal(pendiente.deliberado, false)
  assert.equal(pendiente.clase, 'pendiente')

  // Un riesgo que no existe no se clasifica: `null`, para que quien llame
  // pueda decir «nadie lo ha mirado» en vez de afirmar una de las dos.
  assert.equal(porQueSinCausas('no-existe-este-riesgo'), null)
})

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/motor/diagnostico.mjs o shared/eva/comun/causas.js.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: el diagnóstico se mantiene.${c.reset}`)
