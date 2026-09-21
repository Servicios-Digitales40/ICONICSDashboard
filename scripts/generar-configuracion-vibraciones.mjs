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
    /*
     * Este texto cambió con el Plan 34 F2: hasta el 21-09-2026 decía que las
     * series se daban por verificadas «heredando el sondeo del 28-08-2026».
     * Ya no se heredan — y menos mal: aquel sondeo se había hecho contra un
     * grupo del historiador que a día de hoy no existe.
     */
    'Sus series se verifican SONDEÁNDOLAS con `--sondear`: se pide cada una al servidor y se ' +
      'comparan entre sí, porque el historiador puede devolver la serie de otra señal sin dar ' +
      'error. Sin esa bandera ninguna queda verificada, que es el valor seguro.',
  ],
})

/*
 * ── LA VERIFICACIÓN SE GANA SONDEANDO (Plan 34 F2, 21-09-2026) ─────
 *
 * Hasta hoy esto HEREDABA la marca del catálogo: `historizadas()` era una
 * lista blanca sondeada el 28-08-2026, y copiarla era heredar aquella
 * verificación en vez de hacer una nueva. La cabecera de este guion lo decía
 * con todas las letras —«es la diferencia entre heredar una verificación y
 * hacerla»— y el 21-09 se vio por qué importaba: **aquel sondeo se hizo
 * contra un árbol que ya no existe**. El `datos/maquinas.json` de entonces
 * prometía 40 series verificadas sobre un grupo que devuelve 500.
 *
 * Con `--sondear` se pide la serie de cada variable al servidor y se comparan
 * entre sí (`backend/lib/sondearSeries.mjs`). Sin la bandera, ninguna
 * variable queda verificada — que es el valor seguro y el que deja este guion
 * corriendo sin red.
 *
 * ── POR QUÉ VA DESPUÉS DE `crearMaquina` ───────────────────────────
 *
 * Porque `crearVariable()` fuerza `historyVerified: false`, y `crearMaquina()`
 * pasa todas las variables por ahí. Eso NO es un estorbo: es exactamente para
 * lo que se puso. Nada que llegue como DATO puede declararse verificado —ni de
 * un formulario, ni de un JSON, ni de este guion— porque prometer una serie
 * sin haberla sondeado es cómo se acaba enseñando la señal de al lado con el
 * rótulo correcto.
 */
const SONDEAR = process.argv.includes('--sondear')

if (SONDEAR) {
  const { loadConfig } = await import('../backend/config.mjs')
  const { createAuthenticator } = await import('../backend/iconics/authenticator.mjs')
  const { createIconicsClient } = await import('../backend/iconics/client.mjs')
  const { sondearSeries } = await import('../backend/lib/sondearSeries.mjs')

  const config = loadConfig()
  if (!config.iconics.apiBase) {
    console.error(
      'Falta ICONICS_API_BASE: `--sondear` necesita red a la planta.\n' +
        '  node --env-file=.env.local scripts/generar-configuracion-vibraciones.mjs --sondear',
    )
    process.exit(1)
  }

  const cliente = createIconicsClient(config, createAuthenticator(config))

  /*
   * La ventana por defecto son siete días. Es la que el historiador contesta
   * —a treinta devuelve vacío SIN dar error, medido en las dos máquinas— y la
   * que da margen para que una señal haya variado.
   */
  const hasta = new Date()
  const desde = new Date(hasta.getTime() - 7 * 24 * 3600 * 1000)

  const sondeo = await sondearSeries(configurada, {
    leerSerie: (o) => cliente.readHistory(o),
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
  })

  const porId = new Map(sondeo.variables.map((v) => [v.id, v]))
  for (const v of configurada.variables) {
    const r = porId.get(v.id)
    /* Sólo un `true` explícito verifica. Un sondeo que no pudo leer deja la
       variable como estaba, que aquí es `false`. */
    if (r?.historyVerified === true) v.historyVerified = true
  }

  console.error(`Sondeo: ${sondeo.motivo}`)
  for (const v of sondeo.variables.filter((x) => x.sondeo.causa === 'serie-compartida')) {
    console.error(`  · ${v.id} comparte serie con ${v.sondeo.compartidaCon.join(', ')}`)
  }
}

const salida = {
  version: 1,
  maquinas: [configurada],
}

/* El destino es el primer argumento que NO sea una bandera: con `--sondear`
   delante, `process.argv[2]` era la bandera y se escribía un archivo llamado
   «--sondear». */
const destino = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (destino) {
  await writeFile(destino, `${JSON.stringify(salida, null, 2)}\n`, 'utf8')
  console.error(`Escrito ${destino}`)
} else {
  console.log(JSON.stringify(salida, null, 2))
}

/*
 * Se cuenta lo APLICADO, no lo que se pretendía aplicar. La primera versión
 * imprimía lo que dice el catálogo y por eso anunciaba «40 series heredadas»
 * mientras producía cero: el número venía de la intención, no del resultado.
 *
 * Desde el Plan 34 F2 el contraste es otro y más útil: lo que el catálogo
 * CREE historizado frente a lo que el sondeo VERIFICÓ. Que no cuadren no es
 * un defecto de este guion — es justo el dato que la fase existe para sacar a
 * la luz.
 */
const verificadasAhora = configurada.variables.filter(v => v.historyVerified).length
if (!SONDEAR) {
  console.error(
    `Sin \`--sondear\`: ninguna de las ${verificadas.size} series que el catálogo declara ` +
      'queda verificada. Es el valor seguro — una serie se promete después de mirarla.',
  )
} else if (verificadasAhora !== verificadas.size) {
  console.error(
    `El catálogo declara ${verificadas.size} series historizadas y el sondeo verificó ` +
      `${verificadasAhora}. La diferencia está arriba, variable por variable.`,
  )
}

console.error(
  `\n${configurada.variables.length} variables · ${verificadasAhora} series verificadas` +
    `${SONDEAR ? ' por sondeo' : ' (sin sondear)'} · ${sinRol.length} sin rol en el tipo`,
)
if (sinRol.length) {
  console.error(
    'Sin rol (se leen igual, pero el tipo no las nombra): ' +
      `${[...new Set(sinRol.map(s => s.tipo))].join(', ')}`,
  )
}
