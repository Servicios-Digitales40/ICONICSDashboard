#!/usr/bin/env node
/**
 * scripts/verificar-aprendizaje.mjs
 * ------------------------------------------------------------------
 * El almacén de lo aprendido y el ciclo de propuestas, sin servidor.
 *
 * ── QUÉ SE PROTEGE AQUÍ ────────────────────────────────────────────
 *
 * Una sola cosa, y todo lo demás está a su servicio: **que una propuesta del
 * asistente no se convierta en una regla sin que una persona la haya visto**.
 *
 * El fallo que estas comprobaciones existen para impedir no es que el sistema
 * reviente —eso se ve—, es que alguien se quede tranquilo creyendo que hay una
 * vigilancia que nadie ha aprobado. Una regla inventada por un modelo, con su
 * texto bien redactado y su severidad puesta, es indistinguible de una buena
 * mirando la pantalla.
 *
 * ── USO ───────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-aprendizaje.mjs
 */
import assert from 'node:assert/strict'

import {
  ESTADOS,
  HECHOS_INICIALES,
  crearHecho,
  crearPropuesta,
  hechosVigentes,
  normalizarAlmacen,
  pendientes,
  validarPropuesta,
} from '../shared/eva/comun/aprendizaje.js'

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

/** Una propuesta completa y utilizable, sobre la que estropear un campo. */
const BUENA = {
  titulo: 'La bomba arranca y para muchas veces seguidas',
  sistema: 'tanque',
  severidad: 'atencion',
  condicion: 'Más de seis arranques en una hora con el tanque por encima del 40 %',
  senales: ['cargaMotor', 'nivelTanque'],
  evidencia:
    'En los últimos 14 días hubo 9 días con más de seis arranques por hora, con el nivel ' +
    'entre el 42 % y el 58 %.',
  consecuencia:
    'El arranque es el momento en que más sufre el motor: cada uno mete una punta de ' +
    'corriente y calienta el devanado sin que el ventilador llegue a refrigerar.',
  accion: 'Revisar la histéresis del lazo de nivel.',
}

/* ── El estado de una propuesta ────────────────────────────────────── */

console.log(`\n${c.negrita}── Una propuesta no puede colarse como regla ────────────────${c.reset}`)

check('nace SIEMPRE pendiente, diga lo que diga quien la crea', () => {
  /*
   * Ésta es LA comprobación. Si el asistente pudiera decidir el estado, podría
   * marcar su propia propuesta como aprobada y la revisión humana dejaría de
   * existir sin que nadie lo notara: la pantalla se vería igual.
   */
  const p = crearPropuesta({ ...BUENA, estado: 'aprobada' })
  assert.equal(p.estado, 'pendiente', 'el estado del que llama se ignora')

  const q = crearPropuesta({ ...BUENA, estado: 'aplicada' })
  assert.equal(q.estado, 'pendiente')
})

check('los estados posibles son los cuatro del ciclo, y no más', () => {
  assert.deepEqual(ESTADOS, ['pendiente', 'aprobada', 'rechazada', 'aplicada'])
})

check('«aprobada» no es «aplicada»: son dos pasos', () => {
  /*
   * Aprobar dice «esta idea es buena». Aplicar dice «ya está escrita como
   * código con su prueba». Fundirlos haría que una idea aprobada pareciera una
   * vigilancia en marcha, y no lo es.
   */
  const almacen = normalizarAlmacen({
    propuestas: [
      { ...crearPropuesta(BUENA), estado: 'aprobada' },
      { ...crearPropuesta(BUENA), estado: 'pendiente' },
    ],
  })
  assert.equal(pendientes(almacen).length, 1, 'una aprobada ya no está pendiente')
  assert.notEqual(ESTADOS.indexOf('aprobada'), ESTADOS.indexOf('aplicada'))
})

/* ── Qué se acepta como propuesta ──────────────────────────────────── */

console.log(`\n${c.negrita}── Sin evidencia no hay propuesta ───────────────────────────${c.reset}`)

check('una propuesta completa se acepta', () => {
  assert.equal(validarPropuesta(BUENA).ok, true)
})

check('sin cifras en la evidencia, se rechaza', () => {
  /*
   * Una propuesta sin datos no se puede revisar: quien la lea tendría que ir a
   * buscarlos él mismo, y entonces no le ha ahorrado nada. Es justo el tipo de
   * texto que un modelo produce sin esfuerzo y que suena convincente.
   */
  const v = validarPropuesta({ ...BUENA, evidencia: 'parece raro' })
  assert.equal(v.ok, false)
  assert.ok(v.faltan.includes('evidencia'))
})

check('sin señales declaradas, se rechaza', () => {
  /* Una regla que no dice qué necesita no puede declararse «no evaluable»
     cuando falte una lectura, y ahí es donde se cuela el falso verde. */
  const v = validarPropuesta({ ...BUENA, senales: [] })
  assert.equal(v.ok, false)
  assert.ok(v.faltan.includes('senales'))
})

check('una severidad inventada se rechaza', () => {
  const v = validarPropuesta({ ...BUENA, severidad: 'urgentísimo' })
  assert.equal(v.ok, false)
  assert.ok(v.faltan.includes('severidad'))
})

check('la validación dice TODO lo que falta, no sólo lo primero', () => {
  /* Para que quien la reciba pueda arreglarla de una vez en vez de descubrir
     los huecos de uno en uno. */
  const v = validarPropuesta({ titulo: 'x' })
  assert.ok(v.faltan.length >= 5, `sólo dijo ${v.faltan.join(', ')}`)
})

/* ── Los hechos ────────────────────────────────────────────────────── */

console.log(`\n${c.negrita}── Un hecho sin origen no es un hecho ───────────────────────${c.reset}`)

check('todo hecho de fábrica declara de dónde salió', () => {
  /*
   * Dentro de un mes, leídos en la misma lista, «lo confirmó quien opera la
   * planta» y «lo dedujo el asistente de tres lecturas» son indistinguibles si
   * no se escribe cuál es cuál.
   */
  for (const h of HECHOS_INICIALES) {
    assert.ok(h.origen && h.origen.length > 10, `${h.id} sin origen`)
    assert.ok(h.hecho && h.hecho.length > 20, `${h.id} sin contenido`)
  }
})

check('los hechos de fábrica sobreviven a un almacén vacío o roto', () => {
  /* Si alguien borra el JSON, lo que costó días de averiguar no se pierde:
     vive en el código. */
  assert.ok(hechosVigentes(null).length >= HECHOS_INICIALES.length)
  assert.ok(hechosVigentes({}).length >= HECHOS_INICIALES.length)
  assert.ok(hechosVigentes(normalizarAlmacen('esto no es JSON')).length >= HECHOS_INICIALES.length)
})

check('lo aprendido va DESPUÉS de lo de fábrica', () => {
  /*
   * Si alguien confirma algo que contradice un hecho inicial, manda lo último
   * dicho — y se ve en el orden, en vez de esconderse en una fusión silenciosa
   * donde nadie sabría cuál ganó.
   */
  const nuevo = crearHecho({ hecho: 'El rodamiento intermedio es un 6206 ZZ.', origen: 'usuario' })
  const todos = hechosVigentes({ hechos: [nuevo] })
  assert.equal(todos[todos.length - 1].hecho, nuevo.hecho)
  assert.equal(todos[0].id, HECHOS_INICIALES[0].id)
})

/* ── Aguantar un archivo estropeado ────────────────────────────────── */

console.log(`\n${c.negrita}── El almacén no puede tumbar al asistente ──────────────────${c.reset}`)

check('un JSON a medias no lanza: se descarta lo que no se entiende', () => {
  const roto = normalizarAlmacen({
    hechos: [{ sinCampos: true }, { hecho: 'esto sí vale', origen: 'x' }],
    propuestas: [null, 42, { titulo: 'una propuesta' }],
  })
  assert.equal(roto.hechos.length, 1, 'sólo el que tiene texto')
  assert.equal(roto.propuestas.length, 1)
})

check('lo que no es un objeto se trata como almacén vacío', () => {
  for (const basura of [null, undefined, 'texto', 42, []]) {
    const r = normalizarAlmacen(basura)
    assert.ok(Array.isArray(r.hechos) && Array.isArray(r.propuestas), String(basura))
  }
})

/* ── Resultado ─────────────────────────────────────────────────────── */

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa shared/eva/comun/aprendizaje.js.${c.reset}`)
  process.exit(1)
}
console.log(
  `${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `ninguna propuesta se aplica sola.${c.reset}`,
)
