#!/usr/bin/env node
/**
 * scripts/verificar-registro-configurado.mjs
 * ------------------------------------------------------------------
 * Una máquina CONFIGURADA dentro del registro, contra una escrita a mano.
 * Plan 33 F3.
 *
 * ── POR QUÉ ESTE GUION ES DE EQUIVALENCIA Y NO DE FUNCIONALIDAD ────
 *
 * Porque lo que F3 tiene que demostrar no es que `construirSistema()`
 * funcione: es que lo que produce **no se distingue** de lo que hoy escribe
 * `sistemas.js` a mano, para todo lo que consume el registro —el transporte
 * falso, el asistente, el motor de sondeo y el de diagnóstico—.
 *
 * Una entrada que «funcione» pero cumpla el contrato a medias es peor que una
 * que falle: el fallo que este proyecto ya cometió DOS veces es una máquina
 * nueva sirviendo `value: null` con calidad BUENA. La pantalla no ve un fallo;
 * ve una máquina que contesta y no dice nada.
 *
 * ── LO QUE MÁS IMPORTA AQUÍ ────────────────────────────────────────
 *
 *  1. **El contrato de tres estados de `modelo()`.** `undefined` para lo
 *     ajeno, `null` para lo propio que no entrega, valor para lo demás. Las
 *     dos primeras no son lo mismo y colapsarlas es el fallo de arriba.
 *  2. **Que un punto borrado se vea como hueco y NUNCA como otra señal.** Que
 *     la raíz encaje no basta: el catálogo tiene que reconocer el punto.
 *  3. **Que las máquinas no se crucen.** Ni por id, ni por raíz. Es
 *     `NO_COMPARTEN` aplicado a una máquina que nadie escribió a mano.
 *  4. **Que lo que no se puede hacer se DECLARE.** Una máquina sin serie
 *     verificada y sin roles mapeados es válida; lo que no puede es parecer
 *     completa.
 *
 * ── POR QUÉ NO TOCA EL REGISTRO DE VERDAD ──────────────────────────
 *
 * `registrarSistema()` muta `SISTEMAS`, y este guion registra máquinas de
 * prueba. Eso es correcto **dentro de este proceso**, que se muere al
 * terminar; lo que no haría nunca es escribirlas en disco. El registro real
 * sigue teniendo sus dos entradas en cualquier otro proceso.
 *
 * No necesita red ni servidores: entra en `npm run verificar`.
 */
import assert from 'node:assert/strict'

import {
  crearMaquina,
  crearVariable,
} from '../shared/eva/comun/configuracionMaquina.js'
import { construirSistema } from '../shared/eva/comun/construirSistema.js'
import {
  SISTEMA,
  SISTEMAS,
  SISTEMA_IDS,
  SISTEMA_IDS_EN_SERVICIO,
  parsePuntoDeSistema,
  registrarSistema,
  sistemaDePunto,
  valorSimuladoDe,
} from '../shared/eva/comun/sistemas.js'
import { tipoDe } from '../shared/eva/tipos/index.js'
import { RAIZ_VIB } from '../shared/eva/vibraciones/vibraciones.js'
import { valorVibracionEn } from '../shared/eva/vibraciones/simuladorVibraciones.js'
import { CATALOGO_VIBRACIONES } from '../shared/eva/vibraciones/catalogoDemo.js'

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

const TIPO = tipoDe('vibraciones')
const RAIZ = 'ac:PRUEBA/M02/'

/** Una configuración de prueba, con una variable historizada y otra no. */
function configuracion(id = 'vib-m02', raiz = RAIZ) {
  return crearMaquina({
    id,
    nombre: 'Motor de pruebas 02',
    tipo: 'vibraciones',
    plc: 'PLC_9 · ua:PRUEBA',
    cadenciaMs: 7_000,
    assets: [{ id: 'a1', pointName: raiz, rol: 'raiz' }],
    variables: [
      crearVariable({
        id: 'vRMS_S1',
        pointName: `${raiz}S1/vRMS`,
        rol: 'medida:vRMS',
        alias: ['la vibración del apoyo 1'],
      }),
      crearVariable({ id: 'aRMS_S1', pointName: `${raiz}S1/aRMS`, rol: 'medida:aRMS' }),
    ],
  })
}

/* La entrada bajo prueba, ya dentro del registro. */
const entrada = registrarSistema(construirSistema(configuracion(), TIPO))

/* Una escrita a mano, para comparar contra ella: el tanque, la única que
   queda desde el Plan 40 F3. */
const aMano = SISTEMA.tanque

/* ── El contrato del registro ────────────────────────────────────────── */

console.log(`\n${c.negrita}Una máquina configurada cumple el contrato del registro${c.reset}`)

check('declara todo lo que `validarRegistro` exige, igual que una escrita a mano', () => {
  for (const campo of [
    'raices', 'puntos', 'parse', 'modelo', 'estado', 'resumen', 'claves', 'series',
  ]) {
    assert.ok(entrada[campo] !== undefined && entrada[campo] !== null, `falta ${campo}`)
    assert.equal(
      typeof entrada[campo],
      typeof aMano[campo],
      `${campo} tiene otro tipo que en la escrita a mano`
    )
  }
})

check('`series.punto` es una función, que es lo que el registro exige', () => {
  assert.equal(typeof entrada.series.punto, 'function')
})

check('declara su nota de historia: el silencio se leería como que sí la tiene', () => {
  assert.ok(entrada.series.nota, 'sin nota')
  assert.match(entrada.series.nota, /ninguna variable|serie propia/i)
})

check('entró en SISTEMAS, en SISTEMA y en las listas de ids', () => {
  assert.ok(SISTEMAS.includes(entrada))
  assert.equal(SISTEMA['vib-m02'], entrada)
  assert.ok(SISTEMA_IDS.includes('vib-m02'))
  assert.ok(SISTEMA_IDS_EN_SERVICIO.includes('vib-m02'))
})

/* ── El contrato de tres estados ─────────────────────────────────────── */

console.log(`\n${c.negrita}El contrato de tres estados de \`modelo()\`${c.reset}`)

/*
 * Es la comprobación más importante del guion. Colapsar `undefined` y `null`
 * es el fallo que este proyecto ya cometió dos veces.
 */
check('un punto AJENO devuelve `undefined`, no `null`', () => {
  assert.equal(entrada.modelo('ac:OTRA/COSA/x'), undefined)
  assert.equal(valorSimuladoDe('ac:OTRA/COSA/x'), undefined)
})

check('un punto PROPIO que no se puede simular devuelve `null`, nunca 0', () => {
  /* Esta variable tiene rol de apoyo pero NO apoyo (`assetId`): la física del
     tipo es POR apoyo, así que no hay qué simular. Hueco, no un valor de un
     apoyo cualquiera ni un cero. */
  const v = entrada.modelo(`${RAIZ}S1/vRMS`)
  assert.equal(v, null)
  assert.notEqual(v, 0, 'un 0 pintaría la máquina «a cero» en vez de sin datos')
})

check('un punto PROPIO con rol y apoyo se simula con la física del TIPO (Plan 40 F0)', () => {
  /*
   * Hasta el 21-09-2026 una configurada no simulaba nunca: «nadie ha escrito
   * su física». La física era del tipo desde el principio; sólo sabía leer
   * los tags de la escrita a mano. Ahora la entrada traduce cada variable a
   * su descriptor por rol y apoyo, y el mismo instante da el mismo valor que
   * el catálogo para el apoyo equivalente.
   */
  const conApoyo = configuracion('vib-m02-simula', 'ac:PRUEBA/M02S/')
  conApoyo.assets.push({ id: 'S3', pointName: 'ac:PRUEBA/M02S/S3/', rol: 'secundario' })
  for (const v of conApoyo.variables) v.assetId = 'S3'
  const e = construirSistema(conApoyo, TIPO)
  let t = 1_700_000_000_000
  while (valorVibracionEn(`${RAIZ_VIB}S3/vRMS_S3`, t) === null) t += 60_000
  const simulado = e.modelo('ac:PRUEBA/M02S/S1/vRMS', t)
  assert.equal(typeof simulado, 'number', `esperaba un número, salió ${simulado}`)
  assert.equal(simulado, valorVibracionEn(`${RAIZ_VIB}S3/vRMS_S3`, t), 'la física es la del apoyo S3 del tipo')
  assert.equal(e.modelo('ac:PRUEBA/M02S/nada', t), undefined, 'lo ajeno sigue siendo undefined')
})

check('`valorSimuladoDe` distingue las dos por el registro', () => {
  assert.equal(valorSimuladoDe(`${RAIZ}S1/vRMS`), null)
  assert.equal(valorSimuladoDe('ac:NADIE/x'), undefined)
})

/*
 * Que la raíz encaje no basta: un tag borrado en el servidor sigue empezando
 * por la raíz correcta, y tiene que verse como dato ausente.
 */
check('un punto BORRADO bajo su raíz da `null` en parse, no otra señal', () => {
  assert.equal(entrada.parse(`${RAIZ}S1/BORRADO`), null)
  assert.equal(parsePuntoDeSistema(`${RAIZ}S1/BORRADO`), null)
  /* Pero la raíz SÍ es suya: el punto pertenece a la máquina aunque el
     catálogo no lo reconozca, y eso es lo que hay que poder distinguir. */
  assert.equal(sistemaDePunto(`${RAIZ}S1/BORRADO`)?.id, 'vib-m02')
})

check('la identidad del sistema viaja PEGADA al punto', () => {
  const d = parsePuntoDeSistema(`${RAIZ}S1/vRMS`)
  assert.equal(d.sistema, 'vib-m02')
  assert.equal(d.clave, 'vRMS_S1')
})

/* ── El estado, en la forma común ────────────────────────────────────── */

console.log(`\n${c.negrita}El estado${c.reset}`)

/*
 * ── QUÉ ES «LA MISMA FORMA», Y QUÉ NO ──────────────────────────────
 *
 * No todos los campos de vibraciones: ese estado trae `normaAplicable` y
 * `canal`, que son suyos —ISO 10816 y los tres apoyos— y exigírselos a una
 * máquina configurada sería exigir que TODA máquina sea vibraciones.
 *
 * El contrato es lo que el tanque (la única escrita a mano desde el Plan 40
 * F3) y el catálogo de la demo de vibraciones tienen en común. Se calcula
 * intersecando en vez de escribir la lista, para que un campo que mañana pase
 * a ser común entre ellas quede exigido aquí sin que nadie se acuerde de
 * venir.
 */
const NUCLEO_COMUN = (() => {
  const deTanque = Object.keys(SISTEMA.tanque.estado(() => null, SISTEMA.tanque))
  const deVib = Object.keys(CATALOGO_VIBRACIONES.estado(() => null, CATALOGO_VIBRACIONES))
  return deTanque.filter((k) => deVib.includes(k))
})()

check('produce el NÚCLEO COMÚN del tanque y del catálogo de vibraciones', () => {
  const est = entrada.estado(() => 1.23, entrada, '2026-09-18T12:00:00Z')
  assert.ok(NUCLEO_COMUN.length >= 14, `el núcleo común salió de ${NUCLEO_COMUN.length} campos`)

  for (const campo of NUCLEO_COMUN) {
    assert.ok(campo in est, `al estado configurado le falta «${campo}»`)
  }
})

/*
 * ── EL CAMPO QUE COSTÓ UN HALLAZGO ─────────────────────────────────
 *
 * `dominio` tiene que ESTAR y valer `null`, no faltar. Ausente es
 * indistinguible de un descuido; presente y nulo dice «esta máquina no tiene
 * forma de dominio».
 *
 * Importa porque `evaluarRiesgosDe` lo lee: medido el 18-09-2026, pasarle un
 * dominio vacío a `evaluarRiesgosVibracion` devuelve TRES riesgos activos
 * —`dkw-sin-referencia`, una regla que dispara ante la ausencia de dato—.
 * Afirmarlos sobre una máquina configurada sería hablar de tres apoyos que no
 * existen.
 */
check('`dominio` viaja explícito, y con roles se RECONSTRUYE (Plan 34 F3)', () => {
  /*
   * Hasta el 21-09-2026 esto exigía `dominio: null` y una máquina configurada
   * no diagnosticaba. Desde F3 se reconstruye desde los roles, así que esta
   * máquina —que declara `medida:vRMS` y `medida:aRMS`— sí trae forma.
   *
   * Lo que NO cambia es que la propiedad tenga que ESTAR: ausente es
   * indistinguible de un descuido.
   */
  const est = entrada.estado(() => 1.23, entrada)
  assert.ok('dominio' in est, 'sin la propiedad, `undefined` parece un descuido')
  assert.ok(est.dominio, 'declara roles: tendría que haber reconstruido su dominio')
  assert.ok(est.dominio.canales, 'sin `canales` las reglas de apoyo no leen nada')
  assert.ok(est.dominio.variador, 'sin `variador` las reglas de máquina no leen nada')
})

check('una máquina SIN roles sigue dando `dominio: null`', () => {
  /*
   * La guarda de `evaluarRiesgosDe` no se retira: sin roles no hay con qué
   * reconstruir, y un dominio a medias es peor que ninguno. Medido el
   * 18-09-2026, un dominio vacío devuelve TRES riesgos activos
   * —`dkw-sin-referencia`, una regla que dispara ante la ausencia de dato—, y
   * afirmarlos sería hablar de apoyos que nadie declaró.
   */
  const cfg = configuracion()
  const pelada = construirSistema(
    { ...cfg, id: `${cfg.id}-sin-roles`, variables: cfg.variables.map(v => ({ ...v, rol: null })) },
    TIPO,
  )
  const est = pelada.estado(() => 1.23, pelada)
  assert.ok('dominio' in est)
  assert.equal(est.dominio, null)
})

/*
 * «29 de 73 no contestan» es la frase que separa una pantalla en verde de una
 * ciega. Sin `sinLectura` y `puntosPedidos` no se puede decir.
 */
check('los puntos mudos se CUENTAN, no se deducen', () => {
  const mudo = entrada.estado(() => null, entrada)
  assert.equal(mudo.sinLectura.length, 2)
  assert.equal(mudo.puntosPedidos, 2)
  assert.ok(mudo.senales[0].motivo, 'un hueco sin motivo no explica nada')
})

check('un hueco NO se disfraza de cero', () => {
  const mudo = entrada.estado(() => null, entrada)
  for (const s of mudo.senales) {
    assert.equal(s.valor, null, `${s.clave} llegó como ${s.valor} en vez de hueco`)
  }
})

check('una banda no se inventa sin umbrales calibrados', () => {
  /*
   * Esta variable tiene rol pero NO apoyo (`assetId`): el tipo no puede
   * colocarla en su dominio y sale sin criterio, como una señal suelta. Una
   * banda aquí sería inventada.
   */
  const est = entrada.estado(() => 999, entrada)
  assert.equal(est.senales[0].banda, null)
  assert.equal(est.senales[0].estado, null)
})

check('la banda que SÍ sale es la de la norma del tipo, y sólo donde hay norma (Plan 39 F1)', () => {
  /* La misma máquina, con su apoyo declarado: el tipo la coloca en S1 y la
     velocidad eficaz lleva ISO 10816; la aceleración, que ninguna norma
     acota, sigue sin banda. */
  const conApoyo = configuracion('vib-m02-apoyo', 'ac:PRUEBA/M02B/')
  conApoyo.assets.push({ id: 'S1', pointName: 'ac:PRUEBA/M02B/S1/', rol: 'secundario' })
  for (const v of conApoyo.variables) v.assetId = 'S1'
  /* La norma sólo aplica si se sabe la velocidad: sin variador, el veredicto
     es «no se sabe», no «zona D». Se declara la velocidad para poder juzgar. */
  conApoyo.variables.push(
    crearVariable({ id: 'velocidad', pointName: 'ac:PRUEBA/M02B/V20/velocidad', rol: 'variador:velocidad' }),
  )
  const est = construirSistema(conApoyo, TIPO).estado(() => 999, null)
  const vrms = est.senales.find((s) => s.clave === 'vRMS_S1')
  const arms = est.senales.find((s) => s.clave === 'aRMS_S1')
  assert.ok(vrms.banda, 'la velocidad eficaz lleva la banda ISO del tipo')
  assert.equal(vrms.estado, 'critico', `999 mm/s a 999 rpm es zona D (salió ${vrms.estado})`)
  assert.equal(arms.banda, null, 'la aceleración no tiene norma que la acote')
  assert.equal(est.senales.length, 3, 'y no aparece ninguna señal que la máquina no declare')

  /* Sin la velocidad, el mismo 999 no se juzga: la norma no se sabe si aplica. */
  const sinVelocidad = construirSistema(
    { ...conApoyo, id: 'vib-m02-sin-velocidad', variables: conApoyo.variables.filter((v) => v.id !== 'velocidad') },
    TIPO,
  ).estado(() => 999, null)
  assert.equal(sinVelocidad.senales.find((s) => s.clave === 'vRMS_S1').estado, null)
})

check('el rol del tipo aporta etiqueta y unidad reales', () => {
  const est = entrada.estado(() => 1, entrada)
  const vrms = est.senales.find((s) => s.clave === 'vRMS_S1')
  assert.equal(vrms.label, 'Velocidad eficaz')
  assert.equal(vrms.unidad, 'mm/s')
})

/* ── Lo que NO puede hacer, declarado ────────────────────────────────── */

console.log(`\n${c.negrita}Lo que no puede hacer, dicho en voz alta${c.reset}`)

/*
 * Una máquina recién configurada es válida y está casi ciega. Lo que no puede
 * es parecer completa: «no hay riesgos» de una máquina cuyas reglas nunca se
 * evaluaron es la peor respuesta posible.
 */
/*
 * La otra mitad del hallazgo de `dominio`. Aquí se comprueba el motor de
 * reglas DIRECTAMENTE: que devuelva riesgos sobre un dominio vacío es
 * correcto para las reglas que vigilan la ausencia, y es exactamente por lo
 * que una máquina configurada no puede pasar por ahí.
 *
 * Si algún día `evaluarRiesgosVibracion` dejara de devolver nada ante un
 * dominio vacío, esta comprobación fallaría y habría que releer la guarda de
 * `evaluarRiesgosDe`: dejaría de hacer falta, o haría falta por otro motivo.
 */
check('el motor SÍ dispara con un dominio vacío: por eso hay que no llamarlo', () => {
  const { activos } = TIPO.evaluarRiesgos({})
  assert.ok(
    activos.length > 0,
    'si el motor ya no afirma nada con un dominio vacío, revisa la guarda de evaluarRiesgosDe'
  )
  assert.ok(activos.every((a) => a.id === 'dkw-sin-referencia'))
})

check('declara que sus reglas no se evalúan por roles sin mapear', () => {
  assert.ok(
    entrada.limitaciones.some((l) => /no se pudo mirar|NO se evalúan/i.test(l)),
    'no confiesa que las reglas no se evalúan'
  )
})

check('declara que no tiene historia verificada', () => {
  assert.ok(entrada.limitaciones.some((l) => /serie histórica verificada/i.test(l)))
})

check('declara que sobre ella sólo se lee', () => {
  assert.ok(entrada.limitaciones.some((l) => /sólo se lee/i.test(l)))
})

/*
 * Ofrecer una herramienta que se va a negar gasta un turno del modelo para
 * llegar al mismo sitio.
 */
check('no ofrece `historia_de_senal` sin serie verificada', () => {
  assert.ok(!entrada.herramientas.includes('historia_de_senal'))
  assert.ok(entrada.herramientas.includes('estado_del_sistema'))
})

check('sin serie verificada, `esHistorizada` dice que no a todo', () => {
  for (const clave of entrada.claves()) {
    assert.equal(entrada.esHistorizada(clave), false)
  }
  assert.deepEqual(entrada.series.historizadas(), [])
})

/*
 * El servidor contesta afirmativamente y devuelve la serie de OTRA señal —
 * medido en las dos máquinas escritas a mano. Por eso sólo cuentan las
 * verificadas.
 */
check('una serie DECLARADA y no verificada NO cuenta como historia', () => {
  const cfg = configuracion('vib-prometida', 'ac:PRUEBA/M03/')
  cfg.variables[0].historyPointName = 'hda:inventado'
  const e = construirSistema(cfg, TIPO)

  assert.deepEqual(e.series.historizadas(), [], 'prometió una serie sin verificar')
  assert.equal(e.esHistorizada('vRMS_S1'), false)
})

check('una serie VERIFICADA sí cuenta, y trae su punto literal', () => {
  const cfg = configuracion('vib-con-serie', 'ac:PRUEBA/M04/')
  cfg.variables[0].historyPointName = 'hda:\\Configuration\\DEMO 3:vRMS_S1'
  cfg.variables[0].historyVerified = true
  const e = construirSistema(cfg, TIPO)

  assert.deepEqual(e.series.historizadas(), ['vRMS_S1'])
  assert.equal(e.series.punto('vRMS_S1'), 'hda:\\Configuration\\DEMO 3:vRMS_S1')
  assert.ok(e.herramientas.includes('historia_de_senal'))
})

/* ── Que no se crucen las máquinas ───────────────────────────────────── */

console.log(`\n${c.negrita}Dos máquinas no se cruzan${c.reset}`)

check('un id repetido se RECHAZA al registrar', () => {
  assert.throws(
    () => registrarSistema(construirSistema(configuracion('vib-m02', 'ac:OTRA/'), TIPO)),
    /ya hay un sistema con el id/
  )
})

/*
 * `sistemaDePunto()` devuelve la PRIMERA cuya raíz encaja: un solape hace que
 * los puntos de una se atribuyan a la otra de forma estable, así que ni
 * siquiera parece intermitente.
 */
check('una raíz que se solapa se RECHAZA, en los dos sentidos', () => {
  assert.throws(
    () => registrarSistema(construirSistema(configuracion('vib-dentro', `${RAIZ}S1/`), TIPO)),
    /se solapa/
  )
  assert.throws(
    () => registrarSistema(construirSistema(configuracion('vib-fuera', 'ac:PRUEBA/'), TIPO)),
    /se solapa/
  )
})

check('no se solapa con las escritas a mano tampoco', () => {
  const [raizVib] = aMano.raices
  assert.throws(
    () => registrarSistema(construirSistema(configuracion('vib-choca', raizVib), TIPO)),
    /se solapa/
  )
})

check('los puntos de la configurada NO caen en otra máquina', () => {
  for (const punto of entrada.puntos()) {
    assert.equal(sistemaDePunto(punto).id, 'vib-m02', `${punto} se atribuyó a otra máquina`)
  }
})

check('y los de la escrita a mano siguen siendo suyos', () => {
  for (const s of [SISTEMA.tanque]) {
    const muestra = s.puntos().slice(0, 5)
    for (const punto of muestra) {
      assert.equal(sistemaDePunto(punto).id, s.id, `${punto} cambió de dueño`)
    }
  }
})

/* ── Las guardas de construcción ─────────────────────────────────────── */

console.log(`\n${c.negrita}Lo que no se puede construir${c.reset}`)

console.log(`\n${c.negrita}Lo que la validación sabe, en las limitaciones (Plan 39 F6)${c.reset}`)

check('sin revisar (UNKNOWN, sin fecha): lo dice, con cuántos puntos', () => {
  const e = construirSistema(configuracion('sin-revisar', 'ac:SR/'), tipoDe('vibraciones'))
  assert.ok(e.limitaciones.some((l) => /Sin revisar todavía: 2 puntos declarados/.test(l)))
})

/*
 * Esta comprobación esperaba «La última revisión (día) NO PUDO COMPROBAR esta
 * máquina contra ICONICS», y con ella daba por bueno un texto que el código no
 * puede producir honestamente (Plan 45 F2.3): un fallo de red deja `UNKNOWN`
 * SIN anotar, a propósito. Un `UNKNOWN` con fecha sólo sale de editar la
 * máquina —que retira el veredicto— y sondearla después. Eso es una
 * configuración sin contrastar, no una avería observada, y así se dice.
 */
check('UNKNOWN con fecha: se editó y nadie la volvió a comprobar', () => {
  const m = { ...configuracion('sin-red', 'ac:SN/'), estado: 'UNKNOWN', revisada: '2026-09-21T08:00:00.000Z' }
  const e = construirSistema(m, tipoDe('vibraciones'))
  assert.ok(e.limitaciones.some((l) => /Sin comprobar contra ICONICS desde que cambió su lista de variables/.test(l)))
  assert.ok(e.limitaciones.some((l) => /la última revisión es del 2026-09-21/.test(l)))
  /* Y NO dice que se intentara y fallara: eso sería afirmar una avería que
     nadie observó, que es lo que este arreglo quitó. */
  assert.ok(!e.limitaciones.some((l) => /no pudo comprobar/.test(l)))
  assert.ok(!e.limitaciones.some((l) => /Sin revisar todavía/.test(l)))
})

check('DEGRADED: cuántos puntos faltan y cuáles, y que salen sin dato', () => {
  const base = configuracion('coja', 'ac:CJ/')
  const m = {
    ...base,
    estado: 'DEGRADED',
    revisada: '2026-09-22T10:00:00.000Z',
    variables: base.variables.map((v, i) => ({ ...v, estado: i === 0 ? 'INVALID' : 'VALID' })),
  }
  const e = construirSistema(m, tipoDe('vibraciones'))
  const l = e.limitaciones.find((x) => /puntos ausentes/.test(x))
  assert.ok(l, 'no confesó los ausentes')
  assert.match(l, /1 de 2 puntos ausentes en la última revisión \(2026-09-22\): vRMS_S1\./)
  assert.match(l, /sin dato, no como cero/)
})

check('VALID: ninguna limitación de revisión; lo comprobado no se disculpa', () => {
  const m = { ...configuracion('sana', 'ac:SA/'), estado: 'VALID', revisada: '2026-09-22T10:00:00.000Z' }
  const e = construirSistema(m, tipoDe('vibraciones'))
  assert.ok(!e.limitaciones.some((l) => /Sin revisar|no pudo comprobar|puntos ausentes/.test(l)))
})

check('series declaradas no verificadas: se cuentan, y no se ofrecen como historia', () => {
  const base = configuracion('medio-sondeada', 'ac:MS/')
  const m = {
    ...base,
    variables: base.variables.map((v, i) => ({
      ...v,
      historyPointName: `hda:\\X\\${v.id}`,
      historyVerified: i === 0,
    })),
  }
  const e = construirSistema(m, tipoDe('vibraciones'))
  /* «no están verificadas», no «sin sondear»: la variable no sabe si se
     sondeó, sólo si quedó verificada (ver `construirSistema.js`). */
  assert.ok(e.limitaciones.some((l) => /1 de 2 series declaradas no están verificadas/.test(l)))
  assert.deepEqual([...e.series.historizadas()], ['vRMS_S1'])
})

check('sin tipo, `construirSistema` se niega', () => {
  assert.throws(() => construirSistema(configuracion('x', 'ac:X/'), null), /no se pasó un tipo/)
})

check('sin id, se niega', () => {
  assert.throws(() => construirSistema({ tipo: 'vibraciones' }, TIPO), /no trae `id`/)
})

check('respeta la cadencia declarada, sin imponer la suya', () => {
  assert.equal(entrada.cadenciaMs, 7_000)
})

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(
    `${c.gris}Revisa shared/eva/comun/construirSistema.js y registrarSistema() ` +
      `en sistemas.js.${c.reset}`
  )
  process.exit(1)
}

console.log(
  `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: una máquina configurada se ` +
    `comporta como una escrita a mano.${c.reset}`
)
