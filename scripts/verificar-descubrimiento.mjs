#!/usr/bin/env node
/**
 * scripts/verificar-descubrimiento.mjs
 * ------------------------------------------------------------------
 * El descubridor de máquinas desde el árbol de ICONICS. Plan 34 F1.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Porque lo que este módulo propone lo va a confirmar una persona mirando una
 * pantalla, y una propuesta equivocada no da error: da una variable bien
 * puesta con el histórico de otra señal. El fallo aparece semanas después, en
 * una gráfica que no cuadra.
 *
 * Así que lo que se comprueba aquí no es tanto «¿encuentra cosas?» como
 * **«¿se calla cuando no está seguro?»**. Las tres cautelas que sostienen el
 * módulo son las tres que más pruebas tienen:
 *
 *   un emparejamiento ambiguo no se propone
 *   un rol con dos candidatos no se elige
 *   no haber podido mirar no se parece a no haber encontrado nada
 *
 * ── POR QUÉ CON UN ÁRBOL DE MENTIRA Y NO CONTRA PLANTA ─────────────
 *
 * Porque contra el servidor real sólo se puede comprobar el caso que hoy
 * existe, y los que importan son los que hoy NO existen: el tag duplicado, la
 * rama que falla, el rol ambiguo. Un `explorar` de mentira los construye en
 * tres líneas y corre sin red, que es lo que permite que esto entre en la
 * tanda (`CLAUDE.md` §5.2).
 *
 * Lo medido contra el servidor real vive en el Plan 34 y en las cabeceras del
 * módulo; esto fija el comportamiento.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-descubrimiento.mjs
 */
import assert from 'node:assert/strict'

import {
  descubrirAlarmas,
  descubrirVariables,
  nombreFinal,
  proponerRol,
} from '../backend/lib/descubrirDesdeArbol.mjs'
import { ESTADO_CONFIGURACION } from '../shared/eva/comun/configuracionMaquina.js'
import TIPO_VIBRACIONES from '../shared/eva/tipos/vibraciones.js'

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

const B = String.fromCharCode(92)

/**
 * Un `browse` de mentira: recibe un mapa de rama → hijos.
 *
 * El `shortName` se saca quitando el prefijo de la rama y NO con
 * `nombreFinal`, que corta por `:` y `/`. El servidor devuelve el nombre
 * corto **con su prefijo** —`=ActiveUnackedCount`, `.Alarm_X`— y ese prefijo
 * es justo lo que clasifica a los hijos de un área de alarmas. Un doble que
 * lo perdiera probaría otra cosa que la real.
 */
function arbolFalso(mapa) {
  return async (ruta) => {
    if (!(ruta in mapa)) return { ok: false, status: 404, error: 'no existe' }
    const hijos = mapa[ruta]
    if (hijos === 'FALLA') return { ok: false, status: 500, error: 'boom' }
    return {
      ok: true,
      status: 200,
      payload: hijos.map((h) => ({
        pointName: h,
        shortName: h.startsWith(ruta) ? h.slice(ruta.length) : nombreFinal(h),
      })),
    }
  }
}

console.log(`\n${c.negrita}El descubridor de máquinas desde el árbol${c.reset}\n`)

/* ── El nombre final ─────────────────────────────────────────────────── */

check('el nombre final sale igual de los dos árboles, que separan distinto', () => {
  assert.equal(nombreFinal('ac:TDCON/Demo/Vibraciones/S1/vRMS_S1'), 'vRMS_S1')
  assert.equal(nombreFinal(`hda:${B}Configuration${B}DEMO_VIB${B}S1:vRMS_S1`), 'vRMS_S1')
})

check('un nombre vacío o que no es texto no revienta: devuelve null', () => {
  assert.equal(nombreFinal(null), null)
  assert.equal(nombreFinal(''), null)
  assert.equal(nombreFinal(42), null)
})

/* ── El emparejamiento `ac:` ↔ `hda:` ────────────────────────────────── */

const RAIZ = 'ac:M/'
const GRUPO = `hda:${B}Cfg${B}G`

await checkAsync('empareja por nombre final cuando el tag coincide', async () => {
  const r = await descubrirVariables(
    { raizEnVivo: RAIZ, raizHistorico: GRUPO },
    {
      explorar: arbolFalso({
        [RAIZ]: [`${RAIZ}S1/`],
        [`${RAIZ}S1/`]: [`${RAIZ}S1/vRMS_S1`],
        [`${RAIZ}S1/vRMS_S1`]: [],
        [GRUPO]: [`${GRUPO}${B}S1:vRMS_S1`],
      }),
    },
  )
  assert.equal(r.estado, ESTADO_CONFIGURACION.VALID)
  assert.equal(r.variables.length, 1)
  assert.equal(r.variables[0].historyPointName, `${GRUPO}${B}S1:vRMS_S1`)
  assert.equal(r.variables[0].procedencia, 'nombre-coincide')
})

await checkAsync('un tag DUPLICADO en el historiador no se empareja con ninguno', async () => {
  /*
   * La cautela central del módulo. Si dos apoyos publican un tag que termina
   * igual, elegir uno es acertar la mitad de las veces sin decirlo.
   */
  const r = await descubrirVariables(
    { raizEnVivo: RAIZ, raizHistorico: GRUPO },
    {
      explorar: arbolFalso({
        [RAIZ]: [`${RAIZ}S1/`],
        [`${RAIZ}S1/`]: [`${RAIZ}S1/Temp`],
        [`${RAIZ}S1/Temp`]: [],
        [GRUPO]: [`${GRUPO}${B}S1:Temp`, `${GRUPO}${B}S2:Temp`],
      }),
    },
  )
  assert.equal(r.variables[0].historyPointName, null, 'no debía elegir')
  assert.equal(r.variables[0].procedencia, 'ambiguo-en-historiador')
})

await checkAsync('lo que el historiador publica y nadie reclama se dice, no se calla', async () => {
  const r = await descubrirVariables(
    { raizEnVivo: RAIZ, raizHistorico: GRUPO },
    {
      explorar: arbolFalso({
        [RAIZ]: [`${RAIZ}a`],
        [`${RAIZ}a`]: [],
        [GRUPO]: [`${GRUPO}${B}S1:huerfano`],
      }),
    },
  )
  assert.deepEqual(r.sinEmparejar, [`${GRUPO}${B}S1:huerfano`])
})

await checkAsync('una variable sin histórico nace sin promesa de historia', async () => {
  const r = await descubrirVariables(
    { raizEnVivo: RAIZ, raizHistorico: null },
    { explorar: arbolFalso({ [RAIZ]: [`${RAIZ}a`], [`${RAIZ}a`]: [] }) },
  )
  assert.equal(r.variables[0].historyPointName, null)
  assert.equal(r.variables[0].historyVerified, false, 'nunca arranca en true')
  assert.equal(r.variables[0].procedencia, 'sin-historico')
})

/* ── Lo seguro por defecto ───────────────────────────────────────────── */

await checkAsync('toda variable propuesta nace de SÓLO LECTURA', async () => {
  /* Deny by default (Plan 33 §20): descubrir un punto no autoriza a escribirlo. */
  const r = await descubrirVariables(
    { raizEnVivo: RAIZ },
    { explorar: arbolFalso({ [RAIZ]: [`${RAIZ}a`], [`${RAIZ}a`]: [] }) },
  )
  assert.equal(r.variables[0].acceso, 'read')
})

/* ── No haber podido mirar ───────────────────────────────────────────── */

await checkAsync('si la raíz en vivo falla, es UNKNOWN y no «no tiene variables»', async () => {
  /*
   * La distinción que `CLAUDE.md` §2.4 exige un nivel más arriba: la ausencia
   * de COMPROBACIÓN no se disfraza de comprobación. Devolver una lista vacía
   * aquí daría de baja una máquina por un corte de red.
   */
  const r = await descubrirVariables(
    { raizEnVivo: RAIZ },
    { explorar: arbolFalso({ [RAIZ]: 'FALLA' }) },
  )
  assert.equal(r.estado, ESTADO_CONFIGURACION.UNKNOWN)
  assert.equal(r.variables.length, 0)
  assert.match(r.motivo, /no se ha podido mirar/i)
})

await checkAsync('una rama interna que falla DEGRADA, y la propuesta lo confiesa', async () => {
  const r = await descubrirVariables(
    { raizEnVivo: RAIZ },
    {
      explorar: arbolFalso({
        [RAIZ]: [`${RAIZ}S1/`, `${RAIZ}S2/`],
        [`${RAIZ}S1/`]: [`${RAIZ}S1/a`],
        [`${RAIZ}S1/a`]: [],
        [`${RAIZ}S2/`]: 'FALLA',
      }),
    },
  )
  assert.equal(r.estado, ESTADO_CONFIGURACION.DEGRADED)
  assert.equal(r.variables.length, 1, 'lo que sí se pudo leer, se entrega')
  assert.equal(r.fallos.length, 1)
  assert.match(r.motivo, /incompleta/i)
})

await checkAsync('sin raíz en vivo no se inventa nada', async () => {
  const r = await descubrirVariables({ raizEnVivo: null }, { explorar: arbolFalso({}) })
  assert.equal(r.estado, ESTADO_CONFIGURACION.UNKNOWN)
})

/* ── El rol ──────────────────────────────────────────────────────────── */

const CANALES = TIPO_VIBRACIONES.canales.map((x) => x.sufijo)

check('el rol se propone por el TAG del servidor, no por la clave de dominio', () => {
  /*
   * La corrección que hizo útil esta función. `QC_vRMS` es el tag y `qcVRMS`
   * la clave: preguntando sólo por clave se resolvían 12 de 184 puntos.
   */
  const q = proponerRol('QC_vRMS_S1', TIPO_VIBRACIONES, { canales: CANALES })
  assert.equal(q.rol, 'calidad:qcVRMS')
  assert.equal(q.canal, 'S1')
})

check('el sufijo del apoyo se separa, y viaja aparte del rol', () => {
  const v = proponerRol('vRMS_S3', TIPO_VIBRACIONES, { canales: CANALES })
  assert.equal(v.rol, 'medida:vRMS')
  assert.equal(v.canal, 'S3', 'el apoyo es de la máquina, no del tipo')
})

check('un tag del variador se reconoce aunque lleve el sufijo dentro', () => {
  /* `SPEED_BMS` no termina en un canal: el `_BMS` es parte del tag. */
  const s = proponerRol('SPEED_BMS', TIPO_VIBRACIONES, { canales: CANALES })
  assert.equal(s.rol, 'variador:velocidad')
  assert.equal(s.canal, null)
})

check('un tag que el tipo no conoce NO recibe rol, y se nota', () => {
  const x = proponerRol('CONECTED 1', TIPO_VIBRACIONES, { canales: CANALES })
  assert.equal(x.rol, null)
  assert.deepEqual(x.candidatos, [], 'sin candidatos: nadie lo reclama')
})

check('sin tipo no se propone ningún rol', () => {
  assert.equal(proponerRol('vRMS_S1', null, { canales: CANALES }).rol, null)
})

check('el tipo resuelve por tag Y por clave: las dos puertas del índice', () => {
  assert.deepEqual(TIPO_VIBRACIONES.rolesDeTag('QC_vRMS'), ['calidad:qcVRMS'])
  assert.deepEqual(TIPO_VIBRACIONES.rolesDeClave('qcVRMS'), ['calidad:qcVRMS'])
})

check('`rolesDeTag` devuelve LISTA, para no elegir por quien configura', () => {
  assert.ok(Array.isArray(TIPO_VIBRACIONES.rolesDeTag('vRMS')))
  assert.deepEqual(TIPO_VIBRACIONES.rolesDeTag('no-existe-este-tag'), [])
})

/* ── Las alarmas ─────────────────────────────────────────────────────── */

const AREA = 'ae:/A'

await checkAsync('el área separa contadores, alarmas y acciones por su prefijo', async () => {
  const r = await descubrirAlarmas(AREA, {
    explorar: arbolFalso({
      [AREA]: [`${AREA}=ActiveUnackedCount`, `${AREA}.Alarm_X`, `${AREA}${B}Acknowledge`],
    }),
  })
  assert.equal(r.estado, ESTADO_CONFIGURACION.VALID)
  assert.equal(r.contadores.length, 1)
  assert.equal(r.alarmas.length, 1)
  assert.equal(r.acciones.length, 1)
})

await checkAsync('las alarmas individuales se marcan como NO legibles', async () => {
  /*
   * Medido el 21-09-2026: el área lista sus 42 alarmas y ninguna entrega
   * valor —calidad 2147483682, mala—, mientras los contadores sí leen.
   * Ofrecerlas como si dieran estado prometería un detalle que nadie sirve.
   */
  const r = await descubrirAlarmas(AREA, {
    explorar: arbolFalso({ [AREA]: [`${AREA}.Alarm_X`, `${AREA}=ActiveUnackedCount`] }),
  })
  assert.equal(r.alarmas[0].lee, false)
  assert.equal(r.contadores[0].lee, true)
})

await checkAsync('un área que no se puede explorar es UNKNOWN, no un área vacía', async () => {
  const r = await descubrirAlarmas(AREA, { explorar: arbolFalso({ [AREA]: 'FALLA' }) })
  assert.equal(r.estado, ESTADO_CONFIGURACION.UNKNOWN)
  assert.match(r.motivo, /no se ha podido mirar/i)
})

await checkAsync('una máquina sin área de alarmas lo dice, y no falla', async () => {
  const r = await descubrirAlarmas(null, { explorar: arbolFalso({}) })
  assert.equal(r.estado, ESTADO_CONFIGURACION.UNKNOWN)
  assert.deepEqual(r.contadores, [])
})

/* ── Resumen ─────────────────────────────────────────────────────────── */

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/lib/descubrirDesdeArbol.mjs.${c.reset}`)
  process.exit(1)
}
console.log(
  `${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `el descubridor propone, y se calla cuando no está seguro.${c.reset}`,
)
