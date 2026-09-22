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

import { configuracionEspejo } from './lib/configuracionEspejo.mjs'

/*
 * La derivación vive en `lib/configuracionEspejo.mjs` desde el Plan 39 F0,
 * para que `verificar-herramientas` y `verificar-chat` la importen y
 * registren la configurada en su proceso, sin ejecutar este guion aparte.
 * Aquí queda lo que sí es de un guion: la bandera `--sondear`, el archivo de
 * salida y el recuento.
 */
const { configurada, sinRol, verificadas } = configuracionEspejo()

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
