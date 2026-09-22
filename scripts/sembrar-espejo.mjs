/**
 * Escribe la máquina de vibraciones de prueba (la «espejo») en `maquinas.json`,
 * para arrancar el tablero sin planta.
 *
 *   ICONICS_FAKE=true node scripts/sembrar-espejo.mjs            # datos/maquinas.json
 *   node scripts/sembrar-espejo.mjs ruta/a/otro/maquinas.json
 *
 * ── POR QUÉ HACE FALTA (Plan 40 F3) ────────────────────────────────
 *
 * Hasta el 21-09-2026 la máquina de vibraciones estaba escrita en el código y
 * el transporte falso la servía sin más. Ahora existe sólo CONFIGURADA: quien
 * arranque con `ICONICS_FAKE=true` y sin `datos/maquinas.json` verá el tanque
 * cerrado y ninguna máquina de vibraciones, que es lo correcto —no hay ninguna
 * configurada— pero no sirve para desarrollar. Este guion siembra la espejo:
 * la configuración derivada del catálogo que se retiró, con sus 36 series
 * verificadas, en el archivo que el backend lee al arrancar.
 *
 * No pisa nada: si el archivo ya tiene máquinas, añade la espejo sólo si no
 * está, y si está la deja como está. Contra planta REAL no tiene sentido (sus
 * tags son los del catálogo de la demo y el sondeo de planta es el que manda),
 * y por eso avisa si `ICONICS_FAKE` no está puesto.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { configuracionEspejo, ID_ESPEJO } from './lib/configuracionEspejo.mjs'

const destino = resolve(process.argv[2] ?? process.env.MAQUINAS_RUTA ?? 'datos/maquinas.json')

if (process.env.ICONICS_FAKE !== 'true') {
  console.error(
    'Aviso: ICONICS_FAKE no está en "true". La espejo lleva los tags de la demo y series ' +
      'verificadas contra el transporte FALSO; contra planta real, configura y sondea desde el tablero.',
  )
}

let archivo = { version: 1, maquinas: [] }
try {
  archivo = JSON.parse(await readFile(destino, 'utf8'))
  if (!Array.isArray(archivo.maquinas)) archivo.maquinas = []
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

if (archivo.maquinas.some((m) => m?.id === ID_ESPEJO)) {
  console.log(`«${ID_ESPEJO}» ya está en ${destino}; no se toca.`)
  process.exit(0)
}

const { configurada } = configuracionEspejo({ verificadasDelCatalogo: true })
/* Con el falso, sus puntos existen y responden: se declara VALID y revisada
   ahora, que es lo que diría una revisión contra ese transporte. */
configurada.estado = 'VALID'
configurada.revisada = new Date().toISOString()
archivo.maquinas.push(configurada)

await mkdir(dirname(destino), { recursive: true })
await writeFile(destino, `${JSON.stringify(archivo, null, 2)}\n`, 'utf8')
console.log(
  `Sembrada «${ID_ESPEJO}» en ${destino}: ${configurada.variables.length} variables, ` +
    `${configurada.variables.filter((v) => v.historyVerified).length} series verificadas. ` +
    'Arranca el backend con ICONICS_FAKE=true y la máquina aparece en el menú.',
)
