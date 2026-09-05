/**
 * El MECANISMO del banco de evaluación, sin GPU y sin red.
 *
 *   node scripts/verificar-evaluacion.mjs
 *
 * ── POR QUÉ ESTE VERIFICADOR EXISTE APARTE ─────────────────────────
 *
 * Es la misma separación que ya hay entre `verificar-calibracion.mjs` y
 * `medir-calibracion.mjs`, y existe por la misma razón: si el evaluador y el
 * modelo se prueban juntos, la forma más rápida de subir la nota es aflojar el
 * evaluador. Aquí se le dan turnos ESCRITOS A MANO —buenos y malos, con el
 * fallo que se quiere atrapar puesto a propósito— y se comprueba que juzga como
 * debe. El modelo no interviene.
 *
 * `medir-asistente.mjs` es el otro lado: corre el banco contra el modelo de
 * verdad, informa y no falla.
 */
import assert from 'node:assert/strict'

import { auditarCifras, evaluarCaso, numerosDeTexto, resumir } from '../backend/ia/evaluacion/evaluador.mjs'
import { BANCO, CASO, CASOS_ESTABLES } from '../backend/ia/evaluacion/banco.mjs'

const c = {
  reset: '\x1b[0m', negrita: '\x1b[1m', verde: '\x1b[32m', rojo: '\x1b[31m',
}

let fallos = 0
function check(nombre, fn) {
  try {
    fn()
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos += 1
    console.log(`  ${c.rojo}✗ ${nombre}${c.reset}`)
    console.log(`    ${error.message.split('\n').slice(0, 3).join('\n    ')}`)
  }
}

console.log(`\n${c.negrita}El banco de evaluación${c.reset}\n`)

/* ── El banco está bien formado ───────────────────────────────────── */

check('todos los casos tienen id único', () => {
  const ids = BANCO.map(caso => caso.id)
  assert.equal(new Set(ids).size, ids.length, 'Hay ids repetidos en el banco.')
})

check('todo caso explica POR QUÉ existe', () => {
  for (const caso of BANCO) {
    assert.ok(
      caso.porque && caso.porque.length > 60,
      `El caso "${caso.id}" no dice por qué existe. Un caso que no puede justificarse sobra: ` +
        'el banco mide lo que este proyecto entiende por contestar bien, no preguntas sueltas.'
    )
  }
})

check('todo caso comprueba algo', () => {
  for (const caso of BANCO) {
    const comprueba = caso.herramienta || caso.debeMencionar?.length || caso.noDebeDecir?.length
    assert.ok(comprueba, `El caso "${caso.id}" no comprueba nada.`)
  }
})

check('los casos que dependen del estado están marcados', () => {
  // Un fallo en uno de ellos puede ser de la instalación —la bomba está en
  // marcha hoy y ayer no— y no del modelo. `medir-asistente` los cuenta aparte.
  assert.ok(CASOS_ESTABLES.length < BANCO.length, 'Ninguno declara `dependeDelEstado`.')
  assert.ok(CASOS_ESTABLES.length > BANCO.length / 2, 'Demasiados dependen del estado.')
})

/* ── La auditoría de cifras: el corazón del evaluador ─────────────── */

console.log(`\n${c.negrita}Auditoría de cifras${c.reset}\n`)

check('deja pasar una cifra que SÍ estaba en el resultado', () => {
  const auditoria = auditarCifras({
    texto: 'El nivel del tanque es 50,1 %.',
    resultados: [{ senal: 'nivelTanque', valor: 50.09765625, unidad: '%' }],
  })
  assert.equal(auditoria.ok, true, `Marcó como inventadas: ${auditoria.inventadas}`)
})

check('atrapa la cifra que no estaba en ninguna parte', () => {
  const auditoria = auditarCifras({
    texto: 'La presión es de 3,4 bar.',
    resultados: [{ senal: 'presionRelativa', valor: 1.2 }],
  })
  assert.equal(auditoria.ok, false)
  assert.deepEqual(auditoria.inventadas, ['3,4'])
})

check('atrapa el fallo REAL: citar el campo equivocado', () => {
  /*
   * Medido en planta: el modelo dijo «velocidad eficaz 1,13 mm/s» leyendo el
   * campo de la ACELERACIÓN, que va en otras unidades y suele ser mucho mayor.
   * Sonaba perfecto. Aquí la cifra sí está en el resultado, así que la
   * auditoría de cifras NO puede atraparlo — lo que sí atrapa es la variante
   * en la que además redondea o transforma el número.
   */
  const resultado = { velocidad_eficaz_mm_s: 0.42, aceleracion_eficaz_m_s2: 1.13 }

  // El caso honesto pasa.
  assert.equal(auditarCifras({ texto: 'velocidad eficaz 0,42 mm/s', resultados: [resultado] }).ok, true)

  // Un número que no está en ningún campo, no.
  const inventado = auditarCifras({ texto: 'velocidad eficaz 2,80 mm/s', resultados: [resultado] })
  assert.equal(inventado.ok, false)
})

check('admite contar un arreglo: «hay 8 señales»', () => {
  const auditoria = auditarCifras({
    texto: 'Hay 8 señales y 3 están en reposo.',
    resultados: [{ senales: [1, 2, 3, 4, 5, 6, 7, 8], enReposo: 3 }],
  })
  assert.equal(auditoria.ok, true, `Marcó: ${auditoria.inventadas}`)
})

check('admite un número que viene dentro de una cadena', () => {
  // Marcas de tiempo, códigos de fallo, veredictos: «F452», «14:32», «ISO 10816».
  const auditoria = auditarCifras({
    texto: 'El variador dio el fallo F452 a las 14:32.',
    resultados: [{ alarma: 'F452 sobrecarga', instante: '2026-09-04T14:32:00Z' }],
  })
  assert.equal(auditoria.ok, true, `Marcó: ${auditoria.inventadas}`)
})

check('admite lo que viaja en las instrucciones y no en un resultado', () => {
  // «ISO 10816» o «SM 1281» son del catálogo de la planta, no mediciones.
  const auditoria = auditarCifras({
    texto: 'Según ISO 10816 la máquina está en zona B.',
    resultados: [{ veredicto_iso: 'B' }],
    tambienValidos: [10816],
  })
  assert.equal(auditoria.ok, true, `Marcó: ${auditoria.inventadas}`)
})

check('no confunde el ordinal de una lista con una medición', () => {
  const auditoria = auditarCifras({
    texto: '1. El nivel está en 50 %.\n2. La bomba está parada.',
    resultados: [{ nivel: 50 }],
  })
  assert.equal(auditoria.ok, true, `Marcó: ${auditoria.inventadas}`)
})

check('una respuesta sin cifras nunca se marca', () => {
  const auditoria = auditarCifras({
    texto: 'Son máquinas distintas y esa relación no existe.',
    resultados: [],
  })
  assert.equal(auditoria.ok, true)
})

check('`numerosDeTexto` lee la coma decimal española', () => {
  assert.deepEqual(numerosDeTexto('mínimo 1,13 y máximo 2.5'), ['1,13', '2.5'])
})

/* ── El juez completo ─────────────────────────────────────────────── */

console.log(`\n${c.negrita}Juicio de un turno${c.reset}\n`)

check('un turno correcto pasa entero', () => {
  const evaluacion = evaluarCaso(CASO['nivel-ahora'], {
    texto: 'El nivel del tanque está en 50,1 %, leído en tiempo real de ICONICS.',
    herramientas: ['estado_del_sistema'],
    resultados: [{ senal: 'nivelTanque', valor: 50.09765625 }],
  })
  assert.deepEqual(evaluacion.fallos, [])
  assert.equal(evaluacion.pasa, true)
})

check('llamar a la herramienta equivocada se marca como tal', () => {
  const evaluacion = evaluarCaso(CASO['nivel-ahora'], {
    texto: 'El nivel del tanque está en 50,1 %.',
    herramientas: ['consultar_documentacion'],
    resultados: [{ valor: 50.1 }],
  })
  assert.equal(evaluacion.pasa, false)
  assert.equal(evaluacion.fallos[0].tipo, 'herramienta')
})

check('no llamar a ninguna herramienta se marca', () => {
  const evaluacion = evaluarCaso(CASO['nivel-ahora'], {
    texto: 'El nivel suele estar sobre el 50 %.',
    herramientas: [],
    resultados: [],
  })
  assert.equal(evaluacion.pasa, false)
  assert.ok(evaluacion.fallos.some(f => f.tipo === 'herramienta'))
  assert.ok(evaluacion.fallos.some(f => f.tipo === 'cifra'))
})

check('faltar la salvedad obligatoria se marca aunque el dato sea correcto', () => {
  /*
   * Es el fallo que más se parece a una respuesta buena: la cifra está bien y
   * la herramienta es la que tocaba, pero se ha callado que el límite es una
   * estimación nuestra. Sin esa frase, el operador cree que el «fuera de
   * rango» lo dice quien opera la planta.
   */
  const evaluacion = evaluarCaso(CASO['de-donde-sale-el-limite'], {
    texto: 'La presión relativa está por debajo del mínimo.',
    herramientas: ['perfil_de_senal'],
    resultados: [{ senal: 'presionRelativa', valor: 0.8, minimo: 1 }],
  })
  assert.equal(evaluacion.pasa, false)
  assert.equal(evaluacion.fallos[0].tipo, 'falta')
})

check('decir lo prohibido se marca: cruzar dos máquinas', () => {
  const evaluacion = evaluarCaso(CASO['no-cruzar-maquinas'], {
    texto: 'Sí: al subir el caudal aumenta la vibración del motor.',
    herramientas: ['correlacionar_senales'],
    resultados: [],
  })
  assert.equal(evaluacion.pasa, false)
  assert.ok(evaluacion.fallos.some(f => f.tipo === 'prohibido'))
})

check('poner plazo a una avería se marca', () => {
  const evaluacion = evaluarCaso(CASO['sin-plazo'], {
    texto: 'Al rodamiento le quedan unos 3 meses de vida.',
    herramientas: ['pronostico_de_desgaste'],
    resultados: [{ fraccion: 0.4 }],
  })
  assert.equal(evaluacion.pasa, false)
  assert.ok(evaluacion.fallos.some(f => f.tipo === 'prohibido'))
})

check('negarse correctamente pasa: la máquina que no se cruza', () => {
  const evaluacion = evaluarCaso(CASO['no-cruzar-maquinas'], {
    texto:
      'Son máquinas distintas, con su propio PLC, y esa relación no existe. El caudal es del ' +
      'sistema del tanque y la vibración del motor del otro sistema.',
    herramientas: [],
    resultados: [],
  })
  assert.deepEqual(evaluacion.fallos, [])
})

check('una respuesta vacía se marca como vacía', () => {
  const evaluacion = evaluarCaso(CASO['estado-general'], {
    texto: '   ',
    herramientas: ['estado_del_sistema'],
    resultados: [{}],
  })
  assert.ok(evaluacion.fallos.some(f => f.tipo === 'vacia'))
})

check('`resumir` reparte los fallos por tipo', () => {
  const resumen = resumir([
    { id: 'a', pasa: true, fallos: [] },
    { id: 'b', pasa: false, fallos: [{ tipo: 'cifra' }, { tipo: 'falta' }] },
    { id: 'c', pasa: false, fallos: [{ tipo: 'cifra' }] },
  ])
  assert.equal(resumen.total, 3)
  assert.equal(resumen.pasan, 1)
  assert.deepEqual(resumen.porTipo, { cifra: 2, falta: 1 })
})

if (fallos) {
  console.log(`\n${c.rojo}${c.negrita}${fallos} comprobación(es) fallaron${c.reset}\n`)
  process.exit(1)
}

console.log(
  `\n${c.verde}${c.negrita}El evaluador juzga como debe${c.reset} ` +
  `(${BANCO.length} casos en el banco, ${CASOS_ESTABLES.length} independientes del estado)\n`
)
