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
import { createFakeIconicsClient } from '../backend/iconics/fakeClient.mjs'
import { createApp } from '../backend/app.mjs'
import { loadConfig } from '../backend/config.mjs'
import { RAIZ, SENALES, TODOS_LOS_PUNTOS, esHistorizada, pointName, puntoHistorico, historizadas } from '../shared/eva/tanque/senales.js'
import { valorEn } from '../shared/eva/tanque/simulador.js'
import { RAIZ_VIB, puntoVariador } from '../shared/eva/vibraciones/vibraciones.js'
import { enMarchaVib, valorVibracionEn } from '../shared/eva/vibraciones/simuladorVibraciones.js'
import { SISTEMAS, desregistrarSistema, registrarSistema } from '../shared/eva/comun/sistemas.js'
import { construirSistema } from '../shared/eva/comun/construirSistema.js'
import { tipoDe } from '../shared/eva/tipos/index.js'
import { configuracionEspejo } from './lib/configuracionEspejo.mjs'

/*
 * La máquina de vibraciones del guion es la ESPEJO configurada (Plan 40 F3):
 * la escrita a mano se retiró. Registrada aquí entra en el bucle «todas las
 * máquinas del registro» y en las comprobaciones del historiador. El bloque
 * final, que levanta el backend entero, la quita al sincronizar el registro
 * desde `MAQUINAS_RUTA`; es el último, y nada la usa después.
 */
const ESPEJO_REGISTRADA = registrarSistema(
  construirSistema(configuracionEspejo({ verificadasDelCatalogo: true }).configurada, tipoDe('vibraciones')),
)
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

await checkAsync('readPoints sirve todas las señales declaradas, sin salir a ningún sitio', async () => {
  const cliente = sinCaos()
  const r = await cliente.readPoints(TODOS_LOS_PUNTOS)

  assert.equal(r.ok, true)
  assert.equal(Object.keys(r.payload).length, TODOS_LOS_PUNTOS.length)
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
  assert.equal(tanque.payload.some(p => p.pointName.startsWith(RAIZ_VIB)), false, 'el tanque trajo acelerómetros')

  const vib = await cliente.browse(RAIZ_VIB)
  assert.equal(vib.payload.some(p => p.pointName.startsWith(RAIZ)), false, 'las vibraciones trajeron el tanque')
  assert.equal(vib.payload.length > 0, true, 'la rama de vibraciones salió vacía')
})

/*
 * ── EL ÁRBOL TIENE NIVELES, COMO EL DEL SERVIDOR (Plan 36 F1) ─────────
 *
 * Hasta el Plan 36 `browse` devolvía todos los puntos como cadenas sueltas.
 * El descubridor y la pantalla de configuración expanden carpeta a carpeta y
 * leen `shortName`, y contra aquel fake veían un árbol VACÍO sin error. Lo
 * que se defiende aquí es la forma que los dos consumen.
 */
await checkAsync('browse devuelve los HIJOS DIRECTOS como nodos, no todos los puntos como cadenas', async () => {
  const cliente = sinCaos()
  const raiz = await cliente.browse(RAIZ_VIB)

  for (const nodo of raiz.payload) {
    assert.equal(typeof nodo.pointName, 'string', 'cada hijo es un nodo con pointName')
    assert.equal(typeof nodo.shortName, 'string', 'cada hijo trae shortName')
    assert.ok(nodo.pointName.endsWith('/'), `bajo la raíz cuelgan carpetas, no hojas: ${nodo.pointName}`)
  }
  const nombres = raiz.payload.map(n => n.shortName)
  assert.ok(nombres.includes('S1') && nombres.includes('V20'), `las carpetas son los apoyos y el variador: ${nombres}`)

  const s1 = await cliente.browse(`${RAIZ_VIB}S1/`)
  assert.ok(s1.payload.length > 0, 'S1 tiene hojas')
  assert.ok(s1.payload.every(n => !n.pointName.endsWith('/')), 'bajo S1 sólo hay hojas')
  assert.ok(s1.payload.some(n => n.shortName === 'vRMS_S1'), 'vRMS_S1 cuelga de S1')
})

await checkAsync('explorar una HOJA contesta ok y vacío; una rama inexistente contesta ok=false', async () => {
  const cliente = sinCaos()
  const hoja = await cliente.browse(`${RAIZ_VIB}S1/vRMS_S1`)
  assert.equal(hoja.ok, true)
  assert.deepEqual(hoja.payload, [])

  const nada = await cliente.browse('ac:NO/EXISTE/')
  assert.equal(nada.ok, false, 'una rama que nadie declara no puede parecer una rama vacía')
  assert.match(nada.error, /No existe la rama/)
})

await checkAsync('el historiador y el área de alarmas también se recorren, con la forma de cada espacio', async () => {
  const cliente = sinCaos()
  const B = String.fromCharCode(92)
  /* Sin contrabarra final: el servidor real contesta 500 con ella (21-09-2026). */
  const grupo = await cliente.browse(`hda:${B}Configuration${B}DEMO_VIBRACIONES`)
  assert.equal(grupo.ok, true)
  assert.ok(grupo.payload.every(n => !n.pointName.includes(':', 4)), 'bajo el grupo cuelgan carpetas por apoyo, no tags')
  assert.ok(grupo.payload.every(n => !n.pointName.endsWith(B)), 'las carpetas del historiador no llevan contrabarra final')
  const conBarra = await cliente.browse(`hda:${B}Configuration${B}DEMO_VIBRACIONES${B}`)
  assert.equal(conBarra.ok, false, 'con contrabarra final el servidor real dice 500, y el fake no lo disimula')

  const s1 = await cliente.browse(`hda:${B}Configuration${B}DEMO_VIBRACIONES${B}S1`)
  assert.ok(s1.payload.some(n => n.pointName.endsWith(':vRMS_S1')), 'el tag lleva dos puntos tras la carpeta')

  const area = await cliente.browse('ae:/DEMO VIBRACIONES')
  assert.equal(area.ok, true)
  assert.ok(area.payload.length >= 4, 'los contadores del área')
  assert.ok(area.payload.every(n => n.shortName.startsWith('=')), 'los contadores llevan el igual delante')
})

/*
 * ── LA HISTORIA DE VIBRACIONES, EN EL FALSO (Plan 39 F2) ──────────────
 *
 * Hasta el 21-09-2026 el falso negaba TODA serie que no fuera del tanque, con
 * el argumento de que el grupo `DEMO 3` no entregaba. Ese grupo ya no existe
 * y `DEMO_VIBRACIONES` registra 36 series verificadas; negarlas dejaba sin
 * probar, sin red, todo lo que las herramientas de historia hacen con otra
 * máquina. Ahora el falso pregunta al REGISTRO de quién es un nombre `hda:`
 * y sirve la media por tramo de su simulación. Tres cosas se fijan:
 */
await checkAsync('la historia de vibraciones se pide por su nombre hda:, no por el punto en vivo', async () => {
  // El nombre en vivo (`ac:`) no es el del historiador: el servidor real lo
  // rechaza, y el falso también. Es la trampa B10 de este proyecto.
  const cliente = sinCaos()
  const r = await cliente.readHistory({
    pointName: puntoVariador('velocidad'),
    startDate: new Date(1_700_000_000_000 - 3_600_000).toISOString(),
    endDate: new Date(1_700_000_000_000).toISOString(),
    interval: '00:15:00',
  })
  assert.equal(r.ok, false)
  assert.match(r.error, /not being collected/)
})

await checkAsync('una serie historizada de vibraciones se sirve con la media de su simulación', async () => {
  let t = 1_700_000_000_000
  while (!enMarchaVib(t)) t += 60_000   // la máquina simulada tiene que estar en marcha
  const cliente = createFakeIconicsClient({ ahora: () => t, rnd: () => 0.99 })
  const vib = ESPEJO_REGISTRADA
  for (const clave of ['vRMS_S1', 'velocidad', 'frecuencia']) {
    assert.equal(vib.esHistorizada(clave), true, `${clave} tiene que estar historizada para esta comprobación`)
    const r = await cliente.readHistory({
      pointName: vib.series.punto(clave),
      startDate: new Date(t - 3_600_000).toISOString(),
      endDate: new Date(t).toISOString(),
      interval: '00:15:00',
    })
    assert.equal(r.ok, true, `${clave}: ${r.error}`)
    assert.ok(r.data.length > 0, `${clave}: sin muestras`)
    for (const d of r.data) {
      assert.ok(isGoodQuality(d.quality))
      assert.ok(Number.isFinite(d.value), `${clave}: valor no numérico`)
    }
  }
})

await checkAsync('una serie declarada pero NO verificada sigue fallando como en el servidor', async () => {
  /*
   * La escrita a mano no tiene con qué probarlo: `series.punto` sólo nombra
   * lo que está en su lista blanca. Una configurada SÍ: la espejo sin sondear
   * declara el nombre hda: de cada variable con `historyVerified: false`, que
   * es exactamente la máquina recién configurada de la que el asistente no
   * debe afirmar tendencias. Se registra sólo para esta comprobación.
   */
  const sinSondear = construirSistema(configuracionEspejo().configurada, tipoDe('vibraciones'))
  assert.equal(sinSondear.esHistorizada('vRMS_S1'), false)
  assert.ok(sinSondear.series.punto('vRMS_S1'), 'declara el nombre en el historiador')

  // La espejo registrada arriba sí la tiene verificada y usa el MISMO nombre
  // hda:, así que el falso, que pregunta a quien reclama el nombre en el orden
  // del registro, la serviría. Para ver la negativa hace falta una máquina con
  // tags y grupo PROPIOS que no la tenga verificada.
  const cfg = configuracionEspejo().configurada
  cfg.id = 'vibraciones-sin-verificar'
  for (const a of cfg.assets) a.pointName = a.pointName.replace('TDCON/DEMO_VIBRACIONES', 'OTRA/SINVER').replace('ae:/DEMO VIBRACIONES', 'ae:/SINVER')
  for (const v of cfg.variables) {
    v.pointName = v.pointName.replace('TDCON/DEMO_VIBRACIONES', 'OTRA/SINVER').replace('ae:/DEMO VIBRACIONES', 'ae:/SINVER')
    if (v.historyPointName) v.historyPointName = v.historyPointName.replace('DEMO_VIBRACIONES', 'GRUPO_SIN_VERIFICAR')
  }
  const soloSuya = registrarSistema(construirSistema(cfg, tipoDe('vibraciones')))
  try {
    const cliente = sinCaos()
    const r = await cliente.readHistory({
      pointName: soloSuya.series.punto('vRMS_S1'),
      startDate: new Date(1_700_000_000_000 - 3_600_000).toISOString(),
      endDate: new Date(1_700_000_000_000).toISOString(),
      interval: '00:15:00',
    })
    assert.equal(r.ok, false)
    assert.match(r.error, /not being collected/)
  } finally {
    desregistrarSistema(soloSuya.id)
  }
})

/* ── Una configurada con tags propios, en el falso (Plan 40 F0) ──────── */

console.log('\n── Una configurada con tags propios (Plan 40 F0) ─────────────')

await checkAsync('una configurada de tipo vibraciones con RAÍZ PROPIA se sirve con valores, no sin dato', async () => {
  /*
   * Hasta el 21-09-2026 el falso sólo daba valores a los tags de la máquina
   * escrita a mano: una configurada con otros tags salía entera «sin dato».
   * Con la simulación en el TIPO, cualquier máquina del tipo simula. Se
   * registra una con una raíz que ninguna escrita a mano reclama, sólo para
   * esta comprobación.
   */
  const base = configuracionEspejo().configurada
  const otra = {
    ...base,
    id: 'vibraciones-otra-planta',
    assets: base.assets.map(a => ({ ...a, pointName: a.pointName.replace('TDCON/DEMO_VIBRACIONES', 'OTRA/PLANTA').replace('ae:/DEMO VIBRACIONES', 'ae:/OTRA') })),
    variables: base.variables.map(v => ({
      ...v,
      pointName: v.pointName.replace('TDCON/DEMO_VIBRACIONES', 'OTRA/PLANTA').replace('ae:/DEMO VIBRACIONES', 'ae:/OTRA'),
    })),
  }
  const entrada = registrarSistema(construirSistema(otra, tipoDe('vibraciones')))
  try {
    let t = 1_700_000_000_000
    while (!enMarchaVib(t)) t += 60_000
    const cliente = createFakeIconicsClient({ ahora: () => t, rnd: () => 0.99 })
    const r = await cliente.readPoints(entrada.puntos())
    assert.equal(r.ok, true, r.error)
    const buenos = entrada.puntos().filter(p => r.payload[p]?.ok && isGoodQuality(r.payload[p].payload?.quality))
    assert.ok(buenos.length >= entrada.puntos().length - 5, `sólo ${buenos.length} de ${entrada.puntos().length} con calidad buena`)
    const vrms = otra.variables.find(v => v.id === 'vRMS_S1')
    assert.equal(typeof r.payload[vrms.pointName].payload.value, 'number')
    // El estado del sensor no tiene rol: hueco declarado, nunca un cero.
    const sensor = otra.variables.find(v => v.id === 'sensor_S1')
    assert.ok(!isGoodQuality(r.payload[sensor.pointName]?.payload?.quality), 'el sensor sin rol tiene que ir sin dato')
  } finally {
    desregistrarSistema(entrada.id)
  }
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

await checkAsync('el nombre hda: (Plan 27 F6) también se reconoce, no sólo el ac: de siempre', async () => {
  /*
   * El camino real desde el 10-09-2026: `sistemas.js` pide la historia con
   * `puntoHistorico()`, no con `pointName()` — un `hda:...` distinto para
   * casi toda señal. Si el transporte falso sólo supiera resolver `ac:`
   * (como hasta este commit), esta prueba fallaría con "unknown point" pese
   * a que el código de producción funciona, porque el fixture estaría
   * probando un camino que nadie usa ya.
   */
  const cliente = sinCaos()
  for (const clave of ['nivelTanque', 'modoVdf', 'corrienteL1', 'estadoS1']) {
    assert.ok(esHistorizada(clave), `${clave} debería estar historizada`)
    const nombreHda = puntoHistorico(clave)
    assert.ok(nombreHda.startsWith('hda:'), `${clave}: ${nombreHda}`)
    const r = await cliente.readHistory({
      pointName: nombreHda,
      startDate: new Date(1_700_000_000_000 - 3_600_000).toISOString(),
      endDate: new Date(1_700_000_000_000).toISOString(),
      interval: '00:15:00',
    })
    assert.equal(r.ok, true, `${clave} (${nombreHda}): ${r.error}`)
    assert.ok(r.data.length > 0, `${clave} sin muestras`)
  }
})

await checkAsync('cincuenta y dos señales: el catálogo del tanque quedó historizado por completo', async () => {
  // Plan 27 F6 (10-09-2026): cincuenta de las cincuenta y dos. El
  // 14-09-2026 planta le dio Historical data source propio a las dos que
  // quedaban (`cargaMotor`, `eficienciaEnergetica`), así que hoy son las 52.
  assert.equal(historizadas().length, 52)
})

await checkAsync('una señal SIN historia recibe la serie de la temperatura, como el servidor real', async () => {
  /*
   * Es la invariante cara de este archivo: no falla, y eso es justo lo que
   * hay que reproducir. `herramientas.mjs` nunca deja que esto se llame para
   * una señal sin serie propia (la guarda va ANTES de la red, ver
   * `verificar-herramientas.mjs`), pero cualquier otro consumidor del
   * transporte —la ruta REST directa, por ejemplo— tiene que ver la MISMA
   * trampa que vería contra el servidor de verdad.
   *
   * Ya no queda una señal real sin historia en el catálogo del tanque —la
   * última, `cargaMotor`, se corrigió en planta el 14-09-2026 (ver
   * `senales.js`)—, así que se apaga su bandera sólo durante esta prueba
   * para seguir ejercitando el cruce con la temperatura que SÍ reproduce
   * `fakeClient.mjs` cuando `esHistorizada()` dice que falta.
   */
  SENALES.cargaMotor.historizado = false
  try {
    const cliente = sinCaos()
    const rango = {
      startDate: new Date(1_700_000_000_000 - 3_600_000).toISOString(),
      endDate: new Date(1_700_000_000_000).toISOString(),
      interval: '00:15:00',
    }

    const temperatura = await cliente.readHistory({ pointName: pointName('temperaturaTanque'), ...rango })

    assert.ok(!esHistorizada('cargaMotor'), 'cargaMotor no debería estar historizada durante esta prueba')
    const r = await cliente.readHistory({ pointName: pointName('cargaMotor'), ...rango })

    assert.equal(r.ok, true, 'cargaMotor tendría que responder ok:true, como el servidor real')
    assert.deepEqual(
      r.data.map(d => d.value), temperatura.data.map(d => d.value),
      'cargaMotor no coincide con la serie de temperatura'
    )
  } finally {
    SENALES.cargaMotor.historizado = true
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
  const tag = 'ac:TDCON/DEMO/SEGURIDAD/CONTROL'

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
