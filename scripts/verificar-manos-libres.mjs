#!/usr/bin/env node
/**
 * scripts/verificar-manos-libres.mjs
 * ------------------------------------------------------------------
 * Comprueba las transformaciones de texto de la voz de salida, y el ciclo del
 * modo manos libres, **sin navegador**.
 *
 * ── POR QUÉ ESTO SE PRUEBA Y EL RESTO NO ───────────────────────────
 *
 * El hook de React vive en el navegador y necesitaría un DOM simulado para
 * probarse entero; este proyecto no tiene ese andamiaje y montarlo por un hook
 * no sale a cuenta. Lo que SÍ se puede probar aquí es lo que de verdad se
 * rompe en silencio:
 *
 *  - **`paraLeer`**, que decide cómo suena una cifra. Perder un «%» al leer
 *    «el tanque está al 62» es el error que este asistente no puede cometer, y
 *    es invisible mirando la pantalla, donde el símbolo sigue estando.
 *  - **El encadenado del ciclo**, reproducido con la misma forma que tiene el
 *    hook. Se rompió una vez —el efecto se reiniciaba en cada render y la
 *    limpieza cancelaba el turno siguiente— y el síntoma era que leía la
 *    primera respuesta y se quedaba mudo, sin ningún error por ninguna parte.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-manos-libres.mjs
 *
 * No necesita red, ni navegador, ni whisper.cpp.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

/* ── `paraLeer`, extraída del módulo del navegador ───────────────────── */

/**
 * `vozSalida.js` importa `window`, así que no se puede cargar aquí.
 *
 * Se lee el archivo y se evalúa SÓLO la función que interesa. Es feo, y la
 * alternativa era peor: duplicar la función en este archivo, que es la forma
 * segura de que la copia y el original diverjan sin que nadie se entere — y
 * entonces la prueba pasaría verificando código que ya no corre en ningún
 * sitio.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const fuente = readFileSync(
  join(RAIZ, 'react-dashboard/src/features/asistente/lib/vozSalida.js'), 'utf8'
)

const cuerpo = fuente.match(/function paraLeer\(texto\) \{[\s\S]*?\n\}/)
assert.ok(cuerpo, 'no se encontró `paraLeer` en vozSalida.js: ¿se renombró?')

/*
 * `new Function` a propósito: este verificador comprueba el TEXTO de
 * `paraLeer` tal y como viaja al navegador, sin importar el módulo entero (que
 * arrastraría `speechSynthesis`). La supresión de `no-new-func` que había aquí
 * sobraba: la regla no está activada en este árbol.
 */
const paraLeer = new Function(`${cuerpo[0]}; return paraLeer`)()

console.log(`\n${c.negrita}Voz de salida y manos libres${c.reset}`)
console.log('\n── Cómo suena una respuesta ────────────────────────────────')

check('el porcentaje se dice, no se pierde', () => {
  // Varias voces de SAPI se comen el símbolo y leen «sesenta y dos» a secas.
  assert.match(paraLeer('El tanque está al 62%.'), /62 por ciento/)
  assert.match(paraLeer('nivel 48 %'), /48 por ciento/)
})

check('los grados se dicen', () => {
  assert.match(paraLeer('La temperatura es 23.5°C'), /23\.5 grados/)
})

check('el aviso se anuncia con una palabra, no con un símbolo', () => {
  // El «⚠» se lee como nada en unas voces y como «símbolo de advertencia» en
  // otras. Ninguna de las dos es lo que se quería decir.
  const leido = paraLeer('⚠ Los límites son estimaciones nuestras.')
  assert.match(leido, /^Atención: /)
  assert.ok(!leido.includes('⚠'))
})

check('las viñetas no se leen como «punto medio»', () => {
  const leido = paraLeer('· Nivel: 62\n· Presión: 3.1')
  assert.ok(!leido.includes('·'))
  assert.match(leido, /Nivel/)
  assert.match(leido, /Presión/)
})

check('una hora no se deletrea dígito a dígito', () => {
  assert.match(paraLeer('El máximo fue a las 14:32.'), /14 32/)
  assert.match(paraLeer('ocurrió a las 09:05:11'), /9 05|09 05/)
})

check('un texto vacío no produce nada que leer', () => {
  assert.equal(paraLeer(''), '')
  assert.equal(paraLeer(null), '')
  assert.equal(paraLeer('   \n  '), '')
})

check('una respuesta normal sobrevive intacta', () => {
  // Lo que NO se toca importa tanto como lo que sí: una transformación de más
  // cambiaría el significado de una cifra de proceso.
  const original = 'El caudal instantáneo es 24.3 y la presión relativa 3.1. ' +
    'Lectura en tiempo real de ICONICS.'
  assert.equal(paraLeer(original), original)
})

console.log('\n── El markdown no se deletrea ──────────────────────────────')

check('la negrita no se lee como «asterisco asterisco»', () => {
  /*
   * ESTE es el fallo que motivó todo lo demás. Las instrucciones le prohíben
   * el markdown al modelo y lo escribe igual: medido contra el servidor real,
   * cada respuesta empezaba por «**Respuesta directa:**». En modo llamada la
   * voz lo decía literal, y una respuesta correcta se volvía ininteligible.
   *
   * Se quita AQUÍ y no pidiéndoselo al modelo, porque una instrucción se puede
   * ignorar —y la ignoraba— y esta función se ejecuta siempre.
   */
  const leido = paraLeer('**Respuesta directa:** No puedo decirte si están bien.')
  assert.ok(!leido.includes('*'), `quedaron asteriscos: ${leido}`)
  assert.match(leido, /^Respuesta directa: No puedo/)
})

check('la viñeta con sangría del modelo tampoco', () => {
  /* El modelo las escribe con tres espacios: «*   **texto:**». La regla
     anterior sólo miraba el principio de línea sin sangría. */
  const leido = paraLeer('*   **No hay vigilancia activa:** El diagnóstico está APAGADO.')
  assert.ok(!leido.includes('*'), `quedaron asteriscos: ${leido}`)
  assert.match(leido, /^No hay vigilancia activa: El diagnóstico/)
})

check('las comillas invertidas no se leen como «acento grave»', () => {
  const leido = paraLeer('El `vRMS_S1` vale 0.361.')
  assert.ok(!leido.includes('`'))
  assert.match(leido, /vRMS.S1 vale/)
})

check('de un enlace se dice el texto, nunca la dirección', () => {
  /* Leer «hache te te pe dos puntos barra barra localhost» en voz alta es
     ruido puro: nadie va a teclear una URL de oído. */
  const leido = paraLeer('Ver [la pantalla](http://localhost:5173/#/eva) para el detalle.')
  assert.match(leido, /Ver la pantalla para el detalle/)
  assert.ok(!leido.includes('http'))
  assert.ok(!leido.includes('['))
})

check('una tabla se convierte en frases, no en barras', () => {
  const leido = paraLeer('| Apoyo | vRMS |\n|---|---|\n| Lado acople | 0.361 |')
  assert.ok(!leido.includes('|'), `quedaron barras: ${leido}`)
  assert.ok(!leido.includes('---'), 'la línea separadora no se dice')
  assert.match(leido, /Apoyo, vRMS/)
  assert.match(leido, /Lado acople, 0\.361/)
})

check('los encabezados pierden las almohadillas', () => {
  const leido = paraLeer('### Conclusión\nEl motor gira sin carga.')
  assert.ok(!leido.includes('#'))
  assert.match(leido, /^Conclusión/)
})

check('no queda NINGUNA marca suelta, pase lo que pase', () => {
  /*
   * La red de seguridad. Un asterisco desparejado o una tabla mal cerrada
   * bastan para que la voz meta una palabra que nadie escribió, y no hay forma
   * de prever todas las maneras en que un modelo puede romper su propio
   * formato. Lo que sí se puede es garantizar que ninguna marca llega a la voz.
   */
  for (const roto of [
    'Esto es **negrita sin cerrar y sigue',
    'Una tabla | mal | cerrada',
    'Un `código sin cerrar',
    'Mezcla ** de _ todo # junto | ~',
  ]) {
    const leido = paraLeer(roto)
    assert.ok(!/[*_`#|~]/.test(leido), `«${roto}» dejó marcas: ${leido}`)
  }
})

console.log('\n── Las unidades de vibración se dicen enteras ──────────────')

check('mm/s y m/s² se pronuncian', () => {
  /*
   * Perder la unidad en una lectura de proceso es el error que este asistente
   * no puede cometer, y en vibración es peor que en el resto: 0,36 mm/s es una
   * máquina como nueva y 0,36 m/s² es otra magnitud distinta. Dichas a secas
   * suenan igual.
   */
  assert.match(paraLeer('vale 0.361 mm/s'), /0\.361 milímetros por segundo/)
  assert.match(paraLeer('el aRMS 2.971 m/s²'), /2\.971 metros por segundo al cuadrado/)
})

check('rpm y Hz también', () => {
  assert.match(paraLeer('gira a 604 rpm'), /604 revoluciones por minuto/)
  assert.match(paraLeer('el variador a 20.15 Hz'), /20\.15 hercios/)
})

check('la raya de un inciso se vuelve pausa, y el rango numérico se respeta', () => {
  /*
   * «—» leída suena a «raya». Una coma hace la misma pausa y no se pronuncia.
   * Pero en «3–5» la raya significa «a», no un inciso: convertirla en coma
   * diría «tres, cinco», que es otra cosa.
   */
  const inciso = paraLeer('gira a 604 rpm —sin carga— con el variador a 20 Hz.')
  assert.ok(!inciso.includes('—'), `quedó la raya: ${inciso}`)
  assert.match(inciso, /, sin carga, /)

  assert.match(paraLeer('Una máquina sana ronda 3–5 de cresta.'), /3–5/)
})

/* ── El ciclo del manos libres ───────────────────────────────────────── */

console.log('\n── El ciclo escucha → pregunta → habla → escucha ────────────')

/**
 * Reproduce la mecánica del hook con la MISMA forma: un efecto que se dispara
 * al cambiar la respuesta, una referencia para saber si el modo sigue activo, y
 * el encadenado por referencia.
 *
 * No es el hook —eso necesitaría React— pero sí es la lógica que se rompió, y
 * está escrita igual para que un cambio en el hook que reintrodujera el fallo
 * también lo reintrodujera aquí.
 */
function cicloDePrueba() {
  const traza = []
  const activoRef = { current: true }
  const yaLeido = { current: null }
  const escucharRef = { current: null }

  const escuchar = async () => {
    if (!activoRef.current) return
    traza.push('escuchando')
  }
  escucharRef.current = escuchar

  /** Lo que hace el efecto cuando llega una respuesta completa. */
  const alLlegarRespuesta = async (respuesta) => {
    if (!activoRef.current) return
    const texto = respuesta?.texto?.trim()
    if (!texto || texto === yaLeido.current) return

    if (respuesta.error || respuesta.cancelado) {
      activoRef.current = false
      traza.push('apagado')
      return
    }

    yaLeido.current = texto
    traza.push('hablando')
    await new Promise(r => setTimeout(r, 1))   // «hablar»
    if (!activoRef.current) return
    escucharRef.current?.()
  }

  return { traza, activoRef, alLlegarRespuesta, escuchar }
}

const ciclo1 = cicloDePrueba()
await ciclo1.escuchar()
await ciclo1.alLlegarRespuesta({ texto: 'El tanque está al 62 por ciento.' })

check('tras leer una respuesta, vuelve a escuchar', () => {
  assert.deepEqual(ciclo1.traza, ['escuchando', 'hablando', 'escuchando'])
})

const ciclo2 = cicloDePrueba()
await ciclo2.escuchar()
await ciclo2.alLlegarRespuesta({ texto: 'Primera.' })
await ciclo2.alLlegarRespuesta({ texto: 'Primera.' })   // el mismo turno otra vez

check('la misma respuesta no se lee dos veces', () => {
  const veces = ciclo2.traza.filter(p => p === 'hablando').length
  assert.equal(veces, 1, 'un re-render no puede hacer que repita la respuesta')
})

const ciclo3 = cicloDePrueba()
await ciclo3.escuchar()
await ciclo3.alLlegarRespuesta({ texto: 'algo', error: 'llama-server no responde' })

check('un turno que acabó en error apaga el modo, no se lee en voz alta', () => {
  // Leer un fallo con el mismo tono que un dato es la peor forma de contarlo, y
  // seguir escuchando después deja al operador hablándole a un modo muerto.
  assert.deepEqual(ciclo3.traza, ['escuchando', 'apagado'])
})

const ciclo4 = cicloDePrueba()
await ciclo4.escuchar()
ciclo4.activoRef.current = false                        // el usuario cuelga
await ciclo4.alLlegarRespuesta({ texto: 'Llega tarde.' })

check('colgar en mitad de una consulta impide que hable al llegar', () => {
  assert.deepEqual(ciclo4.traza, ['escuchando'])
})

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa react-dashboard/src/features/asistente/lib/vozSalida.js y useAsistente.js.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: la voz se mantiene.${c.reset}`)
