/**
 * La tanda completa de verificadores que corren SIN RED.
 *
 *   node scripts/verificar-todo.mjs
 *
 * ── POR QUÉ ESTE GUION Y NO UNA LISTA EN EL WORKFLOW ───────────────
 *
 * Porque una lista escrita en `.github/workflows/ci.yml` es un segundo
 * inventario de verificadores, y el segundo inventario siempre se queda atrás:
 * alguien añade `verificar-alarmas.mjs`, lo prueba a mano, lo comitea, y CI no
 * lo corre nunca. Nada falla — simplemente esa comprobación deja de existir
 * sin que nadie lo decida.
 *
 * Así que aquí no hay lista de lo que SÍ se corre: se DESCUBRE la carpeta.
 * Lo que hay es una lista corta de lo que se excluye, con el motivo pegado a
 * cada entrada, que es la información que de verdad hace falta mantener. Un
 * verificador nuevo entra en la tanda por existir.
 *
 * ── QUÉ SE QUEDA FUERA, Y POR QUÉ ──────────────────────────────────
 *
 * Los que necesitan algo que una máquina de CI no tiene: red a la planta, o un
 * servidor de IA con GPU. No es que fallen «por ahora»: fallan siempre fuera de
 * la red de planta, y meterlos aquí convertiría el rojo en el estado normal de
 * la tanda, que es la forma más rápida de que nadie vuelva a mirarla.
 *
 * ── Y LOS `medir-*` NO SON VERIFICADORES ───────────────────────────
 *
 * No entran porque no se llaman `verificar-*`, y eso no es casualidad: un
 * `medir-*` informa y no devuelve código de error (ver la cabecera de
 * `medir-calibracion.mjs`). La distinción es la que impide poner un umbral a
 * ojo y después escribir la prueba que lo confirme, así que el descubrimiento
 * la respeta por construcción.
 */
import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))

/**
 * Lo que NO entra en la tanda, con el porqué.
 *
 * Cada entrada tiene que decir qué le falta a una máquina de CI para poder
 * ejecutarlo. Si alguien añade uno aquí sin motivo, se nota al leerlo.
 */
const FUERA = new Map([
  [
    'verificar-antiguedad-historico.mjs',
    'necesita red a la planta y `--env-file=.env.local`: mide la edad de la última ' +
      'muestra REAL del historiador, y contra el transporte falso no significaría nada.',
  ],
  [
    'verificar-bundle.mjs',
    'necesita `react-dashboard/dist`, que sólo existe tras compilar. Lo corre el trabajo ' +
      'de frontend justo después de `npm run build`, que es donde tiene sentido.',
  ],
])

const c = {
  reset: '\x1b[0m',
  negrita: '\x1b[1m',
  verde: '\x1b[32m',
  rojo: '\x1b[31m',
  gris: '\x1b[90m',
}

/** Corre un verificador y devuelve si pasó, cuánto tardó y qué escribió. */
function correr(archivo) {
  return new Promise(resolve => {
    const empezado = Date.now()
    const hijo = spawn(process.execPath, [join(AQUI, archivo)], {
      /*
       * La salida se captura y sólo se imprime si el verificador FALLA. Los
       * diecisiete juntos son varios miles de líneas de asserts en verde, y
       * ahogan justo la única que hay que leer. Cuando uno falla, sale entero.
       */
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let salida = ''
    hijo.stdout.on('data', d => (salida += d))
    hijo.stderr.on('data', d => (salida += d))

    hijo.on('error', error => {
      resolve({ archivo, ok: false, ms: Date.now() - empezado, salida: String(error) })
    })
    hijo.on('close', codigo => {
      resolve({ archivo, ok: codigo === 0, ms: Date.now() - empezado, salida })
    })
  })
}

const todos = (await readdir(AQUI))
  .filter(f => f.startsWith('verificar-') && f.endsWith('.mjs'))
  .filter(f => f !== 'verificar-todo.mjs')
  .sort()

const aCorrer = todos.filter(f => !FUERA.has(f))

console.log(`\n${c.negrita}Verificadores sin red${c.reset}  (${aCorrer.length} de ${todos.length})\n`)

/*
 * En serie y no en paralelo, a propósito. Varios de estos levantan un servidor
 * HTTP falso, y aunque cada uno pide el puerto 0 —que el sistema asigna
 * libre—, algunos escriben en `datos/` y en las carpetas de PDF. Correrlos a
 * la vez los haría pisarse entre ellos de formas que dependen del orden, que
 * es exactamente el tipo de fallo intermitente que destruye la confianza en
 * una tanda de CI. Tardan poco más de un minuto en total.
 */
const resultados = []
for (const archivo of aCorrer) {
  const r = await correr(archivo)
  resultados.push(r)
  const marca = r.ok ? `${c.verde}✓${c.reset}` : `${c.rojo}✗${c.reset}`
  const nombre = archivo.replace(/^verificar-|\.mjs$/g, '')
  console.log(`  ${marca} ${nombre.padEnd(26)} ${c.gris}${(r.ms / 1000).toFixed(1)} s${c.reset}`)
}

const fallidos = resultados.filter(r => !r.ok)

for (const r of fallidos) {
  console.log(`\n${c.rojo}${c.negrita}── ${r.archivo} ──${c.reset}\n`)
  console.log(r.salida.trimEnd())
}

console.log(`\n${c.negrita}Excluidos${c.reset} (${FUERA.size})`)
for (const [archivo, motivo] of FUERA) {
  console.log(`  ${c.gris}· ${archivo}: ${motivo}${c.reset}`)
}

const total = (resultados.reduce((s, r) => s + r.ms, 0) / 1000).toFixed(1)

if (fallidos.length) {
  console.log(`\n${c.rojo}${c.negrita}${fallidos.length} de ${aCorrer.length} fallaron${c.reset} (${total} s)\n`)
  process.exit(1)
}

console.log(`\n${c.verde}${c.negrita}Los ${aCorrer.length} pasaron${c.reset} (${total} s)\n`)
