#!/usr/bin/env node
/**
 * scripts/verificar-antiguedad-historico.mjs
 * ------------------------------------------------------------------
 * Desde cuándo hay historia CONTIGUA de verdad en el Hyper Historian de
 * ICONICS, para una señal dada — la pregunta que ningún endpoint de la API
 * contesta directamente: `History` sólo sabe devolver "las muestras entre A
 * y B", nunca "cuál es la primera muestra que existe".
 *
 * ── CÓMO SE BUSCA: HACIA ATRÁS DESDE HOY, TRAMO A TRAMO ─────────────
 *
 * Se piden tramos de `DIAS_TRAMO` días empezando en HOY y retrocediendo. Un
 * tramo con al menos una muestra real (calidad buena) se cuenta como "con
 * historia" y se sigue retrocediendo; el PRIMER tramo sin ninguna muestra
 * real detiene la búsqueda. Dentro de ESE último tramo con dato se afina el
 * borde recorriendo hacia ADELANTE en sub-bloques de `HORAS_SUBTRAMO` horas
 * (`afinarDentroDelTramo`), deteniéndose en el primero que traiga algo.
 *
 * No es búsqueda binaria en ningún nivel, a propósito — y esto costó DOS
 * intentos fallidos hasta quedar así, contra el servidor real:
 *
 *  1. Una binaria sobre "¿hay dato entre X y hoy?" necesitaría, para no dar
 *     un falso positivo, comprobar el rango COMPLETO hasta hoy en cada paso
 *     —troceado, porque un solo `readHistory` con un rango de años y un
 *     intervalo fino agota su cupo en los huecos del principio sin llegar
 *     nunca al dato real (ver `trocear()` en `Demo-EVA/data/historia.js`,
 *     que documenta la misma trampa)—, y eso son cientos de peticiones si
 *     "X" cae lejos en el pasado.
 *  2. Ya con el enfoque de tramos hacia atrás, afinar el borde DENTRO del
 *     último tramo con una binaria —"¿hay dato en `[medio, fin del
 *     tramo]`?"— pareció funcionar (afinó "16-ago" a "16-ago 22:52") pero
 *     esa ventana ancha rozaba una muestra real que en verdad era del
 *     18-ago: dos días de error disfrazados de precisión de minutos. El
 *     hueco dentro de un tramo no tiene por qué ser un único bloque
 *     contiguo, así que la única pregunta seguramente monótona es «¿es
 *     ESTE sub-bloque, recorriendo uno a uno desde el principio, el
 *     primero con dato?» — nunca «¿hay dato en algún punto de una ventana
 *     más ancha que ese sub-bloque?».
 *
 * Recorrer hacia atrás (y luego hacia adelante, dentro del tramo encontrado)
 * es lineal en el número de tramos/sub-bloques —lento si el historial real
 * tiene años, razonable si es de días o pocos meses, que es el caso medido
 * contra el servidor de esta instalación (agosto de 2026)— pero es
 * CORRECTO: nunca puede confundir un hueco con el principio de la historia.
 *
 * `TOPE_TRAMOS` es la salvaguarda: si el historial resulta tener más de
 * `TOPE_TRAMOS * DIAS_TRAMO` días, el script se detiene y lo dice en vez de
 * tardar minutos sin avisar.
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

// Un sondeo por tramo: la traza INFO de cada llamada (`iconics/client.mjs`)
// taparía el resultado. Se silencia aquí y no se deja a que el usuario
// recuerde `LOG_LEVEL=WARN`.
logger.setLevel('WARN')

/** Ancho de cada tramo, en días. Mismo orden de magnitud que `trocear()` en `Demo-EVA/data/historia.js` para no chocar con el tope de muestras del servidor. */
const DIAS_TRAMO = 3
/** Salvaguarda: no más de esto muchos tramos (≈ 3 años con DIAS_TRAMO=3) antes de rendirse y decirlo. */
const TOPE_TRAMOS = 365
/** Ancho del sub-bloque para afinar DENTRO del tramo con dato — ver `afinarDentroDelTramo`. */
const HORAS_SUBTRAMO = 6

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
 * Un sondeo de `readHistory` con un intervalo FIJO de una hora.
 *
 * Probado a mano contra el servidor real: un intervalo que no divide al
 * rango pedido en un número entero de tramos vuelve `ok:true` con
 * `data:[]`, sin ningún error que lo delate — pasó con "18:00:00" sobre 7
 * días y con "24:00:00" sobre el mismo rango (`intervaloHMS` tampoco hace
 * módulo 24, así que más de un día produce un HH de dos cifras que el
 * servidor tampoco acepta). Una hora fija sobre un tramo de `DIAS_TRAMO`
 * días es conservador pero fiable, y ya viene probado contra el servidor.
 */
async function consultarTramo(tag, inicio, fin) {
  return client.readHistory({
    pointName: tag,
    startDate: inicio.toISOString(),
    endDate: fin.toISOString(),
    aggregate: 'Average',
    interval: intervaloHMS(3600),
  })
}

/**
 * Dentro de un tramo de `DIAS_TRAMO` días YA CONFIRMADO con dato (y cuyo
 * tramo anterior, más antiguo, YA CONFIRMADO sin ninguno), encuentra el
 * primer sub-bloque de `HORAS_SUBTRAMO` horas —recorriendo hacia ADELANTE
 * desde el inicio del tramo, nunca hacia atrás— que traiga alguna muestra
 * real.
 *
 * Recorrer hacia adelante y no una binaria es a propósito: dentro de este
 * tramo el hueco puede tener cualquier forma —no hay garantía de que sea un
 * único bloque contiguo de "nada" seguido de un único bloque de "todo"—, así
 * que la única pregunta segura es «¿es ESTE sub-bloque el primero con dato?»,
 * nunca «¿hay dato en algún punto de una ventana más ancha?». Es la misma
 * lección que ya costó dos intentos fallidos en versiones anteriores de este
 * archivo: cualquier ventana que se extienda más allá del sub-bloque que se
 * está evaluando puede rozar una muestra real que no tiene nada que ver con
 * el punto que se pregunta.
 */
async function afinarDentroDelTramo(tag, inicioTramo) {
  const finTramo = new Date(inicioTramo.getTime() + DIAS_TRAMO * 86400_000)
  let inicioSub = inicioTramo
  while (inicioSub < finTramo) {
    const finSub = new Date(Math.min(inicioSub.getTime() + HORAS_SUBTRAMO * 3600_000, finTramo.getTime()))
    const resultado = await consultarTramo(tag, inicioSub, finSub)
    if (tieneDatoReal(resultado)) return inicioSub
    inicioSub = finSub
  }
  // No debería pasar —el tramo completo ya se confirmó con dato—, pero si
  // pasa (una muestra que sólo aparece agregada al pedir el tramo entero, no
  // sub-bloque a sub-bloque) es más honesto devolver el propio inicio del
  // tramo que fallar.
  return inicioTramo
}

/**
 * Recorre tramos de `DIAS_TRAMO` días hacia atrás desde hoy hasta el primer
 * hueco, y dentro de ese último tramo con dato afina el borde recorriendo
 * hacia adelante en sub-bloques (`afinarDentroDelTramo`). Devuelve el
 * instante más antiguo de la racha CONTIGUA con dato, o `null` con un motivo
 * si no hay ninguna racha o si se alcanzó `TOPE_TRAMOS` sin encontrar el
 * hueco que la cierra.
 *
 * @param {string} tag nombre completo del punto (`ac:TDCON/...`)
 * @returns {Promise<{borde: Date|null, motivo?: string}>}
 */
async function buscarBorde(tag) {
  const ahora = new Date()
  let finTramo = ahora
  let ultimoConDato = null

  for (let i = 0; i < TOPE_TRAMOS; i++) {
    const inicioTramo = new Date(finTramo.getTime() - DIAS_TRAMO * 86400_000)
    const resultado = await consultarTramo(tag, inicioTramo, finTramo)

    if (!tieneDatoReal(resultado)) {
      if (ultimoConDato) return { borde: await afinarDentroDelTramo(tag, ultimoConDato) }
      // El primer tramo (el más reciente, "ahora mismo") ya viene vacío: la
      // señal no tiene historia en absoluto, no que el hueco esté más atrás.
      if (i === 0) {
        return { borde: null, motivo: 'sin dato ni siquiera en los últimos días — revisa el nombre del tag o el estado del historiador' }
      }
      return { borde: await afinarDentroDelTramo(tag, ultimoConDato) }
    }

    ultimoConDato = inicioTramo
    finTramo = inicioTramo
  }

  return {
    borde: null,
    motivo: `hay historia contigua desde antes de ${TOPE_TRAMOS * DIAS_TRAMO} días atrás — sube TOPE_TRAMOS si de verdad hace falta ir más lejos`,
  }
}

async function main() {
  const claves = process.argv.slice(2)
  const objetivo = claves.length ? claves : historizadas()

  console.log(`\n${c.negrita}Antigüedad del histórico en ${config.iconics.apiBase}${c.reset}`)
  console.log(`${c.gris}Tramos de ${DIAS_TRAMO} días, retrocediendo desde hoy hasta el primer hueco.${c.reset}\n`)

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
        console.log(`${c.verde}dato contiguo desde el ${borde.toISOString().replace('T', ' ').slice(0, 16)} UTC${c.reset} ${c.gris}(±${HORAS_SUBTRAMO} h)${c.reset}`)
      } else {
        console.log(`${c.rojo}${motivo}${c.reset}`)
      }
    } catch (error) {
      console.log(`${c.rojo}error: ${error.message}${c.reset}`)
    }
  }
}

await main()
