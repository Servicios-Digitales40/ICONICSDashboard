#!/usr/bin/env node
/**
 * scripts/verificar-deteccion-voz.mjs
 * ------------------------------------------------------------------
 * El detector de fin de turno del modo llamada, **sin navegador ni micrófono**.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Por un fallo real que se escapó por no poder probarse. La primera versión
 * calibraba el ruido ambiente con el MÁXIMO de los primeros 300 ms, y eso
 * falla justo en el caso normal: la gente pulsa el botón y habla
 * inmediatamente, así que lo que se tomaba como «silencio de referencia» era
 * su propia voz. El umbral quedaba por encima del volumen al que estaba
 * hablando, nunca se detectaba habla, y por tanto nunca se detectaba que
 * había parado: el turno no se cerraba jamás.
 *
 * En pantalla eso era «se activa el micrófono pero no registra nada ni
 * contesta», sin ningún error por ninguna parte.
 *
 * La lógica vive en `audio.js` dentro de un `AudioContext`, que no existe en
 * Node. Se extrae la DECISIÓN —a partir de una secuencia de niveles, ¿cuándo
 * se cierra el turno?— y se prueba contra secuencias que reproducen casos
 * reales: hablar desde el primer instante, una sala ruidosa, pausas entre
 * frases, y un micrófono mudo.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-deteccion-voz.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/* ── Las constantes se leen del código, no se copian ─────────────────── */

/**
 * Se extraen del archivo real en vez de repetirlas aquí.
 *
 * Copiarlas sería la forma segura de que un cambio en `audio.js` —bajar el
 * umbral, alargar el silencio— dejara estas pruebas verificando números que
 * ya no corren en ningún sitio, y pasando.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const fuente = readFileSync(
  join(RAIZ, 'react-dashboard/src/features/asistente/lib/audio.js'), 'utf8'
)

function constante(nombre) {
  const m = fuente.match(new RegExp(`const ${nombre} = ([\\d.]+)`))
  assert.ok(m, `no se encontró la constante ${nombre} en audio.js`)
  return Number(m[1])
}

const MS_ENTRE_MEDIDAS = constante('MS_ENTRE_MEDIDAS')
const MS_SILENCIO_FIN = constante('MS_SILENCIO_FIN')
const MS_MINIMO_HABLA = constante('MS_MINIMO_HABLA')
const FRACCION_DEL_PICO = constante('FRACCION_DEL_PICO')
const UMBRAL_MINIMO = constante('UMBRAL_MINIMO')
const DECAIMIENTO_DEL_PICO = constante('DECAIMIENTO_DEL_PICO')
const MS_MAXIMO_TURNO = constante('MS_MAXIMO_TURNO')

/**
 * La misma decisión que toma `vigilarSilencio`, sobre una lista de niveles.
 *
 * @param {number[]} niveles  una medida cada `MS_ENTRE_MEDIDAS`
 * @returns {number|null} en qué medida se cerró el turno, o `null` si no se cerró
 */
function cuandoSeCierra(niveles) {
  let pico = 0
  let hablando = false
  let calladoDesde = null

  for (let i = 0; i < niveles.length; i++) {
    const ahora = i * MS_ENTRE_MEDIDAS
    const nivel = niveles[i]

    if (ahora >= MS_MAXIMO_TURNO) return i

    pico = Math.max(nivel, pico * DECAIMIENTO_DEL_PICO)
    const umbral = Math.max(UMBRAL_MINIMO, pico * FRACCION_DEL_PICO)

    if (nivel > umbral) {
      hablando = true
      calladoDesde = null
      continue
    }

    if (!hablando || ahora < MS_MINIMO_HABLA) continue

    calladoDesde ??= ahora
    if (ahora - calladoDesde >= MS_SILENCIO_FIN) return i
  }

  return null
}

/** Una secuencia de niveles, en segundos de cada tramo. */
function secuencia(...tramos) {
  const niveles = []
  for (const [segundos, nivel] of tramos) {
    const n = Math.round((segundos * 1000) / MS_ENTRE_MEDIDAS)
    for (let i = 0; i < n; i++) {
      // Un poco de variación: un nivel perfectamente constante no existe en un
      // micrófono real y probaría un caso que nunca ocurre.
      niveles.push(nivel * (0.9 + Math.random() * 0.2))
    }
  }
  return niveles
}

const SILENCIO_OFICINA = 0.004
const SILENCIO_PLANTA = 0.03
const VOZ = 0.18

console.log(`\n${c.negrita}Detección de fin de turno${c.reset}`)
console.log('\n── El caso que estaba roto ─────────────────────────────────')

check('hablar DESDE EL PRIMER INSTANTE cierra el turno igual', () => {
  /*
   * EL FALLO. Nadie pulsa el botón y espera educadamente a que se calibre el
   * ruido: se pulsa y se habla. Con la calibración por máximo inicial, la
   * propia voz se tomaba como silencio de referencia y el turno no se cerraba
   * NUNCA.
   */
  const cierre = cuandoSeCierra(secuencia([4, VOZ], [3, SILENCIO_OFICINA]))
  assert.ok(cierre !== null, 'el turno tiene que cerrarse')

  const msHastaCierre = cierre * MS_ENTRE_MEDIDAS
  assert.ok(
    msHastaCierre >= 4000 + MS_SILENCIO_FIN - 300 && msHastaCierre <= 4000 + MS_SILENCIO_FIN + 500,
    `debía cerrarse ~${MS_SILENCIO_FIN} ms tras callarse; fue a los ${msHastaCierre} ms`
  )
})

console.log('\n── Que no corte donde no debe ──────────────────────────────')

check('una pausa entre frases NO cierra el turno', () => {
  // «el nivel del tanque… ¿cuánto ha bajado?». Una pausa de medio segundo es
  // pensar, no terminar.
  const cierre = cuandoSeCierra(
    secuencia([2, VOZ], [0.5, SILENCIO_OFICINA], [2, VOZ], [3, SILENCIO_OFICINA])
  )
  const msHastaCierre = cierre * MS_ENTRE_MEDIDAS
  assert.ok(msHastaCierre > 4000, `cortó en la pausa, a los ${msHastaCierre} ms`)
})

check('el ruido de una sala de máquinas no cuenta como habla', () => {
  /*
   * Con un umbral fijo, un fondo de 0,03 estaría siempre «hablando» y el turno
   * no acabaría nunca. El suelo rodante lo aprende y exige superarlo.
   */
  const cierre = cuandoSeCierra(secuencia([3, VOZ], [3, SILENCIO_PLANTA]))
  assert.ok(cierre !== null, 'con ruido de fondo el turno tiene que cerrarse igual')
  assert.ok(cierre * MS_ENTRE_MEDIDAS < 6000, 'y no esperar al tope de seguridad')
})

check('el silencio del principio no cierra el turno antes de hablar', () => {
  // Alguien que pulsa y tarda dos segundos en arrancar. Sin la guarda de
  // `MS_MINIMO_HABLA` y de `hablando`, el turno se cerraría vacío al instante
  // y el modo entraría en un bucle de transcripciones en blanco.
  const cierre = cuandoSeCierra(secuencia([2, SILENCIO_OFICINA], [2, VOZ], [3, SILENCIO_OFICINA]))
  assert.ok(cierre * MS_ENTRE_MEDIDAS > 4000, 'cerró antes de que llegara a hablar')
})

console.log('\n── La red de seguridad ─────────────────────────────────────')

check('un micrófono mudo cierra el turno por tiempo, no se queda colgado', () => {
  /*
   * Si el micrófono está silenciado por el sistema, no llega nada y no hay
   * habla que detectar. Sin el tope, el modo llamada se queda esperando para
   * siempre — que es exactamente el fallo que se está arreglando, sólo que por
   * otra causa.
   */
  const cierre = cuandoSeCierra(secuencia([60, 0]))
  assert.ok(cierre !== null, 'tiene que cerrarse igualmente')
  assert.ok(
    cierre * MS_ENTRE_MEDIDAS >= MS_MAXIMO_TURNO,
    'y sólo al llegar al tope, no antes'
  )
})

check('hablar sin parar acaba cerrando por el tope', () => {
  // Nadie habla cuarenta segundos seguidos a un tablero, pero si ocurre el
  // turno tiene que acabar en vez de crecer sin límite.
  const cierre = cuandoSeCierra(secuencia([60, VOZ]))
  assert.ok(cierre !== null, 'tiene que cerrarse por el tope')
  assert.ok(cierre * MS_ENTRE_MEDIDAS >= MS_MAXIMO_TURNO)
})

/* ── Resultado ───────────────────────────────────────────────────────── */

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa react-dashboard/src/features/asistente/lib/audio.js.${c.reset}`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}${passed} comprobaciones correctas: el fin de turno se detecta.${c.reset}`)
