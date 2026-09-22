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
import { SISTEMA, valorSimuladoDe } from '../shared/eva/comun/sistemas.js'
import { contadoresDeMaquina } from '../shared/eva/comun/vistaDeMaquina.js'
import { tipoDe } from '../shared/eva/tipos/index.js'
import { enMarchaVib } from '../shared/eva/vibraciones/simuladorVibraciones.js'

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

check('lo que NO sale de un rol se declara: el estado del sensor (las alarmas ya se leen)', () => {
  /*
   * No es un olvido: el estado del sensor es del SM 1281, no una medida del
   * motor, y ningún rol lo nombra. Hasta el Plan 39 F1 aquí figuraban también
   * las alarmas; desde entonces los contadores del área se reconocen por su
   * sufijo (`tipo.contadoresAlarma`) y se le entregan al dominio, así que
   * dejan de estar «sin rol». Sólo si la máquina no marcó ninguno vuelven a
   * aparecer aquí, que es lo correcto: no leído no es cero.
   */
  const est = configurada.estado(() => null, configurada)
  assert.deepEqual(est.dominio.sinRoles.sort(), ['sensores'])

  const sinContadores = construirSistema(
    { ...configuracion, variables: configuracion.variables.filter((v) => !v.pointName.startsWith('ae:')) },
    tipoDe('vibraciones'),
  )
  assert.deepEqual(sinContadores.estado(() => null, sinContadores).dominio.sinRoles.sort(), ['alarmas', 'sensores'])
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

/* ── El estado y el resumen salen del TIPO (Plan 39 F1) ─────────────── */

console.log('\n── El estado y el resumen salen del tipo (Plan 39 F1) ───────')

/*
 * Se leen las dos entradas con el simulador del catálogo, en un instante EN
 * MARCHA (la simulación alterna marcha y paro cada diez minutos). Los tags de
 * la configurada son los de la escrita a mano, así que `valorSimuladoDe` les
 * da el mismo valor: lo que se compara es qué hace cada entrada con él.
 */
let instante = 0
while (!enMarchaVib(instante)) instante += 60_000
const leerSimulado = (punto) => valorSimuladoDe(punto, instante) ?? null
const tipoVib = tipoDe('vibraciones')

check('la configurada arma su estado con el tipo: bandas ISO en la velocidad eficaz y grupos por apoyo', () => {
  const est = configurada.estado(leerSimulado, configurada)
  const vrms = est.senales.filter((s) => s.clave.startsWith('vRMS_'))
  assert.equal(vrms.length, 3, 'tres velocidades eficaces, una por apoyo')
  for (const s of vrms) {
    assert.ok(s.banda, `${s.clave} sin banda ISO`)
    assert.notEqual(s.valor, null, `${s.clave} sin valor simulado`)
  }
  assert.deepEqual(est.grupos.map((g) => g.id), ['S1', 'S2', 'S3', 'variador', 'alarmas'])
  assert.equal(est.apoyos?.length, 3, 'los apoyos viajan en el estado')
})

check('sus señales llevan SU tag literal y si tienen historia', () => {
  const est = configurada.estado(leerSimulado, configurada)
  const s = est.senales.find((x) => x.clave === 'vRMS_S1')
  assert.equal(s.tag, configuracion.variables.find((v) => v.id === 'vRMS_S1').pointName)
  assert.equal(s.historia, configurada.esHistorizada('vRMS_S1'))
})

check('en el mismo instante, cada señal vale lo mismo que en la escrita a mano', () => {
  const valores = (est) => Object.fromEntries(est.senales.map((s) => [s.clave, s.valor]))
  const suya = valores(configurada.estado(leerSimulado, configurada))
  const escrita = valores(aMano.estado(leerSimulado, aMano))
  for (const [clave, valor] of Object.entries(escrita)) {
    assert.equal(suya[clave], valor, `«${clave}» difiere`)
  }
})

check('lee los contadores del área de alarmas, que no tienen rol en el tipo', () => {
  const esperados = Object.keys(contadoresDeMaquina(configuracion, tipoVib.contadoresAlarma))
  assert.ok(esperados.length > 0, 'la espejo tiene que traer los contadores del catálogo')
  const est = configurada.estado(leerSimulado, configurada)
  assert.deepEqual(Object.keys(est.dominio.alarmas).sort(), esperados.sort())
  assert.ok(!est.dominio.sinRoles.includes('alarmas'), 'con contadores leídos, «alarmas» ya no está sin rol')
})

check('el resumen para el asistente trae los apoyos redactados y la identidad de la configurada', () => {
  const est = configurada.estado(leerSimulado, configurada)
  const riesgos = tipoVib.evaluarRiesgos(est.dominio)
  const r = configurada.resumen(est, { riesgos, agrupar: (x) => x })
  assert.equal(r.sistema, configurada.id)
  assert.equal(r.configurada, true)
  assert.equal(r.puntosPedidos, configuracion.variables.length)
  assert.equal(r.apoyos.length, 3)
  for (const a of r.apoyos) assert.match(a, /velocidad eficaz \d/)
  assert.match(r.aviso, new RegExp(`sistema="${configurada.id}"`), 'el aviso remite a SU id')
})

check('sin descripción, la etiqueta lleva el apoyo, y cada señal lleva el id de la máquina', () => {
  /* Como `Nuevo-Modor` en planta: sin descripciones, y con el variador
     nombrado como lo nombra el servidor, no como lo nombra el tipo. */
  const comoEnPlanta = {
    ...configuracion,
    variables: configuracion.variables.map((v) => ({
      ...v,
      descripcion: null,
      id: v.rol?.startsWith('variador:') ? `${v.id.toUpperCase()}_BMS` : v.id,
    })),
  }
  const entrada = construirSistema(comoEnPlanta, tipoVib)
  assert.equal(entrada.etiquetaDe('vRMS_S1'), 'Velocidad eficaz · S1')
  assert.equal(entrada.etiquetaDe('vRMS_S2'), 'Velocidad eficaz · S2')
  const est = entrada.estado(leerSimulado, entrada)
  assert.ok(est.senales.some((s) => s.clave === 'FRECUENCIA_BMS'), 'la señal del variador lleva el id de la máquina')
  assert.ok(!est.senales.some((s) => s.clave === 'frecuencia'), 'y no la clave canónica del tipo')
  assert.equal(est.senales.find((s) => s.clave === 'vRMS_S1').label, 'Velocidad eficaz · S1')

  /* Y «mide» —lo que va al prompt— no repite tres veces lo que mide en tres
     apoyos: con 73 variables sin descripción, cabe en una lista corta. */
  assert.equal(new Set(entrada.mide).size, entrada.mide.length)
  assert.ok(entrada.mide.length < comoEnPlanta.variables.length / 2, `mide tiene ${entrada.mide.length} entradas`)
})

/* ── Los metadatos de cada clave, por máquina (Plan 39 F2) ──────────── */

console.log('\n── Unidad, decimales y naturaleza por clave (Plan 39 F2) ────')

check('la configurada y la escrita a mano dan la misma unidad y decimales a cada clave con serie', () => {
  for (const clave of configurada.series.historizadas()) {
    const suya = configurada.metaDe(clave)
    const escrita = aMano.metaDe(clave)
    assert.ok(suya && escrita, `${clave}: sin metadatos en alguna de las dos`)
    assert.equal(suya.unidad, escrita.unidad, `${clave}: unidad`)
    assert.equal(suya.decimales, escrita.decimales, `${clave}: decimales`)
    assert.equal(suya.naturaleza, escrita.naturaleza, `${clave}: naturaleza`)
  }
  assert.equal(configurada.metaDe('vRMS_S1').unidad, 'mm/s')
  assert.equal(configurada.metaDe('frecuencia').decimales, 2)
})

check('una bandera booleana es una «alarma» para alarma_sostenida; una medida, no', () => {
  assert.equal(configurada.metaDe('alarma_S1').naturaleza, 'alarma')
  assert.equal(aMano.metaDe('alarma_S1').naturaleza, 'alarma')
  assert.equal(configurada.metaDe('vRMS_S1').naturaleza, 'medida')
  assert.equal(configurada.metaDe('no-existe'), null)
})

/* ── La simulación es del tipo (Plan 40 F0) ─────────────────────────── */

console.log('\n── La simulación es del tipo (Plan 40 F0) ───────────────────')

check('para el mismo instante, la configurada simula cada punto como el catálogo', () => {
  let callados = 0
  for (const v of configuracion.variables) {
    const suyo = configurada.modelo(v.pointName, instante)
    const catalogo = aMano.modelo(v.pointName, instante)
    if (suyo === null) {
      /* Lo que no tiene rol (sensor) o el catálogo calla siempre (`DKW_S1`) es
         hueco en las dos, o hueco en la configurada por no tener rol. */
      assert.ok(catalogo === null || /sensor/i.test(v.id), `${v.id}: la configurada calla y el catálogo no`)
      callados += 1
      continue
    }
    assert.deepEqual(suyo, catalogo, `${v.id} difiere`)
  }
  assert.ok(callados <= 5, `${callados} puntos callados: más de los tres sensores, DKW_S1 y su calidad`)
})

check('una configurada con raíz PROPIA —tags que el catálogo no conoce— también simula', () => {
  const otra = {
    ...configuracion,
    id: 'vibraciones-otra-planta',
    assets: configuracion.assets.map((a) => ({ ...a, pointName: a.pointName.replace('TDCON/DEMO_VIBRACIONES', 'OTRA/PLANTA') })),
    variables: configuracion.variables.map((v) => ({
      ...v,
      pointName: v.pointName.replace('TDCON/DEMO_VIBRACIONES', 'OTRA/PLANTA').replace('ae:/DEMO VIBRACIONES', 'ae:/OTRA'),
    })),
  }
  const e = construirSistema(otra, tipoVib)
  const vrms = otra.variables.find((v) => v.id === 'vRMS_S3')
  const contador = otra.variables.find((v) => v.pointName.startsWith('ae:'))
  assert.equal(e.modelo(vrms.pointName, instante), configurada.modelo(configuracion.variables.find((v) => v.id === 'vRMS_S3').pointName, instante))
  assert.equal(typeof e.modelo(contador.pointName, instante), 'number', 'los contadores del área se simulan por su clave')
  assert.equal(e.modelo('ac:OTRA/PLANTA/x', instante), undefined)
})

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
  `${c.amarillo}La forma de dominio SÍ se reproduce desde el Plan 34 F3, y el estado y el resumen ` +
    `salen del tipo desde el Plan 39 F1.\nLo que queda fuera —y está declarado— es el estado del ` +
    `sensor: no sale de un rol del ` +
    `tipo.${c.reset}`
)
