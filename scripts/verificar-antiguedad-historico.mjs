#!/usr/bin/env node
/**
 * scripts/verificar-antiguedad-historico.mjs
 * ------------------------------------------------------------------
 * Desde cuándo hay historia de verdad en el Hyper Historian de ICONICS,
 * para una señal dada — la pregunta que ningún endpoint de la API contesta
 * directamente: `History` sólo sabe devolver "las muestras entre A y B",
 * nunca "cuál es la primera muestra que existe".
 *
 * ── CÓMO SE BUSCA ────────────────────────────────────────────────────
 *
 * Búsqueda binaria sobre la fecha de inicio: se prueba `readHistory` con un
 * rango [candidato, ahora] y se mira si trae AL MENOS una muestra real
 * (calidad buena, no una rejilla vacía). Si trae dato, "candidato" es una
 * fecha con historia y se retrocede más; si no trae nada, "candidato" es
 * anterior a donde empieza el historiador y se avanza. El resultado es el
 * borde exacto, en `PASOS` iteraciones (16 por defecto: sobre una ventana de
 * 20 años eso ya afina a ±3 horas).
 *
 * No sirve pedir un solo rango gigante (2020→hoy) con un intervalo fino: el
 * servidor recorta por `X-ICO-MAX-ITEM-COUNT` (`maxUpstreamItems`, ver
 * `iconics/client.mjs`) antes de llegar a ningún dato real si el historiador
 * arrancó mucho después del inicio del rango, y la respuesta puede volver
 * vacía con `hasMore:true` sin decir nada del borde real. Un intervalo ancho
 * (`interval` grande, pocos puntos) evita chocar con ese tope en cada sondeo.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node --env-file=.env.local scripts/verificar-antiguedad-historico.mjs
 *   node --env-file=.env.local scripts/verificar-antiguedad-historico.mjs nivelTanque temperaturaTanque
 *
 * Sin argumentos, recorre las señales de `historizadas()`. Un argumento es
 * la `key` del catálogo (`shared/eva/senales.js`), no el nombre del tag.
 *
 * Habla con el servidor ICONICS real de `.env.local` — no monta la app, no
 * necesita el backend levantado, pero SÍ necesita ICONICS_FAKE=false (o sin
 * poner) y las credenciales de verdad. Con ICONICS_FAKE=true no tiene
 * sentido: el transporte falso inventa su historia desde el instante en que
 * arranca el proceso.
 */
import { loadConfig } from '../backend/config.mjs'
import { createAuthenticator } from '../backend/iconics/authenticator.mjs'
import { createIconicsClient } from '../backend/iconics/client.mjs'
import { logger } from '../backend/logger.mjs'
import { intervaloHMS } from '../shared/eva/historia.js'
import { esHistorizada, historizadas, pointName, senalInfo } from '../shared/eva/senales.js'
import { isGoodQuality } from '../shared/quality.js'

// Decenas de sondeos por señal (búsqueda binaria): la traza INFO de cada
// llamada (`iconics/client.mjs`) taparía el resultado. Se silencia aquí y no
// se deja a que el usuario recuerde `LOG_LEVEL=WARN`.
logger.setLevel('WARN')

const PASOS = 16
const AÑOS_ATRAS_INICIALES = 20
/** Ancho de cada ventana de sondeo, en días — ver la nota en `consultarUnPunto`. */
const DIAS_VENTANA = 3

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

const config = loadConfig()

if (config.iconics.fake) {
  console.error(
    `${c.rojo}ICONICS_FAKE=true: este script necesita el servidor real. ` +
    `Quítalo de .env.local (o pásalo a false) para consultar el historiador de verdad.${c.reset}`
  )
  process.exit(1)
}
if (!config.iconics.apiBase) {
  console.error(`${c.rojo}Falta ICONICS_API_BASE en .env.local.${c.reset}`)
  process.exit(1)
}

const authenticator = createAuthenticator(config)
const client = createIconicsClient(config, authenticator)

/**
 * ¿La respuesta de `readHistory` trae al menos una muestra real (no sólo
 * huecos)? Mismo criterio de calidad que usa el resto del backend
 * (`shared/quality.js`): OPC-UA marca "good" con 0, no con 192.
 */
function tieneDatoReal(resultado) {
  return resultado.ok && resultado.data.some((m) => isGoodQuality(m.quality))
}

/**
 * Búsqueda binaria del borde: la fecha más antigua para la que el
 * historiador SÍ tiene alguna muestra.
 *
 * @param {string} tag nombre completo del punto (`ac:TDCON/...`)
 * @returns {Promise<{borde: Date|null, motivo?: string}>}
 */
async function buscarBorde(tag) {
  const ahora = new Date()
  let sinDato = new Date(ahora.getTime() - AÑOS_ATRAS_INICIALES * 365 * 86400_000)
  let conDato = ahora

  // Primero se confirma que el extremo lejano de verdad no tiene dato: si
  // YA tiene, el historiador es más viejo que la ventana de búsqueda entera
  // y hay que decirlo en vez de devolver un borde que no es el real.
  const enElLimite = await consultarUnPunto(tag, sinDato, new Date(sinDato.getTime() + DIAS_VENTANA * 86400_000))
  if (tieneDatoReal(enElLimite)) {
    return { borde: null, motivo: `hay historia desde antes de ${AÑOS_ATRAS_INICIALES} años atrás — sube AÑOS_ATRAS_INICIALES` }
  }

  // Y que el extremo cercano (ahora mismo) sí tiene dato: si no, la señal no
  // tiene historia en absoluto ahora mismo, y una búsqueda binaria no
  // encontraría un borde que no existe.
  const enElPresente = await consultarUnPunto(tag, new Date(ahora.getTime() - DIAS_VENTANA * 86400_000), ahora)
  if (!tieneDatoReal(enElPresente)) {
    return { borde: null, motivo: 'sin dato ni siquiera en los últimos días — revisa el nombre del tag o el estado del historiador' }
  }

  for (let i = 0; i < PASOS; i++) {
    const medio = new Date((sinDato.getTime() + conDato.getTime()) / 2)
    // Ventana de sondeo alrededor de "medio": con el intervalo fijo de una
    // hora, `DIAS_VENTANA` días caben de sobra bajo `MAX_PUNTOS` sin acercarse
    // al tope, y son bastante estrechos para no cruzar el propio borde que se
    // está acotando.
    const finVentana = new Date(Math.min(medio.getTime() + DIAS_VENTANA * 86400_000, ahora.getTime()))
    const resultado = await consultarUnPunto(tag, medio, finVentana)

    if (tieneDatoReal(resultado)) {
      conDato = medio
    } else {
      sinDato = medio
    }
  }

  return { borde: conDato }
}

/**
 * Un sondeo de `readHistory` con un intervalo FIJO de una hora.
 *
 * Probado a mano contra el servidor real: un intervalo que no divide al
 * rango pedido en un número entero de tramos vuelve `ok:true` con
 * `data:[]`, sin ningún error que lo delate — pasó con "18:00:00" sobre 7
 * días y con "24:00:00" sobre el mismo rango (`intervaloHMS` tampoco hace
 * módulo 24, así que más de un día produce un HH de dos cifras que el
 * servidor tampoco acepta). Ajustar el intervalo al tamaño de cada ventana
 * de búsqueda binaria sería adivinar una regla de alineación que no está
 * documentada; una hora fija sobre una ventana corta (`DIAS_VENTANA`) es
 * conservador pero fiable, y ya viene probado contra el servidor real.
 */
async function consultarUnPunto(tag, inicio, fin) {
  return client.readHistory({
    pointName: tag,
    startDate: inicio.toISOString(),
    endDate: fin.toISOString(),
    aggregate: 'Average',
    interval: intervaloHMS(3600),
  })
}

async function main() {
  const claves = process.argv.slice(2)
  const objetivo = claves.length ? claves : historizadas()

  console.log(`\n${c.negrita}Antigüedad del histórico en ${config.iconics.apiBase}${c.reset}`)
  console.log(`${c.gris}Ventana de búsqueda: hasta ${AÑOS_ATRAS_INICIALES} años atrás, ${PASOS} pasos de búsqueda binaria.${c.reset}\n`)

  for (const clave of objetivo) {
    const senal = senalInfo(clave)
    if (!senal) {
      console.log(`${c.rojo}✗ "${clave}" no existe en el catálogo.${c.reset}`)
      continue
    }
    if (!esHistorizada(clave)) {
      console.log(`${c.gris}· ${senal.label} (${clave}): sin serie propia en el historiador — no aplica.${c.reset}`)
      continue
    }

    const tag = pointName(clave)
    process.stdout.write(`${senal.label} (${tag})… `)
    try {
      const { borde, motivo } = await buscarBorde(tag)
      if (borde) {
        console.log(`${c.verde}dato más antiguo hacia el ${borde.toISOString().replace('T', ' ').slice(0, 16)} UTC${c.reset} ${c.gris}(±3 h, por la búsqueda binaria)${c.reset}`)
      } else {
        console.log(`${c.rojo}${motivo}${c.reset}`)
      }
    } catch (error) {
      console.log(`${c.rojo}error: ${error.message}${c.reset}`)
    }
  }
}

await main()
