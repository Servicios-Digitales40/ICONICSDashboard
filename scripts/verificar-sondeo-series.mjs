#!/usr/bin/env node
/**
 * scripts/verificar-sondeo-series.mjs
 * ------------------------------------------------------------------
 * El sondeo que decide si una serie es de verdad de su variable. Plan 34 F2.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Porque este módulo es el que tiene permiso para poner `historyVerified` en
 * `true`, y esa marca es una PROMESA: a partir de ella el tablero dibuja
 * gráficas y el motor calcula tendencias. Una promesa mal dada no rompe nada
 * visible — rellena una gráfica con la serie de otra señal bajo el rótulo
 * correcto.
 *
 * Así que lo que se comprueba aquí no es «¿verifica?» sino **«¿se niega a
 * verificar exactamente cuando debe, y ni un caso más?»**. Los dos errores
 * están uno a cada lado:
 *
 *   PASARSE   marcar `false` porque la máquina estaba parada. Se borra una
 *             verificación buena por no haber podido mirar.
 *   QUEDARSE  marcar `true` sin comparar. Es el defecto `aPeak_S1`, que llevaba
 *             meses en el catálogo y sólo se vio cruzando series.
 *   CONFUNDIR marcar `false` por comparar MAL. Medido contra planta el
 *             22-09-2026: `aPeak_S1` y `aRMS_S1` se declararon «serie
 *             compartida» comparando ocho muestras por POSICIÓN, y en realidad
 *             se registran en grupos distintos —1 s y 5 s— con 1340 y 566
 *             muestras propias. Los casos de abajo fijan las tres.
 *
 * ── POR QUÉ SIN RED ────────────────────────────────────────────────
 *
 * Porque contra el servidor sólo existen los casos de hoy, y los que hay que
 * fijar incluyen los que hoy no se dan: la lectura que falla, la serie plana,
 * la ventana vacía. Un `leerSerie` de mentira los construye en dos líneas y
 * esto entra en la tanda (`CLAUDE.md` §5.2).
 *
 * Lo medido contra planta vive en el Plan 34 §F2 y en la cabecera del módulo.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-sondeo-series.mjs
 */
import assert from 'node:assert/strict'

import { firmaDe, mismaSerie, sondearSeries, tieneVariacion } from '../backend/lib/sondearSeries.mjs'
import { ESTADO_CONFIGURACION } from '../shared/eva/comun/configuracionMaquina.js'

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

const VENTANA = { desde: '2026-09-14T00:00:00Z', hasta: '2026-09-16T00:00:00Z' }

/**
 * Muestras con valores dados, una por hora desde las 00:00.
 *
 * La marca de tiempo ya no es decorado: es POR DONDE se emparejan dos series.
 * `serieCada` construye una con otra cadencia, que es lo que distingue dos
 * grupos del historiador (1 s y 5 s en esta planta).
 */
const serie = (...valores) =>
  valores.map((value, i) => ({ timestamp: `2026-09-14T${String(i).padStart(2, '0')}:00:00Z`, value }))

/** Como `serie`, pero una muestra cada `horas` horas. */
const serieCada = (horas, ...valores) =>
  valores.map((value, i) => ({
    timestamp: `2026-09-14T${String(i * horas).padStart(2, '0')}:00:00Z`,
    value,
  }))

/** Una variable de mentira, con su punto histórico. */
const v = (id) => ({ id, pointName: `ac:x/${id}`, historyPointName: `hda:g:${id}` })

/** Un `readHistory` de mentira: mapa de punto histórico → muestras o 'FALLA'. */
function historiadorFalso(mapa) {
  return async ({ pointName }) => {
    const r = mapa[pointName]
    if (r === 'FALLA') return { ok: false, status: 500, error: 'boom' }
    return { ok: true, status: 200, data: r ?? [] }
  }
}

console.log(`\n${c.negrita}El sondeo de series: ganar la verificación, no heredarla${c.reset}\n`)

/* ── La huella ───────────────────────────────────────────────────────── */

await check('la firma indexa por marca de tiempo, y dos series distintas no se confunden', () => {
  assert.equal(mismaSerie(firmaDe(serie(1, 2, 3, 4, 5, 6, 7, 8)), firmaDe(serie(1, 2, 3, 4, 5, 6, 7, 8))), true)
  assert.equal(mismaSerie(firmaDe(serie(1, 2, 3, 4, 5, 6, 7, 8)), firmaDe(serie(1, 2, 3, 4, 5, 6, 7, 9))), false)
})

await check('sin muestras no hay firma: `null` es «no se puede opinar»', () => {
  assert.equal(firmaDe([]), null)
  assert.equal(firmaDe(null), null)
  assert.equal(mismaSerie(null, firmaDe(serie(1, 2))), false, 'null no compara igual con nada')
  assert.equal(mismaSerie(null, null), false, 'dos «no se sabe» no son «son iguales»')
})

await check('una muestra sin número no produce una firma a medias', () => {
  /* Colarla daría una firma que compara ceros implícitos con datos reales. */
  assert.equal(firmaDe([{ timestamp: 't1', value: 1 }, { timestamp: 't2', value: null }]), null)
})

await check('sin marcas de tiempo EN COMÚN no se afirma que sean la misma serie', () => {
  /*
   * Dos series que no se solapan en el tiempo no se pueden comparar. Antes,
   * comparadas por posición, dos tramos de días distintos con los mismos
   * valores se declaraban la misma serie.
   */
  const enero = [1, 2, 3, 4, 5, 6, 7, 8].map((value, i) => ({ timestamp: `2026-01-0${i + 1}T00:00:00Z`, value }))
  const marzo = [1, 2, 3, 4, 5, 6, 7, 8].map((value, i) => ({ timestamp: `2026-03-0${i + 1}T00:00:00Z`, value }))
  assert.equal(mismaSerie(firmaDe(enero), firmaDe(marzo)), false)
})

await check('pocas marcas en común no bastan para acusar: coincidir en un instante no es ser la misma serie', () => {
  const a = serie(1, 2, 3)
  const b = [{ timestamp: '2026-09-14T00:00:00Z', value: 1 }]
  assert.equal(mismaSerie(firmaDe(a), firmaDe(b)), false)
})

await check('una serie plana NO tiene variación, aunque tenga muchas muestras', () => {
  assert.equal(tieneVariacion(serie(0, 0, 0, 0, 0)), false)
  assert.equal(tieneVariacion(serie(2.5, 2.5)), false)
  assert.equal(tieneVariacion(serie(0, 0, 1)), true)
})

/* ── El caso que da nombre a la fase ─────────────────────────────────── */

await check('dos variables con la MISMA serie: ninguna se verifica', async () => {
  /*
   * El defecto `aPeak_S1`, medido contra planta: 1805 de 1805 valores
   * idénticos a `aRMS_S1`. No se elige una «legítima» porque no se sabe cuál
   * lo es —puede que ninguna—, y elegir sería la afirmación que este módulo
   * existe para no hacer.
   */
  const r = await sondearSeries(
    { variables: [v('aPeak_S1'), v('aRMS_S1')] },
    {
      ...VENTANA,
      leerSerie: historiadorFalso({
        'hda:g:aPeak_S1': serie(1, 2, 3, 4, 5, 6, 7, 8),
        'hda:g:aRMS_S1': serie(1, 2, 3, 4, 5, 6, 7, 8),
      }),
    },
  )
  assert.equal(r.resumen.verificadas, 0)
  assert.equal(r.resumen.compartidas, 2)
  for (const x of r.variables) {
    assert.equal(x.historyVerified, false)
    assert.equal(x.sondeo.causa, 'serie-compartida')
  }
})

await check('la variable con la que se comparte se NOMBRA, no se deja adivinar', async () => {
  const r = await sondearSeries(
    { variables: [v('a'), v('b')] },
    {
      ...VENTANA,
      leerSerie: historiadorFalso({
        'hda:g:a': serie(5, 6, 7, 8, 9, 10, 11, 12),
        'hda:g:b': serie(5, 6, 7, 8, 9, 10, 11, 12),
      }),
    },
  )
  assert.deepEqual(r.variables[0].sondeo.compartidaCon, ['b'])
  assert.deepEqual(r.variables[1].sondeo.compartidaCon, ['a'])
})

await check('nueve variables con la misma serie se cazan las nueve', async () => {
  /* Las `QC_*` de los tres apoyos, medidas contra planta el 21-09-2026. */
  const ids = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9']
  const mapa = Object.fromEntries(ids.map((id) => [`hda:g:${id}`, serie(1, 0, 1, 0, 1, 0, 1, 0)]))
  const r = await sondearSeries(
    { variables: ids.map(v) },
    { ...VENTANA, leerSerie: historiadorFalso(mapa) },
  )
  assert.equal(r.resumen.compartidas, 9)
  assert.equal(r.resumen.verificadas, 0)
})

await check('dos variables del MISMO apoyo con cadencias distintas NO son la misma serie', async () => {
  /*
   * El falso positivo medido contra planta el 22-09-2026, y la razón de que
   * este módulo compare por marca de tiempo.
   *
   * `aPeak_S1` se registra en el grupo de 1 segundo y `aRMS_S1` en el de 5:
   * 1340 muestras contra 566 en 24 h. Comparadas por POSICIÓN, las ocho
   * primeras de una se enfrentaban a ocho instantes distintos de la otra, y
   * un tramo con la máquina casi parada las hacía coincidir. Las dos perdían
   * su historia por un cruce que no existía.
   *
   * Aquí una tiene el doble de densidad que la otra y valores distintos en
   * los instantes que comparten: son dos series, y las dos se verifican.
   */
  const r = await sondearSeries(
    { variables: [v('aPeak_S1'), v('aRMS_S1')] },
    {
      ...VENTANA,
      leerSerie: historiadorFalso({
        'hda:g:aPeak_S1': serieCada(1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14),
        'hda:g:aRMS_S1': serieCada(2, 1, 2, 3, 4, 5, 6, 7, 8),
      }),
    },
  )
  assert.equal(r.resumen.compartidas, 0, 'dos cadencias distintas no son un cruce')
  assert.equal(r.resumen.verificadas, 2)
})

await check('una serie que es un SUBCONJUNTO exacto de otra sí es un cruce', async () => {
  /*
   * El otro lado de lo mismo, y por qué no basta con «tienen distinta
   * densidad». Si el historiador sirve la misma serie en dos puntos y uno se
   * lee con menos resolución, los valores de las marcas comunes coinciden
   * TODOS: eso sí es servir la misma serie con dos nombres.
   */
  const completa = serieCada(1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
  const mitad = completa.filter((_, i) => i % 2 === 0)
  const r = await sondearSeries(
    { variables: [v('a'), v('b')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:a': completa, 'hda:g:b': mitad }) },
  )
  assert.equal(r.resumen.compartidas, 0, 'con 5 marcas comunes no hay suficiente para acusar')
  assert.equal(r.resumen.verificadas, 2)

  /* Con suficientes marcas en común, sí se acusa. */
  const largaA = serieCada(1, ...Array.from({ length: 20 }, (_, i) => i + 1))
  const largaB = largaA.filter((_, i) => i % 2 === 0)
  const r2 = await sondearSeries(
    { variables: [v('a'), v('b')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:a': largaA, 'hda:g:b': largaB }) },
  )
  assert.equal(r2.resumen.compartidas, 2, 'diez marcas comunes, todas iguales: es la misma serie')
})

await check('una serie propia SÍ se verifica', async () => {
  const r = await sondearSeries(
    { variables: [v('a'), v('b')] },
    {
      ...VENTANA,
      leerSerie: historiadorFalso({
        'hda:g:a': serie(1, 2, 3, 4, 5, 6, 7, 8),
        'hda:g:b': serie(9, 8, 7, 6, 5, 4, 3, 2),
      }),
    },
  )
  assert.equal(r.resumen.verificadas, 2)
  assert.equal(r.estado, ESTADO_CONFIGURACION.VALID)
})

/* ── La trampa de la máquina parada ──────────────────────────────────── */

await check('con la máquina parada NO se marca false: queda sin comprobar', async () => {
  /*
   * La cautela más importante del módulo. Todo a cero hace que todas las
   * huellas colisionen, y tratarlo como «serie compartida» borraría de golpe
   * la verificación de la máquina entera por estar detenida.
   */
  const r = await sondearSeries(
    { variables: [v('a'), v('b')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:a': serie(0, 0, 0), 'hda:g:b': serie(0, 0, 0) }) },
  )
  assert.equal(r.resumen.sinVariacion, 2)
  assert.equal(r.resumen.compartidas, 0, 'dos series planas NO son serie compartida')
  for (const x of r.variables) {
    assert.equal(x.sondeo.estado, ESTADO_CONFIGURACION.UNKNOWN)
    assert.equal(x.historyVerified, undefined, 'no se toca la marca previa')
  }
})

await check('una serie plana no verifica aunque sea la única variable', async () => {
  const r = await sondearSeries(
    { variables: [v('a')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:a': serie(3, 3, 3) }) },
  )
  assert.equal(r.resumen.verificadas, 0)
  assert.equal(r.variables[0].sondeo.causa, 'sin-variacion')
})

/* ── No haber podido mirar ───────────────────────────────────────────── */

await check('si la lectura FALLA no se toca `historyVerified`', async () => {
  /*
   * `UNKNOWN` ≠ `INVALID` (Plan 33). Un corte de red no puede degradar una
   * verificación que sí se hizo en su día.
   */
  const previa = { ...v('a'), historyVerified: true }
  const r = await sondearSeries(
    { variables: [previa] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:a': 'FALLA' }) },
  )
  assert.equal(r.variables[0].historyVerified, true, 'la marca previa sobrevive')
  assert.equal(r.variables[0].sondeo.causa, 'no-se-pudo-leer')
  assert.equal(r.resumen.fallos, 1)
})

await check('una excepción del cliente se cuenta como no haber podido leer', async () => {
  const r = await sondearSeries(
    { variables: [v('a')] },
    {
      ...VENTANA,
      leerSerie: async () => {
        throw new Error('socket colgado')
      },
    },
  )
  assert.equal(r.variables[0].sondeo.causa, 'no-se-pudo-leer')
  assert.match(r.variables[0].sondeo.motivo, /socket colgado/)
})

await check('una ventana sin muestras NO es lo mismo que no haber podido leer', async () => {
  const r = await sondearSeries(
    { variables: [v('a')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:a': [] }) },
  )
  assert.equal(r.variables[0].sondeo.causa, 'sin-muestras')
  assert.equal(r.variables[0].historyVerified, false, 'contestó, y no hay serie que prometer')
  assert.equal(r.resumen.sinDatos, 1)
})

/* ── El veredicto del conjunto ───────────────────────────────────────── */

await check('un sondeo que no verificó NADA es UNKNOWN, no un sondeo fallido', async () => {
  const r = await sondearSeries(
    { variables: [v('a')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:a': serie(0, 0) }) },
  )
  assert.equal(r.estado, ESTADO_CONFIGURACION.UNKNOWN)
})

await check('verificar unas y no otras es DEGRADED, y el motivo lo desglosa', async () => {
  const r = await sondearSeries(
    { variables: [v('a'), v('b'), v('c')] },
    {
      ...VENTANA,
      leerSerie: historiadorFalso({
        'hda:g:a': serie(1, 2, 3, 4, 5, 6, 7, 8),
        'hda:g:b': serie(4, 5, 6, 7, 8, 9, 10, 11),
        'hda:g:c': serie(4, 5, 6, 7, 8, 9, 10, 11),
      }),
    },
  )
  assert.equal(r.estado, ESTADO_CONFIGURACION.DEGRADED)
  assert.equal(r.resumen.verificadas, 1)
  assert.match(r.motivo, /1 de 3/)
})

await check('una máquina sin puntos históricos lo dice, y no falla', async () => {
  const r = await sondearSeries(
    { variables: [{ id: 'a', pointName: 'ac:x/a' }] },
    { ...VENTANA, leerSerie: historiadorFalso({}) },
  )
  assert.equal(r.estado, ESTADO_CONFIGURACION.UNKNOWN)
  assert.equal(r.resumen.total, 0)
})

await check('sólo se sondean las variables que declaran punto histórico', async () => {
  const r = await sondearSeries(
    { variables: [v('a'), { id: 'b', pointName: 'ac:x/b' }] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:a': serie(1, 2) }) },
  )
  assert.equal(r.resumen.total, 1, 'la que no promete historia no se sondea')
})

/* ── La constante que sí está registrada (Plan 42 F1) ─────────────────── */

console.log(`\n${c.negrita}La constante registrada: verificar por marcas, no por valores${c.reset}\n`)

/*
 * El caso medido en planta el 22-09-2026, en pequeño: una serie que varía y
 * una bandera plana escrita en (algunas de) las mismas marcas. En planta la
 * propia tenía 569 marcas y la bandera 8; aquí 12 y 6, misma relación.
 */
const propia = serie(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
/** Una constante escrita en las marcas `indices` (horas) de `serie`. */
const constanteEn = (valor, ...indices) =>
  indices.map((i) => ({ timestamp: `2026-09-14T${String(i).padStart(2, '0')}:00:00Z`, value: valor }))
/** Una constante en marcas que NO son de nadie (minuto 30). */
const constanteFuera = (valor, ...indices) =>
  indices.map((i) => ({ timestamp: `2026-09-14T${String(i).padStart(2, '0')}:30:00Z`, value: valor }))

await check('1 · una constante con las marcas de una propia del sondeo queda registrada y verificada', async () => {
  const r = await sondearSeries(
    { variables: [v('vRMS'), v('alarma')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:vRMS': propia, 'hda:g:alarma': constanteEn(0, 0, 2, 4, 6, 8, 10) }) },
  )
  const alarma = r.variables.find((x) => x.id === 'alarma')
  assert.equal(alarma.sondeo.causa, 'registrada-constante')
  assert.equal(alarma.historyVerified, true)
  assert.equal(alarma.historyVerifiedComo, 'registrada-constante')
  assert.equal(alarma.sondeo.estado, ESTADO_CONFIGURACION.VALID)
})

await check('2 · el motivo NOMBRA al testigo y dice cuántas marcas coincidieron', async () => {
  const r = await sondearSeries(
    { variables: [v('vRMS'), v('alarma')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:vRMS': propia, 'hda:g:alarma': constanteEn(0, 0, 2, 4, 6, 8, 10) }) },
  )
  const alarma = r.variables.find((x) => x.id === 'alarma')
  assert.match(alarma.sondeo.motivo, /vRMS/)
  assert.match(alarma.sondeo.motivo, /6 de sus 6 marcas/)
  assert.equal(alarma.sondeo.testigo, 'vRMS')
  assert.equal(alarma.sondeo.marcasComunes, 6)
})

await check('3 · sin marcas en común con el testigo sigue `sin-variacion` y no se toca la marca previa', async () => {
  const previa = { ...v('alarma'), historyVerified: false }
  const r = await sondearSeries(
    { variables: [v('vRMS'), previa] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:vRMS': propia, 'hda:g:alarma': constanteFuera(0, 0, 2, 4, 6) }) },
  )
  const alarma = r.variables.find((x) => x.id === 'alarma')
  assert.equal(alarma.sondeo.causa, 'sin-variacion')
  assert.equal(alarma.historyVerified, false, 'conserva lo que tenía')
  /* Y dice con quién se comparó y por qué no bastó. */
  assert.match(alarma.sondeo.motivo, /0 de sus 4 marcas/)
})

await check('4 · POCAS marcas en común (menos de la mitad) no bastan', async () => {
  const r = await sondearSeries(
    { variables: [v('vRMS'), v('alarma')] },
    {
      ...VENTANA,
      leerSerie: historiadorFalso({
        'hda:g:vRMS': propia,
        /* 2 de 6 en el reloj del testigo: un tercio. */
        'hda:g:alarma': [...constanteEn(0, 0, 2), ...constanteFuera(0, 4, 6, 8, 10)],
      }),
    },
  )
  const alarma = r.variables.find((x) => x.id === 'alarma')
  assert.equal(alarma.sondeo.causa, 'sin-variacion')
  assert.equal(alarma.historyVerified, undefined)
})

await check('5 · la MITAD justa sí basta (medido: MonState_a_f_S3, 1 de 2)', async () => {
  const r = await sondearSeries(
    { variables: [v('vRMS'), v('estado')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:vRMS': propia, 'hda:g:estado': [...constanteEn(1, 3), ...constanteFuera(1, 9)] }) },
  )
  assert.equal(r.variables.find((x) => x.id === 'estado').sondeo.causa, 'registrada-constante')
})

await check('6 · sin NINGUNA serie propia en el sondeo (máquina parada), nada cambia', async () => {
  const r = await sondearSeries(
    { variables: [v('a'), v('b'), v('c')] },
    {
      ...VENTANA,
      leerSerie: historiadorFalso({
        'hda:g:a': constanteEn(0, 0, 1, 2, 3, 4, 5, 6, 7, 8),
        'hda:g:b': constanteEn(0, 0, 1, 2, 3, 4, 5, 6, 7, 8),
        'hda:g:c': constanteEn(1, 0, 1, 2, 3, 4, 5, 6, 7, 8),
      }),
    },
  )
  assert.equal(r.resumen.sinVariacion, 3)
  assert.equal(r.resumen.constantes, 0)
  assert.equal(r.estado, ESTADO_CONFIGURACION.UNKNOWN)
  for (const x of r.variables) {
    assert.equal(x.historyVerified, undefined)
    assert.match(x.sondeo.motivo, /no hay testigo/)
  }
})

await check('7 · una `serie-compartida` NO vale como testigo', async () => {
  const compartida = serie(4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15)
  const r = await sondearSeries(
    { variables: [v('x'), v('y'), v('alarma')] },
    {
      ...VENTANA,
      leerSerie: historiadorFalso({
        'hda:g:x': compartida,
        'hda:g:y': compartida,
        'hda:g:alarma': constanteEn(0, 0, 2, 4, 6, 8, 10),
      }),
    },
  )
  assert.equal(r.resumen.compartidas, 2)
  const alarma = r.variables.find((x) => x.id === 'alarma')
  assert.equal(alarma.sondeo.causa, 'sin-variacion', 'no se hereda confianza de una serie sospechosa')
  assert.equal(alarma.historyVerified, undefined)
})

await check('8 · dos constantes IDÉNTICAS quedan registradas las dos, y como constantes', async () => {
  const marcas = constanteEn(0, 0, 2, 4, 6, 8, 10)
  const r = await sondearSeries(
    { variables: [v('vRMS'), v('alarma1'), v('alarma2')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:vRMS': propia, 'hda:g:alarma1': marcas, 'hda:g:alarma2': marcas }) },
  )
  assert.equal(r.resumen.constantes, 2)
  assert.equal(r.resumen.compartidas, 0, 'dos constantes iguales no son «serie compartida»: no hay con qué acusar')
  for (const id of ['alarma1', 'alarma2']) {
    const x = r.variables.find((y) => y.id === id)
    assert.equal(x.historyVerified, true)
    /* El campo con que `construirSistema` redacta la limitación de que no se
       distinguen entre sí. Sin él, la máquina no sabría cuáles declarar. */
    assert.equal(x.historyVerifiedComo, 'registrada-constante')
    assert.match(x.sondeo.motivo, /No se puede saber si es distinta/)
  }
})

await check('9 · una constante que YA estaba verificada y hoy no tiene testigo NO baja a false', async () => {
  const previa = { ...v('alarma'), historyVerified: true, historyVerifiedComo: 'registrada-constante' }
  const r = await sondearSeries(
    { variables: [previa] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:alarma': constanteEn(0, 0, 2, 4) }) },
  )
  const alarma = r.variables[0]
  assert.equal(alarma.sondeo.causa, 'sin-variacion')
  assert.equal(alarma.historyVerified, true, 'misma regla que «si la lectura falla no se toca»')
  assert.equal(alarma.historyVerifiedComo, 'registrada-constante')
})

await check('10 · las nueve `QC_*` (misma serie, CON variación) siguen siendo `serie-compartida`', async () => {
  const qc = serie(192, 192, 192, 64, 64, 192, 192, 192, 64, 192, 192, 192)
  const ids = ['QC_1', 'QC_2', 'QC_3', 'QC_4', 'QC_5', 'QC_6', 'QC_7', 'QC_8', 'QC_9']
  const mapa = Object.fromEntries(ids.map((id) => [`hda:g:${id}`, qc]))
  mapa['hda:g:vRMS'] = propia
  const r = await sondearSeries({ variables: [v('vRMS'), ...ids.map(v)] }, { ...VENTANA, leerSerie: historiadorFalso(mapa) })
  assert.equal(r.resumen.compartidas, 9)
  assert.equal(r.resumen.constantes, 0)
  assert.equal(r.resumen.verificadas, 1)
})

await check('11 · `aPeak_S1` idéntica a `aRMS_S1` sigue siendo `serie-compartida`', async () => {
  const r = await sondearSeries(
    { variables: [v('aRMS_S1'), v('aPeak_S1'), v('alarma')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:aRMS_S1': propia, 'hda:g:aPeak_S1': propia, 'hda:g:alarma': constanteEn(0, 0, 2, 4, 6) }) },
  )
  assert.equal(r.variables.find((x) => x.id === 'aPeak_S1').sondeo.causa, 'serie-compartida')
  assert.equal(r.variables.find((x) => x.id === 'aRMS_S1').sondeo.causa, 'serie-compartida')
  /* Y sin propia, la constante tampoco tiene testigo. */
  assert.equal(r.variables.find((x) => x.id === 'alarma').sondeo.causa, 'sin-variacion')
})

await check('12 · una serie `sin-muestras` no se convierte en registrada por tener testigo', async () => {
  const r = await sondearSeries(
    { variables: [v('vRMS'), v('vacia')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:vRMS': propia, 'hda:g:vacia': [] }) },
  )
  const vacia = r.variables.find((x) => x.id === 'vacia')
  assert.equal(vacia.sondeo.causa, 'sin-muestras')
  assert.equal(vacia.historyVerified, false)
  assert.equal(vacia.historyVerifiedComo, null)
})

await check('13 · el resumen cuenta las constantes aparte y una máquina de propias + constantes es VALID', async () => {
  const r = await sondearSeries(
    { variables: [v('vRMS'), v('alarma'), v('fallo')] },
    {
      ...VENTANA,
      leerSerie: historiadorFalso({
        'hda:g:vRMS': propia,
        'hda:g:alarma': constanteEn(0, 0, 2, 4, 6, 8, 10),
        'hda:g:fallo': constanteEn(0, 0, 1, 2, 3),
      }),
    },
  )
  assert.equal(r.resumen.verificadas, 3)
  assert.equal(r.resumen.constantes, 2)
  assert.equal(r.resumen.sinVariacion, 0)
  assert.equal(r.estado, ESTADO_CONFIGURACION.VALID)
  assert.match(r.motivo, /1 propias, 2 constantes/)
  /* Y las propias siguen diciendo cómo quedaron. */
  assert.equal(r.variables.find((x) => x.id === 'vRMS').historyVerifiedComo, 'serie-propia')
})

/* ── Series idénticas por diseño del tipo (Plan 42, seguimiento) ────────── */

console.log(`\n${c.negrita}Las series que el tipo declara equivalentes${c.reset}\n`)

/** Como `v`, con rol. */
const vRol = (id, rol) => ({ ...v(id), rol })
/** Lo que declara `TIPO_VIBRACIONES.seriesEquivalentes`: las calidades entre sí. */
const calidadesEntreSi = (a, b) =>
  typeof a?.rol === 'string' && typeof b?.rol === 'string' &&
  a.rol.startsWith('calidad:') && b.rol.startsWith('calidad:')
const qc = serie(192, 192, 192, 64, 64, 192, 192, 192, 64, 192, 192, 192)

await check('14 · nueve calidades idénticas quedan REGISTRADAS como equivalentes, no compartidas', async () => {
  const ids = ['QC_1', 'QC_2', 'QC_3', 'QC_4', 'QC_5', 'QC_6', 'QC_7', 'QC_8', 'QC_9']
  const mapa = Object.fromEntries(ids.map((id) => [`hda:g:${id}`, qc]))
  const r = await sondearSeries(
    { variables: ids.map((id) => vRol(id, 'calidad:qc')) },
    { ...VENTANA, leerSerie: historiadorFalso(mapa), sonEquivalentes: calidadesEntreSi },
  )
  assert.equal(r.resumen.equivalentes, 9)
  assert.equal(r.resumen.compartidas, 0)
  assert.equal(r.resumen.verificadas, 9)
  assert.equal(r.estado, ESTADO_CONFIGURACION.VALID)
  for (const x of r.variables) {
    assert.equal(x.historyVerified, true)
    assert.equal(x.historyVerifiedComo, 'registrada-equivalente')
    assert.equal(x.sondeo.equivalenteA.length, 8)
    assert.match(x.sondeo.motivo, /por diseño/)
  }
  assert.match(r.motivo, /9 idénticas a otras por diseño del tipo/)
})

await check('15 · sin la declaración del tipo, las mismas nueve siguen siendo `serie-compartida`', async () => {
  const ids = ['QC_1', 'QC_2', 'QC_3']
  const mapa = Object.fromEntries(ids.map((id) => [`hda:g:${id}`, qc]))
  const r = await sondearSeries(
    { variables: ids.map((id) => vRol(id, 'calidad:qc')) },
    { ...VENTANA, leerSerie: historiadorFalso(mapa) },
  )
  assert.equal(r.resumen.compartidas, 3, 'el valor por defecto es «nada es equivalente»')
  assert.equal(r.resumen.equivalentes, 0)
})

await check('16 · `aPeak_S1` idéntica a `aRMS_S1` NO se exime: no son de la familia', async () => {
  const r = await sondearSeries(
    { variables: [vRol('aRMS_S1', 'medida:aRMS'), vRol('aPeak_S1', 'medida:aPeak')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:aRMS_S1': propia, 'hda:g:aPeak_S1': propia }), sonEquivalentes: calidadesEntreSi },
  )
  assert.equal(r.resumen.compartidas, 2)
  assert.equal(r.resumen.equivalentes, 0)
})

await check('17 · una calidad idéntica a una MEDIDA hunde al grupo entero: ahí sí hay algo que no cuadra', async () => {
  const r = await sondearSeries(
    { variables: [vRol('QC_1', 'calidad:qc'), vRol('QC_2', 'calidad:qc'), vRol('aRMS_S1', 'medida:aRMS')] },
    { ...VENTANA, leerSerie: historiadorFalso({ 'hda:g:QC_1': qc, 'hda:g:QC_2': qc, 'hda:g:aRMS_S1': qc }), sonEquivalentes: calidadesEntreSi },
  )
  assert.equal(r.resumen.compartidas, 3, 'basta una que no sea de la familia para que ninguna se exima')
  assert.equal(r.resumen.equivalentes, 0)
})

await check('18 · el tipo de vibraciones declara equivalentes las calidades, y sólo a ellas', async () => {
  const { TIPO_VIBRACIONES } = await import('../shared/eva/tipos/vibraciones.js')
  const eq = TIPO_VIBRACIONES.seriesEquivalentes
  assert.equal(eq({ rol: 'calidad:qcVRMS' }, { rol: 'calidad:qcDKW' }), true)
  assert.equal(eq({ rol: 'calidad:qcVRMS' }, { rol: 'medida:aRMS' }), false)
  assert.equal(eq({ rol: 'medida:aPeak' }, { rol: 'medida:aRMS' }), false)
  assert.equal(eq({ rol: 'bandera:alarma' }, { rol: 'bandera:alarma' }), false, 'dos banderas iguales NO son equivalentes por diseño')
  assert.equal(eq({ rol: null }, { rol: null }), false)
})

/* ── Resumen ─────────────────────────────────────────────────────────── */

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/lib/sondearSeries.mjs.${c.reset}`)
  process.exit(1)
}
console.log(
  `${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `la verificación se gana comparando, y no se da por una lectura que falló.${c.reset}`,
)
