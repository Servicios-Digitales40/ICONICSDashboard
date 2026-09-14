#!/usr/bin/env node
/**
 * scripts/sondear-arbol.mjs
 * ------------------------------------------------------------------
 * SONDA DE DESCUBRIMIENTO, no una verificación: vuelca el árbol real de
 * AssetWorX bajo una raíz, rama por rama, con `browse()`. No compara contra
 * nada declarado — para eso está `verificar-catalogo.mjs --real`, que además
 * ya avisa (Plan 27 F0) cuando aparecen ramas hermanas de las que declara.
 *
 * ── POR QUÉ HACÍA FALTA ─────────────────────────────────────────────
 *
 * Se escribió el 09-09-2026 al descubrir que planta había publicado doce
 * ramas nuevas bajo `ac:TDCON/DEMO/`, hermanas de la única raíz que el
 * tanque declaraba. Antes de esto, ver la forma real de un árbol exigía
 * escribir un guion suelto cada vez — se escribió tres veces esa tarde, para
 * tres sondeos sucesivos mientras el catálogo se corregía en vivo. Ésta es
 * la versión que se queda, en la línea de `sondear-paginacion-historico.mjs`:
 * una sonda, no una prueba, y por eso no falla con código de error ni entra
 * en `npm run verificar`.
 *
 * Sólo LEE. No escribe nada en ICONICS.
 *
 *   node --env-file=.env.local scripts/sondear-arbol.mjs [raíz] [profundidad]
 *
 * Sin argumentos, recorre `ac:TDCON/DEMO/` hasta 4 niveles — la misma
 * profundidad que usa `verificar-catalogo.mjs --real` para no colgarse en un
 * árbol con un ciclo o una rama anormalmente honda.
 */
import { loadConfig } from '../backend/config.mjs'
import { createAuthenticator } from '../backend/iconics/authenticator.mjs'
import { createIconicsClient } from '../backend/iconics/client.mjs'
import { logger } from '../backend/logger.mjs'

logger.setLevel('WARN')

const RAIZ = process.argv[2] ?? 'ac:TDCON/DEMO/'
const PROFUNDIDAD_MAX = Number(process.argv[3] ?? 4)

const config = loadConfig()
if (config.iconics.fake) {
  console.error('ICONICS_FAKE=true: esta sonda necesita el servidor real.')
  process.exit(1)
}
if (!config.iconics.apiBase) {
  console.error(
    'Falta ICONICS_API_BASE. Esta sonda necesita red a la planta:\n' +
    '  node --env-file=.env.local scripts/sondear-arbol.mjs [raíz]'
  )
  process.exit(1)
}

const cliente = createIconicsClient(config, createAuthenticator(config))

/** Recorre una rama y la imprime, indentando una rama hija por nivel. */
async function explorar(ruta, sangria, profundidad) {
  if (profundidad > PROFUNDIDAD_MAX) {
    console.log(`${sangria}… (profundidad máxima ${PROFUNDIDAD_MAX} alcanzada)`)
    return
  }

  const respuesta = await cliente.browse(ruta)
  if (!respuesta.ok) {
    console.log(`${sangria}! ERROR explorando ${ruta}: ${respuesta.error}`)
    return
  }

  const nodos = Array.isArray(respuesta.payload) ? respuesta.payload : []
  if (nodos.length === 0) {
    console.log(`${sangria}(vacío)`)
    return
  }

  for (const nodo of nodos) {
    const punto = nodo.pointName ?? nodo.browsePointName
    if (!punto) {
      console.log(`${sangria}? nodo sin pointName: ${JSON.stringify(nodo)}`)
      continue
    }
    const hoja = punto.replace(/\/$/, '').split('/').pop()
    if (punto.endsWith('/')) {
      console.log(`${sangria}[${hoja}]`)
      await explorar(punto, sangria + '  ', profundidad + 1)
    } else {
      console.log(`${sangria}- ${hoja}`)
    }
  }
}

console.log(`RAÍZ ${RAIZ}\n`)
await explorar(RAIZ, '', 0)
