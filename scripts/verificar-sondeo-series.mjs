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
