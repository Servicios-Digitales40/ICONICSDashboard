#!/usr/bin/env node
/**
 * scripts/verificar-riesgos-vibracion.mjs
 * ------------------------------------------------------------------
 * El motor de riesgos de vibración, sin navegador ni servidor.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Porque este motor puede equivocarse de una forma peor que callándose: puede
 * dar por buena una máquina que nadie ha evaluado.
 *
 * La máquina real giraba a 604 rpm el 25-08-2026, con el variador a 20,15 Hz.
 * Son 10,07 Hz de giro: por encima de los 10 Hz en que arranca la banda de
 * medida de ISO 10816, o sea DENTRO de su alcance —pero pegada al corte del
 * filtro, que en su propia frecuencia ya atenúa cerca de un 30 %—.
 *
 * Los dos errores fáciles están uno a cada lado, y los dos se comprueban aquí:
 *
 *   PASARSE   declarar «no evaluable» a 604 rpm. Se inventa una limitación que
 *             la norma no impone y se deja de vigilar una máquina vigilable.
 *   QUEDARSE  soltar «0,23 mm/s, perfecto» y callar que el número llega
 *             recortado. Una pantalla tranquila con menos respaldo del que
 *             aparenta.
 *
 * Por eso buena parte de lo que se comprueba aquí no es «¿salta cuando debe?»
 * sino «¿se declara NO EVALUABLE exactamente cuando no puede opinar, y ni un
 * caso más?».
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-riesgos-vibracion.mjs
 */
import assert from 'node:assert/strict'

import {
  evaluarRiesgosVibracion,
  preguntaSobreRiesgoVibracion,
  REGLAS,
} from '../shared/eva/riesgosVibracion.js'
import {
  AREA_ALARMAS,
  CANALES,
  CONTADORES_ALARMA,
  decodificarVigilancia,
  esHistorizada,
  LIMITES_ISO,
  RPM_MINIMA_ISO,
  MEDIDAS,
  parsePunto,
  puntoMedida,
  puntoVariador,
  puntoVigilancia,
  RAIZ_VIB,
  todosLosPuntos,
  VIGILANCIA,
  VIGILANCIAS,
} from '../shared/eva/vibraciones.js'

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

/** Los dos estados de vigilancia que sí se han observado en el servidor. */
const EN_ORDEN = VIGILANCIA.find((v) => v.id === 'ok')
const APAGADO = VIGILANCIA.find((v) => v.id === 'apagado')

/** Un canal sano y completo. Los escenarios parten de aquí y estropean uno. */
const CANAL_SANO = {
  vRMS: 0.3, aRMS: 0.4, aPeak: 1.2, DKW: 1.0,
  alarma: false, aviso: false, offset: 0,
  /* TODAS las vigilancias en orden, rodamientos incluidos: el escenario sano
     tiene que ser el que no dispara nada, o las pruebas de abajo no aislarían
     nada al estropear una sola cosa. */
  vigilancias: Object.fromEntries(VIGILANCIAS.map((v) => [v.key, EN_ORDEN])),
  calidades: { qcVRMS: 1, qcARMS: 1, qcDKW: 1 },
  sensor: EN_ORDEN,
}

/** Variador girando a régimen y con carga: ISO aplica y la medida es válida. */
const VARIADOR_SANO = { velocidad: 3400, frecuencia: 58.2, par: 62, potencia: 1.2, fallo: 0, ultimoFallo: 0 }

/** Sin alarmas activas ni pendientes: el area tranquila. */
const ALARMAS_EN_CALMA = {
  activasSinReconocer: 0, activasReconocidas: 0,
  normalSinReconocer: 0, severidadActivas: null,
}

function estado({ canales = {}, variador = {}, alarmas = {} } = {}) {
  return {
    canales: Object.fromEntries(
      CANALES.map((ch) => [ch.id, { ...CANAL_SANO, ...(canales[ch.id] ?? {}) }]),
    ),
    variador: { ...VARIADOR_SANO, ...variador },
    alarmas: { ...ALARMAS_EN_CALMA, ...alarmas },
  }
}

const buscar = (res, id, canal = null) =>
  res.activos.find((a) => a.id === id && (canal === null || a.canal === canal))

const noEvaluable = (res, id, canal = null) =>
  res.noEvaluables.find((a) => a.id === id && (canal === null || a.canal === canal))

/* ── El catálogo ─────────────────────────────────────────────────────── */

console.log(`\n${c.negrita}── El catálogo de puntos ───────────────────────────────────${c.reset}`)

check('la raíz lleva el espacio de «DEMO 3»', () => {
  /*
   * `DEMO3` sin espacio devuelve HTTP 500 y parece que el tag no existe. Es un
   * fallo silencioso y caro, así que se fija aquí.
   */
  assert.ok(RAIZ_VIB.includes('DEMO 3'), `la raíz es «${RAIZ_VIB}»`)
  assert.ok(!RAIZ_VIB.includes('DEMO3:'), 'no puede llevar «DEMO3» sin espacio')
})

check('los puntos se construyen como los devuelve el servidor', () => {
  assert.equal(puntoMedida('vRMS', 'S1'), 'hda:\\Configuration\\DEMO 3:vRMS_S1')
  assert.equal(puntoMedida('aRMS', 'S3'), 'hda:\\Configuration\\DEMO 3:aRMS_S3')
  assert.equal(puntoVariador('velocidad'), 'hda:\\Configuration\\DEMO 3:SPEED_BMS')
})

check('parsePunto es el inverso exacto, y rechaza lo que no reconoce', () => {
  for (const ch of CANALES) {
    for (const m of MEDIDAS) {
      const p = parsePunto(puntoMedida(m.key, ch.id))
      assert.deepEqual(p, { tipo: 'medida', clave: m.key, canal: ch.id }, `${m.key}/${ch.id}`)
    }
  }
  /* Un punto ajeno tiene que dar `null` y no colarse como si fuera de aquí:
     un cambio en el servidor debe verse como dato ausente, nunca como una
     asignación a la señal equivocada. */
  assert.equal(parsePunto('ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE'), null)
  assert.equal(parsePunto('hda:\\Configuration\\DEMO 3:INVENTADO_S1'), null)
  assert.equal(parsePunto(null), null)
})

check('hay TRES canales, no dos', () => {
  /*
   * Se creía que había dos sensores. El servidor publica tres, los tres con
   * calidad buena y con su propio `EQUIPMENT NAME`. Si alguien recorta el
   * catálogo a dos, el apoyo del lado libre deja de vigilarse en silencio.
   */
  assert.equal(CANALES.length, 3, 'S1, S2 y S3')
  assert.deepEqual(CANALES.map((x) => x.id), ['S1', 'S2', 'S3'])
})

check('cada canal lleva SU sensibilidad, confirmada una por una', () => {
  /*
   * 99 y 100,05 no son el mismo número. El módulo divide por la sensibilidad,
   * así que un canal configurado con el 100 nominal cuando su sonda trae 99
   * escala todas sus lecturas un 1 % de más, para siempre y sin avisar.
   *
   * S3 estuvo en `null` un día entero porque nadie había declarado su sonda.
   * Al final resultó ser 100 clavados, pero eso no valida haberlo supuesto:
   * de las tres sondas, dos NO son el nominal.
   */
  const porId = Object.fromEntries(CANALES.map((x) => [x.id, x.sensibilidad]))
  assert.equal(porId.S1, 100.05)
  assert.equal(porId.S2, 99)
  assert.equal(porId.S3, 100)
  /* Las tres confirmadas una por una, y ninguna deducida de las otras: S1 trae
     100,05 y S2 trae 99, asi que el nominal nunca fue una apuesta segura. */
  assert.ok(CANALES.every((x) => x.sensibilidad !== null), 'ninguna sin confirmar')
})

check('el catálogo no promete historia que no existe', () => {
  /*
   * Medido el 25-08-2026: el grupo `DEMO 3` devuelve HTTP 500 en sus 119 tags.
   * Mientras siga así, pedir una serie de aquí trae un error o —peor— la serie
   * de otra señal. `esHistorizada` es la puerta que lo impide.
   */
  assert.equal(esHistorizada('vRMS'), false, 'ninguna señal de vibración tiene serie propia')
  assert.ok(todosLosPuntos().length > 0, 'hay puntos que registrar en el sondeo')
})

check('el catálogo abarca DOS espacios de nombres, no uno', () => {
  /*
   * Las medidas viven en el historiador (`hda:`) y las alarmas en el servidor
   * de alarmas (`ae:`). Son subsistemas distintos de ICONICS y fallan por
   * separado —el 26-08-2026 el historial de alarmas daba 500 mientras los
   * contadores del área respondían—, así que el sondeo tiene que pedir de los
   * dos y no dar por hecho que si uno va, va el otro.
   */
  const puntos = todosLosPuntos()
  const enHistoriador = puntos.filter((p) => p.startsWith(RAIZ_VIB))
  const enAlarmas = puntos.filter((p) => p.startsWith(AREA_ALARMAS))

  assert.ok(enHistoriador.length > 50, `sólo ${enHistoriador.length} del historiador`)
  assert.equal(enAlarmas.length, CONTADORES_ALARMA.length, 'los contadores del área')
  assert.equal(enHistoriador.length + enAlarmas.length, puntos.length,
    'ningún punto se queda fuera de los dos espacios')
})

/* ── La velocidad manda ──────────────────────────────────────────────── */

console.log(`\n${c.negrita}── Cuándo la norma NO se ha pronunciado ─────────────────────${c.reset}`)

check('a 604 rpm la norma SÍ aplica, pero se avisa de que va recortada', () => {
  /*
   * Éste es el caso real medido el 25-08-2026, y es donde es fácil pasarse de
   * frenada en las dos direcciones.
   *
   * 604 rpm son 10,07 Hz: la máquina está DENTRO del alcance de la norma, así
   * que declarar «no evaluable» sería inventarse una limitación y dejar de
   * vigilar una máquina que se puede vigilar. Pero está pegada al corte del
   * filtro, que en su propia frecuencia ya atenúa cerca de un 30 %, así que
   * soltar «0,23 mm/s, perfecto» y callarse sería quedarse corto.
   *
   * Lo correcto es lo que se comprueba aquí: veredicto ISO válido, más un
   * aviso aparte de que el número llega recortado.
   */
  const res = evaluarRiesgosVibracion(estado({
    canales: { S1: { vRMS: 0.2301 } },
    variador: { velocidad: 604, frecuencia: 20.15, par: 0 },
  }))

  assert.equal(res.normaAplicable, true, '604 rpm está por encima de 600')
  assert.ok(!noEvaluable(res, 'vibracion-en-aviso', 'S1'), 'la regla de ISO sí se evalúa')
  assert.ok(!buscar(res, 'vibracion-en-aviso', 'S1'), 'y con 0,23 mm/s no salta')
  assert.ok(!buscar(res, 'velocidad-fuera-de-norma'), 'no está por debajo del alcance de la norma')

  const borde = buscar(res, 'velocidad-en-el-borde-de-la-banda')
  assert.ok(borde, 'pero tiene que avisar de que está en el borde de la banda')
  assert.match(borde.evidencia, /604/)
  assert.match(borde.consecuencia, /recortada|aten/i)
})

check('por debajo de 600 rpm las reglas de ISO se declaran NO EVALUABLES', () => {
  /*
   * Aquí sí: la frecuencia de giro se sale de la banda y el filtro se come la
   * componente de desequilibrio. Un «dentro de límite» a 400 rpm no dice nada
   * de la máquina, sólo dice que la norma no se ha pronunciado.
   */
  const res = evaluarRiesgosVibracion(estado({
    canales: { S1: { vRMS: 0.2 } },
    variador: { velocidad: 400, frecuencia: 13.3 },
  }))

  assert.equal(res.normaAplicable, false)
  assert.ok(noEvaluable(res, 'vibracion-en-aviso', 'S1'), 'el aviso ISO queda sin evaluar')
  assert.ok(noEvaluable(res, 'vibracion-en-alarma', 'S1'), 'y la alarma ISO también')
  assert.match(noEvaluable(res, 'vibracion-en-aviso', 'S1').porque, /400|rpm/)

  const r = buscar(res, 'velocidad-fuera-de-norma')
  assert.ok(r, 'y se dice por qué')
  assert.match(r.consecuencia, /BAJAS|baja/i, 'que las lecturas salen bajas por construcción')
})

check('sin dato de velocidad NO se da por hecho que la norma aplica', () => {
  /*
   * «No se sabe si aplica» y «no aplica» son cosas distintas, pero la que de
   * verdad hace daño es tratar «no se sabe» como «sí aplica»: se emitiría un
   * veredicto ISO sobre una máquina de régimen desconocido.
   */
  const res = evaluarRiesgosVibracion(estado({
    canales: { S1: { vRMS: 9.9 } },
    variador: { velocidad: null },
  }))
  assert.equal(res.normaAplicable, null, 'ni true ni false: no se sabe')
  assert.ok(!buscar(res, 'vibracion-en-alarma', 'S1'), 'no puede afirmar zona D sin saber el régimen')
  assert.ok(noEvaluable(res, 'vibracion-en-alarma', 'S1'), 'pero tiene que decir que no lo miró')
})

check('a régimen normal, ISO sí se aplica', () => {
  const res = evaluarRiesgosVibracion(estado({ canales: { S1: { vRMS: 2.4 } } }))
  assert.equal(res.normaAplicable, true)
  assert.ok(buscar(res, 'vibracion-en-aviso', 'S1'), '2,4 mm/s cae en zona C')
  assert.ok(!buscar(res, 'velocidad-fuera-de-norma'), 'a 3400 rpm no hay nada que advertir')
})

/* ── Las bandas de ISO 10816-1 Clase I ───────────────────────────────── */

console.log(`\n${c.negrita}── Las bandas, que son las de Clase I y no otras ────────────${c.reset}`)

check('los límites son los de Clase I: 0,71 / 1,8 / 4,5', () => {
  /*
   * Se comprueba el NÚMERO, no el comentario. La tabla de ISO 10816-3 pondría
   * el aviso en 4,5 —es para máquinas de más de 15 kW— y este motor son 1,5 kW:
   * con esa tabla se perdería la mitad del margen útil y el aviso llegaría
   * cuando la máquina ya estuviera en zona de daño.
   */
  assert.equal(LIMITES_ISO.nueva, 0.71)
  assert.equal(LIMITES_ISO.aviso, 1.8)
  assert.equal(LIMITES_ISO.alarma, 4.5)
  assert.equal(RPM_MINIMA_ISO, 600)
})

check('el aviso y la alarma no se solapan', () => {
  /* Si las dos saltaran a la vez, la pantalla mostraría el mismo apoyo dos
     veces con dos gravedades distintas y ninguna sería creíble. */
  const alto = evaluarRiesgosVibracion(estado({ canales: { S1: { vRMS: 5.0 } } }))
  assert.ok(buscar(alto, 'vibracion-en-alarma', 'S1'))
  assert.ok(!buscar(alto, 'vibracion-en-aviso', 'S1'), 'con alarma, el aviso no se repite')

  const medio = evaluarRiesgosVibracion(estado({ canales: { S1: { vRMS: 2.0 } } }))
  assert.ok(buscar(medio, 'vibracion-en-aviso', 'S1'))
  assert.ok(!buscar(medio, 'vibracion-en-alarma', 'S1'))
})

check('en el borde exacto de 1,8 todavía no se avisa', () => {
  /* La zona B llega HASTA 1,8 inclusive. Avisar en el borde convertiría una
     máquina admisible en una incidencia. */
  const res = evaluarRiesgosVibracion(estado({ canales: { S1: { vRMS: LIMITES_ISO.aviso } } }))
  assert.ok(!buscar(res, 'vibracion-en-aviso', 'S1'))
})

/* ── Lo que no se puede vigilar ──────────────────────────────────────── */

console.log(`\n${c.negrita}── Lo que NO se está vigilando, dicho en voz alta ───────────${c.reset}`)

check('un DKW sin referencia se denuncia, no se ignora', () => {
  /*
   * `DKW_S1` llegaba con calidad mala el 25-08-2026 mientras S2 y S3 daban
   * número: el aprendizaje se hizo en unos canales y no en otros. El DKW es la
   * medida que antes ve un rodamiento picándose, así que su ausencia es
   * justamente lo que no puede pasar desapercibido.
   */
  const res = evaluarRiesgosVibracion(estado({ canales: { S1: { DKW: null } } }))
  const r = buscar(res, 'dkw-sin-referencia', 'S1')
  assert.ok(r, 'tiene que salir')
  assert.match(r.accion, /Aplicar|aprend/i, 'y decir cómo se aprende la referencia')
  assert.match(r.accion, /dañado/i, 'incluido el riesgo de aprender sobre una máquina ya dañada')
  assert.ok(!buscar(res, 'dkw-sin-referencia', 'S2'), 'S2 sí lo tiene: no debe salir')
})

check('una lectura que falta produce «no evaluable», nunca silencio', () => {
  const res = evaluarRiesgosVibracion(estado({ canales: { S2: { vRMS: null } } }))
  assert.ok(noEvaluable(res, 'vibracion-en-aviso', 'S2'), 'sin vRMS no se puede juzgar S2')
  assert.ok(!buscar(res, 'vibracion-en-aviso', 'S2'), 'y desde luego no se afirma que está bien')
})

check('el aviso de medida en vacío sale con el par a cero', () => {
  /*
   * En vacío no aparecen las vibraciones que sólo se manifiestan bajo carga.
   * Una medida limpia con la máquina girando sin trabajar no descarta nada, y
   * es exactamente la situación medida el 25-08-2026 (par 0,00, potencia 0,00).
   */
  const res = evaluarRiesgosVibracion(estado({ variador: { par: 0, potencia: 0 } }))
  const r = buscar(res, 'medida-en-vacio')
  assert.ok(r)
  assert.match(r.consecuencia, /carga/i)
})

/* ── Comparación entre apoyos ────────────────────────────────────────── */

console.log(`\n${c.negrita}── Comparar apoyos entre sí ─────────────────────────────────${c.reset}`)

check('un apoyo disparado se detecta contra LOS OTROS, no contra todos', () => {
  /*
   * Si el sospechoso entra en su propia referencia, tira de la mediana hacia
   * arriba y se esconde a sí mismo. Con tres canales eso importa de verdad.
   */
  const res = evaluarRiesgosVibracion(estado({
    canales: { S1: { aRMS: 3.0 }, S2: { aRMS: 0.4 }, S3: { aRMS: 0.5 } },
  }))
  const r = buscar(res, 'asimetria-entre-apoyos')
  assert.ok(r, 'S1 mide 6-7 veces lo que sus compañeros')
  assert.match(r.evidencia, /Lado acople/, 'y tiene que decir CUÁL')
  assert.equal(r.norma, null, 'ISO no compara apoyos: no se le puede colgar la norma')
})

check('con los tres apoyos parecidos no se inventa una asimetría', () => {
  const res = evaluarRiesgosVibracion(estado({
    canales: { S1: { aRMS: 0.45 }, S2: { aRMS: 0.40 }, S3: { aRMS: 0.52 } },
  }))
  assert.ok(!buscar(res, 'asimetria-entre-apoyos'))
})

check('con menos de tres apoyos no se compara, y se dice que no se comparó', () => {
  /*
   * Comparar dos apoyos entre sí no distingue «uno alto» de «uno bajo»: hace
   * falta un tercero que desempate. Pero no basta con no comparar — hay que
   * decirlo, o la pantalla enseña una máquina sin asimetrías cuando lo que
   * pasa es que nadie las ha buscado.
   */
  const res = evaluarRiesgosVibracion(estado({
    canales: { S1: { aRMS: 3.0 }, S2: { aRMS: 0.4 }, S3: { aRMS: null } },
  }))
  assert.ok(!buscar(res, 'asimetria-entre-apoyos'), 'no se afirma nada')
  const ne = noEvaluable(res, 'asimetria-entre-apoyos')
  assert.ok(ne, 'pero consta como no evaluada')
  assert.match(ne.porque, /3|tres/, `dijo: ${ne?.porque}`)
})

/* ── Lo que dice el módulo, y lo que se afirma ───────────────────────── */

console.log(`\n${c.negrita}── Lo que se afirma, y lo que no ────────────────────────────${c.reset}`)

check('la alarma del módulo no se disfraza de diagnóstico', () => {
  const res = evaluarRiesgosVibracion(estado({ canales: { S3: { alarma: true } } }))
  const r = buscar(res, 'alarma-del-modulo', 'S3')
  assert.ok(r)
  assert.equal(r.nivel, 'critico')
  assert.match(r.consecuencia, /No dice CUÁL|no dice cuál/i,
    'el módulo no publica qué umbral cruzó, y eso hay que decirlo')
})

check('cada riesgo separa evidencia, hipótesis y acción', () => {
  /*
   * Es el pacto de toda la pantalla: lo medido y lo supuesto no se mezclan.
   * Una frase que junte las dos cosas se lee como si el sistema supiera lo que
   * está pasando, y no lo sabe.
   */
  const res = evaluarRiesgosVibracion(estado({
    canales: { S1: { vRMS: 5.0, alarma: true, offset: 0.3 } },
    variador: { fallo: 3, velocidad: 604 },
  }))
  assert.ok(res.activos.length >= 3, `salieron ${res.activos.length}`)
  for (const r of res.activos) {
    assert.ok(r.evidencia && r.evidencia.length > 10, `${r.id} sin evidencia`)
    assert.ok(r.consecuencia && r.consecuencia.length > 10, `${r.id} sin hipótesis`)
    assert.ok(r.accion && r.accion.length > 10, `${r.id} sin acción`)
  }
})

check('el resultado se declara SIN HISTORIA mientras el grupo no registre', () => {
  /*
   * Si la pantalla no lo dice, el usuario supone que detrás hay tendencia. No
   * la hay: `DEMO 3` devuelve 500 en sus 119 tags.
   */
  const res = evaluarRiesgosVibracion(estado())
  assert.equal(res.sinHistoria, true)
  assert.equal(res.provisional, true)
})

check('la pregunta al asistente PROHÍBE poner plazo a la avería', () => {
  /*
   * «¿En cuántos meses se rompe?» es exactamente la pregunta que un modelo
   * contesta con una cifra inventada que suena perfecta. Sin histórico no hay
   * tendencia, y sin tendencia no hay plazo.
   */
  const res = evaluarRiesgosVibracion(estado({ canales: { S1: { vRMS: 5.0 } } }))
  const q = preguntaSobreRiesgoVibracion(buscar(res, 'vibracion-en-alarma', 'S1'))
  assert.match(q, /NO estimes/, 'tiene que prohibirlo explícitamente')
  assert.match(q, /histórico|tendencia/i, 'y decir por qué')
  assert.match(q, /4\.5|4,5|zona D/i, 'y llevar la evidencia ya medida dentro')
})

check('todas las reglas declaran qué necesitan y con qué gravedad', () => {
  const niveles = new Set(['critico', 'atencion', 'informativo'])
  for (const r of REGLAS) {
    assert.ok(Array.isArray(r.necesita), `${r.id} sin lista de necesidades`)
    assert.ok(niveles.has(r.nivel), `${r.id} con nivel «${r.nivel}»`)
    assert.ok(['canal', 'maquina'].includes(r.ambito), `${r.id} con ámbito «${r.ambito}»`)
    assert.equal(typeof r.cuando, 'function', `${r.id} sin condición`)
  }
})

console.log(`\n${c.negrita}── Lo que el módulo vigila, y lo que no ─────────────────────${c.reset}`)

check('el estado se lee de la POSICIÓN del byte encendido', () => {
  /*
   * Llega en base64 de un arreglo con UN byte a 1, y la posición es el estado.
   * Se fijan las dos posiciones observadas en el servidor real; las otras dos
   * siguen deducidas, y el catálogo tiene que declararlo.
   */
  assert.equal(decodificarVigilancia('AAEAAA==').id, 'ok', '[0 1 0 0]')
  assert.equal(decodificarVigilancia('AQAAAA==').id, 'apagado', '[1 0 0 0]')
  assert.equal(VIGILANCIA.find((v) => v.id === 'ok').confirmado, true)
  assert.equal(VIGILANCIA.find((v) => v.id === 'alarma').confirmado, false,
    'las posiciones 2 y 3 nunca se han visto: no pueden ir como confirmadas')
})

check('un estado que no se sabe leer da null, y NO «apagado»', () => {
  /*
   * Con dos bytes encendidos, o con ninguno, no hay estado que devolver. Un
   * «apagado» de consuelo convertiría un dato que no entendemos en una
   * afirmación sobre la máquina — y encima en la que dispara la alarma
   * crítica de rodamientos sin vigilar.
   */
  assert.equal(decodificarVigilancia('AQEAAA=='), null, 'dos bytes a 1')
  assert.equal(decodificarVigilancia('AAAAAA=='), null, 'ninguno a 1')
  assert.equal(decodificarVigilancia('esto no es base64'), null)
  assert.equal(decodificarVigilancia(null), null)
  assert.equal(decodificarVigilancia(undefined), null)
})

check('el diagnóstico de rodamientos apagado se denuncia como CRÍTICO', () => {
  /*
   * Es el caso real: BPFO, BPFI y FTF estaban en [1 0 0 0] en los tres canales
   * el 26-08-2026. Y es crítico aunque no falle nada, porque lo apagado es la
   * única vigilancia que distingue un rodamiento picado de una máquina que
   * vibra un poco más — y su ausencia no se ve: todo lo demás sale igual de
   * verde.
   */
  const apagados = Object.fromEntries(
    VIGILANCIAS.map((v) => [v.key, v.grupo === 'rodamiento' ? APAGADO : EN_ORDEN]),
  )
  const res = evaluarRiesgosVibracion(estado({ canales: { S1: { vigilancias: apagados } } }))
  const r = buscar(res, 'rodamientos-sin-vigilar', 'S1')

  assert.ok(r, 'tiene que salir')
  assert.equal(r.nivel, 'critico')
  assert.match(r.evidencia, /3 de 3/)
  assert.match(r.accion, /geometr|elementos rodantes/i, 'y decir qué falta configurar')
  assert.ok(!buscar(res, 'rodamientos-sin-vigilar', 'S2'), 'S2 las tiene: no debe salir')
})

check('las de umbral apagadas van aparte de las de rodamiento', () => {
  /*
   * Mezclarlas diluiría la única que importa de verdad en una lista de cinco
   * avisos indistinguibles.
   */
  const v = { ...Object.fromEntries(VIGILANCIAS.map((x) => [x.key, EN_ORDEN])), monDKW: APAGADO }
  const res = evaluarRiesgosVibracion(estado({ canales: { S1: { vigilancias: v } } }))

  assert.ok(buscar(res, 'medida-sin-vigilar', 'S1'), 'el DKW sin umbral sale')
  assert.ok(!buscar(res, 'rodamientos-sin-vigilar', 'S1'), 'y no se cuela como rodamiento')
})

check('una vigilancia disparada dice CUÁL, y confiesa que la lectura es deducida', () => {
  const enAlarma = VIGILANCIA.find((x) => x.id === 'alarma')
  const v = { ...Object.fromEntries(VIGILANCIAS.map((x) => [x.key, EN_ORDEN])), bpfo: enAlarma }
  const res = evaluarRiesgosVibracion(estado({ canales: { S2: { vigilancias: v } } }))
  const r = buscar(res, 'vigilancia-en-aviso', 'S2')

  assert.ok(r)
  assert.match(r.evidencia, /BPFO|exterior/i, 'tiene que nombrar la vigilancia concreta')
  /* Las posiciones 2 y 3 no se han observado nunca. Sin esa advertencia al
     lado, el veredicto se lee con más autoridad de la que tiene. */
  assert.ok(r.nota, 'tiene que llevar la advertencia')
  assert.match(r.nota, /deducid|sin confirmar|no confirmada/i, `dijo: ${r.nota}`)
})

check('una confianza por debajo del nominal se avisa; por encima, no', () => {
  /*
   * La escala exacta de `QC_*` está sin confirmar —sólo se ha observado el 1
   * con la máquina sana—, así que tratar cualquier desviación como fallo
   * llenaría la pantalla de avisos sobre un número que aún no sabemos leer.
   */
  const baja = evaluarRiesgosVibracion(
    estado({ canales: { S1: { calidades: { qcVRMS: 0.4, qcARMS: 1, qcDKW: 1 } } } }),
  )
  const r = buscar(baja, 'confianza-de-medida-baja', 'S1')
  assert.ok(r, 'una confianza de 0,4 tiene que salir')
  assert.match(r.evidencia, /0\.400/)

  const alta = evaluarRiesgosVibracion(
    estado({ canales: { S1: { calidades: { qcVRMS: 1.2, qcARMS: 1, qcDKW: 1 } } } }),
  )
  assert.ok(!buscar(alta, 'confianza-de-medida-baja', 'S1'), 'por encima del nominal no es problema')
})

check('sin lectura de estado NO se afirma que algo esté apagado', () => {
  /*
   * El fallo caro de esta familia entera: un canal que no entrega sus estados
   * produciría, con un «?? apagado» descuidado, una alarma crítica de
   * rodamientos sin vigilar que nadie ha medido.
   */
  const res = evaluarRiesgosVibracion(estado({ canales: { S3: { vigilancias: {} } } }))
  assert.ok(!buscar(res, 'rodamientos-sin-vigilar', 'S3'))
  assert.ok(!buscar(res, 'medida-sin-vigilar', 'S3'))
})

check('los nombres irregulares del servidor se respetan tal cual', () => {
  /*
   * `MonState_vRMS_2` en S2 no lleva la S, y `Sensor_state_1/2/3` usan el
   * número suelto. Está así en el servidor: «arreglarlo» pediría un tag que no
   * existe y el punto volvería vacío sin que nadie se enterase.
   */
  assert.equal(puntoVigilancia('monVRMS', 'S2'), 'hda:\\Configuration\\DEMO 3:MonState_vRMS_2')
  assert.equal(puntoVigilancia('monVRMS', 'S1'), 'hda:\\Configuration\\DEMO 3:MonState_vRMS_S1')
  assert.equal(puntoVigilancia('bpfo', 'S3'), 'hda:\\Configuration\\DEMO 3:MonState_e_f_BPFO_S3')
})

check('parsePunto sigue siendo el inverso exacto de TODAS las familias', () => {
  /* Irregulares incluidas: el mapa inverso se construye con los mismos
     generadores de nombre, así que no se puede desincronizar. */
  for (const p of todosLosPuntos()) {
    assert.ok(parsePunto(p), `no se reconoce ${p}`)
  }
})

console.log(`\n${c.negrita}── El servidor de alarmas de ICONICS ────────────────────────${c.reset}`)

check('una alarma activa del servidor sale como CRÍTICA', () => {
  /*
   * Estas no las deduce esta pantalla: las emite ICONICS con límites puestos
   * por quien conoce el proceso. Mandan sobre cualquier cosa que se concluya
   * aquí, así que una alarma activa no puede quedar por debajo de una regla
   * nuestra en la lista.
   */
  const res = evaluarRiesgosVibracion(
    estado({ alarmas: { activasSinReconocer: 2, activasReconocidas: 1, normalSinReconocer: 12, severidadActivas: 800 } }),
  )
  const r = buscar(res, 'alarmas-activas')
  assert.ok(r)
  assert.equal(r.nivel, 'critico')
  assert.match(r.evidencia, /3 alarma/, 'las activas se suman: 2 sin reconocer + 1 reconocida')
  assert.match(r.evidencia, /800/, 'y la severidad viaja con ellas')
  assert.equal(res.activos[0].id, 'alarmas-activas', 'lo crítico va primero')
})

check('las alarmas activas confiesan que no se sabe CUÁL es cada una', () => {
  /*
   * La API sólo expone contadores del área: por alarma individual devuelve
   * calidad mala. Decir «hay 3 alarmas» y callar que no se sabe cuáles sería
   * peor que no decir nada, porque suena a que la pantalla lo sabe.
   */
  const res = evaluarRiesgosVibracion(estado({ alarmas: { activasSinReconocer: 3 } }))
  const r = buscar(res, 'alarmas-activas')
  assert.ok(r.nota, 'tiene que llevar la advertencia')
  assert.match(r.nota, /cuál|no se puede saber/i, `dijo: ${r.nota}`)
  assert.match(r.accion, /visor|ICONICS/i, 'y mandar a donde sí se puede ver')
})

check('las que volvieron a normal no se pintan como problema activo', () => {
  /*
   * Es el caso real del 26-08-2026: 0 activas y 12 normales sin reconocer. La
   * máquina está bien AHORA. Pintarlo en ámbar junto a un problema de verdad
   * enseñaría a ignorar el ámbar, que es lo que no se quiere en una pantalla
   * de avisos.
   */
  const res = evaluarRiesgosVibracion(
    estado({ alarmas: { activasSinReconocer: 0, activasReconocidas: 0, normalSinReconocer: 12 } }),
  )
  const r = buscar(res, 'alarmas-sin-reconocer')
  assert.ok(r, 'tiene que salir')
  assert.equal(r.nivel, 'informativo')
  assert.match(r.evidencia, /12/)
  assert.ok(!buscar(res, 'alarmas-activas'), 'y no como alarma activa')
})

check('con alarmas ACTIVAS, las viejas sin reconocer no hacen ruido', () => {
  /*
   * Si las dos salieran a la vez, la de verdad quedaría al lado de una lista
   * de doce apagadas y costaría distinguirlas de un vistazo.
   */
  const res = evaluarRiesgosVibracion(
    estado({ alarmas: { activasSinReconocer: 1, normalSinReconocer: 12 } }),
  )
  assert.ok(buscar(res, 'alarmas-activas'))
  assert.ok(!buscar(res, 'alarmas-sin-reconocer'), 'la vieja se calla mientras haya una activa')
})

check('sin lectura de los contadores no se inventa ninguna alarma', () => {
  const res = evaluarRiesgosVibracion(estado({ alarmas: {} }))
  assert.ok(!buscar(res, 'alarmas-activas'))
  assert.ok(!buscar(res, 'alarmas-sin-reconocer'))
})

/* ── Resumen ─────────────────────────────────────────────────────────── */

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa shared/eva/riesgosVibracion.js.${c.reset}`)
  process.exit(1)
}
console.log(
  `${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `${REGLAS.length} reglas sobre ${CANALES.length} apoyos.${c.reset}`,
)
