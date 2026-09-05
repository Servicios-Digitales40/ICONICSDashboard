/**
 * El catálogo declarado es coherente consigo mismo — y, si se pide, con el
 * servidor de verdad.
 *
 *   node scripts/verificar-catalogo.mjs            # sin red, entra en CI
 *   node --env-file=.env.local scripts/verificar-catalogo.mjs --real
 *
 * ── LOS DOS MODOS, Y POR QUÉ ESTÁN SEPARADOS ───────────────────────
 *
 * Es la misma separación que ya existe entre `verificar-calibracion.mjs` y
 * `medir-calibracion.mjs`: uno prueba el MECANISMO sin depender de nada, el
 * otro sale al mundo. Juntarlos haría que la comprobación barata —la que
 * puede correr en cada commit— dependiera de que la planta esté alcanzable, y
 * entonces el rojo dejaría de significar nada.
 *
 * ── QUÉ ATRAPA EL MODO SIN RED ─────────────────────────────────────
 *
 * El fallo que este proyecto ya ha visto DOS veces (ver la cabecera de
 * `shared/eva/comun/sistemas.js`): una máquina nueva que el simulador no
 * conoce y que contesta `value: null` con calidad BUENA. La pantalla no ve un
 * fallo; ve una máquina que contesta y no dice nada.
 *
 * Y su hermano, que es peor porque es silencioso: un punto declarado en dos
 * sistemas. `sistemaDePunto()` devolvería el primero que coincida, así que una
 * lectura de la máquina B acabaría atribuida a la A — que es exactamente la
 * mezcla que `NO_COMPARTEN` existe para impedir.
 *
 * ── QUÉ AÑADE `--real` ─────────────────────────────────────────────
 *
 * Recorre las raíces con `browse()` y compara el árbol de verdad contra lo
 * declarado. Un punto renombrado en ICONICS aparece hoy como «sin dato»
 * permanente y hay que descubrirlo mirando la pantalla; esto lo dice por su
 * nombre, con el sobrante y el faltante en dos listas.
 */
import assert from 'node:assert/strict'

import {
  SISTEMAS,
  parsePuntoDeSistema,
  sistemaDePunto,
  valorSimuladoDe,
} from '../shared/eva/comun/sistemas.js'

const c = {
  reset: '\x1b[0m',
  negrita: '\x1b[1m',
  verde: '\x1b[32m',
  rojo: '\x1b[31m',
  amarillo: '\x1b[33m',
  gris: '\x1b[90m',
}

let fallos = 0

function check(nombre, fn) {
  try {
    fn()
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos += 1
    console.log(`  ${c.rojo}✗ ${nombre}${c.reset}`)
    for (const linea of error.message.split('\n').slice(0, 6)) {
      console.log(`    ${linea}`)
    }
  }
}

console.log(`\n${c.negrita}Catálogo de la planta${c.reset}  (${SISTEMAS.length} sistemas)\n`)

/* ── 1. Identidad: cada punto es de UN sistema ────────────────────── */

check('ningún punto está declarado en dos sistemas', () => {
  const dueno = new Map()
  const choques = []

  for (const sistema of SISTEMAS) {
    for (const punto of sistema.puntos()) {
      const previo = dueno.get(punto)
      if (previo && previo !== sistema.id) choques.push(`${punto} → ${previo} y ${sistema.id}`)
      dueno.set(punto, sistema.id)
    }
  }

  assert.deepEqual(
    choques,
    [],
    'Estos puntos los reclaman dos máquinas:\n  ' + choques.join('\n  ') +
      '\n\nUna lectura de una acabaría atribuida a la otra, que es justo lo que NO_COMPARTEN ' +
      'existe para impedir.'
  )
})

check('ningún punto está repetido dentro de su propio sistema', () => {
  for (const sistema of SISTEMAS) {
    const puntos = sistema.puntos()
    const repetidos = puntos.filter((p, i) => puntos.indexOf(p) !== i)
    assert.deepEqual(
      [...new Set(repetidos)],
      [],
      `"${sistema.id}" declara ${repetidos.length} punto(s) dos veces: se pedirían dos veces ` +
        'en cada ciclo de sondeo.'
    )
  }
})

check('todo punto cae bajo una raíz declarada de su sistema', () => {
  for (const sistema of SISTEMAS) {
    const huerfanos = sistema.puntos().filter(
      punto => !sistema.raices.some(raiz => punto.startsWith(raiz))
    )
    assert.deepEqual(
      huerfanos.slice(0, 5),
      [],
      `"${sistema.id}" declara ${huerfanos.length} punto(s) fuera de sus raíces ` +
        `(${sistema.raices.join(', ')}). El primero: ${huerfanos[0]}`
    )
  }
})

check('dos sistemas no comparten raíz ni una es prefijo de la otra', () => {
  const raices = SISTEMAS.flatMap(s => s.raices.map(raiz => ({ raiz, id: s.id })))
  const solapes = []

  for (const a of raices) {
    for (const b of raices) {
      if (a.id === b.id) continue
      if (a.raiz.startsWith(b.raiz)) solapes.push(`${a.raiz} (${a.id}) cae dentro de ${b.raiz} (${b.id})`)
    }
  }

  assert.deepEqual(
    solapes,
    [],
    'Raíces solapadas:\n  ' + solapes.join('\n  ') +
      '\n\n`sistemaDePunto()` resuelve por prefijo, así que con una raíz dentro de otra el ' +
      'resultado depende del orden del arreglo.'
  )
})

/* ── 2. El parseo devuelve cada punto a su casa ───────────────────── */

check('`parse()` reconoce todos los puntos de su propio sistema', () => {
  for (const sistema of SISTEMAS) {
    const ilegibles = sistema.puntos().filter(punto => sistema.parse(punto) === null)
    assert.deepEqual(
      ilegibles.slice(0, 5),
      [],
      `"${sistema.id}" declara ${ilegibles.length} punto(s) que su propio parse() no entiende. ` +
        `El primero: ${ilegibles[0]}`
    )
  }
})

check('`sistemaDePunto()` devuelve el dueño correcto', () => {
  for (const sistema of SISTEMAS) {
    for (const punto of sistema.puntos()) {
      const resuelto = sistemaDePunto(punto)
      assert.equal(
        resuelto?.id,
        sistema.id,
        `${punto} es de "${sistema.id}" y se resuelve a "${resuelto?.id ?? 'ninguno'}".`
      )
    }
  }
})

check('la identidad viaja pegada al punto, no se deduce después', () => {
  // `parsePuntoDeSistema` es la puerta que usan el transporte y las
  // herramientas. Si no devuelve el sistema, alguien acabará adivinándolo por
  // el nombre — que es la infracción que la cabecera del registro prohíbe.
  for (const sistema of SISTEMAS) {
    for (const punto of sistema.puntos()) {
      assert.equal(parsePuntoDeSistema(punto)?.sistema, sistema.id, `${punto}`)
    }
  }
})

/* ── 3. Lo que se promete del pasado ──────────────────────────────── */

check('`esHistorizada()` no promete serie de lo que no la tiene', () => {
  for (const sistema of SISTEMAS) {
    const declaradas = new Set(sistema.series.historizadas())
    const mentirosas = sistema
      .claves()
      .filter(clave => sistema.esHistorizada(clave) && !declaradas.has(clave))

    assert.deepEqual(
      mentirosas,
      [],
      `"${sistema.id}": ${mentirosas.join(', ')} pasan por historizadas y no están en ` +
        '`series.historizadas()`. A varias señales de este proyecto el historiador les ' +
        'devuelve la curva de OTRA sin dar error, y esa lista es la única puerta.'
    )
  }
})

check('toda clave con serie declarada es una clave del sistema', () => {
  for (const sistema of SISTEMAS) {
    const claves = new Set(sistema.claves())
    const fantasmas = sistema.series.historizadas().filter(clave => !claves.has(clave))
    assert.deepEqual(
      fantasmas,
      [],
      `"${sistema.id}" promete historia de ${fantasmas.join(', ')}, que no están en su catálogo.`
    )
  }
})

/* ── 3b. El comportamiento declarado, y que alguien lo lea ────────── */

check('cada sistema declara su cadencia, y es un número con sentido', () => {
  /*
   * `cadenciaMs` lleva declarado desde que existe el registro y hasta el Plan
   * 21 F1 no lo leía nadie: el tanque repetía su 3_000 en `evaSource.js` y
   * vibraciones su 5_000 en `vibracion.js`. Tres fuentes para el mismo número,
   * y el que se olvidara de una de ellas seguiría sondeando al ritmo viejo sin
   * que nada lo dijera.
   *
   * Los topes no son gusto: por debajo de un segundo se sondea más rápido de lo
   * que el servidor publica —y por debajo de `batchCacheTtlMs` (2 s) ni
   * siquiera se trae dato nuevo, sólo el cacheado—; por encima de un minuto,
   * una pantalla de planta enseña algo que pasó hace demasiado.
   */
  for (const sistema of SISTEMAS) {
    assert.equal(
      typeof sistema.cadenciaMs,
      'number',
      `"${sistema.id}" no declara cadenciaMs. Sin ella, la vista que lo pinte tendrá que ` +
        'cablear un número, que es justo lo que este campo existe para evitar.'
    )
    assert.ok(
      sistema.cadenciaMs >= 1000 && sistema.cadenciaMs <= 60_000,
      `"${sistema.id}" declara cadenciaMs=${sistema.cadenciaMs}, fuera del rango razonable ` +
        '(1 s a 60 s).'
    )
  }
})

/* ── 4. El catálogo se puede nombrar ──────────────────────────────── */

check('cada clave tiene etiqueta y alias', () => {
  for (const sistema of SISTEMAS) {
    for (const clave of sistema.claves()) {
      assert.ok(sistema.etiquetaDe(clave), `"${sistema.id}": ${clave} no tiene etiqueta.`)
      assert.ok(
        sistema.aliasDe(clave).length > 0,
        `"${sistema.id}": ${clave} no tiene ni un alias, así que nadie puede nombrarla.`
      )
    }
  }
})

/* ── 5. El transporte falso conoce la planta entera ───────────────── */

check('el simulador sirve TODOS los puntos declarados', () => {
  /*
   * El fallo que este proyecto ya ha visto dos veces: una máquina nueva que el
   * simulador no conoce devuelve `undefined` —«no es mío»— y el transporte la
   * deja fuera de la respuesta. La pantalla no ve un error; ve una máquina que
   * contesta y no dice nada.
   *
   * `null` SÍ vale: es «es mío y ahora mismo no entrega», que es lo que hace
   * el servidor de verdad y lo que la pantalla sabe pintar como sin dato.
   */
  const ahora = Date.now()
  for (const sistema of SISTEMAS) {
    const desconocidos = sistema
      .puntos()
      .filter(punto => valorSimuladoDe(punto, ahora) === undefined)

    assert.deepEqual(
      desconocidos.slice(0, 5),
      [],
      `El simulador no conoce ${desconocidos.length} punto(s) de "${sistema.id}". ` +
        `El primero: ${desconocidos[0]}\n` +
        'Con ICONICS_FAKE=true esa señal desaparece de la respuesta en vez de dar error.'
    )
  }
})

check('un punto que no es de nadie sale por la puerta de «no es mío»', () => {
  /*
   * Las dos respuestas de `modelo` no significan lo mismo y no pueden
   * colapsarse (ver su contrato en la cabecera del registro):
   *
   *   `undefined`  el punto no es de este sistema  → el transporte lo deja
   *                fuera de la respuesta
   *   `null`       es suyo y ahora no entrega      → lo sirve con calidad de
   *                sin-dato y SIN `value`
   *
   * Colapsarlas devuelve el fallo de la máquina que contesta `null` con
   * calidad buena. Aquí se comprueba la primera: un punto de nadie tiene que
   * salir como `undefined` de `valorSimuladoDe`.
   */
  const INVENTADO = 'ac:INVENTADO/QUE/NO/EXISTE'
  assert.equal(valorSimuladoDe(INVENTADO, Date.now()), undefined)
  // `sistemaDePunto` sí devuelve `null`: es su forma de decir «de nadie», y no
  // es la misma pregunta.
  assert.equal(sistemaDePunto(INVENTADO), null)
  assert.equal(parsePuntoDeSistema(INVENTADO), null)
})

/* ── 6. Contra el servidor real, sólo con --real ──────────────────── */

if (process.argv.includes('--real')) {
  console.log(`\n${c.negrita}Contra el servidor REAL${c.reset}\n`)

  const { loadConfig } = await import('../backend/config.mjs')
  const { createAuthenticator } = await import('../backend/iconics/authenticator.mjs')
  const { createIconicsClient } = await import('../backend/iconics/client.mjs')

  const config = loadConfig(process.env)
  if (!config.iconics.apiBase) {
    console.log(
      `  ${c.rojo}Falta ICONICS_API_BASE.${c.reset} Este modo necesita red a la planta:\n` +
      '  node --env-file=.env.local scripts/verificar-catalogo.mjs --real\n'
    )
    process.exit(1)
  }

  const cliente = createIconicsClient(config, createAuthenticator(config))

  /** Recorre una rama y devuelve los nombres de punto que cuelgan de ella. */
  async function explorar(ruta, profundidad = 0) {
    if (profundidad > 4) return []
    const respuesta = await cliente.browse(ruta)
    if (!respuesta.ok) {
      console.log(`  ${c.amarillo}!${c.reset} No se pudo explorar ${ruta}: ${respuesta.error}`)
      return []
    }

    const nodos = Array.isArray(respuesta.payload) ? respuesta.payload : []
    const encontrados = []
    for (const nodo of nodos) {
      const punto = nodo.pointName ?? nodo.browsePointName
      if (!punto) continue
      // ICONICS marca las ramas navegables terminando el nombre en «/».
      if (punto.endsWith('/')) encontrados.push(...(await explorar(punto, profundidad + 1)))
      else encontrados.push(punto)
    }
    return encontrados
  }

  for (const sistema of SISTEMAS) {
    const declarados = new Set(sistema.puntos())
    const enServidor = new Set()
    for (const raiz of sistema.raices) {
      for (const punto of await explorar(raiz)) enServidor.add(punto)
    }

    const faltan = [...declarados].filter(p => !enServidor.has(p))
    const sobran = [...enServidor].filter(p => !declarados.has(p))

    console.log(`  ${c.negrita}${sistema.nombre}${c.reset}`)
    console.log(`    declarados ${declarados.size} · en el servidor ${enServidor.size}`)

    if (faltan.length) {
      fallos += 1
      console.log(`    ${c.rojo}${faltan.length} declarado(s) que el servidor NO tiene:${c.reset}`)
      for (const punto of faltan.slice(0, 10)) console.log(`      · ${punto}`)
      console.log(
        `    ${c.gris}Estos aparecen en la pantalla como «sin dato» permanente. ` +
        `Suele ser un renombrado en ICONICS.${c.reset}`
      )
    }
    if (sobran.length) {
      console.log(`    ${c.amarillo}${sobran.length} en el servidor sin declarar:${c.reset}`)
      for (const punto of sobran.slice(0, 10)) console.log(`      · ${punto}`)
      console.log(`    ${c.gris}No es un fallo: puede ser dato que este tablero no usa.${c.reset}`)
    }
    if (!faltan.length && !sobran.length) console.log(`    ${c.verde}coinciden${c.reset}`)
  }
} else {
  console.log(
    `\n${c.gris}Sin --real no se toca la red. Para contrastar con el servidor de planta:\n` +
    `  node --env-file=.env.local scripts/verificar-catalogo.mjs --real${c.reset}`
  )
}

if (fallos) {
  console.log(`\n${c.rojo}${c.negrita}${fallos} comprobación(es) fallaron${c.reset}\n`)
  process.exit(1)
}

const puntos = SISTEMAS.reduce((n, s) => n + s.puntos().length, 0)
console.log(`\n${c.verde}${c.negrita}Catálogo coherente${c.reset} (${puntos} puntos)\n`)
