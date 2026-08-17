#!/usr/bin/env node
/**
 * scripts/verificar-herramientas.mjs
 * ------------------------------------------------------------------
 * Comprueba las cinco herramientas que el modelo de lenguaje puede invocar,
 * **sin modelo y sin servidor ICONICS**.
 *
 * ── POR QUÉ SIN MODELO ─────────────────────────────────────────────
 *
 * Con el Q8 en una GPU de 8 GB, una respuesta del asistente tarda entre 30 y
 * 90 segundos. Una capa de herramientas que solo se pudiera probar esperando
 * eso no se probaría nunca. Aquí se ejecutan directamente, contra un cliente
 * de ICONICS de mentira, y tardan milisegundos.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 * Las reglas de dominio que son el motivo de que estas herramientas existan en
 * vez de dejar que el modelo llame a la API REST en crudo:
 *
 *  - Los contadores se SUMAN por tramos, porque se reinician con el turno.
 *  - Un valor de mala calidad es un HUECO, nunca un cero.
 *  - Una máquina sin historizar lo DICE; no devuelve un día vacío que el
 *    modelo presentaría como producción nula.
 *  - Ninguna herramienta escribe.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-herramientas.mjs
 *
 * Código de salida: 0 si todo se cumple, 1 si algo falla.
 */
import assert from 'node:assert/strict'
import { createHerramientas, resolverFecha, resolverMaquina } from '../backend/ia/herramientas.mjs'
import { historyPointName, pointName } from '../shared/tagCatalog.js'
import { TIPOS, leerTurnos, resolverPeriodo } from '../shared/periodo.js'

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

/* ── Cliente de ICONICS de mentira ───────────────────────────────────── */

const DIA = '2025-03-25'
const BAD_QUALITY = 0x80000000

/** Marca horaria del día de prueba, para que `unir` empareje de verdad. */
const hora = h => `${DIA}T${String(h).padStart(2, '0')}:00:00-06:00`

/**
 * Serie de un contador que se reinicia con el turno, tal y como pasa en la
 * planta: sube hasta 1551 y a la mañana siguiente arranca de nuevo en 48.
 *
 * El total honesto son 2145. Leer el último valor daría 594, que son las
 * piezas del último turno y no las del día — el error que esta capa existe
 * para no cometer.
 */
const CONTADOR_CON_REINICIO = [700, 1551, 48, 594]
const TOTAL_ESPERADO = 2145

/**
 * @param {object} opciones
 * @param {Set<string>} opciones.tagsQueFallan  historyPointName completos que devuelven 500
 * @param {object} opciones.vivo                tag de dominio → { value, quality }
 */
function clienteFalso({
  tagsQueFallan = new Set(), vivo = {}, vivoPorMaquina = null,
  historiaVacia = false, statusDeFallo = 500,
} = {}) {
  return {
    async readPoints(puntos) {
      const payload = {}
      for (const punto of puntos) {
        // `ac:RESONAC/LIN/1/OEE` → id "LIN/1"
        const partes = punto.slice(3).split('/')
        const id = `${partes[1]}/${partes[2]}`
        const lecturas = vivoPorMaquina ? (vivoPorMaquina[id] ?? {}) : vivo

        const tag = Object.keys(lecturas).find(t => punto.endsWith(`/${TAG_PROP[t]}`))
        if (!tag) continue
        payload[punto] = { ok: true, status: 200, payload: { pointName: punto, ...lecturas[tag] } }
      }
      return { ok: true, status: 200, payload }
    },

    async readHistory({ pointName: punto }) {
      if (tagsQueFallan.has(punto)) {
        // 500 = ICONICS contestó y el tag no está coleccionado.
        // 502 = no se llegó al servidor. Son averías distintas.
        return { ok: false, status: statusDeFallo, error: 'ICONICS History request failed.' }
      }
      if (historiaVacia) return { ok: true, status: 200, data: [], hasMore: false }

      const esContador = /Pz_OK|Pz_NOK|T_Muerto_Ico/.test(punto)
      const valores = esContador ? CONTADOR_CON_REINICIO : [60, 70, 80, 90]

      return {
        ok: true,
        status: 200,
        data: valores.map((value, i) => ({ timestamp: hora(i), value, quality: 192 })),
        hasMore: false,
      }
    },
  }
}

/** Campo de dominio → propiedad de ICONICS, para construir el mapa en vivo. */
const TAG_PROP = {
  oee: 'OEE', disponibilidad: 'OEE_Disp', rendimiento: 'OEE_Rend', calidad: 'OEE_Cal',
  aprobadas: 'Pz_OK', rechazadas: 'Pz_NOK', estado: 'Estado', modelo: 'Modelo',
}

/* ── Resolución de nombres ───────────────────────────────────────────── */

console.log(`\n${c.negrita}Herramientas del asistente${c.reset}`)
console.log('\n── Resolución de nombres ───────────────────────────────────')

check('el id canónico se resuelve', () => {
  assert.equal(resolverMaquina('LIN/1'), 'LIN/1')
  assert.equal(resolverMaquina('REC/13'), 'REC/13')
})

check('los nombres que escribe un operador también', () => {
  for (const forma of ['Línea 1', 'linea 1', 'Lineal 1', 'LIN 1', 'lin1', 'l 1']) {
    assert.equal(resolverMaquina(forma), 'LIN/1', `falló "${forma}"`)
  }
  for (const forma of ['Multi 13', 'multi 13', 'REC 13', 'rectificadora 13']) {
    assert.equal(resolverMaquina(forma), 'REC/13', `falló "${forma}"`)
  }
})

check('las máquinas que no existen no se resuelven', () => {
  // La numeración tiene huecos reales: no hay REC 12 ni REC 1-9, ni LIN 8.
  for (const fantasma of ['LIN/8', 'Línea 8', 'REC/12', 'Multi 12', 'REC/1', 'la de arriba']) {
    assert.equal(resolverMaquina(fantasma), null, `"${fantasma}" no debería resolver`)
  }
})

/* ── listar_maquinas ─────────────────────────────────────────────────── */

console.log('\n── listar_maquinas ─────────────────────────────────────────')

const herramientas = createHerramientas({ client: clienteFalso() })

check('el catálogo trae las 10 máquinas reales', () => {
  assert.deepEqual(
    herramientas.catalogo().map(m => m.id),
    ['LIN/1', 'LIN/2', 'LIN/3', 'LIN/4', 'LIN/5', 'LIN/6', 'LIN/7', 'REC/10', 'REC/11', 'REC/13']
  )
})

check('dice cuáles tienen historia, que hoy es solo LIN/1', () => {
  const conHistoria = herramientas.catalogo().filter(m => m.tieneHistoria).map(m => m.id)
  assert.deepEqual(conHistoria, ['LIN/1'])
})

check('el catálogo NO es una herramienta que el modelo pueda gastar', () => {
  // Gastaba la única llamada del turno en pedir lo que ya tiene delante en
  // las instrucciones, y se quedaba sin poder consultar el historiador.
  assert.ok(!herramientas.nombres.includes('listar_maquinas'))
  assert.ok(!herramientas.definiciones.some(d => d.function.name === 'listar_maquinas'))
})

await checkAsync('sin nombrar máquina, si solo una tiene historia, se usa esa', () => {
  return herramientas.ejecutar('datos_de_maquina', { periodo: DIA }).then(r => {
    assert.equal(r.ok, true, 'no hay ambigüedad que resolver: es esa o ninguna')
    assert.equal(r.maquina, 'LIN/1')
  })
})

/* ── estado_actual ───────────────────────────────────────────────────── */

console.log('\n── estado_actual ───────────────────────────────────────────')

await checkAsync('traduce la lectura en vivo a campos de dominio', async () => {
  const h = createHerramientas({
    client: clienteFalso({
      vivo: {
        oee: { value: 62.4, quality: 192 },
        disponibilidad: { value: 78.1, quality: 192 },
        aprobadas: { value: 1551, quality: 192 },
        estado: { value: 1, quality: 192 },
        modelo: { value: 'RECETA-A', quality: 192 },
      },
    }),
  })

  const r = await h.ejecutar('estado_actual', { maquina: 'Línea 1' })
  assert.equal(r.ok, true)
  assert.equal(r.maquina, 'LIN/1')
  assert.equal(r.oee, 62.4)
  assert.equal(r.disponibilidad, 78.1)
  assert.equal(r.aprobadas, 1551)
  assert.equal(r.estado, 'Operando')
  assert.equal(r.modelo, 'RECETA-A')
  assert.equal(r.fuente, 'tiempo real')
})

await checkAsync('un valor de MALA CALIDAD es un hueco, nunca un cero', async () => {
  const h = createHerramientas({
    client: clienteFalso({
      vivo: {
        // Así llega de verdad: la calidad mala trae el valor a 0. Si ese 0
        // pasara, el asistente diría «produjo 0 piezas» de una máquina que
        // está produciendo.
        aprobadas: { value: 0, quality: BAD_QUALITY },
        rechazadas: { value: 12, quality: 192 },
      },
    }),
  })

  const r = await h.ejecutar('estado_actual', { maquina: 'LIN/1' })
  assert.equal(r.ok, true)
  assert.equal(r.aprobadas, null, 'el valor de mala calidad debería ser null')
  assert.equal(r.rechazadas, 12, 'el de buena calidad sí pasa')
})

await checkAsync('una máquina inventada devuelve error CON el catálogo', async () => {
  const r = await herramientas.ejecutar('estado_actual', { maquina: 'Línea 42' })
  assert.equal(r.ok, false)
  assert.match(r.error, /no existe/i)
  assert.equal(r.maquinas.length, 10, 'el error debe traer las opciones válidas')
})

/* ── estado_de_planta (Plan 7) ───────────────────────────────────────── */

console.log('\n── estado_de_planta ────────────────────────────────────────')

/** Las mismas lecturas en las 10 máquinas, para cifras predecibles. */
const PLANTA_UNIFORME = {
  disponibilidad: { value: 80, quality: 192 },
  rendimiento: { value: 90, quality: 192 },
  calidad: { value: 95, quality: 192 },
  aprobadas: { value: 100, quality: 192 },
  rechazadas: { value: 10, quality: 192 },
  estado: { value: 1, quality: 192 },
  // A propósito distinto del producto D×R×C: ver la comprobación de abajo.
  oee: { value: 50, quality: 192 },
}

await checkAsync('resume la planta entera en una sola llamada', async () => {
  const h = createHerramientas({ client: clienteFalso({ vivo: PLANTA_UNIFORME }) })
  const r = await h.ejecutar('estado_de_planta')

  assert.equal(r.ok, true)
  assert.equal(r.maquinas.total, 10)
  assert.equal(r.maquinas.operando, 10)
  assert.equal(r.planta.producidas, 1100, '10 máquinas × (100 + 10)')
  assert.equal(r.rankingPorOee.length, 10)
  assert.equal(r.areas.length, 2, 'Lineales y Rectificadoras')
})

await checkAsync('el OEE de planta se COMPONE, no se promedia', async () => {
  const h = createHerramientas({ client: clienteFalso({ vivo: PLANTA_UNIFORME }) })
  const r = await h.ejecutar('estado_de_planta')

  // Es la regla documentada en shared/plantModel.js: el OEE de planta es
  // D×R×C de los agregados, para que el número grande y los tres gauges
  // cuenten la misma historia. Promediar los OEE de cada máquina daría 50, y
  // el chat contradiría al tablero.
  assert.equal(r.planta.oee, 68.4, '80 × 90 × 95 / 10000')
  assert.notEqual(r.planta.oee, 50, 'eso sería promediar los OEE de cada máquina')
})

await checkAsync('el ranking va de mejor a peor, para contestar las dos preguntas', async () => {
  const conOee = oee => ({ ...PLANTA_UNIFORME, oee: { value: oee, quality: 192 } })
  const h = createHerramientas({
    client: clienteFalso({
      vivoPorMaquina: {
        'LIN/1': conOee(90), 'LIN/2': conOee(30), 'LIN/3': conOee(60),
        'LIN/4': conOee(55), 'LIN/5': conOee(70), 'LIN/6': conOee(45),
        'LIN/7': conOee(80), 'REC/10': conOee(20), 'REC/11': conOee(65), 'REC/13': conOee(75),
      },
    }),
  })

  const r = await h.ejecutar('estado_de_planta')
  assert.equal(r.rankingPorOee[0].id, 'LIN/1', 'la mejor va primera')
  assert.equal(r.rankingPorOee.at(-1).id, 'REC/10', 'la peor va última')

  const valores = r.rankingPorOee.map(m => m.oee)
  assert.deepEqual(valores, [...valores].sort((a, b) => b - a), 'tiene que venir ordenado')
})

await checkAsync('sin ninguna lectura lo DICE, y no informa de una planta al 0 %', async () => {
  const h = createHerramientas({ client: clienteFalso({ vivo: {} }) })
  const r = await h.ejecutar('estado_de_planta')

  assert.equal(r.ok, false, 'un resumen con todo a null se redactaría como planta parada')
  assert.match(r.error, /ninguna de las 10 máquinas/i)
  assert.match(r.error, /3-4 minutos/, 'y dice cuánto tardan los servicios en levantar')
})

await checkAsync('una máquina muda no hunde el resumen de las demás', async () => {
  const h = createHerramientas({
    client: clienteFalso({
      vivoPorMaquina: { 'LIN/1': PLANTA_UNIFORME, 'LIN/2': PLANTA_UNIFORME },
    }),
  })

  const r = await h.ejecutar('estado_de_planta')
  assert.equal(r.ok, true)
  assert.equal(r.maquinas.sinDato, 8, 'las ocho sin lectura se cuentan aparte')
  assert.equal(r.planta.oee, 68.4, 'y no arrastran la media a cero')
})

/* ── datos_de_maquina ──────────────────────────────────────────────────── */

console.log('\n── datos_de_maquina ──────────────────────────────────────────')

await checkAsync('resume el día leyendo del historiador', async () => {
  const r = await herramientas.ejecutar('datos_de_maquina', { maquina: 'LIN/1', periodo: DIA })
  assert.equal(r.ok, true)
  assert.equal(r.maquina, 'LIN/1')
  assert.equal(r.fecha, DIA)
  assert.equal(r.fuente, 'historiador')
  assert.equal(r.oee, 75, 'media de 60,70,80,90')
})

await checkAsync('los CONTADORES se suman por tramos, no se lee el último', async () => {
  const r = await herramientas.ejecutar('datos_de_maquina', { maquina: 'LIN/1', periodo: DIA })
  assert.equal(
    r.aprobadas, TOTAL_ESPERADO,
    `esperaba ${TOTAL_ESPERADO} (suma de tramos), no ${r.aprobadas}. ` +
    'Leer el último valor daría 594, que son solo las piezas del último turno.'
  )
})

await checkAsync('una máquina SIN historizar lo dice, y no devuelve un día vacío', async () => {
  // Las 9 máquinas sin «Is Collected» responden 500 a los siete tags, igual
  // que un punto que no existe.
  const todos = new Set(
    ['oee', 'disponibilidad', 'rendimiento', 'calidad', 'aprobadas', 'rechazadas', 'tMuerto']
      .map(tag => historyPointName('LIN', '3', tag))
  )
  const h = createHerramientas({ client: clienteFalso({ tagsQueFallan: todos }) })

  const r = await h.ejecutar('datos_de_maquina', { maquina: 'Línea 3', periodo: DIA })
  assert.equal(r.ok, false, 'no puede devolver ok con un resumen vacío')
  assert.match(r.error, /no tiene datos históricos/i)
  assert.deepEqual(r.maquinasConHistoria, ['LIN/1'], 'debe decir cuáles sí')
})

await checkAsync('«servidor caído» NO se cuenta como «tag sin coleccionar»', async () => {
  // Pasó de verdad con el servidor real: con los servicios GENESIS apagados,
  // los siete tags fallaban y el asistente mandaba a revisar el Data
  // Historian. Son dos averías que se arreglan en sitios distintos, y confundir
  // «no llego al servidor» con «falta una casilla» hace perder la tarde.
  const todos = new Set(
    ['oee', 'disponibilidad', 'rendimiento', 'calidad', 'aprobadas', 'rechazadas', 'tMuerto']
      .map(tag => historyPointName('LIN', '1', tag))
  )
  const h = createHerramientas({ client: clienteFalso({ tagsQueFallan: todos, statusDeFallo: 502 }) })

  const r = await h.ejecutar('datos_de_maquina', { maquina: 'LIN/1', periodo: DIA })
  assert.equal(r.ok, false)
  assert.match(r.error, /no se pudo contactar/i)
  assert.doesNotMatch(r.error, /Is Collected/i, 'no debe mandar a revisar el historiador')
  assert.match(r.error, /3-4 minutos/, 'y sí decir cuánto tardan los servicios')
})

await checkAsync('un día sin ninguna muestra se distingue de un día con OEE 0', async () => {
  const h = createHerramientas({ client: clienteFalso({ historiaVacia: true }) })
  const r = await h.ejecutar('datos_de_maquina', { maquina: 'LIN/1', periodo: DIA })
  assert.equal(r.ok, false)
  assert.match(r.error, /no hay ninguna muestra/i)
})

await checkAsync('un período que no se entiende se rechaza enseñando las formas válidas', async () => {
  // Van saliendo de esta lista según se amplía el resolvedor: «ayer» se fue
  // en el Plan 7, y «25 de marzo de 2025» y «la semana pasada» al añadir los
  // períodos. Lo que queda es lo que de verdad no se sabe interpretar.
  for (const mala of ['25/03/2025', '2025-3-5', 'cuando estaba lloviendo', '']) {
    const r = await herramientas.ejecutar('datos_de_maquina', { maquina: 'LIN/1', periodo: mala })
    assert.equal(r.ok, false, `"${mala}" debería rechazarse`)
    assert.match(r.error, /formas que entiendo|no me has dicho/i, `sin instrucciones: ${r.error}`)
  }
})

await checkAsync('una fecha futura se rechaza', async () => {
  const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const r = await herramientas.ejecutar('datos_de_maquina', { maquina: 'LIN/1', periodo: manana })
  assert.equal(r.ok, false)
  assert.match(r.error, /futuro/i)
})

/* ── Fechas relativas (Plan 7) ───────────────────────────────────────── */

console.log('\n── Fechas relativas ────────────────────────────────────────')

/** "YYYY-MM-DD" de hoy más `dias`, calculado aparte de la implementación. */
const esperado = (dias) => {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

check('hoy, ayer y anteayer se resuelven en el backend', () => {
  assert.equal(resolverFecha('hoy').iso, esperado(0))
  assert.equal(resolverFecha('ayer').iso, esperado(-1))
  assert.equal(resolverFecha('anteayer').iso, esperado(-2))
  assert.equal(resolverFecha('antier').iso, esperado(-2))
})

check('las mayúsculas y los acentos dan igual', () => {
  assert.equal(resolverFecha('AYER').iso, esperado(-1))
  assert.equal(resolverFecha(' Ayer ').iso, esperado(-1))
  assert.equal(resolverFecha('miércoles').iso, resolverFecha('miercoles').iso)
})

check('un día de la semana cae en el pasado, nunca en el futuro', () => {
  const hoy = esperado(0)
  for (const dia of ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']) {
    const { iso } = resolverFecha(dia)
    assert.ok(iso <= hoy, `"${dia}" resolvió a ${iso}, que es futuro`)
    assert.ok(iso >= esperado(-6), `"${dia}" resolvió a ${iso}, demasiado atrás`)
  }
})

check('«pasado» retrocede una semana cuando el día es hoy', () => {
  const nombreDeHoy = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'][new Date().getDay()]
  assert.equal(resolverFecha(nombreDeHoy).iso, esperado(0), 'sin "pasado" es hoy mismo')
  assert.equal(resolverFecha(`${nombreDeHoy} pasado`).iso, esperado(-7), 'con "pasado" es el de la semana anterior')
})

check('el formato ISO sigue funcionando igual', () => {
  assert.equal(resolverFecha('2025-03-25').iso, '2025-03-25')
})

check('el futuro se sigue rechazando, venga como venga', () => {
  assert.match(resolverFecha(esperado(1)).error, /futuro/i)
})

check('lo que no se entiende dice cómo escribirlo', () => {
  const r = resolverFecha('el jueves de la semana que viene')
  assert.ok(r.error, 'no debería resolver')
  assert.match(r.error, /YYYY-MM-DD/)
})

await checkAsync('la herramienta acepta "ayer" de punta a punta', async () => {
  const r = await herramientas.ejecutar('datos_de_maquina', { maquina: 'LIN/1', periodo: 'ayer' })
  assert.equal(r.ok, true)
  assert.equal(r.fecha, esperado(-1), 'la respuesta lleva la fecha YA resuelta, no la palabra')
})

/* ── Períodos: horas, turnos y rangos ────────────────────────────────── */

console.log('\n── Resolución de períodos ──────────────────────────────────')

check('cada forma cae en su tipo', () => {
  assert.equal(resolverPeriodo('2025-03-25').tipo, TIPOS.DIA)
  assert.equal(resolverPeriodo('ayer').tipo, TIPOS.DIA)
  assert.equal(resolverPeriodo('20 de julio de 2025').tipo, TIPOS.DIA)
  assert.equal(resolverPeriodo('ayer a las 12').tipo, TIPOS.HORA)
  assert.equal(resolverPeriodo('2025-03-25 14:00').tipo, TIPOS.HORA)
  assert.equal(resolverPeriodo('julio 2025').tipo, TIPOS.RANGO)
  assert.equal(resolverPeriodo('últimos 7 días').tipo, TIPOS.RANGO)
})

check('la hora se entiende en las formas en que se dice', () => {
  assert.equal(resolverPeriodo('2025-03-25 14:00').horaDesde, 14)
  assert.equal(resolverPeriodo('2025-03-25 a las 14').horaDesde, 14)
  assert.equal(resolverPeriodo('2025-03-25 a las 2 pm').horaDesde, 14)
  assert.equal(resolverPeriodo('2025-03-25 a las 2 de la tarde').horaDesde, 14)
  // Una hora es un bucket de una hora: el historiador agrega así.
  assert.equal(resolverPeriodo('2025-03-25 14:00').horaHasta, 15)
})

check('un mes se convierte en sus días, recortado en hoy si sigue en curso', () => {
  const julio = resolverPeriodo('julio 2025')
  assert.equal(julio.diaDesde, '2025-07-01')
  assert.equal(julio.diaHasta, '2025-07-31')

  const esteMes = resolverPeriodo('este mes')
  assert.ok(esteMes.diaHasta <= new Date().toISOString().slice(0, 10), 'no puede pasar de hoy')
})

check('el futuro se rechaza también como período', () => {
  const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  assert.match(resolverPeriodo(manana).error, /futuro/i)
})

check('sin turnos configurados NO se inventa el horario', () => {
  const r = resolverPeriodo('turno de la mañana del 2025-03-25')
  assert.ok(r.error, 'no puede resolver un turno que no conoce')
  assert.match(r.error, /no están configurados/i)
  assert.match(r.error, /hora concreta/i, 'y ofrece la alternativa que sí funciona')
})

check('con turnos configurados sí, y se leen del entorno', () => {
  const turnos = leerTurnos('manana=6-14,tarde=14-22,noche=22-6')
  assert.deepEqual(turnos.manana, [6, 14])

  const r = resolverPeriodo('turno de la tarde del 2025-03-25', { turnos })
  assert.equal(r.tipo, TIPOS.VENTANA)
  assert.equal(r.horaDesde, 14)
  assert.equal(r.horaHasta, 22)
})

console.log('\n── datos_de_maquina · horas y rangos ───────────────────────')

await checkAsync('una hora concreta devuelve SOLO esa hora', async () => {
  // La serie falsa tiene 60,70,80,90 en las horas 0,1,2,3.
  const r = await herramientas.ejecutar('datos_de_maquina', { maquina: 'LIN/1', periodo: `${DIA} 02:00` })
  assert.equal(r.ok, true)
  assert.equal(r.oee, 80, 'la hora 2, no la media del día')
  assert.match(r.horas, /2:00 a 3:00/)
})

await checkAsync('en una VENTANA los contadores se cuentan por incremento', async () => {
  // Es la regla que más fácil se hace mal. El total del día son 2145 porque
  // incluye el valor con el que arranca la serie —lo acumulado del turno de
  // noche—. En una ventana que empieza a media mañana ese arranque es
  // producción de ANTES, y contarlo dispararía la cifra.
  const h = createHerramientas({ client: clienteFalso(), turnos: leerTurnos('tarde=1-3') })

  const dia = await h.ejecutar('datos_de_maquina', { maquina: 'LIN/1', periodo: DIA })
  assert.equal(dia.aprobadas, TOTAL_ESPERADO, 'el día entero sí incluye el arranque')

  const ventana = await h.ejecutar('datos_de_maquina', { maquina: 'LIN/1', periodo: `turno de la tarde del ${DIA}` })
  assert.equal(ventana.ok, true)
  // Horas 1 y 2 del contador: 1551 → 48. Es un reinicio, así que el tramo
  // nuevo aporta desde su propio valor.
  assert.equal(ventana.aprobadas, 48, `esperaba 48, no ${ventana.aprobadas}`)
  assert.notEqual(ventana.aprobadas, TOTAL_ESPERADO, 'no puede ser el total del día')
})

await checkAsync('un rango devuelve máximo, mínimo y promedio YA calculados', async () => {
  const r = await herramientas.ejecutar('datos_de_maquina', {
    maquina: 'LIN/1', periodo: 'julio 2025', metrica: 'oee',
  })

  assert.equal(r.ok, true)
  assert.equal(r.metrica, 'oee')
  assert.equal(r.diasConDato, 31, 'julio tiene 31 días')
  // Pedirle al modelo que encuentre el mayor de 31 sería pedirle aritmética.
  assert.ok(r.maximo?.fecha, 'el máximo tiene que venir con su fecha')
  assert.ok(r.minimo?.fecha)
  assert.equal(r.promedio, 75, 'media de 60,70,80,90')
  assert.equal(r.porDia.length, 31)
})

await checkAsync('en un rango, un contador se totaliza en vez de promediarse', async () => {
  const r = await herramientas.ejecutar('datos_de_maquina', {
    maquina: 'LIN/1', periodo: 'julio 2025', metrica: 'aprobadas',
  })
  assert.equal(r.ok, true)
  assert.equal(r.unidad, 'piezas')
  assert.equal(r.maximo.valor, TOTAL_ESPERADO, 'cada día suma sus tramos')
  assert.equal(r.total, TOTAL_ESPERADO * 31, 'y el rango los suma todos')
})

await checkAsync('un porcentaje imposible se AVISA, no se presenta como bueno', async () => {
  // Medido en el servidor real: LIN/1 el 2026-07-24 devuelve 15 de 24
  // muestras por encima de 100, con un máximo de 160,4 %. Es el fallo de
  // OEE_Cal sin acotar que documenta TAGS.md. La media diaria lo disimulaba;
  // un máximo de un mes lo saca a la luz.
  const h = createHerramientas({
    client: {
      readPoints: async () => ({ ok: true, payload: {} }),
      readHistory: async () => ({
        ok: true, status: 200, hasMore: false,
        data: [0, 1, 2].map(i => ({ timestamp: hora(i), value: 130 + i, quality: 192 })),
      }),
    },
  })

  const r = await h.ejecutar('datos_de_maquina', { maquina: 'LIN/1', periodo: DIA })
  assert.equal(r.ok, true, 'el dato se entrega: esconderlo sería el otro extremo')
  assert.ok(r.aviso, 'pero tiene que venir con su aviso')
  assert.match(r.aviso, /100 %/)
  assert.match(r.aviso, /no es una medición válida/i)
  // El aviso se redacta como HECHO, no como orden: en imperativo, el modelo
  // lo copiaba literal y el operador leía las instrucciones del sistema.
  assert.doesNotMatch(r.aviso, /\b(dilo|di\b|no la presentes|debes)\b/i)
})

await checkAsync('una métrica inventada se rechaza con la lista de las buenas', async () => {
  const r = await herramientas.ejecutar('datos_de_maquina', {
    maquina: 'LIN/1', periodo: 'julio 2025', metrica: 'temperatura',
  })
  assert.equal(r.ok, false)
  assert.ok(r.metricas.includes('oee'))
})

/* ── comparar_periodos ───────────────────────────────────────────────────── */

console.log('\n── comparar_periodos ───────────────────────────────────────────')

await checkAsync('devuelve los dos días y su diferencia', async () => {
  const r = await herramientas.ejecutar('comparar_periodos', {
    maquina: 'LIN/1', periodoA: '2025-03-24', periodoB: DIA,
  })
  assert.equal(r.ok, true)
  // Las claves son las etiquetas ya resueltas, no lo que escribió el modelo.
  assert.equal(r['el 2025-03-24'].oee, 75)
  assert.equal(r[`el ${DIA}`].oee, 75)
  assert.equal(r.diferencia.oee, 0, 'mismos datos → diferencia cero')
  assert.match(r.nota, /negativo/i, 'debe explicar el signo al modelo')
})

await checkAsync('si un día no tiene datos, lo dice en vez de comparar a medias', async () => {
  const h = createHerramientas({ client: clienteFalso({ historiaVacia: true }) })
  const r = await h.ejecutar('comparar_periodos', {
    maquina: 'LIN/1', periodoA: '2025-03-24', periodoB: DIA,
  })
  assert.equal(r.ok, false)
})

/* ── El registro ─────────────────────────────────────────────────────── */

console.log('\n── El registro de herramientas ─────────────────────────────')

check('son exactamente cuatro, y ninguna escribe', () => {
  assert.deepEqual(
    herramientas.nombres.sort(),
    ['comparar_periodos', 'datos_de_maquina', 'estado_actual', 'estado_de_planta']
  )
  const sospechosas = herramientas.nombres.filter(n => /escrib|write|set|ack|borr|delete/i.test(n))
  assert.deepEqual(sospechosas, [], 'el registro no puede contener escrituras')
})

check('el esquema que ve el modelo coincide con el registro', () => {
  const enEsquema = herramientas.definiciones.map(d => d.function.name).sort()
  assert.deepEqual(enEsquema, herramientas.nombres.sort())
  for (const d of herramientas.definiciones) {
    assert.ok(d.function.description?.length > 40, `${d.function.name} sin descripción útil`)
    assert.equal(d.type, 'function')
  }
})

check('el esquema avisa de que no todas las máquinas tienen historia', () => {
  const oee = herramientas.definiciones.find(d => d.function.name === 'datos_de_maquina')
  assert.match(
    oee.function.description, /solo algunas máquinas tienen datos históricos/i,
    'sin ese aviso el modelo pedirá historia de máquinas que no la tienen'
  )
})

await checkAsync('una herramienta inventada no lanza: devuelve las válidas', async () => {
  const r = await herramientas.ejecutar('borrar_todo', {})
  assert.equal(r.ok, false)
  assert.match(r.error, /no existe la herramienta/i)
  assert.equal(r.herramientas.length, 4)
})

await checkAsync('un fallo del cliente se cuenta, no se traga', async () => {
  const roto = {
    readPoints: async () => ({ ok: false, status: 502, error: 'no se pudo conectar' }),
    readHistory: async () => ({ ok: false, status: 502 }),
  }
  const h = createHerramientas({ client: roto })
  const r = await h.ejecutar('estado_actual', { maquina: 'LIN/1' })
  assert.equal(r.ok, false)
  assert.match(r.error, /no se pudo/i)
})

/* ── Cierre ──────────────────────────────────────────────────────────── */

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Las herramientas son lo único que separa al modelo de inventarse`)
  console.log(`una cifra. Revisa backend/ia/herramientas.mjs.${c.reset}`)
  process.exit(1)
}

console.log(`${c.verde}${c.negrita}${passed} comprobaciones correctas: las herramientas no inventan datos.${c.reset}`)
process.exit(0)
