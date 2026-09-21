#!/usr/bin/env node
/**
 * scripts/verificar-configurar-desde-arbol.mjs
 * ------------------------------------------------------------------
 * Que de lo MARCADO en el árbol salga la configuración correcta, y que una
 * máquina guardada se compare con el árbol sin borrar nada por su cuenta.
 * Plan 36 F1–F3.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 *  1. **Marcar un activo marca todas sus variables; quitar una deja n−1.** Es
 *     el modelo de interacción decidido con el usuario, y es dominio: se
 *     prueba aquí sin React.
 *  2. **El emparejamiento se PROPONE por nombre y lo ambiguo no se propone.**
 *     Dos tags que terminan igual no se eligen al azar; lo que nadie reclama
 *     se lista, no se esconde.
 *  3. **`Alarm` y `Pantalla` no salen como activos reconocidos.** La regla es
 *     del TIPO —ninguna de sus hojas encaja en un rol—, no una lista escrita a
 *     mano. Se ofrecen igual, en «otros».
 *  4. **Una variable guardada que ya no está se SEÑALA; una cuya carpeta no
 *     se pudo leer NO se da por ausente.** `UNKNOWN` ≠ `INVALID`, variable a
 *     variable. Es lo caro de F3.
 *  5. **La configuración que sale no promete nada**: sin `historyVerified`,
 *     sin `acceso`, con `arboles` para poder volver.
 *
 * Sin red, sin build. Entra solo en `npm run verificar`.
 */
import assert from 'node:assert/strict'

import {
  clasificarArea,
  emparejarPorNombre,
  nombreDeCarpeta,
  nombreFinal,
} from '../shared/eva/comun/arbolIconics.js'
import {
  activoDe,
  activosDesdeRaiz,
  arbolesDe,
  carpetaDe,
  compararConArbol,
  configuracionDesdeMarcas,
  hojasBajo,
  marcasDe,
  proponerVariables,
} from '../shared/eva/comun/configurarDesdeArbol.js'
import { crearMaquina, problemasDeMaquina } from '../shared/eva/comun/configuracionMaquina.js'
import { tipoDe } from '../shared/eva/tipos/index.js'

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
    console.log(`    ${c.gris}${error.message.split('\n').slice(0, 6).join('\n    ')}${c.reset}`)
  }
}

const B = String.fromCharCode(92)
const TIPO = tipoDe('vibraciones')

/* ── Un árbol como el del 21-09-2026, en pequeño ────────────────────── */

const RAIZ = 'ac:TDCON/DEMO_VIBRACIONES/Vibraciones/'
const HDA = `hda:${B}Configuration${B}DEMO_VIBRACIONES${B}`
const AREA = 'ae:/DEMO VIBRACIONES'

const hoja = (carpeta, nombre) => ({ pointName: `${carpeta}${nombre}`, shortName: nombre })
const carpeta = (padre, nombre) => ({ pointName: `${padre}${nombre}/`, shortName: nombre })

const S1 = ['vRMS_S1', 'aRMS_S1', 'aPeak_S1', 'DKW_S1', 'QC_vRMS_S1', 'Alarma_S1', 'Sensor_state_1']
const V20 = ['SPEED_BMS', 'FREQ OUTPUT_BMS', 'HorasMarcha']
const JARITZA = ['Tension L-N', 'Corriente L1']
const ALARM = ['Alarm_MonState_vRMS', 'Alarm_DKW']
const PANTALLA = ['Pagina', 'Idioma']

const arbol = new Map([
  [RAIZ, [carpeta(RAIZ, 'S1'), carpeta(RAIZ, 'V20'), carpeta(RAIZ, 'Jaritza'), carpeta(RAIZ, 'Alarm'), carpeta(RAIZ, 'Pantalla')]],
  [`${RAIZ}S1/`, S1.map((n) => hoja(`${RAIZ}S1/`, n))],
  [`${RAIZ}V20/`, V20.map((n) => hoja(`${RAIZ}V20/`, n))],
  [`${RAIZ}Jaritza/`, JARITZA.map((n) => hoja(`${RAIZ}Jaritza/`, n))],
  [`${RAIZ}Alarm/`, ALARM.map((n) => hoja(`${RAIZ}Alarm/`, n))],
  [`${RAIZ}Pantalla/`, PANTALLA.map((n) => hoja(`${RAIZ}Pantalla/`, n))],
])

const tagsHda = [
  `${HDA}S1:vRMS_S1`, `${HDA}S1:aRMS_S1`, `${HDA}S1:DKW_S1`,
  `${HDA}V20:SPEED_BMS`,
  /* Dos tags que terminan igual en carpetas distintas: ambiguo. */
  `${HDA}S1:QC_vRMS_S1`, `${HDA}S2:QC_vRMS_S1`,
  /* Sólo en el historiador, con errata: nadie lo reclama. */
  `${HDA}Jaritza:UPER LEVEL 3`,
]

console.log(`\n${c.negrita}Configurar una máquina marcando el árbol${c.reset}\n`)

/* ── Nombres ─────────────────────────────────────────────────────────── */

check('el nombre final sale igual de los tres árboles', () => {
  assert.equal(nombreFinal(`${RAIZ}S1/vRMS_S1`), 'vRMS_S1')
  assert.equal(nombreFinal(`${HDA}S1:vRMS_S1`), 'vRMS_S1')
  assert.equal(nombreFinal(`${AREA}=ActiveUnackedCount`), 'ActiveUnackedCount')
})

check('el nombre de una carpeta o de un área, que termina en separador o no lleva ninguno', () => {
  assert.equal(nombreDeCarpeta(RAIZ), 'Vibraciones')
  assert.equal(nombreDeCarpeta(`${RAIZ}S1/`), 'S1')
  assert.equal(nombreDeCarpeta(HDA), 'DEMO_VIBRACIONES')
  assert.equal(nombreDeCarpeta(AREA), 'DEMO VIBRACIONES')
})

check('el activo de un punto es la carpeta directa bajo la raíz; una hoja suelta es de la raíz', () => {
  assert.deepEqual(activoDe(RAIZ, `${RAIZ}S1/vRMS_S1`), { id: 'S1', pointName: `${RAIZ}S1/`, esRaiz: false })
  assert.deepEqual(activoDe(RAIZ, `${RAIZ}Suelta`), { id: 'Vibraciones', pointName: RAIZ, esRaiz: true })
  assert.equal(activoDe(RAIZ, 'ac:OTRA/COSA/x'), null)
})

check('la carpeta inmediata de un punto, también en un área de alarmas', () => {
  assert.equal(carpetaDe(`${RAIZ}S1/vRMS_S1`), `${RAIZ}S1/`)
  assert.equal(carpetaDe(`${AREA}=ActiveUnackedCount`), AREA)
  assert.equal(carpetaDe(`${AREA}.Alarm_X`), AREA)
})

/* ── Los activos ─────────────────────────────────────────────────────── */

check('S1 y V20 salen RECONOCIDOS por el tipo; Jaritza, Alarm y Pantalla en «otros»', () => {
  const { reconocidos, otros } = activosDesdeRaiz(RAIZ, arbol.get(RAIZ), arbol, TIPO)
  assert.deepEqual(reconocidos.map((a) => a.id), ['S1', 'V20'])
  assert.deepEqual(otros.map((a) => a.id), ['Jaritza', 'Alarm', 'Pantalla'])
  /* Se ofrecen igual: no se esconde lo que existe. */
  assert.equal(reconocidos.length + otros.length, 5)
})

check('un activo reconocido dice cuántas hojas tiene y cuántas encajan en un rol', () => {
  const { reconocidos } = activosDesdeRaiz(RAIZ, arbol.get(RAIZ), arbol, TIPO)
  const s1 = reconocidos.find((a) => a.id === 'S1')
  assert.equal(s1.hojas, 7)
  /* `Sensor_state_1` es una errata del servidor que ningún rol reconoce. */
  assert.equal(s1.conRol, 6)
  assert.equal(s1.cargada, true)
})

check('una carpeta cuyas hojas no se han leído no afirma nada: `hojas: null`, en «otros»', () => {
  const parcial = new Map([[RAIZ, arbol.get(RAIZ)]])
  const { reconocidos, otros } = activosDesdeRaiz(RAIZ, arbol.get(RAIZ), parcial, TIPO)
  assert.equal(reconocidos.length, 0)
  assert.ok(otros.every((a) => a.hojas === null && a.cargada === false))
})

check('las hojas bajo una carpeta se cuentan recorriendo lo leído, y `null` si falta un nivel', () => {
  assert.equal(hojasBajo(`${RAIZ}S1/`, arbol).length, 7)
  const anidado = new Map([
    [`${RAIZ}J/`, [carpeta(`${RAIZ}J/`, 'L1'), hoja(`${RAIZ}J/`, 'suelta')]],
    [`${RAIZ}J/L1/`, [hoja(`${RAIZ}J/L1/`, 'Tension')]],
  ])
  assert.deepEqual(hojasBajo(`${RAIZ}J/`, anidado), [`${RAIZ}J/L1/Tension`, `${RAIZ}J/suelta`])
  anidado.delete(`${RAIZ}J/L1/`)
  assert.equal(hojasBajo(`${RAIZ}J/`, anidado), null)
})

/* ── Marcar y quitar ─────────────────────────────────────────────────── */

check('marcar S1 marca sus 7 variables; quitar una deja 6', () => {
  const marcadas = hojasBajo(`${RAIZ}S1/`, arbol)
  let variables = proponerVariables({ raiz: RAIZ, marcados: marcadas, tagsHistoricos: tagsHda, tipo: TIPO })
  assert.equal(variables.length, 7)

  const sinUna = marcadas.filter((p) => !p.endsWith('/aPeak_S1'))
  variables = proponerVariables({ raiz: RAIZ, marcados: sinUna, tagsHistoricos: tagsHda, tipo: TIPO })
  assert.equal(variables.length, 6)
  assert.ok(!variables.some((v) => v.id === 'aPeak_S1'))
})

check('cada variable propuesta trae rol, activo y serie por nombre, y nace sin promesas', () => {
  const [v] = proponerVariables({ raiz: RAIZ, marcados: [`${RAIZ}S1/vRMS_S1`], tagsHistoricos: tagsHda, tipo: TIPO })
  assert.equal(v.id, 'vRMS_S1')
  assert.equal(v.rol, 'medida:vRMS')
  assert.equal(v.assetId, 'S1')
  assert.equal(v.activo, 'S1')
  assert.equal(v.historyPointName, `${HDA}S1:vRMS_S1`)
  assert.equal(v.procedencia, 'nombre-coincide')
  assert.equal('historyVerified' in v, false, 'la propuesta no afirma verificación')
  assert.equal('acceso' in v, false, 'ni acceso: lo pone el servidor, deny by default')
})

check('el `assetId` es el canal del tipo cuando lo reconoce, y la carpeta cuando no', () => {
  const variables = proponerVariables({
    raiz: RAIZ,
    marcados: [`${RAIZ}S1/vRMS_S1`, `${RAIZ}V20/SPEED_BMS`, `${RAIZ}Jaritza/Tension L-N`],
    tagsHistoricos: [],
    tipo: TIPO,
  })
  assert.equal(variables[0].assetId, 'S1')
  assert.equal(variables[1].assetId, 'V20', 'el variador cuelga de V20 y no tiene canal')
  assert.equal(variables[1].rol, 'variador:velocidad')
  assert.equal(variables[2].assetId, 'Jaritza')
  assert.equal(variables[2].rol, null)
})

check('dos hojas con el mismo nombre en carpetas distintas NO comparten id', () => {
  const variables = proponerVariables({
    raiz: RAIZ,
    marcados: [`${RAIZ}Jaritza/L1/Tension`, `${RAIZ}Jaritza/L2/Tension`, `${RAIZ}Otro/Tension`],
    tagsHistoricos: [],
    tipo: TIPO,
  })
  const ids = variables.map((v) => v.id)
  assert.equal(new Set(ids).size, 3, `ids repetidos: ${ids}`)
})

/* ── El emparejamiento ───────────────────────────────────────────────── */

check('el emparejamiento se propone por nombre; lo ambiguo NO se propone; lo no reclamado se lista', () => {
  const vivos = [`${RAIZ}S1/vRMS_S1`, `${RAIZ}S1/QC_vRMS_S1`, `${RAIZ}S1/Sensor_state_1`]
  const { pares, procedencia, sinEmparejar } = emparejarPorNombre(vivos, tagsHda)

  assert.equal(pares.get(vivos[0]), `${HDA}S1:vRMS_S1`)
  assert.equal(procedencia.get(vivos[0]), 'nombre-coincide')

  assert.equal(pares.get(vivos[1]), null, 'dos tags terminan en QC_vRMS_S1: no se elige')
  assert.equal(procedencia.get(vivos[1]), 'ambiguo-en-historiador')

  assert.equal(pares.get(vivos[2]), null)
  assert.equal(procedencia.get(vivos[2]), 'sin-historico')

  assert.ok(sinEmparejar.includes(`${HDA}Jaritza:UPER LEVEL 3`), 'la errata queda a la vista')
})

check('un emparejamiento decidido A MANO manda sobre la propuesta por nombre', () => {
  const vivo = `${RAIZ}S1/QC_vRMS_S1`
  const [v] = proponerVariables({
    raiz: RAIZ,
    marcados: [vivo],
    tagsHistoricos: tagsHda,
    emparejamientos: new Map([[vivo, `${HDA}S1:QC_vRMS_S1`]]),
    tipo: TIPO,
  })
  assert.equal(v.historyPointName, `${HDA}S1:QC_vRMS_S1`)
  assert.equal(v.procedencia, 'a-mano')
})

check('el área de alarmas se clasifica por el prefijo del nombre corto', () => {
  const { contadores, alarmas, acciones } = clasificarArea([
    { pointName: `${AREA}=ActiveUnackedCount`, shortName: '=ActiveUnackedCount' },
    { pointName: `${AREA}.Alarm_X`, shortName: '.Alarm_X' },
    { pointName: `${AREA}${B}Acknowledge`, shortName: `${B}Acknowledge` },
  ])
  assert.equal(contadores.length, 1)
  assert.equal(alarmas.length, 1)
  assert.equal(alarmas[0].lee, false)
  assert.equal(acciones.length, 1)
})

/* ── La configuración que sale ───────────────────────────────────────── */

const formulario = { id: 'vib-motor-02', nombre: 'Motor 2', tipo: 'vibraciones', plc: 'PLC_2 · ua:DEMO3' }
const arboles = { enVivo: RAIZ, historico: HDA, alarmas: AREA }

check('la configuración lleva la raíz, un asset por carpeta marcada, el área y `arboles`', () => {
  const variables = proponerVariables({
    raiz: RAIZ,
    marcados: [...hojasBajo(`${RAIZ}S1/`, arbol), ...hojasBajo(`${RAIZ}V20/`, arbol)],
    tagsHistoricos: tagsHda,
    tipo: TIPO,
  })
  const cfg = configuracionDesdeMarcas({
    formulario, arboles, variables,
    contadores: [{ pointName: `${AREA}=ActiveUnackedCount` }],
  })

  assert.deepEqual(cfg.assets.map((a) => [a.id, a.rol]), [
    ['Vibraciones', 'raiz'], ['S1', 'secundario'], ['V20', 'secundario'], ['DEMO VIBRACIONES', 'secundario'],
  ])
  assert.equal(cfg.variables.length, 7 + 3 + 1)
  assert.deepEqual(cfg.arboles, arboles)

  const contador = cfg.variables.find((v) => v.pointName === `${AREA}=ActiveUnackedCount`)
  assert.equal(contador.assetId, 'DEMO VIBRACIONES')
  assert.equal(contador.rol, null, 'los contadores no son roles del tipo')

  for (const v of cfg.variables) {
    assert.equal('historyVerified' in v, false)
    assert.equal('acceso' in v, false)
  }
})

check('lo que sale pasa la validación del dominio y `crearMaquina` lo acepta con `arboles`', () => {
  const variables = proponerVariables({
    raiz: RAIZ, marcados: hojasBajo(`${RAIZ}S1/`, arbol), tagsHistoricos: tagsHda, tipo: TIPO,
  })
  const cfg = configuracionDesdeMarcas({ formulario, arboles, variables })
  const maquina = crearMaquina(cfg)
  const problemas = problemasDeMaquina(maquina, { tipoDe })
  assert.ok(problemas.every((p) => p.aviso), JSON.stringify(problemas.filter((p) => !p.aviso)))
  assert.deepEqual(maquina.arboles, arboles)
  assert.ok(maquina.variables.every((v) => v.historyVerified === false && v.acceso === 'read'))
})

/* ── Volver a abrir una máquina (F3) ─────────────────────────────────── */

const guardada = () => crearMaquina({
  ...configuracionDesdeMarcas({
    formulario, arboles,
    variables: proponerVariables({
      raiz: RAIZ, marcados: hojasBajo(`${RAIZ}S1/`, arbol), tagsHistoricos: tagsHda, tipo: TIPO,
    }),
    contadores: [{ pointName: `${AREA}=ActiveUnackedCount` }],
  }),
})

check('las tres raíces se recuperan de `arboles`, y sin él se deducen de los assets salvo el historiador', () => {
  assert.deepEqual(arbolesDe(guardada()), arboles)

  const vieja = { ...guardada(), arboles: null }
  const deducidas = arbolesDe(vieja)
  assert.equal(deducidas.enVivo, RAIZ)
  assert.equal(deducidas.alarmas, AREA)
  assert.equal(deducidas.historico, null, 'el nombre hda: no se deduce de nada (B10)')
})

check('las marcas de una máquina guardada separan vivos de contadores y conservan sus decisiones', () => {
  const { vivos, contadores, emparejamientos, roles } = marcasDe(guardada())
  assert.equal(vivos.length, 7)
  assert.deepEqual(contadores, [`${AREA}=ActiveUnackedCount`])
  assert.equal(emparejamientos.get(`${RAIZ}S1/vRMS_S1`), `${HDA}S1:vRMS_S1`)
  assert.equal(roles.get(`${RAIZ}S1/vRMS_S1`), 'medida:vRMS')
})

check('abrir y volver a proponer sin tocar nada reproduce la misma configuración', () => {
  const m = guardada()
  const { vivos, emparejamientos, roles } = marcasDe(m)
  const variables = proponerVariables({
    raiz: RAIZ, marcados: vivos, tagsHistoricos: [], emparejamientos, roles, tipo: TIPO,
  })
  const otraVez = configuracionDesdeMarcas({
    formulario, arboles, variables, contadores: [{ pointName: `${AREA}=ActiveUnackedCount` }],
  })
  const forma = (lista) => lista.map((v) => [v.pointName, v.historyPointName, v.rol, v.assetId])
  assert.deepEqual(forma(otraVez.variables), forma(m.variables))
})

check('una variable que ya no está en el árbol se SEÑALA como ausente; no desaparece', () => {
  const m = guardada()
  const hoy = new Map(arbol)
  hoy.set(`${RAIZ}S1/`, arbol.get(`${RAIZ}S1/`).filter((h) => !h.pointName.endsWith('/aPeak_S1')))
  hoy.set(AREA, [{ pointName: `${AREA}=ActiveUnackedCount`, shortName: '=ActiveUnackedCount' }])

  const { presentes, ausentes, sinComprobar } = compararConArbol(m, hoy)
  assert.deepEqual(ausentes.map((v) => v.id), ['aPeak_S1'])
  assert.equal(presentes.length, 7)
  assert.equal(sinComprobar.length, 0)
})

check('si la carpeta NO se pudo leer, sus variables quedan SIN COMPROBAR, no ausentes', () => {
  const m = guardada()
  const hoy = new Map([[RAIZ, arbol.get(RAIZ)], [`${RAIZ}S1/`, null]])

  const { ausentes, sinComprobar } = compararConArbol(m, hoy)
  assert.equal(ausentes.length, 0, 'un corte de red no da de baja variables')
  assert.equal(sinComprobar.length, 8)
})

/* ── Resultado ───────────────────────────────────────────────────────── */

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa shared/eva/comun/configurarDesdeArbol.js y arbolIconics.js.${c.reset}`)
  process.exit(1)
}
console.log(
  `${c.verde}${c.negrita}${passed} comprobaciones correctas: lo marcado se convierte en configuración ` +
    `sin prometer nada, y lo que falta se señala.${c.reset}`,
)
