#!/usr/bin/env node
/**
 * scripts/verificar-vibraciones-configurada.mjs
 * ------------------------------------------------------------------
 * La máquina de vibraciones CONFIGURADA contra la escrita a mano. Plan 33 F4.
 *
 * ── LA PREGUNTA QUE CONTESTA ESTE GUION ────────────────────────────
 *
 * ¿Puede una configuración reproducir lo que hoy hace un módulo de 1 154
 * líneas? Y donde no pueda: **qué exactamente**.
 *
 * Las dos salen de la misma fuente —la configurada se DERIVA del catálogo, ver
 * `generar-configuracion-vibraciones.mjs`— así que ninguna diferencia que
 * aparezca aquí es un error de transcripción. Todas son reales: son cosas que
 * la configuración no sabe expresar todavía.
 *
 * ── LO QUE NO SE PRETENDE ──────────────────────────────────────────
 *
 * Que sean idénticas. No lo son ni deben serlo: el módulo escrito a mano trae
 * física simulada, forma de dominio y agrupación por apoyo, y una configuración
 * no tiene dónde poner nada de eso. Lo que se comprueba es que coincidan en lo
 * que el REGISTRO consume —puntos, claves, series, identidad— y que allí donde
 * no lleguen, **se note y esté declarado**, en vez de parecer completas.
 *
 * ── POR QUÉ ESTO NO RETIRA EL MÓDULO ORIGINAL ──────────────────────
 *
 * Porque esas líneas llevan dentro conocimiento verificado punto por punto
 * contra el servidor: entre otras cosas, que a `aPeak_S1` el historiador le
 * contesta con la serie de `aRMS_S1` sin dar error. Perderlo no daría un
 * error, daría un tablero enseñando la señal equivocada con el rótulo
 * correcto. Ver Plan 33 §18.
 *
 * No necesita red: entra en `npm run verificar`.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { construirSistema } from '../shared/eva/comun/construirSistema.js'
import { SISTEMA } from '../shared/eva/comun/sistemas.js'
import { tipoDe } from '../shared/eva/tipos/index.js'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m', amarillo: '\x1b[33m',
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

/*
 * La configuración se genera EN ESTE MOMENTO, llamando al guion. No se guarda
 * un JSON en el repositorio a propósito: un archivo congelado se quedaría
 * viejo en cuanto alguien tocara el catálogo, y entonces esta comparación
 * pasaría comparando contra una foto antigua — que es exactamente el fallo
 * que se quiere detectar.
 */
const AQUI = dirname(fileURLToPath(import.meta.url))
const generado = execFileSync(
  process.execPath,
  [join(AQUI, 'generar-configuracion-vibraciones.mjs')],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
)

const configuracion = JSON.parse(generado).maquinas[0]
const configurada = construirSistema(configuracion, tipoDe('vibraciones'))
const aMano = SISTEMA.vibraciones

/* ── Lo que el registro consume ──────────────────────────────────────── */

console.log(`\n${c.negrita}Lo que las dos tienen que compartir${c.reset}`)

check('los MISMOS 73 puntos, sin sobrar ni faltar ninguno', () => {
  assert.deepEqual(
    [...configurada.puntos()].sort(),
    [...aMano.puntos()].sort(),
  )
})

check('las MISMAS raíces, en el mismo orden', () => {
  assert.deepEqual(configurada.raices, aMano.raices)
})

/*
 * Las claves de dominio son con lo que se pide una serie y con lo que los
 * casos previos nombran una señal. Que no coincidan significaría que la
 * configurada no puede contestar por las mismas señales.
 */
/*
 * ── LAS CLAVES: COBERTURA, NO IGUALDAD ─────────────────────────────
 *
 * La configurada expone 73 y la escrita a mano 42. **No falta ninguna**:
 * sobran 31, que son las vigilancias del módulo (`MonState_*`), el estado de
 * los tres sensores y los cuatro contadores de alarma.
 *
 * La diferencia es deliberada en el catálogo original, y su comentario lo
 * explica: deja fuera de `claves()` lo que no se historiza. Pero `claves()`
 * alimenta `sistemasDeSenal()`, que decide POR QUÉ SEÑALES SE PUEDE
 * PREGUNTAR — y esas 31 se leen en vivo perfectamente. `bpfo_S1` dice si el
 * módulo vigila la frecuencia de defecto de pista exterior; que no tenga
 * histórico no es motivo para que el asistente no sepa que existe.
 *
 * Quien dice si algo tiene serie es `esHistorizada()`, que se comprueba abajo
 * clave por clave. Así que lo que se exige aquí es COBERTURA: que la
 * configurada sepa contestar por todo lo que la escrita a mano sabe. Que
 * además alcance más no es una regresión.
 */
check('cubre TODAS las claves de la escrita a mano, sin perder ninguna', () => {
  const suyas = new Set(configurada.claves())
  const faltan = aMano.claves().filter((k) => !suyas.has(k))
  assert.deepEqual(faltan, [], `la configurada no sabe contestar por: ${faltan.join(', ')}`)
})

check('y alcanza también las que se leen en vivo sin serie', () => {
  const suyas = new Set(configurada.claves())
  for (const clave of ['bpfo_S1', 'sensor_S1', 'monVRMS_S2']) {
    assert.ok(suyas.has(clave), `«${clave}» se lee en vivo y no se puede preguntar por ella`)
    assert.equal(configurada.esHistorizada(clave), false, `«${clave}» no debería tener serie`)
  }
})

/*
 * ── AQUÍ LAS DOS DEJAN DE SER IGUALES, Y ES EL PUNTO (Plan 34 F2) ──
 *
 * Hasta el 21-09-2026 esto exigía la MISMA lista de series en las dos, porque
 * la configuración se generaba HEREDANDO la lista blanca del catálogo. Desde
 * F2 se genera SONDEANDO: se pide cada serie al servidor y se comparan entre
 * sí, y **sin red no se verifica ninguna**.
 *
 * Eso es lo correcto y no un apaño para que esto pase: una serie se promete
 * después de mirarla, y aquí no se ha podido mirar. El guion corre sin planta
 * a propósito —está en la tanda—, así que lo que puede afirmar es la relación
 * entre las dos listas, no su tamaño.
 *
 * Con `--sondear` contra planta, medido el 21-09-2026:
 *
 *   36  las que el catálogo declara historizadas
 *   19  las que el sondeo verifica como serie PROPIA
 *    9  comparten serie con otra (las nueve `QC_*`: una sola serie para todas)
 *    8  no varían en la ventana, así que no se pueden distinguir
 *
 * La invariante que vale en los dos casos: la configuración es un
 * SUBCONJUNTO del catálogo. Prometer menos es correcto; prometer algo que el
 * catálogo no declara sería inventar.
 */
check('las series de la configuración son un SUBCONJUNTO de las del catálogo', () => {
  const delCatalogo = new Set(aMano.series.historizadas())
  const sondeadas = [...configurada.series.historizadas()]

  assert.ok(
    sondeadas.length <= delCatalogo.size,
    `la configuración promete ${sondeadas.length} series y el catálogo declara ` +
      `${delCatalogo.size}`,
  )
  for (const clave of sondeadas) {
    assert.ok(
      delCatalogo.has(clave),
      `«${clave}» está verificada en la configuración y el catálogo no la declara`,
    )
  }
})

check('sin sondear, la configuración NO promete ninguna serie', () => {
  /*
   * El valor seguro, y la diferencia que define esta fase. Antes este guion
   * generaba 40 series verificadas sin haber preguntado a nadie — y aquellas
   * 40 resultaron apuntar a un grupo del historiador que ya no existía.
   *
   * Si esto empieza a fallar es que alguien volvió a heredar la lista blanca
   * en vez de sondearla.
   */
  assert.deepEqual([...configurada.series.historizadas()], [])
})

/*
 * El nombre histórico no se deduce del nombre en vivo —es el defecto B10 de
 * este proyecto— así que se comprueba UNO A UNO que la configuración lo
 * guardó literal y correcto.
 */
check('cada serie apunta al MISMO punto histórico, literal', () => {
  for (const clave of aMano.series.historizadas()) {
    assert.equal(
      configurada.series.punto(clave),
      aMano.series.punto(clave),
      `«${clave}» apunta a otro punto del historiador`
    )
  }
})

/*
 * Sobre las claves de la escrita a mano, que son las que las dos comparten.
 * Las 31 que sólo tiene la configurada se comprueban arriba: ninguna promete
 * serie.
 */
check('`esHistorizada` nunca promete más que el catálogo (Plan 34 F2)', () => {
  /*
   * Ya no se exige que contesten IGUAL: sin sondear, la configuración dice
   * `false` a todo, y eso es lo correcto —ver arriba—. Lo que sí tiene que
   * cumplirse siempre es la dirección: si la configuración dice que una clave
   * tiene serie, el catálogo también.
   *
   * Al revés es legítimo: el catálogo la declara y el sondeo todavía no la ha
   * confirmado.
   */
  for (const clave of aMano.claves()) {
    if (configurada.esHistorizada(clave)) {
      assert.ok(
        aMano.esHistorizada(clave),
        `«${clave}» promete serie en la configuración y el catálogo no la declara`,
      )
    }
  }
})

/*
 * `aPeak_S1` es el caso que justifica que `historizadas` sea una lista blanca
 * y no `() => true`: el historiador le contesta con la serie de `aRMS_S1`, con
 * marcas de tiempo correctas y sin dar error.
 */
check('aPeak_S1 sigue FUERA: el historiador le contesta con la serie de otra', () => {
  assert.equal(aMano.esHistorizada('aPeak_S1'), false, 'cambió el catálogo original')
  assert.equal(
    configurada.esHistorizada('aPeak_S1'),
    false,
    'la configuración prometió una serie que devuelve la de aRMS_S1'
  )
})

check('el mismo PLC: es lo que separa dos instalaciones', () => {
  assert.equal(configurada.plc, aMano.plc)
})

check('la misma cadencia', () => {
  assert.equal(configurada.cadenciaMs, aMano.cadenciaMs)
})

/* ── La identidad de cada punto ──────────────────────────────────────── */

console.log(`\n${c.negrita}Cada punto resuelve a la misma señal${c.reset}`)

/*
 * La forma de `parse` NO es la misma —la escrita a mano devuelve
 * `{tipo, clave, canal}` con la clave y el apoyo separados; la configurada,
 * la clave compuesta— y eso es correcto: son dos catálogos con estructura
 * distinta. Lo que tiene que coincidir es a QUÉ SEÑAL apunta cada punto.
 */
check('cada punto resuelve a la misma clave de dominio', () => {
  for (const punto of aMano.puntos()) {
    const d = aMano.parse(punto)
    const esperada = d.canal ? `${d.clave}_${d.canal}` : d.clave

    const suya = configurada.parse(punto)
    assert.ok(suya, `«${punto}» no lo reconoce la configurada`)
    assert.equal(suya.clave, esperada, `«${punto}» resuelve a otra señal`)
  }
})

check('un punto inventado bajo la raíz da `null` en las dos', () => {
  const falso = `${aMano.raices[0]}S1/NO_EXISTE`
  assert.equal(aMano.parse(falso), null)
  assert.equal(configurada.parse(falso), null)
})

check('un punto AJENO devuelve `undefined` en `modelo`, no `null`', () => {
  assert.equal(configurada.modelo('ac:OTRA/MAQUINA/x'), undefined)
})

/* ── Las etiquetas ───────────────────────────────────────────────────── */

console.log(`\n${c.negrita}Cómo se nombra cada señal${c.reset}`)

check('la MISMA etiqueta para cada clave', () => {
  for (const clave of aMano.claves()) {
    assert.equal(
      configurada.etiquetaDe(clave),
      aMano.etiquetaDe(clave),
      `«${clave}» se rotula distinto`
    )
  }
})

/*
 * Los alias son cómo la gente pide una señal —«el DKW del sensor 1»—. Sin
 * ellos, `sistemasDeSenal` no encuentra la señal y el asistente afirma que no
 * existe, teniendo su serie.
 */
check('conserva los alias de cada señal', () => {
  for (const clave of aMano.claves()) {
    const suyos = new Set(configurada.aliasDe(clave))
    for (const alias of aMano.aliasDe(clave)) {
      assert.ok(suyos.has(alias), `«${clave}» perdió el alias «${alias}»`)
    }
  }
})

/* ── Lo que la configuración NO alcanza, y lo dice ───────────────────── */

console.log(`\n${c.negrita}Lo que no alcanza, y lo declara${c.reset}`)

/*
 * ── LA DIFERENCIA QUE HABÍA AQUÍ SE CERRÓ (Plan 34 F3) ─────────────
 *
 * Hasta el 21-09-2026 esta sección decía que una máquina configurada NO puede
 * diagnosticar: la escrita a mano traía `dominio` —la forma que leen los
 * motores de reglas— y la configuración, una lista plana de variables.
 *
 * `dominioDesdeRoles()` cierra ese hueco: coloca cada variable en
 * `{canales, variador}` usando su rol y su `assetId`. La equivalencia se
 * comprueba a fondo en `verificar-dominio-configurado.mjs` —los 66 valores y
 * las 18 reglas, en cuatro escenarios—; aquí basta con fijar que la
 * configurada ya no viaja sin forma.
 *
 * Lo que SIGUE sin alcanzar son las dos piezas que no son roles del tipo: los
 * contadores del área de alarmas y el estado del sensor. Ver abajo.
 */
check('la escrita a mano SÍ trae forma de dominio', () => {
  const est = aMano.estado(() => null, aMano)
  assert.ok(est.dominio, 'si esto falla, el motor de reglas cambió de entrada')
})

check('la configurada TAMBIÉN trae forma de dominio, reconstruida', () => {
  const est = configurada.estado(() => null, configurada)
  assert.ok('dominio' in est, 'ausente parecería un descuido')
  assert.ok(est.dominio, 'debería reconstruirse desde los roles')
  assert.deepEqual(
    Object.keys(est.dominio.canales).sort(),
    ['S1', 'S2', 'S3'],
    'los tres apoyos del tipo tienen que estar, aunque no entreguen valor',
  )
})

check('lo que NO sale de un rol se declara: alarmas y estado del sensor', () => {
  /*
   * No es un olvido: las alarmas son del servidor de ICONICS que vigila el
   * área, y el estado del sensor es del SM 1281. Ninguna describe una medida
   * del motor, que es lo que un rol nombra. Se recogen en F4.
   */
  const est = configurada.estado(() => null, configurada)
  assert.deepEqual(est.dominio.sinRoles.sort(), ['alarmas', 'sensores'])
})

check('y lo DECLARA: no aparenta poder diagnosticar', () => {
  assert.ok(
    configurada.limitaciones.some((l) => /derivada del catálogo/i.test(l)),
    'no dice que es una configuración derivada'
  )
})

check('dice que sus series se SONDEAN, y que sin sondear no hay ninguna', () => {
  /*
   * Este texto decía «heredando el sondeo del 28-08-2026» hasta el Plan 34
   * F2. Dejarlo habría sido peor que un comentario viejo: `limitaciones` es,
   * por contrato, lo que el asistente confiesa al contestar — una máquina que
   * declare heredada una verificación que ahora hace sería mentir hacia el
   * lado cómodo.
   */
  assert.ok(
    configurada.limitaciones.some((l) => /sondeándolas|sondear/i.test(l)),
    'no dice cómo se verifican sus series'
  )
  assert.ok(
    !configurada.limitaciones.some((l) => /heredando el sondeo/i.test(l)),
    'sigue diciendo que hereda un sondeo que ya no hereda'
  )
})

/*
 * ── LAS HERRAMIENTAS SE DERIVAN DE LO VERIFICADO (Plan 34 F2) ──────
 *
 * Antes esto afirmaba que la configurada ofrece `historia_de_senal` «con las
 * 40 series heredadas». Ya no las hereda: sin sondear no tiene ninguna, y
 * entonces **no debe ofrecer historia** — que es justo lo que `capacidadesDe`
 * existe para garantizar: «el tablero ofrecería histórico de una máquina sin
 * series, y el error aparecería al pulsar, no al configurar».
 *
 * Así que lo que se comprueba es la correspondencia, no el resultado fijo:
 * ofrece historia si y sólo si tiene alguna serie verificada.
 */
check('ofrece `historia_de_senal` si y sólo si tiene series verificadas', () => {
  const tieneSeries = [...configurada.series.historizadas()].length > 0
  assert.equal(
    configurada.herramientas.includes('historia_de_senal'),
    tieneSeries,
    tieneSeries
      ? 'tiene series verificadas y no ofrece historia'
      : 'no tiene ninguna serie verificada y ofrece historia igualmente',
  )
})

check('el estado en vivo se ofrece siempre: no depende del historiador', () => {
  assert.ok(configurada.herramientas.includes('estado_del_sistema'))
})

/* ── Qué falta por cubrir, medido ────────────────────────────────────── */

const conRol = configuracion.variables.filter((v) => v.rol)
const sinRol = configuracion.variables.filter((v) => !v.rol)

console.log(`\n${c.negrita}El estado de la derivación${c.reset}`)

check('todas las variables con rol apuntan a un rol REAL del tipo', () => {
  const tipo = tipoDe('vibraciones')
  for (const v of conRol) {
    assert.ok(tipo.roles[v.rol], `«${v.id}» dice tener el rol «${v.rol}», que no existe`)
  }
})

/*
 * Los 7 sin rol son los tres `Sensor_state_*` y los cuatro contadores de
 * alarma. No es un olvido: no son medidas de la máquina —los contadores son
 * del servidor de alarmas, en otro espacio de nombres— y darles un rol
 * inventado los haría entrar en reglas que no los esperan.
 */
check('las que no tienen rol son las que el tipo no nombra, y se leen igual', () => {
  assert.equal(sinRol.length, 7, `cambió el número de variables sin rol: ${sinRol.length}`)
  for (const v of sinRol) {
    assert.ok(
      /Sensor_state|DEMO VIBRACIONES/.test(v.pointName),
      `«${v.id}» no tiene rol y no es de las esperadas`
    )
  }
})

console.log(
  `\n  ${c.gris}${configuracion.variables.length} variables · ` +
    `${conRol.length} con rol · ${sinRol.length} sin rol (sensor y alarmas) · ` +
    `${configurada.series.historizadas().length} series${c.reset}`
)

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(
    `${c.gris}Revisa generar-configuracion-vibraciones.mjs y ` +
      `shared/eva/comun/construirSistema.js.${c.reset}`
  )
  process.exit(1)
}

console.log(
  `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: la configuración reproduce ` +
    `el catálogo de vibraciones.${c.reset}`
)
console.log(
  `${c.amarillo}La forma de dominio SÍ se reproduce desde el Plan 34 F3. Lo que queda fuera ` +
    `—y está declarado—\nson las alarmas y el estado del sensor: no salen de un rol del ` +
    `tipo.${c.reset}`
)
