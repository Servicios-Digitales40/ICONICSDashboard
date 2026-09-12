#!/usr/bin/env node
/**
 * scripts/verificar-frescura.mjs
 * ------------------------------------------------------------------
 * Que ninguna pantalla enseñe el valor de una señal sin decir si es de ahora.
 *
 * ── POR QUÉ ESTO NECESITA UN GUION (Plan 24 F0 · USO-01) ───────────
 *
 * Porque el modo de fallo es invisible, y lo es de la peor manera: **una cifra
 * vieja se ve exactamente igual que una fresca**. No hay excepción en consola,
 * no hay pantalla en blanco, no hay prueba que se ponga roja. El tablero se ve
 * perfecto en la máquina de quien lo escribió —donde el sondeo funciona— y
 * miente el día que el puente se cae en planta, que es justo el día que
 * alguien lo está mirando para decidir algo.
 *
 * Y ya pasó una vez, con esta forma exacta. El 07-09-2026, en planta, el panel
 * de salud (Plan 20 F10) daba el asistente y el dictado por «Funcionando» con
 * los dos servicios caídos: `servicio()` equiparaba «configurado» con
 * «funcionando» —su parámetro `ok` tenía valor por defecto `true` y nadie lo
 * pasaba nunca— así que no se contactaba a ninguno. La lección que este guion
 * hereda: **lo que se enseña tiene que venir de haber preguntado**, y nada que
 * informe del estado de un dato puede tener el optimismo por defecto.
 *
 * `Demo-EVA/data/comunes/estadoDelDato.js` existe para contestar esa pregunta
 * una sola vez, y la contesta bien. El riesgo no es que esté mal: es que quien
 * escriba la tarjeta número veinte no se entere de que existe.
 *
 * ── QUÉ MIRA, Y POR QUÉ ES UNA FORMA Y NO UN COMPORTAMIENTO ────────
 *
 * Todo archivo de presentación de `Demo-EVA/` que formatee el valor de una
 * señal (`fmtSenal`, `fmtCifra`) tiene que pasar por `presentarValor()` — o
 * declarar por qué no, en `EXENTOS`, con su motivo escrito.
 *
 * Se lee el fuente como TEXTO en vez de montar los componentes porque lo que
 * se busca es una forma sintáctica, no un resultado en pantalla. Montarlos
 * exigiría jsdom, un tema, un proveedor de i18n y datos falsos por cada
 * componente — y aun así sólo probaría los casos que a alguien se le ocurriera
 * escribir. El comportamiento ya lo prueban `test/demo-eva/edad-dato.test.jsx`
 * y `estado-dato.test.js`, con reloj falso, que es donde corresponde. Es el
 * mismo reparto que ya usa `verificar-codigos.mjs` con las rutas del backend.
 *
 * ── POR QUÉ SÓLO `Demo-EVA/` Y NO `modulos/prediccion/` ────────────
 *
 * Porque la frescura de una lectura es una pregunta sobre un dato EN VIVO, y
 * Predicción no tiene ninguno. Medido el 11-09-2026 antes de decidirlo:
 * `modulos/prediccion/` no usa `fmtSenal` ni `fmtCifra` en ningún archivo, no
 * pasa por el motor de sondeo (`lib/iconics/pollingEngine.js`) y por tanto no
 * tiene `receivedAt` ni `stale` que interpretar. Lo que enseña es el histórico
 * de un compresor real consultado a Django (`data/predictionApi.js`), y un
 * histórico no envejece mientras lo miras: la muestra de ayer sigue siendo la
 * muestra de ayer.
 *
 * Es la separación de CLAUDE.md §4.7 —módulo y sistema no son lo mismo, y la
 * fuente es lo que los distingue— aplicada a esta comprobación. Darle a
 * Predicción una frescura inventada a partir de cuándo se hizo el `fetch`
 * respondería una pregunta distinta de la que el usuario lee («¿este número es
 * de ahora?») y sería exactamente el tipo de dato fabricado que CLAUDE.md §2.5
 * prohíbe.
 *
 * Si algún día Predicción sirve un valor en vivo, esto se amplía — y se
 * amplía cambiando la raíz que se recorre, no añadiendo una exención.
 *
 * ── LA LISTA QUE SE ENUMERA ES LA DE EXENCIONES, NO LA DE COBERTURA ─
 *
 * A propósito, y es la misma decisión que `verificar-todo.mjs` tomó al
 * DESCUBRIR la carpeta `scripts/` en vez de llevar una lista: un archivo nuevo
 * entra en la comprobación por existir. Si lo enumerado fuera lo que se mira,
 * la tarjeta nueva nacería fuera del guion y éste seguiría en verde —
 * exactamente el fallo que viene a evitar.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-frescura.mjs
 *
 * Sin red, sin build. Entra solo en `npm run verificar` (Plan 20 F2).
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SRC = join(AQUI, '..', 'react-dashboard', 'src')
const DEMO = join(SRC, 'Demo-EVA')

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
    console.log(`    ${c.gris}${error.message.split('\n').slice(0, 12).join('\n    ')}${c.reset}`)
  }
}

/* ── Carga ───────────────────────────────────────────────────────────── */

/** Formateadores de `Demo-EVA/lib/formato.js` que reciben una SEÑAL entera. */
const FORMATEA_SENAL = /\bfmt(Senal|Cifra)\s*\(/

/** La puerta por la que hay que pasar: `data/comunes/estadoDelDato.js`. */
const PASA_POR_FRESCURA = /\bpresentarValor\s*\(/

/**
 * Archivos que formatean una señal y NO pasan por `presentarValor()` a
 * propósito. Cada uno con su motivo, y el motivo tiene que ser del archivo —
 * no «todavía no me he puesto».
 *
 * Vacía hoy, y que siga así es la señal de que esto va bien. Una exención
 * nueva es una decisión, no un trámite: se escribe aquí con su porqué, del
 * mismo modo que `verificar-todo.mjs` enumera y razona sus dos exclusiones.
 */
const EXENTOS = new Map([
  // ['Demo-EVA/ruta/Archivo.jsx', 'el motivo, concreto y del archivo'],
])

/**
 * El fuente sin sus comentarios.
 *
 * Hace falta porque este proyecto documenta en prosa lo que decide en código, y
 * esa prosa NOMBRA las funciones de las que habla. La primera versión de la
 * comprobación de relojes contó dos `useAhora()` en `FichaActivo.jsx`: la
 * llamada real y la mención dentro del comentario que explica por qué la fila
 * recibe `ahora` como prop. Un guion que cuenta llamadas sobre texto crudo
 * castiga escribir buenas cabeceras, que es exactamente al revés de lo que este
 * repo quiere.
 *
 * No pretende ser un parser: los literales de cadena que contengan `//` quedan
 * fuera del alcance de esto, y no importa — lo que se cuenta son llamadas a
 * hooks, que no viven dentro de cadenas.
 */
function sinComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Todo `.js`/`.jsx` bajo una carpeta, recursivo, sin pruebas. */
function archivosDe(raiz) {
  const salida = []

  for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
    const ruta = join(raiz, entrada.name)
    if (entrada.isDirectory()) {
      salida.push(...archivosDe(ruta))
    } else if (/\.jsx?$/.test(entrada.name)) {
      salida.push(ruta)
    }
  }

  return salida
}

/**
 * Archivos que no son presentación y por tanto no son candidatos: son la
 * INFRAESTRUCTURA de esto.
 *
 * No van en `EXENTOS` a propósito. Una exención dice «esto pinta un valor y
 * hemos decidido que aquí no aplica»; esto dice algo distinto y anterior:
 * `formato.js` es donde `fmtSenal` se DEFINE, y `estadoDelDato.js` es la propia
 * puerta. Exigirle a la definición de `fmtSenal` que pase por `presentarValor`
 * sería pedirle a una función pura que consulte un reloj — y mezclarlos en la
 * misma lista invitaría a añadir ahí un archivo de vista «porque también sale
 * en la lista».
 */
const NO_ES_PRESENTACION = new Set([
  'Demo-EVA/lib/formato.js',
  'Demo-EVA/data/comunes/estadoDelDato.js',
])

/**
 * `texto` va SIN comentarios a propósito, y lo heredan las tres
 * comprobaciones: todas preguntan por código que se ejecuta, y en este repo un
 * comentario menciona por su nombre la función de la que habla. Ver
 * `sinComentarios()`.
 */
const archivos = archivosDe(DEMO)
  .map(ruta => ({
    id: relative(SRC, ruta).replace(/\\/g, '/'),
    texto: sinComentarios(readFileSync(ruta, 'utf8')),
  }))
  .filter(({ id }) => !NO_ES_PRESENTACION.has(id))

/* ── Las comprobaciones ──────────────────────────────────────────────── */

check('todo archivo que formatea una señal pasa por presentarValor()', () => {
  const culpables = archivos
    .filter(({ texto }) => FORMATEA_SENAL.test(texto))
    .filter(({ texto }) => !PASA_POR_FRESCURA.test(texto))
    .filter(({ id }) => !EXENTOS.has(id))
    .map(({ id }) => id)

  assert.ok(
    culpables.length === 0,
    `formatean el valor de una señal sin decir su frescura (${culpables.length}):\n` +
    culpables.map(f => `  ${f}`).join('\n') + '\n' +
    'Pasa el valor por `presentarValor()` de `Demo-EVA/data/comunes/estadoDelDato.js`\n' +
    '(el reloj lo da `Demo-EVA/lib/useAhora.js`, UNO por vista y pasado como prop),\n' +
    'o si de verdad no aplica, decláralo en EXENTOS de este guion con su motivo.'
  )
})

check('ninguna exención sobra ni apunta a un archivo que ya no existe', () => {
  const ids = new Set(archivos.map(a => a.id))
  const problemas = []

  for (const [id, motivo] of EXENTOS) {
    if (!ids.has(id)) {
      problemas.push(`${id} — exento, pero ese archivo ya no existe`)
      continue
    }
    const { texto } = archivos.find(a => a.id === id)
    if (!FORMATEA_SENAL.test(texto)) {
      problemas.push(`${id} — exento, pero ya no formatea ninguna señal`)
    } else if (PASA_POR_FRESCURA.test(texto)) {
      problemas.push(`${id} — exento, pero ya pasa por presentarValor(): quita la exención`)
    }
    if (!String(motivo ?? '').trim()) {
      problemas.push(`${id} — exento sin motivo escrito`)
    }
  }

  assert.ok(
    problemas.length === 0,
    `exenciones que ya no se sostienen (${problemas.length}):\n` +
    problemas.map(p => `  ${p}`).join('\n') + '\n' +
    'Una exención que sobra es peor que ninguna: dice que un caso está pensado cuando no lo está.'
  )
})

check('un solo reloj por archivo, no uno por componente', () => {
  /*
   * `useAhora.js` documenta el antipatrón que evita: un `setInterval` por FILA
   * —ocho señales por activo son ocho temporizadores repintando cada segundo
   * por algo que un solo reloj arriba resuelve igual.
   *
   * Lo que este guion puede comprobar de verdad es el número de RELOJES por
   * archivo. Un archivo con un `useAhora()` y varios componentes que reciben
   * `ahora` como prop es el patrón CORRECTO —reloj arriba, pasado hacia
   * abajo— y una primera versión de esta comprobación lo marcaba como fallo,
   * que es justo al revés. Dos o más llamadas en el mismo archivo, en cambio,
   * son siempre sospechosas: significa que alguien añadió el segundo sin ver
   * el primero.
   */
  const culpables = archivos
    .map(({ id, texto }) => ({ id, relojes: (texto.match(/\buseAhora\s*\(/g) ?? []).length }))
    .filter(({ relojes }) => relojes > 1)
    .map(({ id, relojes }) => `${id} — ${relojes} llamadas a useAhora()`)

  assert.ok(
    culpables.length === 0,
    `más de un reloj en el mismo archivo (${culpables.length}):\n` +
    culpables.map(f => `  ${f}`).join('\n') + '\n' +
    'Un reloj por vista, pasado hacia abajo como prop. Ver la cabecera de `Demo-EVA/lib/useAhora.js`.'
  )
})

check('estadoDelDato.js sigue sin optimismo por defecto', () => {
  /*
   * La lección del 07-09-2026, convertida en comprobación. `frescuraDe()` sin
   * `receivedAt` tiene que contestar SIN_DATO, nunca FRESCO: el valor por
   * defecto de una función que informa del estado de un dato no puede ser el
   * bueno. Es la forma exacta en que el panel de salud dio «Funcionando» con
   * los servicios caídos.
   */
  const texto = readFileSync(join(DEMO, 'data', 'comunes', 'estadoDelDato.js'), 'utf8')

  assert.match(
    texto,
    /if\s*\(\s*!\s*receivedAt\s*\)\s*return\s+FRESCURA\.SIN_DATO/,
    'frescuraDe() debe devolver SIN_DATO cuando no hay `receivedAt`, y hacerlo ANTES de nada más.\n' +
    'Sin lectura no hay frescura que afirmar — y afirmar la buena es el fallo del 07-09-2026.'
  )

  assert.doesNotMatch(
    texto,
    /stale\s*=\s*true/,
    '`stale` no puede llevar `true` por defecto, pero tampoco es eso lo que protege esto:\n' +
    'lo que no puede pasar es que un parámetro de estado tenga por defecto el valor OPTIMISTA\n' +
    'y nadie lo pase nunca. Si este assert te estorba, lee antes el incidente de la cabecera.'
  )
})

/* ── Resumen ─────────────────────────────────────────────────────────── */

const conFormato = archivos.filter(({ texto }) => FORMATEA_SENAL.test(texto)).length

if (fallos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallos.length} fallo(s).${c.reset}\n`)
} else {
  console.log(
    `\n${c.verde}${c.negrita}${passed} comprobaciones correctas: ` +
    `${conFormato} archivos formatean señales, ${EXENTOS.size} exentos.${c.reset}\n`
  )
}

assert.equal(fallos.length, 0, `${fallos.length} comprobaciones de frescura fallaron`)
