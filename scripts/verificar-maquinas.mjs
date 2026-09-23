#!/usr/bin/env node
/**
 * scripts/verificar-maquinas.mjs
 * ------------------------------------------------------------------
 * La configuración de máquinas: su forma pura (`shared/eva/comun/
 * configuracionMaquina.js`) y su persistencia (`backend/ia/indices/
 * maquinas.mjs`). Plan 33 F2.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 *  - Que una configuración incompleta NO se guarde. Sin assets, sin
 *    variables, sin PLC o con un tipo que no existe: se rechaza con el motivo,
 *    campo por campo.
 *  - Que dos máquinas no se solapen. Ni por id —que dejaría a `SISTEMA[id]`
 *    devolviendo una de las dos sin decir cuál— ni por raíz, que haría que
 *    `sistemaDePunto()` atribuyera los puntos de una a la otra, en silencio y
 *    siempre igual.
 *  - Que el id no se pueda cambiar al editar. Es lo que guardan los casos
 *    previos, y cambiarlo los dejaría huérfanos.
 *  - Que borrar una máquina CON casos la desactive en vez de borrarla. Misma
 *    regla que impidió filtrar `SISTEMA_IDS` al cerrar la estación de llenado:
 *    ocultar una máquina no puede invalidar su historia.
 *  - Que el acceso de escritura sea **deny by default**: lo que no se declara,
 *    no se escribe (Plan 33 §20).
 *  - Que una variable no prometa historia sin haberla verificado. El servidor
 *    contesta afirmativamente y devuelve la serie de OTRA señal — medido en
 *    las dos máquinas.
 *  - Que dos escrituras simultáneas no se pisen.
 *
 * ── POR QUÉ ESCRIBE EN DISCO DE VERDAD ─────────────────────────────
 *
 * Porque lo que se está probando ES la persistencia. Un doble de `fs` probaría
 * que el módulo llama a las funciones que el doble espera, no que el archivo
 * quede bien — y el candado por archivo de `jsonAtomico.mjs`, que es la pieza
 * que evita que dos altas simultáneas se pisen, sólo significa algo contra un
 * archivo real.
 *
 * Usa una carpeta temporal propia y la borra al terminar. No toca `datos/`.
 *
 * No necesita red ni servidores: entra en `npm run verificar`.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ACCESO,
  ESTADO_CONFIGURACION,
  capacidadesDe,
  crearMaquina,
  crearVariable,
  normalizarConfiguracion,
  permiteEscritura,
  problemasDeMaquina,
  raicesDe,
} from '../shared/eva/comun/configuracionMaquina.js'
import { tipoDe } from '../shared/eva/tipos/index.js'
import { construirSistema } from '../shared/eva/comun/construirSistema.js'
import { createGestorMaquinas } from '../backend/ia/indices/maquinas.mjs'
import { logger } from '../backend/logger.mjs'

logger.setLevel('error')

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

let passed = 0
const fallos = []

async function check(nombre, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(`${nombre} — ${error.message}`)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
  }
}

/** Una máquina de vibraciones bien formada, para partir de algo válido. */
function maquinaDeMuestra(id = 'vib-motor-02') {
  return crearMaquina({
    id,
    nombre: 'Motor de pruebas',
    tipo: 'vibraciones',
    plc: 'PLC_9 · ua:PRUEBA',
    assets: [{ id: 'a1', pointName: `ac:PRUEBA/${id}/`, rol: 'raiz' }],
    variables: [
      crearVariable({ id: 'v1', pointName: `ac:PRUEBA/${id}/S1/vRMS`, rol: 'medida:vRMS' }),
    ],
  })
}

const ctx = { tipoDe }

/* ── La forma pura ───────────────────────────────────────────────────── */

console.log(`\n${c.negrita}La forma de una máquina configurada${c.reset}`)

await check('una máquina bien formada no tiene problemas que bloqueen', () => {
  const problemas = problemasDeMaquina(maquinaDeMuestra(), ctx)
  const bloquean = problemas.filter(p => !p.aviso)
  assert.deepEqual(bloquean, [], `bloquean: ${JSON.stringify(bloquean)}`)
})

await check('sin assets se rechaza', () => {
  const m = { ...maquinaDeMuestra(), assets: [] }
  assert.ok(problemasDeMaquina(m, ctx).some(p => p.campo === 'assets'))
})

await check('sin variables se rechaza', () => {
  const m = { ...maquinaDeMuestra(), variables: [] }
  assert.ok(problemasDeMaquina(m, ctx).some(p => p.campo === 'variables'))
})

await check('sin PLC se rechaza: es lo que impide cruzar dos instalaciones', () => {
  const m = { ...maquinaDeMuestra(), plc: null }
  assert.ok(problemasDeMaquina(m, ctx).some(p => p.campo === 'plc'))
})

await check('un tipo que no existe se rechaza', () => {
  const m = { ...maquinaDeMuestra(), tipo: 'prensa' }
  assert.ok(problemasDeMaquina(m, ctx).some(p => p.campo === 'tipo'))
})

await check('ningún asset marcado como raíz se rechaza', () => {
  const m = maquinaDeMuestra()
  m.assets = [{ id: 'a1', pointName: 'ac:PRUEBA/x/', rol: 'secundario' }]
  assert.ok(problemasDeMaquina(m, ctx).some(p => p.campo === 'assets'))
})

/*
 * El solape es el problema silencioso: `sistemaDePunto()` devuelve la PRIMERA
 * cuya raíz encaja, así que los puntos de una máquina se atribuirían a la otra
 * de forma estable — ni siquiera parecería intermitente.
 */
await check('una raíz que se solapa con otra máquina se rechaza, en los dos sentidos', () => {
  const m = maquinaDeMuestra('vib-a')

  const contiene = problemasDeMaquina(m, { ...ctx, otrasRaices: ['ac:PRUEBA/'] })
  assert.ok(contiene.some(p => p.campo === 'assets'), 'no detecta que la ajena la contiene')

  const contenida = problemasDeMaquina(m, { ...ctx, otrasRaices: ['ac:PRUEBA/vib-a/S1/'] })
  assert.ok(contenida.some(p => p.campo === 'assets'), 'no detecta que ella contiene a la ajena')
})

await check('un id que ya usa el registro escrito a mano se rechaza', () => {
  const m = maquinaDeMuestra('tanque')
  assert.ok(problemasDeMaquina(m, ctx).some(p => p.campo === 'id'))
})

await check('un id repetido entre configuradas se rechaza', () => {
  const m = maquinaDeMuestra('vib-a')
  assert.ok(problemasDeMaquina(m, { ...ctx, otrosIds: ['vib-a'] }).some(p => p.campo === 'id'))
})

await check('un punto declarado dos veces se rechaza', () => {
  const m = maquinaDeMuestra()
  m.variables = [
    crearVariable({ id: 'v1', pointName: 'ac:PRUEBA/dup' }),
    crearVariable({ id: 'v2', pointName: 'ac:PRUEBA/dup' }),
  ]
  assert.ok(problemasDeMaquina(m, ctx).some(p => /dos veces/.test(p.problema)))
})

/* ── Deny by default ─────────────────────────────────────────────────── */

console.log(`\n${c.negrita}La capacidad de escritura${c.reset}`)

await check('una variable sin acceso declarado es de SÓLO LECTURA', () => {
  assert.equal(crearVariable({ id: 'v', pointName: 'ac:x' }).acceso, ACCESO.READ)
})

await check('un acceso desconocido cae a lectura, no a escritura', () => {
  assert.equal(crearVariable({ id: 'v', pointName: 'ac:x', acceso: 'todo' }).acceso, ACCESO.READ)
})

await check('sólo write y readwrite permiten escribir', () => {
  assert.equal(permiteEscritura(ACCESO.READ), false)
  assert.equal(permiteEscritura(ACCESO.WRITE), true)
  assert.equal(permiteEscritura(ACCESO.READWRITE), true)
  assert.equal(permiteEscritura(undefined), false)
})

await check('WRITABLE_VARIABLES no aparece si nadie la declaró', () => {
  const m = maquinaDeMuestra()
  assert.ok(!capacidadesDe(m, tipoDe('vibraciones')).includes('WRITABLE_VARIABLES'))
})

/* ── Historia verificada ─────────────────────────────────────────────── */

console.log(`\n${c.negrita}La promesa de historia${c.reset}`)

/*
 * Preguntarle al servidor si una variable está historizada NO basta: contesta
 * que sí y devuelve la serie de otra. Dos señales del tanque reciben la de la
 * temperatura del tanque, y `aPeak_S1` la de `aRMS_S1`.
 */
await check('una variable nueva NO promete historia', () => {
  assert.equal(crearVariable({ id: 'v', pointName: 'ac:x' }).historyVerified, false)
})

await check('la causa del sondeo nace vacía y el cliente no la puede declarar (Plan 42.5 D11)', () => {
  const v = crearVariable({ id: 'v', pointName: 'ac:x', historyCausa: 'serie-propia', historyCompartidaCon: ['otra'] })
  assert.equal(v.historyCausa, null)
  assert.deepEqual(v.historyCompartidaCon, [])
})

await check('una configuración anterior sin historyCausa carga y construye igual', () => {
  const vieja = { id: 'sin-causa', tipo: 'vibraciones', plc: 'PLC', assets: [], variables: [
    { id: 'vRMS_S1', pointName: 'ac:x/S1/vRMS_S1', historyPointName: 'hda:x', historyVerified: true, historyVerifiedComo: 'serie-propia', rol: 'medida:vRMS', assetId: 'S1' },
  ] }
  const { maquinas } = normalizarConfiguracion({ version: 1, maquinas: [vieja] })
  assert.equal(maquinas.length, 1)
  assert.equal(maquinas[0].variables[0].historyCausa, undefined)
  const sistema = construirSistema(maquinas[0], tipoDe('vibraciones'))
  assert.deepEqual(sistema.series.historizadas(), ['vRMS_S1'])
})

await check('HISTORICAL_DATA sólo con variables VERIFICADAS', () => {
  const tipo = tipoDe('vibraciones')

  const prometida = maquinaDeMuestra()
  prometida.variables[0].historyPointName = 'hda:x'
  assert.ok(
    !capacidadesDe(prometida, tipo).includes('HISTORICAL_DATA'),
    'una serie declarada y NO verificada no puede prometer histórico'
  )

  const verificada = maquinaDeMuestra()
  verificada.variables[0].historyPointName = 'hda:x'
  verificada.variables[0].historyVerified = true
  assert.ok(capacidadesDe(verificada, tipo).includes('HISTORICAL_DATA'))
})

await check('verificada sin punto histórico se rechaza: el nombre no se deduce', () => {
  const m = maquinaDeMuestra()
  m.variables[0].historyVerified = true
  m.variables[0].historyPointName = null
  assert.ok(problemasDeMaquina(m, ctx).some(p => /no se deduce|no dice con qué/.test(p.problema)))
})

/* ── Los roles que el tipo necesita ──────────────────────────────────── */

console.log(`\n${c.negrita}La cobertura de los roles${c.reset}`)

await check('faltar roles AVISA, no invalida — pero no se calla', () => {
  const problemas = problemasDeMaquina(maquinaDeMuestra(), ctx)
  const aviso = problemas.find(p => p.aviso)
  assert.ok(aviso, 'una máquina con un solo rol debería avisar de los que faltan')
  assert.ok(/no se evaluarán/.test(aviso.problema))
  assert.deepEqual(problemas.filter(p => !p.aviso), [], 'el aviso no debe bloquear')
})

/* ── Normalización ───────────────────────────────────────────────────── */

console.log(`\n${c.negrita}Un archivo a medio escribir${c.reset}`)

await check('una entrada sin id o sin tipo se descarta, sin lanzar', () => {
  const norm = normalizarConfiguracion({
    maquinas: [{ id: 'buena', tipo: 'vibraciones' }, { id: 'sin-tipo' }, { tipo: 'suelto' }, null],
  })
  assert.equal(norm.maquinas.length, 1)
  assert.equal(norm.maquinas[0].id, 'buena')
})

await check('un estado desconocido cae a UNKNOWN, nunca a VALID', () => {
  const norm = normalizarConfiguracion({
    maquinas: [{ id: 'x', tipo: 'vibraciones', estado: 'PERFECTA' }],
  })
  assert.equal(norm.maquinas[0].estado, ESTADO_CONFIGURACION.UNKNOWN)
})

await check('basura entera devuelve configuración vacía', () => {
  for (const basura of [null, undefined, 42, 'texto', {}, { maquinas: 'no' }]) {
    assert.deepEqual(normalizarConfiguracion(basura).maquinas, [])
  }
})

/* ── La persistencia, contra disco real ──────────────────────────────── */

console.log(`\n${c.negrita}La persistencia${c.reset}`)

const carpeta = await mkdtemp(join(tmpdir(), 'maquinas-'))
const ruta = join(carpeta, 'maquinas.json')

try {
  await check('un archivo que no existe se lee como vacío, sin ruido', async () => {
    const gestor = createGestorMaquinas({ ruta })
    assert.deepEqual(await gestor.listar(), [])
  })

  await check('crear guarda, y obtener lo devuelve', async () => {
    const gestor = createGestorMaquinas({ ruta })
    const r = await gestor.crear(maquinaDeMuestra('vib-uno'))
    assert.equal(r.ok, true, JSON.stringify(r.problemas))
    assert.equal((await gestor.obtener('vib-uno'))?.id, 'vib-uno')
  })

  await check('los avisos viajan aunque el alta haya ido bien', async () => {
    const gestor = createGestorMaquinas({ ruta })
    const r = await gestor.crear(maquinaDeMuestra('vib-avisos'))
    assert.equal(r.ok, true)
    assert.ok(r.avisos.length > 0, 'faltan roles y nadie lo dijo')
  })

  await check('una máquina inválida NO se guarda', async () => {
    const gestor = createGestorMaquinas({ ruta })
    const antes = (await gestor.listar()).length

    const r = await gestor.crear({ ...maquinaDeMuestra('vib-mala'), variables: [] })
    assert.equal(r.ok, false)
    assert.ok(r.problemas.some(p => p.campo === 'variables'))
    assert.equal((await gestor.listar()).length, antes, 'se guardó una máquina inválida')
  })

  await check('un id repetido se rechaza contra lo que ya hay en disco', async () => {
    const gestor = createGestorMaquinas({ ruta })
    const r = await gestor.crear(maquinaDeMuestra('vib-uno'))
    assert.equal(r.ok, false)
    assert.ok(r.problemas.some(p => p.campo === 'id'))
  })

  await check('una raíz que se solapa con una ya guardada se rechaza', async () => {
    const gestor = createGestorMaquinas({ ruta })
    const m = maquinaDeMuestra('vib-solapada')
    m.assets = [{ id: 'a1', pointName: 'ac:PRUEBA/vib-uno/S1/', rol: 'raiz' }]
    const r = await gestor.crear(m)
    assert.equal(r.ok, false)
    assert.ok(r.problemas.some(p => p.campo === 'assets'))
  })

  /*
   * Al EDITAR, las raíces propias están en el archivo. Sin excluirlas, una
   * máquina se solaparía consigo misma y el rechazo sería incomprensible:
   * «la raíz se solapa con la raíz».
   */
  await check('editar una máquina NO la hace solaparse consigo misma', async () => {
    const gestor = createGestorMaquinas({ ruta })
    const r = await gestor.editar('vib-uno', { nombre: 'Otro nombre' })
    assert.equal(r.ok, true, JSON.stringify(r.problemas))
    assert.equal((await gestor.obtener('vib-uno')).nombre, 'Otro nombre')
  })

  await check('el id NO se puede cambiar: lo guardan los casos previos', async () => {
    const gestor = createGestorMaquinas({ ruta })
    const r = await gestor.editar('vib-uno', { id: 'otro-id' })
    assert.equal(r.ok, false)
    assert.ok(r.problemas.some(p => p.campo === 'id'))
    assert.ok(await gestor.obtener('vib-uno'), 'la máquina original desapareció')
  })

  await check('editar una máquina que no existe lo dice, sin crearla', async () => {
    const gestor = createGestorMaquinas({ ruta })
    const r = await gestor.editar('fantasma', { nombre: 'x' })
    assert.equal(r.ok, false)
    assert.equal(r.noExiste, true)
    assert.equal(await gestor.obtener('fantasma'), null)
  })

  await check('borrar SIN casos elimina', async () => {
    const gestor = createGestorMaquinas({ ruta })
    const r = await gestor.eliminar('vib-avisos')
    assert.equal(r.ok, true)
    assert.equal(r.desactivada, false)
    assert.equal(await gestor.obtener('vib-avisos'), null)
  })

  /* Ocultar una máquina no puede invalidar su historia. */
  await check('borrar CON casos desactiva, y la máquina sigue ahí', async () => {
    const gestor = createGestorMaquinas({ ruta })
    const r = await gestor.eliminar('vib-uno', { casosAsociados: 11 })
    assert.equal(r.ok, true)
    assert.equal(r.desactivada, true)

    const sigue = await gestor.obtener('vib-uno')
    assert.ok(sigue, 'se borró una máquina que tenía casos')
    assert.equal(sigue.activa, false)
  })

  await check('anotar una revisión guarda estado y fecha', async () => {
    const gestor = createGestorMaquinas({ ruta })
    const r = await gestor.anotarRevision('vib-uno', { estado: ESTADO_CONFIGURACION.DEGRADED })
    assert.equal(r.ok, true)

    const m = await gestor.obtener('vib-uno')
    assert.equal(m.estado, ESTADO_CONFIGURACION.DEGRADED)
    assert.ok(m.revisada, 'no quedó constancia de cuándo se revisó')
  })

  /*
   * El candado por archivo de `jsonAtomico.mjs` es la pieza que evita que dos
   * altas simultáneas se pisen. Diez a la vez sobre el mismo archivo tienen
   * que acabar las diez en disco: sin candado, unas leerían el archivo antes
   * de que otras lo escribieran y se perderían por el camino.
   */
  await check('diez altas simultáneas no se pisan', async () => {
    const propio = join(carpeta, 'concurrencia.json')
    const gestor = createGestorMaquinas({ ruta: propio })

    const altas = Array.from({ length: 10 }, (_, i) =>
      gestor.crear(maquinaDeMuestra(`vib-c${i}`))
    )
    const hechas = await Promise.all(altas)

    assert.ok(hechas.every(r => r.ok), 'alguna alta simultánea fue rechazada')
    assert.equal((await gestor.listar()).length, 10, 'se perdieron altas por el camino')
  })

  await check('un archivo ilegible no tumba el gestor', async () => {
    const roto = join(carpeta, 'roto.json')
    await writeFile(roto, '{ esto no es json', 'utf8')

    const gestor = createGestorMaquinas({ ruta: roto })
    assert.deepEqual(await gestor.listar(), [])
  })

  await check('lo escrito es JSON legible y conserva la versión', async () => {
    const leido = JSON.parse(await readFile(ruta, 'utf8'))
    assert.equal(leido.version, 1)
    assert.ok(Array.isArray(leido.maquinas))
  })

  await check('sin ruta, el gestor se niega a construirse', () => {
    assert.throws(() => createGestorMaquinas({}), /ruta/)
  })

  await check('raicesDe saca los pointName de los assets', () => {
    assert.deepEqual(raicesDe(maquinaDeMuestra('vib-r')), ['ac:PRUEBA/vib-r/'])
    assert.deepEqual(raicesDe(null), [])
  })
} finally {
  await rm(carpeta, { recursive: true, force: true })
}

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(
    `${c.gris}Revisa shared/eva/comun/configuracionMaquina.js y ` +
      `backend/ia/indices/maquinas.mjs.${c.reset}`
  )
  process.exit(1)
}

console.log(
  `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: la configuración de máquinas ` +
    `se valida y se guarda.${c.reset}`
)
