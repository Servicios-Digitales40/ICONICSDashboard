#!/usr/bin/env node
/**
 * scripts/medir-narracion.mjs
 * ------------------------------------------------------------------
 * Plan 17 §7·12 — la última comprobación del plan, y la única que necesita
 * el servidor de IA.
 *
 * ── QUÉ PREGUNTA CONTESTA ──────────────────────────────────────────
 *
 * La Fase 4 (G9) hizo que el motor detecte un CONFLICTO —dos causas
 * respaldadas cada una por una fuente distinta— y le dio al modelo una
 * instrucción explícita en `comoRedactar`: decirlo con todas las letras y
 * **no elegir ganador**. Que la instrucción esté escrita no significa que un
 * modelo de 4B la obedezca. Esto lo mide.
 *
 * ── POR QUÉ ES `medir-` Y NO `verificar-` ──────────────────────────
 *
 * Porque una narración no es determinista. Un `verificar-*.mjs` que dependa
 * de lo que un LLM decida decir esta vez se pone rojo por azar, y una prueba
 * que falla por azar es peor que no tenerla: se ignora, y con ella se ignoran
 * las que sí significan algo. Aquí se corren N pasadas, se informa de la
 * TASA de obediencia y **no se devuelve código de error**. Misma separación
 * que `medir-calibracion.mjs` frente a `verificar-calibracion.mjs`.
 *
 * ── QUÉ ES REAL Y QUÉ ES DE MENTIRA, Y POR QUÉ ─────────────────────
 *
 * Real: llama-server, el bucle de `chat.mjs`, la definición de la
 * herramienta que ve el modelo y el `comoRedactar` que sale de la
 * herramienta de verdad (`crearHerramientasDeDiagnostico`).
 *
 * De mentira: sólo el `motorDiagnostico`, que devuelve un conflicto FIJO.
 * Así lo único que varía entre pasadas es lo que se quiere medir —lo que el
 * modelo decide escribir—. Si el escenario viniera de datos reales, una
 * pasada distinta podría no tener conflicto y la medida no diría nada.
 *
 * ── LO QUE ESTE GUION NO PUEDE HACER ───────────────────────────────
 *
 * Juzgar prosa. Las tres comprobaciones de abajo son heurísticas de texto y
 * se equivocan en los dos sentidos. Por eso **imprime las narraciones
 * enteras**: la tasa orienta, el texto es lo que se lee. Una heurística que
 * nadie puede auditar es exactamente el problema que este plan vino a
 * arreglar, con otro disfraz.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node --env-file=.env.local scripts/medir-narracion.mjs [pasadas] [modelo]
 *
 * Por defecto 10 pasadas contra `qwen-3.5-4B`. Cada una tarda ~20 s.
 */
import { loadConfig } from '../backend/config.mjs'
import { createChat } from '../backend/ia/conversacion/chat.mjs'
import { DEFINICIONES } from '../backend/ia/conversacion/definiciones.mjs'
import { crearHerramientasDeDiagnostico } from '../backend/ia/herramientas/diagnostico/index.mjs'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', ambar: '\x1b[33m', gris: '\x1b[90m',
  cian: '\x1b[36m', negrita: '\x1b[1m', reset: '\x1b[0m',
}

const PASADAS = Number(process.argv[2] ?? 10)
const MODELO = process.argv[3] ?? 'qwen-3.5-4B'
/** `empate` (5 vs 5) o `distinto` (6 vs 4). El empate es el caso duro: sin
 *  diferencia de respaldo, lo único que sostiene el orden es la obediencia. */
const ESCENARIO = process.argv[4] ?? 'empate'

/**
 * El conflicto de sonda. Las dos causas están empatadas a 5 y cada una la
 * respalda una fuente distinta: la primera por el MANUAL (manual 2, casos
 * 0), la segunda por los CASOS (casos 2, manual 0). Es exactamente la forma
 * que `hayConflicto` marca, construida a mano para que no dependa de qué
 * haya hoy en `Documentacion/`.
 */
const RESULTADO_CON_CONFLICTO = {
  sistema: 'tanque',
  riesgoId: 'sobrepresion',
  diagnosticEventId: 'DE-sonda-narracion',
  huerfano: false,
  conflicto: true,
  causas: [
    {
      id: 'consigna-variador-alta',
      titulo: 'La consigna del variador está por encima de lo debido',
      componente: 'Variador de frecuencia',
      banda: ESCENARIO === 'distinto' ? 'alto' : 'medio',
      respaldo: ESCENARIO === 'distinto'
        ? { datos: 3, manual: 2, casos: 1, temporal: 0, total: 6 }
        : { datos: 3, manual: 2, casos: 0, temporal: 0, total: 5 },
      origen: 'riesgos.js · accion (sobrepresion)',
      provisional: false,
      manualCitado: [{ archivo: 'Anexo_Limites_Proteccion.pdf', pagina: 1 }],
      casosCitados: [],
      evidenciaAFavor: ['La presión relativa está en 6,3 bar, por encima de su máximo de aviso.'],
      evidenciaEnContra: [],
    },
    {
      id: 'valvula-alivio-no-actua',
      titulo: 'La válvula de alivio no está actuando',
      componente: 'Válvula de alivio',
      banda: 'medio',
      respaldo: ESCENARIO === 'distinto'
        ? { datos: 3, manual: 0, casos: 1, temporal: 0, total: 4 }
        : { datos: 3, manual: 0, casos: 2, temporal: 0, total: 5 },
      origen: 'riesgos.js · accion (sobrepresion)',
      provisional: false,
      manualCitado: [],
      casosCitados: [{ id: 'interv-sonda-1', fecha: '2026-08-30T10:00:00.000Z', resuelto: true }],
      evidenciaAFavor: ['Dos cierres anteriores de este mismo riesgo señalaron esta causa.'],
      evidenciaEnContra: [],
    },
  ],
}

/* ── El montaje: sólo el motor es de mentira ─────────────────────────── */

const motorFalso = { diagnosticar: async () => RESULTADO_CON_CONFLICTO }
const familia = crearHerramientasDeDiagnostico({ motorDiagnostico: motorFalso })
const definicion = DEFINICIONES.find(d => d.function?.name === 'diagnosticar_falla')

if (!definicion) {
  console.log(`${c.rojo}No encuentro la definición de diagnosticar_falla en DEFINICIONES.${c.reset}`)
  process.exit(0)
}

const herramientas = {
  definiciones: [definicion],
  nombres: ['diagnosticar_falla'],
  catalogo: () => [],
  async ejecutar(nombre, argumentos) {
    if (nombre !== 'diagnosticar_falla') {
      return { ok: false, error: `No existe la herramienta "${nombre}".` }
    }
    return familia.diagnosticar_falla(argumentos)
  },
}

const config = loadConfig()
const chat = createChat({ config, herramientas })
if (!chat.usarModelo(MODELO)) {
  console.log(`${c.rojo}"${MODELO}" no está en IA_MODELOS. Disponibles: ${config.ia.modelos.join(', ')}${c.reset}`)
  process.exit(0)
}

/* ── Las tres preguntas, y lo que cada una NO puede ver ──────────────── */

const TITULO_1 = 'consigna del variador'
const TITULO_2 = 'válvula de alivio'

const CONTRASTE = /\b(pero|sin embargo|mientras que|en cambio|no obstante|discrepan|no coinciden|difieren|por su parte|apunta[n]? a .* y .* apunta)/i
const GANADOR = /\b(la causa más probable es|todo apunta a|la más probable|se confirma que|con seguridad|sin duda|descart[ao]|conclu[yi]|por tanto la causa es)/i

function normaliza(t) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** ¿Nombra las DOS causas? Sin eso no hay desacuerdo que enseñar. */
function nombraLasDos(texto) {
  const t = normaliza(texto)
  return t.includes(normaliza(TITULO_1)) && t.includes(normaliza(TITULO_2))
}

/** ¿Marca el desacuerdo, en vez de listarlas como si coincidieran? */
function marcaDesacuerdo(texto) {
  return CONTRASTE.test(texto)
}

/** ¿Nombra las FUENTES en desacuerdo — que es lo que la instrucción pide? */
function nombraLasFuentes(texto) {
  const t = normaliza(texto)
  const manual = /manual|documenta|anexo/.test(t)
  const casos = /caso|historic|intervencion|anterior/.test(t)
  return manual && casos
}

/** ¿Se guardó de elegir ganador? */
function evitaElegirGanador(texto) {
  return !GANADOR.test(texto)
}

/** ¿Respetó el orden? La primera causa nombrada debe ser la primera de la lista. */
function respetaOrden(texto) {
  const t = normaliza(texto)
  const i1 = t.indexOf(normaliza(TITULO_1))
  const i2 = t.indexOf(normaliza(TITULO_2))
  if (i1 === -1 || i2 === -1) return null
  return i1 < i2
}

/* ── Las pasadas ─────────────────────────────────────────────────────── */

console.log(`\n${c.negrita}Narración ante un conflicto de fuentes${c.reset}`)
console.log(`  modelo   : ${MODELO}`)
console.log(`  servidor : ${config.ia.base}`)
console.log(`  pasadas  : ${PASADAS}`)
console.log(`  escenario: ${ESCENARIO === 'distinto' ? 'totales DISTINTOS (6 vs 4)' : 'EMPATE (5 vs 5)'}`)
console.log(`${c.gris}  El motor devuelve un conflicto FIJO; lo único que varía es lo que el modelo escribe.${c.reset}\n`)

const marcas = { llamo: 0, dos: 0, desacuerdo: 0, fuentes: 0, sinGanador: 0, orden: 0, ordenEvaluable: 0 }
const textos = []

for (let i = 1; i <= PASADAS; i++) {
  const t0 = Date.now()
  const eventos = []
  let llamo = false
  const espia = {
    ...herramientas,
    async ejecutar(nombre, argumentos) {
      if (nombre === 'diagnosticar_falla') llamo = true
      return herramientas.ejecutar(nombre, argumentos)
    },
  }
  const chatPasada = createChat({ config, herramientas: espia })
  chatPasada.usarModelo(MODELO)

  let texto = ''
  try {
    await chatPasada.responder({
      pregunta: 'Diagnostica el riesgo "sobrepresion" del sistema "tanque" y explícame qué está pasando.',
      onEvento: e => eventos.push(e),
    })
    texto = eventos.filter(e => e.tipo === 'texto').map(e => e.delta).join('')
  } catch (error) {
    console.log(`  ${c.rojo}pasada ${i}: falló — ${error.message}${c.reset}`)
    continue
  }

  const r = {
    llamo,
    dos: nombraLasDos(texto),
    desacuerdo: marcaDesacuerdo(texto),
    fuentes: nombraLasFuentes(texto),
    sinGanador: evitaElegirGanador(texto),
    orden: respetaOrden(texto),
  }
  textos.push({ i, texto, r })

  if (r.llamo) marcas.llamo++
  if (r.dos) marcas.dos++
  if (r.desacuerdo) marcas.desacuerdo++
  if (r.fuentes) marcas.fuentes++
  if (r.sinGanador) marcas.sinGanador++
  if (r.orden !== null) { marcas.ordenEvaluable++; if (r.orden) marcas.orden++ }

  const si = b => (b ? `${c.verde}sí${c.reset}` : `${c.rojo}no${c.reset}`)
  console.log(
    `  pasada ${String(i).padStart(2)} (${((Date.now() - t0) / 1000).toFixed(0)}s)  ` +
    `llamó:${si(r.llamo)}  2 causas:${si(r.dos)}  desacuerdo:${si(r.desacuerdo)}  ` +
    `fuentes:${si(r.fuentes)}  sin ganador:${si(r.sinGanador)}  ` +
    `orden:${r.orden === null ? c.gris + 'n/a' + c.reset : si(r.orden)}`
  )
}

/* ── El resultado ────────────────────────────────────────────────────── */

const n = textos.length
const pct = (k, total = n) => (total ? `${((k / total) * 100).toFixed(0)}%` : '—')

console.log(`\n${c.negrita}Tasa de obediencia sobre ${n} pasada(s)${c.reset}`)
console.log(`  llamó a la herramienta        ${String(marcas.llamo).padStart(3)}/${n}  ${pct(marcas.llamo)}`)
console.log(`  nombró las dos causas         ${String(marcas.dos).padStart(3)}/${n}  ${pct(marcas.dos)}`)
console.log(`  marcó el desacuerdo           ${String(marcas.desacuerdo).padStart(3)}/${n}  ${pct(marcas.desacuerdo)}`)
console.log(`  nombró las dos fuentes        ${String(marcas.fuentes).padStart(3)}/${n}  ${pct(marcas.fuentes)}`)
console.log(`  NO eligió ganador             ${String(marcas.sinGanador).padStart(3)}/${n}  ${pct(marcas.sinGanador)}`)
console.log(`  respetó el orden              ${String(marcas.orden).padStart(3)}/${marcas.ordenEvaluable}  ${pct(marcas.orden, marcas.ordenEvaluable)}`)

console.log(`\n${c.negrita}Las narraciones, para leerlas${c.reset} ${c.gris}(la tasa orienta; esto es lo que se juzga)${c.reset}`)
for (const { i, texto } of textos) {
  console.log(`\n${c.cian}── pasada ${i} ${'─'.repeat(50)}${c.reset}`)
  console.log(texto.trim() || '(sin texto)')
}

console.log(
  `\n${c.ambar}Este guion NO devuelve código de error a propósito: mide una narración, que no es\n` +
  `determinista. Ver su cabecera.${c.reset}\n`
)
