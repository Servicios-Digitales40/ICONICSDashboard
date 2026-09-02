#!/usr/bin/env node
/**
 * scripts/medir-calibracion.mjs
 * ------------------------------------------------------------------
 * Plan 17 Fases 3b y 7 — la MEDICIÓN que faltaba.
 *
 * ── POR QUÉ NO ES `verificar-calibracion.mjs` ──────────────────────
 *
 * Aquél es un verificador: corre sin servidores, sobre un corpus sintético,
 * y contesta sí/no a seis preguntas sobre el MECANISMO. Tiene que seguir en
 * verde en una máquina sin red, así que no puede depender del :8081 ni de
 * que haya PDF en disco.
 *
 * Esto es un INSTRUMENTO: no afirma nada, mide. Corre contra el corpus real
 * de `IA_DOCS_DIR`, la bitácora real de `datos/aprendizaje.json` y el
 * servidor de embeddings real, y saca la distribución de cosenos, de BM25
 * crudo y de totales. De esa distribución salen los cortes que hoy están
 * marcados PROVISIONAL en `backend/ia/motor/diagnostico.mjs`.
 *
 * Separarlos es lo que impide el error de fondo del Plan 17: un umbral
 * puesto a ojo y una prueba escrita para que pase con ese umbral.
 *
 * ── LO QUE ESTE GUION NO PUEDE DECIDIR POR TI ──────────────────────
 *
 * El tamaño del corpus. Con dos manuales únicos, una distribución es una
 * indicación, no una calibración de producción. El guion lo dice en la
 * cabecera de su propia salida en vez de dejar que el número parezca más
 * sólido de lo que es.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node --env-file=.env.local scripts/medir-calibracion.mjs
 *
 * Sin `IA_EMBEDDING_BASE` mide sólo la rama BM25 y lo dice.
 */
import { createIndiceDocumentos } from '../backend/ia/indices/documentos.mjs'
import { createIndiceCasos } from '../backend/ia/motor/casos.mjs'
import { CAUSAS_POR_RIESGO } from '../shared/eva/comun/causas.js'
import { REGLAS as REGLAS_TANQUE } from '../shared/eva/tanque/riesgos.js'
import { REGLAS as REGLAS_VIBRACION } from '../shared/eva/vibraciones/riesgosVibracion.js'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', ambar: '\x1b[33m', gris: '\x1b[90m',
  cian: '\x1b[36m', negrita: '\x1b[1m', reset: '\x1b[0m',
}

const carpeta = process.env.IA_DOCS_DIR || 'Documentacion'
const embeddingBase = process.env.IA_EMBEDDING_BASE || ''
const embeddingModelo = process.env.IA_EMBEDDING_MODELO || 'local'

/** El sistema al que pertenece cada riesgo, para pedir los casos bien. */
const SISTEMA_DE_RIESGO = new Map([
  ...REGLAS_TANQUE.map(r => [r.id, 'tanque']),
  ...REGLAS_VIBRACION.map(r => [r.id, 'vibraciones']),
])

function resumen(nombre, valores) {
  if (!valores.length) return `  ${nombre.padEnd(22)} (sin muestras)`
  const orden = [...valores].sort((a, b) => a - b)
  const p = q => orden[Math.min(orden.length - 1, Math.floor(q * orden.length))]
  const media = orden.reduce((a, b) => a + b, 0) / orden.length
  return (
    `  ${nombre.padEnd(22)} n=${String(orden.length).padStart(3)}  ` +
    `min=${orden[0].toFixed(3)}  p25=${p(0.25).toFixed(3)}  ` +
    `mediana=${p(0.5).toFixed(3)}  p75=${p(0.75).toFixed(3)}  max=${orden.at(-1).toFixed(3)}  ` +
    `media=${media.toFixed(3)}`
  )
}

/* ── Los índices reales ──────────────────────────────────────────────── */

console.log(`\n${c.negrita}Corpus${c.reset}`)
console.log(`  carpeta de manuales : ${carpeta}`)
console.log(`  embeddings          : ${embeddingBase || '(ninguno — sólo BM25)'}`)

const indiceDocumentos = createIndiceDocumentos({ carpeta, embeddingBase, embeddingModelo })
const indiceCasos = createIndiceCasos({ embeddingBase, embeddingModelo })

await indiceDocumentos.recargar()
await indiceCasos.recargar()

const estadoDocs = indiceDocumentos.estado()
const estadoCasos = indiceCasos.estado()
const fragmentos = estadoDocs.documentos.reduce((a, d) => a + d.fragmentos, 0)

console.log(`  documentos únicos   : ${estadoDocs.documentos.length}  (${fragmentos} fragmentos)`)
for (const d of estadoDocs.documentos) console.log(`      · ${d.archivo} — ${d.fragmentos}`)
console.log(`  casos indexados     : ${estadoCasos.total}  (${estadoCasos.modo})`)

if (estadoDocs.documentos.length < 5) {
  console.log(
    `\n${c.ambar}${c.negrita}RESERVA:${c.reset}${c.ambar} ${estadoDocs.documentos.length} documento(s) únicos es un corpus PEQUEÑO.\n` +
    `Lo que sale abajo es una indicación de la forma de la distribución, no una\n` +
    `calibración de producción. Un umbral fijado aquí hay que volver a medirlo\n` +
    `cuando la planta cargue sus manuales de verdad.${c.reset}`
  )
}

/* ── La medición ─────────────────────────────────────────────────────── */

const cosenosManual = []
const crudosManual = []
const cosenosCaso = []
const crudosCaso = []
const filas = []

for (const [riesgoId, causas] of Object.entries(CAUSAS_POR_RIESGO)) {
  const sistema = SISTEMA_DE_RIESGO.get(riesgoId)
  if (!sistema) continue

  for (const causa of causas) {
    const consulta = [causa.titulo, ...(causa.terminosManual ?? [])].join(' ')

    const frag = await indiceDocumentos.buscar(consulta, { top: 2, sistema }).catch(() => [])
    const mejor = frag[0]
    if (mejor) {
      if (typeof mejor.coseno === 'number') cosenosManual.push(mejor.coseno)
      if (typeof mejor.scoreCrudo === 'number') crudosManual.push(mejor.scoreCrudo)
    }

    const casos = await indiceCasos
      .buscarCasosSimilares({ sistema, riesgoId, texto: consulta, top: 3 })
      .catch(() => [])
    for (const caso of casos) {
      if (typeof caso.coseno === 'number') cosenosCaso.push(caso.coseno)
      if (typeof caso.scoreCrudo === 'number') crudosCaso.push(caso.scoreCrudo)
    }

    filas.push({
      riesgoId,
      causa: causa.id,
      coseno: mejor?.coseno ?? null,
      crudo: mejor?.scoreCrudo ?? null,
      archivo: mejor?.archivo ?? '—',
      casos: casos.length,
    })
  }
}

console.log(`\n${c.negrita}Distribución del respaldo del MANUAL (mejor fragmento por causa)${c.reset}`)
console.log(resumen('coseno', cosenosManual))
console.log(resumen('BM25 crudo', crudosManual))

console.log(`\n${c.negrita}Distribución del respaldo de CASOS (por caso recuperado)${c.reset}`)
console.log(resumen('coseno', cosenosCaso))
console.log(resumen('BM25 crudo', crudosCaso))

console.log(`\n${c.negrita}Por causa${c.reset} ${c.gris}(coseno · BM25 crudo · documento · nº casos)${c.reset}`)
for (const f of filas) {
  const cos = f.coseno === null ? '  —  ' : f.coseno.toFixed(3)
  const cru = f.crudo === null ? '  —  ' : f.crudo.toFixed(2).padStart(6)
  console.log(
    `  ${f.riesgoId.padEnd(26)} ${f.causa.padEnd(34)} ${cos}  ${cru}  ` +
    `${String(f.archivo).slice(0, 34).padEnd(34)} ${f.casos}`
  )
}

/*
 * El reparto por tramos es lo que decide el corte: un umbral que deja TODO
 * en 2 no discrimina —el defecto que midió la auditoría— y uno que deja todo
 * en 0 apaga la fuente. Se busca un corte que reparta.
 */
function reparto(nombre, valores, fuerte, debil) {
  if (!valores.length) return
  const dos = valores.filter(v => v >= fuerte).length
  const uno = valores.filter(v => v >= debil && v < fuerte).length
  const cero = valores.length - dos - uno
  const pct = n => `${((n / valores.length) * 100).toFixed(0)}%`
  console.log(
    `  ${nombre.padEnd(30)} 2:${String(dos).padStart(3)} (${pct(dos).padStart(4)})   ` +
    `1:${String(uno).padStart(3)} (${pct(uno).padStart(4)})   0:${String(cero).padStart(3)} (${pct(cero).padStart(4)})`
  )
}

console.log(`\n${c.negrita}Qué reparto daría cada corte candidato${c.reset}`)
console.log(`${c.gris}  (el corte vigente aparece marcado)${c.reset}`)
console.log(`\n ${c.cian}coseno, sobre el respaldo del manual${c.reset}`)
for (const [f, d] of [[0.55, 0.2], [0.5, 0.38], [0.46, 0.36], [0.44, 0.34], [0.42, 0.32]]) {
  reparto(`fuerte=${f} debil=${d}${f === 0.55 && d === 0.2 ? ' ← vigente' : ''}`, cosenosManual, f, d)
}
console.log(`\n ${c.cian}BM25 crudo, sobre el respaldo del manual${c.reset}`)
for (const [f, d] of [[8, 2], [10, 3], [12, 4], [14, 5], [16, 6]]) {
  reparto(`fuerte=${f} debil=${d}${f === 8 && d === 2 ? ' ← vigente' : ''}`, crudosManual, f, d)
}

console.log(
  `\n${c.gris}Los cortes vigentes están en backend/ia/motor/diagnostico.mjs\n` +
  `(UMBRAL_COSENO_* y UMBRAL_BM25_*). Anota la distribución medida en el\n` +
  `commit que los cambie — Plan 17 Fase 7.${c.reset}\n`
)
