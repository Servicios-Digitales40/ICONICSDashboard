#!/usr/bin/env node
/**
 * scripts/verificar-transporte-falso.mjs
 * ------------------------------------------------------------------
 * Comprueba el transporte falso de ICONICS (`ICONICS_FAKE=true`, Plan 14
 * §7.1): que cumple la firma de `iconics/client.mjs`, que reproduce los
 * fallos documentados del servidor real —no sólo los datos buenos— y que
 * `app.mjs` lo elige de verdad cuando la variable está puesta.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 *  - Las TRES señales que el historiador real cruza con la temperatura del
 *    tanque, sin dar error. Un transporte falso que las sirviera limpias
 *    escondería la trampa que el asistente tiene que aprender a esquivar
 *    (la esquiva vive en `herramientas.mjs`, comprobada en
 *    `verificar-herramientas.mjs`; aquí se comprueba que el TRANSPORTE la
 *    imita, que es distinto).
 *  - El tope de 100 muestras por petición, con `hasMore` puesto cuando se
 *    recorta — igual que la cabecera `X-ICO-CONTINUATION` del servidor real.
 *  - Que una escritura se pueda releer, que es lo que `controlar_bomba`
 *    necesita para confirmar que su orden tuvo efecto.
 *  - Que la física es la MISMA que sirve el simulador del frontend: los dos
 *    leen `shared/eva/tanque/simulador.js`, así que un instante fijo da el mismo
 *    valor en los dos lados.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-transporte-falso.mjs
 *
 * No necesita red, ni servidor ICONICS, ni modelo de lenguaje.
 *
 * Código de salida: 0 si todo se cumple, 1 si algo falla.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createFakeIconicsClient } from '../backend/iconics/fakeClient.mjs'
import { createApp } from '../backend/app.mjs'
import { loadConfig } from '../backend/config.mjs'
import { RAIZ, TODOS_LOS_PUNTOS, esHistorizada, pointName } from '../shared/eva/tanque/senales.js'
import { valorEn } from '../shared/eva/tanque/simulador.js'
import { RAIZ_VIB, puntoVariador } from '../shared/eva/vibraciones/vibraciones.js'
import { valorVibracionEn } from '../shared/eva/vibraciones/simuladorVibraciones.js'
import { SISTEMAS } from '../shared/eva/comun/sistemas.js'
import { isGoodQuality } from '../shared/quality.js'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

let passed = 0
const fallos = []

function check(nombre, fn) {
  try {
    const r = fn()
    if (r instanceof Promise) throw new Error('usa checkAsync para comprobaciones asíncronas')
    passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(`${nombre} — ${error.message}`)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
  }
}

async function checkAsync(nombre, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(`${nombre} — ${error.message}`)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
  }
}

/** Sin caos: `rnd` fijo por encima de cualquier probabilidad configurada. */
const sinCaos = () => createFakeIconicsClient({ ahora: () => 1_700_000_000_000, rnd: () => 0.99 })

console.log(`\n${c.negrita}Transporte falso de ICONICS · ICONICS_FAKE=true${c.reset}`)

/* ── La firma ─────────────────────────────────────────────────────────── */

console.log('\n── La firma ─────────────────────────────────────────────────')

check('expone las once operaciones de iconics/client.mjs', () => {
  const cliente = sinCaos()
  for (const op of [
    'acknowledgeAlarms', 'browse', 'ping', 'readAlarmHistory', 'readHistory',
    'readPoint', 'readPoints', 'readUserInfo', 'search', 'writePoint', 'writePoints',
  ]) {
    assert.equal(typeof cliente[op], 'function', `falta ${op}`)
  }
})

/* ── Lectura en vivo ──────────────────────────────────────────────────── */

console.log('\n── Lectura en vivo ──────────────────────────────────────────')

await checkAsync('readPoints sirve las ocho señales, sin salir a ningún sitio', async () => {
  const cliente = sinCaos()
  const r = await cliente.readPoints(TODOS_LOS_PUNTOS)

  assert.equal(r.ok, true)
  assert.equal(Object.keys(r.payload).length, 8)
  for (const p of TODOS_LOS_PUNTOS) {
    assert.equal(r.payload[p].ok, true, `${p} no vino`)
    assert.ok('value' in r.payload[p].payload)
  }
})

await checkAsync('el valor es la MISMA función pura que usa el simulador del frontend', async () => {
  const ahora = () => 1_700_000_000_000
  const cliente = createFakeIconicsClient({ ahora, rnd: () => 0.99 })
  const r = await cliente.readPoints([pointName('nivelTanque')])

  const esperado = valorEn('nivelTanque', ahora())
  assert.equal(r.payload[pointName('nivelTanque')].payload.value, esperado)
})

await checkAsync('un punto ajeno al árbol no rompe el lote: llega como hueco', async () => {
  const cliente = sinCaos()
  const r = await cliente.readPoints(['ac:OTRO/ARBOL/X'])
  assert.equal(r.ok, true)
  // No es del catálogo, así que se sirve como punto de escritura: `null` si
  // nunca se escribió — nunca un error que tumbe el lote entero.
  assert.equal(r.payload['ac:OTRO/ARBOL/X'].payload.value, null)
})

/* ── Todas las máquinas del registro ─────────────────────── */

console.log('\n── Todas las máquinas del registro ────────────────────')

/*
 * Este bloque se escribe RECORRIENDO `shared/eva/comun/sistemas.js`, no nombrando
 * máquinas. La que se dé de alta mañana queda comprobada el día que se añada,
 * sin que nadie se acuerde de venir aquí — que es exactamente lo que falló las
 * dos veces anteriores.
 */
for (const sistema of SISTEMAS) {
  await checkAsync(`«${sistema.id}»: sus puntos se sirven, no caen en la rama de escritura`, async () => {
    /*
     * El fallo que esto protege: un punto que el transporte falso no reconoce
     * cae en la rama de «punto de escritura» y sale con `value: null` y calidad
     * BUENA. La pantalla no ve un fallo — ve una máquina que contesta y no dice
     * nada, que es la peor de las respuestas posibles.
     */
    const cliente = sinCaos()
    const puntos = sistema.puntos()
    assert.equal(puntos.length > 0, true, 'el sistema no declara ningún punto')

    const r = await cliente.readPoints(puntos)
    assert.equal(r.ok, true)

    const buenos = puntos.filter(p => isGoodQuality(r.payload[p]?.payload?.quality))
    assert.equal(
      buenos.length > puntos.length / 2, true,
      `sólo ${buenos.length} de ${puntos.length} puntos con calidad buena`,
    )
  })

  await checkAsync(`«${sistema.id}»: el valor sale del MISMO modelo que sirve el frontend`, async () => {
    const t = 1_700_000_000_000
    const cliente = createFakeIconicsClient({ ahora: () => t, rnd: () => 0.99 })

    // Un punto con valor en ese instante: el primero que no esté callado.
    const punto = sistema.puntos().find(p => sistema.modelo(p, t) !== null)
    assert.equal(Boolean(punto), true, 'ningún punto entrega valor en ese instante')

    const r = await cliente.readPoint(punto)
    assert.equal(r.payload.value, sistema.modelo(punto, t))
  })
}

await checkAsync('ningún punto pertenece a dos máquinas', async () => {
  // Si dos catálogos reclamaran el mismo punto, `valorSimuladoDe` serviría el
  // del primero del registro y nadie se enteraría.
  const vistos = new Map()
  for (const sistema of SISTEMAS) {
    for (const p of sistema.puntos()) {
      assert.equal(vistos.has(p), false, `«${p}» está en ${vistos.get(p)} y en ${sistema.id}`)
      vistos.set(p, sistema.id)
    }
  }
})

await checkAsync('un punto que no entrega llega SIN `value`, no como un cero', async () => {
  /*
   * La forma medida en el servidor real: calidad `0x08000000` y ningún campo
   * `value`. Un cero con calidad mala se leería río abajo, con un `?? 0`
   * descuidado, como «vibración nula, todo perfecto».
   *
   * Se busca un instante con el motor parado —ahí el variador deja de
   * publicar— en vez de fijar uno a mano: la fase del ciclo depende del origen
   * del reloj, y clavar un milisegundo lo ataría a que nadie cambie el periodo.
   */
  const punto = puntoVariador('velocidad')
  let t = 1_700_000_000_000
  for (let i = 0; i < 200 && valorVibracionEn(punto, t) !== null; i++) t += 5_000
  assert.equal(valorVibracionEn(punto, t), null, 'no se encontró ningún instante con el motor parado')

  const cliente = createFakeIconicsClient({ ahora: () => t, rnd: () => 0.99 })
  const r = await cliente.readPoint(punto)

  assert.equal(r.ok, true)
  assert.equal('value' in r.payload, false, 'un punto sin dato no debe traer `value`')
  assert.equal(isGoodQuality(r.payload.quality), false)
})

await checkAsync('el árbol del tanque y el de vibraciones no se mezclan al enumerar', async () => {
  const cliente = sinCaos()

  const tanque = await cliente.browse(RAIZ)
  assert.equal(tanque.payload.some(p => p.startsWith(RAIZ_VIB)), false, 'el tanque trajo acelerómetros')

  const vib = await cliente.browse(RAIZ_VIB)
  assert.equal(vib.payload.some(p => p.startsWith(RAIZ)), false, 'las vibraciones trajeron el tanque')
  assert.equal(vib.payload.length > 0, true, 'la rama de vibraciones salió vacía')
})

await checkAsync('pedir la HISTORIA de un punto de vibración falla, como falla el grupo DEMO 3', async () => {
  // `esHistorizada` sigue en `false` en todo ese catálogo. Servir aquí una
  // serie inventada enseñaría al asistente a afirmar tendencias de esta
  // máquina, que es justo lo que ese archivo prohíbe todavía.
  const cliente = sinCaos()
  const r = await cliente.readHistory({
    pointName: puntoVariador('velocidad'),
    startDate: new Date(1_700_000_000_000 - 3_600_000).toISOString(),
    endDate: new Date(1_700_000_000_000).toISOString(),
    interval: '00:15:00',
  })
  assert.equal(r.ok, false)
})

/* ── El historiador ───────────────────────────────────────────────────── */

console.log('\n── El historiador ───────────────────────────────────────────')

await checkAsync('las historizadas sirven SU PROPIA serie', async () => {
  const cliente = sinCaos()
  for (const clave of [
    'nivelTanque', 'temperaturaTanque', 'flujoInstantaneo', 'presionRelativa',
    'tensionLinea',
  ]) {
    assert.ok(esHistorizada(clave), `${clave} debería estar historizada`)
    const r = await cliente.readHistory({
      pointName: pointName(clave),
      startDate: new Date(1_700_000_000_000 - 3_600_000).toISOString(),
      endDate: new Date(1_700_000_000_000).toISOString(),
      interval: '00:15:00',
    })
    assert.equal(r.ok, true, `${clave}: ${r.error}`)
    assert.ok(r.data.length > 0, `${clave} sin muestras`)
  }
})

await checkAsync('las tres SIN historia reciben la serie de la temperatura, como el servidor real', async () => {
  /*
   * Es la invariante cara de este archivo: no falla, y eso es justo lo que
   * hay que reproducir. `herramientas.mjs` nunca deja que esto se llame para
   * estas tres claves (la guarda va ANTES de la red, ver
   * `verificar-herramientas.mjs`), pero cualquier otro consumidor del
   * transporte —la ruta REST directa, por ejemplo— tiene que ver la MISMA
   * trampa que vería contra el servidor de verdad.
   */
  const cliente = sinCaos()
  const rango = {
    startDate: new Date(1_700_000_000_000 - 3_600_000).toISOString(),
    endDate: new Date(1_700_000_000_000).toISOString(),
    interval: '00:15:00',
  }

  const temperatura = await cliente.readHistory({ pointName: pointName('temperaturaTanque'), ...rango })

  // `tensionLinea` ya NO está aquí: desde el 24-08-2026 sirve su propia serie.
  for (const clave of ['cargaMotor', 'eficienciaEnergetica']) {
    assert.ok(!esHistorizada(clave), `${clave} no debería estar historizada`)
    const r = await cliente.readHistory({ pointName: pointName(clave), ...rango })

    assert.equal(r.ok, true, `${clave} tendría que responder ok:true, como el servidor real`)
    assert.deepEqual(
      r.data.map(d => d.value), temperatura.data.map(d => d.value),
      `${clave} no coincide con la serie de temperatura`
    )
  }
})

await checkAsync('más de 100 puntos se sirve en varias páginas, no se recorta (Plan 15 Fase 1)', async () => {
  const cliente = sinCaos()
  const r = await cliente.readHistory({
    pointName: pointName('nivelTanque'),
    startDate: new Date(1_700_000_000_000 - 30 * 3_600_000).toISOString(),
    endDate: new Date(1_700_000_000_000).toISOString(),
    // Un punto por minuto durante 30 h son 1800 puntos: 18 páginas de 100,
    // por debajo del presupuesto por defecto (20) — así que la serie
    // COMPLETA debe llegar, no sólo la primera página como antes de la
    // Fase 1 del Plan 15.
    interval: '00:01:00',
  })

  assert.equal(r.ok, true)
  assert.equal(r.data.length, 1800, 'debe traer la serie completa, paginando')
  assert.equal(r.paginas, 18)
  assert.equal(r.hasMore, false, 'la serie se agotó, no queda nada por leer')
  assert.equal(r.truncada, false)
})

await checkAsync('un rango que excede el presupuesto de páginas se corta y lo dice', async () => {
  const cliente = createFakeIconicsClient({
    ahora: () => 1_700_000_000_000,
    rnd: () => 0.99,
    limits: { maxHistoryPaginas: 3, maxHistoryMs: 20000 },
  })
  const r = await cliente.readHistory({
    pointName: pointName('nivelTanque'),
    startDate: new Date(1_700_000_000_000 - 30 * 3_600_000).toISOString(),
    endDate: new Date(1_700_000_000_000).toISOString(),
    // Mismas 18 páginas de antes, pero con el presupuesto bajado a 3.
    interval: '00:01:00',
  })

  assert.equal(r.ok, true)
  assert.equal(r.paginas, 3, 'no debe pedir ni una página más que el tope')
  assert.equal(r.data.length, 300)
  assert.equal(r.hasMore, true, 'quedaba serie sin leer cuando se cortó')
  assert.equal(r.truncada, true)
  assert.match(r.motivoCorte, /tope de 3 páginas/)
})

await checkAsync('un punto que no es del catálogo falla igual que en el servidor real', async () => {
  const cliente = sinCaos()
  const r = await cliente.readHistory({
    pointName: 'ac:OTRO/ARBOL/X',
    startDate: new Date(1_700_000_000_000 - 3_600_000).toISOString(),
    endDate: new Date(1_700_000_000_000).toISOString(),
    interval: '00:15:00',
  })
  assert.equal(r.ok, false)
})

/* ── Escritura ────────────────────────────────────────────────────────── */

console.log('\n── Escritura ────────────────────────────────────────────────')

await checkAsync('lo escrito se relee tal cual, que es lo que necesita controlar_bomba', async () => {
  const cliente = sinCaos()
  const tag = 'ac:TDCON/DEMO/SENSORES/CONTROL'

  const antes = await cliente.readPoint(tag)
  assert.equal(antes.payload.value, null, 'sin escribir nunca, no hay valor')

  const w = await cliente.writePoint(tag, true)
  assert.equal(w.ok, true)

  const despues = await cliente.readPoint(tag)
  assert.equal(despues.payload.value, true)
})

/* ── Alarmas: este árbol no tiene ────────────────────────────────────── */

console.log('\n── Alarmas ──────────────────────────────────────────────────')

await checkAsync('sin alarmas configuradas, lista vacía y NUNCA un error (Plan 14 §6)', async () => {
  const r = await sinCaos().readAlarmHistory({ pointName: pointName('nivelTanque') })
  assert.equal(r.ok, true)
  assert.deepEqual(r.alarms, [])
})

/* ── app.mjs elige el transporte falso ───────────────────────────────── */

console.log('\n── Con el backend completo levantado ───────────────────────')

await checkAsync('ICONICS_FAKE=true funciona SIN ICONICS_API_BASE', async () => {
  const config = loadConfig({
    PORT: '0', LOG_LEVEL: 'ERROR', ICONICS_FAKE: 'true', STATIC_DIR: 'react-dashboard/dist',
  })
  assert.equal(config.iconics.isConfigured, true, 'fake tiene que bastar para "configurado"')

  const server = await createApp(config)
  await server.listen({ port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${server.server.address().port}`

  try {
    const puntos = TODOS_LOS_PUNTOS.join(',')
    const res = await fetch(`${base}/api/iconics/data/batch?points=${encodeURIComponent(puntos)}`)
    const body = await res.json()

    assert.equal(res.status, 200)
    assert.equal(Object.keys(body.payload ?? body).length > 0, true, 'la respuesta llegó vacía')
  } finally {
    await server.close()
  }
})

await checkAsync('sin ICONICS_FAKE y sin ICONICS_API_BASE, sigue SIN configurar (el defecto no cambia)', async () => {
  const config = loadConfig({ PORT: '0', LOG_LEVEL: 'ERROR', STATIC_DIR: 'react-dashboard/dist' })
  assert.equal(config.iconics.isConfigured, false)
  assert.equal(config.iconics.fake, false)
})

/* ── Resumen ─────────────────────────────────────────────────────────── */

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/iconics/fakeClient.mjs y shared/eva/tanque/simulador.js.${c.reset}`)
  process.exit(1)
}

console.log(`${c.verde}${c.negrita}${passed} comprobaciones correctas: el transporte falso se mantiene.${c.reset}`)
