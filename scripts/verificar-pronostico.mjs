#!/usr/bin/env node
/**
 * scripts/verificar-pronostico.mjs
 * ------------------------------------------------------------------
 * El motor de pronóstico por acumulación, sin servidor ni navegador.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Porque este módulo produce frases del tipo «la bomba ha aspirado con nivel
 * insuficiente 47 de las últimas 720 horas», y esa frase se usa para decidir
 * si se abre una bomba. Los dos modos de fallo son caros:
 *
 *   INFLAR   contar como desgaste horas en las que la bomba estaba parada.
 *            Manda a alguien a abrir una máquina que está sana.
 *   OCULTAR  no contar horas reales porque faltaba una señal. La pantalla
 *            dice «limpio» sobre un período que no se miró.
 *
 * La mitad de las comprobaciones de aquí son sobre el segundo, que es el que
 * no se nota: un cero se lee como buena noticia.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-pronostico.mjs
 */
import assert from 'node:assert/strict'

import {
  evaluarPronostico, MECANISMOS, preguntaSobrePronostico,
} from '../shared/eva/comun/pronostico.js'
import { REPOSO, UMBRALES } from '../shared/eva/comun/umbrales.js'

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

/* ── Fábrica de rejillas ─────────────────────────────────────────────── */

const CAUDAL_EN_MARCHA = 25
const CAUDAL_PARADA = 0

/** Una rejilla histórica: `n` filas iguales, con lo que se le pase. */
function filas(n, valores) {
  const salida = []
  for (let i = 0; i < n; i++) {
    salida.push({ t: new Date(Date.UTC(2026, 0, 1, i)), ...valores })
  }
  return salida
}

/** Fila sana y en marcha. */
const SANA = {
  nivelTanque: 55,
  temperaturaTanque: 20,
  presionRelativa: 3,
  tensionLinea: 120,
  flujoInstantaneo: CAUDAL_EN_MARCHA,
}

const buscar = (r, id) =>
  r.activos.find(a => a.id === id) ??
  r.sinExposicion.find(a => a.id === id) ??
  r.noEvaluables.find(a => a.id === id) ??
  null

const VENTANA = 720

console.log(`\n${c.negrita}Pronóstico por acumulación${c.reset}`)
console.log('\n── Contar bien lo que sí ocurrió ───────────────────────────')

check('acumula exposición sobre la fracción de muestras que la cumplen', () => {
  // 100 muestras en marcha, 20 con el nivel por debajo del aviso.
  const bajo = { ...SANA, nivelTanque: lim('nivelTanque', 'avisoMin') - 5 }
  const rejilla = [...filas(80, SANA), ...filas(20, bajo)]

  const cav = buscar(evaluarPronostico(rejilla, VENTANA), 'cavitacion-acumulada')
  assert.equal(cav.muestras, 100)
  assert.equal(cav.expuestas, 20)
  assert.ok(Math.abs(cav.fraccion - 0.2) < 1e-9, `fracción ${cav.fraccion}`)
})

check('las horas salen de la fracción por la ventana pedida', () => {
  // 20 % de 720 h = 144 h. Estimadas, no contadas — ver la cabecera del módulo.
  const bajo = { ...SANA, nivelTanque: 10 }
  const rejilla = [...filas(80, SANA), ...filas(20, bajo)]

  const cav = buscar(evaluarPronostico(rejilla, VENTANA), 'cavitacion-acumulada')
  assert.ok(Math.abs(cav.horasEstimadas - 144) < 0.5, `dio ${cav.horasEstimadas} h`)
})

check('lleva SIEMPRE el número de muestras sobre el que afirma', () => {
  /*
   * «47 horas de cavitación» sobre 9 muestras y sobre 9000 son afirmaciones
   * muy distintas. Sin `muestras` al lado, la pantalla no puede distinguirlas
   * y las pinta igual de rotundas.
   */
  const r = evaluarPronostico([...filas(50, SANA), ...filas(50, { ...SANA, nivelTanque: 10 })], VENTANA)
  for (const p of [...r.activos, ...r.sinExposicion]) {
    assert.ok(Number.isFinite(p.muestras) && p.muestras > 0, `${p.id} sin muestras`)
  }
})

console.log('\n── No inflar: la bomba parada no desgasta ──────────────────')

check('con la bomba PARADA no se acumula desgaste de marcha', () => {
  /*
   * El falso positivo caro. Un tanque al 10 % con la bomba parada es un tanque
   * vacío, no una bomba cavitando: no hay nada aspirando. Contarlo mandaría a
   * abrir una bomba sana.
   */
  const parada = { ...SANA, nivelTanque: 10, flujoInstantaneo: CAUDAL_PARADA }
  const cav = buscar(evaluarPronostico(filas(100, parada), VENTANA), 'cavitacion-acumulada')

  assert.ok(cav, 'el mecanismo tiene que aparecer')
  assert.ok(
    cav.falta || cav.expuestas === 0,
    `contó ${cav.expuestas} muestras de desgaste con la bomba parada`
  )
})

check('el borde del reposo no cuenta como marcha', () => {
  // Justo en el umbral NO es marcha: `impulsandoEn` exige superarlo.
  const enElBorde = { ...SANA, nivelTanque: 10, flujoInstantaneo: REPOSO.flujo }
  const cav = buscar(evaluarPronostico(filas(100, enElBorde), VENTANA), 'cavitacion-acumulada')
  assert.ok(cav.falta || cav.expuestas === 0)

  const justoEncima = { ...SANA, nivelTanque: 10, flujoInstantaneo: REPOSO.flujo + 0.1 }
  const cav2 = buscar(evaluarPronostico(filas(100, justoEncima), VENTANA), 'cavitacion-acumulada')
  assert.equal(cav2.expuestas, 100)
})

check('un mecanismo que NO es de marcha cuenta también con la bomba parada', () => {
  // El agua caliente estrecha el margen de aspiración esté la bomba como esté.
  const caliente = { ...SANA, temperaturaTanque: 40, flujoInstantaneo: CAUDAL_PARADA }
  const agua = buscar(evaluarPronostico(filas(100, caliente), VENTANA), 'agua-caliente-sostenida')
  assert.equal(agua.expuestas, 100)
})

console.log('\n── No ocultar: lo que falta se dice ────────────────────────')

check('sin la señal que necesita, queda SIN COMPROBAR, no en cero', () => {
  /*
   * El falso negativo peligroso. Sin presión no se puede afirmar que no hubo
   * sobrepresión; sólo que no se miró. Un cero ahí se lee como buena noticia.
   */
  const sinPresion = filas(100, SANA).map(f => {
    const { presionRelativa, ...resto } = f
    return resto
  })

  const r = evaluarPronostico(sinPresion, VENTANA)
  const sobre = r.noEvaluables.find(n => n.id === 'sobrepresion-sostenida')

  assert.ok(sobre, 'sobrepresión tenía que quedar sin comprobar')
  assert.match(sobre.falta, /presion/i, `dijo: ${sobre.falta}`)
  assert.ok(
    !r.activos.some(a => a.id === 'sobrepresion-sostenida') &&
    !r.sinExposicion.some(a => a.id === 'sobrepresion-sostenida'),
    'no puede aparecer como evaluada'
  )
})

check('la carga del motor no tiene historia: su mecanismo NUNCA se evalúa', () => {
  /*
   * Se deja en el catálogo a propósito. `cargaMotor` no tiene serie propia en
   * este servidor, así que este mecanismo siempre sale sin comprobar — y eso,
   * visible en pantalla, es lo que recuerda que falta configurar el
   * historiador. Si algún día se arregla, esta comprobación falla y avisa de
   * que ya se puede evaluar.
   */
  const r = evaluarPronostico(filas(100, SANA), VENTANA)
  const esf = r.noEvaluables.find(n => n.id === 'esfuerzo-sin-resultado')
  assert.ok(esf, 'con la historia rota tiene que estar en no evaluables')
})

check('una rejilla vacía no da ningún mecanismo por limpio', () => {
  const r = evaluarPronostico([], VENTANA)
  assert.deepEqual(r.activos, [])
  assert.deepEqual(r.sinExposicion, [], 'sin datos nada puede declararse limpio')
  assert.equal(r.noEvaluables.length, MECANISMOS.length)
})

check('una muestra incompleta no entra en el denominador', () => {
  // 50 muestras completas y 50 sin nivel: la fracción es sobre 50, no sobre 100.
  const sinNivel = filas(50, SANA).map(f => {
    const { nivelTanque, ...resto } = f
    return resto
  })
  const bajas = filas(50, { ...SANA, nivelTanque: 10 })

  const cav = buscar(evaluarPronostico([...sinNivel, ...bajas], VENTANA), 'cavitacion-acumulada')
  assert.equal(cav.muestras, 50, 'las incompletas no cuentan')
  assert.equal(cav.fraccion, 1, 'las 50 que sí se pudieron ver estaban todas bajas')
})

console.log('\n── Tendencia ──────────────────────────────────────────────')

check('detecta que la exposición está empeorando', () => {
  // Primera mitad limpia, segunda mitad expuesta.
  const r = evaluarPronostico(
    [...filas(50, SANA), ...filas(50, { ...SANA, nivelTanque: 10 })], VENTANA
  )
  assert.equal(buscar(r, 'cavitacion-acumulada').tendencia, 'empeorando')
})

check('detecta que está mejorando', () => {
  const r = evaluarPronostico(
    [...filas(50, { ...SANA, nivelTanque: 10 }), ...filas(50, SANA)], VENTANA
  )
  assert.equal(buscar(r, 'cavitacion-acumulada').tendencia, 'mejorando')
})

check('con muy pocas muestras NO se inventa una tendencia', () => {
  // Cuatro medidas no son una tendencia, por muy bien que se alineen.
  const r = evaluarPronostico(filas(4, { ...SANA, nivelTanque: 10 }), VENTANA)
  assert.equal(buscar(r, 'cavitacion-acumulada').tendencia, 'sin determinar')
})

console.log('\n── Lo que se afirma, y lo que no ───────────────────────────')

check('cada mecanismo explica POR QUÉ degrada, no sólo que degrada', () => {
  /*
   * «Riesgo de desgaste» sin mecanismo no es accionable: nadie sabe qué mirar
   * ni si tiene sentido. El mecanismo es lo que convierte un número en una
   * decisión de mantenimiento.
   */
  for (const m of MECANISMOS) {
    assert.ok(m.mecanismo?.trim().length > 80, `${m.id}: mecanismo demasiado corto`)
    assert.ok(m.consecuencia?.trim(), `${m.id} sin consecuencia`)
    assert.ok(m.accion?.trim(), `${m.id} sin acción`)
  }
})

check('la banda de tensión es el ±10 % del nominal ya confirmado', () => {
  /*
   * Nominal CONFIRMADO el 25-08-2026: red 208Y/120. La señal mide una línea
   * contra neutro, de ahí que lea 121-127 V y no 208, así que el nominal que
   * aplica es 120 V y la banda dura es el ±10 % de NEMA MG-1 §12.44.
   *
   * Se comprueba el NÚMERO, no el comentario. Si alguien mueve la banda sin
   * mover el nominal, estas horas dejan de contar lo que dicen contar, y eso
   * no se ve mirando la pantalla: sale una cifra, y parece buena.
   */
  assert.equal(UMBRALES.tensionLinea.min, 108, 'el -10 % de 120 V')
  assert.equal(UMBRALES.tensionLinea.max, 132, 'el +10 % de 120 V')

  const fuera = { ...SANA, tensionLinea: 95 }
  const t = buscar(evaluarPronostico(filas(100, fuera), VENTANA), 'tension-fuera-de-tolerancia')

  assert.ok(!t.confirmar, 'ya no queda duda abierta que arrastrar hasta la pantalla')
  assert.ok(t.norma, 'pero la norma de la que sale el criterio sigue viajando')
})

check('la pregunta al asistente PROHÍBE inventar un plazo', () => {
  /*
   * «¿En cuántos años se avería?» es exactamente la pregunta que un modelo
   * contesta con una cifra inventada que suena perfecta. Sin datos de
   * temperatura del devanado no hay forma de estimarlo, así que se prohíbe en
   * la propia pregunta.
   */
  const p = buscar(
    evaluarPronostico(filas(100, { ...SANA, nivelTanque: 10 }), VENTANA),
    'cavitacion-acumulada'
  )
  const pregunta = preguntaSobrePronostico(p)

  assert.match(pregunta, /NO estimes cuántos años/i)
  assert.match(pregunta, /hip[oó]tesis/i)
  assert.match(pregunta, /100/, 'y lleva el número de muestras medido')
})

check('la evaluación se declara provisional mientras los umbrales lo sean', () => {
  assert.equal(evaluarPronostico(filas(10, SANA), VENTANA).provisional, true)
})

check('los mecanismos sólo usan señales que existen', () => {
  const claves = new Set(Object.keys(UMBRALES))
  for (const m of MECANISMOS) {
    for (const k of m.necesita) {
      assert.ok(claves.has(k), `${m.id} necesita "${k}", que no es una señal conocida`)
    }
  }
})

/* ── Resultado ───────────────────────────────────────────────────────── */

function lim(key, cual) { return UMBRALES[key]?.[cual] ?? null }

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa shared/eva/comun/pronostico.js.${c.reset}`)
  process.exit(1)
}

console.log(
  `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `${MECANISMOS.length} mecanismos de desgaste.${c.reset}`
)
