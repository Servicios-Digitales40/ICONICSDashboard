#!/usr/bin/env node
/**
 * scripts/verificar-herramientas.mjs
 * ------------------------------------------------------------------
 * Comprueba las cuatro herramientas que el modelo de lenguaje puede invocar,
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

await checkAsync('devuelve las 10 máquinas reales', async () => {
  const r = await herramientas.ejecutar('listar_maquinas')
  assert.equal(r.ok, true)
  assert.equal(r.maquinas.length, 10)
  assert.deepEqual(
    r.maquinas.map(m => m.id),
    ['LIN/1', 'LIN/2', 'LIN/3', 'LIN/4', 'LIN/5', 'LIN/6', 'LIN/7', 'REC/10', 'REC/11', 'REC/13']
  )
})

await checkAsync('dice cuáles tienen historia, que hoy es solo LIN/1', async () => {
  const r = await herramientas.ejecutar('listar_maquinas')
  const conHistoria = r.maquinas.filter(m => m.tieneHistoria).map(m => m.id)
  assert.deepEqual(conHistoria, ['LIN/1'])
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

/* ── oee_de_maquina ──────────────────────────────────────────────────── */

console.log('\n── oee_de_maquina ──────────────────────────────────────────')

await checkAsync('resume el día leyendo del historiador', async () => {
  const r = await herramientas.ejecutar('oee_de_maquina', { maquina: 'LIN/1', fecha: DIA })
  assert.equal(r.ok, true)
  assert.equal(r.maquina, 'LIN/1')
  assert.equal(r.fecha, DIA)
  assert.equal(r.fuente, 'historiador')
  assert.equal(r.oee, 75, 'media de 60,70,80,90')
})

await checkAsync('los CONTADORES se suman por tramos, no se lee el último', async () => {
  const r = await herramientas.ejecutar('oee_de_maquina', { maquina: 'LIN/1', fecha: DIA })
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

  const r = await h.ejecutar('oee_de_maquina', { maquina: 'Línea 3', fecha: DIA })
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

  const r = await h.ejecutar('oee_de_maquina', { maquina: 'LIN/1', fecha: DIA })
  assert.equal(r.ok, false)
  assert.match(r.error, /no se pudo contactar/i)
  assert.doesNotMatch(r.error, /Is Collected/i, 'no debe mandar a revisar el historiador')
  assert.match(r.error, /3-4 minutos/, 'y sí decir cuánto tardan los servicios')
})

await checkAsync('un día sin ninguna muestra se distingue de un día con OEE 0', async () => {
  const h = createHerramientas({ client: clienteFalso({ historiaVacia: true }) })
  const r = await h.ejecutar('oee_de_maquina', { maquina: 'LIN/1', fecha: DIA })
  assert.equal(r.ok, false)
  assert.match(r.error, /no hay ninguna muestra/i)
})

await checkAsync('una fecha que no se entiende se rechaza con instrucciones', async () => {
  // `ayer` YA NO está aquí: desde el Plan 7 se resuelve en el backend.
  for (const mala of ['25 de marzo de 2025', '25/03/2025', 'la semana pasada', '2025-3-5', '']) {
    const r = await herramientas.ejecutar('oee_de_maquina', { maquina: 'LIN/1', fecha: mala })
    assert.equal(r.ok, false, `"${mala}" debería rechazarse`)
    assert.match(r.error, /YYYY-MM-DD/)
  }
})

await checkAsync('una fecha futura se rechaza', async () => {
  const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const r = await herramientas.ejecutar('oee_de_maquina', { maquina: 'LIN/1', fecha: manana })
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
  const r = await herramientas.ejecutar('oee_de_maquina', { maquina: 'LIN/1', fecha: 'ayer' })
  assert.equal(r.ok, true)
  assert.equal(r.fecha, esperado(-1), 'la respuesta lleva la fecha YA resuelta, no la palabra')
})

/* ── comparar_dias ───────────────────────────────────────────────────── */

console.log('\n── comparar_dias ───────────────────────────────────────────')

await checkAsync('devuelve los dos días y su diferencia', async () => {
  const r = await herramientas.ejecutar('comparar_dias', {
    maquina: 'LIN/1', fechaA: '2025-03-24', fechaB: DIA,
  })
  assert.equal(r.ok, true)
  assert.equal(r['2025-03-24'].oee, 75)
  assert.equal(r[DIA].oee, 75)
  assert.equal(r.diferencia.oee, 0, 'mismos datos → diferencia cero')
  assert.match(r.nota, /negativo/i, 'debe explicar el signo al modelo')
})

await checkAsync('si un día no tiene datos, lo dice en vez de comparar a medias', async () => {
  const h = createHerramientas({ client: clienteFalso({ historiaVacia: true }) })
  const r = await h.ejecutar('comparar_dias', {
    maquina: 'LIN/1', fechaA: '2025-03-24', fechaB: DIA,
  })
  assert.equal(r.ok, false)
})

/* ── El registro ─────────────────────────────────────────────────────── */

console.log('\n── El registro de herramientas ─────────────────────────────')

check('son exactamente cinco, y ninguna escribe', () => {
  assert.deepEqual(
    herramientas.nombres.sort(),
    ['comparar_dias', 'estado_actual', 'estado_de_planta', 'listar_maquinas', 'oee_de_maquina']
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
  const oee = herramientas.definiciones.find(d => d.function.name === 'oee_de_maquina')
  assert.match(
    oee.function.description, /solo algunas máquinas tienen datos históricos/i,
    'sin ese aviso el modelo pedirá historia de máquinas que no la tienen'
  )
})

await checkAsync('una herramienta inventada no lanza: devuelve las válidas', async () => {
  const r = await herramientas.ejecutar('borrar_todo', {})
  assert.equal(r.ok, false)
  assert.match(r.error, /no existe la herramienta/i)
  assert.equal(r.herramientas.length, 5)
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
