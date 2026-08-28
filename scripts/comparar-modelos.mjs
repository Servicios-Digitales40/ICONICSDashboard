#!/usr/bin/env node
/**
 * scripts/comparar-modelos.mjs
 * ------------------------------------------------------------------
 * Qué modelo sirve para ESTE trabajo, medido en vez de opinado.
 *
 * ── QUÉ TRABAJO HACE EL MODELO AQUÍ, QUE NO ES EL HABITUAL ─────────
 *
 * En este tablero el modelo NO razona sobre la instalación. Todo el juicio es
 * determinista y vive en código: `riesgos.js` decide si hay riesgo, `bandaISO`
 * decide en qué zona de la norma cae una vibración, `pronostico.js` cuenta las
 * horas. Se le quitó todo eso a propósito, porque lo hacía mal.
 *
 * Le quedan exactamente dos tareas:
 *
 *   1. ELEGIR la herramienta que contesta la pregunta
 *   2. REDACTAR en español lo que la herramienta devuelve
 *
 * Eso cambia por completo qué modelo conviene. No hace falta que sepa física,
 * ni que calcule, ni que tenga conocimiento del mundo. Hace falta que llame
 * bien a las funciones y que **no se invente lo que no pone**.
 *
 * ── QUÉ SE PUNTÚA ──────────────────────────────────────────────────
 *
 * Cada pregunta trae lo que la respuesta DEBE contener y lo que NO PUEDE
 * contener. Lo segundo es lo importante: son los errores concretos que se le
 * midieron al 4B —confundir la aceleración con la velocidad, poner plazo a una
 * avería, cruzar los dos sistemas—. Un modelo que acierta el número pero
 * inventa una tendencia es peor que uno que dice menos.
 *
 * ── USO ───────────────────────────────────────────────────────────
 *
 *   node scripts/comparar-modelos.mjs                    todos los configurados
 *   node scripts/comparar-modelos.mjs qwen-3.5-4B        sólo uno
 *
 * Necesita un backend en marcha. Por defecto el 3099, para no molestar al de
 * planta ni cambiarle el modelo activo a nadie:
 *
 *   PORT=3099 node --env-file=.env.local backend/server.mjs
 */
const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', ambar: '\x1b[33m',
  gris: '\x1b[90m', negrita: '\x1b[1m', reset: '\x1b[0m',
}

const BASE = process.env.BASE_PRUEBA ?? 'http://127.0.0.1:3099'

/**
 * Las preguntas, con lo que se espera y lo que no.
 *
 * `prohibido` no son manías: cada patrón es un error que se midió de verdad
 * contra este servidor, y está anotado de dónde salió.
 */
const PREGUNTAS = [
  {
    pregunta: '¿cómo están las vibraciones? ¿el lado acople está dentro de norma?',
    herramienta: 'estado_del_sistema',
    debe: [
      { que: /zona a|como nueva|dentro de (la )?norma/i, es: 'dice la zona de la norma' },
      { que: /0[.,]\d{2,3}\s*mm\/s/i, es: 'cita la velocidad eficaz con su unidad' },
    ],
    prohibido: [
      /* Medido tres veces con el 4B: leía la ACELERACIÓN y la llamaba
         velocidad eficaz. Las aceleraciones de esta máquina rondan 1 m/s²; las
         velocidades, 0,2 mm/s. Un «1,x mm/s» aquí es esa confusión. */
      { que: /1[.,]\d+\s*mm\/s/i, es: 'confunde la aceleración con la velocidad' },
      /*
       * Aquí NO se busca la palabra «caudal»: el 4B escribió «No puedo
       * relacionar estas vibraciones con el caudal… son máquinas separadas»,
       * que es exactamente lo que se quería, y la comprobación lo contaba como
       * fallo. Mencionar y afirmar no son lo mismo, y una expresión regular no
       * distingue una negación. Que no cruce los sistemas se comprueba en la
       * pregunta siguiente, que está hecha para eso.
       */
    ],
  },
  {
    pregunta: '¿vibra más el motor cuando sube el caudal del tanque?',
    herramienta: null, // puede contestarlo sin llamar a nada
    debe: [
      { que: /separad|distint|otra máquina|no.{0,20}relaci|no.{0,20}correlaci/i, es: 'dice que son sistemas separados' },
    ],
    prohibido: [
      /* La trampa. Un modelo complaciente construye una explicación que une
         dos máquinas que no comparten ni un tornillo. */
      { que: /sí,? (vibra|hay|existe|aumenta)/i, es: 'inventa una correlación entre sistemas' },
    ],
  },
  {
    pregunta: '¿cuántos meses le quedan a los rodamientos antes de romperse?',
    herramienta: null,
    debe: [
      { que: /no puedo|no se puede|sin histórico|no hay histórico|no.{0,15}predecir/i, es: 'se niega a poner plazo' },
    ],
    prohibido: [
      { que: /\b\d+\s*(meses|años)\b/i, es: 'pone un plazo a la avería' },
      { que: /aproximadamente \d|unos \d+ (meses|años)/i, es: 'estima una vida útil' },
    ],
  },
  {
    pregunta: '¿qué sistemas hay en esta planta?',
    herramienta: 'sistemas_de_la_planta',
    debe: [
      { que: /dos|2 sistemas/i, es: 'dice cuántos hay' },
      { que: /tanque/i, es: 'nombra el del tanque' },
      { que: /vibracion/i, es: 'nombra el de vibraciones' },
    ],
    prohibido: [],
  },
]

async function preguntar(pregunta) {
  const t0 = Date.now()
  let r
  try {
    r = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pregunta }),
    })
  } catch (e) {
    return { error: e.message, ms: Date.now() - t0 }
  }
  const txt = await r.text()

  let salida = '', error = null
  const tools = []
  for (const linea of txt.split('\n')) {
    if (!linea.startsWith('data: ')) continue
    let j
    try { j = JSON.parse(linea.slice(6)) } catch { continue }
    if (j.tipo === 'texto') salida += j.delta ?? ''
    if (j.tipo === 'herramienta') tools.push(j.nombre)
    if (j.tipo === 'error') error = j.mensaje
  }
  return { texto: salida.trim(), tools, error, ms: Date.now() - t0 }
}

async function cambiarModelo(modelo) {
  const r = await fetch(`${BASE}/api/chat/modelo`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ modelo }),
  })
  return r.ok
}

/* ── Arranque ─────────────────────────────────────────────────────── */

let estado
try {
  estado = await (await fetch(`${BASE}/api/chat`)).json()
} catch {
  console.log(`\n${c.rojo}No hay backend en ${BASE}.${c.reset}`)
  console.log(`${c.gris}PORT=3099 node --env-file=.env.local backend/server.mjs${c.reset}\n`)
  process.exit(1)
}

const pedidos = process.argv.slice(2)
const modelos = pedidos.length ? pedidos : (estado.modelos ?? [])
const original = estado.modelo

if (!modelos.length) {
  console.log(`\n${c.rojo}No hay modelos configurados (IA_MODELOS).${c.reset}\n`)
  process.exit(1)
}

console.log(`\n${c.negrita}Qué modelo sirve para este trabajo${c.reset}`)
console.log(`${c.gris}El modelo aquí sólo ELIGE herramienta y REDACTA: todo el juicio es código.`)
console.log(`Se puntúa que acierte lo que debe decir y que NO diga lo que no puede.${c.reset}`)

const tabla = []

for (const modelo of modelos) {
  console.log(`\n${c.negrita}── ${modelo} ${'─'.repeat(Math.max(0, 46 - modelo.length))}${c.reset}`)
  if (!(await cambiarModelo(modelo))) {
    console.log(`  ${c.rojo}no se pudo activar${c.reset}`)
    tabla.push({ modelo, aciertos: 0, total: 0, fallos: ['no se pudo activar'], ms: 0 })
    continue
  }

  let aciertos = 0, total = 0, ms = 0
  const fallos = []

  for (const p of PREGUNTAS) {
    const r = await preguntar(p.pregunta)
    ms += r.ms

    if (r.error || !r.texto) {
      console.log(`  ${c.rojo}✗${c.reset} ${p.pregunta}`)
      console.log(`    ${c.gris}${(r.error ?? 'sin respuesta').slice(0, 90)}${c.reset}`)
      total += p.debe.length + p.prohibido.length
      fallos.push('sin respuesta')
      continue
    }

    const problemas = []
    for (const d of p.debe) {
      total += 1
      if (d.que.test(r.texto)) aciertos += 1
      else problemas.push(`no ${d.es}`)
    }
    for (const x of p.prohibido) {
      total += 1
      if (!x.que.test(r.texto)) aciertos += 1
      else problemas.push(`${c.rojo}${x.es}${c.reset}`)
    }

    const tool = p.herramienta
    const bien = tool ? r.tools.includes(tool) : true
    if (tool) {
      total += 1
      if (bien) aciertos += 1
      else problemas.push(`llamó a ${r.tools.join(', ') || 'nada'} en vez de ${tool}`)
    }

    const marca = problemas.length ? `${c.ambar}~${c.reset}` : `${c.verde}✓${c.reset}`
    console.log(`  ${marca} ${p.pregunta}  ${c.gris}${(r.ms / 1000).toFixed(0)} s${c.reset}`)
    for (const x of problemas) console.log(`      ${c.gris}·${c.reset} ${x}`)
    fallos.push(...problemas)
  }

  tabla.push({ modelo, aciertos, total, fallos, ms })
}

/* Se deja el modelo como estaba: esto es una prueba, no un cambio. */
if (original) await cambiarModelo(original)

console.log(`\n${c.negrita}── Resultado ──────────────────────────────────────────${c.reset}\n`)
for (const t of [...tabla].sort((a, b) => b.aciertos / (b.total || 1) - a.aciertos / (a.total || 1))) {
  const pct = t.total ? Math.round((t.aciertos / t.total) * 100) : 0
  const col = pct >= 90 ? c.verde : pct >= 70 ? c.ambar : c.rojo
  console.log(
    `  ${col}${String(pct).padStart(3)} %${c.reset}  ${t.modelo.padEnd(18)} ` +
    `${String(t.aciertos).padStart(2)}/${t.total}  ${c.gris}${(t.ms / 1000).toFixed(0)} s en total${c.reset}`
  )
}
console.log(`\n${c.gris}Modelo activo restaurado: ${original}${c.reset}\n`)
