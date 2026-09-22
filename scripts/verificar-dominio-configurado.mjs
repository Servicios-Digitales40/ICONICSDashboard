#!/usr/bin/env node
/**
 * scripts/verificar-dominio-configurado.mjs
 * ------------------------------------------------------------------
 * El dominio de una máquina configurada, reconstruido desde sus roles.
 * Plan 34 F3.
 *
 * ── POR QUÉ ESTA ES LA PRUEBA DE EQUIVALENCIA ──────────────────────
 *
 * Porque lo que F3 tiene que demostrar no es que el adaptador funcione, sino
 * que **se comporta igual**: con la misma lectura, las 18 reglas tienen que
 * dar el mismo veredicto sobre la máquina configurada que sobre la escrita a
 * mano. Cualquier otra cosa es un diagnóstico distinto para la misma planta.
 *
 * Por eso casi todo lo de aquí compara las dos contra el mismo `valorDe`, y
 * en varios escenarios: no basta con que coincidan cuando todo va bien.
 *
 * ── EL ESCENARIO QUE MÁS IMPORTA ES «NADA RESPONDE» ────────────────
 *
 * Medido el 18-09-2026: pasarle un dominio vacío a `evaluarRiesgosVibracion`
 * devuelve **tres riesgos ACTIVOS** —los `dkw-sin-referencia`, una regla que
 * dispara ante la AUSENCIA de dato—. La regla es correcta; lo falso sería
 * afirmarlos sobre apoyos que nadie declaró.
 *
 * Así que un adaptador que omitiera claves en vez de ponerlas a `null`
 * pasaría todos los escenarios buenos y fallaría justo en el que importa. De
 * ahí que la reconstrucción recorra las claves DEL TIPO y no las de la
 * configuración.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-dominio-configurado.mjs
 */
import assert from 'node:assert/strict'

import { construirSistema } from '../shared/eva/comun/construirSistema.js'
import { dominioDesdeRoles } from '../shared/eva/comun/dominioDesdeRoles.js'
import { tipoDe } from '../shared/eva/tipos/index.js'
import { createSistemaVibraciones } from '../shared/eva/vibraciones/sistemaVibraciones.js'
import { evaluarRiesgosVibracion } from '../shared/eva/vibraciones/riesgosVibracion.js'
import { decodificarVigilancia } from '../shared/eva/vibraciones/vibraciones.js'
import { CATALOGO_VIBRACIONES } from '../shared/eva/vibraciones/catalogoDemo.js'
import { configuracionEspejo } from './lib/configuracionEspejo.mjs'

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

/* La configuración se genera AHORA, no se guarda un JSON viejo. Mismo motivo
   que en `verificar-vibraciones-configurada.mjs`. */
const { configurada: maquina } = configuracionEspejo({ verificadasDelCatalogo: true })
const TIPO = tipoDe('vibraciones')
const configurada = construirSistema(maquina, TIPO)
/* La referencia es el catálogo del tipo (Plan 40 F3), no una entrada del registro. */
const aMano = CATALOGO_VIBRACIONES

/** Lecturas de mentira. Cada una ejercita el adaptador de otra forma. */
const ESCENARIOS = {
  'hash del nombre': (p) => (typeof p === 'string' ? p.length % 17 : null),
  'todo a cero': () => 0,
  'vRMS alto': (p) => (String(p).includes('vRMS') ? 9.5 : 1),
  'nada responde': () => null,
}

const dominioAMano = (valorDe) => createSistemaVibraciones(valorDe)
const dominioRecon = (valorDe) =>
  dominioDesdeRoles(maquina, TIPO, valorDe, {
    leerEstado: (p) => decodificarVigilancia(valorDe(p)),
  })

console.log(`\n${c.negrita}El dominio reconstruido desde roles${c.reset}\n`)

/* ── La forma ────────────────────────────────────────────────────────── */

check('la forma es la misma: mismos apoyos, mismas claves por apoyo', () => {
  const a = dominioAMano(() => 1)
  const r = dominioRecon(() => 1)

  assert.deepEqual(Object.keys(r.canales).sort(), Object.keys(a.canales).sort())
  for (const canal of Object.keys(a.canales)) {
    assert.deepEqual(
      Object.keys(r.canales[canal]).sort(),
      Object.keys(a.canales[canal]).sort(),
      `el apoyo «${canal}» no tiene las mismas claves`,
    )
  }
})

check('el variador tiene las mismas claves', () => {
  const a = dominioAMano(() => 1)
  const r = dominioRecon(() => 1)
  assert.deepEqual(Object.keys(r.variador).sort(), Object.keys(a.variador).sort())
})

check('las vigilancias y calidades se anidan igual, no se aplanan', () => {
  /* Las reglas leen `d.canales.S1.vigilancias.bpfo`. Aplanarlas daría un
     dominio con los mismos datos que ninguna regla sabría leer. */
  const r = dominioRecon(() => 1)
  for (const canal of Object.keys(r.canales)) {
    assert.equal(typeof r.canales[canal].vigilancias, 'object')
    assert.equal(typeof r.canales[canal].calidades, 'object')
  }
})

/* ── Los valores ─────────────────────────────────────────────────────── */

check('los valores coinciden uno a uno, en los cuatro escenarios', () => {
  for (const [nombre, valorDe] of Object.entries(ESCENARIOS)) {
    const a = dominioAMano(valorDe)
    const r = dominioRecon(valorDe)

    for (const canal of Object.keys(a.canales)) {
      for (const [clave, valor] of Object.entries(a.canales[canal])) {
        /* `sensor` no sale de un rol: se compara aparte, más abajo. */
        if (clave === 'sensor') continue
        assert.deepEqual(
          r.canales[canal][clave], valor,
          `[${nombre}] canales.${canal}.${clave}`,
        )
      }
    }
    for (const [clave, valor] of Object.entries(a.variador)) {
      assert.deepEqual(r.variador[clave], valor, `[${nombre}] variador.${clave}`)
    }
  }
})

/* ── La equivalencia que da sentido a la fase ────────────────────────── */

check('las 18 reglas dan el MISMO veredicto en los cuatro escenarios', () => {
  for (const [nombre, valorDe] of Object.entries(ESCENARIOS)) {
    const a = dominioAMano(valorDe)
    const r = dominioRecon(valorDe)
    /* Las alarmas se le pasan al reconstruido: sin ellas la comparación
       mediría la limitación conocida en vez de la equivalencia. */
    const rConAlarmas = { ...r, alarmas: a.alarmas }

    const ids = (res) => res.activos.map((x) => `${x.id}@${x.canal ?? '-'}`).sort()
    assert.deepEqual(
      ids(evaluarRiesgosVibracion(rConAlarmas)),
      ids(evaluarRiesgosVibracion(a)),
      `[${nombre}] los riesgos activos no coinciden`,
    )
  }
})

check('«nada responde» NO inventa riesgos: es el escenario que lo destapa', () => {
  /*
   * El caso del 18-09-2026. Un adaptador que omitiera claves en vez de
   * ponerlas a `null` pasaría los otros tres escenarios y fallaría aquí.
   */
  const a = evaluarRiesgosVibracion(dominioAMano(() => null))
  const r = evaluarRiesgosVibracion({ ...dominioRecon(() => null), alarmas: {} })
  assert.equal(r.activos.length, a.activos.length)
})

/* ── Lo que falta, declarado ─────────────────────────────────────────── */

check('una clave que la configuración no declara vale `null`, no falta', () => {
  /*
   * La invariante que hace seguro el adaptador. Una clave AUSENTE y una a
   * `null` se leen distinto desde una regla: la primera parece un descuido
   * del programador, la segunda es un dato que no llegó (`CLAUDE.md` §2.4).
   */
  const sinNada = dominioDesdeRoles({ variables: [] }, TIPO, () => 1)
  for (const canal of Object.keys(sinNada.canales)) {
    assert.ok(
      Object.hasOwn(sinNada.canales[canal], 'vRMS'),
      `«${canal}» perdió la clave vRMS en vez de ponerla a null`,
    )
    assert.equal(sinNada.canales[canal].vRMS, null)
  }
  /* Y además se APUNTAN: un hueco que no se cuenta no se puede explicar. */
  assert.ok(sinNada.sinDato.length > 0, 'los huecos tienen que apuntarse en sinDato')
})

check('las piezas que NO salen de un rol se declaran, no se fingen', () => {
  /*
   * `sensores` y `alarmas` no son roles del tipo: las alarmas son del
   * servidor de ICONICS y el estado del sensor es del SM 1281. Ninguna
   * describe una medida del motor.
   */
  const r = dominioRecon(() => 1)
  assert.deepEqual(r.sinRoles.sort(), ['alarmas', 'sensores'])
})

check('sin alarmas leídas, `alarmas` va vacío y NO como «cero alarmas»', () => {
  /*
   * La diferencia es la de siempre: `{}` con las reglas de alarma detrás se
   * lee como máquina tranquila. Aquí no dispara ninguna, que es lo correcto
   * cuando no se ha mirado — pero queda dicho en `sinRoles`.
   */
  const r = dominioRecon(() => 5)
  const res = evaluarRiesgosVibracion(r)
  assert.ok(!res.activos.some((x) => String(x.id).startsWith('alarmas-')))
  assert.ok(r.sinRoles.includes('alarmas'))
})

check('sin decodificador, las vigilancias son HUECO y no «en orden»', () => {
  /*
   * Leerlas como «en orden» apagaría ocho reglas en silencio, que es el modo
   * de fallo más caro de este adaptador.
   */
  const r = dominioDesdeRoles(maquina, TIPO, () => 'QUJD', { leerEstado: null })
  for (const canal of Object.keys(r.canales)) {
    for (const v of Object.values(r.canales[canal].vigilancias)) {
      assert.equal(v, null)
    }
  }
})

/* ── Conectado al registro ───────────────────────────────────────────── */

check('`construirSistema` ya NO entrega `dominio: null`', () => {
  const estado = configurada.estado(() => 1, configurada, new Date().toISOString())
  assert.ok(estado.dominio, 'la máquina configurada sigue sin forma de dominio')
  assert.ok(estado.dominio.canales)
  assert.ok(estado.dominio.variador)
})

check('una máquina SIN roles sigue dando `dominio: null`, y es correcto', () => {
  /*
   * La guarda de `evaluarRiesgosDe` no se ha retirado y no debe retirarse:
   * una máquina cuyas variables no declaran rol no tiene con qué
   * reconstruir, y un dominio a medias es peor que ninguno.
   */
  const pelada = construirSistema(
    { ...maquina, variables: maquina.variables.map((v) => ({ ...v, rol: null })) },
    TIPO,
  )
  const estado = pelada.estado(() => 1, pelada, new Date().toISOString())
  assert.equal(estado.dominio, null)
})

check('la máquina configurada y la escrita a mano diagnostican IGUAL', () => {
  /* De punta a punta: por el registro, no por el adaptador directamente. */
  for (const [nombre, valorDe] of Object.entries(ESCENARIOS)) {
    const eC = configurada.estado(valorDe, configurada, new Date().toISOString())
    const eA = aMano.estado(valorDe, aMano, new Date().toISOString())

    const rC = evaluarRiesgosVibracion({ ...eC.dominio, alarmas: eA.dominio.alarmas })
    const rA = evaluarRiesgosVibracion(eA.dominio)

    const ids = (res) => res.activos.map((x) => `${x.id}@${x.canal ?? '-'}`).sort()
    assert.deepEqual(ids(rC), ids(rA), `[${nombre}] a través del registro`)
  }
})

/* ── Resumen ─────────────────────────────────────────────────────────── */

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa shared/eva/comun/dominioDesdeRoles.js.${c.reset}`)
  process.exit(1)
}
console.log(
  `${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
  `una máquina configurada diagnostica igual que la escrita a mano.${c.reset}`,
)
console.log(
  `${c.gris}Lo que NO reconstruye —y está declarado— son las alarmas y el estado ` +
  `del sensor:\nno salen de un rol del tipo. Se recogen en F4.${c.reset}`,
)
