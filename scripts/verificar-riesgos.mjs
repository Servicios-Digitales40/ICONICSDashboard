#!/usr/bin/env node
/**
 * scripts/verificar-riesgos.mjs
 * ------------------------------------------------------------------
 * El motor de riesgos por combinación, sin navegador ni servidor.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Porque estas reglas deciden si en una pantalla de planta aparece «riesgo de
 * derrame», y los dos errores posibles son caros en direcciones opuestas:
 *
 *   FALSO POSITIVO   avisa de un derrame con la bomba parada. Se repite, deja
 *                    de creerse, y el día que el aviso es real nadie lo mira.
 *   FALSO NEGATIVO   calla porque falta una lectura. La pantalla se ve
 *                    tranquila y nadie sabe que no se miró nada.
 *
 * El segundo es el que se cuela sin que nadie lo note, así que la mitad de las
 * comprobaciones de aquí son sobre él: que una señal ausente produzca «no
 * evaluable» y NUNCA silencio.
 *
 * `evaluarRiesgos` es una función pura sobre el objeto `Sistema`, así que se
 * prueba entera sin red y sin React.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-riesgos.mjs
 */
import assert from 'node:assert/strict'

import { createSistema } from '../shared/eva/tanque/sistema.js'
import { evaluarRiesgos, preguntaSobreRiesgo, REGLAS } from '../shared/eva/tanque/riesgos.js'
import { REPOSO, UMBRALES } from '../shared/eva/comun/umbrales.js'
import { SENALES } from '../shared/eva/tanque/senales.js'

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

/* ── Fábricas de escenario ───────────────────────────────────────────── */

/**
 * Construye un `Sistema` a partir de valores sueltos.
 *
 * Se pasa por `createSistema` en vez de fabricar el objeto a mano para que las
 * pruebas corran contra la MISMA evaluación que la pantalla: si cambia cómo se
 * derivan los estados, esto cambia con ella en vez de seguir verificando una
 * forma que ya no existe.
 */
function sistemaCon(valores) {
  const lecturas = {}
  for (const [k, v] of Object.entries(valores)) lecturas[k] = { value: v }
  return createSistema(lecturas)
}

/** Una instalación sana y en marcha: la base sobre la que se altera una cosa. */
const EN_MARCHA = {
  nivelTanque: 55,
  temperaturaTanque: 20,
  cargaMotor: 60,
  modoVdf: false,
  flujoInstantaneo: 25,
  presionRelativa: 3,
  tensionLinea: 120,
  eficienciaEnergetica: 75,
}

/** La misma instalación, parada. */
const PARADA = {
  ...EN_MARCHA,
  cargaMotor: 0,
  flujoInstantaneo: 0,
  presionRelativa: 0,
}

const ids = (r) => r.activos.map((a) => a.id)
const idsNoEval = (r) => r.noEvaluables.map((n) => n.id)

/* ══ El caso que pidió el usuario ══════════════════════════════════════ */

console.log(`\n${c.negrita}Riesgos por combinación${c.reset}`)
console.log('\n── Nivel alto + bomba encendida ────────────────────────────')

check('con el tanque por encima del aviso y la bomba impulsando, avisa de derrame', () => {
  const r = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, nivelTanque: 93 }))
  assert.ok(ids(r).includes('derrame'), `no salió el aviso; salieron: ${ids(r)}`)
})

check('EL MISMO NIVEL con la bomba parada NO avisa de derrame', () => {
  /*
   * La razón de ser del archivo entero. Un tanque al 93 % que nadie está
   * llenando se queda al 93 %: avisar ahí es el falso positivo que enseña a
   * ignorar la pantalla. Lo que cambia el desenlace no es el nivel, es la otra
   * señal.
   */
  const r = evaluarRiesgos(sistemaCon({ ...PARADA, nivelTanque: 93 }))
  assert.ok(!ids(r).includes('derrame'), 'avisó de derrame con la bomba parada')
})

check('el aviso de derrame lleva las DOS cifras que lo justifican', () => {
  // La evidencia tiene que dejar reconstruir por qué saltó. Con sólo el nivel,
  // quien lo lee no puede distinguirlo de un aviso de señal suelta.
  const r = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, nivelTanque: 93 }))
  const derrame = r.activos.find((a) => a.id === 'derrame')
  assert.match(derrame.evidencia, /93/, 'falta el nivel')
  assert.match(derrame.evidencia, /60/, 'falta la carga del motor')
})

console.log('\n── Presión alta + bomba activa ─────────────────────────────')

check('presión por encima del aviso con la bomba impulsando avisa de sobrepresión', () => {
  // 7.5, no 6: el 14-09-2026 se subió `avisoMax` de 5.5 a 7.2 PSI (medido
  // contra un día real de bombeo — la operación sana llegaba a 6.9), así
  // que el fixture tiene que quedar por encima del umbral nuevo.
  const r = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, presionRelativa: 7.5 }))
  assert.ok(ids(r).includes('sobrepresion'), `salieron: ${ids(r)}`)
})

check('la misma presión con la bomba parada no avisa', () => {
  const r = evaluarRiesgos(sistemaCon({ ...PARADA, presionRelativa: 7.5 }))
  assert.ok(!ids(r).includes('sobrepresion'), 'avisó con la bomba parada')
})

console.log('\n── Las otras combinaciones ─────────────────────────────────')

check('nivel bajo con la bomba en marcha avisa de marcha en seco', () => {
  // El más caro de todos: aspirar en vacío destruye el sello en minutos.
  const r = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, nivelTanque: 12 }))
  assert.ok(ids(r).includes('marcha-en-seco'), `salieron: ${ids(r)}`)
})

check('presión alta con caudal bajo apunta a obstrucción', () => {
  const r = evaluarRiesgos(sistemaCon({
    ...EN_MARCHA, presionRelativa: 7.5, flujoInstantaneo: 1,
  }))
  assert.ok(ids(r).includes('obstruccion'), `salieron: ${ids(r)}`)
})

check('caudal alto con presión baja apunta a fuga', () => {
  const r = evaluarRiesgos(sistemaCon({
    ...EN_MARCHA, presionRelativa: 1, flujoInstantaneo: 50,
  }))
  assert.ok(ids(r).includes('posible-fuga'), `salieron: ${ids(r)}`)
})

check('obstrucción y fuga no pueden salir a la vez', () => {
  // Son condiciones opuestas. Que salieran juntas significaría que los umbrales
  // se solapan, y la pantalla diría dos cosas contrarias con la misma cara.
  for (const escenario of [
    { ...EN_MARCHA, presionRelativa: 7.5, flujoInstantaneo: 1 },
    { ...EN_MARCHA, presionRelativa: 1, flujoInstantaneo: 50 },
  ]) {
    const salidas = ids(evaluarRiesgos(sistemaCon(escenario)))
    assert.ok(
      !(salidas.includes('obstruccion') && salidas.includes('posible-fuga')),
      `salieron las dos: ${salidas}`
    )
  }
})

check('tensión fuera de rango con el motor en carga es crítico', () => {
  const r = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, tensionLinea: 96 }))
  const aviso = r.activos.find((a) => a.id === 'tension-fuera-con-motor')
  assert.ok(aviso, `salieron: ${ids(r)}`)
  assert.equal(aviso.severidad, 'critico')
})

check('el variador en Manual se informa, pero NO como problema', () => {
  /*
   * Operar en Manual es legítimo y se hace a diario. Pintarlo del mismo color
   * que un riesgo de derrame es la forma de conseguir que el color deje de
   * significar algo.
   */
  const r = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, modoVdf: true }))
  const aviso = r.activos.find((a) => a.id === 'variador-en-manual')
  assert.ok(aviso, `salieron: ${ids(r)}`)
  assert.equal(aviso.severidad, 'informativo')
  assert.ok(aviso.nota, 'debe confesar que la correspondencia Auto/Manual no está confirmada')
})

console.log('\n── Que no avise cuando todo va bien ────────────────────────')

check('una instalación sana y en marcha no produce ningún riesgo', () => {
  const r = evaluarRiesgos(sistemaCon(EN_MARCHA))
  assert.deepEqual(ids(r), [], `avisó de: ${ids(r)}`)
})

check('una instalación parada tampoco', () => {
  // Es el estado NORMAL de esta planta la mayor parte del tiempo. Si el reposo
  // disparara avisos, la pantalla estaría en rojo permanente y sería inútil.
  const r = evaluarRiesgos(sistemaCon(PARADA))
  assert.deepEqual(ids(r), [], `avisó de: ${ids(r)}`)
})

console.log('\n── Lo que no se puede mirar, se dice ───────────────────────')

check('sin carga del motor, las reglas de marcha quedan SIN EVALUAR, no en silencio', () => {
  /*
   * El falso negativo peligroso. Sin la carga del motor no se puede afirmar que
   * la bomba impulsa —ni que no—, así que «derrame» no se puede decidir. La
   * respuesta correcta es «no lo sé», nunca una lista vacía que se lee como
   * tranquilidad.
   */
  const sinCarga = { ...EN_MARCHA, nivelTanque: 93 }
  delete sinCarga.cargaMotor

  const r = evaluarRiesgos(sistemaCon(sinCarga))
  assert.ok(!ids(r).includes('derrame'), 'no puede AFIRMAR el riesgo sin saber si la bomba corre')
  assert.ok(idsNoEval(r).includes('derrame'), 'y tiene que aparecer como no evaluable')
})

check('la regla no evaluable dice QUÉ lectura le faltó', () => {
  // Sin eso, «no evaluable» no es accionable: nadie sabe qué arreglar.
  const sinNivel = { ...EN_MARCHA }
  delete sinNivel.nivelTanque

  const r = evaluarRiesgos(sistemaCon(sinNivel))
  const derrame = r.noEvaluables.find((n) => n.id === 'derrame')
  assert.ok(derrame, 'derrame debía quedar sin evaluar')
  assert.match(derrame.falta, /nivel/i, `dijo: ${derrame.falta}`)
})

check('`evaluadas` no cuenta las que no se pudieron mirar', () => {
  const sinNivel = { ...EN_MARCHA }
  delete sinNivel.nivelTanque

  const r = evaluarRiesgos(sistemaCon(sinNivel))
  assert.equal(r.evaluadas, REGLAS.length - r.noEvaluables.length)
  assert.ok(r.evaluadas < REGLAS.length, 'con una señal ausente no pueden estar todas evaluadas')
})

check('sin ninguna lectura, NADA se da por bueno', () => {
  // La pantalla en blanco al arrancar. Cero riesgos activos y cero reglas
  // evaluadas: es la única lectura honesta de «todavía no sé nada».
  const r = evaluarRiesgos(createSistema({}))
  assert.deepEqual(ids(r), [])
  assert.equal(r.evaluadas, 0, 'no puede haber comprobado nada sin datos')
  assert.equal(r.noEvaluables.length, REGLAS.length)
})

console.log('\n── Presentación ───────────────────────────────────────────')

check('lo crítico va antes que lo informativo', () => {
  const r = evaluarRiesgos(sistemaCon({
    ...EN_MARCHA, nivelTanque: 93, modoVdf: true,
  }))
  const orden = r.activos.map((a) => a.severidad)
  assert.equal(orden[0], 'critico', `el orden fue: ${orden}`)
  assert.equal(orden[orden.length - 1], 'informativo')
})

check('cada riesgo separa lo medido de la hipótesis', () => {
  /*
   * La regla que se le exige al asistente al diagnosticar, aplicada también
   * aquí. Si evidencia y consecuencia se fundieran en un solo texto, una
   * deducción nuestra se leería con la autoridad de una medición.
   */
  const r = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, nivelTanque: 93 }))
  for (const a of r.activos) {
    assert.ok(a.evidencia?.trim(), `${a.id} sin evidencia`)
    assert.ok(a.consecuencia?.trim(), `${a.id} sin consecuencia`)
    assert.ok(a.accion?.trim(), `${a.id} sin acción`)
    assert.notEqual(a.evidencia, a.consecuencia)
  }
})

check('la evaluación se declara provisional mientras los umbrales lo sean', () => {
  // Es lo que obliga a la pantalla a rotularlo. Ver la cabecera de umbrales.js.
  assert.equal(evaluarRiesgos(sistemaCon(EN_MARCHA)).provisional, true)
})

check('la pregunta al asistente lleva la evidencia ya medida', () => {
  /*
   * Sin la cifra dentro, el modelo arrancaría de cero y podría razonar sobre
   * el estado de dos horas después. Con ella, la respuesta queda anclada al
   * mismo hecho que el operador está viendo en la tarjeta.
   */
  const r = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, nivelTanque: 93 }))
  const derrame = r.activos.find((a) => a.id === 'derrame')
  const pregunta = preguntaSobreRiesgo(derrame)

  assert.match(pregunta, /Riesgo de derrame/)
  assert.match(pregunta, /93/, 'la cifra medida tiene que viajar en la pregunta')
  assert.match(pregunta, /hip[oó]tesis/i, 'debe pedir separar medido de hipótesis')
})

check('todas las reglas declaran las señales que necesitan', () => {
  // Sin `necesita` bien puesto, una regla se evaluaría con `undefined` dentro y
  // produciría un aviso a partir de una comparación con un hueco.
  /*
   * ── SE PREGUNTA AL CATÁLOGO, NO A `UMBRALES` (PLAN 29 F3) ─────────
   *
   * Esto miraba `Object.keys(UMBRALES)`, y funcionó mientras todas las reglas
   * comparaban magnitudes con banda. Las cuatro reglas de cruce con alarma
   * necesitan bits del PLC (`nivelAltoAlto`, `paroDeEmergencia`,
   * `fallaVariador`, `presionAlta`) y las ocho alarmas NO están en `UMBRALES`
   * — no por olvido: una alarma booleana no tiene banda que declarar, es
   * exactamente lo que dice la cabecera de ese archivo («las señales booleanas
   * no tienen banda y valen `null` entero»).
   *
   * Que `modoVdf` sí figure allí, con `null` explícito, es lo que mantuvo la
   * comprobación en pie hasta hoy: era la única booleana que una regla
   * necesitaba.
   *
   * Lo que esta prueba quiere saber es si la señal EXISTE, y eso lo define
   * `SENALES`, que es el catálogo. `UMBRALES` sólo dice qué banda tiene la que
   * ya existe. Preguntar al archivo correcto es además más estricto: una regla
   * que pida una clave inventada sigue fallando, y ahora también falla si pide
   * una que tenga umbral pero no esté en el catálogo.
   */
  for (const regla of REGLAS) {
    assert.ok(Array.isArray(regla.necesita) && regla.necesita.length, `${regla.id} sin necesita`)
    for (const k of regla.necesita) {
      assert.ok(k in SENALES, `${regla.id} necesita "${k}", que no es una señal conocida`)
    }
  }
})

check('el umbral de reposo se respeta en el borde', () => {
  // Justo en el límite la bomba NO se considera impulsando: `impulsando` exige
  // superarlo, no igualarlo. Un borde mal puesto aquí mueve todos los avisos.
  const enElBorde = { ...EN_MARCHA, cargaMotor: REPOSO.cargaMotor, nivelTanque: 93 }
  assert.ok(!ids(evaluarRiesgos(sistemaCon(enElBorde))).includes('derrame'))

  const justoEncima = { ...EN_MARCHA, cargaMotor: REPOSO.cargaMotor + 0.1, nivelTanque: 93 }
  assert.ok(ids(evaluarRiesgos(sistemaCon(justoEncima))).includes('derrame'))
})

console.log('\n── Bomba girando contra una salida cerrada ────────────────')

check('la bomba girando contra una salida cerrada es CRÍTICA', () => {
  /*
   * Caudal cero, con presión, y la bomba impulsando. Sin caudal no hay agua
   * que se lleve el calor: toda la potencia del eje se queda dentro de la
   * voluta. El daño va en minutos, así que no puede quedar en «conviene
   * mirarlo».
   */
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA,  flujoInstantaneo: 0, presionRelativa: 3.0, cargaMotor: 55 }))
  const r = res.activos.find((a) => a.id === 'bomba-sin-salida')

  assert.ok(r, 'tiene que salir')
  assert.equal(r.severidad, 'critico')
  assert.match(r.evidencia, /0\.00/, 'la evidencia lleva el caudal medido')
  assert.match(r.accion, /v[áa]lvula/i, 'y manda mirar la válvula de impulsión')
})

check('con la bomba PARADA no se avisa de salida cerrada', () => {
  /*
   * La instalación pasa la mayor parte del tiempo parada, y parada el caudal
   * es cero. Sin la condición de impulsión esta regla estaría siempre roja y
   * dejaría de significar nada.
   */
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA,  flujoInstantaneo: 0, presionRelativa: 3.0, cargaMotor: 0 }))
  assert.ok(!ids(res).includes('bomba-sin-salida'))
})

check('sin presión NO es salida cerrada: eso es otra avería', () => {
  /*
   * Caudal cero SIN presión es que no hay nada que bombear, y esa es
   * `marcha-en-seco`. Confundirlas mandaría a mirar la válvula cuando el
   * problema está en la aspiración.
   */
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA,  flujoInstantaneo: 0, presionRelativa: 0, cargaMotor: 55 }))
  assert.ok(!ids(res).includes('bomba-sin-salida'), 'sin presión, esta regla calla')
})

check('un caudal NEGATIVO tan pequeño como cero también cuenta', () => {
  /*
   * El caudal de esta instalación mide valores negativos —está documentado en
   * `umbrales-sin-confirmar`—. Comparar sin valor absoluto dejaría pasar un
   * −0,2 como si fuera caudal, y es exactamente igual de nulo que un +0,2.
   */
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA,  flujoInstantaneo: -0.2, presionRelativa: 3.0, cargaMotor: 55 }))
  assert.ok(ids(res).includes('bomba-sin-salida'))
})

check('la salida cerrada se ve aunque la carga del motor sea BAJA', () => {
  /*
   * Es la razón de ser de esta regla. Al cerrar la impulsión, una bomba
   * centrífuga de impulsor radial se desplaza hacia su punto de cierre, donde
   * absorbe MENOS potencia. Así que `esfuerzo-sin-resultado` —que exige carga
   * alta— es justo la regla que no puede ver esto, y si esta otra copiara esa
   * condición el hueco seguiría abierto.
   */
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA,  flujoInstantaneo: 0, presionRelativa: 3.0, cargaMotor: 40 }))
  assert.ok(ids(res).includes('bomba-sin-salida'), 'con 40 % de carga tiene que salir igual')
  assert.ok(!ids(res).includes('esfuerzo-sin-resultado'), 'y la otra, como es de esperar, no la ve')
})

check('con presión NORMAL sale igual, que es lo que obstruccion no cubría', () => {
  /*
   * `obstruccion` exige presión por encima del aviso. Una bomba a caudal cero
   * contra su altura de cierre puede quedarse en presión perfectamente
   * normal; si esta regla copiara ese umbral, el caso se perdería otra vez.
   */
  const normal = (UMBRALES.presionRelativa.avisoMin + UMBRALES.presionRelativa.avisoMax) / 2
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA,  flujoInstantaneo: 0, presionRelativa: normal, cargaMotor: 55 }))
  assert.ok(ids(res).includes('bomba-sin-salida'))
  assert.ok(!ids(res).includes('obstruccion'), 'a presión normal, obstruccion calla')
})

check('sin la lectura de caudal se declara no evaluable, no silencio', () => {
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA,  flujoInstantaneo: null, presionRelativa: 3.0, cargaMotor: 55 }))
  assert.ok(!ids(res).includes('bomba-sin-salida'))
  assert.ok(idsNoEval(res).includes('bomba-sin-salida'),
    'tiene que constar que no se pudo mirar')
})

/* ── El cruce con las alarmas del PLC, Plan 29 F3 ────────────────────── */

console.log('\n── El cruce con las alarmas del PLC (Plan 29 F3) ──────────')

/*
 * Estas cuatro reglas NO son un sistema de alarmas —la cabecera de
 * `riesgos.js` lo prohíbe—: disparan cuando la alarma del PLC y el estado de
 * la máquina se CONTRADICEN. Por eso cada una se prueba dos veces: con la
 * contradicción y sin ella. Que calle cuando la alarma está activa y la
 * máquina hace lo que debe es la mitad del valor de la regla.
 */

check('nivel crítico con la bomba impulsando es CRÍTICO', () => {
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, nivelAltoAlto: true }))
  assert.ok(ids(res).includes('nivel-critico-con-bomba-impulsando'))
})

check('la misma alarma con la bomba PARADA no cruza nada', () => {
  // El PLC sigue avisando del nivel —y su vista lo pinta—, pero aquí no hay
  // contradicción que enseñar: nadie está llenando.
  const res = evaluarRiesgos(sistemaCon({ ...PARADA, nivelAltoAlto: true }))
  assert.ok(!ids(res).includes('nivel-critico-con-bomba-impulsando'))
})

check('sin la alarma de nivel, la regla se declara no evaluable', () => {
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, nivelAltoAlto: null }))
  assert.ok(idsNoEval(res).includes('nivel-critico-con-bomba-impulsando'),
    'tiene que constar que no se pudo mirar, no callar')
})

check('el paro de emergencia se lee INVERTIDO: `false` es la condición mala', () => {
  /*
   * Contacto normalmente cerrado, confirmado contra el programa real el
   * 10-09-2026: `true` es «sin emergencia». Si esta comprobación se
   * invirtiera, la regla avisaría en toda operación normal y callaría en la
   * única situación que existe para cazar.
   */
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, paroDeEmergencia: false }))
  assert.ok(ids(res).includes('emergencia-con-motor-en-carga'))
})

check('con el paro SIN accionar (`true`) no se avisa de nada', () => {
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, paroDeEmergencia: true }))
  assert.ok(!ids(res).includes('emergencia-con-motor-en-carga'))
})

check('variador en falla con el motor en carga es CRÍTICO', () => {
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, fallaVariador: true }))
  assert.ok(ids(res).includes('variador-en-falla-y-sigue-mandando'))
})

check('variador en falla con el motor PARADO no cruza nada', () => {
  const res = evaluarRiesgos(sistemaCon({ ...PARADA, fallaVariador: true }))
  assert.ok(!ids(res).includes('variador-en-falla-y-sigue-mandando'))
})

check('alarma de presión del PLC con nuestra lectura en banda: se enseña el desacuerdo', () => {
  /*
   * La que habría cazado el incidente del 14-09-2026 sin medirlo a mano.
   * `presionRelativa: 3` está muy por debajo del `avisoMax` de 7,2, así que
   * nuestro umbral dice «normal» mientras el PLC grita.
   */
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, presionAlta: true, presionRelativa: 3 }))
  assert.ok(ids(res).includes('alarma-de-proceso-sin-respaldo-analogico'))
})

check('cuando alarma y medida COINCIDEN, no hay desacuerdo que contar', () => {
  // Presión por encima de nuestro aviso y alarma activa: las dos dicen lo
  // mismo. Avisar aquí sería ruido, y encima duplicaría a `sobrepresion`.
  const res = evaluarRiesgos(sistemaCon({
    ...EN_MARCHA, presionAlta: true, presionRelativa: UMBRALES.presionRelativa.avisoMax + 0.5,
  }))
  assert.ok(!ids(res).includes('alarma-de-proceso-sin-respaldo-analogico'))
})

check('ninguna regla de cruce dispara en una instalación sana', () => {
  /*
   * La comprobación que protege de un falso positivo permanente: con las
   * cuatro alarmas en su estado bueno, ninguna de las cuatro puede aparecer.
   * `paroDeEmergencia: true` es el estado BUENO — ver arriba.
   */
  const res = evaluarRiesgos(sistemaCon({
    ...EN_MARCHA,
    nivelAltoAlto: false, paroDeEmergencia: true, fallaVariador: false, presionAlta: false,
  }))
  for (const id of [
    'nivel-critico-con-bomba-impulsando',
    'emergencia-con-motor-en-carga',
    'variador-en-falla-y-sigue-mandando',
    'alarma-de-proceso-sin-respaldo-analogico',
  ]) {
    assert.ok(!ids(res).includes(id), `${id} no puede disparar con todo en orden`)
  }
})

/* ── Coherencia entre orden y realimentación, Plan 29 F4 ─────────────── */

console.log('\n── Coherencia orden/realimentación (Plan 29 F4) ───────────')

check('una válvula con orden de abrir que se lee "Apagado" es CRÍTICA', () => {
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, arranqueParoS1: true, estadoS1: 1 }))
  assert.ok(ids(res).includes('orden-sin-respuesta'))
})

check('con la válvula obedeciendo (estado "En marcha") no se avisa', () => {
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, arranqueParoS1: true, estadoS1: 2 }))
  assert.ok(!ids(res).includes('orden-sin-respuesta'))
})

check('sin orden de abrir, una válvula apagada es lo normal', () => {
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, arranqueParoS1: false, estadoS1: 1 }))
  assert.ok(!ids(res).includes('orden-sin-respuesta'))
})

check('el `0` del PLC NO se lee como una válvula que desobedece', () => {
  /*
   * La comprobación que justifica escribir estas reglas contra valores
   * DECLARADOS (`=== 1`, `=== 3`) y nunca contra «distinto de 2». `estadoS1`
   * declara en su propia nota que `0` es el valor inicial del PLC y se trata
   * como sin dato. Un arranque de PLC no es una avería, y confundirlos sería
   * disfrazar la ausencia de dato (CLAUDE.md §2.4) con un estado discreto.
   */
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, arranqueParoS1: true, estadoS1: 0 }))
  assert.ok(!ids(res).includes('orden-sin-respuesta'),
    'un 0 recién arrancado el PLC no puede ser una orden desatendida')
  assert.ok(!ids(res).includes('actuador-en-error'),
    'ni un error')
})

check('un actuador que reporta "Error" (3) se dice, sin deducir nada', () => {
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, estadoS1: 3 }))
  assert.ok(ids(res).includes('actuador-en-error'))
})

check('un actuador en mantenimiento (4) no es un error', () => {
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, estadoS1: 4 }))
  assert.ok(!ids(res).includes('actuador-en-error'))
})

check('un bloqueo de mantenimiento con el proceso en marcha se dice, y es INFORMATIVO', () => {
  const res = evaluarRiesgos(sistemaCon({ ...EN_MARCHA, mttoS1: true }))
  const aviso = res.activos.find((a) => a.id === 'bloqueo-de-mantenimiento-con-proceso-en-marcha')
  assert.ok(aviso, 'tiene que salir')
  assert.equal(aviso.severidad, 'informativo',
    'poner un bloqueo es una decisión de alguien, no un síntoma')
})

check('el mismo bloqueo con el proceso PARADO no se menciona', () => {
  const res = evaluarRiesgos(sistemaCon({ ...PARADA, mttoS1: true }))
  assert.ok(!ids(res).includes('bloqueo-de-mantenimiento-con-proceso-en-marcha'))
})

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa shared/eva/tanque/riesgos.js.${c.reset}`)
  process.exit(1)
}

console.log(
  `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `${REGLAS.length} reglas de riesgo evaluadas.${c.reset}`
)
