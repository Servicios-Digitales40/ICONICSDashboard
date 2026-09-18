#!/usr/bin/env node
/**
 * scripts/generar-configuracion-vibraciones.mjs
 * ------------------------------------------------------------------
 * La máquina de vibraciones, DERIVADA de su catálogo escrito a mano. Plan 33 F4.
 *
 * ── POR QUÉ SE GENERA Y NO SE ESCRIBE ──────────────────────────────
 *
 * Porque lo que F4 tiene que demostrar es que la configuración **puede
 * reproducir** lo que hoy hace un módulo de 1 154 líneas. Escribir a mano un
 * JSON con 73 variables no demostraría eso: demostraría que alguien copió bien,
 * y cada diferencia entre la copia y el original sería un error de transcripción
 * disfrazado de hallazgo.
 *
 * Derivándola del catálogo, las dos salen de la MISMA fuente, y entonces
 * cualquier diferencia que quede es real: es algo que la configuración no sabe
 * expresar todavía.
 *
 * ── ESTO NO ES LA MIGRACIÓN ────────────────────────────────────────
 *
 * El módulo escrito a mano **no se toca ni se retira**. Esto produce un archivo
 * de configuración equivalente para poder COMPARARLOS
 * (`verificar-vibraciones-configurada.mjs`), que es lo que dice si la
 * arquitectura aguanta antes de confiarle una máquina de verdad.
 *
 * Retirar el módulo es una decisión posterior, y el Plan 33 §18 ya dice por qué
 * no toca todavía: esas líneas llevan dentro conocimiento verificado punto por
 * punto contra el servidor —incluidas las dos señales a las que el historiador
 * contesta con la serie de otra— y perderlo no daría un error, daría un tablero
 * que enseña la señal equivocada con su rótulo correcto.
 *
 * ── LO QUE ESTE GUION NO PUEDE SABER ───────────────────────────────
 *
 * **Si una serie es de verdad suya.** `historyVerified` se pone aquí a `true`
 * copiando la lista blanca del catálogo —que sí se sondeó punto por punto el
 * 28-08-2026 contra el servidor real— y NO porque este guion lo haya
 * comprobado. Es la diferencia entre heredar una verificación y hacerla.
 *
 * Una configuración creada desde la pantalla (F5) arranca con todo en `false` y
 * sólo sube a `true` tras sondear. Aquí se hereda porque el sondeo ya ocurrió y
 * está escrito en `historizadas()`.
 *
 *   node scripts/generar-configuracion-vibraciones.mjs [destino]
 *
 * Sin argumentos escribe en la salida estándar, para poder mirarlo antes de
 * guardarlo en ningún sitio.
 */
import { writeFile } from 'node:fs/promises'

import {
  crearMaquina,
  crearVariable,
} from '../shared/eva/comun/configuracionMaquina.js'
import { SISTEMA } from '../shared/eva/comun/sistemas.js'
import {
  BANDERAS,
  CALIDADES,
  MEDIDAS,
  VARIADOR,
  VIGILANCIAS,
} from '../shared/eva/vibraciones/vibraciones.js'
import { rolDe } from '../shared/eva/tipos/vibraciones.js'

const ORIGEN = SISTEMA.vibraciones

/**
 * De qué familia es una clave del catálogo, para nombrar su rol.
 *
 * Se busca en los cinco catálogos en vez de deducirlo del nombre, y el orden
 * importa: `aviso` está en BANDERAS y en VARIADOR, y los dos son roles
 * distintos con ámbitos distintos (ver `tipos/vibraciones.js`). Aquí se
 * desempata por el CANAL —una clave con canal es de apoyo, sin canal es de la
 * máquina—, que es el dato que el catálogo ya trae y no hay que adivinar.
 */
function familiaDe(clave, canal) {
  const enApoyo = [
    ['medida', MEDIDAS],
    ['bandera', BANDERAS],
    ['calidad', CALIDADES],
    ['vigilancia', VIGILANCIAS],
  ]

  if (canal) {
    for (const [familia, catalogo] of enApoyo) {
      if (catalogo.some(x => x.key === clave)) return familia
    }
    return null
  }

  return VARIADOR.some(x => x.key === clave) ? 'variador' : null
}

/**
 * El id de dominio de un punto: la clave con la que se le pide su serie.
 *
 * En este catálogo es `clave_canal` para lo que vive en un apoyo, y la clave
 * sola para el variador. Se construye así —y no con el `parse`— porque tiene
 * que coincidir EXACTAMENTE con lo que devuelve `series.historizadas()`, que
 * es contra lo que se va a comparar.
 */
const idDeDominio = (clave, canal) => (canal ? `${clave}_${canal}` : clave)

const variables = []
const sinRol = []

for (const punto of ORIGEN.puntos()) {
  const d = ORIGEN.parse(punto)
  if (!d) continue

  const id = idDeDominio(d.clave, d.canal)
  const familia = familiaDe(d.clave, d.canal)
  const rol = familia ? rolDe(familia, d.clave) : null

  /*
   * Los contadores de alarma (`ae:`) no tienen rol en el tipo: no son una
   * medida de la máquina, son del servidor de alarmas. Se configuran igual
   * —hay que leerlos— pero sin rol, y por eso se cuentan aparte en vez de
   * inventarles uno.
   */
  if (!rol) sinRol.push({ punto, clave: d.clave, tipo: d.tipo })

  const historico = ORIGEN.series.punto(id)

  variables.push(
    crearVariable({
      id,
      pointName: punto,
      /* LITERAL, nunca derivado del nombre en vivo: no se deduce por regla
         fija, y deducirlo es el defecto B10 de este proyecto. */
      historyPointName: historico,
      rol,
      descripcion: ORIGEN.etiquetaDe(id),
      alias: ORIGEN.aliasDe?.(id) ?? [],
      assetId: d.canal ?? null,
    }),
  )
}

const verificadas = new Set(ORIGEN.series.historizadas())

const configurada = crearMaquina({
  id: 'vibraciones-configurada',
  nombre: `${ORIGEN.nombre} (configurada)`,
  tipo: 'vibraciones',
  plc: ORIGEN.plc,
  cadenciaMs: ORIGEN.cadenciaMs,
  assets: ORIGEN.raices.map((pointName, i) => ({
    id: pointName,
    pointName,
    rol: i === 0 ? 'raiz' : 'secundario',
  })),
  variables,
  limitaciones: [
    'Configuración DERIVADA del catálogo escrito a mano (Plan 33 F4). Existe para ' +
      'comparar las dos, no para sustituirlo: el módulo original sigue siendo el que ' +
      'sirve esta máquina.',
    'Sus series se dan por verificadas HEREDANDO el sondeo del 28-08-2026, no por haberlas ' +
      'comprobado aquí.',
  ],
})

/*
 * ── LA VERIFICACIÓN SE HEREDA, Y VA DESPUÉS DE `crearMaquina` ──────
 *
 * `historizadas()` es una lista blanca sondeada punto por punto contra el
 * servidor real el 28-08-2026. No es una promesa del servidor —a `aPeak_S1` le
 * contesta con la serie de `aRMS_S1`, sin dar error— sino el resultado de
 * haber mirado. Copiarla es heredar ESA verificación, no hacer una nueva.
 *
 * ── POR QUÉ AQUÍ Y NO AL CONSTRUIR CADA VARIABLE ───────────────────
 *
 * Porque `crearVariable()` fuerza `historyVerified: false`, y `crearMaquina()`
 * pasa todas las variables por ahí. Marcarlas antes no servía de nada: la
 * marca se perdía y este guion decía «40 series heredadas» produciendo cero.
 *
 * Eso NO es un defecto de aquella función: es exactamente para lo que se puso.
 * Nada que llegue como DATO puede declararse verificado —ni de un formulario,
 * ni de un JSON, ni de este guion— porque prometer una serie sin haberla
 * sondeado es cómo se acaba enseñando la señal de al lado con el rótulo
 * correcto.
 *
 * Así que la marca se pone DESPUÉS y desde el catálogo, que es la única fuente
 * que tiene derecho a ponerla: el sondeo ya ocurrió y está escrito ahí.
 */
for (const v of configurada.variables) {
  if (verificadas.has(v.id) && v.historyPointName) v.historyVerified = true
}

const salida = {
  version: 1,
  maquinas: [configurada],
}

const destino = process.argv[2]
if (destino) {
  await writeFile(destino, `${JSON.stringify(salida, null, 2)}\n`, 'utf8')
  console.error(`Escrito ${destino}`)
} else {
  console.log(JSON.stringify(salida, null, 2))
}

/*
 * Se cuenta lo APLICADO, no lo que se pretendía aplicar. La primera versión
 * imprimía `verificadas.size` —lo que dice el catálogo— y por eso anunciaba
 * «40 series heredadas» mientras producía cero: el número venía de la
 * intención, no del resultado.
 */
const heredadas = configurada.variables.filter(v => v.historyVerified).length
if (heredadas !== verificadas.size) {
  console.error(
    `AVISO: el catálogo declara ${verificadas.size} series y sólo se marcaron ${heredadas}. ` +
      'Alguna clave del catálogo no encontró su variable.',
  )
}

console.error(
  `\n${configurada.variables.length} variables · ${heredadas} series heredadas · ` +
    `${sinRol.length} sin rol en el tipo`,
)
if (sinRol.length) {
  console.error(
    'Sin rol (se leen igual, pero el tipo no las nombra): ' +
      `${[...new Set(sinRol.map(s => s.tipo))].join(', ')}`,
  )
}
